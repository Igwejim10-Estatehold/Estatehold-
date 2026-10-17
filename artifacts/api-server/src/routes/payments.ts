import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  CalculateFeesBody,
  CalculateFeesResponse,
  CalculateInstallmentsBody,
  CalculateInstallmentsResponse,
  GetProcessingFeeScheduleResponse,
  CreateTransactionBody,
  CreateTransactionResponse,
  InitializePaymentBody,
  InitializePaymentResponse,
  ReceivePaystackWebhookBody,
  ReceivePaystackWebhookHeader,
} from "@workspace/api-zod";
import { requireAuth, requireRoles, requireUser } from "../lib/auth";
import { type DbRow } from "../lib/estatehold";
import { loadVerifiedPayoutDestination } from "../lib/payout-destinations";
import { supabaseRest, supabaseRpc } from "../lib/supabase";

const router: IRouter = Router();
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CommissionPayoutRow = DbRow & {
  id: string;
  transaction_id: string;
  agent_id: string;
  amount_naira: number;
  status: string;
  transfer_reference: string;
};

function mapPayout(row: DbRow) {
  return {
    id: String(row["id"]),
    transactionId: String(row["transaction_id"]),
    agentId: String(row["agent_id"]),
    amountNaira: Number(row["amount_naira"]),
    status: String(row["status"]),
    approvedAt: row["approved_at"] ?? null,
    transferReference: String(row["transfer_reference"]),
    transferCode: row["transfer_code"] ?? null,
    recipientBankName: row["recipient_bank_name"] ?? null,
    recipientAccountLast4: row["recipient_account_last4"] ?? null,
    providerStatus: row["provider_status"] ?? null,
    failureMessage: row["failure_message"] ?? null,
    attemptStartedAt: row["attempt_started_at"] ?? null,
    lastReconciledAt: row["last_reconciled_at"] ?? null,
    completedAt: row["completed_at"] ?? null,
    createdAt: row["created_at"] ?? null,
    updatedAt: row["updated_at"] ?? null,
  };
}

function getTransferSecret(): string | null {
  const key = process.env["PAYSTACK_SECRET_KEY"]?.trim();
  return key?.startsWith("sk_test_") || key?.startsWith("sk_live_") ? key : null;
}

function configuredPaymentMode(secretKey: string): "test" | "live" | null {
  const publicKey = process.env["PAYSTACK_PUBLIC_KEY"]?.trim() ?? "";
  if (secretKey.startsWith("sk_live_") && publicKey.startsWith("pk_live_")) return "live";
  if (secretKey.startsWith("sk_test_") && publicKey.startsWith("pk_test_")) return "test";
  return null;
}

function paymentCallbackUrl(req: Parameters<typeof requireAuth>[0], reference: string): string {
  const domains = (process.env["REPLIT_DOMAINS"] ?? "")
    .split(",")
    .map((domain) => domain.trim())
    .filter(Boolean);
  const domain = domains[0] ?? process.env["REPLIT_DEV_DOMAIN"]?.trim();
  const origin = domain ? `https://${domain}` : `${req.protocol}://${req.get("host")}`;
  const callback = new URL("/payment-status", origin);
  callback.searchParams.set("reference", reference);
  return callback.toString();
}

