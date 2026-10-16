---
name: Estatehold construction request privacy
description: Durable storage and access expectations for construction project enquiries and land documents.
---

Construction enquiries must use the shared Supabase `construction_requests` queue. Optional land documents belong in the private construction-document bucket and should be readable only by the requester and Estatehold administrators.

**Why:** The user explicitly chose a durable admin queue and private bucket instead of browser-only storage.

**How to apply:** Require authentication before saving personal request details or uploading documents. Keep admin queue and document access role-checked; never treat local browser storage as the shared queue.
