# 01 — Architecture: Custom domains & storefront subdomains

Status: Planning · Co-located depth spec (parent: `01-architecture/README.md`)
Owners: Platform/Edge (verification, TLS, routing) + Backend (domains surface, entitlements)
References: `01-architecture/README.md` (edge, tenancy, RLS, Storage+imgproxy) · `03-storefront/README.md` (serving path, 60s edge-cache TTL) · `03-storefront/accounts.md` (cookie/session contract) · `05-marketing/README.md` (consent, analytics retention) · `16-product-pricing/README.md` (plan entitlements) · `00-meta/design-system.md` §1–§3, §5, §10 · `15-e2e/README.md` (`.e2e/` suite naming)

Design decision (approved): **every storefront always has one canonical FQDN — the platform subdomain `<merchant>.store.framique.com` for life — plus at most one verified custom FQDN** (`custom_domains`, below) served from the **same edge and serving path** as the platform subdomain. **No new service and no storefront code change**: the edge resolves the Host header to a tenant, adds the trusted `X-Tenant`/`merchant` context *server-side*, and proxies to the unchanged theme runtime. A custom domain never binds serving until its ownership proof **and** its ACME certificate both succeed; on any lapse the store automatically falls back to the platform subdomain (fail closed, never fail open to a stranger's host).

---

## 1. Purpose

Customer-facing stores are served on `<store_id>.store.framique.com`. Merchants need their own brand hostname (`example.com` or `shop.example.com`) without forking the serving path. This spec gives every store **one custom host** with: deterministic TXT-record ownership proof, ACME-issued TLS on the existing lua-resty-acme edge loop, canonical-host handling (`www` 301s to the canonical), and a domains settings surface where the merchant pastes a record and watches it activate.

Scope:

- One custom hostname per tenant, chosen between **apex (canonical)** and a bare named host; `www` and `store.<apex>` are non-canonical aliases.
- Trusted **TXT-record ownership check** (deterministic, single-use token) before a host is ever served.
- TLS via the existing platform ACME loop (lua-resty-acme); custom domains never use per-customer certificates.
- Automatic **fallback to the platform subdomain** when a custom host is unverified or its certificate lapses.
- SEO surface: the **canonical** host stays the apex-when-active, else the platform subdomain; sitemap and robots render on the canonical host only.

It never changes the storefront render path. Aliases get no cache key, no cookies, no session: they exist only to redirect.

## 2. Custom domain model & state machine

```
custom_domains {
  merchant_id (uuid, RLS scoped; one row context per tenant),
  fqdn (text, lower-nfkc, punycode-normalized),
  kind: apex | named,          -- apex is canonical; www / store.<apex> are aliases
  txt_state: provisioned | verified (single-use token per cycle),
  verify_tx_at (timestamptz), verify_attempts (int),
  cert_state: pending | issued | expiry (lua-resty-acme),
  cert_not_after (timestamptz),
  renewal_job (uuid → bullmq), fallback_epoch (timestamptz),
  state, -- state machine below
  requested_at / verified_at / activated_at / removed_at
}
```

- **Uniqueness**: `(merchant_id, fqdn)` unique; one active `verified` custom host per tenant — quantity via `check_entitlement(tenant_id, 'domains', 1)` from `16-product-pricing`; never an invented cap.
- **State machine**:
  ```
  requested → pending_verification → active → expired_dangling (DNS-verify timeout) → removed
  ```
  - `requested → pending_verification`: merchant saved the record values; the edge awaits proof.
  - `pending_verification → active`: **both** gates hold — (a) TXT token exact-match for tenant+domain, and (b) ACME certificate actually issued. `verify_attempts` resets on any TXT mismatch.
  - `active → expired_dangling`: DNS verification times out inside the verify window, or the certificate lapses. `expired_dangling` means the custom host is **never served**; traffic falls back to the platform subdomain.
  - `expired_dangling → removed`: owner-initiated remove in the domains surface (server-side; never client-trusted).
- **No destructive delete**: the merchant cannot hard-delete; the surface offers the lifecycle above. Platform-side hard delete exists only infra-side.
- **Events** (`domain.*` core): `domain.requested`, `domain.verify_started`, `domain.verified`, `domain.active`, `domain.expired_dangling`, `domain.removed`, `domain.renewal_scheduled`, `domain.renewal_failed`. **No event ever carries a TXT token or certificate key.**

## 3. Ownership verification

- **Deterministic TXT-only check**: the edge resolves exactly one `TXT` record per tenant+domain; it never follows A/AAAA (kills DNS-rebind and IP capture), and never resolves user-supplied hostnames outside the record.
- The **TXT token** is single-use per verify cycle, generated and owned platform-side, revealed once to the merchant in the DNS instructions modal (copy button). Re-verification always issues a fresh token.
- Poll: re-check every `${verify_interval}` (TBD — proposed 60s, owner SRE) while `pending_verification`; the whole window is `${verify_timeout_minutes}` (TBD — proposed 720/12 h, owner SRE). On timeout → `expired_dangling` (never silent: `domain.verify_timeout`).
- **Self-serve check**: a rate-limited "Re-check now" action in the surface re-runs the TXT lookup immediately before the next poll tick; it walks the exact same code path as the poll (`lookup_clean`), never a second implementation.

## 4. TLS & renewal (platform ACME loop)

- Built on the edge's existing lua-resty-acme loop (`01-architecture/README.md` §1 edge except the tenant subdomain). Custom hosts join the **platform ACME loop**; certificates are platform-issued, validity `${cert_valid_days}` (TBD — commonly 90, owner Backend/Edge), renewed at `${renew_lead_days}` (≈ T-60, TBD — owner Backend/Edge).
- Certificate state is pulled from lua-resty-acme (`cert_state`, `cert_not_after`); the certificate-linked availability walks into the `pending_verification → active` gate from §2.
- `domain.renewal_scheduled` fires when the ACME loop schedules; a failed renewal raises `domain.renewal_failed` + edge alert, keeps serving within the certificate window, then laps to `expired_dangling` at certificate expiry — the fallback path is warm and untrusted, so customers are never interrupted.

## 5. Edge routing & fallback

- At the edge, Host → tenant map (safe lookup) yields `merchant_id` + `is_canonical` = the canonical FQDN for the tenant. The tenant header is **server-side only**; the client never passes a tenant.
- Canonical host policy:
  - `active` custom apex (or bare named host) ⇒ that FQDN is canonical; SEO `canonical`/`og:url`, sitemap and robots render on it.
  - No active custom domain (still `pending_verification`, `expired_dangling`, or removed) ⇒ canonical is the platform subdomain `<store_id>.store.framique.com`.
- Aliases (`www.<canonical>`, `store.<apex>`) are one-way permanent `301`s to the canonical; they never create their own cache key, cookie domain, or session.
- Cookie/session scope follows `03-storefront/accounts.md`: the runtime cookie domain is fixed at the platform cookie scope (`store.framique.com`) so the checkout/consent session token survives an apex change. Changing the canonical host **does not** re-issue the anonymous session cookie — it persists. Only the verification banner is affected, never the session.
- **HSTS** applies to the **custom host only** (certificate-scoped, never global — the fallback host must stay reachable); `${hsts_max_age_secs}` (TBD — pending platform policy, owner SRE).
- TLS min 1.2 on the edge; forced-HTTPS redirect for the whole storefront.

## 6. Domains settings page (admin surface)

- **Page** `admin/settings/domains`: one card per tenant (no pagination at the 1-host cap). Rows show: fqdn, kind, state (`state` from §2), verification/activation progress, canonical badge, and a destroy pathway — remove is destructive (`expired_dangling → removed`) with a mirror-text confirm; never color-only.
- **DNS instructions modal**: host, record type `TXT`, and the value in a monospace, selectable block (single-use, never re-shown). Inline steps: add the record at the DNS provider, keep the TTL low for faster lookups, then either wait for the automatic `${verify_interval}` recheck or press **Re-check now**; progress is live-updated (polling) and ends in the sorted state — `active` once both gates from §2 hold.
- Copy is explicit: a custom host only goes live after the TXT check **and** the certificate are sorted; otherwise the store keeps serving from the platform subdomain (`domain.verify_timeout` explains exactly why it fell back).

## 7. Design guidelines — Domains page & DNS instructions modal

- **Intent**: a calm checklist, not a ceremony — a merchant finishes in a few copy/pastes at their DNS provider. The trust signal is two state marks (TXT then certificate), not chrome.
- **Key surfaces**: Domains row (set identity card), DNS instructions modal (monospace value + step list), live status line.
- **Palette**: teal = primary + active; amber (Bondhu) = pending; Mint = verified/ready only; Rickshaw Red = unverified/expired. **Never color-only** — every status ships a text label first (Bangla + English, AA).
- **Typography**: tabular numerals for hostnames, counts, and the TTL hint; Bangla display for the title; tabular-nums for the countdown/pulse.
- **Density**: the window is sparse; the modal is one column, one step highlighted at a time.
- **Motion**: 120 ms state transitions; the reveal/new-state show a 200 ms fade; `prefers-reduced-motion` collapses to opacity (design-system §5).
- **A11y**: the modal is fully keyboard-able, the value is selectable text (never an image), the screen reader announces the state in Bangla + English (AA), no auto-dismiss.
- **Anti-slop**: no placeholder shield — tie the visual to the merchant's own store mark: a two-step "TXT → certificate" check mark with their monogram.

## 8. Testing gates

- `store_loop` adds: host→tenant resolution correctness for `active` vs `requested`; canonical 301 for `www`/alias; fallback keeps serving from the platform subdomain after `expired_dangling`.
- `admin_loop` covers: token flows (request → re-check → timeout), and the repeat-pressed flow stays on `pending_verification` (no state confusion when a TXT matches but the cert is pending).
- Failure suites: DNS returns an invalid TXT → stays `pending_verification`, `verify_attempts` increments; verify window expires → `expired_dangling` → fallback; ACME issuance failure raises `domain.renewal_failed` then `expired_dangling` at cert expiry; backup → restore keeps `verify_tokens` consistent.

## 9. Named-parameter ledger (approved TBD — owner-signed)

| Parameter | Default | Owner | Where it is read |
|---|---|---|---|
| `verify_interval` | 60 s | SRE | §3 poll; §6 window copy |
| `verify_timeout_minutes` | 720 (12 h) | SRE | §2 window; `admin_loop` |
| `renew_lead_days` | T-60 | Backend/Edge | §4 `domain.renewal_scheduled` |
| `cert_valid_days` | 90 | Backend/Edge | §4 `cert_not_after` |
| `hsts_max_age_secs` | pending (platform policy) | SRE | §5 HSTS header |
| `check_entitlement('domains')` | 1 | Product (16) | §2 quantity |

## 10. Residual v0 gaps

- DNS-provider API automation (record creation) — the merchant adds the record; we validate. No provider credentials at v0.
- A non-redirecting custom host for `store.<apex>` as a second serving origin — out of scope; aliases 301 per §5.
- A trusted storefront "verified custom domain" badge (footer) — deferred to `05-marketing`.