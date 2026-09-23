# Audit verdict — capability claims vs. planning corpus

Status: Audit report · 2026-08-08 · Scope: entire `docs/` tree (33 files, areas 00–16)

> Method: every claim below was verified against the planning docs, not against
> memory of the pitch. Where the corpus disagrees with a claim, the doc wins and
> the claim is marked accordingly. Implementation status is uniform: this is a
> **docs-only corpus** — `.e2e/*.spec.ts` suites and runtime services exist as
> contracts (P4), nothing ships today.

## Summary table

| #   | Claim                                    | Corpus verdict                                                 | Doc status                                                                |
| --- | ---------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Sections & templates (page-type layouts) | Planned in depth, exact slot model                             | `sections-templates` approved; `theme-registry` **Gate: approved ("go")** |
| 2   | Content CMS (articles, media, menus)     | Planned; grids, trees, archives                                | `05-marketing/content-cms` · S6                                           |
| 3   | i18n (bn/en)                             | Planned, both locales on in v0                                 | `03-storefront/i18n` · S2/S3                                              |
| 4   | Scheduled & lifecycle publishing         | Planned; **no time-based unpublish**                           | `04-builder/publishing` · S1 · Tenant008                                  |
| 5   | App blocks / widgets                     | Planned, marketplace-pinned                                    | `04-builder/app-blocks` · S3/S7                                           |
| 6   | Staff approval + rollback (+RBAC/MFA)    | Planned — strictest spec in corpus                             | `02-merchant/staff-approval` S5, `staff-rbac` S2/S5                       |
| —   | BD compliance (PG/MFS licensing, KYC)    | KYC planned in depth; **licensing intentionally design-blind** | `02-merchant` §KYC; `06-payments`; `11-fraud`                             |

---

## 1. Sections & templates — planned

- `04-builder/sections-templates.md` (approved): template = page-type contract
  (`page | product | article | collection`); sections = named widget groups
  filling fixed slots; per-page overrides live on the page draft — the template
  file is never mutated.
- `04-builder/theme-runtime.md` TR-1/TR-2: theme = versioned package
  (`theme.yaml` + layout AST + tokens + assets + optional widget JS); merchant
  installs are **semver pins**; upgrades explicit; theme owns rendering, runtime
  owns data/auth/cart/checkout/safety. Theme 01 "Char" first.
- `04-builder/theme-registry.md` — only doc with an explicit **Gate:
  approved ("go")**; resolves runtime §8 open item 3 (purge). Tables
  `theme_versions`, `store_themes`, `pages`, `theme_tokens`, `widgets`,
  `revisions`, `theme_audit`; new `themes` resource group `read · edit ·
install · publish · rollback`; anon surface `app.theme_snapshot`
  (published-only; 404 otherwise).
- **Buttons / CTAs / actions**: `theme_install` (post-gate), `theme_switch_default`,
  `app.theme_save_page`, `theme.duplicated`, publish bar → `theme_publish`,
  rollback (restore previous revision), purge.
- **Machine**: page AST `draft → preview → published`; legacy `pages` backfill
  non-destructive.
- Residual: no builder `.e2e` artifacts yet (contract-first, P4) — matches the
  shared industry for the whole repo.

## 2. Content CMS — planned

- `05-marketing/content-management.md` (S6, approved): **article machine
  `draft → scheduled | published → archived`**; scheduled articles ride the same
  publish path as pages.
- Media library = tenant-scoped Storage buckets + imgproxy public URLs; menu
  builder (nav + mega-nav) writes the 06 storefront slot; category manager
  delete = tree-safe relink, never orphan; `check_entitlement(...)` gates every
  surface.
- **Actions**: create/edit/article schedule/publish/archive; upload transform;
  menu edit; category add/move/delete-stef.
- Tables: `articles`, `seo_meta`, `pages_extra`, `newsletter_subscribers`,
  `campaigns`/`campaign_sends`, `forms`/`form_submissions`, `coupons`.

## 3. i18n — planned

- `03-storefront/i18n.md` (S2/S3): `bn | en` both on v0; per-locale published;
  explicit fallback chain; read-only supplier catalog + merchant override
  catalog (RLS); 60s edge cache never crosses locales; keys `nav.home`,
  `cart.title`, `product.buy_box`.

## 4. Scheduled & lifecycle publishing — planned (one real gap)

- `04-builder/publishing.md` (Tenant008): `pages.scheduled_at`; scheduler edge
  job promotes **through the same `theme_publish` path**; events
  `page.scheduled`, `page.scheduled_cancelled`, `theme.duplicated`,
  `preview_share.created/revoked`; `preview_shares` revocable single-use tokens.
- Duplicate / switch / rollback / purge explicit.
- **Gap**: publish-forward only — **no time-based unpublish/expiry on pages or
  articles** (a scheduled article goes live and stays until archived manually).
  If sunsetting is a requirement, this doc grows a `scheduled_for_removal`
  tick, not an invention.

