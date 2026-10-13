import { Router, type IRouter } from "express";
import {
  ListAdminDelistingQueueResponse,
  ListAdminEscrowQueueResponse,
  ListAdminHotelVerificationQueueResponse,
  ListAdminKycQueueResponse,
  ListAdminLandlordKycQueueResponse,
  GetAdminDashboardResponse,
  ReleaseEscrowParams,
  ReviewHotelVerificationBody,
  ReviewHotelVerificationParams,
  ReviewHotelVerificationResponse,
  ReviewKycBody,
  ReviewKycParams,
  ReviewLandlordKycParams,
  ReviewLandlordKycBody,
  ReviewLandlordKycResponse,
  ReviewPropertyDelistingBody,
  ReviewPropertyDelistingParams,
  UpdateComplaintStatusBody,
  UpdateComplaintStatusParams,
} from "@workspace/api-zod";
import { requireAuth, requireRoles, requireUser } from "../lib/auth";
import { type DbRow } from "../lib/estatehold";
import { supabaseRest, supabaseRpc } from "../lib/supabase";

const router: IRouter = Router();

async function countRows(path: string): Promise<number> {
  const [table, filterString = ""] = path.split("?");
  const query = new URLSearchParams(filterString);
  query.set("select", "id");
  query.set("limit", "5000");
  const rows = await supabaseRest<DbRow[]>(`${table}?${query}`);
  return rows.length;
}

router.get("/admin/dashboard", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const [
    pendingKyc,
    pendingDelistings,
    openComplaints,
    heldEscrows,
    openRequests,
    attorneyReviews,
  ] = await Promise.all([
    countRows("kyc_submissions?status=eq.pending"),
    countRows("admin_delisting_queue?status=eq.pending"),
    countRows("complaints?status=in.(lodged,investigating)"),
    countRows("escrow_holds?is_released=eq.false"),
    countRows("special_requests?status=in.(open,assigned)"),
    countRows("attorneys?verification_status=eq.pending"),
  ]);
  res.json(
    GetAdminDashboardResponse.parse({
      pendingKyc,
      pendingDelistings,
      openComplaints,
      heldEscrows,
      openRequests,
      attorneyReviews,
    }),
  );
});

router.get("/admin/queues/delistings", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const query = new URLSearchParams({
    select: "id,property_id,requested_by,created_at,properties(title,town)",
    status: "eq.pending",
    order: "created_at.asc",
    limit: "250",
  });
  const rows = await supabaseRest<DbRow[]>(`admin_delisting_queue?${query}`);
  const items = rows.map((row) => {
    const property = row["properties"] as DbRow | null;
    return {
      id: String(row["id"]),
      propertyId: String(row["property_id"]),
      propertyTitle: String(property?.["title"] ?? "Property listing"),
      town: String(property?.["town"] ?? ""),
      requestedBy: String(row["requested_by"]),
      createdAt: String(row["created_at"]),
    };
  });
  res.json(ListAdminDelistingQueueResponse.parse({ items }));
});

router.get("/admin/queues/kyc", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const query = new URLSearchParams({
    select: "profile_id,role,status,created_at,evidence_urls,agency_name,bio,profiles(full_name,email,nba_seal_number,agency_name,agent_bio)",
    status: "eq.pending",
    order: "created_at.asc",
    limit: "250",
  });
  const rows = await supabaseRest<DbRow[]>(`kyc_submissions?${query}`);
  const items = rows
    .filter((row) => ["landlord", "agent", "attorney"].includes(String(row["role"])))
    .map((row) => {
      const profile = row["profiles"] as DbRow | null;
      return {
        profileId: String(row["profile_id"]),
        fullName: String(profile?.["full_name"] ?? "New account"),
        email: typeof profile?.["email"] === "string" ? profile["email"] : undefined,
        role: String(row["role"]),
        status: String(row["status"]),
        nbaSealNumber:
          typeof profile?.["nba_seal_number"] === "string"
            ? profile["nba_seal_number"]
            : undefined,
        agencyName:
          typeof row["agency_name"] === "string"
            ? row["agency_name"]
            : typeof profile?.["agency_name"] === "string"
              ? profile["agency_name"]
              : undefined,
        agentBio:
          typeof row["bio"] === "string"
            ? row["bio"]
            : typeof profile?.["agent_bio"] === "string"
              ? profile["agent_bio"]
              : undefined,
        evidenceUrls: Array.isArray(row["evidence_urls"])
          ? row["evidence_urls"].filter((item): item is string => typeof item === "string")
          : [],
        createdAt: String(row["created_at"]),
      };
    });
  res.json(ListAdminKycQueueResponse.parse({ items }));
});

