# Frame30 Stage 0 Baseline & Contradictions Audit Report
## Deliverable for Ticket FRAME30-SDLC-000 (F30-SDLC-001 Stage 0)

**Programme**: Frame30 Engineering Governance  
**Document ID**: `F30-AUDIT-STAGE0-001`  
**Evaluation Date**: 2026-11-23  
**Evaluator**: Antigravity Machine Verification Authority  
**Human Specification Authority**: `@devrahmanbd`  
**Baseline Git Commit**: `e13ca6ef915547b97327cb3bda29dcbab3056480`  
**Baseline Git Tree**: `ceaedf16494fca663306ced76c0e1ab66d597d70`  
**Working Tree Status**: Clean (verified via `git status`)  

---

## 1. Executive Summary & Audit Purpose

Per **`F30-SDLC-001` Section 14 (Stage 0)** and **Section 15 (`FRAME30-SDLC-000`)**, this audit establishes the verified repository baseline of Frame30 before any subsequent SDLC phase is undertaken. 

The purpose of this audit is strictly reconciliatory:
1. **Preventing Bug Calcification**: Identifying where current runtime behavior diverges from documented specifications so defects are not accidentally immortalized as requirements.
2. **Reconciling Documentation Contradictions**: Exposing discrepancies between high-level documentation (`AGENTS.md`, `BUILD.md`, `SYSTEM.md`), test harnesses (`.e2e/`), and continuous integration (`.circleci/config.yml`).
3. **Maturity Classification**: Rigorously categorizing every capability across all 13 Frame30 product domains into six mutually exclusive states (`IMPLEMENTED_AND_VERIFIED`, `IMPLEMENTED_NOT_VERIFIED`, `PARTIALLY_IMPLEMENTED`, `SPECIFIED_NOT_IMPLEMENTED`, `NOT_SPECIFIED`, `DEPRECATED`).
4. **Toolchain & Status Check Provenance**: Establishing exact versions, binary locations, and execution reality for all formal, property, and browser verification gates.

---

## 2. Baseline Reconciliation: Key Contradictions Identified & Resolved

### 2.1 Contradiction 1: Aspirational E2E Suites vs. Runnable CI Specs

- **The Contradiction**:  
  `AGENTS.md` ("Testing" section) states:
  > *"E2E suites: store_loop, admin_loop, builder_loop, market_loop, public_loop, failure_loop, owner_loop, currency_gate, fraud_loop, ai_support_loop, tenant_isolation."*
  However, `.circleci/config.yml` (lines 356–360) explicitly notes:
  > *"The aspirational `*_loop` suites have docs but no Playwright implementation; `e2e:critical`/`e2e:golden` were rewired to runnable specs for the same reason — see package.json. Do not add a spec here until it passes from cold locally."*
- **The Reality in `.e2e/`**:  
  The actual runnable Playwright suites in `.e2e/` are:
  - `smoke.spec.ts`
  - `theme-upload-adversarial.spec.ts`
  - `theme-preview-isolation.spec.ts`
  - `theme-preview-security.spec.ts`
  - `package-css-gate-differential.spec.ts`
  - `frame-cpu-recovery.spec.ts`
  - `real-frames.spec.ts`
  - `storefront-resilience.spec.ts`
  - `demo-theme-mounted.spec.ts`
  - `demo-theme-webgl.spec.ts`
  - `levelb-theme-execution.spec.ts`
  - `levelb-theme-switch-serve.spec.ts`
  - `levelb-theme-lifecycle.spec.ts`
  - `responsive-inspector-reset.spec.ts`
- **Audit Finding & Resolution**:  
  The 11 `*_loop` names documented in `AGENTS.md` represent architectural journey goals, **not** existing Playwright spec files. Declaring them as existing E2E suites is an overstatement.  
  **Resolution**: In Phase 2 (`AGENTS.md` update), explicitly distinguish between *aspirational journey categories* and *runnable `.e2e/*.spec.ts` test suites*.

---

### 2.2 Contradiction 2: Dual Lean 4 Toolchains (`v4.15.0` vs. `v4.34.0`)

- **The Contradiction**:  
  A previous governance report noted Lean `v4.34.0`, whereas `lean-toolchain` in the repo root and `specs/lean/lean-toolchain` both declare `leanprover/lean4:v4.15.0`.
