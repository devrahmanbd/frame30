/**
 * Developer-platform scope algebra (pure, unit-tested).
 *
 * One catalogue drives three surfaces: the OAuth consent screen, the API-key
 * editor and the REST authorizer. Keeping it pure means the authorization
 * decision is testable without a database and identical in every caller —
 * a scope can never mean one thing on the consent screen and another at the
 * gateway.
 *
 * Two rules are enforced here and nowhere else:
 *   1. An app's effective scopes are the *intersection* of what it asked for
 *      and what its client registration allows. Nothing widens a grant.
 *   2. A `.write` scope never implies `.read` of a different resource; the
 *      only implication is `x.write ⇒ x.read` on the same resource.
 */

export const SCOPES = [
  "orders.read",
  "orders.write",
  "products.read",
  "products.write",
  "customers.read",
  "analytics.read",
  "exports.read",
  "exports.write",
  "webhooks.read",
  "webhooks.write",
  "themes.read",
  "themes.write",
] as const;

export type Scope = (typeof SCOPES)[number];

export type ScopeInfo = {
  scope: Scope;
  /** Plain-language explanation shown on the consent screen. */
  en: string;
  bn: string;
  /** True when the scope can read personally identifiable customer data. */
  pii: boolean;
  /** True when the scope can change tenant state. */
  mutating: boolean;
};

export const SCOPE_CATALOG: ScopeInfo[] = [
  { scope: "orders.read", en: "Read orders and their totals", bn: "অর্ডার ও মোট মূল্য দেখা", pii: true, mutating: false },
  { scope: "orders.write", en: "Add notes and tags to orders", bn: "অর্ডারে নোট ও ট্যাগ যোগ", pii: true, mutating: true },
  { scope: "products.read", en: "Read the catalogue", bn: "ক্যাটালগ পড়া", pii: false, mutating: false },
  { scope: "products.write", en: "Create and edit products", bn: "পণ্য তৈরি ও সম্পাদনা", pii: false, mutating: true },
  { scope: "customers.read", en: "Read customer profiles", bn: "গ্রাহক প্রোফাইল পড়া", pii: true, mutating: false },
  { scope: "analytics.read", en: "Read aggregated analytics", bn: "সমষ্টিগত বিশ্লেষণ পড়া", pii: false, mutating: false },
  { scope: "exports.read", en: "List export jobs and downloads", bn: "এক্সপোর্ট জব দেখা", pii: true, mutating: false },
  { scope: "exports.write", en: "Start new export jobs", bn: "নতুন এক্সপোর্ট শুরু", pii: true, mutating: true },
  { scope: "webhooks.read", en: "List webhook endpoints", bn: "ওয়েবহুক এন্ডপয়েন্ট দেখা", pii: false, mutating: false },
  { scope: "webhooks.write", en: "Create, rotate and delete webhooks", bn: "ওয়েবহুক তৈরি ও ঘোরানো", pii: false, mutating: true },
  { scope: "themes.read", en: "Read installed themes and their assets", bn: "ইনস্টল করা থিম ও অ্যাসেট পড়া", pii: false, mutating: false },
  { scope: "themes.write", en: "Activate a theme on the storefront", bn: "স্টোরফ্রন্টে থিম সক্রিয় করা", pii: false, mutating: true },
];

const SCOPE_SET = new Set<string>(SCOPES);

export function isScope(value: unknown): value is Scope {
  return typeof value === "string" && SCOPE_SET.has(value);
}

/** Accepts a space- or comma-separated string, or an array. Unknown scopes drop. */
export function parseScopes(input: unknown): Scope[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[\s,]+/)
      : [];
  const out: Scope[] = [];
  for (const item of raw) {
    const value = typeof item === "string" ? item.trim() : "";
    if (isScope(value) && !out.includes(value)) out.push(value);
  }
  return out;
}

/** Effective grant = requested ∩ allowed. Order follows the catalogue. */
export function intersectScopes(requested: Scope[], allowed: Scope[]): Scope[] {
  const allowedSet = new Set(allowed);
  return SCOPES.filter((s) => requested.includes(s) && allowedSet.has(s));
}

/** `x.write` implies `x.read`; nothing else implies anything. */
export function expandImplied(granted: Scope[]): Scope[] {
  const out = new Set<Scope>(granted);
  for (const s of granted) {
    if (s.endsWith(".write")) {
      const read = s.replace(/\.write$/, ".read");
      if (isScope(read)) out.add(read);
    }
  }
  return SCOPES.filter((s) => out.has(s));
}