router.get("/admin/queues/landlord-kyc", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const rows = await supabaseRest<DbRow[]>(
    "landlord_kyc?select=user_id,nin_last4,nin_verified,indemnity_signed,review_status,property_doc_url,affidavit_url,signed_at,created_at,profiles(full_name)&review_status=eq.pending&order=created_at.asc&limit=250",
  );
  res.json(
    ListAdminLandlordKycQueueResponse.parse({
      items: rows.map((row) => {
        const profile = row["profiles"] as DbRow | null;
        const last4 = String(row["nin_last4"] ?? "");
        return {
          userId: String(row["user_id"]),
          fullName: String(profile?.["full_name"] ?? "Landlord"),
          maskedNin: last4.length === 4 ? `*******${last4}` : undefined,
          ninVerified: Boolean(row["nin_verified"]),
          indemnitySigned: Boolean(row["indemnity_signed"]),
          reviewStatus: String(row["review_status"]),
          propertyDocUrl: String(row["property_doc_url"] ?? ""),
          affidavitUrl: String(row["affidavit_url"] ?? ""),
          signedAt: row["signed_at"] ? String(row["signed_at"]) : undefined,
          createdAt: String(row["created_at"]),
        };
      }),
    }),
  );
});

router.post("/admin/landlord-kyc/:userId/review", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const params = ReviewLandlordKycParams.safeParse(req.params);
  const body = ReviewLandlordKycBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ message: "Choose approved or rejected for this landlord KYC application." });
    return;
  }
  const user = await requireUser(req, res);
  if (!user) return;
  const reviewedAt = new Date().toISOString();
  const rows = await supabaseRest<DbRow[]>(
    `landlord_kyc?user_id=eq.${encodeURIComponent(params.data.userId)}&review_status=eq.pending&select=user_id`,
    {
      method: "PATCH",
      body: {
        review_status: body.data.decision,
        admin_note: body.data.adminNote?.trim() || null,
        reviewed_by: user.id,
        reviewed_at: reviewedAt,
        updated_at: reviewedAt,
      },
      prefer: "return=representation",
    },
  );
  if (!rows.length) {
    res.status(404).json({ message: "Pending landlord KYC application not found." });
    return;
  }
  await supabaseRest(`profiles?id=eq.${encodeURIComponent(params.data.userId)}`, {
    method: "PATCH",
    body: {
      verification_status: body.data.decision === "approved" ? "verified" : "rejected",
      updated_at: reviewedAt,
    },
    prefer: "return=minimal",
  });
  res.json(ReviewLandlordKycResponse.parse({ status: body.data.decision }));
});

router.get("/admin/queues/escrow", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const query = new URLSearchParams({
    select: "held_amount_naira,is_released,created_at,transactions(id,properties(title))",
    is_released: "eq.false",
    order: "created_at.asc",
    limit: "250",
  });
  const rows = await supabaseRest<DbRow[]>(`escrow_holds?${query}`);
  const items = rows.map((row) => {
    const transaction = row["transactions"] as DbRow | null;
    const property = transaction?.["properties"] as DbRow | null;
    return {
      transactionId: String(transaction?.["id"] ?? ""),
      propertyTitle: String(property?.["title"] ?? "Property transaction"),
      heldAmountNaira: Number(row["held_amount_naira"]),
      isReleased: Boolean(row["is_released"]),
      createdAt: String(row["created_at"]),
    };
  });
  res.json(ListAdminEscrowQueueResponse.parse({ items }));
});

router.get("/admin/queues/hotels", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const query = new URLSearchParams({
    select: "id,title,category,state,town,hotel_cac_number,emergency_contact_phone,created_at",
    category: "in.(hotel,short_let)",
    hotel_verification_status: "eq.pending",
    order: "created_at.asc",
    limit: "250",
  });
  const rows = await supabaseRest<DbRow[]>(`properties?${query}`);
  const items = rows.map((row) => ({
    propertyId: String(row["id"]),
    title: String(row["title"]),
    category: String(row["category"]),
    state: String(row["state"]),
    town: String(row["town"]),
    cacNumber: String(row["hotel_cac_number"] ?? ""),
    emergencyContactPhone: String(row["emergency_contact_phone"] ?? ""),
    createdAt: String(row["created_at"]),
  }));
  res.json(ListAdminHotelVerificationQueueResponse.parse({ items }));
});