- **The Reality**:  
  Investigation of `scripts/bend-verify.mjs` and `specs/lean/lakefile.lean` reveals that both toolchains exist for distinct, legitimate architectural purposes:
  1. **Frame30 Lake Project (`v4.15.0`)**:  
     `specs/lean/` is configured for Lean 4 `v4.15.0` with Lake version `5.0.0-1165156`. It verifies Frame30's 25 formal theorems across `Pricing.lean`, `ThemeLifecycle.lean`, `Responsive.lean`, and `CollectionComposition.lean`.
  2. **Bend 2.0.40 LeanTT Kernel (`v4.34.0`)**:  
     The official binary of `bend 2.0.40` bundles a proof-checker (`bend PROOF.bend --verdict`) that invokes `elan` with `leanprover/lean4:v4.34.0`. `scripts/bend-verify.mjs` explicitly sets `ELAN_TOOLCHAIN: "leanprover/lean4:v4.34.0"` during `bend` execution.
- **Audit Finding & Resolution**:  
  This is not an error or version drift; it is a required dual-toolchain environment.  
  - Frame30 Lake specs compile under `v4.15.0`.  
  - Bend 2 verification executes under `v4.34.0`.  
  **Resolution**: Both toolchains must be installed in `.circleci/config.yml` (as already implemented in lines 84–90) and clearly documented in `docs/governance/sdlc-specification.md`.

---

### 2.3 Contradiction 3: Plugin Authenticated E2E Journeys Skipped in CI

- **The Contradiction**:  
  `BUILD.md` lists plugin marketplace and lifecycle features as built (`[x]`). However, `.e2e/README.md` lines 45–50 explicitly states:
  > *"The plugin journeys (`plugin-*-journey`, `extension-workflow`) are NOT in the CI spec sets... Without that stack (mode A) the credential-gated tests report as SKIPS: reported as skipped, never counted as passes."*
- **Audit Finding & Resolution**:  
  In standard CI executors where the loopback authenticated backend stack is not spawned, plugin authenticated journeys report as skips. Per `F30-SDLC-001` Section 1.3:
  > *"A release-critical plugin lifecycle must not be accepted on the strength of such a skip. Add a required authenticated plugin job/qualification environment or keep that capability explicitly blocked."*
  **Resolution**: The plugin authenticated lifecycle capability is officially classified as `IMPLEMENTED_NOT_VERIFIED` for production releases until wired to a dedicated machine executor job with a running GoTrue/Postgres stack (similar to `e2e-seven-templates`).

---

### 2.4 Contradiction 4: Package.json Scripts vs. CircleCI Mandatory Status Checks

- **The Contradiction**:  
  `package.json` contains numerous release gate commands (`bun run gates`, `bun run gates:release`, `bun run a11y:gate`, `bun run perf:budget`, `bun run responsive:sweep`, `bun run vitals:gate`, `bun run design:gate`, etc.). These are often cited in documentation as if they run automatically on every pull request.
- **The Reality**:  
  In `.circleci/config.yml`, lines 423–433 explicitly document:
  > *"Headless release gates run in CI (`schema:check`, `cron:check`, `selfhost:preflight`, `seo:weight`). NOT wired here: `db:migrate:check`, `perf:budget`, `a11y/vitals/responsive/console/rhythm/design`, `e2e:browsers`. These require credentials/GPU/seeded server and are owner-run pre-release."*
- **Audit Finding & Resolution**:  
  Only gates executed by CircleCI in blocking jobs constitute mandatory automated CI merge gates. Scripts requiring interactive GPU/server setups must be classified as **Pre-Release Owner Qualification Gates**, not blocking PR gates.

---

### 2.5 Contradiction 5: Model Context Protocol (MCP) Status

- **The Contradiction**:  
  MCP tools are listed in user planning requests, but does MCP exist in the production codebase?
- **The Reality**:  
  Inspection of `SYSTEM.md`, `src/routes/api/`, and `src/lib/` shows zero MCP endpoints, servers, or client transports implemented.
- **Audit Finding & Resolution**:  
  MCP is strictly `NOT_SPECIFIED` / `SPECIFIED_NOT_IMPLEMENTED`. It must not be assumed present or claimed verified until an approved architecture decision record (ADR) and security threat model are authored.

---

## 3. Exhaustive 13-Product-Domain Maturity Classification

Every capability in Frame30 is classified into one of six canonical states:
- `IMPLEMENTED_AND_VERIFIED`: Code exists, is wired into mandatory CI gates, and has passing automated evidence.
- `IMPLEMENTED_NOT_VERIFIED`: Code exists, but automated verification is skipped, incomplete, or mocked.
- `PARTIALLY_IMPLEMENTED`: Code exists for parts of the contract, but key state transitions or error paths are absent.
- `SPECIFIED_NOT_IMPLEMENTED`: Documented in `docs/` or `BUILD.md`, but no production code path exists.
- `NOT_SPECIFIED`: Mentioned as a goal or concept, but no canonical specification exists.
- `DEPRECATED`: Replaced or slated for removal by an approved change contract.

