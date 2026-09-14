# 15-e2e — Marketplace loop (E2E spec)

Status: Planning · Slice post-S7 · Reference: `docs/15-e2e/README.md:15` (registered loops), `docs/15-e2e/admin_loop.md` (frameset/harness §2), `docs/12-marketplace/README.md` §11 (`e2e_marketplace_loop`, ops owner tracked via `marketplace.e2e_register`, §13), `docs/12-marketplace/marketplace.md` §5 (listing lifecycle) + §6 (install contract), `docs/12-marketplace/themes.md` §5–§6 (install state machine + quotas), `docs/16-product-pricing` §4 (`check_entitlement`), `docs/06-payments/README.md` §4 (settle/payout authority) · `SYSTEM.md` §Conventions

Owner (eventual): QA · fixtures: marketplace ops

## 1. Scope

The e2e contract the marketplace slice ships against: listing lifecycle with review round-trips, installs pinned to reviewed artifacts, fail-closed installs when the marketplace is down, store change rollback on failed install, and 70/30 payout math equal to the ledger. Playwright is deferred until the S1 scaffold exists (README §15); this spec defines scenarios + acceptance, not the runner.

## 2. Harness

Reuses `docs/15-e2e/admin_loop.md` frame: seeded marketplace with `marketplace.listings` rows across lifecycle states, a reviewed theme listing (pin = `content_hash_id`), a seeded merchant storefront with a `theme_v` pin via `theme_install` (Tenant006), and a second tenant for entitlement/denial probes. Contract configuration at named defaults (`TBD_VALUE:` config rows — `marketplace.commission_rate_draft`, `marketplace.payout_hold_days`; no literals until sign-off — §13). Revenue split equipment seeded via `payments_split` for the 70/30 math check (`docs/06`). The suite calls the edge layer as the logged-in merchant — `service_role` is never used; a dedicated failure test asserts `service_role`-keyed calls are denied.

## 3. Corpus anchor (README §15)

> **Market loop** (spec: `marketplace_loop.md`): publish theme → install → run on your domain storefront; store change rollback on failed install; 70/30 payout math equals the ledger (`docs/06`); marketplace-down → installs unavailable while existing storefronts keep running.

## 4. Scenarios (canonical)

**Golden A — listing review round-trip.** A new package enters `writing` → `submitted` → `listed`; `marketplace.listings.status` is the sole lifecycle column, `listing_reviews` records each decision; a rejected manifest returns to `draft`, is edited, and resubmits — every transition idempotent. Asserts: status honors the §5 sequence, rejected→draft→resubmit (new review id), listed pins the reviewed `package_id`, audit rows on `listing_reviews` for each decision.

**Golden B — install → apply → publish.** `theme_install` (Tenant006) installs the reviewed `content_hash_id`, state `installing → active → published`, `runtime_acked_at` records the ACK, `app.theme_snapshot` returns the new pin, edge cache flush completes (60 s window, `docs/03-storefront`); `check_entitlement` precedes install — over-limit → `plan_limit_exceeded`, never silently truncated.

**Golden C — install failure → rollback.** Install `failed` → `theme_publish.state = rollback`, prior `theme_v` pin restored, event `install.rollback` observed; the storefront keeps serving the last good pin; a subsequent install retries from `installing`.

**Golden D — marketplace down.** Marketplace outage (provider-down) → install and publish requests fail closed, while deployed storefronts keep running with current pins; no silent pin change during an outage.

**Golden E — 70/30 payout math.** Settlement divides each sale across `payments_split`; aggregated payout math equals the 70/30 split of the settled ledger from `docs/06` (no client-side arithmetic); `marketplace.payout_hold_days` (named TBD) gates release.

**Golden F — payout failure → escrow.** A payout transfer fails or the merchant is KYC-suspended; funds stay held in `payments_split` escrow with zero release until payout is restored and re-checked; no money moves outside the ledger paths (`docs/06`).

## 5. Failure suite (README §11)

- Marketplace down → installs fail closed (channel-level amnesia, Golden D); existing storefronts keep running.
- Payout fail → funds stay escrowed; payout retry is idempotent.
- Over-quota installs → `plan_quota_exceeded`, never truncated.
- Distribution failure → ledger rows settle; no partial installs.
- Cross-tenant tamper probe → a merchant cannot `install`/review another tenant's listing.

## 6. Evaluation

Run after the marketplace slice merge; critical golden `install → run on your domain storefront` must pass. before the marketplace gate ships; ad-hoc reruns target only the slice touched. This spec's owner registers the suite in `docs/15-e2e` §Suites (`marketplace_loop`) — the README §15 name redirects here.