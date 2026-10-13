import { createCipheriv, hkdfSync, randomBytes } from "node:crypto";

const SALT = "estatehold:landlord-kyc";
const INFO = "AES-256-GCM:v1";

function getKey(): Buffer {
  const masterSecret = process.env["SESSION_SECRET"]?.trim();
  if (!masterSecret || Buffer.byteLength(masterSecret, "utf8") < 32) {
    throw new Error("Landlord KYC encryption is unavailable.");
  }
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(masterSecret, "utf8"), SALT, INFO, 32),
  );
}

export function encryptLandlordNin(value: string): {
  ciphertext: string;
  iv: string;
  authTag: string;
} {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

export function maskNin(last4: string): string {
  return `*******${last4}`;
}
