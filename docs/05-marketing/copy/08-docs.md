# `/docs`

Route: `src/routes/docs.index.tsx` (+ `docs.$version.$slug.tsx`)
Shell: marketing chrome on the landing surface, docs-shell (persistent left nav, search, version switcher) on sub-pages.
Scope: this deck covers the `/docs` landing page only — the reference sub-pages inherit its SEO pattern per route.

## SEO

- **Title** (58 chars): `Framique developer docs — REST API, webhooks, sandbox`
- **Description** (159 chars): `Scoped API keys, cursor pagination, idempotent writes and signed webhooks for the Framique commerce platform. Call real endpoints from a sandbox on this page.`
- **og:title**: `Build on the Framique API.`
- **og:description**: `REST, webhooks and SDKs with a sandbox you can call from this page.`
- **canonical / og:url**: `/docs`
- **JSON-LD**:
    - `BreadcrumbList` — Home → Docs.
    - `SoftwareApplication` — name `Framique API`, applicationCategory `BusinessApplication`, operatingSystem `Web`, offers referencing the pricing page.
    - `TechArticle` — headline `Framique developer documentation`, about `REST API`, proficiencyLevel `Beginner`, dependencies `curl, TypeScript`. Sub-pages (`docs.$version.$slug.tsx`) each emit their own `TechArticle` with a `datePublished`/`dateModified` pair sourced from the changelog.
- **H1 rule**: exactly one `<h1>` per render — `Build on the Framique API.` on the landing surface; sub-pages set their own H1 to the endpoint or guide title and demote this copy's H1 to a breadcrumb label.
- Docs pages carry their own sitemap shard (`/docs/sitemap.xml`), regenerated on every route-registry change so new endpoints are indexed within a day.
- **og:type**: `website`
- **twitter:card**: `summary_large_image` · **twitter:title** mirrors `og:title` · **twitter:description** mirrors `og:description`
- **Keywords** — the page must earn these in body copy and headings; never stuff a `<meta name="keywords">` tag, it is ignored by search engines and reads as spam to reviewers.
  - **Primary**: `framique api documentation`
  - **Secondary**:
    - `ecommerce rest api bangladesh`
    - `commerce webhooks api`
    - `api keys and scopes`
    - `headless commerce api`
  - **Long-tail / question intents**:
    - `how to sync an erp with an ecommerce platform api`
    - `ecommerce api with sandbox testing`
  - **Placement**: H1 (primary), quickstart band, endpoint reference tables, webhooks band. Bangla equivalents belong in the `lang="bn"` variants of the same blocks — never as a hidden duplicate paragraph.
- **URL rule**: canonical and `og:url` are **relative** (`/docs`) until a production domain is set, so preview, published and custom-domain traffic each canonicalise to themselves. Never bake `https://framique.com` into source.

## Band order

1. Hero
2. Quickstart in five minutes
3. Authentication and scoped keys
4. Endpoint groups
5. Idempotency and retries
6. Pagination and filtering
7. Rate limits
8. Error taxonomy
9. Webhooks
10. Try It sandbox
11. Versioning and deprecation
12. SDKs and no-SDK guidance
13. Integration recipes
14. Support and status
15. FAQ
16. Final CTA

---

## 1. Hero

*Lever:* **Instrumentality** — before anything else, tell the reader exactly what class of person this page rewards (someone about to write a request), so they don't scan for a marketing summary that isn't coming.

- **Eyebrow**: `v1 stable · v0 archived`
- **H1**: **Build on the Framique API.**
- **Sub**: REST, webhooks and SDKs with a sandbox you can call from this page.
- **Primary CTA**: `Get an API key` → `/signup?next=/dashboard/developers`
- **Alt CTA**: `Jump to quickstart` → anchors to Band 2
- Inline: docs search field (`⌘K` / `Ctrl K`), keyboard-focusable, results ranked client-side against a static index of route summaries and guide titles — no network round trip for the first keystroke.

**বাংলা variant** (language toggle in nav, not auto-detected):
- H1: `ফ্রেমিক API দিয়ে তৈরি করুন।`
- Sub: `REST, ওয়েবহুক ও SDK — এই পাতা থেকেই স্যান্ডবক্সে কল করুন।`

**Design note**: aurora hero, violet-to-teal mesh at low alpha behind the H1, one white pill (`Get an API key`) and one glass pill (`Jump to quickstart`). Search field sits in a glass strip below the CTAs with a `⌘K` caption chip — no separate hero image; the code sample in Band 2 is the visual payload of the page, so the hero stays text-only and gets out of the way in one viewport.

