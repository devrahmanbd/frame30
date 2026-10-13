/**
 * Fraud Shield — fourth official plugin (source-backed, free).
 *
 * Pure layer: no network, no database, no React. The manifest below is the
 * registry source the official catalogue (`official-plugins.ts`) points at,
 * following the `store-analytics` pattern (authored data validated by the
 * same `parseManifest` + `validateBundle` gates the install pipeline runs,
 * so it can never describe a plugin the pipeline would refuse). The scorer
 * is the plugin's server hook surface as pure functions: the
 * `order.created` scoring entry (`scoreFraudShieldOrder`) plus the
 * `order.flagged` review-hold marker (`markOrderFlagged`). The caller
 * persists; nothing here writes.
 *
 * Why the manifest carries `hooks: []` (the existing builtin hook
 * pattern — every builtin manifest ships `hooks: []`): a manifest may not
 * invent hooks (`parseManifest` rejects `hooks:order.flagged` because
 * `SERVER_HOOKS` has no such event), and ANY `hooks[]` entry mandates a
 * public-https `hooksUrl` egress target (`parseManifest` → `hooksUrl` +
 * `isAllowedHooksUrl`). A pure in-repo detector must not claim an egress
 * endpoint, so the order.created / order.flagged surface lives as the pure
 * handlers below, invoked in-process by the host. The manifest already
 * grants `read_orders` — exactly the scope `HOOK_SCOPE` demands for
 * `order.created` — so a future manifest hook subscription would satisfy
 * the delivery gate with no permission change.
 */

export const FRAUD_SHIELD_MANIFEST = {
  id: "fraud-shield",
  name: "Fraud Shield",
  version: "1.0.0",
  api: "^3.0.0",
  // Detector-minimal permissions (each justified; nothing else granted):
  // - `read_orders` ... order totals, status and line items — the scorer's
  //   input (velocity history, COD amounts, failed payments), and the scope
  //   the `order.created` hook gate (`HOOK_SCOPE`) requires. Medium risk,
  //   no payment credentials (see the scope's consent effect).
  // - `read_shop` ..... read-only storefront data (name, currency, locale)
  //   for threshold display and detector copy. Low risk.
  // Deliberately ABSENT: every `write_*` scope (the scorer is pure — the
  // caller persists, so there is nothing to write with), `read_customers`
  // (no PII beyond the order-scoped phone/IP/device the event already
  // carries), `render_storefront` / `replace_menus` (no widgets — scoring
  // is server-side, no storefront UI), and any secrets/egress (no
  // `hooksUrl`, no credentials anywhere in this source).
  permissions: ["read_orders", "read_shop"],
  // No storefront UI: the detector scores server-side, so no widgets (and
  // therefore no `render_storefront` requirement).
  widgets: [],
  // No egress subscriptions (see header): the hook surface is pure handlers.
  hooks: [],
  settings: [
    {
      key: "velocity_window_minutes",
      label: "Order velocity window (minutes)",
      kind: "number",
      min: 5,
      max: 180,
      default: 60,
    },
    {
      key: "velocity_max_orders",
      label: "Orders in the window before flagging",
      kind: "number",
      min: 2,
      max: 20,
      default: 3,
    },
    {
      key: "cod_max_minor_int",
      label: "COD limit (minor units)",
      kind: "number",
      min: 100000,
      max: 50000000,
      default: 2000000,
    },
    {
      key: "high_value_minor_int",
      label: "New-customer high-value threshold (minor units)",
      kind: "number",
      min: 500000,
      max: 100000000,
      default: 5000000,
    },
    {
      key: "failed_payments_max",
      label: "Failed payments before flagging",
      kind: "number",
      min: 2,
      max: 10,
      default: 3,
    },
    {
      key: "review_threshold",
      label: "Risk score at or above which the order is held",
      kind: "number",
      min: 1,
      max: 100,
      default: 30,
    },
  ],
  i18n: {
    en: {
      velocity_window_minutes: "Velocity window (minutes)",
      velocity_max_orders: "Max orders in window",
      cod_max_minor_int: "COD limit",
      high_value_minor_int: "High-value threshold",
      failed_payments_max: "Failed payments allowed",
      review_threshold: "Review threshold",
    },
    bn: {
      velocity_window_minutes: "ভেলোসিটি সময়সীমা (মিনিট)",
      velocity_max_orders: "সীমায় সর্বোচ্চ অর্ডার",
      cod_max_minor_int: "COD সীমা",
      high_value_minor_int: "বড় অঙ্কের সীমা",
      failed_payments_max: "ব্যর্থ পেমেন্ট সীমা",
      review_threshold: "রিভিউ সীমা",
    },
  },
  budget: { jsKb: 20, mainThreadMs: 10 },
};

