# Origin split — storefront / commerce-platform / admin-builder (deployment specification)

Spec ONLY. No code, no deploy changes, no implementation. Branch `frame30`,
read-only pass except this file. File:line pins are to the tree as seen on
this branch.

**Interim control (already landed, cited as the stopgap):** the fail-closed
CORS policy in `src/lib/cors-policy.ts:1-28` — allowlisted origins are echoed
with credentials; anything else resolves to `null` and the caller MUST omit
both `access-control-allow-origin` and `access-control-allow-credentials`.
The credentialed-wildcard smell recorded in
`openspec/changes/dev-theme-runtime/inventory.md:127` is closed on the three
lanes that consume the policy. This spec assumes that control stays in place
until the split lands; it does not re-argue it.

Tone and gate conventions follow `docs/security/ci-gates.md`: every step
names what blocks, what detects failure, and what the rollback is. Nothing
here passes silently.

---

## 1. Current state (with evidence)

### 1.1 Verdict: single origin, path-based separation

One header pipeline serves every HTML document
(`src/server.ts:161-261` builder, applied `src/server.ts:866-879`). Console
hardening is a **path predicate**, not an origin: `isConsolePath` matches
`/dashboard`, `/dashboard`, `/root`, `/onboarding`, `/auth`
(`src/lib/console-headers.ts:10-22`), with the extra headers applied after the
base set (`src/server.ts:267-284`, `consoleSecurityHeaders`
`src/lib/console-headers.ts:25-32`). There is a single TanStack router
(`src/routes/__root.tsx`; storefront under `store/$slug/*`, consoles under
`_authenticated/*`). This matches the inventory verdict
(`inventory.md:120-128`).

### 1.2 Route map: what serves what today

| Concern | Routes (route files) | Notes |
|---|---|---|
| Storefront (platform-host path shape) | `src/routes/store.$slug.index.tsx`, `store.$slug.cart.tsx`, `store.$slug.search.tsx`, `store.$slug.pages.$pageSlug.tsx`, `store.$slug.blog.*.tsx`, `store.$slug.track.tsx`, `store.$slug.order.$orderId.tsx`, `store.$slug.sitemaps.$kind.ts`, `store.$slug.llms[.]txt.ts` | `/store/*` on platform hosts is 404-by-default with token/redirect exemptions (`src/server.ts:381-609`); custom-shape roots (`/p`, `/c`, `/pages`, `/search`, `/cart`, `/checkout`, `/account`) are host-gated, no rewrite (`src/server.ts:611-618`) |
| Storefront deep/custom-host roots | `src/routes/p.$productSlug.tsx`, `c.$collectionSlug.tsx`, `cart.tsx`, `checkout.tsx`, `track.tsx`, `order.$orderId.tsx`, `order.$orderId.confirmation.tsx`, `invoice.$token.tsx` | Personalized paths (`/cart`, `/checkout`, `/account`, `/order`, `/track`) are forced origin-only, never shared-cache (`src/server.ts:301-313`) |
| Marketing/CMS (public, unauthenticated) | `src/routes/index.tsx`, `pricing.tsx`, `faq.tsx`, `security.tsx`, `payments.tsx`, `contact.tsx`, `blog.*`, `docs.*`, `legal.*`, `fulfilment.tsx` | Same origin, same pipeline |
| Merchant admin-builder (console) | `src/routes/_authenticated/route.tsx` (gate, `ssr:false`, Supabase session check + `/auth` redirect, `:5-28`), `src/routes/_authenticated/dashboard.tsx` + `dashboard/*.tsx` (orders, builder, marketplace, billing, security-approvals, …), `src/routes/_authenticated/onboarding.tsx`, `src/routes/auth.tsx`, `reset-password.tsx` | AuthN is route-level `beforeLoad`, not origin-level |
| Platform admin (root console) | `src/routes/root.tsx`, `src/routes/root/*.tsx` (tenants, users, money, fraud, audit, gateway, ops, …), `src/routes/root/login.tsx`, `src/routes/root/auth.tsx` | Same path-predicate hardening as merchant console |
| Commerce-platform API (public lanes) | `src/routes/api/public/v1/$.ts` (REST gateway), `api/public/oauth/token.ts`, `api/public/oauth/revoke.ts`, `api/public/payments/*` (live/mock/platform/return), `api/public/couriers/$carrier.ts`, `api/public/channels/$channel.ts`, `api/public/media/$.ts`, `api/public/img/$.ts`, `api/public/font/$.ts`, `api/public/ads/click.ts`, `api/public/analytics/beacon.ts`, `api/public/vitals.ts`, `api/public/metrics.ts`, `api/public/errors.ts`, `api/public/error-alert.ts`, `api/public/newsletter/feedback.ts`, `api/public/support/stream.ts`, `api/public/domains/verify-sni.ts`, `api/public/domains/callback.ts`, `api/public/cron/*` (14 jobs), `api/public/ph.$.ts` | Only three lanes emit credentialed CORS (see §1.4); the rest emit none |
| Internal/admin API | `src/routes/api/admin/merchant.$id/risk-tier.ts` (server functions, no CORS headers), `src/routes/api/healthz` + `/healthz` (`src/server.ts:727-741`), `src/routes/api/canary-alert` (`src/server.ts:743-765`), `src/routes/pkg.$.ts` | Same origin as everything else |