async function startRentPayout(
  payoutId: string,
  landlordId: string,
  amountNaira: number,
  reference: string,
  secretKey: string,
): Promise<void> {
  const destination = await loadVerifiedPayoutDestination(landlordId);
  if (!destination) return;
  const setPayout = async (body: Record<string, unknown>) => {
    await supabaseRest(`rental_payouts?id=eq.${encodeURIComponent(payoutId)}`, {
      method: "PATCH",
      body: { ...body, updated_at: new Date().toISOString() },
      prefer: "return=minimal",
    });
  };
  await setPayout({ status: "initiating" });
  try {
    const recipientResponse = await fetch("https://api.paystack.co/transferrecipient", {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "nuban",
        name: destination.accountName,
        account_number: destination.accountNumber,
        bank_code: destination.bankCode,
        currency: "NGN",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const recipient = (await recipientResponse.json().catch(() => null)) as
      | { status?: boolean; data?: { recipient_code?: unknown } }
      | null;
    const recipientCode = recipient?.data?.recipient_code;
    if (!recipientResponse.ok || !recipient?.status || typeof recipientCode !== "string") {
      await setPayout({ status: "failed", provider_status: "recipient_creation_failed" });
      return;
    }
    await setPayout({ recipient_code: recipientCode });
    const transferResponse = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "balance",
        amount: Math.round(amountNaira * 100),
        recipient: recipientCode,
        reason: "Estatehold full rental payment",
        reference,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const transfer = (await transferResponse.json().catch(() => null)) as
      | { status?: boolean; message?: unknown; data?: { status?: unknown; transfer_code?: unknown } }
      | null;
    if (!transferResponse.ok || !transfer?.status || !transfer.data) {
      await setPayout({
        status: "reconciliation_required",
        provider_status: "transfer_response_unconfirmed",
      });
      return;
    }
    await setPayout({
      status: providerState(transfer.data.status),
      provider_status: String(transfer.data.status ?? "pending"),
      transfer_code: typeof transfer.data.transfer_code === "string" ? transfer.data.transfer_code : null,
    });
  } catch {
    await setPayout({
      status: "reconciliation_required",
      provider_status: "transfer_response_unconfirmed",
    });
  }
}

function providerState(status: unknown): "pending" | "success" | "failed" | "reversed" {
  switch (String(status ?? "").toLowerCase()) {
    case "success":
      return "success";
    case "failed":
      return "failed";
    case "reversed":
      return "reversed";
    default:
      return "pending";
  }
}

function safeProviderMessage(message: unknown): string | null {
  return typeof message === "string" && message.trim()
    ? message.trim().slice(0, 300)
    : null;
}

async function savePayoutUpdate(
  payoutId: string,
  body: Record<string, unknown>,
): Promise<void> {
  await supabaseRest(
    `agent_commission_payouts?id=eq.${encodeURIComponent(payoutId)}`,
    {
      method: "PATCH",
      body: { ...body, updated_at: new Date().toISOString() },
      prefer: "return=minimal",
    },
  );
}

async function sendCommissionTransfer(
  payout: CommissionPayoutRow,
  destination: NonNullable<Awaited<ReturnType<typeof loadVerifiedPayoutDestination>>>,
  secretKey: string,
  req: Parameters<typeof requireAuth>[0],
): Promise<DbRow> {
  let recipientResponse: Response;
  await savePayoutUpdate(payout.id, {
    recipient_bank_name: destination.bankName,
    recipient_account_last4: destination.accountNumber.slice(-4),
  });
  try {
    recipientResponse = await fetch("https://api.paystack.co/transferrecipient", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "nuban",
        name: destination.accountName,
        account_number: destination.accountNumber,
        bank_code: destination.bankCode,
        currency: "NGN",
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    await savePayoutUpdate(payout.id, {
      status: "failed",
      failure_message: "Paystack recipient creation could not be confirmed.",
    });
    throw new Error("Paystack recipient creation could not be confirmed.");
  }
  const recipientResult = (await recipientResponse.json().catch(() => null)) as
    | { status?: boolean; message?: unknown; data?: { recipient_code?: unknown } }
    | null;
  const recipientCode = recipientResult?.data?.recipient_code;
  if (!recipientResponse.ok || !recipientResult?.status || typeof recipientCode !== "string") {
    const failureMessage =
      safeProviderMessage(recipientResult?.message) ??
      "Paystack could not create the transfer recipient.";
    await savePayoutUpdate(payout.id, {
      status: "failed",
      failure_message: failureMessage,
      provider_status: "recipient_creation_failed",
      provider_response: { message: failureMessage },
    });
    throw new Error(failureMessage);
  }

  await savePayoutUpdate(payout.id, {
    recipient_code: recipientCode,
    provider_status: "recipient_created",
  });

  let transferResponse: Response;
  try {
    transferResponse = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        amount: Number(payout.amount_naira) * 100,
        recipient: recipientCode,
        reason: `Estatehold agent commission for ${payout.transaction_id}`,
        reference: payout.transfer_reference,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    await savePayoutUpdate(payout.id, {
      status: "reconciliation_required",
      provider_status: "unknown",
      failure_message:
        "Paystack did not confirm the transfer response. Reconcile this reference before taking further action.",
    });
    throw new Error("Paystack did not confirm the transfer response.");
  }

  const transferResult = (await transferResponse.json().catch(() => null)) as
    | {
        status?: boolean;
        message?: unknown;
        data?: { status?: unknown; transfer_code?: unknown; reference?: unknown };
      }
    | null;
  if (!transferResponse.ok || !transferResult?.status || !transferResult.data) {
    const failureMessage =
      safeProviderMessage(transferResult?.message) ?? "Paystack rejected the commission transfer.";
    await savePayoutUpdate(payout.id, {
      status: "failed",
      provider_status: "transfer_request_failed",
      failure_message: failureMessage,
      provider_response: { message: failureMessage },
    });
    throw new Error(failureMessage);
  }

  const state = providerState(transferResult.data.status);
  const updatedAt = new Date().toISOString();
  await savePayoutUpdate(payout.id, {
    status: state,
    provider_status: String(transferResult.data.status ?? state),
    transfer_code:
      typeof transferResult.data.transfer_code === "string"
        ? transferResult.data.transfer_code
        : null,
    failure_message: state === "failed" ? safeProviderMessage(transferResult.message) : null,
    provider_response: {
      status: transferResult.data.status ?? null,
      reference: transferResult.data.reference ?? payout.transfer_reference,
      transfer_code: transferResult.data.transfer_code ?? null,
      message: safeProviderMessage(transferResult.message),
    },
    completed_at: state === "success" || state === "failed" || state === "reversed"
      ? updatedAt
      : null,
  });
  const rows = await supabaseRest<DbRow[]>(
    `agent_commission_payouts?id=eq.${encodeURIComponent(payout.id)}&select=*`,
  );
  return rows[0] ?? { ...payout, status: state };
}

function feeQuote(input: {
  transactionType: string;
  amountNaira: number;
  isManaged: boolean;
  isDirectLandlord: boolean;
}) {
  const base = input.amountNaira;
  let buyerFee = 0;
  let landlordFee = 0;
  let platformFee = 0;
  let agentFee = 0;
  let note = "Fees shown are indicative and may change after legal and compliance review.";

  switch (input.transactionType) {
    case "sale":
      if (input.isManaged) {
        landlordFee = Math.round(base * 0.1);
        platformFee = landlordFee;
        note = "Managed property: 10% platform fee deducted from the landlord payout.";
      } else if (input.isDirectLandlord) {
        buyerFee = Math.round(base * 0.05);
        landlordFee = Math.round(base * 0.1);
        platformFee = buyerFee + landlordFee;
        note = "Direct landlord sale: buyer adds 5%; 10% is deducted from the landlord payout.";
      } else {
        buyerFee = Math.round(base * 0.15);
        agentFee = Math.round(base * 0.1);
        platformFee = Math.round(base * 0.05);
        note = "Agent sale: 10% listing-agent commission plus 5% platform commission.";
      }
      break;
    case "rent_year_one":
      buyerFee = Math.round(base * 0.05);
      landlordFee = Math.round(base * 0.05);
      platformFee = buyerFee + landlordFee;
      note = "First-year rent: 5% tenant fee plus 5% landlord fee.";
      break;
    case "rent_renewal":
      note = "Renewal after the first year has no platform commission under the current fee schedule.";
      break;
    case "rent_micro_installment":
      buyerFee = Math.round(base * 0.03);
      platformFee = buyerFee;
      note = "Micro-rent subscription: 3% tenant platform fee.";
      break;
    case "social_housing":
      buyerFee = Math.round(base * 0.05);
      platformFee = buyerFee;
      note = "Social housing: 5% platform fee.";
      break;
  }

  return CalculateFeesResponse.parse({
    buyerPaysNaira: base + buyerFee,
    landlordPaysNaira: landlordFee,
    platformFeeNaira: platformFee,
    agentFeeNaira: agentFee,
    landlordReceivesNaira: base - landlordFee,
    note,
  });
}

router.post("/pricing/quote", (req, res): void => {
  const parsed = CalculateFeesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Enter a valid amount and transaction type." });
    return;
  }
  res.json(feeQuote(parsed.data));
});

router.get("/pricing/processing-fees", (_req, res): void => {
  res.json(GetProcessingFeeScheduleResponse.parse({
    standardListingFeeNaira: 1500,
    institutionalListingFeeNaira: 2000,
    institutionalYearlyServiceChargeNaira: 6000,
    hotelListingFeeNaira: 2000,
    hotelOwnerCommissionPercent: 2.5,
    guestCommissionPercent: 2.5,
    standardCategories: ["Homes", "Lands", "Warehouses", "Complexes", "Malls", "Filling Stations", "Factories"],
    institutionalCategories: ["Hospitals", "Schools", "Worship Centers"],
  }));
});

const optionalAuth = (req: Parameters<typeof requireAuth>[0], res: Parameters<typeof requireAuth>[1], next: Parameters<typeof requireAuth>[2]) => {
  if (!req.get("authorization")) {
    next();
    return;
  }
  return requireAuth(req, res, next);
};

router.post("/installments/quote", optionalAuth, async (req, res): Promise<void> => {
  const parsed = CalculateInstallmentsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Enter an amount and choose two to four installments." });
    return;
  }
  if (parsed.data.transactionType === "loan" && !(await requireRoles(req, res, ["represented_tenant"]))) return;
  const { amountNaira, count } = parsed.data;
  const base = Math.floor(amountNaira / count);
  const remainder = amountNaira - base * count;
  const items = Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    amountNaira: base + (index < remainder ? 1 : 0),
  }));
  res.json(CalculateInstallmentsResponse.parse({ items, totalNaira: amountNaira }));
});

