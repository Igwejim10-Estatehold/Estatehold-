# Payout encryption key rotation

Payout destinations use AES-256-GCM. Encryption version 1 is the legacy key
derived from `SESSION_SECRET`. Version 2 and later use a dedicated 32-byte key
per version, stored as `PAYOUT_ENCRYPTION_KEY_V2`,
`PAYOUT_ENCRYPTION_KEY_V3`, and so on. New writes use
`PAYOUT_ENCRYPTION_CURRENT_VERSION` (default `2`). Keep older keys configured
while any database row still uses their version.

## First move from the session secret to a dedicated key

1. Generate a random 32-byte key in a trusted terminal or secrets manager:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

   Save the output directly as the secret `PAYOUT_ENCRYPTION_KEY_V2`; do not
   paste it into source control, logs, chat, or this document.
2. Set `PAYOUT_ENCRYPTION_CURRENT_VERSION=2` (or leave it unset) and deploy the
   API with `PAYOUT_ENCRYPTION_KEY_V2`. Keep the original `SESSION_SECRET`
   unchanged for now. All newly saved destinations will use version 2; existing
   version 1 records remain readable.
3. Run the version rotation command in an environment with access to the
   database and both the old and new keys:

   ```sh
   pnpm --filter @workspace/api-server run rotate:payout-encryption
   ```

   The command rotates records one at a time and can be rerun safely. It only
   updates a row if its version and ciphertext still match what it read, so a
   concurrently saved destination is not overwritten. It logs counts and
   sanitized error metadata only; it never prints decrypted payout details.
4. Run the command again. A second run should report `rotated=0` and
   `changedDuringRotation=0`. If rotation stops on an error, keep both old and
   new keys configured, resolve the issue, and rerun. Earlier successful rows
   stay usable and will not be rotated twice.
5. Only after the clean verification run may you change `SESSION_SECRET`.
   Retain the v2 key as `PAYOUT_ENCRYPTION_KEY_V2` for decrypting those records.

## Rotating a dedicated key later

1. Generate and store a new 32-byte key as the next unused version, such as
   `PAYOUT_ENCRYPTION_KEY_V3`. Keep the prior version key configured.
2. Set `PAYOUT_ENCRYPTION_CURRENT_VERSION=3` and deploy with both keys. New
   writes now use version 3; version 2 remains readable.
3. Run `pnpm --filter @workspace/api-server run rotate:payout-encryption`
   twice. The verification run must report `rotated=0` and
   `changedDuringRotation=0`.
4. Retire the v2 key only after verification. Keep the v3 key and the current
   version setting. Repeat this process with a new version for each rotation.

Apply database migration
`supabase/migrations/202610130002_payout_encryption_versions.sql` before
deploying code that writes versions above 1. If the original session secret
was already changed while version 1 rows remain, restore the original secret
temporarily before running the migration; without it, those records cannot be
decrypted.

Run the encryption behavior tests with:

```sh
pnpm --filter @workspace/api-server run test:payout-encryption
```
