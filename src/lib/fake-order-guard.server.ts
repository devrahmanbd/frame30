/**
 * Post-order fake/bot order guard.
 *
 * Scores an order AFTER it has been committed (insert succeeded, money path
 * settled) so merchants can spot fake, bot-driven, or abusive COD orders
 * without ever risking legitimate revenue.
 *
 * PRECEDENCE (explicit, load-bearing): commerce continuity beats detection.
 *   1. The guard NEVER voids, charges, refunds, cancels, or blocks an order.
 *      The only dispositions are `allow` and `review` — `review` means "flag
 *      for a human in the fraud desk", never "stop fulfilment silently".
 *   2. Evaluation is fail-open: ANY exception inside `evaluateOrderForFraud`
 *      (DB hiccup, malformed row, missing rule path) is swallowed after
 *      emitting a loud `framique_fake_order_guard_total{outcome="error"}`
 *      metric, and resolves to `allow`. A broken detector must never break
 *      checkout.
 *   3. Case opening stays owned by the pre-order rail (`recordOrderVerdict`
 *      in `fraud.server.ts`). This guard persists its signal through the
 *      EXISTING `writeAudit` path and metrics only, so a post-order review
 *      can never double-open a case or double-count against the same order.
 *
 * Relationship to neighbours (read before modifying):
 *   - `fraud.server.ts` owns rule evaluation and the
 *     `framique_fraud_rule_hits_total` metric. This module calls `writeAudit`
 *     (it never duplicates the audit SQL) and re-emits the same rule-hit
 *     metric with the closest existing `RuleCode` per reason, so dashboards
 *     keep working.
 *   - `risk-tier.ts` `resolveTierFromSignals` consumes `{ fraudScore,
 *     botScore, abuseFlags }`. This module OUTPUTS exactly those three
 *     numbers and never reimplements tier resolution.
 *   - `orders.server.ts` invokes `evaluateOrderForFraud` after successful
 *     order creation inside a bounded cap (mirroring the 2s email cap), and
 *     threads the disposition into the `order:paid` analytics payload.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { incr, log } from "./observability.server";

type Client = SupabaseClient<Database>;

/* ------------------------------------------------------------------ */
/* Thresholds (exported, documented defaults). Tune per merchant later; */
/* the scorer takes them as constants so tests pin the boundaries.     */
/* ------------------------------------------------------------------ */

/** Velocity window: orders from one identity inside this span count together. Default 1h. */
export const FAKE_ORDER_VELOCITY_WINDOW_MS = 3_600_000;
/** Orders per phone inside the window before flagging. Default 3 (strict `>`, so the 4th prior trips). Mirrors VELOCITY_LIMIT. */
export const FAKE_ORDER_VELOCITY_MAX_PER_PHONE = 3;
/** Orders per IP inside the window before flagging. Default 5. Skipped entirely when no IP is present. */
export const FAKE_ORDER_VELOCITY_MAX_PER_IP = 5;
/** COD ceiling in minor units. Default 2,000,000 (strict `>`, boundary stays allow). Mirrors COD_MAX_AMOUNT. */
export const FAKE_ORDER_COD_MAX_MINOR_INT = 2_000_000;
/** First-order value that counts as "high value" in minor units. Default 5,000,000 (`>=` trips). Mirrors NEW_DEVICE_HIGH_VALUE. */
export const FAKE_ORDER_NEW_CUSTOMER_HIGH_VALUE_MINOR_INT = 5_000_000;
/** Addresses shorter than this (trimmed chars) count as poor quality. Default 8. Alone it never reviews (weight < threshold). */
export const FAKE_ORDER_MIN_ADDRESS_LENGTH = 8;
/** Distinct phones sharing one normalised address before clustering flags. Default 3 (includes the order itself). Mirrors ADDRESS_CLUSTER. */
export const FAKE_ORDER_ADDRESS_CLUSTER_MIN_PHONES = 3;
/** Failed/abandoned payments on one phone before the streak flags. Default 3 (`>=` trips). Mirrors CARDTESTING. */
export const FAKE_ORDER_FAILED_STREAK_THRESHOLD = 3;
/** Upper bound on history rows read per evaluation. Keeps the wrapper a cheap, bounded read. Default 100. */
export const FAKE_ORDER_HISTORY_LIMIT = 100;
/**
 * Review threshold on the 0-100 fraud score (`>=` reviews). Default 30: any
 * single substantive signal (the smallest is COD-over-limit at 30) holds for
 * review, while a lone poor address (25) stays allow. Raise to require
 * corroboration.
 */