export function satisfies(granted: Scope[], required: Scope): boolean {
  return expandImplied(granted).includes(required);
}

/** Scopes the caller asked for but its registration forbids — shown verbatim in errors. */
export function refusedScopes(requested: Scope[], allowed: Scope[]): Scope[] {
  const ok = new Set(intersectScopes(requested, allowed));
  return requested.filter((s) => !ok.has(s));
}

/* ------------------------------------------------------------------ */
/* Cursor pagination                                                    */
/* ------------------------------------------------------------------ */

export type Cursor = { ts: string; id: string };

function b64urlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeCursor(cursor: Cursor): string {
  return b64urlEncode(`${cursor.ts}|${cursor.id}`);
}

/** Never throws: a tampered cursor is simply "no cursor", not a 500. */
export function decodeCursor(value: string | null | undefined): Cursor | null {
  if (!value) return null;
  try {
    const [ts, id] = b64urlDecode(value).split("|");
    if (!ts || !id) return null;
    if (Number.isNaN(Date.parse(ts))) return null;
    return { ts, id };
  } catch {
    return null;
  }
}

/** Page size is clamped, never client-authoritative. */
export const PAGE_DEFAULT = 25;
export const PAGE_MAX = 100;

export function clampLimit(raw: string | number | null | undefined): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n) || n <= 0) return PAGE_DEFAULT;
  return Math.min(Math.trunc(n), PAGE_MAX);
}

/* ------------------------------------------------------------------ */
/* Route table                                                          */
/* ------------------------------------------------------------------ */

export type ApiRoute = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Path segments after `/api/public/v1`; `:param` matches one segment. */
  pattern: string;
  scope: Scope;
  summary: string;
};

export const API_ROUTES: ApiRoute[] = [
  { method: "GET", pattern: "me", scope: "products.read", summary: "Identity of the calling credential" },
  { method: "GET", pattern: "orders", scope: "orders.read", summary: "List orders (cursor paginated)" },
  { method: "GET", pattern: "orders/:id", scope: "orders.read", summary: "Fetch one order" },
  { method: "POST", pattern: "orders/:id/notes", scope: "orders.write", summary: "Append an order note" },
  { method: "GET", pattern: "products", scope: "products.read", summary: "List products (cursor paginated)" },
  { method: "GET", pattern: "products/:id", scope: "products.read", summary: "Fetch one product" },
  { method: "POST", pattern: "products", scope: "products.write", summary: "Create a draft product" },
  { method: "GET", pattern: "customers", scope: "customers.read", summary: "List customers (cursor paginated)" },
  { method: "GET", pattern: "exports", scope: "exports.read", summary: "List export jobs" },
  { method: "POST", pattern: "exports", scope: "exports.write", summary: "Start an export job" },
  { method: "GET", pattern: "exports/:id", scope: "exports.read", summary: "Export job detail + signed URL" },
  { method: "GET", pattern: "webhooks", scope: "webhooks.read", summary: "List webhook endpoints" },
  { method: "POST", pattern: "webhooks", scope: "webhooks.write", summary: "Register a webhook endpoint" },
  { method: "DELETE", pattern: "webhooks/:id", scope: "webhooks.write", summary: "Delete a webhook endpoint" },
  { method: "GET", pattern: "themes", scope: "themes.read", summary: "List installed themes" },
  { method: "GET", pattern: "themes/:id", scope: "themes.read", summary: "Fetch one installed theme" },
  { method: "GET", pattern: "themes/:id/assets", scope: "themes.read", summary: "List a theme's CSS, font and image assets" },
  { method: "POST", pattern: "themes/:id/activate", scope: "themes.write", summary: "Activate a theme on the storefront" },
  { method: "GET", pattern: "marketplace/themes", scope: "themes.read", summary: "List published marketplace themes" },
];

export type RouteMatch = { route: ApiRoute; params: Record<string, string> };

export function matchRoute(method: string, path: string): RouteMatch | null {
  const segments = path.split("/").filter(Boolean);
  for (const route of API_ROUTES) {
    if (route.method !== method.toUpperCase()) continue;
    const parts = route.pattern.split("/");
    if (parts.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i] as string;
      const seg = segments[i] as string;
      if (part.startsWith(":")) params[part.slice(1)] = seg;
      else if (part !== seg) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

/** True when the method must carry an `Idempotency-Key`. */
export function requiresIdempotency(method: string) {
  return method.toUpperCase() !== "GET";
}
