/**
 * Deterministic, isomorphic fraud rule engine.
 *
 * Rules are evaluated in a fixed precedence order (lowest number first). The
 * first rule whose action is `block` short-circuits the decision; everything
 * else contributes an explainable, weighted signal to the score. No I/O here —
 * the server layer gathers the context so the engine stays unit-testable.
 */

export const FRAUD_ENGINE_VERSION = 2;

export type FraudAction = "allow" | "review" | "block";

export type RuleCode =
  | "BLACKLIST_MATCH"
  | "HONEYPOT_TRIP"
  | "BOT_BEACON"
  | "CARDTESTING"
  | "VELOCITY_LIMIT"
  | "COD_REFUSAL_HISTORY"
  | "ADDRESS_CLUSTER"
  | "NEW_DEVICE_HIGH_VALUE"
  | "COD_MAX_AMOUNT";

export type RuleDef = {
  code: RuleCode;
  title: string;
  hint: string;
  paramKey: string | null;
  paramLabel: string | null;
  /** Contribution to the 0-100 risk score when the rule fires. */
  weight: number;
  /** Lower runs first; the first firing `block` rule decides the outcome. */
  precedence: number;
  action: FraudAction;
  defaults: Record<string, number>;
};

export const RULE_CATALOG: RuleDef[] = [
  {
    code: "BLACKLIST_MATCH",
    title: "Blacklisted shopper",
    hint: "Phone or email is on the merchant blacklist. Blocks checkout outright.",
    paramKey: null,
    paramLabel: null,
    weight: 100,
    precedence: 10,
    action: "block",
    defaults: {},
  },
  {
    code: "HONEYPOT_TRIP",
    title: "Honeypot tripped",
    hint: "A hidden field that only automation fills was submitted.",
    paramKey: null,
    paramLabel: null,
    weight: 100,
    precedence: 20,
    action: "block",
    defaults: {},
  },
  {
    code: "BOT_BEACON",
    title: "Bot-like session",
    hint: "Beacon signals (no interaction, impossible timing, headless agent) exceed the tolerated bot score.",
    paramKey: "bot_score_max",
    paramLabel: "Maximum tolerated bot score (0-100)",
    weight: 60,
    precedence: 30,
    action: "review",
    defaults: { bot_score_max: 60 },
  },
  {
    code: "CARDTESTING",
    title: "Card testing",
    hint: "Repeated failed or abandoned payment attempts from the same shopper.",
    paramKey: "failed_attempts",
    paramLabel: "Failed attempts before flagging",
    weight: 45,
    precedence: 40,
    action: "review",
    defaults: { failed_attempts: 3 },
  },
  {
    code: "VELOCITY_LIMIT",
    title: "Order velocity",
    hint: "Too many orders from one phone within an hour.",
    paramKey: "orders_per_hour",
    paramLabel: "Orders per hour before flagging",
    weight: 40,
    precedence: 50,
    action: "review",
    defaults: { orders_per_hour: 3 },
  },
  {
    code: "COD_REFUSAL_HISTORY",
    title: "COD refusal history",
    hint: "Shopper has previously refused or returned cash-on-delivery parcels.",
    paramKey: "refusals",
    paramLabel: "Past COD refusals before flagging",
    weight: 50,
    precedence: 60,
    action: "review",
    defaults: { refusals: 2 },
  },
  {
    code: "ADDRESS_CLUSTER",
    title: "Address clustering",
    hint: "One delivery address used by several different phone numbers.",
    paramKey: "distinct_phones",
    paramLabel: "Distinct phones per address before flagging",
    weight: 35,
    precedence: 70,
    action: "review",
    defaults: { distinct_phones: 3 },
  },
  {
    code: "NEW_DEVICE_HIGH_VALUE",
    title: "New shopper, high value",
    hint: "First order from this shopper is unusually large.",
    paramKey: "high_value_minor_int",
    paramLabel: "High-value threshold (minor units)",
    weight: 35,
    precedence: 80,
    action: "review",
    defaults: { high_value_minor_int: 5_000_000 },
  },
  {
    code: "COD_MAX_AMOUNT",
    title: "COD over limit",
    hint: "Cash-on-delivery order above the merchant ceiling.",
    paramKey: "cod_max_minor_int",
    paramLabel: "Maximum COD amount (minor units)",
    weight: 30,
    precedence: 90,
    action: "review",
    defaults: { cod_max_minor_int: 2_000_000 },
  },
];