export const FAKE_ORDER_REVIEW_SCORE_THRESHOLD = 30;
/** Advisory cap for the post-create hook in `orders.server.ts`. Mirrors the 2s email cap. Default 2000ms. */
export const FAKE_ORDER_GUARD_CAP_MS = 2000;

/* Signal weights (sum capped at 100; mirrors fraud-engine magnitudes). */
export const FAKE_ORDER_WEIGHT_VELOCITY_PHONE = 40;
export const FAKE_ORDER_WEIGHT_VELOCITY_IP = 35;
export const FAKE_ORDER_WEIGHT_COD_OVER_LIMIT = 30;
export const FAKE_ORDER_WEIGHT_NEW_CUSTOMER_HIGH_VALUE = 35;
export const FAKE_ORDER_WEIGHT_ADDRESS_QUALITY = 25;
export const FAKE_ORDER_WEIGHT_ADDRESS_CLUSTER = 35;
export const FAKE_ORDER_WEIGHT_FAILED_STREAK = 45;

/** Statuses that count as failed/abandoned for the streak signal. Mirrors fraud-engine FAILED_STATUSES. */
const FAILED_STATUSES = new Set(["payment_pending", "cancelled"]);

export type FakeOrderDisposition = "allow" | "review";

export type FakeOrderReason =
  | "velocity_phone"
  | "velocity_ip"
  | "cod_over_limit"
  | "new_customer_high_value"
  | "address_quality"
  | "address_cluster"
  | "failed_payment_streak";

export type FakeOrderInput = {
  phone: string;
  /** Optional: velocity-per-IP is skipped when absent (orders carry no IP column). */
  ip?: string | null;
  addressLine?: string | null;
  totalMinorInt: number;
  paymentMethod: string;
  createdAt: string;
};

export type FakeOrderHistoryRow = {
  phone: string;
  ip?: string | null;
  addressLine?: string | null;
  createdAt: string;
  status: string;
  paymentMethod?: string | null;
  totalMinorInt?: number | null;
};

export type FakeOrderContext = {
  /**
   * Prior orders to score against. MUST exclude the order under scoring and
   * MUST already be bounded by the caller — the scorer performs no I/O.
   */
  history: FakeOrderHistoryRow[];
  /** Optional beacon-derived bot hint (0-100); defaults to 0 when unknown. */
  botScoreHint?: number | null;
  /**
   * Optional explicit new-customer flag. When omitted it is derived from
   * history (no prior row with the same phone before the order). Callers
   * with a truncated window should pass `false` when unsure so a returning
   * shopper is never misflagged as new.
   */
  isNewCustomer?: boolean | null;
};

export type FakeOrderVerdict = {
  fraudScore: number;
  botScore: number;
  abuseFlags: number;
  reasons: FakeOrderReason[];
  disposition: FakeOrderDisposition;
};

function normalisePhone(value: string) {
  return (value ?? "").replace(/\D/g, "");
}