### 1.3 Cookie scopes and flags as they are

| Cookie / storage | Writer | Flags today | Evidence |
|---|---|---|---|
| `fq.active_merchant_id` (active-store hint) | `writeMerchantCookie`, client-side `document.cookie` | `path=/; max-age=31536000; SameSite=Lax`. No `Domain=`, no `Secure`, no `__Host-`/`__Secure-` prefix | `src/hooks/use-merchant.ts:41-48`; mirror constant `src/lib/merchant-scope.server.ts:18` |
| Server-side reading of the hint | `parseActiveMerchantCookie` / `requestMerchantHint` | UUID-validated, **hint-never-trust**: only a `merchant_id` from the caller's own membership rows is returned | `src/lib/merchant-scope.server.ts:13-16,23-36,44-64` |
| `framique.lang` (locale boot) | `persistLangCookie`, client-side | `Path=/; Max-Age=1y; SameSite=Lax`, plus `Secure` only when `location.protocol` is https | `src/lib/lang-boot.ts:23-25,91-99` |
| Supabase auth session | `@supabase/supabase-js` client, `persistSession: true`, storage = `brokeredPreviewStorage()` = `window.localStorage` (undefined on server) | Bearer tokens in **JS-accessible `localStorage`**, shared by every path on the origin; server/edge middleware clients use `persistSession: false` | `src/integrations/supabase/client.ts:56-65`, `src/integrations/supabase/previewAuthStorage.ts:5-8`, `src/integrations/supabase/client.server.ts:58-59`, `src/integrations/supabase/auth-middleware.ts:136-137` |
| Refresh-token cookie claim | Marketing copy only | Copy states refresh tokens are "stored in an httpOnly, Secure, SameSite=Lax cookie — never in localStorage" | `src/lib/marketing/security.content.ts:124` — **see UNCERTAIN §5.1**: no `Set-Cookie` emission exists anywhere in `src/` (grep for `Set-Cookie|set-cookie|setCookie|Domain=` finds only an unrelated prop name), so this describes GoTrue-side intent, not app-emitted cookies |
| Edge cache awareness | nginx `map $http_cookie` | Any cookie matching `sb-|session|token|auth|logged_in` bypasses the shared storefront cache — note `fq.` and `framique.` cookies do **not** match and do not bypass | `ops/routing/nginx-blue-green.conf:84-97` |

Net: cookies are host-scoped (`Path=/`, zero `Domain=` in the tree) but
**surface-unscoped** — the admin's store hint, the shopper's locale, and the
localStorage session all live on the one origin and are sent to (or readable
by) every path on it. No `__Host-` prefixing, no per-surface scopes
(inventory §11 row 4, still accurate).

### 1.4 CORS posture after the fail-closed policy

- Policy: `resolveAllowedOrigin` echoes back origins whose hostname ends with
  `.framique.store` / `.framique.com`, equals `framique.qubickle.com`, or is
  `localhost` (covers `http://localhost:port`); missing/malformed/foreign
  origins return `null` (`src/lib/cors-policy.ts:11-28`).
- Consumers (all three omit both headers on `null` — no wildcard, no
  bare-credentials response): `src/routes/api/public/v1/$.ts:9-22`,
  `src/routes/api/public/oauth/token.ts:10-21`,
  `src/routes/api/public/oauth/revoke.ts:8-19`.
