import { Router, type IRouter } from "express";
import {
  CreateComplaintBody,
  CreateComplaintResponse,
  CreateConstructionRequestBody,
  CreateConstructionRequestResponse,
  CreateSpecialRequestBody,
  CreateSpecialRequestResponse,
  AttachConstructionRequestDocumentBody,
  AttachConstructionRequestDocumentParams,
  AttachConstructionRequestDocumentResponse,
  ListAdminConstructionRequestsResponse,
  ListComplaintsResponse,
  ListSpecialRequestsResponse,
} from "@workspace/api-zod";
import { getUserRole, requireAuth, requireRoles, requireUser } from "../lib/auth";
import { mapComplaint, mapSpecialRequest, type DbRow } from "../lib/estatehold";
import { fetchPrivateConstructionDocument, getSupabaseUrl, supabaseRest } from "../lib/supabase";

const router: IRouter = Router();

function mapConstructionRequest(row: DbRow) {
  return {
    id: String(row["id"]),
    fullName: String(row["full_name"]),
    phone: String(row["phone"]),
    landLocation: String(row["land_location"]),
    landSize: String(row["land_size"]),
    budget: String(row["budget"]),
    projectType: String(row["project_type"]),
    description: String(row["description"] ?? ""),
    preferredVisitDate: row["preferred_visit_date"] ? String(row["preferred_visit_date"]) : undefined,
    documentPath: typeof row["document_path"] === "string" ? row["document_path"] : undefined,
    status: String(row["status"]),
    createdAt: String(row["created_at"]),
  };
}

router.post("/construction/requests", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateConstructionRequestBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Check the construction request details." }); return; }
  const user = await requireUser(req, res);
  if (!user) return;
  const input = parsed.data;
  const rows = await supabaseRest<DbRow[]>("construction_requests?select=*", {
    method: "POST",
    body: {
      requester_id: user.id,
      full_name: input.fullName.trim(),
      phone: input.phone.trim(),
      land_location: input.landLocation.trim(),
      land_size: input.landSize.trim(),
      budget: input.budget.trim(),
      project_type: input.projectType.trim(),
      description: input.description?.trim() ?? "",
      preferred_visit_date: input.preferredVisitDate?.toISOString().slice(0, 10) ?? null,
    },
    prefer: "return=representation",
  });
  res.status(201).json(CreateConstructionRequestResponse.parse(mapConstructionRequest(rows[0])));
});

router.patch("/construction/requests/:requestId/document", requireAuth, async (req, res): Promise<void> => {
  const params = AttachConstructionRequestDocumentParams.safeParse(req.params);
  const input = AttachConstructionRequestDocumentBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ message: "Invalid request or document reference." }); return; }
  const user = await requireUser(req, res);
  if (!user) return;
  const rows = await supabaseRest<DbRow[]>(`construction_requests?id=eq.${encodeURIComponent(params.data.requestId)}&select=id,requester_id&limit=1`);
  if (!rows[0]) { res.status(404).json({ message: "Construction request not found." }); return; }
  const prefix = `${user.id}/construction-requests/${params.data.requestId}/`;
  if (rows[0]["requester_id"] !== user.id || !input.data.objectPath.startsWith(prefix) || input.data.objectPath.includes("..")) {
    res.status(403).json({ message: "The document must belong to your construction request." }); return;
  }
  const updated = await supabaseRest<DbRow[]>(`construction_requests?id=eq.${encodeURIComponent(params.data.requestId)}&requester_id=eq.${encodeURIComponent(user.id)}&select=*`, {
    method: "PATCH", body: { document_path: input.data.objectPath }, prefer: "return=representation",
  });
  if (!updated[0]) { res.status(404).json({ message: "Construction request not found." }); return; }
  res.json(AttachConstructionRequestDocumentResponse.parse(mapConstructionRequest(updated[0])));
});

router.get("/admin/construction-requests", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const rows = await supabaseRest<DbRow[]>("construction_requests?select=*&order=created_at.desc&limit=250");
  res.json(ListAdminConstructionRequestsResponse.parse({ items: rows.map(mapConstructionRequest) }));
});

router.get("/admin/construction-requests/:requestId/document", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const id = String(req.params.requestId || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) { res.status(400).json({ message: "Invalid construction request ID." }); return; }
  const rows = await supabaseRest<DbRow[]>(`construction_requests?id=eq.${encodeURIComponent(id)}&select=document_path,requester_id&limit=1`);
  const path = rows[0]?.["document_path"];
  const ownerId = String(rows[0]?.["requester_id"] ?? "");
  if (typeof path !== "string" || !path.startsWith(`${ownerId}/construction-requests/${id}/`)) {
    res.status(404).json({ message: "Private document not found." }); return;
  }
  const stored = await fetchPrivateConstructionDocument(path);
  if (!stored.ok) { res.status(stored.status === 404 ? 404 : 503).json({ message: "Private document is unavailable." }); return; }
  const contentType = stored.headers.get("content-type") || "application/octet-stream";
  if (!["application/pdf", "image/jpeg", "image/png"].includes(contentType.split(";")[0])) {
    res.status(415).json({ message: "Unsupported private document type." }); return;
  }
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", "attachment");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(Buffer.from(await stored.arrayBuffer()));
});

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