function normaliseAddress(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Pure post-order scorer: no DB, no clock, no randomness. Deterministic for
 * the same input. Disposition is `review` at or above
 * FAKE_ORDER_REVIEW_SCORE_THRESHOLD, else `allow` — it can never be
 * cancel/block/void.
 */
export function scoreFakeOrder(
  order: FakeOrderInput,
  context: FakeOrderContext,
): FakeOrderVerdict {
  const reasons: FakeOrderReason[] = [];
  let score = 0;

  const history = context.history ?? [];
  const orderTs = Date.parse(order.createdAt);
  const orderPhone = normalisePhone(order.phone);
  const inWindow = (createdAt: string) => {
    if (!Number.isFinite(orderTs)) return false;
    const ts = Date.parse(createdAt);
    if (!Number.isFinite(ts)) return false;
    return Math.abs(ts - orderTs) <= FAKE_ORDER_VELOCITY_WINDOW_MS;
  };

  // 1. Velocity per phone (strict `>`: exactly MAX priors stays allow).
  if (orderPhone) {
    const phoneHits = history.filter(
      (h) => normalisePhone(h.phone) === orderPhone && inWindow(h.createdAt),
    ).length;
    if (phoneHits > FAKE_ORDER_VELOCITY_MAX_PER_PHONE) {
      reasons.push("velocity_phone");
      score += FAKE_ORDER_WEIGHT_VELOCITY_PHONE;
    }
  }

  // 2. Velocity per IP — skipped when either side has no IP (never flag on missing data).
  const orderIp = (order.ip ?? "").trim().toLowerCase();
  if (orderIp) {
    const ipHits = history.filter(
      (h) =>
        (h.ip ?? "").trim().toLowerCase() === orderIp && inWindow(h.createdAt),
    ).length;
    if (ipHits > FAKE_ORDER_VELOCITY_MAX_PER_IP) {
      reasons.push("velocity_ip");
      score += FAKE_ORDER_WEIGHT_VELOCITY_IP;
    }
  }

  // 3. COD over limit (strict `>`: exactly at the ceiling stays allow).
  if (
    order.paymentMethod === "cod" &&
    order.totalMinorInt > FAKE_ORDER_COD_MAX_MINOR_INT
  ) {
    reasons.push("cod_over_limit");
    score += FAKE_ORDER_WEIGHT_COD_OVER_LIMIT;
  }

  // 4. New-customer high value (`>=` trips on the boundary).
  const explicitNew = context.isNewCustomer;
  const derivedNew =
    orderPhone.length > 0 &&
    !history.some(
      (h) =>
        normalisePhone(h.phone) === orderPhone &&
        Number.isFinite(Date.parse(h.createdAt)) &&
        Number.isFinite(orderTs) &&
        Date.parse(h.createdAt) < orderTs,
    );
  const isNew = explicitNew ?? derivedNew;
  if (
    isNew &&
    order.totalMinorInt >= FAKE_ORDER_NEW_CUSTOMER_HIGH_VALUE_MINOR_INT
  ) {
    reasons.push("new_customer_high_value");
    score += FAKE_ORDER_WEIGHT_NEW_CUSTOMER_HIGH_VALUE;
  }

  // 5. Address quality: missing or too short. Weight 25 < threshold 30, so a
  // lone poor address stays allow and needs corroboration to review.
  const address = (order.addressLine ?? "").trim();
  const addressPoor = address.length < FAKE_ORDER_MIN_ADDRESS_LENGTH;
  if (addressPoor) {
    reasons.push("address_quality");
    score += FAKE_ORDER_WEIGHT_ADDRESS_QUALITY;
  }

  // 6. Address cluster: one normalised address across distinct phones.
  const normalised = normaliseAddress(order.addressLine);
  if (normalised) {
    const phones = new Set<string>();
    for (const h of history) {
      if (normaliseAddress(h.addressLine) === normalised) {
        const digits = normalisePhone(h.phone);
        if (digits) phones.add(digits);
      }
    }
    if (orderPhone) phones.add(orderPhone);
    if (phones.size >= FAKE_ORDER_ADDRESS_CLUSTER_MIN_PHONES) {
      reasons.push("address_cluster");
      score += FAKE_ORDER_WEIGHT_ADDRESS_CLUSTER;
    }
  }

  // 7. Failed-payment streak on this phone (`>=` trips on the boundary).
  if (orderPhone) {
    const failed = history.filter(
      (h) =>
        normalisePhone(h.phone) === orderPhone && FAILED_STATUSES.has(h.status),
    ).length;
    if (failed >= FAKE_ORDER_FAILED_STREAK_THRESHOLD) {
      reasons.push("failed_payment_streak");
      score += FAKE_ORDER_WEIGHT_FAILED_STREAK;
    }
  }

  const fraudScore = Math.min(100, score);

  // Bot score: automation-correlated signals only. A poor address alone stays
  // low (25, below the risk-tier 60 medium gate); velocity is the bot tell.
  let botScore = clampScore(context.botScoreHint ?? 0);
  const velocityHit =
    reasons.includes("velocity_phone") || reasons.includes("velocity_ip");
  if (reasons.includes("velocity_phone")) botScore = Math.max(botScore, 70);
  else if (reasons.includes("velocity_ip")) botScore = Math.max(botScore, 65);
  if (reasons.includes("failed_payment_streak"))
    botScore = Math.max(botScore, 50);
  if (
    reasons.includes("address_quality") ||
    reasons.includes("address_cluster")
  ) {
    botScore = velocityHit
      ? Math.min(100, botScore + 10)
      : Math.max(botScore, 25);
  }

  return {
    fraudScore,
    botScore,
    abuseFlags: reasons.length,
    reasons,
    disposition:
      fraudScore >= FAKE_ORDER_REVIEW_SCORE_THRESHOLD ? "review" : "allow",
  };
}

/* ------------------------------------------------------------------ */
/* Impure wrapper                                                      */
/* ------------------------------------------------------------------ */

export type GuardOrderRef = {
  merchantId: string;
  orderId: string;
  orderNumber?: string | null;
  phone: string;
  ip?: string | null;
  addressLine?: string | null;
  totalMinorInt: number;
  paymentMethod: string;
  createdAt?: string | null;
  botScoreHint?: number | null;
  isNewCustomer?: boolean | null;
};

/** Closest existing RuleCode per guard reason, for the shared rule-hit metric. */
const REASON_RULE: Record<FakeOrderReason, string> = {
  velocity_phone: "VELOCITY_LIMIT",
  velocity_ip: "VELOCITY_LIMIT",
  cod_over_limit: "COD_MAX_AMOUNT",
  new_customer_high_value: "NEW_DEVICE_HIGH_VALUE",
  address_quality: "ADDRESS_CLUSTER",
  address_cluster: "ADDRESS_CLUSTER",
  failed_payment_streak: "CARDTESTING",
};

const FAIL_OPEN: FakeOrderVerdict = {
  fraudScore: 0,
  botScore: 0,
  abuseFlags: 0,
  reasons: [],
  disposition: "allow",
};

async function evaluateInner(
  db: Client,
  order: GuardOrderRef,
): Promise<FakeOrderVerdict> {
  const nowIso = order.createdAt ?? new Date().toISOString();
  const since = new Date(Date.parse(nowIso) - 30 * 86_400_000).toISOString();

  // Bounded reads: one recent window, hard limit, newest first. Never a scan.
  const { data } = await db
    .from("orders")
    .select(
      "id, customer_phone, address_line, total_minor_int, payment_method, status, created_at",
    )
    .eq("merchant_id", order.merchantId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(FAKE_ORDER_HISTORY_LIMIT);

  const rows = (
    (data ?? []) as unknown as {
      id?: string;
      customer_phone?: string | null;
      address_line?: string | null;
      total_minor_int?: number | null;
      payment_method?: string | null;
      status?: string | null;
      created_at?: string | null;
    }[]
  ).filter((r) => r.id !== order.orderId);

  // Truncated-window guard: when the read hits the limit we cannot know the
  // shopper is new, so never assert newness (fail toward allow, protecting
  // legitimate revenue from a bounded-read artefact).
  const windowTruncated = rows.length >= FAKE_ORDER_HISTORY_LIMIT;
  const history: FakeOrderHistoryRow[] = rows.map((r) => ({
    phone: r.customer_phone ?? "",
    ip: null,
    addressLine: r.address_line ?? null,
    createdAt: r.created_at ?? nowIso,
    status: r.status ?? "",
    paymentMethod: r.payment_method ?? null,
    totalMinorInt: r.total_minor_int ?? null,
  }));

  const verdict = scoreFakeOrder(
    {
      phone: order.phone,
      ip: order.ip ?? null,
      addressLine: order.addressLine ?? null,
      totalMinorInt: order.totalMinorInt,
      paymentMethod: order.paymentMethod,
      createdAt: nowIso,
    },
    {
      history,
      botScoreHint: order.botScoreHint ?? null,
      isNewCustomer: order.isNewCustomer ?? (windowTruncated ? false : null),
    },
  );

  // Shared rule-hit series (same name fraud.server emits); one increment per
  // distinct rule so guard traffic stays comparable on existing dashboards.
  for (const rule of new Set(verdict.reasons.map((r) => REASON_RULE[r]))) {
    incr("framique_fraud_rule_hits_total", { rule });
  }
  incr("framique_fake_order_guard_total", {
    outcome: "scored",
    disposition: verdict.disposition,
  });

  // Persist via the EXISTING fraud.server rule path — never raw SQL here.
  const { writeAudit } = await import("./fraud.server");
  await writeAudit(
    db,
    order.merchantId,
    "fake-order-guard",
    "fraud.guard_scored",
    {
      order_id: order.orderId,
      order_number: order.orderNumber ?? null,
      disposition: verdict.disposition,
      fraud_score: verdict.fraudScore,
      bot_score: verdict.botScore,
      abuse_flags: verdict.abuseFlags,
      reasons: verdict.reasons,
    },
    null,
  );

  if (verdict.disposition === "review") {
    log("warn", "fake_order_guard.review", {
      merchantId: order.merchantId,
      orderId: order.orderId,
      fraudScore: verdict.fraudScore,
      reasons: verdict.reasons.join(","),
    });
  }
  return verdict;
}

/**
 * Post-order evaluation. Fail-open by contract: any exception resolves to
 * `allow` with a loud error metric — commerce continuity beats detection.
 * Never throws.
 */
export async function evaluateOrderForFraud(
  db: Client,
  order: GuardOrderRef,
): Promise<FakeOrderVerdict> {
  try {
    return await evaluateInner(db, order);
  } catch (err) {
    incr("framique_fake_order_guard_total", { outcome: "error" });
    log("warn", "fake_order_guard.failed_open", {
      merchantId: order.merchantId,
      orderId: order.orderId,
      reason: String((err as Error)?.message ?? err).slice(0, 160),
    });
    return { ...FAIL_OPEN, reasons: [] };
  }
}
