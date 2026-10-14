-- One-time owner bootstrap for the Estatehold account owner.
-- Run only after this exact email has an Estatehold profile.
-- This sets one role only: "owner". Do not run a second UPDATE to "executive"
-- for the same profile, because profiles.role cannot hold both values.
BEGIN;

UPDATE public.profiles
SET role = 'owner'
WHERE lower(email) = lower('igwejim10@gmail.com')
RETURNING id, email, role;

COMMIT;