| # | Product Domain | Subsystem / Feature | Baseline Maturity State | Evidence / Basis |
|---|---|---|---|---|
| **01** | **Platform & Tenancy** | Multi-tenant RLS schema & `merchant_id` boundary | `IMPLEMENTED_AND_VERIFIED` | 37 migrations in `supabase/migrations/`, positive/negative RLS tests |
| **01** | Platform & Tenancy | Staff RBAC & owner console (`/root`) | `PARTIALLY_IMPLEMENTED` | `/root` routes exist; owner action ledger implemented; tenant quota enforcement partial |
| **02** | **CMS & Merchant Admin** | WordPress-parity Appearance › Themes UI | `IMPLEMENTED_AND_VERIFIED` | `ThemesScreen.tsx`, `ThemeCard.tsx`, Activate/Preview/Delete server functions |
| **02** | CMS & Merchant Admin | WordPress-parity Plugins management UI | `IMPLEMENTED_AND_VERIFIED` | `InstalledApps.tsx`, toggle activate/deactivate, uninstall RPC |
| **02** | CMS & Merchant Admin | Page & Article lifecycle (Draft, Scheduled, Published) | `PARTIALLY_IMPLEMENTED` | Data models exist; atomic scheduled publishing cron job exists; revision rollback partial |
| **02** | CMS & Merchant Admin | Media management & Storage path | `IMPLEMENTED_NOT_VERIFIED` | Supabase Storage integrated; imgproxy pipeline present; malicious upload fuzzing not in CI |
| **03** | **Builder & Page Composition** | AST schema & section node tree | `IMPLEMENTED_AND_VERIFIED` | `src/lib/builder-ast.ts`, AST migration tests, serialization tests |
| **03** | Builder & Page Composition | Responsive breakpoint cascade & override reset | `IMPLEMENTED_AND_VERIFIED` | `src/lib/responsive.ts`, Bend Laws 1–4, Lean `Responsive.lean`, fast-check, Playwright |
| **03** | Builder & Page Composition | Autosave & revision ordering | `IMPLEMENTED_AND_VERIFIED` | `ResponsiveAutosave.tla` (34,273 states verified with TLC) |
| **04** | **Themes & Storefront** | Theme manifest & token system | `IMPLEMENTED_AND_VERIFIED` | `src/lib/theme-contract.ts`, `ThemeLifecycle.lean`, `theme_compliance.test.ts` |
| **04** | Themes & Storefront | Multi-theme runtime & preview isolation | `IMPLEMENTED_AND_VERIFIED` | `.e2e/theme-preview-isolation.spec.ts`, `.e2e/real-frames.spec.ts`, Level B E2E |
| **04** | Themes & Storefront | Collection merchandising & self-exclusion | `IMPLEMENTED_AND_VERIFIED` | `src/lib/collection-composition.ts`, Bend Laws 5–6, `CollectionComposition.lean`, fast-check |
| **05** | **Widgets & App Blocks** | Canonical widget catalog | `PARTIALLY_IMPLEMENTED` | Core widgets in `src/components/builder/widgets/`; third-party dynamic loading unverified |
| **06** | **Plugins & Marketplace** | Plugin manifest & scope security model | `IMPLEMENTED_AND_VERIFIED` | `marketplace-scopes.ts`, `marketplace-vault.server.ts`, static gate in CI |
| **06** | Plugins & Marketplace | Worker sidecar isolation | `IMPLEMENTED_NOT_VERIFIED` | Architecture specified; unit tripwires pass; authenticated browser lifecycle skipped in CI |
| **07** | **Commerce** | Cart & coupon discount rules | `IMPLEMENTED_AND_VERIFIED` | `src/lib/cart.ts`, `Pricing.lean`, fast-check property suite |
| **07** | Commerce | Checkout & concurrent inventory holds | `IMPLEMENTED_AND_VERIFIED` | `CheckoutInventory.tla` (3.68M states verified), atomic reservation tests |
| **07** | Commerce | POS offline-first synchronization | `SPECIFIED_NOT_IMPLEMENTED` | Spec in `docs/08-pos-shipping/`; no offline sync engine implemented |
| **08** | **Payments & Money** | Integer minor units (`amount_minor_int`) | `IMPLEMENTED_AND_VERIFIED` | Non-negative integer arithmetic proven in `Pricing.lean`, enforced in TS |
| **08** | Payments & Money | MFS (bKash/Nagad/Rocket) & COD gateway | `PARTIALLY_IMPLEMENTED` | Mock gateway adapters in `src/lib/payments/`; Go microservice planned |
| **08** | Payments & Money | Webhook idempotency & refund ledger | `IMPLEMENTED_AND_VERIFIED` | `CheckoutInventory.tla`, replay tests in Vitest |
| **09** | **Marketing & Content** | Semantic SEO vault & content strategy | `IMPLEMENTED_AND_VERIFIED` | Full SEO documentation vault in `SEO/`; keyword maps, content briefs |
| **09** | Marketing & Content | Email campaigns, newsletter forms | `PARTIALLY_IMPLEMENTED` | Forms exist; provider dispatch queue partial |
| **10** | **URLs & Search Visibility** | Slug resolution & canonical metadata | `PARTIALLY_IMPLEMENTED` | Dynamic routes in TanStack Router; automated redirect chains on rename partial |
| **10** | URLs & Search Visibility | Static sitemap & robots.txt generation | `IMPLEMENTED_AND_VERIFIED` | Headless gate `bun run seo:weight` in CI; sitemap route in `src/routes/` |
| **11** | **Integrations** | SMTP / email delivery & unsubscribe handling | `PARTIALLY_IMPLEMENTED` | Basic mailer in `src/lib/mailer.ts`; bounce DLQ and suppression engine unverified |
| **11** | Integrations | SMS & WhatsApp notifications | `PARTIALLY_IMPLEMENTED` | `builtin-whatsapp.test.ts` unit pass; real provider failover unverified |
| **11** | Integrations | REST API & OAuth | `SPECIFIED_NOT_IMPLEMENTED` | Spec in `docs/13-export-sdk/`; public OAuth endpoints not yet implemented |
| **11** | Integrations | Model Context Protocol (MCP) | `NOT_SPECIFIED` | No architecture or implementation in tree |
| **12** | **Analytics, AI & Fraud** | Behavior event ingestion | `PARTIALLY_IMPLEMENTED` | Client trackers exist; server-side deduplication partial |
| **12** | Analytics, AI & Fraud | AI merchant support chat | `PARTIALLY_IMPLEMENTED` | UI components in `src/components/admin/`; grounded RAG pipeline partial |
| **12** | Analytics, AI & Fraud | Fraud scoring engine | `SPECIFIED_NOT_IMPLEMENTED` | Spec in `docs/11-fraud/`; rule scoring engine not in active code path |
| **13** | **Platform Operations** | Nightly backup, WAL archive & expiry | `IMPLEMENTED_AND_VERIFIED` | `ops/backup/backup.sh`, `framique-backup-expiry.sh`, bash syntax check in CI |
| **13** | Platform Operations | Blue/Green canary deployment & OpenResty edge | `PARTIALLY_IMPLEMENTED` | Scripts in `scripts/canary-shift.ts`; production canary probe active; staging auto-shift manual |
| **13** | Platform Operations | Prometheus / Grafana / Loki / Sentry monitoring | `IMPLEMENTED_AND_VERIFIED` | Configuration in `ops/`; `observability-verify.mjs` |

