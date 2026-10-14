import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreatePropertyBody,
  CreatePropertyPhotoBody,
  CreatePropertyPhotoResponse,
  CreatePropertyResponse,
  GetDashboardResponse,
  GetPropertyParams,
  GetPropertyResponse,
  GetPublicConfigResponse,
  ListPropertiesQueryParams,
  ListPropertiesResponse,
  ListSocialHousingUnitsResponse,
  RequestPropertyDelistingParams,
  RequestPropertyDelistingResponse,
} from "@workspace/api-zod";
import { getUserRole, optionalUser, requireAuth, requireRoles, requireUser } from "../lib/auth";
import {
  loadBrowseableProperties,
  loadProfile,
  mapProperty,
  toSafeText,
  type DbProperty,
  type DbRow,
} from "../lib/estatehold";
import { getPublicConfig, SupabaseRequestError, supabaseRest } from "../lib/supabase";

const router: IRouter = Router();

const OFFLINE_DEMO_ROWS: DbProperty[] = [
  {
    id: "offline-demo-serene-home",
    title: "DEMO ONLY — Serene Estate Enugu",
    category: "home",
    state: "Enugu",
    town: "Emene",
    address: "Sample location; not a real listing",
    description: "Offline sample only. This is not a live property, and all ownership, location, and title details are unverified.",
    price_naira: 45000000,
    price_unit: "total",
    intent: "sale",
    bedrooms: 4,
    bathrooms: 3,
    size_sqm: 320,
    gps_lat: 6.474,
    gps_lng: 7.56,
    pin_status: "pending",
    is_managed: false,
    is_exclusive: false,
    is_locked: false,
    listing_moderation_status: "pending",
    hotel_verification_status: "not_applicable",
  },
];

async function loadPropertiesWithSource(): Promise<{ rows: DbProperty[]; dataSource: "live" | "mock" }> {
  try {
    return { rows: await loadBrowseableProperties(), dataSource: "live" };
  } catch (error) {
    if (error instanceof SupabaseRequestError && ["CONNECTION_FAILED", "INVALID_URL"].includes(error.code ?? "")) {
      return { rows: OFFLINE_DEMO_ROWS, dataSource: "mock" };
    }
    throw error;
  }
}

function greetingForLagos(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-NG", {
      timeZone: "Africa/Lagos",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  if (hour >= 6 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 16) return "Good afternoon";
  if (hour >= 16 && hour <= 23) return "Good evening";
  return "Welcome back";
}

router.get("/config", (_req, res) => {
  res.json(GetPublicConfigResponse.parse(getPublicConfig()));
});

const dashboardHandler = async (req: Request, res: Response): Promise<void> => {
  const { rows, dataSource } = await loadPropertiesWithSource();
  const user = dataSource === "live" ? await optionalUser(req) : null;
  let location = "Enugu, Nigeria";
  if (user) {
    const profile = await loadProfile(user.id);
    const town = toSafeText(profile?.["town"], 100);
    const state = toSafeText(profile?.["state"], 100);
    if (town || state) location = [town, state].filter(Boolean).join(", ");
  }
  const response = GetDashboardResponse.parse({
    dataSource,
    items: rows.slice(0, 6).map(mapProperty),
    location,
    greeting: greetingForLagos(),
  });
  res.json(response);
};

router.get("/dashboard", dashboardHandler);
router.get("/dashboard/stats", dashboardHandler);

router.get("/properties", async (req, res): Promise<void> => {
  const parsed = ListPropertiesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid property search filters." });
    return;
  }

  const filters = parsed.data;
  const { rows, dataSource } = await loadPropertiesWithSource();
  const search = filters.search?.trim().toLocaleLowerCase();
  const items = rows
    .filter((row) => !filters.category || row.category === filters.category)
    .filter((row) => !filters.intent || row.intent === filters.intent)
    .filter(
      (row) =>
        !filters.state || String(row["state"]).toLocaleLowerCase() === filters.state.toLocaleLowerCase(),
    )
    .filter(
      (row) =>
        !filters.town || String(row["town"]).toLocaleLowerCase() === filters.town.toLocaleLowerCase(),
    )
    .filter((row) => {
      if (!search) return true;
      return [row.title, row["town"], row["state"], row["description"]]
        .some((value) => String(value ?? "").toLocaleLowerCase().includes(search));
    })
    .map(mapProperty);
  res.json(ListPropertiesResponse.parse({ items, dataSource }));
});

