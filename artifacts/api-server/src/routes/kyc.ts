import { Router, type IRouter } from "express";
import { getUserRole, requireAuth, requireRoles, requireUser } from "../lib/auth";
import { type DbRow } from "../lib/estatehold";
import { encryptPayoutDetails } from "../lib/payout-encryption";
import { supabaseRest } from "../lib/supabase";

const router: IRouter = Router();
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const privatePath = (value: string, userId: string) =>
  value.startsWith(`${userId}/`) && !value.split("/").includes("..") && !value.startsWith("/");
const encrypt = (value: string) => encryptPayoutDetails(JSON.stringify({ value }));

router.post("/account/landlord-application", requireAuth, async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const b = req.body as Record<string, unknown>;
  const required = ["fullLegalName","permanentHouseAddress","city","state","lga","phoneNumber","whatsappNumber","bankName","bankCode","accountNumber","ninNumber","meansOfIdUrl","propertyDocumentsUrl","passportPhotoUrl"];
  if (required.some((key) => !text(b[key])) || !/^\d{10}$/.test(text(b.accountNumber)) || !/^\d{11}$/.test(text(b.ninNumber))) {
    res.status(400).json({ message: "Complete all required landlord details. Account numbers must be 10 digits and NIN must be 11 digits." }); return;
  }
  const docs = [text(b.meansOfIdUrl), text(b.propertyDocumentsUrl), text(b.passportPhotoUrl)];
  if (docs.some((path) => !privatePath(path, user.id))) {
    res.status(400).json({ message: "Upload KYC files to your private account folder." }); return;
  }
  const bankCode = text(b.bankCode), accountNumber = text(b.accountNumber);
  const resolve = new URLSearchParams({ account_number: accountNumber, bank_code: bankCode });
  const secret = process.env["PAYSTACK_SECRET_KEY"]?.trim();
  if (!secret?.startsWith("sk_")) { res.status(503).json({ message: "Bank verification is unavailable." }); return; }
  const bankResponse = await fetch(`https://api.paystack.co/bank/resolve?${resolve}`, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(12000) });
  const result = await bankResponse.json().catch(() => null) as { status?: boolean; data?: { account_name?: string; account_number?: string } } | null;
  if (!bankResponse.ok || !result?.status || !result.data?.account_name || result.data.account_number !== accountNumber) {
    res.status(422).json({ message: "Paystack could not verify the selected bank account." }); return;
  }
  const accountCipher = encryptPayoutDetails(JSON.stringify({ accountNumber, bankCode, bankName: text(b.bankName), accountName: result.data.account_name }));
  const ninCipher = encrypt(text(b.ninNumber));
  await supabaseRest("payout_destinations?on_conflict=user_id", { method: "POST", body: {
    user_id: user.id, encrypted_payload: accountCipher.encryptedPayload, iv: accountCipher.iv,
    auth_tag: accountCipher.authTag, encryption_version: accountCipher.encryptionVersion,
    full_legal_name: text(b.fullLegalName), permanent_house_address: text(b.permanentHouseAddress),
    phone_number: text(b.phoneNumber), whatsapp_number: text(b.whatsappNumber), bank_name: text(b.bankName),
    account_name: result.data.account_name, account_number_encrypted: accountCipher.encryptedPayload,
    account_number_iv: accountCipher.iv, account_number_auth_tag: accountCipher.authTag,
    bvn_or_nin_encrypted: ninCipher.encryptedPayload, bvn_or_nin_iv: ninCipher.iv,
    bvn_or_nin_auth_tag: ninCipher.authTag, means_of_id_url: docs[0],
    property_documents_urls: [docs[1]], passport_photo_url: docs[2], verified_at: null,
    is_verified: false, review_status: "pending", updated_at: new Date().toISOString(),
  }, prefer: "resolution=merge-duplicates,return=minimal" });
  const currentRole = await getUserRole(user.id);
  await supabaseRest("profiles?on_conflict=id", { method: "POST", body: {
    id: user.id, role: ["admin","executive","owner"].includes(currentRole) ? currentRole : "landlord",
    full_name: text(b.fullLegalName), full_legal_name: text(b.fullLegalName), email: user.email ?? "",
    permanent_house_address: text(b.permanentHouseAddress), city: text(b.city), state: text(b.state), lga: text(b.lga),
    phone: text(b.phoneNumber), whatsapp_number: text(b.whatsappNumber), nin_number_encrypted: ninCipher.encryptedPayload,
    nin_iv: ninCipher.iv, nin_auth_tag: ninCipher.authTag, nin_last4: text(b.ninNumber).slice(-4),
    nin_verified: false, country: "Nigeria", town: text(b.city), updated_at: new Date().toISOString(),
  }, prefer: "resolution=merge-duplicates,return=minimal" });
  res.status(201).json({ submitted: true, accountName: result.data.account_name, status: "pending" });
});