- Pinned by `src/lib/cors-policy.test.ts:10-42` (allowlist echo, null on
  missing/foreign/malformed, suffix-anchoring against
  `framique.store.evil.com`).
- Font lane emits `access-control-allow-origin: *` **without** any
  `allow-credentials` header (`src/routes/api/public/font/$.ts:39-46`) —
  safe, not a violation, and out of scope for the credentialed-lane policy.
- Every other public lane (payments, couriers, channels, media, img, beacon,
  vitals, metrics, errors, ads, newsletter, support, cron, `ph`) emits **no
  CORS headers at all** (grep for `access-control-allow-origin` under
  `src/routes/api` hits only the four files above). They are same-origin /
  non-browser lanes today — which is exactly why §5.3 flags them as a
  cutover risk: any legitimate cross-origin fetcher that appears later must
  go through the per-lane allowlist, not a wildcard.

### 1.5 CSRF posture (same-host, not an origin split)

Tenant-aware CSRF on all mutations except `/api/public/*` and
`/api/canary-alert` (`src/server.ts:641-725`): same-host via
`resolveEffectiveHost` (spoofed `x-forwarded-host` ignored), merchant custom
domains via DB-backed allowlist (`lookupActiveMerchantDomain`), payment-gateway
POST-back origins only on `/api/public/payments/*`
(`src/lib/csrf.server.ts:47-127`). HTTPS enforced except loopback and
anchored preview hosts (`src/server.ts:620-639`).

### 1.6 Deploy topology that grounds the migration

- Single build artifact, single service: `bun run build` in an ephemeral
  worktree, `rsync` of `.output/`, `systemctl restart framique.service`
  (`ops/deploy-from-git.sh:33-62`). The ONLY supported path is a pushed
  branch, one deploy at a time under a lock (`:1-29`).
- Blue/green upstreams `framique-blue:3000` / `framique-green:3000`, keepalive
  64 (`ops/routing/upstream.conf:7-17`); canary cohort/slot routing with
  client-supplied `x-framique-*` headers blanked at the edge
  (`ops/routing/nginx-blue-green.conf:177-192,232-239,330-336`; server strips
  them again `src/server.ts:373-379`).
- One edge `server_name _` on :80 and :443 proxies **everything** to the same
  backend (`nginx-blue-green.conf:197-276,281-370`); TLS via lua-resty-acme
  with SNI whitelist (platform suffixes always approved; custom hosts verified
  live against `/api/public/domains/verify-sni`, `:119-166`); hardened
  TLSv1.2/1.3 params (`:295-301`).
- Edge cache bypass treats `/api|_authenticated|dashboard|auth|root|healthz`
  as private and personalized store paths as private (`:72-77`).
- Deploy verification matrix today: `/store/<slug>` 404-vs-301 permalink
  checks, `/` 200, primary custom-host home+`/cart` 200 with retry, 8× TLS
  cert-identity sampling, unmapped-host bare 404, `ph` lane 200
  (`ops/deploy-from-git.sh:64-149`).

---

## 2. Target topology

Hostnames below are **placeholders (operator decision, see UNCERTAIN §5.2)**;
roles and boundaries are normative, names are not.

| Origin | Role | Serves | MUST NOT serve |
|---|---|---|---|
| **Storefront** (`shop.<platform>` + every merchant custom host) | Anonymous shopper traffic | `store/$slug` paths (while they live), custom-shape roots (`/p`, `/c`, `/pages`, `/search`, `/cart`, `/checkout`, `/account`, `/track`, `/order/*`, `/invoice/*`), marketing/CMS pages, public asset lanes (font/img/media GET) | Any `/_authenticated/*`, `/dashboard/*`, `/root/*`, `/api/admin/*` path (answer 404 or redirect to admin origin — edge decision, §3 step 6) |
| **Commerce-platform API** (`api.<platform>`) | Authenticated commerce calls from storefronts and admin | `/api/public/v1/*`, `/api/public/oauth/*`, payment/courier/channel lanes, beacons/metrics | HTML documents, console routes |
| **Admin-builder** (`admin.<platform>`) | Merchant consoles + platform root console | `/_authenticated/*`, `/dashboard/*`, `/root/*`, `/auth`, `/onboarding`, `/api/admin/*` | Storefront shopper paths (redirect to storefront origin) |

### 2.1 Cookie scoping per origin (normative)

1. **Host-only, always.** No `Domain=` on any cookie, ever (today's posture —
   zero `Domain=` in tree — becomes a pinned invariant, not an accident).
