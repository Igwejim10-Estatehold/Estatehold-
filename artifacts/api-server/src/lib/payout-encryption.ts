import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const KEY_DERIVATION_SALT = "estatehold:payout-destinations";
const KEY_DERIVATION_INFO = "AES-256-GCM:v1";

function getPayoutEncryptionKey(): Buffer {
  const masterSecret = process.env["SESSION_SECRET"]?.trim();
  if (!masterSecret || Buffer.byteLength(masterSecret, "utf8") < 32) {
    throw new Error("Payout encryption is unavailable.");
  }
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(masterSecret, "utf8"),
      KEY_DERIVATION_SALT,
      KEY_DERIVATION_INFO,
      32,
    ),
  );
}

export function encryptPayoutDetails(value: string): {
  encryptedPayload: string;
  iv: string;
  authTag: string;
} {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getPayoutEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    encryptedPayload: encrypted.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptPayoutDetails(
  encryptedPayload: string,
  iv: string,
  authTag: string,
): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getPayoutEncryptionKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPayload, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
