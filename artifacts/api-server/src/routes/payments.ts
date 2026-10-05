import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  CalculateFeesBody,
  CalculateFeesResponse,
  CalculateInstallmentsBody,
  CalculateInstallmentsResponse,
  CreateTransactionBody,
  CreateTransactionResponse,
  InitializePaymentBody,
  InitializePaymentResponse,
  ReceivePaystackWebhookBody,
  ReceivePaystackWebhookHeader,
} from "@workspace/api-zod";
import { requireAuth, requireUser } from "../lib/auth";
import { type DbRow } from "../lib/estatehold";
import { supabaseRest, supabaseRpc } from "../lib/supabase";

const router: IRouter = Router();

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

router.post("/installments/quote", (req, res): void => {
  const parsed = CalculateInstallmentsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Enter an amount and choose two to four installments." });
    return;
  }
  const { amountNaira, count } = parsed.data;
  const base = Math.floor(amountNaira / count);
  const remainder = amountNaira - base * count;
  const items = Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    amountNaira: base + (index < remainder ? 1 : 0),
  }));
  res.json(CalculateInstallmentsResponse.parse({ items, totalNaira: amountNaira }));
});

router.post("/transactions", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Choose a property and a supported payment plan." });
    return;
  }
  const user = await requireUser(req, res);
  if (!user) return;

  try {
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
  if (!secretKey.startsWith("sk_test_")) {
    res.status(503).json({ message: "Paystack checkout is available only after a test key is configured." });
    return;
  }
  if (!user.email) {
    res.status(422).json({ message: "Add an email address to your account before checkout." });
    return;
  }

  const params = new URLSearchParams({
    select: "*",
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
      req.log.warn({ status: paystackResponse.status }, "Paystack test checkout initialization failed");
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
      mode: "test",
    }),
  );
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
    !secretKey.startsWith("sk_test_") ||
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
    select: "*",
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