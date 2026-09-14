import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  assess,
  botScore,
  defaultParams,
  FRAUD_ENGINE_VERSION,
  RULE_CATALOG,
  type BeaconInput,
  type FraudAssessment,
  type FraudContext,
  type HistoryOrder,
  type RuleCode,
  type RuleState,
} from "./fraud-engine";
import { cached } from "./cache.server";
import { incr, log, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";

type Client = SupabaseClient<Database>;

export { RULE_CATALOG, botScore, FRAUD_ENGINE_VERSION };
export type { RuleCode, FraudAssessment };

const DEFAULT_PARAMS = defaultParams();

/** Rules are read on every checkout, so they are cached per tenant for 60s. */
export async function ensureRules(db: Client, merchantId: string) {
  const { data } = await db
    .from("fraud_rules")
    .select("id, code, enabled, params, precedence, action")
    .eq("merchant_id", merchantId);
  const existing = new Set((data ?? []).map((r) => r.code));
  const missing = RULE_CATALOG.filter((r) => !existing.has(r.code)).map((r) => ({
    merchant_id: merchantId,
    code: r.code,
    enabled: true,
    precedence: r.precedence,
    action: r.action,
    params: DEFAULT_PARAMS[r.code]!,
  }));
  if (missing.length) {
    await db.from("fraud_rules").insert(missing);
    const { data: fresh } = await db
      .from("fraud_rules")
      .select("id, code, enabled, params, precedence, action")
      .eq("merchant_id", merchantId);
    return fresh ?? [];
  }
  return data ?? [];
}

async function cachedRules(db: Client, merchantId: string): Promise<RuleState[]> {
  return cached(`fraud:rules:${merchantId}`, 60, async () => {
    const rows = await ensureRules(db, merchantId);
    return rows.map((r) => ({ code: r.code, enabled: r.enabled, params: r.params }));
  });
}

export function invalidateRuleCache(merchantId: string) {
  void merchantId; // cache entry expires within 60s; explicit hook kept for callers
}

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 5) return "•••••";
  return `${digits.slice(0, 3)}••••${digits.slice(-3)}`;
}