export const FRAUD_SHIELD_META = {
  nameEn: "Fraud Shield",
  nameBn: "ফ্রড শিল্ড",
  summaryEn:
    "Bot and fake-order detection that scores every order and holds risky ones for review — never auto-cancels.",
  summaryBn:
    "বট ও ভুয়া অর্ডার শনাক্তকরণ — প্রতিটি অর্ডার স্কোর করে ঝুঁকিপূর্ণ অর্ডার রিভিউয়ের জন্য আটকে রাখে, স্বয়ংক্রিয় বাতিল করে না।",
  category: "security",
} as const;

/* ------------------------------------------------- pure scorer
 *
 * Deterministic and isomorphic (same shape as `fraud-engine.ts`, no I/O):
 * the server layer gathers counts/history so the scorer stays unit-testable
 * and the merchant's settings map 1:1 onto `FraudShieldParams` (defaults
 * mirror the manifest settings above — `defaultFraudShieldParams` is pinned
 * against them by test).
 *
 * Cancel-never contract: the action type is `"allow" | "review"` — a silent
 * cancel is unrepresentable. The worst outcome is a review-hold with
 * reasons, which the caller persists (e.g. a fraud case) and a human
 * releases. This module never touches the network or the database.
 */

/** The only outcomes the scorer can produce — cancel is not a member. */
export type FraudShieldAction = "allow" | "review";

/**
 * Signal vocabulary. The first four reuse the existing fraud signal keys
 * (`src/lib/i18n-dict.ts`: `fraud.signal.velocity`,
 * `fraud.signal.card_testing`, `fraud.signal.new_customer_high_value`,
 * `fraud.signal.cod_over_limit`); `address_quality` extends the same
 * namespace for the structured-address check, which has no engine
 * counterpart (the engine's `ADDRESS_CLUSTER` is a distinct
 * many-phones-one-address signal).
 */
export type FraudShieldSignalCode =
  | "fraud.signal.velocity"
  | "fraud.signal.card_testing"
  | "fraud.signal.new_customer_high_value"
  | "fraud.signal.cod_over_limit"
  | "fraud.signal.address_quality";

export type FraudShieldReason = {
  signal: FraudShieldSignalCode;
  detail: string;
  weight: number;
  observed: number;
  threshold: number | null;
};

export type FraudShieldAssessment = {
  /** 0-100 risk score (summed weights, capped). */
  score: number;
  reasons: FraudShieldReason[];
  action: FraudShieldAction;
};

export type FraudShieldHistoryOrder = {
  phone?: string | null;
  ip?: string | null;
  deviceId?: string | null;
  createdAt: string;
};

export type FraudShieldAddress = {
  division?: string | null;
  district?: string | null;
  thana?: string | null;
} | null;

export type FraudShieldOrderInput = {
  phone?: string | null;
  ip?: string | null;
  deviceId?: string | null;
  paymentMethod: string;
  amountMinorInt: number;
  createdAt: string;
  address?: FraudShieldAddress;
  /** Caller-counted repeated failed/abandoned payment attempts. */
  failedPayments?: number;
  /** Caller-counted prior orders for this shopper (0 = new customer). */
  previousOrderCount?: number;
  history?: FraudShieldHistoryOrder[];
};

