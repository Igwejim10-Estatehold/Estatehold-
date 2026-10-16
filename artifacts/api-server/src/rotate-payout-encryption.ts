import { decryptPayoutDetails, encryptPayoutDetails, getCurrentPayoutEncryptionVersion } from "./lib/payout-encryption";
import { type DbRow } from "./lib/estatehold";
import { SupabaseRequestError, supabaseRest } from "./lib/supabase";

const PAGE_SIZE = 100;

type PayoutRow = DbRow & {
  user_id: string;
  encrypted_payload: string;
  iv: string;
  auth_tag: string;
  encryption_version: number;
};

type RotationSummary = {
  scanned: number;
  rotated: number;
  alreadyCurrent: number;
  changedDuringRotation: number;
};

async function loadPage(afterUserId?: string): Promise<PayoutRow[]> {
  const query = new URLSearchParams({
    select: "user_id,encrypted_payload,iv,auth_tag,encryption_version",
    order: "user_id.asc",
    limit: String(PAGE_SIZE),
  });
  if (afterUserId) query.set("user_id", `gt.${afterUserId}`);
  return supabaseRest<PayoutRow[]>(`payout_destinations?${query}`);
}

async function rotateRecord(row: PayoutRow): Promise<boolean> {
  const oldVersion = Number(row.encryption_version);
  const currentVersion = getCurrentPayoutEncryptionVersion();
  if (oldVersion > currentVersion) {
    throw new Error("A payout row uses a newer encryption version.");
  }
  if (oldVersion === currentVersion) return false;

  const plaintext = decryptPayoutDetails(
    row.encrypted_payload,
    row.iv,
    row.auth_tag,
    oldVersion,
  );
  const encrypted = encryptPayoutDetails(plaintext);
  const query = new URLSearchParams({
    user_id: `eq.${row.user_id}`,
    encryption_version: `eq.${oldVersion}`,
    encrypted_payload: `eq.${row.encrypted_payload}`,
    iv: `eq.${row.iv}`,
    auth_tag: `eq.${row.auth_tag}`,
    select: "user_id",
  });
  const updated = await supabaseRest<DbRow[]>(
    `payout_destinations?${query}`,
    {
      method: "PATCH",
      body: {
        encrypted_payload: encrypted.encryptedPayload,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        encryption_version: encrypted.encryptionVersion,
        updated_at: new Date().toISOString(),
      },
      prefer: "return=representation",
    },
  );
  return Array.isArray(updated) && updated.length > 0;
}

async function main(): Promise<void> {
  const targetVersion = getCurrentPayoutEncryptionVersion();
  // Validate the target key before making any changes, without logging the probe.
  const probe = encryptPayoutDetails("payout-encryption-key-check");
  if (
    probe.encryptionVersion !== targetVersion ||
    decryptPayoutDetails(
      probe.encryptedPayload,
      probe.iv,
      probe.authTag,
      targetVersion,
    ) !== "payout-encryption-key-check"
  ) {
    throw new Error("The target payout encryption key could not be verified.");
  }

  const summary: RotationSummary = {
    scanned: 0,
    rotated: 0,
    alreadyCurrent: 0,
    changedDuringRotation: 0,
  };
  let cursor: string | undefined;

  while (true) {
    const rows = await loadPage(cursor);
    if (rows.length === 0) break;
    for (const row of rows) {
      summary.scanned += 1;
      if (Number(row.encryption_version) === targetVersion) {
        summary.alreadyCurrent += 1;
      } else if (await rotateRecord(row)) {
        summary.rotated += 1;
      } else {
        summary.changedDuringRotation += 1;
      }
      cursor = row.user_id;
    }
  }

  console.info(
    `Payout encryption rotation finished: scanned=${summary.scanned}, rotated=${summary.rotated}, alreadyCurrent=${summary.alreadyCurrent}, changedDuringRotation=${summary.changedDuringRotation}.`,
  );
}

main().catch((error: unknown) => {
  const safeDetails =
    error instanceof SupabaseRequestError
      ? ` (database status=${error.status}${error.code ? `, code=${error.code}` : ""})`
      : error instanceof Error
        ? ` (${error.name})`
        : "";
  console.error(
    `Payout encryption rotation stopped${safeDetails}. Some earlier records may already have been rotated; rerun after correcting the issue. No decrypted payout details were logged.`,
  );
  process.exitCode = 1;
});