---

## 2. Quickstart in five minutes

*Lever:* **Reduced friction / commitment device** — a five-minute promise only works if the first code block actually runs unmodified, so every sample below is copy-paste complete, including the sandbox key.

**Step 1 — Create a key.** Dashboard → Developers → API keys → New key. Pick scopes; a key that can read orders cannot refund them unless `orders.write` is granted explicitly. Keys are shown once; store the secret in your own vault, not in source control.

**Step 2 — Call an endpoint.**

```bash
curl https://api.framique.com/v1/orders?limit=5 \
  -H "Authorization: Bearer fq_live_51H8sK...redacted" \
  -H "Accept: application/json"
```

```ts
// Node 18+ / Bun / Deno — no SDK required
const res = await fetch("https://api.framique.com/v1/orders?limit=5", {
  headers: {
    Authorization: `Bearer ${process.env.FRAMIQUE_API_KEY}`,
    Accept: "application/json",
  },
});

if (!res.ok) {
  const body = await res.json();
  throw new Error(`framique_error: ${body.error.code} — ${body.error.message}`);
}

const { data, page } = await res.json();
console.log(data.length, "orders, next cursor:", page.next_cursor);
```

Response shape:

```json
{
  "data": [
    { "id": "ord_7g2k", "status": "paid", "total_minor": 149000, "currency": "BDT", "created_at": "2024-03-11T09:12:04Z" }
  ],
  "page": { "limit": 5, "next_cursor": "eyJ0cyI6IjIwMjQtMDMtMTEiLCJpZCI6Im9yZF83ZzJrIn0" }
}
```

**Step 3 — Subscribe to a webhook.** Dashboard → Developers → Webhooks → New endpoint, or `POST /v1/webhooks` with `webhooks.write`. Every delivery is HMAC-signed and shows up in a per-endpoint delivery log with a replay button — see Band 9.

**বাংলা variant** (button labels only, code stays English per platform convention):
- `একটি কী তৈরি করুন` · `এন্ডপয়েন্ট কল করুন` · `ওয়েবহুক সাবস্ক্রাইব করুন`

**Design note**: three glass steps in a row (3-up → 1-up at 640px), each with a number chip in signal blue, code block on `surface-1` with a hairline border and a copy-to-clipboard affordance in the top-right corner. No syntax-theme gimmicks — monochrome tokens with signal blue reserved for strings, matching the one-accent-color rule.

---

## 3. Authentication and scoped keys

*Lever:* **Loss aversion / trust signaling** — naming the exact two rules that govern scopes removes the vague fear that "the docs probably don't cover this edge case."

Every request carries a bearer key: `Authorization: Bearer fq_live_...` (or `fq_test_...` against the sandbox host). Keys are scoped, not account-wide. Two rules govern every authorization decision, enforced by the same pure scope module on the consent screen, the key editor and the gateway — a scope cannot mean one thing in the dashboard and another at the wire:

1. An app's effective grant is the **intersection** of what it requested and what its registration allows. Nothing widens a grant at request time.
2. A `.write` scope implies `.read` of the *same* resource only. `orders.write` implies `orders.read`; it implies nothing about `products` or `customers`.

Requesting a scope your key was never issued does not error silently — the response names the refused scopes verbatim so you can fix the request instead of guessing.

### Scope catalogue

| Scope | Grants | PII | Mutates state |
|---|---|---|---|
| `orders.read` | Read orders and their totals | Yes | No |
| `orders.write` | Add notes and tags to orders | Yes | Yes |
| `products.read` | Read the catalogue | No | No |
| `products.write` | Create and edit products | No | Yes |
| `customers.read` | Read customer profiles | Yes | No |
| `analytics.read` | Read aggregated analytics | No | No |
| `exports.read` | List export jobs and downloads | Yes | No |
| `exports.write` | Start new export jobs | Yes | Yes |
| `webhooks.read` | List webhook endpoints | No | No |
| `webhooks.write` | Create, rotate and delete webhooks | No | Yes |

**বাংলা labels** (consent screen and key editor use these verbatim):