router.post(
  "/transactions/:transactionId/escrow-confirmation",
  requireAuth,
  async (req, res): Promise<void> => {
    const transactionId = String(req.params["transactionId"] ?? "");
    if (!UUID_PATTERN.test(transactionId)) {
      res.status(400).json({ message: "Invalid transaction ID." });
      return;
    }
    const user = await requireUser(req, res);
    if (!user) return;
    try {
      await supabaseRpc("confirm_estatehold_escrow", {
        p_transaction_id: transactionId,
        p_buyer_id: user.id,
      });
      res.json({ confirmed: true });
    } catch (error) {
      req.log.info({ transactionId, error }, "Escrow client confirmation was not accepted");
      res.status(409).json({
        message: "Confirmation is available only to the buyer after all transaction payments are complete.",
      });
    }
  },
);

router.post(
  "/admin/transactions/:transactionId/escrow-compliance-approval",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!(await requireRoles(req, res, ["admin"]))) return;
    const transactionId = String(req.params["transactionId"] ?? "");
    if (!UUID_PATTERN.test(transactionId)) {
      res.status(400).json({ message: "Invalid transaction ID." });
      return;
    }
    const admin = await requireUser(req, res);
    if (!admin) return;

    const transactionQuery = new URLSearchParams({
      select: "id,status",
      id: `eq.${transactionId}`,
      limit: "1",
    });
    const transactions = await supabaseRest<DbRow[]>(`transactions?${transactionQuery}`);
    const transaction = transactions[0];
    if (!transaction || !["paid", "completed"].includes(String(transaction["status"]))) {
      res.status(409).json({ message: "Compliance approval requires fully paid transaction funds." });
      return;
    }
    const scheduleQuery = new URLSearchParams({
      select: "status",
      transaction_id: `eq.${transactionId}`,
    });
    const schedule = await supabaseRest<DbRow[]>(`sales_installments?${scheduleQuery}`);
    if (schedule.some((item) => item["status"] !== "paid")) {
      res.status(409).json({ message: "All transaction installments must be paid first." });
      return;
    }

    const holds = await supabaseRest<DbRow[]>(
      `escrow_holds?transaction_id=eq.${encodeURIComponent(transactionId)}&is_released=eq.false&select=transaction_id`,
      {
        method: "PATCH",
        body: {
          compliance_approved_at: new Date().toISOString(),
          compliance_approved_by: admin.id,
        },
        prefer: "return=representation",
      },
    );
    if (!holds.length) {
      res.status(409).json({ message: "The escrow hold is unavailable or already released." });
      return;
    }
    res.json({ approved: true });
  },
);

