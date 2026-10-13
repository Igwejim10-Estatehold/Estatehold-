import { supabaseRest } from "./supabase";

export type DbRow = Record<string, unknown>;

export type DbProperty = DbRow & {
  id: string;
  title: string;
  category: string;
  state: string;
  town: string;
  price_naira: number | string;
  intent: string;
  pin_status: string;
  is_exclusive: boolean;
  is_locked: boolean;
};

const toNumber = (value: unknown, fallback = 0): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

export function mapProperty(row: DbProperty) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    customType: typeof row["custom_type"] === "string" ? row["custom_type"] : undefined,
    state: row.state,
    town: row.town,
    address: typeof row["address"] === "string" ? row["address"] : undefined,
    description: typeof row["description"] === "string" ? row["description"] : undefined,
    priceNaira: toNumber(row["price_naira"]),
    priceUnit: typeof row["price_unit"] === "string" ? row["price_unit"] : undefined,
    intent: row.intent,
    bedrooms: toNumber(row["bedrooms"]),
    bathrooms: toNumber(row["bathrooms"]),
    sizeSqm: toNumber(row["size_sqm"]),
    latitude: toOptionalNumber(row["gps_lat"]),
    longitude: toOptionalNumber(row["gps_lng"]),
    imageUrl: typeof row["image_url"] === "string" ? row["image_url"] : undefined,
    pinStatus: row.pin_status,
    isManaged: Boolean(row["is_managed"]),
    isExclusive: row.is_exclusive,
    isLocked: row.is_locked,
    listingModerationStatus:
      typeof row["listing_moderation_status"] === "string"
        ? row["listing_moderation_status"]
        : "approved",
    premisesRulesUrl:
      typeof row["premises_rules_url"] === "string" ? row["premises_rules_url"] : undefined,
    hotelVerificationStatus:
      typeof row["hotel_verification_status"] === "string"
        ? row["hotel_verification_status"]
        : "not_applicable",
    hotelHas24HourReception: Boolean(row["hotel_has_24_hour_reception"]),
    hotelCctvCommonAreas: Boolean(row["hotel_cctv_common_areas"]),
    hotelCctvDisclosed: Boolean(row["hotel_cctv_disclosed"]),
    hotelSafetyCheckinAvailable: Boolean(row["hotel_safety_checkin_available"]),
    emergencyContactPhone:
      typeof row["emergency_contact_phone"] === "string"
        ? row["emergency_contact_phone"]
        : undefined,
  };
}

export function mapSpecialRequest(row: DbRow) {
  return {
    id: String(row["id"]),
    requestType: String(row["request_type"]),
    customCategory:
      typeof row["custom_category"] === "string" ? row["custom_category"] : undefined,
    desiredTown: String(row["desired_town"]),
    desiredLga: String(row["desired_lga"]),
    desiredState: String(row["desired_state"]),
    neighborhood:
      typeof row["neighborhood"] === "string" ? row["neighborhood"] : undefined,
    budgetNaira: toNumber(row["budget_naira"]),
    urgency: String(row["urgency"]),
    latitude: toOptionalNumber(row["gps_lat"]),
    longitude: toOptionalNumber(row["gps_lng"]),
    status: String(row["status"]),
    createdAt: String(row["created_at"]),
  };
}

export function mapComplaint(row: DbRow) {
  return {
    id: String(row["id"]),
    against: String(row["against_role"]),
    complaintType: String(row["complaint_type"]),
    description: String(row["description"]),
    propertyId: typeof row["property_id"] === "string" ? row["property_id"] : undefined,
    evidenceUrls: Array.isArray(row["evidence_urls"])
      ? row["evidence_urls"].filter((item): item is string => typeof item === "string")
      : [],
    status: String(row["status"]),
    createdAt: String(row["created_at"]),
  };
}

export async function loadBrowseableProperties(): Promise<DbProperty[]> {
  const params = new URLSearchParams({
    select: "*",
    is_active: "eq.true",
    is_exclusive: "eq.true",
    listing_moderation_status: "eq.approved",
    order: "created_at.desc",
    limit: "250",
  });
  return supabaseRest<DbProperty[]>(`properties?${params}`);
}

export async function loadProfile(userId: string): Promise<DbRow | null> {
  const params = new URLSearchParams({
    select: "*",
    id: `eq.${userId}`,
    limit: "1",
  });
  const rows = await supabaseRest<DbRow[]>(`profiles?${params}`);
  return rows[0] ?? null;
}

export function mapProfile(row: DbRow) {
  return {
    id: String(row["id"]),
    role: String(row["role"] ?? "client"),
    fullName: String(row["full_name"] ?? ""),
    email: String(row["email"] ?? ""),
    phone: String(row["phone"] ?? ""),
    country: String(row["country"] ?? "Nigeria"),
    state: String(row["state"] ?? ""),
    lga: String(row["lga"] ?? ""),
    town: String(row["town"] ?? ""),
    agencyName: typeof row["agency_name"] === "string" ? row["agency_name"] : undefined,
    agentBio: typeof row["agent_bio"] === "string" ? row["agent_bio"] : undefined,
    villageOfOrigin: String(row["village_of_origin"] ?? ""),
    verificationStatus: String(row["verification_status"] ?? "unverified"),
    nbaSealNumber:
      typeof row["nba_seal_number"] === "string" ? row["nba_seal_number"] : undefined,
    bankName: typeof row["bank_name"] === "string" ? row["bank_name"] : undefined,
    bankAccountLast4:
      typeof row["bank_account_last4"] === "string"
        ? row["bank_account_last4"]
        : undefined,
  };
}

export function toSafeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
