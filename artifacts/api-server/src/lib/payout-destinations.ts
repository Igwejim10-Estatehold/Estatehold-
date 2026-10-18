import { decryptPayoutDetails } from "./payout-encryption";
import { type DbRow } from "./estatehold";
import { supabaseRest } from "./supabase";

export type VerifiedPayoutDestination = {
  bankName: string;
  bankCode: string;
  accountName: string;
  accountNumber: string;
};

export async function loadVerifiedPayoutDestination(
  userId: string,
  requireKycApproval = false,
): Promise<VerifiedPayoutDestination | null> {
  const query = new URLSearchParams({
    select: "encrypted_payload,iv,auth_tag,encryption_version,verified_at,is_verified",
    user_id: `eq.${userId}`,
    limit: "1",
  });
  const rows = await supabaseRest<DbRow[]>(`payout_destinations?${query}`);
  const row = rows[0];
  if (!row || !row["verified_at"] || (requireKycApproval && row["is_verified"] !== true)) return null;
  const encryptionVersion = Number(row["encryption_version"]);

  let details: Record<string, unknown>;
  try {
    details = JSON.parse(
      decryptPayoutDetails(
        String(row["encrypted_payload"]),
        String(row["iv"]),
        String(row["auth_tag"]),
        encryptionVersion,
      ),
    ) as Record<string, unknown>;
  } catch {
    throw new Error("Stored payout details could not be verified.");
  }
  const bankName = typeof details["bankName"] === "string" ? details["bankName"] : "";
  const bankCode = typeof details["bankCode"] === "string" ? details["bankCode"] : "";
  const accountName = typeof details["accountName"] === "string" ? details["accountName"] : "";
  const accountNumber =
    typeof details["accountNumber"] === "string" ? details["accountNumber"] : "";
  if (!bankName || !bankCode || !accountName || !/^\d{10}$/.test(accountNumber)) {
    throw new Error("Stored payout details are invalid.");
  }
  return { bankName, bankCode, accountName, accountNumber };
}
