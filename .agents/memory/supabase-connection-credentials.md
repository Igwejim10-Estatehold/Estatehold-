---
name: Supabase connection credentials
description: Choosing and validating Estatehold's external Supabase PostgreSQL connection URI.
---

Use the complete PostgreSQL connection URI copied from the Supabase project's Connect dialog. Do not infer or manually substitute the pooler username or port; connection modes differ. Insert the reset database password and URL-encode special characters before testing.

**Why:** Repeated password resets did not fix authentication when the connection URI's username/port combination was still wrong.

**How to apply:** Before running Estatehold migrations or owner bootstrap, test the exact configured URI with a harmless query and stop if PostgreSQL authentication fails.
