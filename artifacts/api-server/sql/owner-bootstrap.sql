-- One-time owner bootstrap for the Estatehold account owner.
-- Run only after this exact email has an Estatehold profile.
-- profiles.role is single-valued, so the additional executive role is stored
-- separately. Run this SQL first; then sign in as owner and call
-- POST /api/admin/set-role with this same email and role "executive".
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_executive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.profile_roles (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role = 'executive'),
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, role)
);

ALTER TABLE public.profile_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_roles FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_roles TO service_role;

UPDATE public.profiles
SET role = 'executive',
    is_executive = true,
    is_admin = true,
    is_verified = true,
    verification_status = 'verified'
WHERE lower(email) = lower('igwejim10@gmail.com')
RETURNING id, email, role;

COMMIT;