/** PII-minimal stable identity for an assessment row. */
export async function subjectHash(merchantId: string, phone: string, email?: string | null) {
  const input = `${merchantId}|${phone.replace(/\D/g, "")}|${(email ?? "").toLowerCase()}`;
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function writeAudit(
  db: Client,
  merchantId: string,
  actor: string,
  action: string,
  payload: Record<string, unknown>,
  caseId?: string | null,
) {
  await db.from("fraud_audit").insert({
    merchant_id: merchantId,
    actor,
    action,
    case_id: caseId ?? null,
    payload: payload as never,
  });
}

type OrderRow = {
  id: string;
  order_number: string;
  customer_phone: string;
  address_line: string | null;
  total_minor_int: number;
  currency_code: string;
  payment_method: string;
  status: string;
  created_at: string;
};

const ORDER_COLUMNS =
  "id, order_number, customer_phone, address_line, total_minor_int, currency_code, payment_method, status, created_at";

function toHistory(rows: OrderRow[]): HistoryOrder[] {
  return rows.map((o) => ({
    phone: o.customer_phone,
    addressLine: o.address_line,
    createdAt: o.created_at,
    status: o.status,
    paymentMethod: o.payment_method,
    totalMinorInt: o.total_minor_int,
  }));
}

export function scoreOrder(order: OrderRow, all: OrderRow[], rules: RuleState[]) {
  const verdict = assess(
    {
      amountMinorInt: order.total_minor_int,
      paymentMethod: order.payment_method,
      createdAt: order.created_at,
      phone: order.customer_phone,
      addressLine: order.address_line,
      history: toHistory(all.filter((o) => o.id !== order.id)),
    },
    rules,
  );
  return {
    score: verdict.score,
    action: verdict.action,
    decisiveCode: verdict.decisiveCode,
    signals: verdict.signals.map((s) => ({
      code: s.code,
      label: s.detail,
      weight: s.weight,
      action: s.action,
      observed: s.observed,
      threshold: s.threshold,
    })),
  };
}

async function activeBlacklist(db: Client, merchantId: string) {
  return cached(`fraud:blacklist:${merchantId}`, 60, async () => {
    const { data } = await db
      .from("fraud_blacklist")
      .select("kind, value")
      .eq("merchant_id", merchantId)
      .eq("active", true)
      .limit(1000);
    return data ?? [];
  });
}

export type CheckoutAssessmentInput = {
  phone: string;
  email?: string | null;
  addressLine?: string | null;
  amountMinorInt: number;
  paymentMethod: string;
  honeypotTripped?: boolean;
  beacon?: BeaconInput | null;
};

/**
 * Pre-order verdict used by the checkout rail. Fails open on infrastructure
 * errors (never blocks a legitimate sale on a database hiccup) but fails closed
 * on an explicit `block` verdict.
 */
export async function assessCheckout(
  merchantId: string,
  input: CheckoutAssessmentInput,
  subject = "anonymous",
): Promise<FraudAssessment & { subjectHash: string }> {
  return withSpan("fraud.assess", async () => {
    await enforceRateLimit("fraud.assess", `${merchantId}:${subject}`);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as Client;
    const hash = await subjectHash(merchantId, input.phone, input.email);

    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [rules, blacklist, history] = await Promise.all([
      cachedRules(db, merchantId),
      activeBlacklist(db, merchantId),
      db
        .from("orders")
        .select(ORDER_COLUMNS)
        .eq("merchant_id", merchantId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(400),
    ]);

    const phoneDigits = input.phone.replace(/\D/g, "");
    const blacklisted = blacklist.some(
      (b) =>
        (b.kind === "phone" && b.value.replace(/\D/g, "") === phoneDigits) ||
        (b.kind === "email" && !!input.email && b.value === input.email.toLowerCase()),
    );

    const ctx: FraudContext = {
      amountMinorInt: input.amountMinorInt,
      paymentMethod: input.paymentMethod,
      createdAt: new Date().toISOString(),
      phone: input.phone,
      email: input.email ?? null,
      addressLine: input.addressLine ?? null,
      history: toHistory((history.data ?? []) as OrderRow[]),
      blacklisted,
      honeypotTripped: input.honeypotTripped ?? false,
      botScore: input.beacon ? botScore(input.beacon) : 0,
    };

    const verdict = assess(ctx, rules);

    await db.from("fraud_assessments").insert({
      merchant_id: merchantId,
      subject_hash: hash,
      engine_version: verdict.version,
      score: verdict.score,
      action: verdict.action,
      decisive_code: verdict.decisiveCode,
      signals: verdict.signals as never,
      context: {
        amount_minor_int: input.amountMinorInt,
        payment_method: input.paymentMethod,
        bot_score: ctx.botScore ?? 0,
        honeypot: ctx.honeypotTripped ?? false,
      } as never,
    });

    incr("framique_fraud_assessment_total", { action: verdict.action });
    for (const signal of verdict.signals) incr("framique_fraud_rule_hits_total", { rule: signal.code });
    if (verdict.action === "block")
      log("warn", "fraud.blocked", {
        merchantId,
        rule: verdict.decisiveCode,
        score: verdict.score,
      });

    return { ...verdict, subjectHash: hash };
  });
}

/** Attach a persisted assessment to the order it produced, and open a case when needed. */
export async function recordOrderVerdict(
  merchantId: string,
  orderId: string,
  orderNumber: string,
  phone: string,
  currency: string,
  amountMinorInt: number,
  verdict: FraudAssessment & { subjectHash: string },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as Client;
  await db
    .from("fraud_assessments")
    .update({ order_id: orderId })
    .eq("merchant_id", merchantId)
    .eq("subject_hash", verdict.subjectHash)
    .is("order_id", null);

  if (verdict.action !== "review") return null;
  const { data } = await db
    .from("fraud_cases")
    .insert({
      merchant_id: merchantId,
      order_id: orderId,
      order_number: orderNumber,
      customer_phone: phone,
      amount_minor_int: amountMinorInt,
      currency_code: currency,
      risk_score: verdict.score,
      signals: verdict.signals as never,
      reason: { rules: verdict.signals.map((s) => s.code), engine: verdict.version } as never,
    })
    .select("id")
    .single();
  incr("framique_fraud_case_total", { source: "checkout" });
  return data?.id ?? null;
}

/**
 * Fulfilment gate: an order under open review may not ship. Fails closed —
 * if the hold cannot be read the fulfilment is refused.
 */
export async function assertNoFraudHold(db: Client, merchantId: string, orderId: string) {
  const { data, error } = await db
    .from("fraud_cases")
    .select("id, status, risk_score")
    .eq("merchant_id", merchantId)
    .eq("order_id", orderId)
    .in("status", ["open", "evidence_requested"])
    .limit(1);
  if (error) {
    incr("framique_fraud_hold_total", { result: "error" });
    throw new Error("fraud_hold_check_failed");
  }
  if (data && data.length > 0) {
    incr("framique_fraud_hold_total", { result: "held" });
    throw new Error("fraud_hold_active");
  }
  incr("framique_fraud_hold_total", { result: "clear" });
}

/** Honeypot trip on a public surface: recorded, counted, never surfaced to the bot. */
export async function recordHoneypotTrip(merchantId: string, surface: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as Client;
  incr("framique_fraud_honeypot_total", { surface });
  await db.from("fraud_audit").insert({
    merchant_id: merchantId,
    actor: null,
    action: "fraud.honeypot_tripped",
    payload: { surface } as never,
  });
}

export async function scanOrders(db: Client, merchantId: string, actor: string) {
  return withSpan("fraud.scan", async () => {
    await enforceRateLimit("fraud.scan", `${merchantId}:${actor}`);
    const rules = await cachedRules(db, merchantId);
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: orders } = await db
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("merchant_id", merchantId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(400);
    const rows = (orders ?? []) as OrderRow[];
    const { data: existing } = await db
      .from("fraud_cases")
      .select("order_id")
      .eq("merchant_id", merchantId);
    const seen = new Set((existing ?? []).map((c) => c.order_id));

    let created = 0;
    for (const order of rows) {
      if (seen.has(order.id)) continue;
      const { score, signals, action, decisiveCode } = scoreOrder(order, rows, rules);
      if (action === "allow") continue;
      const { data: inserted } = await db
        .from("fraud_cases")
        .insert({
          merchant_id: merchantId,
          order_id: order.id,
          order_number: order.order_number,
          customer_phone: order.customer_phone,
          amount_minor_int: order.total_minor_int,
          currency_code: order.currency_code,
          risk_score: score,
          signals: signals as never,
          reason: {
            rules: signals.map((s) => s.code),
            action,
            decisive: decisiveCode,
            engine: FRAUD_ENGINE_VERSION,
          } as never,
        })
        .select("id")
        .single();
      created += 1;
      incr("framique_fraud_case_total", { source: "scan" });
      await writeAudit(
        db,
        merchantId,
        actor,
        "fraud.flag_created",
        {
          order_number: order.order_number,
          risk_score: score,
          action,
          signals: signals.map((s) => s.code),
        },
        inserted?.id ?? null,
      );
    }
    return { created, scanned: rows.length };
  });
}