router.post(
  "/properties",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!(await requireRoles(req, res, ["landlord", "agent", "attorney", "admin"]))) return;
    const parsed = CreatePropertyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Check the listing details and try again." });
      return;
    }
    const user = await requireUser(req, res);
    if (!user) return;
    const input = parsed.data;
    const ownerProfile = await loadProfile(user.id);
    if (
      ownerProfile?.["role"] === "agent" &&
      ownerProfile["verification_status"] !== "verified"
    ) {
      res.status(403).json({ message: "Agent listings are available after admin verification." });
      return;
    }

    if (input.category === "custom" && !input.customType?.trim()) {
      res.status(400).json({ message: "Add a name for the custom property category." });
      return;
    }
    const isAccommodation = input.category === "hotel" || input.category === "short_let";
    if (isAccommodation && !input.hotelCacNumber?.trim()) {
      res.status(422).json({ message: "A CAC registration number is required for hotels and short-lets." });
      return;
    }
    if (isAccommodation && !input.emergencyContactPhone?.trim()) {
      res.status(422).json({ message: "Add a public hotel reception or emergency contact number." });
      return;
    }
    if (isAccommodation && !input.hotelCctvDisclosed) {
      res.status(422).json({ message: "Confirm that any CCTV is limited to disclosed common areas, never guest rooms." });
      return;
    }
    if (input.intent === "rent" && !input.premisesRulesUrl?.trim()) {
      res.status(422).json({ message: "Upload the rental premises rules before posting." });
      return;
    }

    const values = {
      owner_id: user.id,
      title: input.title.trim(),
      category: input.category,
      custom_type: input.customType?.trim() || null,
      state: input.state.trim(),
      town: input.town.trim(),
      lga: "",
      address: input.address?.trim() ?? "",
      description: input.description?.trim() ?? "",
      price_naira: input.priceNaira,
      price_unit: input.priceUnit?.trim() || "total",
      intent: input.intent,
      bedrooms: input.bedrooms ?? 0,
      bathrooms: input.bathrooms ?? 0,
      size_sqm: input.sizeSqm ?? 0,
      gps_lat: input.latitude,
      gps_lng: input.longitude,
      image_url: input.imageUrl?.trim() || null,
      pin_status: "pending",
      is_managed: false,
      is_exclusive: true,
      is_locked: false,
      is_active: true,
      listing_moderation_status: "pending",
      premises_rules_url: input.premisesRulesUrl?.trim() || null,
      hotel_cac_number: isAccommodation ? input.hotelCacNumber?.trim() : null,
      emergency_contact_phone: isAccommodation ? input.emergencyContactPhone?.trim() : null,
      hotel_has_24_hour_reception: isAccommodation && Boolean(input.hotelHas24HourReception),
      hotel_cctv_common_areas: isAccommodation && Boolean(input.hotelCctvCommonAreas),
      hotel_cctv_disclosed: isAccommodation && Boolean(input.hotelCctvDisclosed),
      hotel_safety_checkin_available: isAccommodation && Boolean(input.hotelSafetyCheckinAvailable),
      hotel_verification_status: isAccommodation ? "pending" : "not_applicable",
    };
    const rows = await supabaseRest<DbProperty[]>("properties?select=*", {
      method: "POST",
      body: values,
      prefer: "return=representation",
    });
    const response = CreatePropertyResponse.parse(mapProperty(rows[0]));
    res.status(201).json(response);
  },
);