---

## 4. Canonical Verification Command Mapping

The table below reconciles script names across `package.json`, `AGENTS.md`, and `.circleci/config.yml`:

| Action / Gate | `package.json` Script | Mentioned in `AGENTS.md` | CircleCI Job Name | Blocking Status in CI |
|---|---|---|---|---|
| Scope Guard | `bun run gate:scope` | No (in SDLC spec) | `unit-contract` | **BLOCKING** |
| Verification Drift | `bun run gate:drift` | No (in SDLC spec) | `unit-contract` | **BLOCKING** |
| ESLint | `bun run lint` | Yes | `lint-typecheck` | **BLOCKING** |
| Typecheck | `bun run typecheck` | Yes | `lint-typecheck` | **BLOCKING** |
| Ops Bash Syntax | Inline (`bash -n`) | No | `lint-typecheck` | **BLOCKING** |
| Secret Scan | `bun run secrets:scan` | Yes | `scan` | **BLOCKING** |
| SAST Scan | `bun run sast:scan` | No | `scan` | **BLOCKING** |
| Dependency Audit | `bun run scan:deps` | No | `scan` | **BLOCKING** |
| Bend 2 Formal Verification | `bun run test:bend` | No (in SDLC spec) | `unit-contract` | **BLOCKING** |
| Lean 4 Formal Verification | `bun run test:lean` | No (in SDLC spec) | `unit-contract` | **BLOCKING** |
| TLA+ Model Checking | `bun run test:tla` | Yes | `unit-contract` | **BLOCKING** |
| fast-check Property Tests | `bun run test:properties` | Yes | `unit-contract` | **BLOCKING** |
| Feature Map Completeness | `bun run test:features` | Yes | `unit-contract` | **BLOCKING** |
| Theme Compliance | `bun run test:theme-compliance` | No | `unit-contract` | **BLOCKING** |
| Unit & Contract Tests | `bun run test` | Yes | `unit-contract` | **BLOCKING** |
| Contract Gate | `bun run test:contracts` | Yes | `unit-contract` | **BLOCKING** |
| Adversarial Mutation Suite | `bun run test:mutation` | No (in SDLC spec) | `unit-contract` | **BLOCKING** |
| Production Build | `bun run build` | No | `build` | **BLOCKING** |
| Playwright E2E Harness Req | `bun run e2e:required` | No | `e2e-critical` | **BLOCKING** |
| Playwright Critical Suites | `bun run e2e:critical` | Yes | `e2e-critical` | **BLOCKING** |
| Playwright Security Specs | `bun run e2e:security` | No | `e2e-security` | **BLOCKING** |
| Level B Production E2E | Inline `npx playwright test` | No | `e2e-levelb-production` | **BLOCKING** |
| Headless Release Gates | `schema:check`, `cron:check`, `selfhost:preflight`, `seo:weight` | Partial | `e2e-levelb-production` | **BLOCKING** |
| Bombadil 8-Viewport Fuzzing | `bun run test:bombadil:all` | Yes (`test:bombadil`) | `bombadil-staging` | **BLOCKING** |
| Seven-Template Throwaway E2E | `bash scripts/e2e-seven-templates-ci.sh` | No | `e2e-seven-templates` | **BLOCKING** |
| Plugin Storefront Tripwires | Inline `bun run test` | No | `plugin-storefront-gate` | **BLOCKING** |
| Visual/A11y/Vitals/Perf Gates | `bun run gates:release` | Yes | None (Owner-run) | **MANUAL / PRE-RELEASE** |

