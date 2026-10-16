import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const LEGACY_KEY_DERIVATION_SALT = "estatehold:payout-destinations";
const LEGACY_KEY_DERIVATION_INFO = "AES-256-GCM:v1";
const DEFAULT_CURRENT_VERSION = 2;

export function getCurrentPayoutEncryptionVersion(): number {
  const configured = process.env["PAYOUT_ENCRYPTION_CURRENT_VERSION"]?.trim();
  if (!configured) return DEFAULT_CURRENT_VERSION;
  if (!/^(?:[2-9]|[1-9]\d+)$/.test(configured)) {
    throw new Error("Payout encryption is unavailable.");
  }
  const version = Number(configured);
  if (!Number.isSafeInteger(version)) {
    throw new Error("Payout encryption is unavailable.");
  }
  return version;
}

function getPayoutEncryptionKey(version: number): Buffer {
  if (version === 1) {
    const legacySecret = process.env["SESSION_SECRET"]?.trim();
    if (!legacySecret || Buffer.byteLength(legacySecret, "utf8") < 32) {
      throw new Error("Payout encryption is unavailable.");
    }
    return Buffer.from(
      hkdfSync(
        "sha256",
        Buffer.from(legacySecret, "utf8"),
        LEGACY_KEY_DERIVATION_SALT,
        LEGACY_KEY_DERIVATION_INFO,
        32,
      ),
    );
  }

  const encodedKey = process.env[`PAYOUT_ENCRYPTION_KEY_V${version}`]?.trim();
  if (!encodedKey || !/^[A-Za-z0-9_-]{43}$/.test(encodedKey)) {
    throw new Error("Payout encryption is unavailable.");
  }
  const key = Buffer.from(encodedKey, "base64url");
  if (key.byteLength !== 32 || key.toString("base64url") !== encodedKey) {
    throw new Error("Payout encryption is unavailable.");
  }
  return key;
}

export function encryptPayoutDetails(value: string): {
  encryptedPayload: string;
  iv: string;
  authTag: string;
  encryptionVersion: number;
} {
  const encryptionVersion = getCurrentPayoutEncryptionVersion();
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    getPayoutEncryptionKey(encryptionVersion),
    iv,
  );
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    encryptedPayload: encrypted.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    encryptionVersion,
  };
}

export function decryptPayoutDetails(
  encryptedPayload: string,
  iv: string,
  authTag: string,
  encryptionVersion: number,
): string {
  if (!Number.isSafeInteger(encryptionVersion) || encryptionVersion < 1) {
    throw new Error("Unsupported payout encryption version.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getPayoutEncryptionKey(encryptionVersion),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPayload, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
