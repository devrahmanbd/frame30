/**
 * Phase 10.8 — developer documentation content.
 *
 * The content is a typed module rather than database rows, for the same reason
 * the legal pages are: docs must be reviewable in a pull-request diff, must
 * render when every backend read is failing, and must never depend on tenant
 * state. Blocks are structured (not markdown strings) so the renderer, the
 * search index, the table of contents and the JSON-LD all read the *same*
 * tree — a heading can never exist in the page but be missing from the TOC.
 *
 * Versioning: every page declares the version it appeared in (`since`) and,
 * when it has been retired, the first version that no longer serves it
 * (`until`). Nothing is rewritten in place; a sunset version keeps serving the
 * pages it actually had.
 */
import { API_ROUTES } from "./api-scopes";

export type DocLocale = "en" | "bn";
export type DocBilingual = { en: string; bn: string };

export type DocVersionId = "v0" | "v1";

export type DocVersion = {
  id: DocVersionId;
  label: string;
  status: "current" | "sunset";
  released: string;
  /** Date the version stops being served at all. Rendered in the banner. */
  sunsetOn?: string;
};

export const DOC_VERSIONS: readonly DocVersion[] = [
  { id: "v1", label: "v1", status: "current", released: "2026-02-01" },
  { id: "v0", label: "v0", status: "sunset", released: "2025-06-01", sunsetOn: "2026-06-30" },
] as const;

export const CURRENT_VERSION: DocVersionId = "v1";

export type DocGroupId = "start" | "api" | "extend" | "operate";

export const DOC_GROUPS: readonly { id: DocGroupId; label: DocBilingual; order: number }[] = [
  { id: "start", label: { en: "Getting started", bn: "শুরু করা" }, order: 1 },
  { id: "api", label: { en: "REST API", bn: "রেস্ট এপিআই" }, order: 2 },
  { id: "extend", label: { en: "Extending Framique", bn: "এক্সটেনশন" }, order: 3 },
  { id: "operate", label: { en: "Running in production", bn: "প্রোডাকশন" }, order: 4 },
] as const;

/* -------------------------------------------------------------------------- */
/* Block model                                                                */
/* -------------------------------------------------------------------------- */

export type DocBlock =
  | { kind: "h"; level: 2 | 3; text: string; bn?: string }
  | { kind: "p"; text: string; bn?: string }
  | { kind: "list"; ordered?: boolean; items: string[] }
  | { kind: "code"; lang: "bash" | "ts" | "json" | "http" | "text"; code: string; caption?: string }
  | { kind: "table"; head: string[]; rows: string[][]; caption?: string }
  | { kind: "note"; tone: "info" | "warn"; text: string }
  /** Auto-generated endpoint table + samples, sourced from `API_ROUTES`. */
  | { kind: "endpoints" }
  /** Interactive sandbox call. `route` is a `METHOD pattern` key from API_ROUTES. */
  | { kind: "tryit"; route: string };

export type DocPage = {
  slug: string;
  group: DocGroupId;
  order: number;
  title: DocBilingual;
  summary: DocBilingual;
  /** Free-text keywords folded into the search index at low weight. */
  keywords: string[];
  since: DocVersionId;
  until?: DocVersionId;
  updated: string;
  blocks: DocBlock[];
};

const API_BASE = "https://api.framique.com/api/public/v1";

/* -------------------------------------------------------------------------- */
/* Pages                                                                      */
/* -------------------------------------------------------------------------- */

