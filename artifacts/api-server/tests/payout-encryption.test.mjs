import assert from "node:assert/strict";
import { createCipheriv, hkdfSync, randomBytes } from "node:crypto";
import { test } from "node:test";
import {
  decryptPayoutDetails,
  encryptPayoutDetails,
} from "../src/lib/payout-encryption.ts";

function encryptLegacyV1(value, sessionSecret) {
  const key = Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(sessionSecret, "utf8"),
      "estatehold:payout-destinations",
      "AES-256-GCM:v1",
      32,
    ),
  );
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return {
    encryptedPayload: encrypted.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

test("versioned payout keys keep old records readable through rotation", () => {
  const oldSessionSecret = "legacy-session-secret-32-bytes-long";
  process.env["SESSION_SECRET"] = oldSessionSecret;
  process.env["PAYOUT_ENCRYPTION_KEY_V2"] = randomBytes(32).toString("base64url");
  process.env["PAYOUT_ENCRYPTION_KEY_V3"] = randomBytes(32).toString("base64url");
  process.env["PAYOUT_ENCRYPTION_CURRENT_VERSION"] = "2";

  const legacy = encryptLegacyV1("synthetic payout fixture", oldSessionSecret);
  assert.equal(
    decryptPayoutDetails(
      legacy.encryptedPayload,
      legacy.iv,
      legacy.authTag,
      1,
    ),
    "synthetic payout fixture",
  );

  const version2 = encryptPayoutDetails("synthetic payout fixture");
  assert.equal(version2.encryptionVersion, 2);
  assert.equal(
    decryptPayoutDetails(
      version2.encryptedPayload,
      version2.iv,
      version2.authTag,
      2,
    ),
    "synthetic payout fixture",
  );

  process.env["PAYOUT_ENCRYPTION_CURRENT_VERSION"] = "3";
  const version3 = encryptPayoutDetails("synthetic payout fixture");
  assert.equal(version3.encryptionVersion, 3);
  assert.equal(
    decryptPayoutDetails(
      version2.encryptedPayload,
      version2.iv,
      version2.authTag,
      2,
    ),
    "synthetic payout fixture",
  );
  assert.equal(
    decryptPayoutDetails(
      version3.encryptedPayload,
      version3.iv,
      version3.authTag,
      3,
    ),
    "synthetic payout fixture",
  );

  const tamperedTag = `${version3.authTag.slice(0, -1)}${version3.authTag.endsWith("A") ? "B" : "A"}`;
  assert.throws(() =>
    decryptPayoutDetails(
      version3.encryptedPayload,
      version3.iv,
      tamperedTag,
      3,
    ),
  );

  delete process.env["SESSION_SECRET"];
  delete process.env["PAYOUT_ENCRYPTION_KEY_V2"];
  delete process.env["PAYOUT_ENCRYPTION_KEY_V3"];
  delete process.env["PAYOUT_ENCRYPTION_CURRENT_VERSION"];
});
