/**
 * Marketplace ecosystem — pure rules shared by the vault, the consent screen
 * and the sandbox host.
 *
 * Nothing here touches the network or the database: scope semantics, semver
 * ordering, canonical hashing input and the widget message protocol are all
 * decidable from their arguments, so they are unit-testable and identical on
 * both sides of the sandbox boundary.
 */

export type ScopeRisk = "low" | "medium" | "high";

export type ScopeDef = {
  id: string;
  en: string;
  bn: string;
  risk: ScopeRisk;
  /** Plain-language consequence shown on the consent screen. */
  effectEn: string;
  effectBn: string;
};

/** The complete permission vocabulary. A manifest may not invent scopes. */
export const SCOPES: readonly ScopeDef[] = [
  {
    id: "read_shop",
    en: "Read store profile",
    bn: "স্টোর প্রোফাইল পড়া",
    risk: "low",
    effectEn: "Store name, currency, locale and theme tokens.",
    effectBn: "স্টোরের নাম, মুদ্রা, ভাষা ও থিম টোকেন।",
  },
  {
    id: "read_products",
    en: "Read products",
    bn: "পণ্য পড়া",
    risk: "low",
    effectEn: "Published catalog, variants, prices and stock badges.",
    effectBn: "প্রকাশিত ক্যাটালগ, ভ্যারিয়েন্ট, দাম ও স্টক ব্যাজ।",
  },
  {
    id: "write_products",
    en: "Edit products",
    bn: "পণ্য সম্পাদনা",
    risk: "high",
    effectEn: "Can change prices, stock and publish state of your catalog.",
    effectBn: "দাম, স্টক ও প্রকাশ অবস্থা বদলাতে পারবে।",
  },
  {
    id: "read_orders",
    en: "Read orders",
    bn: "অর্ডার পড়া",
    risk: "medium",
    effectEn: "Order totals, status and line items (no payment credentials).",
    effectBn: "অর্ডার মোট, অবস্থা ও আইটেম (পেমেন্ট ক্রেডেনশিয়াল নয়)।",
  },
  {
    id: "read_customers",
    en: "Read customer contacts",
    bn: "কাস্টমার যোগাযোগ পড়া",
    risk: "high",
    effectEn: "Names, phone numbers and addresses — personal data.",
    effectBn: "নাম, ফোন ও ঠিকানা — ব্যক্তিগত তথ্য।",
  },
  {
    id: "write_cart",
    en: "Modify the cart",
    bn: "কার্ট পরিবর্তন",
    risk: "medium",
    effectEn: "Add or remove storefront cart lines on the shopper's behalf.",
    effectBn: "ক্রেতার হয়ে কার্টে আইটেম যোগ/বাদ দিতে পারবে।",
  },
  {
    id: "write_analytics",
    en: "Send analytics events",
    bn: "অ্যানালিটিক্স ইভেন্ট পাঠানো",
    risk: "low",
    effectEn: "Emits PII-minimal storefront events into your pipeline.",
    effectBn: "PII-মুক্ত স্টোরফ্রন্ট ইভেন্ট পাঠাবে।",
  },
  {
    id: "render_storefront",
    en: "Render on the storefront",
    bn: "স্টোরফ্রন্টে রেন্ডার",
    risk: "medium",
    effectEn: "Mounts sandboxed UI inside your published theme.",
    effectBn: "আপনার থিমে স্যান্ডবক্সড UI বসাবে।",
  },
] as const;

const SCOPE_IDS = new Set(SCOPES.map((s) => s.id));

export function scopeDef(id: string): ScopeDef | null {
  return SCOPES.find((s) => s.id === id) ?? null;
}

/** Unknown scopes are rejected, duplicates collapsed, order made stable. */
export function normalizeScopes(input: unknown): { scopes: string[]; unknown: string[] } {
  const raw = Array.isArray(input) ? input.map((s) => String(s).trim().toLowerCase()) : [];
  const known: string[] = [];
  const bad: string[] = [];
  for (const s of raw) {
    if (!s) continue;
    if (SCOPE_IDS.has(s)) {
      if (!known.includes(s)) known.push(s);
    } else if (!bad.includes(s)) bad.push(s);
  }
  return { scopes: known.sort(), unknown: bad };
}

export function highestRisk(scopes: readonly string[]): ScopeRisk {
  let risk: ScopeRisk = "low";
  for (const s of scopes) {
    const d = scopeDef(s);
    if (!d) continue;
    if (d.risk === "high") return "high";
    if (d.risk === "medium") risk = "medium";
  }
  return risk;
}

