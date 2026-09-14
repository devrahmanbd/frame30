/**
 * Plan entitlements — pure domain (no I/O).
 *
 * The rule we hold ourselves to: **a limit must be visible before it bites.**
 * A merchant who hits a cap mid-sentence in the article editor and gets a red
 * "error" has been failed twice — once by the cap and once by us. So every
 * resource here carries a warn threshold, an upsell target and bilingual copy,
 * and the server enforces the same verdict the UI has already been showing.
 *
 * `cap = -1` means unlimited everywhere in this file and in the SQL snapshot.
 */
export const ENTITLEMENT_RESOURCES = [
  "articles",
  "media_bytes",
  "revision_retention",
  "gsc_properties",
  "health_scans",
  "products",
  "staff",
] as const;

export type EntitlementResource = (typeof ENTITLEMENT_RESOURCES)[number];

export type BillingPlanKey = "launch" | "growth" | "business" | "enterprise";

export const PLAN_LADDER: readonly BillingPlanKey[] = ["launch", "growth", "business", "enterprise"];

type ResourceMeta = {
  en: string;
  bn: string;
  unit: "count" | "bytes" | "per_day";
  /** Fraction of the cap at which the UI starts nudging. */
  warnAt: number;
  /** Whether exceeding blocks the write, or only warns and trims. */
  hard: boolean;
  upsellEn: string;
  upsellBn: string;
};

export const RESOURCE_META: Record<EntitlementResource, ResourceMeta> = {
  articles: {
    en: "Articles",
    bn: "আর্টিকেল",
    unit: "count",
    warnAt: 0.8,
    hard: true,
    upsellEn: "Upgrade to keep publishing — your existing articles stay online.",
    upsellBn: "প্রকাশ চালিয়ে যেতে আপগ্রেড করুন — আপনার বর্তমান আর্টিকেল অনলাইনেই থাকবে।",
  },
  media_bytes: {
    en: "Media storage",
    bn: "মিডিয়া স্টোরেজ",
    unit: "bytes",
    warnAt: 0.85,
    hard: true,
    upsellEn: "Upgrade for more storage. Nothing already uploaded is ever deleted on a limit.",
    upsellBn: "বেশি স্টোরেজের জন্য আপগ্রেড করুন। লিমিটের কারণে আপলোড করা কিছু কখনো মুছে ফেলা হয় না।",
  },
  revision_retention: {
    en: "Revision history",
    bn: "রিভিশন ইতিহাস",
    unit: "count",
    warnAt: 1,
    // Soft: older revisions are trimmed, the save still succeeds. Blocking a
    // save because of history depth would lose the merchant's actual work.
    hard: false,
    upsellEn: "Longer revision history is available on higher plans.",
    upsellBn: "উচ্চতর প্ল্যানে দীর্ঘ রিভিশন ইতিহাস পাওয়া যায়।",
  },
  gsc_properties: {
    en: "Search Console properties",
    bn: "সার্চ কনসোল প্রোপার্টি",
    unit: "count",
    warnAt: 1,
    hard: true,
    upsellEn: "Connect more verified properties on a higher plan.",
    upsellBn: "উচ্চতর প্ল্যানে আরও ভেরিফায়েড প্রোপার্টি যুক্ত করা যায়।",
  },
  health_scans: {
    en: "Content health scans (24h)",
    bn: "কনটেন্ট হেলথ স্ক্যান (২৪ ঘণ্টা)",
    unit: "per_day",
    warnAt: 0.75,
    hard: true,
    upsellEn: "Higher plans scan more often; the scheduled scan still runs on every plan.",
    upsellBn: "উচ্চতর প্ল্যানে বেশি বার স্ক্যান হয়; নির্ধারিত স্ক্যান সব প্ল্যানেই চলে।",
  },
  products: {
    en: "Products",
    bn: "প্রোডাক্ট",
    unit: "count",
    warnAt: 0.85,
    hard: true,
    upsellEn: "Upgrade to list more products.",
    upsellBn: "আরও প্রোডাক্ট যোগ করতে আপগ্রেড করুন।",
  },
  staff: {
    en: "Staff seats",
    bn: "স্টাফ সিট",
    unit: "count",
    warnAt: 0.9,
    hard: true,
    upsellEn: "Upgrade for more staff seats.",
    upsellBn: "আরও স্টাফ সিটের জন্য আপগ্রেড করুন।",
  },
};

export type ResourceUsage = { cap: number; used: number };

export type EntitlementSnapshot = {
  plan: BillingPlanKey;
  status: string;
  trialEndsAt: string | null;
  resources: Record<EntitlementResource, ResourceUsage>;
};