router.post("/account/tenant-application", requireAuth, async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const b = req.body as Record<string, unknown>;
  const required = ["fullLegalName","permanentHouseAddress","city","state","lga","phoneNumber","whatsappNumber","nextOfKinName","nextOfKinPhone","nextOfKinAddress","guarantorName","guarantorPhone","guarantorAddress","ninNumber","ninDocumentUrl"];
  if (required.some((key) => !text(b[key])) || !/^\d{11}$/.test(text(b.ninNumber)) || !privatePath(text(b.ninDocumentUrl), user.id)) {
    res.status(400).json({ message: "Complete required tenant details, provide an 11-digit NIN, and upload it to your private folder." }); return;
  }
  const nin = encrypt(text(b.ninNumber));
  const values = { user_id: user.id, full_legal_name: text(b.fullLegalName), permanent_house_address: text(b.permanentHouseAddress),
    city: text(b.city), state: text(b.state), lga: text(b.lga), phone_number: text(b.phoneNumber), whatsapp_number: text(b.whatsappNumber),
    employer_name: text(b.employerName) || null, employer_address: text(b.employerAddress) || null,
    next_of_kin_name: text(b.nextOfKinName), next_of_kin_phone: text(b.nextOfKinPhone), next_of_kin_address: text(b.nextOfKinAddress),
    guarantor_name: text(b.guarantorName), guarantor_phone: text(b.guarantorPhone), guarantor_address: text(b.guarantorAddress),
    nin_number_encrypted: nin.encryptedPayload, nin_iv: nin.iv, nin_auth_tag: nin.authTag,
    nin_last4: text(b.ninNumber).slice(-4), nin_document_url: text(b.ninDocumentUrl), status: "pending", updated_at: new Date().toISOString() };
  await supabaseRest("tenant_applications?on_conflict=user_id", { method: "POST", body: values, prefer: "resolution=merge-duplicates,return=minimal" });
  const currentRole = await getUserRole(user.id);
  await supabaseRest("profiles?on_conflict=id", { method: "POST", body: {
    id: user.id, role: ["admin","executive","owner"].includes(currentRole) ? currentRole : "tenant",
    full_name: values.full_legal_name, full_legal_name: values.full_legal_name, email: user.email ?? "",
    permanent_house_address: values.permanent_house_address, city: values.city, state: values.state, lga: values.lga,
    phone: values.phone_number, whatsapp_number: values.whatsapp_number,
    nin_number_encrypted: nin.encryptedPayload, nin_iv: nin.iv, nin_auth_tag: nin.authTag, nin_last4: values.nin_last4,
    nin_verified: false, country: "Nigeria", town: values.city, updated_at: new Date().toISOString(),
  }, prefer: "resolution=merge-duplicates,return=minimal" });
  res.status(201).json({ submitted: true, status: "pending" });
});

router.get("/admin/compliance/summary", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const [properties, landlords, tenants, rentals, payouts, rented] = await Promise.all([
    supabaseRest<DbRow[]>("properties?select=id&limit=5000"),
    supabaseRest<DbRow[]>("payout_destinations?select=user_id&is_verified=eq.false&limit=5000"),
    supabaseRest<DbRow[]>("tenant_applications?select=id&limit=5000"),
    supabaseRest<DbRow[]>("transactions?select=base_amount_naira,properties!inner(intent)&properties.intent=eq.rent&status=in.(paid,completed)&limit=5000"),
    supabaseRest<DbRow[]>("rental_payouts?select=id&status=in.(awaiting_destination,initiating,pending,reconciliation_required)&limit=5000"),
    supabaseRest<DbRow[]>("properties?select=id&rental_status=eq.rented&limit=5000"),
  ]);
  res.json({ totalProperties: properties.length, pendingLandlords: landlords.length, totalTenants: tenants.length,
    rentCollectedNaira: rentals.reduce((n, r) => n + Number(r["base_amount_naira"] ?? 0), 0), pendingPayouts: payouts.length, rentedProperties: rented.length });
});

