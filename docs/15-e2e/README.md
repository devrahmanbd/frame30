# 15 — E2E & QA

Status: Planning · Slice S8 (shipping gate) · Reference: `plan.md` §4 (SLOs, E2E), `01-architecture` (SLOs)
Design: `design-system.md` (dev surface; clean)

## Purpose
Synchronized end-to-end test suites + CI gates that prove the whole product works (checkout via simulated MFS, courier pickup, refund) and keep eyeball-on-dashboard honest: schema, RLS, i18n (Bangla/English), offline POS, migrations.

## Suites (all in `.e2e/`)
- **Store loop**: browse → cart → promo (BOGO) → MFS sandbox pay → order created → courier label → delivered → refund (partial/full).
- **Admin loop**: merchant onboard → product (variant+image) → publish storefront → POS offline draft → shift close → dashboard KPIs match analytics.
- **Admin staff/RBAC/MFA** (spec: `admin_loop.md`): invite → activate → role grants → suspend/remove → MFA lockout/recovery → ≤ 60 s revocation, plus `admin_loop_failure` guard paths.
- **Builder loop**: edit theme on preview → save draft → publish → version stack rollback.
- **Theme registry** (spec: `theme_registry.md`): install → switch → token overrides → publish gates → snapshot render → purge → fallback → rollback; never serves unpublished or invalid pages.
- **Market loop** (spec: `marketplace_loop.md`): publish theme → install → run on your domain storefront; store change rollback on failed install; 70/30 payout math equals the ledger (`docs/06`); marketplace-down → installs unavailable while existing storefronts keep running.
- **Fraud loop** (spec: `fraud_loop.md`): review/approve/block transitions; engine-down → defaults to `review`; honeypot trap fires and logs the window; blacklist add/remove audit lines; refund after a block only via the `docs/06` machine.
- **AI support loop** (spec: `ai_support_loop.md`): provenance chips on sales answers; money/order/stock answers match real table values via `fmtBDT`; provider-down → static FAQ + "Caution" copy, no dead chat; escalation rows carry order ids.
- **Owner loop** (spec: `owner_loop.md`): `/root` console governance — pricing draft→publish with 2-key sign-off; gateway `mock→sandbox→live` only after wallet check; consent channel toggle honoring opt-out; dead-letter flush; AI kill-switch fail-open to `review`; every console write lands an `audit.owner_action` row (90d raw / 3y audit in tests).
- **Promo loop** (`e2e_promo_loop`): promo create → activate → apply at checkout → discount validated server-side → promo expiry → promo removed; coupon stack limits honored; BOGO vs percentage vs fixed-amount fixtures; promo abuse (max-use, per-user cap) blocked; promo analytics rows written.
- **OAuth loop** (`e2e_oauth_loop`): merchant OAuth consent → token exchange → refresh flow → scope escalation denied → token revocation → re-auth required; provider-down → fallback to password auth; callback URL validation; session expiry honored.
- **Currency gate tests**: BDT-only default enforced (no USD in non-pilot stores); USD pilot gate blocks non-pilot merchants; `fmtBDT` consistency across all surfaces; fx_rate snapshot idempotent on retry; money never floats in API responses.
- **Failure**: provider down (mock failover), queue dead-letter, refund provider reject, backup → restore.
- **Perf** (pos-verify): LCP < 2.5s storefront mid-Android, admin TTI < 3s, checkout AAA.

## Standard
- Playwright; mock MFS sandbox (in-process); per-env `test-*` datastore reset; determinism seeds (const phone fixtures, coupon fixtures); parallel sharding; retries=2s; tracing on fail (screenshot + video) to 15 artifacts.

## Data replication
Each suite: ship one orders set; reset between (temp org per test). Migrations forward+rollback tested in CI.

## SLO gates
- Critical `store_loop` must pass at PR merge; full suite nightly + per release; Lighthouse (a11y ≥ 90, BW score) gate on release.