router.get("/admin/agent-commission-payouts", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireRoles(req, res, ["admin"]))) return;
  const query = new URLSearchParams({
    select:
      "id,transaction_id,agent_id,amount_naira,status,approved_at,transfer_reference,transfer_code,recipient_bank_name,recipient_account_last4,provider_status,failure_message,attempt_started_at,last_reconciled_at,completed_at,created_at,updated_at",
    order: "created_at.desc",
    limit: "500",
  });
  const rows = await supabaseRest<DbRow[]>(`agent_commission_payouts?${query}`);
  res.json({ items: rows.map(mapPayout) });
});

router.post(
  "/admin/agent-commission-payouts/:transactionId/approve",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!(await requireRoles(req, res, ["admin"]))) return;
    const transactionId = String(req.params["transactionId"] ?? "");
    if (!UUID_PATTERN.test(transactionId)) {
      res.status(400).json({ message: "Invalid transaction ID." });
      return;
    }
    const admin = await requireUser(req, res);
    if (!admin) return;

    const existingQuery = new URLSearchParams({
      select: "*",
      transaction_id: `eq.${transactionId}`,
      limit: "1",
    });
    const existing = await supabaseRest<CommissionPayoutRow[]>(
      `agent_commission_payouts?${existingQuery}`,
    );
    if (existing[0]) {
      res.json({ created: false, payout: mapPayout(existing[0]) });
      return;
    }

    const secretKey = getTransferSecret();
    if (!secretKey) {
      res.status(503).json({ message: "Paystack transfers are not configured." });
      return;
    }
    const transactionQuery = new URLSearchParams({
      select: "id,agent_fee_naira,properties(owner_id)",
      id: `eq.${transactionId}`,
      limit: "1",
    });
    const transactions = await supabaseRest<DbRow[]>(`transactions?${transactionQuery}`);
    const transaction = transactions[0];
    const property = transaction?.["properties"] as DbRow | null;
    const agentId = typeof property?.["owner_id"] === "string" ? property["owner_id"] : "";
    if (!transaction || !agentId || Number(transaction["agent_fee_naira"]) <= 0) {
      res.status(409).json({ message: "This transaction has no eligible agent commission." });
      return;
    }
    if (!Number.isSafeInteger(Number(transaction["agent_fee_naira"]))) {
      res.status(409).json({ message: "The commission amount cannot be transferred safely." });
      return;
    }

    let destination: Awaited<ReturnType<typeof loadVerifiedPayoutDestination>>;
    try {
      destination = await loadVerifiedPayoutDestination(agentId);
    } catch (error) {
      req.log.error({ transactionId, error }, "Could not decrypt the verified agent payout destination");
      res.status(503).json({ message: "The verified payout destination could not be loaded." });
      return;
    }
    if (!destination) {
      res.status(409).json({ message: "The listing agent must save a verified payout destination first." });
      return;
    }

    const reference = `EHC-${randomUUID()}`;
    let claimRows: DbRow[];
    try {
      const result = await supabaseRpc<DbRow | DbRow[]>("claim_agent_commission_payout", {
        p_transaction_id: transactionId,
        p_admin_id: admin.id,
        p_transfer_reference: reference,
      });
      claimRows = Array.isArray(result) ? result : [result];
    } catch (error) {
      req.log.info({ transactionId, error }, "Agent commission payout approval was not accepted");
      res.status(409).json({
        message: "Commission approval requires a fully paid transaction and an already released escrow.",
      });
      return;
    }
    const claim = claimRows[0];
    const payoutId = typeof claim?.["payout_id"] === "string" ? claim["payout_id"] : "";
    const claimedAgentId = typeof claim?.["agent_id"] === "string" ? claim["agent_id"] : "";
    const isNew = claim?.["is_new"] === true;
    if (!payoutId || claimedAgentId !== agentId) {
      res.status(409).json({ message: "The commission payout could not be reserved safely." });
      return;
    }
    if (!isNew) {
      const rows = await supabaseRest<CommissionPayoutRow[]>(
        `agent_commission_payouts?id=eq.${encodeURIComponent(payoutId)}&select=*`,
      );
      res.json({ created: false, payout: rows[0] ? mapPayout(rows[0]) : null });
      return;
    }

    const payoutRows = await supabaseRest<CommissionPayoutRow[]>(
      `agent_commission_payouts?id=eq.${encodeURIComponent(payoutId)}&select=*`,
    );
    const payout = payoutRows[0];
    if (!payout) {
      res.status(503).json({ message: "The payout ledger entry could not be loaded." });
      return;
    }
    try {
      const transferred = await sendCommissionTransfer(payout, destination, secretKey, req);
      res.status(201).json({ created: true, payout: mapPayout(transferred) });
    } catch (error) {
      req.log.warn({ payoutId, error }, "Agent commission transfer requires review");
      const rows = await supabaseRest<CommissionPayoutRow[]>(
        `agent_commission_payouts?id=eq.${encodeURIComponent(payoutId)}&select=*`,
      );
      res.status(502).json({
        message: "The payout attempt needs review. It will not be retried automatically.",
        payout: rows[0] ? mapPayout(rows[0]) : null,
      });
    }
  },
);