2. **`__Host-` prefix for every privileged cookie**: requires `Secure` +
   `Path=/` + absent `Domain`. Concretely: rename `fq.active_merchant_id`
   to `__Host-fq.active_merchant_id` (reader accepts both during dual-write,
   §3 step 4), always emit `Secure` (drop the `location.protocol` conditional
   in `persistLangCookie`), keep `SameSite=Lax` for top-level-navigated flows
   (OAuth return, payment return) and use `SameSite=Strict` only where the
   flow never relies on top-level cross-site navigation (decision per cookie,
   recorded at implementation time — not in this spec).
3. **No shared privileged sessions between storefront and admin.**
   Admin/merchant sessions (Supabase localStorage session + any future
   httpOnly session cookie + the active-merchant hint) are scoped to the
   admin-builder origin only: never minted, never `Set-Cookie`d, never read
   on the storefront or API origins. The origin split automatically partitions
   `localStorage` sessions (they are per-origin by web definition) — this is
   the single largest security gain of the split and it requires no session
   format change.
4. **Visitor state stays visitor-side and unprivileged**: `framique.lang` and
   equivalent prefs remain per-host, non-httpOnly, never accepted as auth.
   Cart/checkout tokens remain opaque, merchant-scoped, server-validated
   (existing `reserveStock`/`consumeStock` merchant-mismatch-≡-missing-hold
   semantics are unchanged).

### 2.2 CORS explicit allowlist per API lane (normative)

No wildcards with credentials — already the code policy
(`src/lib/cors-policy.ts:4-10` header contract); the split extends it from
one global allowlist to **per-lane** allowlists:

| API lane | Allowed origins (credentialed) | Non-allowlisted Origin |
|---|---|---|
| `v1` (public REST) | Storefront origin(s) + verified merchant custom domains (DB-backed, same source as CSRF `lookupActiveMerchantDomain`) | Omit both headers (current behavior) |
| `oauth/token`, `oauth/revoke` | Admin-builder origin + storefront origin(s) (PKCE public clients live on both) | Omit both headers; error responses keep `no-store` |
| Payments return/callback lanes | Payment-gateway origins only, path-scoped as today (`csrf.server.ts:47-76`); no browser-credential CORS needed | No CORS headers (current behavior — keep) |
| Font/img/media/beacon GET lanes | `*` without credentials where the resource is public (font lane precedent), otherwise no CORS headers | Unchanged |

### 2.3 What crosses boundaries (and what does not)

- **Crosses storefront → API**: shopper-scoped opaque tokens (cart/checkout
  tokens, OAuth authorization codes with PKCE, token-gated order/invoice
  tokens), always over HTTPS, always validated server-side against the owning
  merchant. These exist today and are unchanged in format.
- **Crosses admin → API**: merchant member session (Bearer, short-lived) +
  `merchant_id` re-derived per request from membership rows (never trusted
  from the client hint).
- **Crosses admin → storefront**: draft preview tokens (`preview_token`,
  merchant-bound, verified in `src/server.ts:404-443`) — remain the ONLY
  mechanism by which admin identity influences storefront rendering, and they
  stay single-merchant, short-lived, noindex/private
  (`src/server.ts:315-328`).
- **NEVER crosses**: admin/localStorage sessions to the storefront origin;
  the active-merchant hint cookie to the API/storefront origins; platform
  `root` identity to any merchant-scoped surface (merchant-mismatch-≡-missing
  semantics stay fail-closed).

---

## 3. Migration in ordered steps

Each step states blast radius, failure detection (naming the existing
suite/gate that covers it, or marking the NEW check needed), and rollback.
Steps are strictly ordered; do not skip.

### Step 0 — Pre-conditions (no traffic impact)

- Enumerate live hostnames: active primary custom domains (same query the
  deploy script uses: `merchant_domains WHERE status='active' AND is_primary`),
  platform hosts, anchored preview suffixes. Record the three target origin
  names (operator decision).
- Land the per-lane CORS contract tests and the dual-read cookie tests
  BEFORE any infra change (they must pass against the single-origin tree).
- Blast radius: none. Detect: `unit-contract` CI job
  (`.circleci/config.yml:58-68`). Rollback: n/a.

### Step 1 — DNS + TLS for the two new origins