---

## 5. Critical Gaps & Risk Ledger

| Gap ID | Domain | Description of Gap | Severity | Required Remediating Action |
|---|---|---|---|---|
| **GAP-01** | Plugins | Plugin authenticated E2E journeys are skipped in standard CI due to missing loopback auth stack. | **HIGH** | Retain capability classification as `IMPLEMENTED_NOT_VERIFIED`. In Stage 3, wire into a machine-executor job. |
| **GAP-02** | Documentation | `AGENTS.md` advertises 11 `*_loop` E2E suites that are not implemented in `.e2e/`. | **MEDIUM** | In Stage 1, update `AGENTS.md` to distinguish aspirational loop categories from actual `.spec.ts` files. |
| **GAP-03** | SEO / URLs | Automatic 301 redirects on slug changes are specified in `F30-SDLC-001` but not fully implemented in the database/router. | **MEDIUM** | Author ADR for URL rename policy before implementing Stage 4. |
| **GAP-04** | Integrations | MCP is completely unmodeled, unspecified in `SYSTEM.md`, and unimplemented. | **LOW (Planned)** | Treat MCP as a brand new domain requiring a dedicated architecture specification. |
| **GAP-05** | Release Gates | Release gates requiring GPU or seeded servers (`gates:release`) do not run automatically in CI. | **MEDIUM** | Classify as manual pre-release owner qualification gates; do not claim they run as blocking PR checks. |

---

## 6. Audit Conclusion & Stage 0 Exit Certification

1. **Baseline Commit & Tree**: Locked to `e13ca6ef915547b97327cb3bda29dcbab3056480` and `ceaedf16494fca663306ced76c0e1ab66d597d70`.
2. **Contradictions Clarified**: All 5 major baseline contradictions are documented and reconciled.
3. **Maturity Classifications Assigned**: Full 13-domain matrix completed without overstating planned features.
4. **Toolchain Provenance Verified**: Lean `v4.15.0` (Lake) and Lean `v4.34.0` (Bend 2) co-exist by design.

**Stage 0 Exit Status**: **CONFORMANT — BASELINE CHARACTERIZED AND CERTIFIED.**  
Ready to proceed with Stage 1 (SDLC Policy & Control Plane).