router.post(
  "/admin/agent-commission-payouts/:payoutId/reconcile",
  requireAuth,
  async (req, res): Promise<void> => {
    if (!(await requireRoles(req, res, ["admin"]))) return;
    const payoutId = String(req.params["payoutId"] ?? "");
    if (!UUID_PATTERN.test(payoutId)) {
      res.status(400).json({ message: "Invalid payout ID." });
      return;
    }
    const query = new URLSearchParams({
      select: "*",
      id: `eq.${payoutId}`,
      limit: "1",
    });
    const rows = await supabaseRest<CommissionPayoutRow[]>(
      `agent_commission_payouts?${query}`,
    );
    const payout = rows[0];
    if (!payout) {
      res.status(404).json({ message: "Commission payout not found." });
      return;
    }
    if (!["initiating", "pending", "reconciliation_required"].includes(payout.status)) {
      res.json({ payout: mapPayout(payout), reconciled: false });
      return;
    }
    const secretKey = getTransferSecret();
    if (!secretKey) {
      res.status(503).json({ message: "Paystack transfers are not configured." });
      return;
    }
    let response: Response;
    try {
      response = await fetch(
        `https://api.paystack.co/transfer/verify/${encodeURIComponent(payout.transfer_reference)}`,
        {
          headers: { Authorization: `Bearer ${secretKey}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch {
      res.status(502).json({ message: "Paystack could not verify this transfer reference. No new transfer was sent." });
      return;
    }
    const result = (await response.json().catch(() => null)) as
      | {
          status?: boolean;
          message?: unknown;
          data?: { status?: unknown; transfer_code?: unknown; reference?: unknown };
        }
      | null;
    if (!response.ok || !result?.status || !result.data) {
      const failureMessage =
        safeProviderMessage(result?.message) ??
        "Paystack could not confirm this transfer. No new transfer was sent.";
      const updated = new Date().toISOString();
      await savePayoutUpdate(payout.id, {
        status: "reconciliation_required",
        provider_status: "verification_unavailable",
        failure_message: failureMessage,
        last_reconciled_at: updated,
        provider_response: { message: failureMessage },
      });
      res.status(502).json({
        message: "Paystack could not confirm this transfer. No new transfer was sent.",
        payout: mapPayout({ ...payout, status: "reconciliation_required", failure_message: failureMessage }),
      });
      return;
    }

    const state = providerState(result.data.status);
    const updated = new Date().toISOString();
    await savePayoutUpdate(payout.id, {
      status: state,
      provider_status: String(result.data.status ?? state),
      transfer_code:
        typeof result.data.transfer_code === "string" ? result.data.transfer_code : payout.transfer_code,
      failure_message: state === "failed" ? safeProviderMessage(result.message) : null,
      provider_response: {
        status: result.data.status ?? null,
        reference: result.data.reference ?? payout.transfer_reference,
        transfer_code: result.data.transfer_code ?? payout.transfer_code,
        message: safeProviderMessage(result.message),
      },
      last_reconciled_at: updated,
      completed_at: state === "success" || state === "failed" || state === "reversed"
        ? updated
        : null,
    });
    const updatedRows = await supabaseRest<CommissionPayoutRow[]>(
      `agent_commission_payouts?id=eq.${encodeURIComponent(payout.id)}&select=*`,
    );
    res.json({
      payout: updatedRows[0] ? mapPayout(updatedRows[0]) : null,
      reconciled: true,
    });
  },
);

router.post("/transactions", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose a property and a supported payment plan." });
    return;
  }
  const user = await requireUser(req, res);
  if (!user) return;

  try {
    const listingQuery = new URLSearchParams({
      select: "id,owner_id,intent",
      id: `eq.${parsed.data.propertyId}`,
      limit: "1",
    });
    const listings = await supabaseRest<DbRow[]>(`properties?${listingQuery}`);
    if (!listings[0] || listings[0]["owner_id"] === user.id) {
      res.status(409).json({ message: "You cannot start a transaction for this listing." });
      return;
    }
    const result = await supabaseRpc<DbRow | DbRow[]>("create_estatehold_transaction", {
      p_property_id: parsed.data.propertyId,
      p_buyer_id: user.id,
      p_payment_mode: parsed.data.paymentMode,
      p_installment_count:
        parsed.data.paymentMode === "installments" ? parsed.data.installmentCount ?? 2 : 1,
      p_social_housing_unit_id: parsed.data.socialHousingUnitId ?? null,
    });
    const row = Array.isArray(result) ? result[0] : result;
    if (!row) {
      res.status(409).json({ message: "The property could not be reserved for this transaction." });
      return;
    }
    res.status(201).json(
      CreateTransactionResponse.parse({
        id: String(row["id"]),
        propertyId: String(row["property_id"]),
        totalNaira: Number(row["buyer_total_naira"]),
        platformFeeNaira: Number(row["platform_fee_naira"]),
        agentFeeNaira: Number(row["agent_fee_naira"]),
        status: String(row["status"]),
        escrowHeld: true,
      }),
    );
  } catch (error) {
    req.log.warn({ error }, "Could not create a property transaction");
    res.status(409).json({
      message: "This listing cannot start a transaction until it is verified and available.",
    });
  }
});

router.post("/payments/initialize", requireAuth, async (req, res): Promise<void> => {
  const parsed = InitializePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose a valid transaction to continue." });
    return;
  }
  const user = await requireUser(req, res);
  if (!user) return;
  const secretKey = process.env["PAYSTACK_SECRET_KEY"] ?? "";
  const mode = configuredPaymentMode(secretKey);
  if (!mode) {
    res.status(503).json({ message: "Paystack keys are missing or do not match." });
    return;
  }
  if (!user.email) {
    res.status(422).json({ message: "Add an email address to your account before checkout." });
    return;
  }

  const params = new URLSearchParams({
    select: "*,properties(owner_id,intent)",
    id: `eq.${parsed.data.transactionId}`,
    buyer_id: `eq.${user.id}`,
    status: "eq.pending",
    limit: "1",
  });
  const transactions = await supabaseRest<DbRow[]>(`transactions?${params}`);
  const transaction = transactions[0];
  if (!transaction) {
    res.status(404).json({ message: "Pending transaction not found." });
    return;
  }
  const propertyRelation = transaction["properties"] as DbRow | null;
  if (
    propertyRelation?.["intent"] === "rent" &&
    transaction["payment_mode"] === "full" &&
    Number(transaction["installment_count"]) === 1
  ) {
    const ownerId = String(propertyRelation["owner_id"] ?? "");
    let destination: Awaited<ReturnType<typeof loadVerifiedPayoutDestination>>;
    try {
      destination = await loadVerifiedPayoutDestination(ownerId);
    } catch {
      res.status(503).json({ message: "The landlord payout account could not be verified right now." });
      return;
    }
    if (!destination) {
      res.status(409).json({ message: "The landlord must link and verify a Paystack payout account before rent checkout." });
      return;
    }
  }

  let amountNaira = Number(transaction["buyer_total_naira"]);
  let installmentRow: DbRow | undefined;
  if (Number(transaction["installment_count"]) > 1) {
    const installmentQuery = new URLSearchParams({
      select: "*",
      transaction_id: `eq.${transaction["id"]}`,
      status: "eq.scheduled",
      order: "installment_no.asc",
      limit: "1",
    });
    const installments = await supabaseRest<DbRow[]>(`sales_installments?${installmentQuery}`);
    installmentRow = installments[0];
    if (!installmentRow || installmentRow["status"] === "paid") {
      res.status(409).json({ message: "The first installment is already paid or unavailable." });
      return;
    }
    amountNaira = Number(installmentRow["amount_naira"]);
  }

  let reference =
    typeof installmentRow?.["paystack_reference"] === "string"
      ? installmentRow["paystack_reference"]
      : typeof transaction["paystack_reference"] === "string"
        ? transaction["paystack_reference"]
        : "";
  let authorizationUrl =
    typeof installmentRow?.["checkout_url"] === "string"
      ? installmentRow["checkout_url"]
      : typeof transaction["checkout_url"] === "string"
        ? transaction["checkout_url"]
        : "";
  if (!authorizationUrl) {
    if (reference) {
      res.status(409).json({
        message: "Checkout was started earlier. Continue with the original Paystack link or wait for it to expire.",
      });
      return;
    }
    reference = `EHD-${randomUUID()}`;
    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount: amountNaira * 100,
        currency: "NGN",
        reference,
        callback_url: paymentCallbackUrl(req, reference),
        metadata: {
          estateholdTransactionId: String(transaction["id"]),
          installmentNumber: installmentRow ? 1 : null,
        },
      }),
    });
    const paystackResult = (await paystackResponse.json().catch(() => null)) as
      | { status?: boolean; data?: { authorization_url?: string; reference?: string } }
      | null;
    if (!paystackResponse.ok || !paystackResult?.data?.authorization_url) {
      req.log.warn({ status: paystackResponse.status, mode }, "Paystack checkout initialization failed");
      res.status(502).json({ message: "Paystack could not start checkout. Try again later." });
      return;
    }
    authorizationUrl = paystackResult.data.authorization_url;
  }

  if (installmentRow) {
    await supabaseRest(
      `sales_installments?id=eq.${encodeURIComponent(String(installmentRow["id"]))}`,
      {
        method: "PATCH",
        body: { paystack_reference: reference, checkout_url: authorizationUrl },
        prefer: "return=minimal",
      },
    );
  } else {
    await supabaseRest(`transactions?id=eq.${encodeURIComponent(String(transaction["id"]))}`, {
      method: "PATCH",
      body: { paystack_reference: reference, checkout_url: authorizationUrl },
      prefer: "return=minimal",
    });
  }

  res.json(
    InitializePaymentResponse.parse({
      reference,
      authorizationUrl,
      mode,
    }),
  );
});

router.get("/payments/status/:reference", requireAuth, async (req, res): Promise<void> => {
  const reference = String(req.params["reference"] ?? "");
  const user = await requireUser(req, res);
  if (!user) return;
  if (!reference || reference.length > 100) {
    res.status(400).json({ message: "Invalid payment reference." });
    return;
  }
  const query = new URLSearchParams({
    select: "id,status,payment_mode,properties(intent,rental_status)",
    paystack_reference: `eq.${reference}`,
    buyer_id: `eq.${user.id}`,
    limit: "1",
  });
  const transactions = await supabaseRest<DbRow[]>(`transactions?${query}`);
  const transaction = transactions[0];
  if (!transaction) {
    res.status(404).json({ message: "Payment record not found for this account." });
    return;
  }
  const payoutRows = await supabaseRest<DbRow[]>(
    `rental_payouts?transaction_id=eq.${encodeURIComponent(String(transaction["id"]))}&select=status&limit=1`,
  );
  const property = transaction["properties"] as DbRow | null;
  res.json({
    paymentStatus: String(transaction["status"]),
    rentalStatus: property?.["rental_status"] ?? null,
    settlementStatus: payoutRows[0]?.["status"] ?? null,
    isRent: property?.["intent"] === "rent",
  });
});

function signaturesMatch(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

router.post("/payments/webhook", async (req, res): Promise<void> => {
  const parsedHeaders = ReceivePaystackWebhookHeader.safeParse({
    "x-paystack-signature": req.get("x-paystack-signature"),
  });
  const parsedBody = ReceivePaystackWebhookBody.safeParse(req.body);
  const secretKey = process.env["PAYSTACK_SECRET_KEY"] ?? "";
  if (
    !parsedHeaders.success ||
    !parsedBody.success ||
    !configuredPaymentMode(secretKey) ||
    !req.rawBody
  ) {
    res.status(400).json({ message: "Invalid Paystack webhook request." });
    return;
  }

  const expected = createHmac("sha512", secretKey).update(req.rawBody).digest("hex");
  if (!signaturesMatch(parsedHeaders.data["x-paystack-signature"], expected)) {
    res.status(401).json({ message: "Paystack signature verification failed." });
    return;
  }

  const event = parsedBody.data;
  if (event.event !== "charge.success") {
    res.json({ received: true });
    return;
  }
  const reference = event.data.reference;
  if (!reference || typeof event.data.amount !== "number") {
    res.status(400).json({ message: "Paystack event is missing payment details." });
    return;
  }
  let verifiedResponse: Response;
  try {
    verifiedResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${secretKey}` }, signal: AbortSignal.timeout(15_000) },
    );
  } catch {
    res.status(502).json({ message: "Paystack could not verify this payment yet." });
    return;
  }
  const verified = (await verifiedResponse.json().catch(() => null)) as
    | { status?: boolean; data?: { status?: unknown; reference?: unknown; amount?: unknown; currency?: unknown } }
    | null;
  if (
    !verifiedResponse.ok ||
    !verified?.status ||
    verified.data?.status !== "success" ||
    verified.data.reference !== reference ||
    verified.data.currency !== "NGN" ||
    Number(verified.data.amount) !== event.data.amount
  ) {
    res.status(400).json({ message: "Paystack verification did not match the payment event." });
    return;
  }

  const installmentQuery = new URLSearchParams({
    select: "id,transaction_id,amount_naira,status",
    paystack_reference: `eq.${reference}`,
    limit: "1",
  });
  const installmentRows = await supabaseRest<DbRow[]>(
    `sales_installments?${installmentQuery}`,
  );
  const installment = installmentRows[0];
  if (installment) {
    const transactionQuery = new URLSearchParams({
      select: "*",
      id: `eq.${installment["transaction_id"]}`,
      limit: "1",
    });
    const transactions = await supabaseRest<DbRow[]>(`transactions?${transactionQuery}`);
    const transaction = transactions[0];
    if (!transaction || transaction["status"] === "cancelled") {
      res.status(409).json({ message: "This transaction is no longer active." });
      return;
    }
    if (Number(event.data.amount) !== Number(installment["amount_naira"]) * 100) {
      res.status(400).json({ message: "Payment amount did not match the transaction." });
      return;
    }
    if (installment["status"] !== "paid") {
      await supabaseRest(
        `sales_installments?id=eq.${encodeURIComponent(String(installment["id"]))}`,
        {
          method: "PATCH",
          body: { status: "paid", paid_at: new Date().toISOString() },
          prefer: "return=minimal",
        },
      );
    }
    const scheduleQuery = new URLSearchParams({
      select: "status",
      transaction_id: `eq.${transaction["id"]}`,
    });
    const schedule = await supabaseRest<DbRow[]>(`sales_installments?${scheduleQuery}`);
    if (schedule.length > 0 && schedule.every((item) => item["status"] === "paid")) {
      await supabaseRest(`transactions?id=eq.${encodeURIComponent(String(transaction["id"]))}`, {
        method: "PATCH",
        body: { status: "paid", paid_at: new Date().toISOString() },
        prefer: "return=minimal",
      });
    }
    res.json({ received: true });
    return;
  }

  const query = new URLSearchParams({
    select: "*,properties(owner_id,intent)",
    paystack_reference: `eq.${reference}`,
    limit: "1",
  });
  const transactions = await supabaseRest<DbRow[]>(`transactions?${query}`);
  const transaction = transactions[0];
  if (!transaction) {
    req.log.warn({ reference }, "Paystack event did not match a transaction");
    res.status(404).json({ message: "Transaction not found." });
    return;
  }
  if (transaction["status"] === "cancelled") {
    res.status(409).json({ message: "This transaction is no longer active." });
    return;
  }
  if (Number(event.data.amount) !== Number(transaction["buyer_total_naira"]) * 100) {
    res.status(400).json({ message: "Payment amount did not match the transaction." });
    return;
  }

  const property = transaction["properties"] as DbRow | null;
  if (
    property?.["intent"] === "rent" &&
    transaction["payment_mode"] === "full" &&
    Number(transaction["installment_count"]) === 1
  ) {
    const transferReference = `EHR-${randomUUID()}`;
    const claimed = await supabaseRpc<DbRow | DbRow[]>("complete_rental_payment", {
      p_transaction_id: String(transaction["id"]),
      p_reference: reference,
      p_transfer_reference: transferReference,
    });
    const payout = Array.isArray(claimed) ? claimed[0] : claimed;
    if (payout?.["is_new"] === true) {
      await startRentPayout(
        String(payout["payout_id"]),
        String(payout["landlord_id"]),
        Number(payout["amount_naira"]),
        transferReference,
        secretKey,
      );
    }
    res.json({ received: true });
    return;
  }

  if (transaction["status"] !== "paid") {
    await supabaseRest(`transactions?id=eq.${encodeURIComponent(String(transaction["id"]))}`, {
      method: "PATCH",
      body: { status: "paid", paid_at: new Date().toISOString() },
      prefer: "return=minimal",
    });
  }
  // Escrow remains held; this webhook never pays out or releases a hold.
  res.json({ received: true });
});

export default router;