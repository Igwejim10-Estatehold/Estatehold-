import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateTenancyAgreementBody,
  CreateTenancyAgreementResponse,
  GetProfileResponse,
  GetPayoutBanksResponse,
  GetPayoutDestinationResponse,
  GetLandlordKycResponse,
  SubmitLandlordKycBody,
  SubmitLandlordKycResponse,
  SavePayoutDestinationBody,
  SavePayoutDestinationResponse,
  UpdateProfileBody,
  UpdateProfileResponse,
} from "@workspace/api-zod";
import { getUserRole, requireAuth, requireUser } from "../lib/auth";
import { loadProfile, mapProfile, type DbRow } from "../lib/estatehold";
import { encryptPayoutDetails } from "../lib/payout-encryption";
import { encryptLandlordNin, maskNin } from "../lib/landlord-kyc-encryption";
import { loadVerifiedPayoutDestination } from "../lib/payout-destinations";
import { supabaseRest } from "../lib/supabase";

const router: IRouter = Router();

type PaystackBank = { name?: unknown; code?: unknown };

function getPaystackSecret(): string | null {
  const key = process.env["PAYSTACK_SECRET_KEY"]?.trim();
  return key?.startsWith("sk_") ? key : null;
}

router.get("/account/payout-banks", requireAuth, async (req, res): Promise<void> => {
  const secretKey = getPaystackSecret();
  if (!secretKey) {
    res.status(503).json({ message: "Paystack account verification is not configured." });
    return;
  }
    const response = CreateTenancyAgreementResponse.parse({
      id: String(rows[0]?.["id"] ?? ""),
      status: "draft",
      reviewNotice,
    });
  const result = (await response.json().catch(() => null)) as
    | { status?: boolean; data?: PaystackBank[] }
    | null;
  if (!response.ok || !result?.status || !Array.isArray(result.data)) {
    req.log.warn({ status: response.status }, "Paystack bank directory request failed");
    res.status(502).json({ message: "The bank list is temporarily unavailable." });
    return;
  }
  const banks = result.data
    .filter(
      (bank): bank is { name: string; code: string } =>
        typeof bank.name === "string" &&
        bank.name.length > 0 &&
        typeof bank.code === "string" &&
        bank.code.length > 0,
    )
    .map(({ name, code }) => ({ name, code }));
  res.json(GetPayoutBanksResponse.parse(banks));
});

router.get("/account/payout-destination", requireAuth, async (req, res): Promise<void> => {
    const user = await requireUser(req, res);
  if (!user) return;
  const destination = await loadVerifiedPayoutDestination(user.id);
  res.json(
    GetPayoutDestinationResponse.parse(
      destination
        ? {
            configured: true,
            bankName: destination.bankName,
            accountName: destination.accountName,
            accountLast4: destination.accountNumber.slice(-4),
          }
        : { configured: false },
    ),
  );
});

const LANDLORD_INDEMNITY_TEXT_VERSION = "2026-10-14-v1";

function mapLandlordKycStatus(row?: DbRow) {
  if (!row) return { submitted: false, ninVerified: false, indemnitySigned: false };
  return {
    submitted: true,
    ninVerified: Boolean(row["nin_verified"]),
    indemnitySigned: Boolean(row["indemnity_signed"]),
    maskedNin: typeof row["nin_last4"] === "string" ? maskNin(row["nin_last4"]) : undefined,
    reviewStatus: row["review_status"] ?? "pending",
    propertyDocUrl: row["property_doc_url"] ?? undefined,
    affidavitUrl: row["affidavit_url"] ?? undefined,
    signedAt: row["signed_at"] ?? undefined,
  };
}

router.get("/landlord-kyc", requireAuth, async (req, res): Promise<void> => {
    const user = await requireUser(req, res);
  if (!user) return;
  if ((await getUserRole(user.id)) !== "landlord") {
    res.status(403).json({ message: "Landlord verification is only available to landlord accounts." });
    return;
  }
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
  res.json(GetLandlordKycResponse.parse(mapLandlordKycStatus(rows[0])));
});