| Scope | বাংলা |
|---|---|
| `orders.read` | অর্ডার ও মোট মূল্য দেখা |
| `orders.write` | অর্ডারে নোট ও ট্যাগ যোগ |
| `products.read` | ক্যাটালগ পড়া |
| `products.write` | পণ্য তৈরি ও সম্পাদনা |
| `customers.read` | গ্রাহক প্রোফাইল পড়া |
| `analytics.read` | সমষ্টিগত বিশ্লেষণ পড়া |
| `exports.read` | এক্সপোর্ট জব দেখা |
| `exports.write` | নতুন এক্সপোর্ট শুরু |
| `webhooks.read` | ওয়েবহুক এন্ডপয়েন্ট দেখা |
| `webhooks.write` | ওয়েবহুক তৈরি ও ঘোরানো |

Practical guidance: scope a server-side integration to only the resources it touches. A pricing sync only ever needs `products.read` and `products.write` — never issue it `customers.read`. Any scope flagged PII in the table above should live behind a key with a short rotation cadence; the dashboard surfaces a "last used" timestamp per key so unused broad grants are visible before they become a liability.

**Design note**: scope table renders as a real markdown table with a `PII` pill in ink-muted and a `Mutates` pill in signal blue when true — no color-coded rows, since hierarchy here is carried by the pill, not a background tint.

---

## 4. Endpoint groups

*Lever:* **Chunking** — a page of fourteen routes is easier to hold in memory as five named groups than as one flat list.

Endpoint tables on the reference sub-pages are generated from the live route registry, so method, path, scope and description never drift from what the gateway actually accepts. The landing page shows the group summary; each row expands to a curl and TypeScript sample and a JSON response shape.

| Group | Routes | Primary scope |
|---|---|---|
| Identity | `GET /me` | `products.read` |
| Orders | `GET /orders`, `GET /orders/:id`, `POST /orders/:id/notes` | `orders.read` / `orders.write` |
| Products | `GET /products`, `GET /products/:id`, `POST /products` | `products.read` / `products.write` |
| Customers | `GET /customers` | `customers.read` |
| Exports | `GET /exports`, `POST /exports`, `GET /exports/:id` | `exports.read` / `exports.write` |
| Webhooks | `GET /webhooks`, `POST /webhooks`, `DELETE /webhooks/:id` | `webhooks.read` / `webhooks.write` |

All list routes (`orders`, `products`, `customers`, `exports`) are cursor-paginated; all non-`GET` routes require an `Idempotency-Key` header. Both are covered in Bands 5 and 6.

**Design note**: group table as a 2-column glass card grid on wide viewports, collapsing to a single stacked list under 900px; each group name links to its reference sub-page anchor.

---

## 5. Idempotency and retries

*Lever:* **Safety net** — naming the failure mode ("your network drops the response, not the request") pre-empts the anxiety that keeps integrators from retrying at all.

Every request that isn't a `GET` must carry an `Idempotency-Key` header — a UUID or ULID you generate client-side. The gateway stores the result of the first successful attempt against that key for 24 hours; a repeated request with the same key returns the original response verbatim instead of creating a second resource. This makes retries safe by construction: if a request times out after your write already committed, retrying with the same key cannot double-charge, double-note or double-export.

```bash
curl -X POST https://api.framique.com/v1/exports \
  -H "Authorization: Bearer fq_live_51H8sK...redacted" \
  -H "Idempotency-Key: 8f14e45f-ceea-4b1b-8d6b-1f9c0d3a2e11" \
  -H "Content-Type: application/json" \
  -d '{"resource": "orders", "format": "csv"}'
```

Retry policy:

- Retry on `429` and any `5xx` with exponential backoff starting at 500ms, capped at 8s, jitter ±20%.
- Never retry a `4xx` other than `429` without changing the request — retrying a malformed payload with the same idempotency key just replays the same error.
- Reusing an idempotency key with a **different** request body against the same route returns `409 idempotency_key_conflict` — the gateway assumes you meant the first request and refuses to guess which one is authoritative.

**Design note**: this band gets its own small code block plus a compact retry-policy list rendered as a glass card, not a table — three rules read faster as prose bullets than as a grid.

---

## 6. Pagination and filtering

*Lever:* **Predictability** — cursor pagination avoids the classic offset-drift bug, and saying so explicitly builds confidence that the API was designed by people who have shipped a paginated API before.

List endpoints use cursor pagination, not page numbers. A cursor encodes a timestamp and an id, so results stay stable even when rows are inserted between requests — offset pagination would silently skip or repeat rows under concurrent writes. Cursors are opaque; treat them as strings. A tampered or expired cursor never 500s — it's simply treated as "no cursor," which restarts the page rather than erroring the integration.