function num(value: unknown, fallback = 0) {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Normalises the `cms_entitlements()` jsonb into a typed shape. A missing
 * resource is reported as `cap: 0` rather than unlimited — failing open on a
 * commercial limit is how a free plan quietly becomes an unlimited plan.
 */
export function normalizeSnapshot(raw: unknown): EntitlementSnapshot {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const resourcesRaw = (obj["resources"] ?? {}) as Record<string, unknown>;
  const resources = {} as Record<EntitlementResource, ResourceUsage>;
  for (const key of ENTITLEMENT_RESOURCES) {
    const entry = (resourcesRaw[key] ?? {}) as Record<string, unknown>;
    resources[key] = { cap: num(entry["cap"], 0), used: num(entry["used"], 0) };
  }
  const plan = String(obj["plan"] ?? "launch");
  return {
    plan: (PLAN_LADDER as readonly string[]).includes(plan) ? (plan as BillingPlanKey) : "launch",
    status: String(obj["status"] ?? "none"),
    trialEndsAt: typeof obj["trial_ends_at"] === "string" ? (obj["trial_ends_at"] as string) : null,
    resources,
  };
}

export type EntitlementVerdict = {
  resource: EntitlementResource;
  allowed: boolean;
  unlimited: boolean;
  cap: number;
  used: number;
  requested: number;
  remaining: number;
  /** 0–100, clamped; `0` when unlimited. */
  percent: number;
  level: "ok" | "warn" | "block";
  hard: boolean;
  en: string;
  bn: string;
  upgradeTo: BillingPlanKey | null;
};

export function upgradeTarget(plan: BillingPlanKey): BillingPlanKey | null {
  const index = PLAN_LADDER.indexOf(plan);
  if (index < 0 || index === PLAN_LADDER.length - 1) return null;
  return PLAN_LADDER[index + 1] ?? null;
}

export function formatUsage(resource: EntitlementResource, value: number) {
  if (value < 0) return "∞";
  if (RESOURCE_META[resource].unit !== "bytes") return value.toLocaleString("en-US");
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

/**
 * The verdict for adding `requested` more of `resource`. `requested = 0` is the
 * read-only "where am I" question the dashboard asks.
 */
export function verdictFor(
  snapshot: EntitlementSnapshot,
  resource: EntitlementResource,
  requested = 1,
): EntitlementVerdict {
  const meta = RESOURCE_META[resource];
  const { cap, used } = snapshot.resources[resource] ?? { cap: 0, used: 0 };
  const unlimited = cap < 0;
  const projected = used + Math.max(0, requested);
  const remaining = unlimited ? Number.POSITIVE_INFINITY : Math.max(0, cap - used);
  const percent = unlimited || cap === 0 ? (unlimited ? 0 : 100) : Math.min(100, Math.round((used / cap) * 100));
  const over = !unlimited && projected > cap;
  const level: EntitlementVerdict["level"] = over
    ? meta.hard
      ? "block"
      : "warn"
    : !unlimited && percent >= Math.round(meta.warnAt * 100)
      ? "warn"
      : "ok";

  const capLabel = unlimited ? "∞" : formatUsage(resource, cap);
  const usedLabel = formatUsage(resource, used);
  const en = over
    ? `${meta.en}: ${usedLabel} of ${capLabel} used on the ${snapshot.plan} plan. ${meta.upsellEn}`
    : `${meta.en}: ${usedLabel} of ${capLabel} used.`;
  const bn = over
    ? `${meta.bn}: ${snapshot.plan} প্ল্যানে ${capLabel}-এর মধ্যে ${usedLabel} ব্যবহৃত। ${meta.upsellBn}`
    : `${meta.bn}: ${capLabel}-এর মধ্যে ${usedLabel} ব্যবহৃত।`;

  return {
    resource,
    allowed: !over || !meta.hard,
    unlimited,
    cap,
    used,
    requested,
    remaining: Number.isFinite(remaining) ? (remaining as number) : -1,
    percent,
    level,
    hard: meta.hard,
    en,
    bn,
    upgradeTo: over ? upgradeTarget(snapshot.plan) : null,
  };
}

/** Every resource at once, worst first — the shape the usage panel renders. */
export function usageReport(snapshot: EntitlementSnapshot): EntitlementVerdict[] {
  const order = { block: 0, warn: 1, ok: 2 } as const;
  return ENTITLEMENT_RESOURCES.map((r) => verdictFor(snapshot, r, 0)).sort(
    (a, b) => order[a.level] - order[b.level] || b.percent - a.percent,
  );
}

/**
 * Thrown by the server when a hard cap would be exceeded. The code is stable
 * (`plan_limit_exceeded`) so the client can render an upsell instead of a
 * stack-trace-shaped toast, and the message is machine-parsable on purpose.
 */
export class EntitlementError extends Error {
  readonly code = "plan_limit_exceeded";
  constructor(readonly verdict: EntitlementVerdict) {
    super(
      `plan_limit_exceeded|${verdict.resource}|${verdict.used}/${verdict.cap}|${verdict.upgradeTo ?? ""}|${verdict.en}|${verdict.bn}`,
    );
    this.name = "EntitlementError";
  }
}

/** Parses the wire message back into something the UI can render. */
export function parseEntitlementError(message: string) {
  if (!message.startsWith("plan_limit_exceeded|")) return null;
  const [, resource, ratio, upgradeTo, en, bn] = message.split("|");
  return {
    resource: (resource ?? "articles") as EntitlementResource,
    ratio: ratio ?? "",
    upgradeTo: (upgradeTo || null) as BillingPlanKey | null,
    en: en ?? "Plan limit reached",
    bn: bn ?? "প্ল্যান লিমিট শেষ",
  };
}

/** Revision trimming target: how many rows to keep for one article. */
export function revisionKeepCount(snapshot: EntitlementSnapshot) {
  const cap = snapshot.resources.revision_retention?.cap ?? 20;
  return cap < 0 ? 365 : Math.max(5, cap);
}