router.post(
  "/admin/hotels/:propertyId/review",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!(await requireRoles(req, res, ["admin"]))) return;
    const params = ReviewHotelVerificationParams.safeParse(req.params);
    const body = ReviewHotelVerificationBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ message: "Choose a valid hotel verification decision." });
      return;
    }
    const user = await requireUser(req, res);
    if (!user) return;
    const reviewedAt = new Date().toISOString();
    const query = new URLSearchParams({
      select: "id",
      id: `eq.${params.data.propertyId}`,
      category: "in.(hotel,short_let)",
      hotel_verification_status: "eq.pending",
    });
    const rows = await supabaseRest<DbRow[]>(`properties?${query}`, {
      method: "PATCH",
      body: {
        hotel_verification_status: body.data.decision,
        hotel_verification_reviewed_at: reviewedAt,
        hotel_verification_reviewed_by: user.id,
        updated_at: reviewedAt,
      },
      prefer: "return=representation",
    });
    if (!rows.length) {
      res.status(404).json({ message: "Pending hotel verification not found." });
      return;
    }
    res.json(ReviewHotelVerificationResponse.parse({ status: body.data.decision }));
  },
);

router.post(
  "/admin/delisting-requests/:requestId/review",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!(await requireRoles(req, res, ["admin"]))) return;
    const params = ReviewPropertyDelistingParams.safeParse(req.params);
    const body = ReviewPropertyDelistingBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ message: "Choose an approve or reject decision." });
      return;
    }

    const query = new URLSearchParams({
      select: "id,property_id,status",
      id: `eq.${params.data.requestId}`,
      limit: "1",
    });
    const requests = await supabaseRest<DbRow[]>(`admin_delisting_queue?${query}`);
    const request = requests[0];
    if (!request || request["status"] !== "pending") {
      res.status(404).json({ message: "Pending delisting request not found." });
      return;
    }

    if (body.data.decision === "approved") {
      const propertyQuery = new URLSearchParams({
        select: "id,is_locked,is_active",
        id: `eq.${request["property_id"]}`,
        limit: "1",
      });
      const properties = await supabaseRest<DbRow[]>(`properties?${propertyQuery}`);
      const property = properties[0];
      if (!property || property["is_locked"]) {
        res.status(409).json({ message: "This property is locked by an active transaction." });
        return;
      }
      await supabaseRest(`properties?id=eq.${encodeURIComponent(String(request["property_id"]))}`, {
        method: "PATCH",
        body: { is_active: false, updated_at: new Date().toISOString() },
        prefer: "return=minimal",
      });
    }

    await supabaseRest(
      `admin_delisting_queue?id=eq.${encodeURIComponent(params.data.requestId)}`,
      {
        method: "PATCH",
        body: {
          status: body.data.decision,
          admin_note: body.data.adminNote?.trim() || null,
          reviewed_at: new Date().toISOString(),
        },
        prefer: "return=minimal",
      },
    );
    res.json({ status: body.data.decision });
  },
);

router.patch(
  "/admin/complaints/:complaintId",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!(await requireRoles(req, res, ["admin"]))) return;
    const params = UpdateComplaintStatusParams.safeParse(req.params);
    const body = UpdateComplaintStatusBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ message: "Choose a valid complaint status." });
      return;
    }
    const rows = await supabaseRest<DbRow[]>(
      `complaints?id=eq.${encodeURIComponent(params.data.complaintId)}&select=id`,
      {
        method: "PATCH",
        body: {
          status: body.data.status,
          admin_resolution: body.data.adminResolution?.trim() || null,
          updated_at: new Date().toISOString(),
        },
        prefer: "return=representation",
      },
    );
    if (!rows.length) {
      res.status(404).json({ message: "Complaint not found." });
      return;
    }
    res.json({ status: body.data.status });
  },
);

router.post(
  "/admin/kyc/:profileId/review",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!(await requireRoles(req, res, ["admin"]))) return;
    const params = ReviewKycParams.safeParse(req.params);
    const body = ReviewKycBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ message: "Choose a valid verification decision." });
      return;
    }
    const profileQuery = new URLSearchParams({
      select: "id,role",
      id: `eq.${params.data.profileId}`,
      limit: "1",
    });
    const profiles = await supabaseRest<DbRow[]>(`profiles?${profileQuery}`);
    const profile = profiles[0];
    if (!profile) {
      res.status(404).json({ message: "Profile not found." });
      return;
    }
    const status = body.data.decision;
    await supabaseRest(`profiles?id=eq.${encodeURIComponent(params.data.profileId)}`, {
      method: "PATCH",
      body: {
        verification_status: status,
        updated_at: new Date().toISOString(),
      },
      prefer: "return=minimal",
    });
    await supabaseRest(
      `kyc_submissions?profile_id=eq.${encodeURIComponent(params.data.profileId)}&status=eq.pending`,
      {
        method: "PATCH",
        body: {
          status,
          reviewer_note: body.data.adminNote?.trim() || null,
          reviewed_at: new Date().toISOString(),
        },
        prefer: "return=minimal",
      },
    );
    if (profile["role"] === "attorney") {
      await supabaseRest(`attorneys?id=eq.${encodeURIComponent(params.data.profileId)}`, {
        method: "PATCH",
        body: {
          verification_status: status,
          verified_at: status === "verified" ? new Date().toISOString() : null,
        },
        prefer: "return=minimal",
      });
    }
    res.json({ status });
  },
);