- Add DNS for API and admin-builder names; extend the edge SNI whitelist
  (`nginx-blue-green.conf:119-129`) or the verify-SNI path (`:133-166`) to
  cover them; confirm ACME issuance per replica (the per-replica storage skew
  noted in `deploy-from-git.sh:92-99` means issuance must be verified on
  EVERY edge replica, not one).
- Blast radius: none until traffic shifts (new names serve nothing yet).
- Detect: NEW check needed — per-replica `openssl s_client` identity sampling
  (extend the existing 8× sampling loop `deploy-from-git.sh:119-139` to the
  new names; fail on any sample not covering the name).
- Rollback: remove DNS records / revert whitelist include; old single-origin
  serving is untouched.

### Step 2 — Dual-serve (shadow): new origins proxy to the same backend

- Add edge `server` blocks (or `map`-based routing) so the new names proxy to
  the current blue/green upstreams with identical behavior. No cookie, CORS,
  or route changes. Exercise with synthetic Host-header traffic and real DNS.
- Blast radius: operators/synthetics only; shoppers and merchants unaffected.
- Detect: existing deploy verify matrix (`deploy-from-git.sh:64-149`) run
  against all three names + `/api/healthz` 200 on each.
  (`e2e-critical` requires `build` first — `.circleci/config.yml:250-252` —
  so run it after a green build.)
- Rollback: point DNS back / remove blocks; single-origin behavior is the
  fallback by construction.

### Step 3 — CORS tightening verification (per-lane allowlists live, still permissive-superset)

- Deploy lane-aware allowlists whose union still covers current callers
  (superset first, tighten later). Probe every lane with `OPTIONS` +
  crafted `Origin`: allowlisted → echo + `credentials: true`; foreign →
  both headers absent; malformed/missing → absent.
- Blast radius: browser-based API callers only; non-browser callers send no
  `Origin` and are unaffected (policy returns `null` → headers omitted, which
  non-browser clients ignore).
- Detect: existing `src/lib/cors-policy.test.ts` (unit) + NEW check needed —
  synthetic preflight probe script (suggest `scripts/cors-preflight-probe.mjs`,
  run in CI `scan` or as a deploy-verify step) that asserts echo-vs-omit per
  lane per origin. The `scan` job's SAST `network-egress` rule
  (`docs/security/ci-gates.md:33-39`) stays green by construction (no new
  egress hosts).
- Rollback: revert allowlist config to the single global policy; the code
  contract (omit-on-null) is unchanged so revert is config-only.

### Step 4 — Cookie re-scoping with dual-write period

- Begin emitting `__Host-`-prefixed, `Secure`, host-only replacements
  alongside legacy cookies (dual-write); server readers accept both, preferring
  the new. Duration: at least 2× the longest cookie `max-age` that matters
  operationally, or one forced re-login cycle — whichever the operator picks
  (record the choice; default proposal: 14 days dual-write, then legacy-read
  removal in a second deploy).
- Blast radius: signed-in merchants/admins (cookie churn); shoppers see at
  worst a locale reset (cosmetic, `lang-boot` falls back to `en`).
- Detect: existing `merchant-scope.test.ts` (dual-read cases — extend, do not
  replace) in `unit-contract`; auth success/error rate + session-revocation
  counters in observability during the window; `e2e-critical` auth flows must
  stay green. NEW check needed if absent: login→switch-merchant→reload probe
  asserting the new cookie is present and the legacy one is ignored.
- Rollback: stop emitting new cookies; readers still accept legacy, so
  rollback is a forward deploy that deletes the writer. No data migration.

### Step 5 — Session invalidation plan (cutover event)