```bash
curl "https://api.framique.com/v1/orders?limit=25&cursor=eyJ0cyI6IjIwMjQtMDMtMTEiLCJpZCI6Im9yZF83ZzJrIn0" \
  -H "Authorization: Bearer fq_live_51H8sK...redacted"
```

- `limit` — default `25`, max `100`. Values outside that range are clamped, never rejected — the server is authoritative on page size, not the client.
- `cursor` — from the previous page's `page.next_cursor`; omit for the first page.
- Filtering is per-resource query params (for example `orders?status=paid&created_after=2024-01-01`); the reference sub-page for each route lists its supported filters, since not every list route supports the same filter set.

**Design note**: short prose plus one code block; no table needed for two query params.

---

## 7. Rate limits

*Lever:* **Transparency reduces support load** — publishing the exact headers means integrators self-diagnose a `429` instead of filing a ticket.

Rate limits are per API key, per rolling minute, and vary by scope tier (read-only keys get a higher ceiling than write-capable keys, since writes carry more downstream cost). Every response — successful or not — carries the current budget:

| Header | Meaning |
|---|---|
| `X-RateLimit-Limit` | Requests allowed in the current window |
| `X-RateLimit-Remaining` | Requests left in the current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |
| `Retry-After` | Present only on `429`; seconds to wait before retrying |

```bash
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1710150000
Retry-After: 12
```

Design your client to read `X-RateLimit-Remaining` proactively and slow down before hitting zero, rather than reacting only to `429` — a burst-and-backoff pattern is more expensive on both sides than a steady drip under the limit.

**Design note**: header table on `surface-1`, four rows only — resist the urge to pad this into a longer table.

---

## 8. Error taxonomy

*Lever:* **Reduced ambiguity** — a client that can branch on `error.code` instead of parsing `error.message` strings is a client that survives a copy change on our side.

Every error response shares one envelope:

```json
{
  "error": {
    "code": "scope_refused",
    "message": "This key is not authorized for orders.write.",
    "refused_scopes": ["orders.write"],
    "request_id": "req_9f2ac1"
  }
}
```

| HTTP status | `error.code` | Meaning | Recommended client handling |
|---|---|---|---|
| 400 | `validation_failed` | Request body or query params failed schema checks | Fix the payload; don't retry unmodified |
| 401 | `invalid_key` | Key missing, malformed, or revoked | Stop; re-issue the key, don't retry |
| 403 | `scope_refused` | Key lacks a required scope | Surface `refused_scopes` to the operator; don't retry |
| 404 | `not_found` | Resource doesn't exist or isn't visible to this key | Stop; verify the id and the key's tenant |
| 409 | `idempotency_key_conflict` | Same key, different body, within the 24h window | Generate a new idempotency key if the request truly changed |
| 422 | `state_conflict` | Valid request, but the resource isn't in a state that allows it (e.g. noting a cancelled order) | Stop; re-read current state before retrying |
| 429 | `rate_limited` | Budget exhausted for this key | Backoff per `Retry-After`; do not hot-loop |
| 500 | `internal_error` | Unexpected server fault | Retry with backoff; escalate if it persists past 3 attempts |
| 503 | `upstream_unavailable` | A dependency (payments, SMS, export storage) is degraded | Retry with backoff; check `/status` |

`request_id` is present on every error and is the single value support needs to trace a request server-side — include it verbatim in any ticket.

**Design note**: this is the longest table on the page; render on `surface-1` with a hairline row divider, `error.code` in monospace, and keep the status column narrow so the "recommended handling" column gets the most horizontal room — that's the column integrators actually act on.

---

## 9. Webhooks

*Lever:* **Verifiable trust** — showing the verification code rather than just asserting "signed payloads" lets a skeptical engineer confirm the claim in under a minute.

Webhook deliveries are HMAC-SHA256 signed. Each request carries `Framique-Signature: t=<unix_ts>,v1=<hex_hmac>` computed over `${timestamp}.${raw_body}` using your endpoint's signing secret (shown once at creation, rotatable any time from the dashboard).

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function verifyFramiqueSignature(rawBody: string, header: string, secret: string, toleranceSec = 300): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > toleranceSec) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const given = Buffer.from(parts.v1 ?? "", "hex");
  const wanted = Buffer.from(expected, "hex");
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
```

```bash
# Example inbound request
POST /webhooks/framique HTTP/1.1
Framique-Signature: t=1710150000,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
Content-Type: application/json