## Events
`e2e.suite.failed`, `e2e.flaky` (auto quarantine, alert), `migration.checked`.

## Failure/recovery
- Retry+shard, hang watchdog 60s; quarantine flaky to `@flaky` then fix.
- Migration failure aborts release; never auto-rollback (human).

---

## Design guidelines — CI 'traffic-light' panel, trace viewer, failure cards, test report

- Intent: green means people can sell; red must be *explainable in 10 seconds* to the whole team.
- Key surfaces: CI summary card (pass/fail + duration + link), trace view (steps, timing, screenshot), failure diff (expected vs actual), test catalog w/ owner tags.
- Palette: same semantics: mint pass / amber flaky / red fail; never single-red overload.
- Typography: mono for IDs, tabular timings, Bangla pass/fail wording ("Pass"/"Fail") toggleable.
- Density: dense matrix; failure expands w/ stack.
- Motion: subtle status pulse while running; never blinding.
- A11y: not color-only; keyboard trace read.
- Performance: virtualized list for 1k+ tests; logs parallel streams.
- Anti-slop: distinctive — test names suffixed with device class (`@android-mid`) so flake is attributable; matrix read in 1 glance; visible "Latest version: v0.5.0-Eid".

---

### Strict guardrails — QA & E2E

1. **Money & orders** — E2E never asserts a rendered money string it did not compute: the expected amount comes from the fixture's integer BDT fields via the same `fmtBDT` used in production, and every test asserts the displayed value against the computed one; promo/coupon/COD-payoff changes run through the docs/07 fixtures, then re-run (docs/07 replay).

2. **Data & tenancy** — E2E runs against the sandbox landing in a fresh `test-*` tenant per run (docs/14 reset); assertions never read production tenant data — the RLS layer is exercised with the sandbox `merchant_id`; every tenant-scoped query in tests carries `merchant_id` so cross-tenant leakage fails loudly in CI, not at runtime.

3. **State transitions** — Test scripts drive state machines the same way the UI does: always through the store/order/payment flows (docs/06, docs/07); an E2E that skips a legal state (e.g. COD flows past `payment_pending` without the payment step) fails the suite; failure suites cover provider-down, dead-letter re-delivery, refund-rejected, and backup→restore — all at the same machine boundaries as production.

4. **Vendors & data-export** — No E2E hits a live provider (SMS/webhook/SMTP stand in behind the docs/13 interface); webhook E2Es deliver HMAC-signed payloads and assert signature verification; SDK/export E2Es run against the export sandbox and the DLQ replay path, never the merchant's real file bucket.

5. **Consent & privacy** — Fixtures carry no PII (fake-but-valid identities only); every "may identify" value is generated by the fixture, not copied from logs; a consent-opt-out E2E asserts the surfaced copy and the unsubscribe path (docs/05) and that no fixture ever requires a phone in an export.

7. **Failure & recovery** — Retries=2 per stage, then the suite fails with the failure card (expected vs actual + screenshot); a flaky matrix cell is attributable to the device class suffix (`@android-mid`); environment reset per run (`test-*` per environment), and a failed run leaves a snapshot for restore tests; error-code assertions are exact (`theme_not_found`, `theme_not_published`, `no_permission`, per docs/15 theme_registry) so a fallback is never masked as success.

8. **Testing gates** — `store_loop`/`admin_loop`/`builder_loop`/`market_loop` all pass for the critical path; a failing PR leaves the traffic light red with an explainable failure card; Lighthouse a11y ≥ 90 on release builds; every provider-down/dead-letter/refund-reject/backup-restore failure suite passes on schedule; matrix read in 1 glance.

---

## Sign-off

- [ ] QA-engineer (suite ownership / flake quarantine)
- [ ] Platform (CI pipeline / migration safety)
- [ ] Merchant-admin (store loop acceptance)
- [ ] Developer (OAuth / promo / currency gate coverage)

---
*End of docs planning set 01–17. Next: root `SYSTEM.md` then `AGENTS.md`.*