- At cutover: server-side revocation of outstanding sessions ("log out
  everywhere" path per `marketing/security.content.ts:129` claim), forcing
  re-login on the admin-builder origin. Announce the window; staff/offboarding
  revocations use the same path.
- Blast radius: ALL signed-in admins/merchants must re-authenticate once.
  Shoppers are unaffected (no privileged shopper sessions exist).
- Detect: auth error-rate spike must decay within the announced window;
  support volume; `e2e-security` adversarial specs stay green
  (`.circleci/config.yml:222-235`). NEW check needed: post-cutover assertion
  that a pre-cutover session token is rejected on every origin.
- Rollback: re-issue sessions (users log in again); there is no state to
  restore — rollback IS the re-login flow. If revocation was partial, complete
  it rather than rolling back (partial revocation is worse than full).

### Step 6 — Cutover routing (edges enforce the split)

- Edge maps become authoritative: admin/console/API paths 404 (or 301 to the
  canonical origin — one choice, recorded) on the storefront origin and vice
  versa; extend the existing `$path_skip_cache`/`$skip_cache` maps
  (`nginx-blue-green.conf:72-97`) and the in-app gates
  (`isBlockedPathStorefront`, `isBlockedThemePreview`,
  `src/server.ts:381-609`) to be origin-aware. Extend the deploy verify matrix
  per origin (storefront name must 404 `/dashboard/*` and `/root/*`; admin
  name must redirect-or-404 store paths; API name must serve no HTML).
- Blast radius: total if wrong (all traffic). This is why steps 0–5 precede it.
- Detect: extended `deploy-from-git.sh` verify matrix (per-origin 404/301/200
  assertions — the script already has the pattern at `:71-90`); `build` hard
  gate before any E2E (`.circleci/config.yml:245-257`); `plugin-storefront-gate`
  tripwires for storefront regressions.
- Rollback: revert the edge include to the pre-split `server` blocks
  (keep the pre-split `nginx-blue-green.conf` + `upstream.conf` generation
  inputs versioned so revert is a single-file restore + reload, blue-green
  style — standby slot stays warm per `upstream.conf:10-14`).

### Step 7 — Post-cutover hardening sweep (close the loop in code)

- Assert: zero `Domain=` in tree, zero credentialed `*`, per-origin
  `frame-ancestors` (storefront `self`, consoles `none`), CSP `connect-src`
  covering the API origin, edge cache maps matching the new path layout.
- Blast radius: none (verification only).
- Detect: existing gates — `scan` (secret scan + SAST `csp-sandbox` rule +
  blocking dep audit), `server-csp`/`platform-shell-csp`/`hardening.contract`
  tests, `unit-contract`. NEW check needed only if the sweep finds a gap:
  file it as a POLICY-ONLY row in the next inventory pass, same format as
  `inventory.md`.

---

## 4. Code changes the migration will eventually require (file-level, no implementation now)

A future engineering pass executes these without rediscovery. Grouped by
area; each names the file and the change shape. NOT implemented in this doc.

**CORS / lane policy**
- `src/lib/cors-policy.ts` — split `resolveAllowedOrigin` into a lane-aware
  resolver (lane → allowlist source: static storefront set vs DB-backed
  merchant domains); keep the fail-closed omit-on-null contract byte-identical.
- `src/lib/cors-policy.test.ts` — per-lane cases (v1 vs oauth vs public-GET),
  custom-domain allowlist cases, suffix-anchoring regression cases.
- `src/routes/api/public/v1/$.ts:9-22`, `api/public/oauth/token.ts:10-21`,
  `api/public/oauth/revoke.ts:8-19` — adopt the lane resolver; no other
  behavior change.
- NEW `scripts/cors-preflight-probe.mjs` (name proposal only) — synthetic
  OPTIONS prober per lane per origin, wired into CI `scan` or deploy-verify.

**Session middleware / cookies**
- `src/hooks/use-merchant.ts:45-48` (`writeMerchantCookie`) — emit
  `__Host-`-prefixed, `Secure`, `Path=/`, `SameSite=Lax` value; dual-write
  during migration; admin-origin guard (no-op on other origins).
- `src/lib/merchant-scope.server.ts:18-36` — new constant + dual-read
  (`parseActiveMerchantCookie` accepts legacy + new, prefers new); legacy-read
  removal as a separate, later change.
- `src/lib/lang-boot.ts:91-99` (`persistLangCookie`) — unconditional `Secure`
  on https origins; document visitor-cookie policy (no auth semantics).
- `src/integrations/supabase/client.ts:56-65` + `previewAuthStorage.ts` —
  verify partition-by-origin (automatic) and confirm no shared
  service-worker/CacheStorage leaks the session across origins (see
  UNCERTAIN §5.4).
- `src/routes/_authenticated/route.tsx:5-28` — origin guard: redirect to the
  admin-builder origin when the gate executes elsewhere (canonical-host
  redirect, same pattern as the store redirect logic in `src/server.ts:546-566`).

**Route layout / headers / CSRF**
- `src/server.ts:161-261` (`withSecurityHeaders`) — origin-aware CSP emission
  (`connect-src` gains the API origin; `frame-ancestors` per origin).
- `src/server.ts:267-284` + `src/lib/console-headers.ts:10-32` — console
  headers keyed on origin in addition to path (defense in depth; path
  predicate stays as the inner check).
- `src/server.ts:381-609` (path/storefront gates) — add origin dimension
  (admin paths unreachable on storefront origin and vice versa).
- `src/server.ts:641-725` + `src/lib/csrf.server.ts:87-127` — trust matrix
  gains the three canonical origins; merchant custom-domain lookup unchanged
  as the storefront-membership source.
- `src/routes/root/*.tsx`, `src/routes/_authenticated/dashboard/**/*.tsx` —
  no per-file logic change expected; covered by the route-level origin guard
  and edge maps (listed here so the pass verifies that assumption route by
  route).

**Config / ops**
- `ops/routing/nginx-blue-green.conf` — per-origin `server` blocks (or
  origin-keyed maps), extended `$path_skip_cache`/`$skip_cache` maps,
  SNI whitelist entries for the two new names.
- `ops/routing/upstream.conf` (+ generator, if any) — keep blue/green shape;
  version the pre-split inputs so step-6 rollback is a single restore.
- `ops/deploy-from-git.sh:64-149` — per-origin verify matrix (expected
  200/301/404 per name), per-replica TLS identity sampling for all three
  names, pre-cutover dual-serve assertions.
- `ops/.env.example` — new origin names + cookie/CORS config keys (names TBD
  with §5.2).
- `.circleci/config.yml` — wire the NEW preflight probe (step 3) and the NEW
  post-cutover session-rejection assertion (step 5) into blocking jobs
  (propose `scan` and `e2e-security` respectively); no new non-blocking steps
  (attribution stays `|| true` per `docs/security/ci-gates.md:61-75`).

---

## 5. Topology facts that could NOT be verified (UNCERTAIN)

1. **Supabase-issued httpOnly cookies.** No `Set-Cookie` emission exists in
   `src/`; the only session persistence in code is `localStorage`. Whether
   GoTrue sets httpOnly refresh cookies in this deployment (as
   `marketing/security.content.ts:124` states) depends on live Supabase
   configuration outside this tree — confirm from the Supabase dashboard /
   response headers before writing the cookie-migration runbook.
2. **Canonical hostnames for the three origins.** Operator decision (DNS
   zone, cert strategy, customer-communication impact). Placeholders in §2
   carry no authority.
3. **Unknown cross-origin fetchers on currently CORS-silent lanes.** Most
   public lanes emit no CORS headers today (§1.4); any legitimate browser
   client fetching them cross-origin after the split breaks loudly. Needs an
   edge access-log audit (`Origin` header census per lane) during step 2
   before tightening.
4. **Service-worker / CacheStorage / shared-worker scope.** Not inspected in
   this pass. If any worker is registered at `/` scope on the single origin,
   it must be re-scoped (or removed) per origin at cutover, or it will serve
   cross-surface responses from cache. Confirm with a tree search for
   `serviceWorker` / `caches.` before step 6.
5. **ACME storage skew interaction with new names.** `deploy-from-git.sh:92-99`
   documents per-replica cert skew for one custom host today; three origins
   triple the issuance surface. Step 1's per-replica sampling is the
   mitigation; shared ACME storage (vs per-replica files) is the durable fix
   and is an ops decision outside this spec.
6. **Preview-deploy host interplay.** `isPreviewDeployHost` /
   `isEditorPreviewHost` relax framing and HTTPS in precise ways
   (`src/server.ts:96-105,202-206`); how preview deployments map onto three
   origins (one preview per origin? single preview with all paths?) is
   undecided and must be specified before step 2.

---

## 6. Deviations

- None from the task constraints: stayed on branch `frame30`, no branch
  switch, no commits, no pushes, no deploys, no modifications to any existing
  file (reads only). This doc is the single new file, at the exact required
  path `openspec/changes/dev-theme-runtime/origin-split.md`.
- No API rate limits were encountered (no external API was called; all
  evidence is local-file reads), so no wait/retry was needed.
- Scope notes: Supabase Session / GoTrue server-side behavior was judged
  from client code + marketing copy only (see UNCERTAIN 1); `reviewVersion`
  role-enforcement and route-level moderation authZ were out of scope and not
  re-traced; SRI/dependency-DENY state was taken from `inventory.md:99-111`
  without re-verification (unchanged by this spec either way).
