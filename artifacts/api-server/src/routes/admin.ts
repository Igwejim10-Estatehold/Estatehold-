import { Router, type IRouter } from "express";
import {
  ListAdminDelistingQueueResponse,
  ListAdminEscrowQueueResponse,
  ListAdminKycQueueResponse,
  GetAdminDashboardResponse,
  ReleaseEscrowParams,
  ReviewKycBody,
  ReviewKycParams,
  ReviewPropertyDelistingBody,
  ReviewPropertyDelistingParams,
  UpdateComplaintStatusBody,
  UpdateComplaintStatusParams,
} from "@workspace/api-zod";
import { requireAuth, requireRoles, requireUser } from "../lib/auth";
import { type DbRow } from "../lib/estatehold";
import { supabaseRest } from "../lib/supabase";

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
    select: "profile_id,role,status,created_at,profiles(full_name,email,nba_seal_number)",
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
        createdAt: String(row["created_at"]),
      };
    });
  res.json(ListAdminKycQueueResponse.parse({ items }));
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
    req.log.warn(
      { adminId: user?.id, transactionId: params.data.transactionId },
      "Escrow release requested while compliance lock is active",
    );
    res.status(409).json({
      message:
        "Escrow release is disabled until the transaction, payout, and compliance process has been reviewed and approved.",
    });
  },
);

export default router;