{"type":"order.paid","data":{"id":"ord_7g2k","total_minor":149000}}
```

Delivery behaviour: failed deliveries (non-2xx or timeout) retry with backoff over 24 hours, then move to a per-endpoint delivery log where any single event can be replayed manually. Retried deliveries reuse the same event id, so your handler should be idempotent on `event.id`, not on delivery count.

**Replay-safety checklist**

- [ ] Verify the signature before parsing the body — reject unsigned or mis-signed requests with `401`, don't process-then-check.
- [ ] Enforce the timestamp tolerance window (300s default) to reject replayed captures of old, validly-signed payloads.
- [ ] Store processed `event.id` values (even briefly, e.g. 48h in Redis) and no-op on a repeat — retries and manual replays will resend the same id.
- [ ] Respond `2xx` only after the handler's side effects are durable; a `2xx` followed by a crash before your database commit will not trigger another delivery.
- [ ] Never trust `data` fields for authorization decisions without a follow-up `GET` to the resource if the action is high-value (e.g. a refund) — webhooks are a signal to re-fetch, not a substitute for the source of truth.
- [ ] Keep the signing secret out of logs; treat it like an API key.

**বাংলা variant** (dashboard copy near the signing secret field):
- `সাইনিং সিক্রেট — একবার দেখানো হয়, প্রয়োজনে যেকোনো সময় ঘোরান।`

**Design note**: checklist renders as a real markdown checklist (not a card grid) so it reads as a literal to-do; code blocks stay ungradiented on `surface-1` even though this band could take a spotlight card — reserve gradient cards for the recipes band instead.

---

## 10. Try It sandbox

*Lever:* **Try-before-you-buy / reduced activation energy** — letting someone see a real response with zero setup shortens the gap between "reading" and "believing."

The Try It panel calls live, read-only endpoints directly from this page using a shared, heavily-throttled sandbox key — no account required. It shows the exact request (method, path, headers with the key redacted) alongside the response, so what you see is what you'd get from your own key.

**Allowlist**: `GET /me`, `GET /products`, `GET /products/:id`, `GET /orders` (against seeded demo data only — never live tenant data), `GET /customers` (redacted PII in sandbox mode).

**Limits**: 20 calls per IP per hour, response bodies capped at 50 rows, no write scopes are ever exposed in the panel regardless of what a visitor requests. Exceeding the limit returns the same `429` shape documented in Band 8, so the panel itself is a live example of rate-limit handling, not a special case.

**Design note**: glass panel split into a request pane (editable path + query params only, method fixed per allowlisted route) and a response pane with syntax-toned JSON; a small caption states "sandbox data, not your account" in ink-muted directly under the response to prevent anyone mistaking demo orders for real ones.

---

## 11. Versioning and deprecation

*Lever:* **Commitment and consistency** — a stated, dated deprecation policy is what lets a team justify integrating today instead of waiting for "stability."

`v1` is the current stable version and the only version new integrations should target. Breaking changes — removing a field, tightening a validation, changing a status code's meaning — always ship as a new major version (`v2`), never as a silent change to `v1`. Additive changes (new optional fields, new endpoints, new optional query params) ship into `v1` without a version bump, since they cannot break a well-behaved client that ignores unknown fields.

`v0` is archived: it still resolves and its docs stay readable for reference, but it receives no new endpoints and is not covered by the rate-limit or SLA commitments given to `v1`. Any endpoint scheduled for removal appears in the changelog with a removal date at least 90 days out before it's pulled, and the endpoint itself returns a `Deprecation` and `Sunset` header in the interim so automated monitoring can catch it without reading the changelog by hand.

```bash
HTTP/1.1 200 OK
Deprecation: true
Sunset: Wed, 01 Oct 2025 00:00:00 GMT
Link: <https://framique.com/docs/v1/migrate-orders-notes>; rel="deprecation"
```

**Design note**: single glass card with the header example as its only code block — this band is short by design; the point is the commitment, not a wall of policy text.

---

## 12. SDKs and no-SDK guidance

*Lever:* **Autonomy** — telling a reader when *not* to reach for a dependency respects their judgment more than pushing an SDK as the default path.

Official SDKs cover TypeScript/Node and PHP, both thin wrappers that add request signing helpers, typed responses and built-in retry/backoff — nothing they do is unavailable to a plain `fetch` call, so treat them as convenience, not a requirement.

**Use an SDK when**: you're integrating from a codebase already on Node or PHP, want typed responses without hand-writing interfaces, or want the webhook-signature helper without copying the verification function yourself.

**Skip the SDK when**: you're calling from an edge runtime with a small bundle budget, from a language we don't ship a client for (a plain REST call plus the JSON shapes in this doc is the whole integration surface), or from a serverless function where a dependency-free `fetch` call keeps cold starts smaller.

```bash
npm install @framique/sdk
```

```ts
import { Framique } from "@framique/sdk";