## 5. App blocks — planned

- `04-builder/app-blocks.md` (S3/S7): `widget_catalog` + `widgets`;
  built-in kind + JSON-schema props/styles; per-widget status
  `draft | verified | blocked`; per-tenant installs; community bundles are
  versioned, hash-pinned, capability-list sandboxed — **never load on failed
  validation**; props validated server-side on every AST write; `custom_html` +
  community gated by entitlement; marketplace UI → `12-marketplace`.
- **Actions**: install / enable / uninstall; save props (server-validated);
  marketplace publish/browse.

## 6. Staff approval, rollback, RBAC, MFA — planned (no gap)

- `02-merchant/staff-approval.md` (S5): four-eyes invariant — submitter can
  never approve own change (**self-approval = hard server error**); per-resource
  `approval_level ∈ none | required` (tenant opt-in); resources theme (006),
  marketing (007), publishing (008), widgets (009), finance/refunds; owner
  override with audit row `approval.owner_override`; expiry + cancellation
  semantics; Schema `Tenant01`.
- `02-merchant/staff-rbac.md` (S2/S5): fixed `owner | viewer` + custom roles from
  a permission matrix; grants = `(resource_group, action)`; RLS + RPC guard;
  enforced MFA (TOTP + email/SMS OTP), recovery codes; **revocation ≤ 60s**;
  full audit (roles, perms, MFA **and approvals**: Approvals, Expiry — who/what/
  when/why).
- **Done on surface**: Settings review queues (approve/reject/cancel/override);
  per-resource filters.
- Scope note: approval gates _publish/permission/payment_ actions — everyday
  catalog edits are un-gated unless the tenant raises the level. That matches
  the doc's opt-in design, not a defect.
- E2E: `docs/15-e2e/admin_loop.md` (staff lifecycle arm) + the admin_loop
  suite's onboarding arm.

---

## Compliance & Bangladesh-market honesty

**KYC — planned in depth, no gap** (`02-merchant/README.md` §KYC):

- Hard gate before **any real-money movement** (payouts, marketplace selling);
  gated by `docs/16-product-pricing`.
- Identity pick (individual sole-proprietor vs business) → NID / trade license /
  BIN upload (owner-only RLS, TTL, PII-minimal); **only status fields leave the
  KYC service** — raw documents never reach logs/analytics (accounts-side rule
  in `03-storefront/accounts.md`).
- Settlement accounts bank + MFS w/ **micro-deposit verification** before
  payout default; **annual re-verification**; expired → payouts suspended, store
  keeps selling with warning.
- **KYC machine**: `draft → submitted → under_review → approved | rejected |
expired`; `under_review` **blocks payouts but allows COD-store**; consent
  split GDPR-grade (marketing vs money-movement).
- Risk engine (`11-fraud/README.md`): `flagged → review → hold | block | approve
→ closed`; COD-abuse #1 in BD; false positives > false negatives; blocks
  require ≥2 signals; default `review`; blocks pause orders at the **06 payment
  machine legal stop state** — fraud never moves money itself; re-evaluated at
  charge time, not cart time.

**The real open gate — aggregator licensing**:

- `06-payments` is **design-blind for live MFS APIs** by choice: built from
  public docs + own signed-mock sandbox (`mock-mfs` returns signed webhooks on
  delay); production adapters behind an interface so real certification drops
  in without redesign. OTP/SMS provider is "gated like MFS live sign-off"
  (`03-storefront/accounts.md`).
- Nothing in the corpus addresses the **merchant aggregator/PG licence itself**
  (BD market entry, bKash/Nagad PM terms, bank card-scheme rights, 16-16
  product-pricing gating). That is staged and deliberate — the live gate
  requires explicit sign-off — but if the investor pitch needs **a licence/
  compliance statement today**, it does not exist in docs.
- Per 00-meta §2 protocol ("no invented numbers; named TBD"), the honest
  landing is: add a `TBD` + owner line under 06 for
  `payments.authentication.licensing` before launch-stage funding asks.

## Real gaps inventory (things the pitch may imply that docs don't do)

1. Time-based **unpublish** of pages/articles (scheduling is publish-forward) —
   handled in `04-builder/publishing.md` §14 (scheduled removal state machine).
2. On the fly **licensing/compliance** artifacts for BD payment entry —
   handled in `06-payments/README.md` §9 (`TBD` + owner line).
3. **Langs >2** — v0 is `bn | en` only; the fallback/RLS model scales, but the
   corpus states two locales, both on, and nothing for a third in v0 — and a
   third is an explicit v0 non-goal — handled in `03-storefront/i18n.md` §10.

Nothing in the six claimed capabilities is missing from the planning tree; the
only honest "no" is the licensing statement.
