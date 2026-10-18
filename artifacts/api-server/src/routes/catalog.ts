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
import { readBoundedPhotoBody, validateStoredPropertyPhotoExif } from "../lib/property-photo-exif";
import {
  deletePrivatePropertyPhoto,
  fetchPrivatePropertyPhoto,
  getPublicConfig,
  SupabaseRequestError,
  supabaseRest,
} from "../lib/supabase";
import { cleanupUnreferencedPropertyPhoto } from "../lib/property-photo-cleanup";

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
    if (ownerProfile?.["role"] === "landlord") {
      const [payoutKyc, indemnity] = await Promise.all([
        supabaseRest<DbRow[]>(`payout_destinations?user_id=eq.${encodeURIComponent(user.id)}&is_verified=eq.true&select=user_id&limit=1`),
        supabaseRest<DbRow[]>(`landlord_kyc?user_id=eq.${encodeURIComponent(user.id)}&indemnity_signed=eq.true&select=user_id&limit=1`),
      ]);
      if (!payoutKyc.length || !indemnity.length) {
        res.status(403).json({ message: "Complete and receive approval for landlord KYC and sign the landlord indemnity before listing." });
        return;
      }
    }
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
      is_active: false,
      landlord_kyc_verified: ownerProfile?.["role"] === "landlord",
      admin_approved: false,
      executive_approved: false,
      approval_status: "pending",
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
  const photoFolder = `${user.id}/property-verification/${propertyId}/`;
  const photoFileName = photoPath.startsWith(photoFolder) ? photoPath.slice(photoFolder.length) : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i.test(photoFileName)) {
    res.status(400).json({ message: "The photo must be in your private property-verification folder." });
    return;
  }
  const cleanupRejectedUpload = async (): Promise<void> => {
    const result = await cleanupUnreferencedPropertyPhoto(
      async () => {
        const references = await supabaseRest<DbRow[]>(
          `property_photos?photo_url=eq.${encodeURIComponent(photoPath)}&select=id&limit=1`,
        );
        return references.length > 0;
      },
      async () => {
        const deletion = await deletePrivatePropertyPhoto(photoPath);
        if (!deletion.ok && deletion.status !== 404) {
          throw new Error(`Private photo removal failed (${deletion.status}).`);
        }
      },
    );
    if (result === "failed") {
      req.log.warn(
        { propertyId },
        "Could not clean up rejected property verification photo; preserving verification response",
      );
    }
  };
  const takenAt = parsed.data.takenAt.getTime();
  const ageMs = Date.now() - takenAt;
  if (!Number.isFinite(takenAt) || ageMs < -60_000 || ageMs > 30 * 60_000) {
    await cleanupRejectedUpload();
    res.status(400).json({ message: "Capture a fresh live photo before submitting." });
    return;
  }
  let storedPhoto: globalThis.Response;
  try {
    storedPhoto = await fetchPrivatePropertyPhoto(photoPath);
  } catch {
    res.status(503).json({ message: "The private verification photo could not be checked. Try again shortly." });
    return;
  }
  if (!storedPhoto.ok) {
    res.status(storedPhoto.status === 404 ? 400 : 503).json({
      message: storedPhoto.status === 404
        ? "The private verification photo was not found. Upload the photo again and retry."
        : "The private verification photo could not be checked. Try again shortly.",
    });
    return;
  }
  const contentType = (storedPhoto.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (contentType !== "image/jpeg") {
    await cleanupRejectedUpload();
    res.status(422).json({ message: "The stored verification photo is not a JPEG. Retake and upload the photo again." });
    return;
  }
  let storedImage: Buffer | null;
  try {
    storedImage = await readBoundedPhotoBody(storedPhoto);
  } catch {
    res.status(503).json({ message: "The private verification photo could not be checked. Try again shortly." });
    return;
  }
  if (!storedImage) {
    await cleanupRejectedUpload();
    res.status(413).json({ message: "The verification photo is too large. Retake it at a lower image size." });
    return;
  }
  const exifValidation = validateStoredPropertyPhotoExif(storedImage, {
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    takenAt: parsed.data.takenAt,
  });
  if (!exifValidation.valid) {
    await cleanupRejectedUpload();
    res.status(422).json({ message: exifValidation.message });
    return;
  }
  const rad = Math.PI / 180;
  const dLat = (parsed.data.latitude - Number(property["gps_lat"])) * rad;
  const dLng = (parsed.data.longitude - Number(property["gps_lng"])) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(Number(property["gps_lat"]) * rad) * Math.cos(parsed.data.latitude * rad) * Math.sin(dLng / 2) ** 2;
  const distanceMeters = 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  if (distanceMeters > 100) {
    await cleanupRejectedUpload();
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

router.get(
  "/properties/:propertyId/photos/:photoId/image",
  requireAuth,
  async (req, res): Promise<void> => {
    const user = await requireUser(req, res);
    if (!user) return;
    const propertyId = typeof req.params.propertyId === "string" ? req.params.propertyId : "";
    const photoId = typeof req.params.photoId === "string" ? req.params.photoId : "";
    if (!propertyId || !photoId) {
      res.status(400).json({ message: "A valid property and photo are required." });
      return;
    }

    const photos = await supabaseRest<DbRow[]>(
      `property_photos?id=eq.${encodeURIComponent(photoId)}&property_id=eq.${encodeURIComponent(propertyId)}&select=id,photo_url,taken_by&limit=1`,
    );
    const photo = photos[0];
    if (!photo) {
      res.status(404).json({ message: "Verification photo not found." });
      return;
    }

    const properties = await supabaseRest<DbRow[]>(
      `properties?id=eq.${encodeURIComponent(propertyId)}&select=id,owner_id&limit=1`,
    );
    const property = properties[0];
    if (!property) {
      res.status(404).json({ message: "Property not found." });
      return;
    }
    const isOwner = property["owner_id"] === user.id;
    const isAdmin = !isOwner && (await getUserRole(user.id)) === "admin";
    if (!isOwner && !isAdmin) {
      res.status(403).json({ message: "Only the property owner or an administrator may view this photo." });
      return;
    }

    const photoPath = typeof photo["photo_url"] === "string" ? photo["photo_url"] : "";
    const ownerId = String(property["owner_id"] ?? "");
    if (
      photo["taken_by"] !== ownerId ||
      !photoPath.startsWith(`${ownerId}/property-verification/${propertyId}/`) ||
      !photoPath.endsWith(".jpg")
    ) {
      res.status(404).json({ message: "Verification photo not found." });
      return;
    }

    let storedPhoto: globalThis.Response;
    try {
      storedPhoto = await fetchPrivatePropertyPhoto(photoPath);
    } catch {
      res.status(503).json({ message: "The private verification image is temporarily unavailable." });
      return;
    }
    if (!storedPhoto.ok) {
      res.status(storedPhoto.status === 404 ? 404 : 503).json({
        message: storedPhoto.status === 404
          ? "Verification photo not found."
          : "The private verification image is temporarily unavailable.",
      });
      return;
    }
    const contentType = storedPhoto.headers.get("content-type") ?? "";
    if (contentType !== "image/jpeg") {
      res.status(415).json({ message: "The stored verification file is not a JPEG image." });
      return;
    }
    const image = Buffer.from(await storedPhoto.arrayBuffer());
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(image);
  },
);

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

router.patch("/properties/:propertyId", requireAuth, async (req, res): Promise<void> => {
  const params = GetPropertyParams.safeParse(req.params);
  const parsed = CreatePropertyBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ message: "Check the listing details and try again." });
    return;
  }
  const user = await requireUser(req, res);
  if (!user) return;
  const current = await supabaseRest<Array<DbProperty & { owner_id: string | null }>>(
    `properties?id=eq.${encodeURIComponent(params.data.propertyId)}&select=*&limit=1`,
  );
  const property = current[0];
  if (!property) {
    res.status(404).json({ message: "Property not found." });
    return;
  }
  const role = await getUserRole(user.id);
  if (property.owner_id !== user.id && role !== "admin") {
    res.status(403).json({ message: "Only the listing owner can edit this property." });
    return;
  }
  if (property.is_locked) {
    res.status(409).json({ message: "This property is locked during an active transaction." });
    return;
  }
  const input = parsed.data;
  const isAccommodation = input.category === "hotel" || input.category === "short_let";
  const hotelCacNumber = input.hotelCacNumber?.trim() || String(property["hotel_cac_number"] || "");
  const emergencyContactPhone = input.emergencyContactPhone?.trim() || String(property["emergency_contact_phone"] || "");
  const hotelCctvDisclosed = input.hotelCctvDisclosed ?? Boolean(property["hotel_cctv_disclosed"]);
  if (isAccommodation && (!hotelCacNumber || !emergencyContactPhone || !hotelCctvDisclosed)) {
    res.status(422).json({ message: "Hotels and short-lets require CAC, a public contact, and disclosed common-area camera terms." });
    return;
  }
  if (input.intent === "rent" && !input.premisesRulesUrl?.trim()) {
    res.status(422).json({ message: "Rental listings need premises rules before review." });
    return;
  }
  const rows = await supabaseRest<DbProperty[]>(
    `properties?id=eq.${encodeURIComponent(params.data.propertyId)}&select=*`,
    {
      method: "PATCH",
      body: {
        title: input.title.trim(),
        category: input.category,
        custom_type: input.customType?.trim() || null,
        state: input.state.trim(),
        town: input.town.trim(),
        address: input.address?.trim() || "",
        description: input.description?.trim() || "",
        price_naira: input.priceNaira,
        price_unit: input.priceUnit?.trim() || "total",
        intent: input.intent,
        bedrooms: input.bedrooms ?? 0,
        bathrooms: input.bathrooms ?? 0,
        size_sqm: input.sizeSqm ?? 0,
        gps_lat: input.latitude,
        gps_lng: input.longitude,
        image_url: input.imageUrl?.trim() || null,
        premises_rules_url: input.premisesRulesUrl?.trim() || null,
        hotel_cac_number: isAccommodation ? hotelCacNumber : null,
        emergency_contact_phone: isAccommodation ? emergencyContactPhone : null,
        hotel_has_24_hour_reception: isAccommodation && (input.hotelHas24HourReception ?? Boolean(property["hotel_has_24_hour_reception"])),
        hotel_cctv_common_areas: isAccommodation && (input.hotelCctvCommonAreas ?? Boolean(property["hotel_cctv_common_areas"])),
        hotel_cctv_disclosed: isAccommodation && hotelCctvDisclosed,
        hotel_safety_checkin_available: isAccommodation && (input.hotelSafetyCheckinAvailable ?? Boolean(property["hotel_safety_checkin_available"])),
        pin_status: "pending",
        listing_moderation_status: "pending",
        hotel_verification_status: isAccommodation ? "pending" : "not_applicable",
        hotel_verification_reviewed_at: null,
        hotel_verification_reviewed_by: null,
        updated_at: new Date().toISOString(),
      },
      prefer: "return=representation",
    },
  );
  if (!rows[0]) {
    res.status(404).json({ message: "Property was not updated." });
    return;
  }
  res.json(GetPropertyResponse.parse(mapProperty(rows[0])));
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