export type FraudShieldParams = {
  velocityWindowMinutes: number;
  velocityMaxOrders: number;
  codMaxMinorInt: number;
  highValueMinorInt: number;
  failedPaymentsMax: number;
  reviewThreshold: number;
};

/** Defaults mirror the manifest settings above (drift-pinned by test). */
export function defaultFraudShieldParams(): FraudShieldParams {
  return {
    velocityWindowMinutes: 60,
    velocityMaxOrders: 3,
    codMaxMinorInt: 2000000,
    highValueMinorInt: 5000000,
    failedPaymentsMax: 3,
    reviewThreshold: 30,
  };
}

/**
 * Merchant settings → scorer params. Each field falls back to its default
 * independently when missing or non-finite, so one bad setting can never
 * zero the whole detector.
 */
export function resolveFraudShieldParams(
  input?: Partial<FraudShieldParams> | null,
): FraudShieldParams {
  const defaults = defaultFraudShieldParams();
  const pick = (key: keyof FraudShieldParams): number => {
    const raw = (input ?? {})[key];
    return typeof raw === "number" && Number.isFinite(raw)
      ? raw
      : defaults[key];
  };
  return {
    velocityWindowMinutes: pick("velocityWindowMinutes"),
    velocityMaxOrders: pick("velocityMaxOrders"),
    codMaxMinorInt: pick("codMaxMinorInt"),
    highValueMinorInt: pick("highValueMinorInt"),
    failedPaymentsMax: pick("failedPaymentsMax"),
    reviewThreshold: pick("reviewThreshold"),
  };
}

/** Signal weights — aligned with the fraud-engine rule weights. */
const WEIGHTS: Record<FraudShieldSignalCode, number> = {
  "fraud.signal.velocity": 40,
  "fraud.signal.card_testing": 45,
  "fraud.signal.new_customer_high_value": 35,
  "fraud.signal.cod_over_limit": 30,
  "fraud.signal.address_quality": 20,
};

function normalisePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function normaliseToken(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function finiteAmount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

/**
 * `order.created` scoring entry. Pure: reads only its arguments, returns
 * `{ score, reasons, action }`. The caller persists the verdict (and opens
 * a review case on `review`); this function never writes, never cancels.
 */
export function scoreFraudShieldOrder(
  order: FraudShieldOrderInput,
  paramsInput?: Partial<FraudShieldParams> | null,
): FraudShieldAssessment {
  const params = resolveFraudShieldParams(paramsInput);
  const reasons: FraudShieldReason[] = [];
  const amount = finiteAmount(order.amountMinorInt);
  const paymentMethod = normaliseToken(order.paymentMethod);
  const orderTs = Date.parse(order.createdAt ?? "");

  // 1. Order velocity per phone/IP/device inside the configured window.
  // Past-only: at `order.created` time no future order can exist yet.
  if (Number.isFinite(orderTs)) {
    const windowMs = Math.max(1, params.velocityWindowMinutes) * 60_000;
    const phone = normalisePhone(order.phone);
    const ip = normaliseToken(order.ip);
    const device = normaliseToken(order.deviceId);
    const hasIdentity = phone !== "" || ip !== "" || device !== "";
    if (hasIdentity) {
      let matched = 0;
      for (const past of order.history ?? []) {
        const pastTs = Date.parse(past.createdAt ?? "");
        if (!Number.isFinite(pastTs)) continue;
        const age = orderTs - pastTs;
        if (age < 0 || age > windowMs) continue;
        const samePhone = phone !== "" && normalisePhone(past.phone) === phone;
        const sameIp = ip !== "" && normaliseToken(past.ip) === ip;
        const sameDevice =
          device !== "" && normaliseToken(past.deviceId) === device;
        if (samePhone || sameIp || sameDevice) matched += 1;
      }
      if (matched >= params.velocityMaxOrders) {
        reasons.push({
          signal: "fraud.signal.velocity",
          detail:
            params.velocityWindowMinutes === 60
              ? `${matched} orders in the last hour`
              : `${matched} orders in the last ${params.velocityWindowMinutes} minutes`,
          weight: WEIGHTS["fraud.signal.velocity"],
          observed: matched,
          threshold: params.velocityMaxOrders,
        });
      }
    }
  }

  // 2. Repeated failed-payment attempts (card-testing shape).
  const failed = finiteAmount(order.failedPayments);
  if (failed >= params.failedPaymentsMax) {
    reasons.push({
      signal: "fraud.signal.card_testing",
      detail: `${failed} failed payments`,
      weight: WEIGHTS["fraud.signal.card_testing"],
      observed: failed,
      threshold: params.failedPaymentsMax,
    });
  }

  // 3. New customer placing a high-value first order.
  const prior = finiteAmount(order.previousOrderCount);
  if (prior === 0 && amount >= params.highValueMinorInt) {
    reasons.push({
      signal: "fraud.signal.new_customer_high_value",
      detail: "New customer, high value order",
      weight: WEIGHTS["fraud.signal.new_customer_high_value"],
      observed: amount,
      threshold: params.highValueMinorInt,
    });
  }

  // 4. COD amount above the merchant ceiling (strictly above; at-limit is fine).
  if (paymentMethod === "cod" && amount > params.codMaxMinorInt) {
    reasons.push({
      signal: "fraud.signal.cod_over_limit",
      detail: "Above the COD limit",
      weight: WEIGHTS["fraud.signal.cod_over_limit"],
      observed: amount,
      threshold: params.codMaxMinorInt,
    });
  }

  // 5. Address quality: structured division → district → thana present?
  const address = order.address ?? null;
  const present = [
    ["division", address?.division],
    ["district", address?.district],
    ["thana", address?.thana],
  ].filter(([, v]) => normaliseToken(v).length > 0).length;
  if (present < 3) {
    const missing = (
      [
        ["division", address?.division],
        ["district", address?.district],
        ["thana", address?.thana],
      ] as const
    )
      .filter(([, v]) => normaliseToken(v).length === 0)
      .map(([level]) => level)
      .join(", ");
    reasons.push({
      signal: "fraud.signal.address_quality",
      detail: `Incomplete delivery address: missing ${missing}`,
      weight: WEIGHTS["fraud.signal.address_quality"],
      observed: present,
      threshold: 3,
    });
  }

  const score = Math.min(
    100,
    reasons.reduce((sum, r) => sum + r.weight, 0),
  );
  // Boundary is inclusive at the bar: score >= threshold holds for review.
  // The false branch is the ONLY other outcome — cancel is unrepresentable.
  const action: FraudShieldAction =
    score >= params.reviewThreshold ? "review" : "allow";
  return { score, reasons, action };
}

export type FraudShieldOrderRef = {
  orderId: string;
  orderNumber: string;
};

export type FraudShieldHold = {
  held: boolean;
  orderId: string;
  orderNumber: string;
  action: FraudShieldAction;
  score: number;
  reasons: FraudShieldReason[];
  /** Caller-supplied clock (kept as a parameter so the marker stays pure). */
  flaggedAt: string;
};

/**
 * `order.flagged` review-hold marker. Pure payload construction for the
 * caller to persist (e.g. a fraud case row blocking fulfilment until human
 * review): a `review` assessment becomes a hold, an `allow` assessment
 * becomes an explicit no-hold. Neither branch can produce a cancel — the
 * action type forbids it.
 */
export function markOrderFlagged(
  order: FraudShieldOrderRef,
  assessment: FraudShieldAssessment,
  flaggedAt: string,
): FraudShieldHold {
  return {
    held: assessment.action === "review",
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    action: assessment.action,
    score: assessment.score,
    reasons: assessment.reasons,
    flaggedAt,
  };
}