/** Scopes the listing asks for that the merchant has not granted yet. */
export function missingScopes(required: readonly string[], granted: readonly string[]) {
  return required.filter((s) => !granted.includes(s));
}

// ---------------------------------------------------------------- semver

export type Semver = { major: number; minor: number; patch: number };

export function parseSemver(input: string): Semver | null {
  const m = /^(\d{1,5})\.(\d{1,5})\.(\d{1,5})$/.exec(input.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  return pa.major - pb.major || pa.minor - pb.minor || pa.patch - pb.patch;
}

/** A new submission must move strictly forward from the latest known version. */
export function isForwardVersion(next: string, latest: string | null): boolean {
  if (!parseSemver(next)) return false;
  if (!latest) return true;
  return compareSemver(next, latest) > 0;
}

/** A major bump is the only place breaking scope additions are allowed. */
export function isBreakingChange(next: string, latest: string | null): boolean {
  const pn = parseSemver(next);
  const pl = latest ? parseSemver(latest) : null;
  if (!pn || !pl) return false;
  return pn.major > pl.major;
}

// ---------------------------------------------------- content addressing

/** Stable key ordering so the same bundle always hashes to the same digest. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const body = Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",");
  return `{${body}}`;
}

export const MAX_BUNDLE_BYTES = 512 * 1024;

export type BundleVerdict = {
  ok: boolean;
  bytes: number;
  errors: string[];
};

/** Structural gate applied before anything is written to the vault. */
export function validateBundle(source: unknown, scopes: readonly string[]): BundleVerdict {
  const errors: string[] = [];
  const canonical = canonicalJson(source ?? {});
  const bytes = new TextEncoder().encode(canonical).length;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    errors.push("bundle.not_object");
  }
  if (bytes > MAX_BUNDLE_BYTES) errors.push("bundle.too_large");
  if (bytes <= 2) errors.push("bundle.empty");

  const entry = (source as { entry?: unknown } | null)?.entry;
  if (entry !== undefined && typeof entry !== "string") errors.push("bundle.entry_not_string");
  if (typeof entry === "string" && entry.length > 200_000) errors.push("bundle.entry_too_large");
  if (typeof entry === "string" && /\bimport\s*\(|eval\s*\(|new\s+Function/.test(entry)) {
    errors.push("bundle.dynamic_code");
  }
  if (scopes.length === 0) errors.push("bundle.no_scopes");

  return { ok: errors.length === 0, bytes, errors };
}

export function isBlockKey(key: string) {
  return /^[a-z][a-z0-9-]{1,39}$/.test(key);
}

export const BLOCK_TARGETS = ["header", "body", "product", "cart", "footer"] as const;
export type BlockTarget = (typeof BLOCK_TARGETS)[number];

export function isBlockTarget(v: string): v is BlockTarget {
  return (BLOCK_TARGETS as readonly string[]).includes(v);
}

// ------------------------------------------------------------ widget API

/** Third-party bundles may only call these methods, each behind one scope. */
export const WIDGET_API: Record<string, { scope: string; write: boolean }> = {
  "shop.info": { scope: "read_shop", write: false },
  "products.list": { scope: "read_products", write: false },
  "products.update": { scope: "write_products", write: true },
  "orders.list": { scope: "read_orders", write: false },
  "customers.get": { scope: "read_customers", write: false },
  "cart.add": { scope: "write_cart", write: true },
  "cart.remove": { scope: "write_cart", write: true },
  "analytics.track": { scope: "write_analytics", write: true },
};

export type WidgetCall = { v: 1; id: string; method: string; params?: unknown };

export type WidgetVerdict =
  | { allowed: true; method: string; write: boolean }
  | { allowed: false; reason: "malformed" | "unknown_method" | "scope_denied"; method?: string };

/** The single decision point the sandbox host consults for every message. */
export function authorizeWidgetCall(msg: unknown, granted: readonly string[]): WidgetVerdict {
  const m = msg as Partial<WidgetCall> | null;
  if (!m || m.v !== 1 || typeof m.id !== "string" || typeof m.method !== "string") {
    return { allowed: false, reason: "malformed" };
  }
  const def = WIDGET_API[m.method];
  if (!def) return { allowed: false, reason: "unknown_method", method: m.method };
  if (!granted.includes(def.scope)) return { allowed: false, reason: "scope_denied", method: m.method };
  return { allowed: true, method: m.method, write: def.write };
}