router.post("/landlord-kyc", requireAuth, async (req, res): Promise<void> => {
    const parsed = CreateTenancyAgreementBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Check the agreement details and try again." });
      return;
    }
    const user = await requireUser(req, res);
  if (!user) return;
  if ((await getUserRole(user.id)) !== "landlord") {
    res.status(403).json({ message: "Landlord verification is only available to landlord accounts." });
    return;
  }
  const isPrivateUserPath = (value: string) =>
    value.startsWith(`${user.id}/`) && !value.split("/").includes("..") && !value.startsWith("/");
  if (!isPrivateUserPath(parsed.data.propertyDocUrl) || !isPrivateUserPath(parsed.data.affidavitUrl)) {
    res.status(400).json({ message: "Upload both documents to your private KYC folder before submitting." });
    return;
  }
  const signedAt = new Date().toISOString();
  const encrypted = encryptLandlordNin(parsed.data.ninNumber);
  await supabaseRest("landlord_kyc?on_conflict=user_id", {
    method: "POST",
    body: {
      user_id: user.id,
      nin_number_encrypted: encrypted.ciphertext,
      nin_iv: encrypted.iv,
      nin_auth_tag: encrypted.authTag,
      nin_last4: parsed.data.ninNumber.slice(-4),
      nin_verified: false,
      nin_name: parsed.data.ninName.trim(),
      property_address: parsed.data.propertyAddress.trim(),
      property_doc_url: parsed.data.propertyDocUrl,
      affidavit_url: parsed.data.affidavitUrl,
      indemnity_signed: true,
      indemnity_text_version: LANDLORD_INDEMNITY_TEXT_VERSION,
      ip_address: req.ip,
      signed_at: signedAt,
      review_status: "pending",
      updated_at: signedAt,
    },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  res.json(
    SubmitLandlordKycResponse.parse({
      submitted: true,
      ninVerified: false,
      indemnitySigned: true,
      maskedNin: maskNin(parsed.data.ninNumber.slice(-4)),
      reviewStatus: "pending",
      propertyDocUrl: parsed.data.propertyDocUrl,
      affidavitUrl: parsed.data.affidavitUrl,
      signedAt,
    }),
  );
});

const payoutDestinationHandler = async (req: Request, res: Response): Promise<void> => {
  const parsed = SavePayoutDestinationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Enter a Nigerian bank and a valid 10-digit account number." });
    return;
  }
  const user = await requireUser(req, res);
  if (!user) return;
  if ((await getUserRole(user.id)) === "landlord") {
    const kyc = await supabaseRest<DbRow[]>(
      `landlord_kyc?user_id=eq.${encodeURIComponent(user.id)}&select=indemnity_signed&limit=1`,
    );
    if (!Boolean(kyc[0]?.["indemnity_signed"])) {
      res.status(403).json({ message: "Sign the landlord indemnity before adding a payout account." });
      return;
    }
  }
  const secretKey = getPaystackSecret();
  if (!secretKey) {
    res.status(503).json({ message: "Paystack account verification is not configured." });
    return;
  }

  const bankResponse = await fetch(
    "https://api.paystack.co/bank?country=nigeria&currency=NGN&type=nuban&perPage=200",
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  const bankResult = (await bankResponse.json().catch(() => null)) as
    | { status?: boolean; data?: PaystackBank[] }
    | null;
  if (!bankResponse.ok || !bankResult?.status || !Array.isArray(bankResult.data)) {
    req.log.warn({ status: bankResponse.status }, "Paystack bank directory validation failed");
    res.status(502).json({ message: "The bank list is temporarily unavailable." });
    return;
  }
  const selectedBank = bankResult.data.find(
    (bank) => bank.code === parsed.data.bankCode && typeof bank.name === "string",
  );
  if (!selectedBank || typeof selectedBank.name !== "string") {
    res.status(422).json({ message: "Choose a supported Nigerian bank." });
    return;
  }

  const accountNumber = parsed.data.accountNumber;
  const query = new URLSearchParams({
    account_number: accountNumber,
    bank_code: parsed.data.bankCode,
  });
  const response = await fetch(`https://api.paystack.co/bank/resolve?${query}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const result = (await response.json().catch(() => null)) as
    | {
        status?: boolean;
        data?: { account_name?: unknown; account_number?: unknown };
      }
    | null;
  if (!response.ok && response.status >= 500) {
    req.log.warn({ status: response.status }, "Paystack account resolution request failed");
    res.status(502).json({ message: "Paystack account verification is temporarily unavailable." });
    return;
  }
  if (!response.ok || !result?.status) {
    res.status(422).json({ message: "Paystack could not verify that bank account. Check the details and retry." });
    return;
  }
  const accountName = result.data?.account_name;
  const resolvedAccountNumber = result.data?.account_number;
  if (
    typeof accountName !== "string" ||
    !accountName.trim() ||
    typeof resolvedAccountNumber !== "string" ||
    resolvedAccountNumber.replace(/\D/g, "") !== accountNumber
  ) {
    res.status(422).json({ message: "Paystack returned incomplete account verification details." });
    return;
  }

  const encrypted = encryptPayoutDetails(
    JSON.stringify({
      accountNumber,
      accountName: accountName.trim(),
      bankName: selectedBank.name,
      bankCode: parsed.data.bankCode,
    }),
  );
  await supabaseRest("payout_destinations?on_conflict=user_id", {
    method: "POST",
    body: {
      user_id: user.id,
      encrypted_payload: encrypted.encryptedPayload,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
      encryption_version: 1,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  res.json(
    SavePayoutDestinationResponse.parse({
      configured: true,
      bankName: selectedBank.name,
      accountName: accountName.trim(),
      accountLast4: accountNumber.slice(-4),
    }),
  );
};

router.put("/account/payout-destination", requireAuth, payoutDestinationHandler);
router.post("/payouts/account", requireAuth, payoutDestinationHandler);

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
    const parsed = CreateTenancyAgreementBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Check the agreement details and try again." });
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
    updated_at: new Date().toISOString(),
  };
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
