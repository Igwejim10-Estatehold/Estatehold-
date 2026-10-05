import { Router, type IRouter } from "express";
import {
  CreateComplaintBody,
  CreateComplaintResponse,
  CreateSpecialRequestBody,
  CreateSpecialRequestResponse,
  ListComplaintsResponse,
  ListSpecialRequestsResponse,
} from "@workspace/api-zod";
import { getUserRole, requireAuth, requireUser } from "../lib/auth";
import { mapComplaint, mapSpecialRequest, type DbRow } from "../lib/estatehold";
import { getSupabaseUrl, supabaseRest } from "../lib/supabase";

const router: IRouter = Router();

router.get("/special-requests", requireAuth, async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const role = await getUserRole(user.id);
  const query = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: "250",
  });
  if (role !== "admin") query.set("client_id", `eq.${user.id}`);
  const rows = await supabaseRest<DbRow[]>(`special_requests?${query}`);
  res.json(ListSpecialRequestsResponse.parse({ items: rows.map(mapSpecialRequest) }));
});

router.post("/special-requests", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateSpecialRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Check the sourcing request details and try again." });
    return;
  }
  const user = await requireUser(req, res);
  if (!user) return;
  const input = parsed.data;
  if (input.requestType === "custom_category" && !input.customCategory?.trim()) {
    res.status(400).json({ message: "Add the category you want us to source." });
    return;
  }

  const rows = await supabaseRest<DbRow[]>("special_requests?select=*", {
    method: "POST",
    body: {
      client_id: user.id,
      request_type: input.requestType,
      custom_category: input.customCategory?.trim() || null,
      desired_town: input.desiredTown.trim(),
      desired_lga: input.desiredLga.trim(),
      desired_state: input.desiredState.trim(),
      neighborhood: input.neighborhood?.trim() ?? "",
      budget_naira: input.budgetNaira,
      urgency: input.urgency,
      gps_lat: input.latitude ?? null,
      gps_lng: input.longitude ?? null,
    },
    prefer: "return=representation",
  });
  const response = CreateSpecialRequestResponse.parse(mapSpecialRequest(rows[0]));
  res.status(201).json(response);
});

function isOwnedEvidenceReference(reference: string, userId: string): boolean {
  if (reference.startsWith(`${userId}/`)) return true;
  const expectedPrefix = `${getSupabaseUrl()}/storage/v1/object/estatehold-evidence/${userId}/`;
  return reference.startsWith(expectedPrefix);
}

router.get("/complaints", requireAuth, async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const role = await getUserRole(user.id);
  const query = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: "250",
  });
  if (role !== "admin") query.set("complainant_id", `eq.${user.id}`);
  const rows = await supabaseRest<DbRow[]>(`complaints?${query}`);
  res.json(ListComplaintsResponse.parse({ items: rows.map(mapComplaint) }));
});

router.post("/complaints", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateComplaintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Check the complaint details and try again." });
    return;
  }
  const user = await requireUser(req, res);
  if (!user) return;
  const input = parsed.data;
  const evidenceUrls = input.evidenceUrls ?? [];
  if (
    evidenceUrls.length > 8 ||
    evidenceUrls.some((reference) => !isOwnedEvidenceReference(reference, user.id))
  ) {
    res.status(400).json({
      message: "Complaint evidence must use your own Estatehold evidence uploads.",
    });
    return;
  }
  const rows = await supabaseRest<DbRow[]>("complaints?select=*", {
    method: "POST",
    body: {
      complainant_id: user.id,
      against_role: input.against,
      complaint_type: input.complaintType,
      description: input.description.trim(),
      property_id: input.propertyId || null,
      evidence_urls: evidenceUrls,
    },
    prefer: "return=representation",
  });
  res.status(201).json(CreateComplaintResponse.parse(mapComplaint(rows[0])));
});

export default router;