router.post(
  "/admin/escrow/:transactionId/release",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!(await requireRoles(req, res, ["admin"]))) return;
    const params = ReleaseEscrowParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: "Invalid transaction ID." });
      return;
    }
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      await supabaseRpc("release_estatehold_escrow", {
        p_transaction_id: params.data.transactionId,
        p_admin_id: user.id,
      });
      res.json({ released: true });
    } catch (error) {
      req.log.info(
        { adminId: user.id, transactionId: params.data.transactionId, error },
        "Escrow release requirements were not satisfied",
      );
      res.status(409).json({
        message:
          "Release requires fully paid funds, buyer confirmation, and this administrator’s compliance approval.",
      });
    }
  },
);

router.get("/admin/workspace-data", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const [agents, users, properties, payments, agentPayouts] = await Promise.all([
    supabaseRest<DbRow[]>("profiles?select=id,full_name,email,phone,town,agency_name,verification_status&role=eq.agent&limit=500"),
    supabaseRest<DbRow[]>("profiles?select=id,full_name,email,role,verification_status&limit=500"),
    supabaseRest<DbRow[]>("properties?select=id,title,category,state,town,listing_moderation_status,is_active&order=created_at.desc&limit=500"),
    supabaseRest<DbRow[]>("transactions?select=id,status,amount_naira,agent_fee_naira,platform_fee_naira,created_at&order=created_at.desc&limit=500"),
    supabaseRest<DbRow[]>("agent_commission_payouts?select=id,transaction_id,agent_id,amount_naira,status,approved_at,transfer_reference,transfer_code,recipient_bank_name,recipient_account_last4,provider_status,failure_message,attempt_started_at,last_reconciled_at,completed_at,created_at,updated_at&order=created_at.desc&limit=500"),
  ]);
  res.json({
    agents: agents.map((row) => ({
      id: row["id"], fullName: row["full_name"], email: row["email"], phone: row["phone"],
      town: row["town"], agencyName: row["agency_name"], verificationStatus: row["verification_status"],
    })),
    users: users.map((row) => ({
      id: row["id"], fullName: row["full_name"], email: row["email"], role: row["role"],
      verificationStatus: row["verification_status"],
    })),
    properties: properties.map((row) => ({
      id: row["id"], title: row["title"], category: row["category"], state: row["state"],
      town: row["town"], moderationStatus: row["listing_moderation_status"], isActive: row["is_active"],
    })),
    payments: payments.map((row) => ({
      id: row["id"], status: row["status"], amountNaira: row["amount_naira"],
      agentFeeNaira: row["agent_fee_naira"], platformFeeNaira: row["platform_fee_naira"],
      createdAt: row["created_at"],
    })),
    agentPayouts: agentPayouts.map((row) => ({
      id: row["id"],
      transactionId: row["transaction_id"],
      agentId: row["agent_id"],
      amountNaira: row["amount_naira"],
      status: row["status"],
      transferReference: row["transfer_reference"],
      transferCode: row["transfer_code"],
      recipientBankName: row["recipient_bank_name"],
      recipientAccountLast4: row["recipient_account_last4"],
      providerStatus: row["provider_status"],
      failureMessage: row["failure_message"],
      createdAt: row["created_at"],
    })),
  });
});

router.post("/admin/properties/:propertyId/review", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const propertyId = typeof req.params.propertyId === "string" ? req.params.propertyId : "";
  const decision = req.body?.decision;
  if (!propertyId || !["approved", "rejected"].includes(decision)) {
    res.status(400).json({ message: "Choose approved or rejected for this property." });
    return;
  }
  const current = await supabaseRest<DbRow[]>(
    `properties?id=eq.${encodeURIComponent(propertyId)}&select=id,listing_moderation_status&limit=1`,
  );
  if (!current.length) {
    res.status(404).json({ message: "Property not found." });
    return;
  }
  if (current[0]["listing_moderation_status"] !== "pending") {
    res.status(409).json({ message: "This property has already been reviewed." });
    return;
  }
  await supabaseRest(`properties?id=eq.${encodeURIComponent(propertyId)}`, {
    method: "PATCH",
    body: {
      listing_moderation_status: decision,
      is_active: decision === "approved",
    },
    prefer: "return=minimal",
  });
  res.json({ status: decision });
});

export default router;