const framique = new Framique({ apiKey: process.env.FRAMIQUE_API_KEY! });
const orders = await framique.orders.list({ limit: 25 });
```

Every code sample on this page and its sub-pages ships in both forms — raw `fetch`/`curl` and SDK — because the fastest path for one integrator is the wrong path for another.

**Design note**: two labeled tabs (SDK / No SDK) inside the same code-block component used throughout the page, so switching doesn't reflow the layout.

---

## 13. Integration recipes

*Lever:* **Worked examples reduce perceived effort** — a named recipe with explicit pitfalls signals "someone has already made this mistake so you don't have to."

### Recipe A — Sync a catalogue from an ERP

1. Pull the ERP's product export on its existing schedule (nightly is typical for Bangladesh-based ERPs with batch exports).
2. Map ERP SKU → Framique product using an external-id field stored on creation; never key off `product.id`, which is Framique-assigned.
3. `POST /products` for new SKUs, `PATCH` (via the reference sub-page for products) for changed ones, using an `Idempotency-Key` derived deterministically from `sku + version` so a re-run of the same export batch is a no-op rather than a duplicate.
4. Reconcile deletions explicitly — a SKU missing from this run's export should archive, not delete, since deletion cascades to historical orders' line-item references.

**Pitfalls**: treating the ERP export as authoritative for price *and* inventory in the same call — race the two separately if your ERP updates them on different cadences, or a stale price can overwrite a manual promotional price set inside Framique.

### Recipe B — Push orders to accounting

1. Subscribe to `order.paid` webhooks rather than polling `GET /orders` — polling a paid-order feed on a timer duplicates work the webhook already does for free and adds latency.
2. On receipt, verify the signature (Band 9), then `GET /orders/:id` to fetch the full order before posting a ledger entry — the webhook payload is a pointer, not the source of truth for accounting-grade totals.
3. Key your ledger entry's idempotency on `order.id`, not on `event.id` — a replayed webhook for the same order must not create a second ledger line.

**Pitfalls**: posting the webhook's `total_minor` straight into the ledger without re-fetching — if a refund lands between the webhook firing and your batch job running, the re-fetch is what catches it.

### Recipe C — Custom checkout

1. Use `orders.write` scoped to the smallest possible key — a checkout key never needs `customers.read` or `exports.read`.
2. Create the order server-side, never from the browser — the key must never reach client JavaScript.
3. Handle `422 state_conflict` explicitly at checkout (e.g. an item going out of stock between cart and submit) with a specific UI message, not a generic error toast — this is the single most common checkout-time error code.

**Pitfalls**: skipping the `Idempotency-Key` on the order-creation call because "the user only clicked once" — double-submits from slow networks or retried service workers are the most common source of duplicate orders in custom checkouts.

### Recipe D — Headless storefront

1. Use `products.read` and `customers.read` only from the storefront's server layer; keep the key server-side even in a headless setup, proxying reads through your own edge functions.
2. Cache `GET /products` responses at your CDN edge keyed on the cursor and filters, with a short TTL (60–120s) — catalogue reads are the highest-volume call in a headless storefront and cheap to cache safely.
3. Invalidate the cache on `product.updated` webhooks rather than relying on TTL alone if near-real-time pricing accuracy matters to the business.

**Pitfalls**: forgetting that `limit` is clamped server-side at 100 — a storefront that assumes it can request 500 products in one call to reduce round trips will silently get 100 back and under-render the catalogue without an error to catch it.

**Design note**: four glass-card panels in a 2-up grid (1-up under 900px), each with a numbered step list and a labeled "Pitfall" callout in `ink-muted` italics — no gradient spotlight here, since four cards in view at once would break the "one or two gradient cards per page" rule; keep these on plain glass.

---

## 14. Support and status

*Lever:* **Reassurance before commitment** — placing this immediately before the FAQ answers the unspoken "what happens when something breaks" question right when a reader is deciding whether to build on this.

Live incident and uptime history: `status.framique.com`, independent of the marketing site so it stays reachable during an incident affecting the main domain. Subscribe to status updates by email or webhook from that page.

For integration questions: the docs search (Band 1) covers the reference sub-pages first; unresolved questions go to the developer support queue from the dashboard, with `request_id` from any error response speeding up triage. There is no public community forum today — support is a direct queue, not a crowd-sourced one, so answers come from people who can see the actual gateway logs.

**Design note**: compact single-row band, canvas background, two inline links (`status.framique.com`, `Contact developer support`) — no card treatment needed for two links.

---

## 15. FAQ

*Lever:* **Objection handling at the point of hesitation** — these are the ten questions that stall an integration decision, answered plainly enough to unstall it.

1. **Is there a sandbox environment separate from the Try It panel?**
   Yes — `fq_test_` keys hit the same routes and shapes as production but write to an isolated test tenant with no real payment or SMS side effects.

2. **What happens to in-flight requests during a deploy?**
   Deploys are rolling; no request is dropped mid-flight, and the rate-limit window is unaffected by a deploy.

3. **Can I get a webhook for every event type, or only the allowlisted ones?**
   Webhook endpoints can subscribe to a specific list of event types or `*` for all current and future events on your plan tier.

4. **Do scopes ever expire independently of the key?**
   No — a key's granted scopes are fixed at creation and rotation; revoke or reissue the key to change them, since scopes are not a separate mutable resource.

5. **What timezone are timestamps in?**
   All timestamps are ISO 8601 UTC. Convert to Asia/Dhaka (UTC+6) client-side for display.

6. **Is `total_minor` always in the smallest currency unit?**
   Yes — minor units (poisha for BDT) to avoid floating-point rounding on money; divide by 100 for display.

7. **How long are export download URLs valid?**
   Signed URLs from `GET /exports/:id` expire one hour after issuance; re-fetch the export job to get a fresh URL rather than caching the old one.

8. **Can a single API key belong to more than one webhook endpoint?**
   Webhook endpoints are independent of API keys entirely — they're tenant-scoped, not key-scoped, so rotating a key never affects existing webhook subscriptions.

9. **What's the difference between `404 not_found` and a `403 scope_refused` on the same route?**
   `403` means the key is valid but lacks the scope; `404` means either the resource doesn't exist or it exists but belongs to a different tenant than the key — the API never distinguishes the latter two, to avoid leaking existence across tenants.

10. **Is GraphQL available?**
    No — the platform exposes REST only. This keeps the error taxonomy, idempotency and rate-limit model uniform across every resource, which a mixed REST/GraphQL surface would fragment.

**Design note**: standard `faq-row` accordion on canvas, one open at a time, keyboard-operable with `aria-expanded`.

---

## 16. Final CTA

*Lever:* **Momentum after resolution** — placed right after the FAQ clears the last objections, so the CTA catches intent at its peak rather than asking the reader to scroll back up.

**H2**: Ship the integration this week.
**Sub**: Scoped keys, signed webhooks, a sandbox that never touches your account.
**Primary CTA**: `Get an API key` → `/signup?next=/dashboard/developers`
**Alt CTA**: `Read the webhook guide` → `/docs/v1/webhooks`

**বাংলা variant**:
- H2: `এই সপ্তাহেই ইন্টিগ্রেশন চালু করুন।`
- Primary: `একটি API কী নিন` · Alt: `ওয়েবহুক গাইড পড়ুন`

**Design note**: gradient-spotlight final CTA card (violet-to-magenta), white pill primary, glass pill alt — the second and last gradient card on the page, after the hero mesh; keeps the "one or two gradient moments per page" rule intact.

---

## Internal linking plan

- Hero `Get an API key` → `/signup?next=/dashboard/developers`
- Hero `Jump to quickstart` → in-page anchor `#quickstart`
- Endpoint group rows → `/docs/v1/{group}` reference sub-pages
- Band 5 (idempotency) → `/docs/v1/idempotency` deep-dive
- Band 9 (webhooks) → `/docs/v1/webhooks` deep-dive, and dashboard `Developers → Webhooks`
- Band 11 (versioning) → `/changelog`
- Band 14 → `status.framique.com` (external), `/support`
- Recipe cards → matching guide pages once written (`/docs/v1/recipes/erp-sync`, etc.), stubbed as anchors until published
- Final CTA alt → `/docs/v1/webhooks`
- Footer (inherited from shell) → `/docs/v1/changelog`, `/pricing`, `/status`