router.post("/properties/:propertyId/photos", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePropertyPhotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Add a valid live photo and location reading." });
    return;
  }
  const user = await requireUser(req, res);
  if (!user) return;
  const propertyId = String(req.params.propertyId);
  const rows = await supabaseRest<DbRow[]>(`properties?id=eq.${encodeURIComponent(propertyId)}&select=id,owner_id,gps_lat,gps_lng&limit=1`);
  const property = rows[0];
  if (!property) { res.status(404).json({ message: "Property not found." }); return; }
  if (property["owner_id"] !== user.id) { res.status(403).json({ message: "Only the listing owner can attach a verification photo." }); return; }
  const photoPath = parsed.data.photoUrl;
  if (!photoPath.startsWith(`${user.id}/property-verification/${propertyId}/`) || !photoPath.endsWith(".jpg")) {
    res.status(400).json({ message: "The photo must be in your private property-verification folder." });
    return;
  }
  const takenAt = parsed.data.takenAt.getTime();
  const ageMs = Date.now() - takenAt;
  if (!Number.isFinite(takenAt) || ageMs < -60_000 || ageMs > 30 * 60_000) {
    res.status(400).json({ message: "Capture a fresh live photo before submitting." });
    return;
  }
  const rad = Math.PI / 180;
  const dLat = (parsed.data.latitude - Number(property["gps_lat"])) * rad;
  const dLng = (parsed.data.longitude - Number(property["gps_lng"])) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(Number(property["gps_lat"]) * rad) * Math.cos(parsed.data.latitude * rad) * Math.sin(dLng / 2) ** 2;
  const distanceMeters = 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  if (distanceMeters > 100) {
    res.status(422).json({ message: `Photo location is ${Math.round(distanceMeters)}m from the listing pin. Capture within 100m.` });
    return;
  }
  const saved = await supabaseRest<DbRow[]>("property_photos?select=*", {
    method: "POST",
    body: { property_id: propertyId, photo_url: photoPath, lat: parsed.data.latitude, lng: parsed.data.longitude, taken_at: new Date(takenAt).toISOString(), taken_by: user.id, device: parsed.data.device },
    prefer: "return=representation",
  });
  res.status(201).json(CreatePropertyPhotoResponse.parse({
    id: saved[0]?.["id"], propertyId, photoUrl: photoPath, latitude: parsed.data.latitude, longitude: parsed.data.longitude,
    takenAt: new Date(takenAt).toISOString(), takenBy: user.id, device: parsed.data.device, distanceMeters, within100m: true,
  }));
});

router.get("/properties/:propertyId", async (req, res): Promise<void> => {
  const parsed = GetPropertyParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid property ID." });
    return;
  }
  const user = await optionalUser(req);
  const params = new URLSearchParams({
    select: "*",
    id: `eq.${parsed.data.propertyId}`,
    limit: "1",
  });
  const rows = await supabaseRest<DbProperty[]>(`properties?${params}`);
  const property = rows[0];
  if (
    !property ||
    (!property.is_active &&
      (!user || (property["owner_id"] !== user.id && (await getUserRole(user.id)) !== "admin")))
  ) {
    res.status(404).json({ message: "Property not found." });
    return;
  }
  res.json(GetPropertyResponse.parse(mapProperty(property)));
});

router.post(
  "/properties/:propertyId/delisting-requests",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = RequestPropertyDelistingParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: "Invalid property ID." });
      return;
    }
    const user = await requireUser(req, res);
    if (!user) return;
    const query = new URLSearchParams({
      select: "id,owner_id,is_locked,is_active",
      id: `eq.${params.data.propertyId}`,
      limit: "1",
    });
    const properties = await supabaseRest<Array<DbProperty & { owner_id: string | null }>>(
      `properties?${query}`,
    );
    const property = properties[0];
    if (!property) {
      res.status(404).json({ message: "Property not found." });
      return;
    }
    const role = await getUserRole(user.id);
    if (property.owner_id !== user.id && role !== "admin") {
      res.status(403).json({ message: "Only the listing owner or an admin can request delisting." });
      return;
    }
    if (property.is_locked) {
      res.status(409).json({ message: "This property is locked by an active transaction." });
      return;
    }
    if (!property.is_active) {
      res.status(409).json({ message: "This listing is already inactive." });
      return;
    }
    await supabaseRest("admin_delisting_queue", {
      method: "POST",
      body: { property_id: params.data.propertyId, requested_by: user.id },
      prefer: "return=minimal",
    });
    res.status(202).json(RequestPropertyDelistingResponse.parse({ status: "queued_for_admin_approval" }));
  },
);

router.get("/social-housing", async (_req, res): Promise<void> => {
  const query = new URLSearchParams({
    select: "id,parent_property_id,unit_type,unit_price_naira,status,properties(title,town,image_url)",
    status: "eq.available",
    order: "created_at.desc",
    limit: "100",
  });
  const rows = await supabaseRest<DbRow[]>(`social_housing_units?${query}`);
  const items = rows.map((row) => {
    const property = row["properties"] as DbRow | null;
    return {
      id: String(row["id"]),
      parentPropertyId: String(row["parent_property_id"]),
      propertyTitle: String(property?.["title"] ?? "Social housing"),
      unitType: String(row["unit_type"]),
      unitPriceNaira: Number(row["unit_price_naira"]),
      town: typeof property?.["town"] === "string" ? property["town"] : undefined,
      imageUrl: typeof property?.["image_url"] === "string" ? property["image_url"] : undefined,
      status: String(row["status"]),
    };
  });
  res.json(ListSocialHousingUnitsResponse.parse({ items }));
});

export default router;