/** Score at or above which a case is treated as high risk in the desk UI. */
export const HIGH_RISK_THRESHOLD = 70;


export type RuleState = { code: string; enabled: boolean; params: unknown };

export type HistoryOrder = {
  phone: string;
  addressLine: string | null;
  createdAt: string;
  status: string;
  paymentMethod: string;
  totalMinorInt: number;
};

export type FraudContext = {
  amountMinorInt: number;
  paymentMethod: string;
  createdAt: string;
  phone: string;
  email?: string | null;
  addressLine?: string | null;
  history: HistoryOrder[];
  blacklisted?: boolean;
  honeypotTripped?: boolean;
  botScore?: number;
};

export type FraudSignal = {
  code: RuleCode;
  title: string;
  detail: string;
  weight: number;
  action: FraudAction;
  observed: number;
  threshold: number | null;
};

export type FraudAssessment = {
  version: number;
  score: number;
  action: FraudAction;
  decisiveCode: RuleCode | null;
  signals: FraudSignal[];
};

const FAILED_STATUSES = new Set(["payment_pending", "cancelled"]);
const REFUSAL_STATUSES = new Set(["cancelled", "refunded", "refund_requested"]);

export function ruleDef(code: RuleCode) {
  return RULE_CATALOG.find((r) => r.code === code)!;
}

export function defaultParams(): Record<string, Record<string, number>> {
  return Object.fromEntries(RULE_CATALOG.map((r) => [r.code, { ...r.defaults }]));
}

function param(rules: RuleState[], def: RuleDef): number | null {
  const row = rules.find((r) => r.code === def.code);
  if (row && !row.enabled) return null;
  if (!def.paramKey) return 0;
  const params = (row?.params ?? {}) as Record<string, unknown>;
  const raw = params[def.paramKey];
  const value = typeof raw === "number" ? raw : Number(raw ?? Number.NaN);
  return Number.isFinite(value) ? value : def.defaults[def.paramKey]!;
}

function normalisePhone(value: string) {
  return value.replace(/\D/g, "");
}