router.get("/executive/audit", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["executive"]))) return;
  const rows = await supabaseRest<DbRow[]>("admin_audit_logs?select=id,actor_id,action,entity_type,entity_id,reason,created_at&order=created_at.desc&limit=250");
  res.json({ items: rows });
});

router.get("/admin/compliance/landlords", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const rows = await supabaseRest<DbRow[]>("payout_destinations?select=user_id,full_legal_name,permanent_house_address,phone_number,whatsapp_number,bank_name,account_name,means_of_id_url,property_documents_urls,passport_photo_url,nin_last4,is_verified,review_status,rejection_reason,created_at&review_status=eq.pending&order=created_at.asc&limit=250");
  res.json({ items: rows });
});
router.get("/admin/compliance/tenants", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const rows = await supabaseRest<DbRow[]>("tenant_applications?select=id,user_id,full_legal_name,permanent_house_address,city,state,lga,phone_number,whatsapp_number,employer_name,employer_address,next_of_kin_name,next_of_kin_phone,next_of_kin_address,guarantor_name,guarantor_phone,guarantor_address,nin_last4,nin_document_url,status,rejection_reason,created_at&status=eq.pending&order=created_at.asc&limit=250");
  res.json({ items: rows });
});
router.get("/admin/compliance/properties", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const rows = await supabaseRest<DbRow[]>("properties?select=id,title,owner_id,state,lga,town,image_url,landlord_kyc_verified,admin_approved,executive_approved,approval_status,property_documents_urls,property_video_url&approval_status=eq.pending&order=created_at.asc&limit=250");
  res.json({ items: rows });
});
router.get("/executive/compliance/properties", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["executive"]))) return;
  const rows = await supabaseRest<DbRow[]>("properties?select=id,title,owner_id,state,lga,town,image_url,landlord_kyc_verified,admin_approved,executive_approved,approval_status,property_documents_urls,property_video_url&approval_status=in.(admin_approved,rejected)&order=created_at.asc&limit=250");
  res.json({ items: rows });
});
router.get("/admin/compliance/payouts", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const rows = await supabaseRest<DbRow[]>("rental_payouts?select=id,transaction_id,landlord_id,amount_naira,status,transfer_reference,created_at&order=created_at.desc&limit=250");
  res.json({ items: rows });
});
router.get("/admin/compliance/users", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const rows = await supabaseRest<DbRow[]>("profiles?select=id,email,full_name,role,verification_status,created_at&order=created_at.desc&limit=500");
  res.json({ items: rows });
});
router.get("/executive/metrics", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["executive"]))) return;
  const secret = process.env["PAYSTACK_SECRET_KEY"]?.trim();
  if (!secret?.startsWith("sk_live_")) { res.status(503).json({ message: "Live Paystack reporting is unavailable." }); return; }
  const [balanceResponse, fees] = await Promise.all([
    fetch("https://api.paystack.co/balance?currency=NGN", { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(12000) }),
    supabaseRest<DbRow[]>("transactions?select=platform_fee_naira,status&status=in.(paid,completed)&limit=5000"),
  ]);
  const balance = await balanceResponse.json().catch(() => null) as { status?: boolean; data?: Array<{ balance?: number }> } | null;
  if (!balanceResponse.ok || !balance?.status) { res.status(502).json({ message: "Paystack executive reporting could not be loaded." }); return; }
  res.json({ balanceKobo: balance.data?.[0]?.balance ?? 0, executiveProfitNaira: fees.reduce((n, row) => n + Number(row["platform_fee_naira"] ?? 0), 0) });
});
router.get("/executive/transactions", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["executive"]))) return;
  const page = Math.max(1, Math.min(10000, Number(req.query["page"]) || 1));
  const perPage = 50;
  const secret = process.env["PAYSTACK_SECRET_KEY"]?.trim();
  if (!secret?.startsWith("sk_live_")) { res.status(503).json({ message: "Live Paystack reporting is unavailable." }); return; }
  const response = await fetch(`https://api.paystack.co/transaction?perPage=${perPage}&page=${page}`, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => null) as { status?: boolean; message?: string; data?: unknown[]; meta?: { total?: number; page?: number; pageCount?: number } } | null;
  if (!response.ok || !data?.status) { res.status(502).json({ message: "Paystack transactions could not be loaded." }); return; }
  res.json({ items: data.data ?? [], page, perPage, total: data.meta?.total ?? 0, totalPages: data.meta?.pageCount ?? 1 });
});
router.get("/executive/settings", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["executive"]))) return;
  const rows = await supabaseRest<DbRow[]>("estatehold_system_settings?select=setting_key,setting_value&order=setting_key");
  const values = Object.fromEntries(rows.map(row => [String(row["setting_key"]), row["setting_value"]]));
  res.json({ settings: { commissionPercent: values["commission_percent"] ?? "", rentDurationLogic: values["rent_duration_logic"] ?? "" } });
});
router.put("/executive/settings", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["executive"]))) return;
  const actor = await requireUser(req, res); if (!actor) return;
  const body = req.body as Record<string, unknown>;
  const commission = Number(body["commissionPercent"]);
  const rentLogic = text(body["rentDurationLogic"]).slice(0, 300);
  if (!Number.isFinite(commission) || commission < 0 || commission > 100 || !rentLogic) { res.status(400).json({ message: "Enter a commission between 0 and 100 and describe rent-duration logic." }); return; }
  const saved = await Promise.all([
    supabaseRest("estatehold_system_settings?on_conflict=setting_key", { method: "POST", body: { setting_key: "commission_percent", setting_value: commission, updated_by: actor.id, updated_at: new Date().toISOString() }, prefer: "resolution=merge-duplicates,return=minimal" }),
    supabaseRest("estatehold_system_settings?on_conflict=setting_key", { method: "POST", body: { setting_key: "rent_duration_logic", setting_value: rentLogic, updated_by: actor.id, updated_at: new Date().toISOString() }, prefer: "resolution=merge-duplicates,return=minimal" }),
  ]);
  void saved;
  await supabaseRest("admin_audit_logs", { method: "POST", body: { actor_id: actor.id, action: "system_settings_updated", entity_type: "system_settings", entity_id: "commission_percent,rent_duration_logic" }, prefer: "return=minimal" });
  res.json({ saved: true });
});
router.patch("/executive/users/:userId/role", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["executive"]))) return;
  const actor = await requireUser(req, res); if (!actor) return;
  const userId = String(req.params["userId"] ?? "");
  const role = text((req.body as Record<string, unknown>)?.role);
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !["admin","client"].includes(role) || userId === actor.id) { res.status(400).json({ message: "Choose a valid account and admin or client role." }); return; }
  const rows = await supabaseRest<DbRow[]>(`profiles?id=eq.${encodeURIComponent(userId)}&select=id,role`, { method: "PATCH", body: { role, updated_at: new Date().toISOString() }, prefer: "return=representation" });
  if (!rows.length) { res.status(404).json({ message: "Account not found." }); return; }
  await supabaseRest("admin_audit_logs", { method: "POST", body: { actor_id: actor.id, action: "user_role_changed", entity_type: "profile", entity_id: userId, reason: role }, prefer: "return=minimal" });
  res.json({ userId, role });
});
router.post("/executive/properties/:propertyId/approve", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["executive"]))) return;
  const actor = await requireUser(req, res); if (!actor) return;
  const propertyId = String(req.params["propertyId"] ?? "");
  const body = req.body as Record<string, unknown>;
  const approve = body["approve"] === true;
  const override = body["override"] === true;
  const reason = text(body["reason"]).slice(0, 500);
  if (!/^[0-9a-f-]{36}$/i.test(propertyId) || ((override || !approve) && !reason)) { res.status(400).json({ message: "A reason is required for an override or rejection." }); return; }
  if (approve) {
    const candidate = await supabaseRest<DbRow[]>(`properties?id=eq.${encodeURIComponent(propertyId)}&select=id,landlord_kyc_verified,rental_status&limit=1`);
    if (!candidate[0] || candidate[0]["landlord_kyc_verified"] !== true) { res.status(409).json({ message: "Property cannot go public before landlord KYC is verified." }); return; }
    if (candidate[0]["rental_status"] === "rented") { res.status(409).json({ message: "Rented properties cannot be republished as available." }); return; }
  }
  const filter = override ? `id=eq.${encodeURIComponent(propertyId)}` : `id=eq.${encodeURIComponent(propertyId)}&admin_approved=eq.true&executive_approved=eq.false`;
  const rows = await supabaseRest<DbRow[]>(`properties?${filter}&select=id`, { method: "PATCH", body: { admin_approved: override ? approve : true, executive_approved: approve, approval_status: approve ? "approved" : "rejected", is_active: approve, listing_moderation_status: approve ? "approved" : "rejected", updated_at: new Date().toISOString() }, prefer: "return=representation" });
  if (!rows.length) { res.status(404).json({ message: "The property was not found or is no longer eligible for this executive decision." }); return; }
  await supabaseRest("admin_audit_logs", { method: "POST", body: { actor_id: actor.id, action: override ? `property_executive_override_${approve ? "approved" : "rejected"}` : `property_executive_${approve ? "approved" : "rejected"}`, entity_type: "property", entity_id: propertyId, reason: reason || null }, prefer: "return=minimal" });
  res.json({ approved: approve });
});
router.post("/admin/compliance/:kind/:id/review", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const actor = await requireUser(req, res); if (!actor) return;
  const kind = String(req.params["kind"] ?? ""), id = String(req.params["id"] ?? "");
  const decision = text((req.body as Record<string, unknown>)?.decision);
  const reason = text((req.body as Record<string, unknown>)?.reason).slice(0, 500);
  if (!["landlord","tenant","property"].includes(kind) || !/^[0-9a-f-]{36}$/i.test(id) || !["approved","rejected"].includes(decision) || (decision === "rejected" && !reason)) {
    res.status(400).json({ message: "Choose approve or reject and provide a reason when rejecting." }); return;
  }
  const reviewedAt = new Date().toISOString();
  let table: string, filter: string, body: Record<string, unknown>;
  if (kind === "landlord") {
    table = "payout_destinations"; filter = `user_id=eq.${encodeURIComponent(id)}&review_status=eq.pending`;
    body = { review_status: decision, is_verified: decision === "approved", verified_by: decision === "approved" ? actor.id : null, verified_at: decision === "approved" ? reviewedAt : null, rejection_reason: decision === "rejected" ? reason : null, updated_at: reviewedAt };
  } else if (kind === "tenant") {
    table = "tenant_applications"; filter = `id=eq.${encodeURIComponent(id)}&status=eq.pending`;
    body = { status: decision, rejection_reason: decision === "rejected" ? reason : null, reviewed_by: actor.id, reviewed_at: reviewedAt, updated_at: reviewedAt };
  } else {
    if (decision === "approved") {
      const candidates = await supabaseRest<DbRow[]>(`properties?id=eq.${encodeURIComponent(id)}&approval_status=eq.pending&select=id,landlord_kyc_verified&limit=1`);
      if (!candidates[0] || candidates[0]["landlord_kyc_verified"] !== true) { res.status(409).json({ message: "Property cannot be approved before landlord KYC is verified." }); return; }
    }
    table = "properties"; filter = `id=eq.${encodeURIComponent(id)}&approval_status=eq.pending`;
    body = { admin_approved: decision === "approved", approval_status: decision === "approved" ? "admin_approved" : "rejected", updated_at: reviewedAt };
  }
  const rows = await supabaseRest<DbRow[]>(`${table}?${filter}&select=*`, { method: "PATCH", body, prefer: "return=representation" });
  if (!rows.length) { res.status(404).json({ message: "Pending application was not found." }); return; }
  await supabaseRest("admin_audit_logs", { method: "POST", body: { actor_id: actor.id, action: `${kind}_${decision}`, entity_type: kind, entity_id: id, reason: reason || null }, prefer: "return=minimal" });
  if (kind === "landlord") {
    await supabaseRest(`profiles?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: { verification_status: decision === "approved" ? "verified" : "rejected", updated_at: reviewedAt }, prefer: "return=minimal" });
    if (decision === "approved") await supabaseRest(`properties?owner_id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: { landlord_kyc_verified: true }, prefer: "return=minimal" });
  }
  res.json({ decision, reviewedAt });
});

export default router;