export const DOC_PAGES: readonly DocPage[] = [
  {
    slug: "quickstart",
    group: "start",
    order: 1,
    title: { en: "Quickstart", bn: "কুইকস্টার্ট" },
    summary: {
      en: "Create an API key, make your first authenticated call and read a paginated list in under five minutes.",
      bn: "একটি এপিআই কী তৈরি করে প্রথম কল করুন এবং পেজিনেটেড তালিকা পড়ুন — পাঁচ মিনিটেই।",
    },
    keywords: ["getting started", "first call", "api key", "curl", "hello world"],
    since: "v0",
    updated: "2026-02-01",
    blocks: [
      {
        kind: "p",
        text: "Everything a Framique store holds — catalogue, orders, customers, exports, webhooks — is reachable over one versioned REST surface. This page takes you from an empty terminal to a real response.",
        bn: "একটি Framique স্টোরের সব কিছু — ক্যাটালগ, অর্ডার, গ্রাহক, এক্সপোর্ট, ওয়েবহুক — একটিই ভার্সনড REST সারফেসে পাওয়া যায়।",
      },
      { kind: "h", level: 2, text: "1. Create an API key" },
      {
        kind: "list",
        ordered: true,
        items: [
          "Open the merchant admin and go to Settings → Developers.",
          "Create a key, choose the narrowest scopes the integration needs, and copy the secret. It is shown once and stored only as a hash.",
          "Keys are tenant-scoped: a key issued by one store can never read another store's data, whatever it asks for.",
        ],
      },
      {
        kind: "note",
        tone: "warn",
        text: "Never ship an API key to a browser, a mobile binary or a public repository. Keys carry tenant-wide authority; use the OAuth flow when a third party acts on a merchant's behalf.",
      },
      { kind: "h", level: 2, text: "2. Make the first call" },
      {
        kind: "code",
        lang: "bash",
        caption: "Identity of the calling credential",
        code: `curl -s "${API_BASE}/me" \\
  -H "Authorization: Bearer $FRAMIQUE_API_KEY"`,
      },
      {
        kind: "code",
        lang: "json",
        caption: "200 OK",
        code: `{
  "merchant_id": "7f1c…",
  "name": "Nokshi Kotha",
  "scopes": ["orders.read", "products.read"],
  "rate_limit": { "limit": 600, "remaining": 599, "reset_at": "2026-02-01T09:00:00Z" }
}`,
      },
      { kind: "tryit", route: "GET me" },
      { kind: "h", level: 2, text: "3. Read a paginated list" },
      {
        kind: "p",
        text: "Every list endpoint is cursor paginated. Never build page numbers: rows shift while you read them, and an offset silently skips or repeats orders. Follow `next_cursor` until it is null.",
      },
      {
        kind: "code",
        lang: "ts",
        caption: "Walk every page without dropping a row",
        code: `async function* allOrders(key: string) {
  let cursor: string | null = null;
  do {
    const url = new URL("${API_BASE}/orders");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url, { headers: { Authorization: \`Bearer \${key}\` } });
    if (res.status === 429) {
      // Respect the reset header instead of hammering the bucket.
      const wait = Number(res.headers.get("retry-after") ?? 1);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(\`orders \${res.status}\`);

    const page = await res.json();
    yield* page.data;
    cursor = page.next_cursor;
  } while (cursor);
}`,
      },
      { kind: "h", level: 2, text: "What to read next" },
      {
        kind: "list",
        items: [
          "Authentication — API keys versus OAuth, and which one your integration wants.",
          "Rate limits — the buckets, the headers and the backoff we expect.",
          "Webhooks — how to be told about a change instead of polling for it.",
        ],
      },
    ],
  },

  {
    slug: "authentication",
    group: "start",
    order: 2,
    title: { en: "Authentication", bn: "অথেনটিকেশন" },
    summary: {
      en: "API keys for your own backend, OAuth for apps acting on a merchant's behalf, and the scope algebra both share.",
      bn: "নিজের ব্যাকএন্ডের জন্য এপিআই কী, মার্চেন্টের হয়ে কাজ করা অ্যাপের জন্য ওএথ — এবং দুটোর সাধারণ স্কোপ নিয়ম।",
    },
    keywords: ["oauth", "api key", "bearer", "scopes", "pkce", "token", "consent"],
    since: "v0",
    updated: "2026-02-01",
    blocks: [
      {
        kind: "p",
        text: "There are exactly two ways to authenticate. Which one is correct is decided by a single question: does the credential belong to you, or to a merchant who has to consent to what you do with it?",
      },
      {
        kind: "table",
        head: ["", "API key", "OAuth app"],
        rows: [
          ["Use when", "You own the store", "You build for other merchants"],
          ["Credential lives", "Your server, in a secret manager", "Issued per merchant, refreshable"],
          ["Consent", "Implicit (you are the owner)", "Explicit consent screen, revocable"],
          ["Scopes", "Chosen at key creation", "Requested ∩ allowed by registration"],
          ["Rotation", "Manual, zero-downtime overlap", "Refresh token rotation on every use"],
        ],
      },
      { kind: "h", level: 2, text: "API keys" },
      {
        kind: "p",
        text: "Send the key as a bearer token. Framique stores only a hash, so a lost key cannot be recovered — it is rotated. Rotation issues a second live key so you can deploy before revoking the first.",
      },
      {
        kind: "code",
        lang: "http",
        code: `GET /api/public/v1/products?limit=25 HTTP/1.1
Host: your-store.framique.com
Authorization: Bearer fq_live_9f2c…
Accept: application/json`,
      },
      { kind: "h", level: 2, text: "OAuth 2.0 with PKCE" },
      {
        kind: "p",
        text: "Public clients (CLI tools, single-page apps) must use PKCE; there is no implicit flow and no client secret in a browser. Authorization codes are single-use and expire in 60 seconds, and a reused code revokes the whole grant family — a replayed code is treated as theft, not as a retry.",
      },
      {
        kind: "code",
        lang: "bash",
        caption: "Exchange the code for tokens",
        code: `curl -s -X POST "${API_BASE.replace("/api/public/v1", "")}/api/public/oauth/token" \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "authorization_code",
    "code": "'"$CODE"'",
    "client_id": "'"$CLIENT_ID"'",
    "code_verifier": "'"$VERIFIER"'",
    "redirect_uri": "https://app.example.com/callback"
  }'`,
      },
      { kind: "h", level: 2, text: "Scopes" },
      {
        kind: "p",
        text: "Scopes are the same catalogue everywhere: the consent screen, the key editor and the gateway authorizer all read one table, so a scope cannot mean one thing on screen and another at the door. A `.write` scope implies `.read` of the same resource and nothing else.",
      },
      { kind: "endpoints" },
      {
        kind: "note",
        tone: "info",
        text: "Ask for the smallest set. A consent screen listing customers.read when you only sync products is the fastest way to lose an install.",
      },
    ],
  },

  {
    slug: "rest-api",
    group: "api",
    order: 1,
    title: { en: "REST API reference", bn: "রেস্ট এপিআই রেফারেন্স" },
    summary: {
      en: "Every endpoint, the scope it needs, its cursor pagination contract and a runnable curl and TypeScript sample.",
      bn: "প্রতিটি এন্ডপয়েন্ট, প্রয়োজনীয় স্কোপ, কার্সর পেজিনেশন এবং চালানোর মতো curl ও টাইপস্ক্রিপ্ট নমুনা।",
    },
    keywords: ["endpoints", "orders", "products", "customers", "exports", "pagination", "cursor"],
    since: "v0",
    updated: "2026-02-01",
    blocks: [
      {
        kind: "p",
        text: "The reference below is generated from the same route table the gateway dispatches on. If an endpoint is served, it is documented; if it is documented, it is served. There is no hand-maintained second copy to drift.",
      },
      { kind: "h", level: 2, text: "Base URL and versioning" },
      { kind: "code", lang: "text", code: API_BASE },
      {
        kind: "p",
        text: "The version lives in the path. Additive changes (a new field, a new endpoint) ship inside v1; anything that could break a client gets a new version and a sunset date announced at least 90 days ahead.",
      },
      { kind: "h", level: 2, text: "Pagination" },
      {
        kind: "list",
        items: [
          "`limit` is clamped server-side to 100; asking for more is not an error, it is silently capped.",
          "`cursor` is opaque and signed positionally by (timestamp, id). Do not parse it.",
          "A tampered cursor is treated as no cursor — you get page one, not a 500.",
          "`next_cursor` is null on the last page. That is the only end-of-stream signal.",
        ],
      },
      { kind: "h", level: 2, text: "Idempotency" },
      {
        kind: "p",
        text: "Every non-GET request must carry an `Idempotency-Key`. Replaying the same key with the same body returns the original response; replaying it with a different body is a 409. Keys are retained for 24 hours.",
      },
      {
        kind: "code",
        lang: "bash",
        code: `curl -s -X POST "${API_BASE}/products" \\
  -H "Authorization: Bearer $FRAMIQUE_API_KEY" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Jamdani saree","price_minor":450000,"currency":"BDT"}'`,
      },
      { kind: "h", level: 2, text: "Endpoints" },
      { kind: "endpoints" },
      { kind: "tryit", route: "GET products" },
    ],
  },

  {
    slug: "errors",
    group: "api",
    order: 2,
    title: { en: "Errors", bn: "এরর" },
    summary: {
      en: "Problem responses, the stable error codes, which ones are safe to retry and how to log them without leaking data.",
      bn: "প্রবলেম রেসপন্স, স্থায়ী এরর কোড, কোনগুলো রিট্রাই করা নিরাপদ এবং ডেটা ফাঁস না করে কীভাবে লগ করবেন।",
    },
    keywords: ["problem json", "status codes", "retry", "409", "422", "429", "5xx"],
    since: "v0",
    updated: "2026-02-01",
    blocks: [
      {
        kind: "p",
        text: "Errors are RFC 9457 problem documents. The `code` is the stable contract — branch on it. The `detail` string is written for a human reading a log and may change without notice.",
      },
      {
        kind: "code",
        lang: "json",
        code: `{
  "type": "https://framique.com/docs/v1/errors#insufficient_scope",
  "title": "Insufficient scope",
  "status": 403,
  "code": "insufficient_scope",
  "detail": "This credential does not carry orders.write.",
  "request_id": "req_01JB4…"
}`,
      },
      {
        kind: "table",
        head: ["Status", "Code", "Meaning", "Retry?"],
        rows: [
          ["400", "invalid_request", "Malformed JSON or an unknown field", "No — fix the call"],
          ["401", "unauthenticated", "Missing, expired or revoked credential", "No — re-auth"],
          ["403", "insufficient_scope", "Authenticated, but the scope is not granted", "No"],
          ["404", "not_found", "No such row in *this* tenant", "No"],
          ["409", "idempotency_conflict", "Key reused with a different body", "No"],
          ["422", "validation_failed", "Shape is fine, values are not", "No"],
          ["429", "rate_limited", "Bucket exhausted", "Yes, after `retry-after`"],
          ["503", "upstream_unavailable", "A dependency is down or timed out", "Yes, with backoff"],
        ],
      },
      { kind: "h", level: 2, text: "Retry policy we expect" },
      {
        kind: "code",
        lang: "ts",
        code: `const RETRYABLE = new Set([429, 502, 503, 504]);

export async function call(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(url, init);
  if (!RETRYABLE.has(res.status) || attempt >= 5) return res;

  const after = Number(res.headers.get("retry-after"));
  // Full jitter: a fleet retrying in lockstep is a self-inflicted outage.
  const backoff = Number.isFinite(after) && after > 0
    ? after * 1000
    : Math.random() * Math.min(30_000, 2 ** attempt * 500);

  await new Promise((r) => setTimeout(r, backoff));
  return call(url, init, attempt + 1);
}`,
      },
      {
        kind: "note",
        tone: "warn",
        text: "Log `request_id`, status and code. Do not log the request body: order and customer payloads carry names, phone numbers and addresses, and a log store is rarely as well protected as the database.",
      },
    ],
  },

  {
    slug: "rate-limits",
    group: "api",
    order: 3,
    title: { en: "Rate limits", bn: "রেট লিমিট" },
    summary: {
      en: "The buckets, the headers on every response, what happens on a limiter outage, and how to stay well under the ceiling.",
      bn: "বাকেট, প্রতিটি রেসপন্সের হেডার, লিমিটার বিভ্রাটে কী হয় এবং সীমার নিচে থাকার উপায়।",
    },
    keywords: ["429", "throttle", "quota", "buckets", "retry-after", "backoff"],
    since: "v1",
    updated: "2026-02-01",
    blocks: [
      {
        kind: "p",
        text: "Limits are per credential and per named bucket, not one global number. Data-plane reads are generous; anything that can be brute-forced or that causes outbound work is deliberately tight.",
      },
      {
        kind: "table",
        head: ["Bucket", "Applies to", "Limit", "Window"],
        rows: [
          ["api.v1", "All REST data-plane calls", "600", "60s"],
          ["oauth.token", "Token exchange and refresh", "60", "60s"],
          ["oauth.authorize", "Consent screen starts", "20", "300s"],
          ["exports", "Starting an export job", "10", "600s"],
          ["webhook.dispatch", "Outbound deliveries to you", "600", "60s"],
          ["docs.tryit", "The sandbox panel on this site", "20", "300s"],
        ],
      },
      { kind: "h", level: 2, text: "Headers" },
      {
        kind: "code",
        lang: "http",
        code: `HTTP/1.1 200 OK
x-ratelimit-limit: 600
x-ratelimit-remaining: 587
x-ratelimit-reset: 2026-02-01T09:01:00Z
x-request-id: req_01JB4…`,
      },
      {
        kind: "p",
        text: "On 429 the same headers are present plus `retry-after` in seconds. Sleep for exactly that long, with jitter, and do not open more connections to compensate.",
      },
      { kind: "h", level: 2, text: "When the limiter itself is down" },
      {
        kind: "p",
        text: "The limiter fails open — a limiter outage must not take the API down with it — but every fail-open is counted and alerted. Do not treat a missing `x-ratelimit-remaining` as permission to burst.",
      },
      {
        kind: "note",
        tone: "info",
        text: "Bulk work belongs in an export job, not in a tight list loop. One export beats 40,000 paginated reads for both of us.",
      },
    ],
  },

  {
    slug: "webhooks",
    group: "api",
    order: 4,
    title: { en: "Webhooks", bn: "ওয়েবহুক" },
    summary: {
      en: "Subscribe to events, verify the HMAC signature in constant time, survive retries and make your handler idempotent.",
      bn: "ইভেন্ট সাবস্ক্রাইব করুন, HMAC সিগনেচার যাচাই করুন, রিট্রাই সামলান এবং হ্যান্ডলারকে আইডেমপোটেন্ট রাখুন।",
    },
    keywords: ["hmac", "signature", "replay", "retries", "events", "delivery", "idempotent"],
    since: "v0",
    updated: "2026-02-01",
    blocks: [
      {
        kind: "p",
        text: "A webhook endpoint is a public URL on your infrastructure. Treat every request to it as hostile until the signature says otherwise — the payload is not proof of anything.",
      },
      { kind: "h", level: 2, text: "Subscribing" },
      {
        kind: "code",
        lang: "bash",
        code: `curl -s -X POST "${API_BASE}/webhooks" \\
  -H "Authorization: Bearer $FRAMIQUE_API_KEY" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://app.example.com/hooks/framique",
    "events": ["order.created", "order.paid", "product.updated"],
    "description": "Fulfilment sync"
  }'`,
      },
      { kind: "h", level: 2, text: "Verifying the signature" },
      {
        kind: "p",
        text: "Each delivery carries `x-framique-timestamp` and `x-framique-signature`. The signed string is `timestamp.rawBody` — verify against the raw bytes, never against a re-serialised object, because key order and unicode escaping will not survive a round trip.",
      },
      {
        kind: "code",
        lang: "ts",
        caption: "Constant-time verification with a replay window",
        code: `import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 300;

export function verify(raw: string, headers: Headers, secret: string): boolean {
  const timestamp = headers.get("x-framique-timestamp");
  const signature = headers.get("x-framique-signature");
  if (!timestamp || !signature) return false;

  // Reject anything outside the window before spending a hash on it.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(\`\${timestamp}.\${raw}\`).digest("hex");
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  // Length check first: timingSafeEqual throws on a length mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}`,
      },
      { kind: "h", level: 2, text: "Delivery, retries and idempotency" },
      {
        kind: "list",
        items: [
          "Return 2xx within 5 seconds. Queue the work; do not do it inline.",
          "Failures retry with exponential backoff for 24 hours, then the endpoint is suspended and the merchant is notified.",
          "At-least-once delivery is guaranteed; exactly-once is not. Deduplicate on `event_id`.",
          "Events are ordered per resource, not globally. Compare `occurred_at` before overwriting your copy.",
        ],
      },
      {
        kind: "note",
        tone: "warn",
        text: "Rotating a webhook secret keeps the old secret valid for one hour so in-flight deliveries still verify. Accept both during that window.",
      },
    ],
  },

  {
    slug: "themes-api",
    group: "api",
    order: 6,
    title: { en: "Themes API", bn: "থিম এপিআই" },
    summary: {
      en: "List installed themes, read their assets, browse the marketplace and switch the live storefront theme from code.",
      bn: "ইনস্টল থিম দেখা, অ্যাসেট পড়া, মার্কেটপ্লেস ব্রাউজ করা এবং কোড থেকে লাইভ থিম বদলানো।",
    },
    keywords: ["theme", "themes", "marketplace", "activate", "assets", "storefront"],
    since: "v1",
    updated: "2026-09-04",
    blocks: [
      {
        kind: "p",
        text: "Everything the Themes screen does is a REST call, so a deploy pipeline can promote a theme the same way a person clicks Activate. Reads need `themes.read`; activation needs `themes.write`.",
      },
      { kind: "h", level: 2, text: "Endpoints" },
      {
        kind: "code",
        lang: "bash",
        code: `GET    /api/public/v1/themes                 # installed themes, active first
GET    /api/public/v1/themes/:id             # one installed theme
GET    /api/public/v1/themes/:id/assets      # css / tokens / font / image assets
POST   /api/public/v1/themes/:id/activate    # switch the live storefront theme
GET    /api/public/v1/marketplace/themes     # published marketplace listings`,
      },
      { kind: "h", level: 2, text: "Switching the live theme" },
      {
        kind: "code",
        lang: "bash",
        code: `curl -X POST https://your-store.example/api/public/v1/themes/$THEME_ID/activate \\
  -H "authorization: Bearer $FRAMIQUE_API_KEY" \\
  -H "idempotency-key: $(uuidgen)"`,
      },
      {
        kind: "note",
        tone: "info",
        text: "Activation is exclusive and atomic per merchant: the previous theme is deactivated in the same request, so the storefront never renders with two active themes. Cart, checkout and order pages are theme-independent — switching a theme never touches an in-flight cart.",
      },
      { kind: "h", level: 2, text: "Assets" },
      {
        kind: "p",
        text: "An asset with `scope: \"global\"` is injected under every theme; `scope: \"theme\"` is scoped to that theme only. CSS is sanitised on write (no `@import`, no `javascript:`, no `<script>`) and capped at 100 KB per asset.",
      },
      {
        kind: "note",
        tone: "warn",
        text: "Marketplace listings are public read: `GET /marketplace/themes` returns only listings in the `active` state, never drafts or listings under moderation.",
      },
    ],
  },

  {
    slug: "sdk",
    group: "extend",
    order: 1,
    title: { en: "TypeScript SDK", bn: "টাইপস্ক্রিপ্ট এসডিকে" },
    summary: {
      en: "A thin typed client over the same REST surface: retries, pagination helpers and webhook verification in one import.",
      bn: "একই REST সারফেসের উপর পাতলা টাইপড ক্লায়েন্ট — রিট্রাই, পেজিনেশন হেল্পার ও ওয়েবহুক যাচাই একসাথে।",
    },
    keywords: ["sdk", "typescript", "npm", "client", "types"],
    since: "v1",
    updated: "2026-02-01",
    blocks: [
      {
        kind: "p",
        text: "The SDK adds types, retry and pagination over `fetch`. It adds no behaviour the REST API does not have — anything you can do with the client you can do with curl, which is deliberate: your production integration should never depend on a feature only one client implements.",
      },
      { kind: "code", lang: "bash", code: "npm install @framique/sdk" },
      {
        kind: "code",
        lang: "ts",
        code: `import { Framique } from "@framique/sdk";

const fq = new Framique({
  apiKey: process.env.FRAMIQUE_API_KEY!,
  // Both default to sane values; shown here because production should set them.
  timeoutMs: 10_000,
  maxRetries: 5,
});

// Cursor pagination as an async iterator — no manual cursor bookkeeping.
for await (const order of fq.orders.list({ status: "paid" })) {
  await warehouse.enqueue(order.id);
}

// Writes take an idempotency key; omit it and the SDK generates a UUID per call.
await fq.orders.addNote(orderId, { body: "Picked", idempotencyKey: jobId });`,
      },
      {
        kind: "note",
        tone: "info",
        text: "The SDK is server-side only. It refuses to construct in a browser context, because an API key in a browser is a public API key.",
      },
    ],
  },

  {
    slug: "theme-authoring",
    group: "extend",
    order: 2,
    title: { en: "Theme authoring", bn: "থিম অথরিং" },
    summary: {
      en: "Build a storefront theme from tokens, sections and templates, then export it as a versioned, installable bundle.",
      bn: "টোকেন, সেকশন ও টেমপ্লেট দিয়ে স্টোরফ্রন্ট থিম বানান এবং ভার্সনড বান্ডল হিসেবে এক্সপোর্ট করুন।",
    },
    keywords: ["theme", "sections", "tokens", "templates", "storefront", "bundle"],
    since: "v1",
    updated: "2026-02-01",
    blocks: [
      {
        kind: "p",
        text: "A theme is three things: a token set (colour, type, radius, spacing), a set of sections a merchant can arrange, and templates that decide which sections a page starts with. Nothing else — a theme never ships business logic.",
      },
      { kind: "h", level: 2, text: "Tokens" },
      {
        kind: "code",
        lang: "json",
        code: `{
  "tokens": {
    "color.primary": "#0f7d74",
    "color.background": "#fffdf8",
    "radius.md": "0.625rem",
    "font.display": "Hind Siliguri",
    "font.body": "Inter"
  }
}`,
      },
      {
        kind: "p",
        text: "Sections read tokens, never raw hex. That is what makes a theme themeable at all: a merchant changing `color.primary` must not have to find fourteen hardcoded buttons.",
      },
      { kind: "h", level: 2, text: "A section schema" },
      {
        kind: "code",
        lang: "ts",
        code: `export const schema = {
  type: "hero.split",
  label: { en: "Split hero", bn: "স্প্লিট হিরো" },
  // Hydration mode is part of the contract, not an afterthought: a static
  // section costs zero client JS and still renders on a dead network.
  hydration: "static",
  settings: [
    { id: "heading", type: "text", localized: true, max: 90, required: true },
    { id: "image", type: "image", alt: "required" },
    { id: "cta", type: "link" },
  ],
} as const;`,
      },
      {
        kind: "list",
        items: [
          "Every text setting is localizable — Bangla is a first-class locale, not a fallback.",
          "Every image setting requires alt text; the publish gate refuses a theme that can render an image without one.",
          "A section that throws is contained by the widget boundary: the page keeps rendering, the studio shows why.",
        ],
      },
      { kind: "h", level: 2, text: "Export and versioning" },
      {
        kind: "p",
        text: "Exporting produces a signed bundle with a semver version and a schema fingerprint. Installing a bundle whose fingerprint does not match the store's runtime is refused rather than half-applied.",
      },
    ],
  },

  {
    slug: "app-blocks",
    group: "extend",
    order: 3,
    title: { en: "Apps and app blocks", bn: "অ্যাপ ও অ্যাপ ব্লক" },
    summary: {
      en: "Ship an app that adds blocks to the page builder, requests scopes honestly and runs sandboxed on the storefront.",
      bn: "পেজ বিল্ডারে ব্লক যোগ করা অ্যাপ বানান — সৎভাবে স্কোপ চেয়ে, স্যান্ডবক্সে চালিয়ে।",
    },
    keywords: ["apps", "plugins", "marketplace", "blocks", "sandbox", "consent"],
    since: "v1",
    updated: "2026-02-01",
    blocks: [
      {
        kind: "p",
        text: "An app declares what it needs in a manifest. The install consent screen renders that manifest verbatim, so what the merchant approves and what the runtime grants are the same list — there is no hidden capability.",
      },
      {
        kind: "code",
        lang: "json",
        caption: "app.manifest.json",
        code: `{
  "id": "reviews-pro",
  "name": { "en": "Reviews Pro", "bn": "রিভিউস প্রো" },
  "scopes": ["products.read", "orders.read"],
  "blocks": [
    {
      "type": "reviews.summary",
      "label": { "en": "Review summary", "bn": "রিভিউ সারাংশ" },
      "targets": ["product"],
      "hydration": "visible"
    }
  ],
  "settings_schema": [
    { "id": "min_rating", "type": "number", "min": 1, "max": 5, "default": 4 }
  ],
  "webhooks": ["order.paid"]
}`,
      },
      { kind: "h", level: 2, text: "The sandbox" },
      {
        kind: "list",
        items: [
          "Block code runs in a sandboxed frame with no ambient access to the host page's DOM, cookies or storage.",
          "Data arrives through a declared props contract, so a block cannot read a customer record it never asked for.",
          "Network egress is limited to your declared origins; anything else is blocked and counted.",
          "A block that exceeds its render budget is unmounted and the placeholder keeps the layout stable — no CLS.",
        ],
      },
      {
        kind: "note",
        tone: "warn",
        text: "Uninstalling an app revokes its tokens immediately and deletes its settings after a 30-day grace period. Export anything the merchant owns before then.",
      },
    ],
  },

  {
    slug: "going-live",
    group: "operate",
    order: 1,
    title: { en: "Going live", bn: "লাইভ করা" },
    summary: {
      en: "The pre-flight list for a production integration: secrets, timeouts, observability, failure drills and support paths.",
      bn: "প্রোডাকশন ইন্টিগ্রেশনের চেকলিস্ট: সিক্রেট, টাইমআউট, অবজারভেবিলিটি, ব্যর্থতার মহড়া ও সাপোর্ট।",
    },
    keywords: ["production", "checklist", "monitoring", "timeouts", "support", "incident"],
    since: "v1",
    updated: "2026-02-01",
    blocks: [
      {
        kind: "p",
        text: "An integration is not done when it works; it is done when it fails safely. This is the list we check before an app is listed in the marketplace, and it is the same list we would apply to our own services.",
      },
      { kind: "h", level: 2, text: "Before you ship" },
      {
        kind: "list",
        ordered: true,
        items: [
          "Secrets live in a manager, not in env files committed to a repository, and are rotatable without a deploy.",
          "Every outbound call has a timeout. A call with no timeout is an outage waiting for a slow dependency.",
          "Retries use full jitter and a cap, and only on idempotent operations or with an idempotency key.",
          "Webhook handlers acknowledge fast and process asynchronously, deduplicating on event_id.",
          "You log request_id, status and code — and never customer PII.",
          "You have an alert on error rate and on webhook delivery failure, not just on uptime.",
          "You have tried it: pull the network, expire the token, return a 500 from your own handler, and watch what the merchant sees.",
        ],
      },
      { kind: "h", level: 2, text: "Deprecation policy" },
      {
        kind: "table",
        head: ["Change", "Notice", "Where announced"],
        rows: [
          ["New endpoint or field", "None (additive)", "Changelog"],
          ["Behaviour change", "30 days", "Changelog + email to app owners"],
          ["Breaking change", "90 days + new version", "Changelog, email, response header"],
          ["Emergency security fix", "As fast as safety allows", "Status page + email"],
        ],
      },
      {
        kind: "p",
        text: "A deprecated endpoint answers with a `sunset` header carrying the retirement date long before it stops answering at all. Nothing disappears without a date you can see in a response.",
      },
      {
        kind: "note",
        tone: "info",
        text: "Something wrong in production? The status page carries live component health and the incident log; anything tenant-specific goes through your merchant support desk so it lands with the order and account context attached.",
      },
    ],
  },
] as const;

/** Every documented endpoint key, used by the try-it allowlist. */
export const API_ROUTE_KEYS = API_ROUTES.map((r) => `${r.method} ${r.pattern}`);

export { API_BASE };