## Image brief

- No photographic imagery on this page — it is code-first. The only "images" are:
  - Hero aurora mesh (violet #6a4cf5 → teal #14b8a6, low alpha, 24–38s drift loop, respects `prefers-reduced-motion`).
  - Final CTA gradient card background (violet → magenta).
  - Optional OG card for social shares: dark canvas, `Build on the Framique API.` in Geist display, a fragment of the quickstart curl sample rendered as a static code image in the lower third, 1200×630.

## Icon list

- Search (⌘K) — magnifier, 20px, ink-muted, ink on focus.
- Copy-to-clipboard — on every code block, ghost icon top-right, checkmark swap on click (200ms).
- Scope pills — small lock glyph for `mutating: true`, small eye glyph for read-only, no icon for neutral.
- Webhook delivery log — checkmark (delivered), clock (retrying), x (exhausted retries).
- Checklist (Band 9) — native markdown checkbox glyphs, unchecked state only (this is a reference list, not a tracked task list).
- Status band — small pulse dot, `semantic-success` green when status page reports all-clear (fetched client-side, degrades to no dot if the status API is unreachable — never shows a false green).

## Motion spec

- Hero aurora: continuous drift, 24–38s loop, opacity 0.12–0.22, disabled entirely under `prefers-reduced-motion`.
- Band reveal: opacity + 12px translate-Y on first scroll into view, 360ms, `cubic-bezier(0.22, 1, 0.36, 1)`, never re-triggers on re-scroll.
- Code block copy button: 160ms icon crossfade on click, no layout shift.
- FAQ accordion: height auto-animate via measured max-height, 280ms, ease-out.
- Try It panel: response pane fades in (200ms) after the simulated network delay resolves, so a call never feels instantaneous/fake.
- Primary CTA pills: magnetic hover capped at 6px, applies only to the two `button-primary` instances on the page (hero, final CTA) — not to every glass pill.

## Accessibility notes

- One `<h1>` per page load; all band headings are `<h2>`, recipe/step sub-headings are `<h3>`.
- Search field reachable by `Tab` before any CTA; `⌘K`/`Ctrl K` shortcut documented in an `aria-label`, not conveyed by icon alone.
- Code blocks are real `<pre><code>` elements, not images of code, so screen readers and text search both work; copy button has `aria-label="Copy code sample"` and announces "Copied" via `aria-live="polite"`.
- Scope table's PII/Mutates pills carry text, not color alone, satisfying color-independent comprehension.
- Error taxonomy table's `error.code` column uses monospace with sufficient letter-spacing to avoid ambiguous character confusion (`0`/`O`, `1`/`l`) at body size.
- Try It panel's redacted key placeholder is announced as "hidden for security" rather than read as raw asterisks by screen readers.
- All interactive elements meet a 44×44px touch target on mobile, including accordion rows and code-block copy buttons.
- Motion band (aurora, reveal-on-enter, magnetic hover) fully disabled under `prefers-reduced-motion: reduce`, with all content visible at rest rather than requiring a completed animation to become legible.

## Measurement plan

- **Activation funnel**: hero CTA click → key created → first successful (2xx) API call within 24h. This is the page's true north metric, not pageviews.
- **Quickstart completion**: scroll depth + code-block copy events on Band 2 as a proxy for "attempted the quickstart."
- **Try It engagement**: calls made per session, allowlisted-route distribution (tells us which resource developers most want to see before signing up).
- **Error-taxonomy usage**: search queries and anchor-scroll events into Band 8, segmented by `error.code` searched — a spike on one code signals a bug or an unclear message worth rewriting.
- **Webhook adoption**: percentage of active keys with at least one webhook endpoint registered within 7 days of key creation.
- **Docs search zero-results**: logged and reviewed weekly; a recurring zero-result query is either a missing doc or a naming mismatch between what developers call something and what we call it.
- **SDK vs no-SDK tab selection**: ratio informs whether to invest in additional language SDKs.
- **FAQ expand rate per question**: low-expand questions are candidates for removal or promotion into the main copy if they're actually load-bearing.