function normaliseAddress(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

type Evaluator = (ctx: FraudContext, threshold: number) => { observed: number; detail: string } | null;

const EVALUATORS: Record<RuleCode, Evaluator> = {
  BLACKLIST_MATCH: (ctx) =>
    ctx.blacklisted ? { observed: 1, detail: "Shopper matches an active blacklist entry" } : null,
  HONEYPOT_TRIP: (ctx) =>
    ctx.honeypotTripped ? { observed: 1, detail: "Hidden honeypot field was filled" } : null,
  BOT_BEACON: (ctx, threshold) => {
    const score = ctx.botScore ?? 0;
    return score > threshold
      ? { observed: score, detail: `Bot score ${score} above tolerance ${threshold}` }
      : null;
  },
  CARDTESTING: (ctx, threshold) => {
    const phone = normalisePhone(ctx.phone);
    const failed = ctx.history.filter(
      (o) => normalisePhone(o.phone) === phone && FAILED_STATUSES.has(o.status),
    ).length;
    return failed >= threshold
      ? { observed: failed, detail: `${failed} failed or abandoned payments on this phone` }
      : null;
  },
  VELOCITY_LIMIT: (ctx, threshold) => {
    const phone = normalisePhone(ctx.phone);
    const ts = Date.parse(ctx.createdAt);
    const recent = ctx.history.filter(
      (o) =>
        normalisePhone(o.phone) === phone &&
        Math.abs(Date.parse(o.createdAt) - ts) <= 3_600_000,
    ).length;
    return recent > threshold
      ? { observed: recent, detail: `${recent} orders from this phone within an hour` }
      : null;
  },
  COD_REFUSAL_HISTORY: (ctx, threshold) => {
    const phone = normalisePhone(ctx.phone);
    const refusals = ctx.history.filter(
      (o) =>
        normalisePhone(o.phone) === phone &&
        o.paymentMethod === "cod" &&
        REFUSAL_STATUSES.has(o.status),
    ).length;
    return refusals >= threshold
      ? { observed: refusals, detail: `${refusals} refused or returned COD parcels` }
      : null;
  },
  ADDRESS_CLUSTER: (ctx, threshold) => {
    const address = normaliseAddress(ctx.addressLine);
    if (!address) return null;
    const phones = new Set(
      ctx.history
        .filter((o) => normaliseAddress(o.addressLine) === address)
        .map((o) => normalisePhone(o.phone)),
    );
    phones.add(normalisePhone(ctx.phone));
    return phones.size >= threshold
      ? { observed: phones.size, detail: `${phones.size} distinct phones on this address` }
      : null;
  },
  NEW_DEVICE_HIGH_VALUE: (ctx, threshold) => {
    const phone = normalisePhone(ctx.phone);
    const ts = Date.parse(ctx.createdAt);
    const prior = ctx.history.filter(
      (o) => normalisePhone(o.phone) === phone && Date.parse(o.createdAt) < ts,
    ).length;
    return prior === 0 && ctx.amountMinorInt >= threshold
      ? { observed: ctx.amountMinorInt, detail: "First order from this shopper is high value" }
      : null;
  },
  COD_MAX_AMOUNT: (ctx, threshold) =>
    ctx.paymentMethod === "cod" && ctx.amountMinorInt > threshold
      ? { observed: ctx.amountMinorInt, detail: "COD amount above merchant ceiling" }
      : null,
};

/** Evaluate every enabled rule in precedence order and return an explainable verdict. */
export function assess(ctx: FraudContext, rules: RuleState[] = []): FraudAssessment {
  const signals: FraudSignal[] = [];
  let decisive: RuleCode | null = null;
  const ordered = [...RULE_CATALOG].sort((a, b) => a.precedence - b.precedence);

  for (const def of ordered) {
    const threshold = param(rules, def);
    if (threshold === null) continue;
    const hit = EVALUATORS[def.code](ctx, threshold);
    if (!hit) continue;
    signals.push({
      code: def.code,
      title: def.title,
      detail: hit.detail,
      weight: def.weight,
      action: def.action,
      observed: hit.observed,
      threshold: def.paramKey ? threshold : null,
    });
    if (def.action === "block" && !decisive) decisive = def.code;
    if (decisive) break;
  }

  const score = Math.min(
    100,
    signals.reduce((sum, s) => sum + s.weight, 0),
  );
  // Any firing review-rule holds the order; only a clean context passes straight through.
  const action: FraudAction = decisive
    ? "block"
    : signals.some((s) => s.action === "review")
      ? "review"
      : "allow";


  return { version: FRAUD_ENGINE_VERSION, score, action, decisiveCode: decisive, signals };
}

/**
 * Beacon heuristics → 0-100 bot score. Kept isomorphic so the storefront can
 * pre-compute and the server can recompute from the same inputs.
 */
export type BeaconInput = {
  userAgent?: string | null;
  interactions?: number;
  dwellMs?: number;
  pointerMoves?: number;
  timezoneOffsetMinutes?: number | null;
  webdriver?: boolean;
};

const BOT_AGENTS = /(bot|crawler|spider|headless|phantom|puppeteer|playwright|curl|wget|python-requests)/i;

export function botScore(input: BeaconInput): number {
  let score = 0;
  if (input.webdriver) score += 45;
  if (input.userAgent && BOT_AGENTS.test(input.userAgent)) score += 45;
  if (!input.userAgent) score += 20;
  if ((input.interactions ?? 0) === 0) score += 20;
  if ((input.pointerMoves ?? 0) === 0) score += 10;
  if ((input.dwellMs ?? 0) < 1500) score += 20;
  return Math.min(100, score);
}
