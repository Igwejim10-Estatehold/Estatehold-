import { Router, type IRouter } from "express";
import {
  CreateTenancyAgreementBody,
  CreateTenancyAgreementResponse,
  GetProfileResponse,
  UpdateProfileBody,
  UpdateProfileResponse,
} from "@workspace/api-zod";
import { getUserRole, requireAuth, requireUser } from "../lib/auth";
import { loadProfile, mapProfile, type DbRow } from "../lib/estatehold";
import { supabaseRest } from "../lib/supabase";

const router: IRouter = Router();

router.get("/account/profile", requireAuth, async (req, res): Promise<void> => {
  const user = await requireUser(req, res);
  if (!user) return;
  const row = await loadProfile(user.id);
  const metadataName =
    typeof user.user_metadata?.["full_name"] === "string"
      ? user.user_metadata["full_name"]
      : "";
  const profile = row
    ? mapProfile(row)
    : {
        id: user.id,
        role: "client",
        fullName: metadataName,
        email: user.email ?? "",
        phone: "",
        country: "Nigeria",
        state: "",
        lga: "",
        town: "",
        villageOfOrigin: "",
        verificationStatus: "unverified",
      };
  res.json(GetProfileResponse.parse(profile));
});

router.put("/account/profile", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Check the profile details and try again." });
    return;
  }
  const user = await requireUser(req, res);
  if (!user) return;
  const input = parsed.data;
  const current = await loadProfile(user.id);
  const existingRole = current?.["role"] === "admin" ? "admin" : input.role;

  if (input.role === "attorney" && !input.nbaSealNumber?.trim()) {
    res.status(422).json({ message: "Enter your NBA seal number to request attorney verification." });
    return;
  }
  if (input.role === "agent" && current?.["verification_status"] !== "verified") {
    const documents = input.evidenceUrls ?? [];
    if (!input.agencyName?.trim() || documents.length !== 2) {
      res.status(422).json({ message: "Agent registration requires an agency name and both CAC and ID documents." });
      return;
    }
    if (documents.some((path) => !path.startsWith(`${user.id}/`) || path.includes(".."))) {
      res.status(400).json({ message: "Agent documents must be uploaded to your private account folder." });
      return;
    }
  }

  const values = {
    id: user.id,
    role: existingRole,
    full_name: input.fullName.trim(),
    email: user.email ?? String(current?.["email"] ?? ""),
    phone: input.phone.trim(),
    agency_name: input.agencyName?.trim() || current?.["agency_name"] || null,
    agent_bio: input.agentBio?.trim() || current?.["agent_bio"] || null,
    nba_seal_number: input.nbaSealNumber?.trim() || null,
    country: input.country?.trim() || "Nigeria",
    state: input.state.trim(),
    lga: input.lga?.trim() ?? "",
    town: input.town.trim(),
    village_of_origin: input.villageOfOrigin?.trim() ?? "",
    verification_status: String(current?.["verification_status"] ?? "unverified"),
    bank_name: input.bankName?.trim() || null,
    bank_account_last4: input.bankAccountLast4?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const rows = await supabaseRest<DbRow[]>("profiles?on_conflict=id&select=*", {
    method: "POST",
    body: values,
    prefer: "resolution=merge-duplicates,return=representation",
  });

  if (input.role === "attorney" && input.nbaSealNumber?.trim()) {
    await supabaseRest("attorneys?on_conflict=id", {
      method: "POST",
      body: {
        id: user.id,
        nba_seal_number: input.nbaSealNumber.trim(),
        verification_status: "pending",
      },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }

  if (
    input.role !== "client" &&
    current?.["verification_status"] !== "verified"
  ) {
    const pendingQuery = new URLSearchParams({
      select: "id",
      profile_id: `eq.${user.id}`,
      status: "eq.pending",
      limit: "1",
    });
    const pending = await supabaseRest<DbRow[]>(`kyc_submissions?${pendingQuery}`);
    if (!pending.length) {
      await supabaseRest("kyc_submissions", {
        method: "POST",
        body: {
          profile_id: user.id,
          role: input.role,
          evidence_urls: input.role === "agent" ? input.evidenceUrls ?? [] : [],
          agency_name: input.role === "agent" ? input.agencyName?.trim() : null,
          bio: input.role === "agent" ? input.agentBio?.trim() : null,
        },
        prefer: "return=minimal",
      });
    } else if (input.role === "agent") {
      await supabaseRest(`kyc_submissions?id=eq.${encodeURIComponent(String(pending[0].id))}`, {
        method: "PATCH",
        body: {
          evidence_urls: input.evidenceUrls ?? [],
          agency_name: input.agencyName?.trim(),
          bio: input.agentBio?.trim() || null,
        },
        prefer: "return=minimal",
      });
    }
  }

  res.json(UpdateProfileResponse.parse(mapProfile(rows[0])));
});

router.post(
  "/legal/tenancy-agreement",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = CreateTenancyAgreementBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Check the agreement details and try again." });
      return;
    }
    const user = await requireUser(req, res);
    if (!user) return;
    const input = parsed.data;
    if (!input.mediationAccepted) {
      res.status(422).json({ message: "The mediation clause must be acknowledged for this draft." });
      return;
    }

    const propertyQuery = new URLSearchParams({
      select: "id,intent,premises_rules_url",
      id: `eq.${input.propertyId}`,
      limit: "1",
    });
    const properties = await supabaseRest<DbRow[]>(`properties?${propertyQuery}`);
    const property = properties[0];
    if (!property || property["intent"] !== "rent") {
      res.status(404).json({ message: "Rental listing not found." });
      return;
    }
    const premisesRulesUrl =
      input.premisesRulesUrl?.trim() ||
      (typeof property["premises_rules_url"] === "string"
        ? property["premises_rules_url"]
        : "");
    if (!premisesRulesUrl) {
      res.status(422).json({ message: "Rental premises rules must be attached before drafting an agreement." });
      return;
    }

    const mediationClause =
      "The parties will first attempt to resolve a dispute through mediation in Nigeria before starting court proceedings, subject to applicable Nigerian law. This draft clause must be reviewed by a qualified Nigerian lawyer.";
    const reviewNotice =
      "Draft only — not legal advice. A qualified Nigerian lawyer must review this agreement before anyone signs it.";
    const rows = await supabaseRest<DbRow[]>("legal_docs?select=*", {
      method: "POST",
      body: {
        property_id: input.propertyId,
        created_by: user.id,
        doc_type: "tenancy_agreement",
        status: "draft",
        document: {
          tenantName: input.tenantName.trim(),
          landlordName: input.landlordName.trim(),
          rentNaira: input.rentNaira,
          paymentMode: input.paymentMode,
          premisesRulesUrl,
          mediationClause,
          reviewNotice,
        },
      },
      prefer: "return=representation",
    });
    const response = CreateTenancyAgreementResponse.parse({
      id: String(rows[0]?.["id"] ?? ""),
      status: "draft",
      reviewNotice,
    });
    res.status(201).json(response);
  },
);

export default router;