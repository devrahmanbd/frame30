# Frame30 Engineering SDLC

## A CMS-specific system for specification, engineering, verification, release and operations

**Document ID:** `F30-SDLC-001`  
**Version:** 1.0 — proposed operating standard  
**Repository:** `https://github.com/devrahmanbd/frame30`  
**CI authority:** CircleCI only  
**Status:** Architecture and implementation specification; adopted as normative Frame30 policy for ticket `FRAME30-SDLC-000`

---

## 0. Executive decision

Frame30 needs one lifecycle that governs the complete product, not a collection of unrelated test commands. It must control how a change is requested, specified, authorized, implemented, verified, reviewed, released, observed and maintained.

Frame30 is a multi-tenant commerce CMS and storefront platform. Its change surface includes the CMS core, merchant/admin workflows, page builder and AST, themes and theme marketplace, widgets, plugins, storefront rendering, content, URLs and SEO, commerce, payments, inventory, POS, shipping, marketing, email/SMTP, APIs, OAuth, webhooks, SDKs, MCP integrations, analytics, AI support, fraud controls, infrastructure and platform-owner operations. A change to one surface can affect many others.

The SDLC therefore has six governing requirements:

1. **Requirements define correctness.** The implementation and its tests do not get to redefine the approved requirement.
2. **Every change has an explicit boundary.** The agent may only change authorized product surfaces, files, schemas, APIs, configuration and behavior.
3. **Existing accepted behavior remains protected.** New features add obligations; they do not erase old ones.
4. **Verification is risk-based and layered.** Static constraints, contracts, generated properties, browser exploration, deterministic journeys, formal methods, security tests and operational checks each have a defined job.
5. **Evidence is tied to the exact source and artifact.** A green command, a Git commit, a built artifact and a production deployment are different facts.
6. **Release and production authority are separate from implementation.** An agent may prepare a release candidate but may not approve its own work or deploy without the designated authorization.

This framework extends Frame30's existing `AGENTS.md`, `SYSTEM.md`, `BUILD.md`, `docs/00-meta`, per-domain specifications, `features/`, `.e2e/`, `scripts/`, `specs/`, `docs/verification-evidence/` and CircleCI pipeline. It must not create a second CMS architecture, second test runner, second CI system, second theme runtime or parallel copies of existing domain state machines.

### 0.1 Industry practices this framework adopts

This is a synthesis of publicly documented engineering practices, adapted to Frame30. It is not a claim that any one company uses this exact combined toolchain internally.

| Public engineering reference | Practice adopted in Frame30 | Where it appears in this SDLC |
|---|---|---|
| OpenAI harness engineering | Agent-readable repository, versioned plans/decisions, mechanical architecture checks, live application access, observable evidence and continuous cleanup | Canonical engineering records, static/architecture gates, browser evidence and maintenance loop |
| Google Cloud change management | Safety considered before coding; design, development, qualification and rollout; presubmit and direct/indirect impact testing | Lifecycle states, impact map, CI qualification and progressive rollout |
| Microsoft specification-driven engineering | Feature-level validation, differential/held-out tests, formal specs for concurrency and explicit recognition that inferred specs may not capture intended behavior | Independent oracle, baseline comparison, formal correspondence and independent approval |
| Cursor PStack | Project-local verification skills, one-command reproducibility, deliberate broken-variant detection and verification maintenance after code changes | Bombadil/Playwright workflow, formal verification and mutation sensitivity |
| Anthropic Claude Code security | Permission-based execution, sandbox boundaries, explicit allow/ask/deny controls and managed policies | Agent authority, isolation and mechanical CI enforcement |
| AWS Well-Architected | Incremental rollout, health checks, bake time, rollback to a known-good artifact and exercised recovery paths | Release engineering, canary and operational assurance |
| DeepSeek Superagent prototype | Task-specific authorization/mandate separated from the agent executing the task | Feature Change Contract and scope authority; treated as a design reference, not a production standard |
| DORA research | AI amplifies the strengths and weaknesses of the delivery system; tools alone do not establish reliability | Whole-system process, engineering metrics and operational feedback |

These public references describe different practices and maturity levels. The framework takes the relevant controls without asserting that OpenAI, Google, Microsoft, Amazon, Anthropic, Cursor or DeepSeek all run TLA+, Lean, Bend, fast-check and Bombadil on every change.

---

## 1. Frame30 product model and verified repository baseline

### 1.1 Product domains governed by this SDLC

| Product domain | What the SDLC must protect |
|---|---|
| Platform and tenancy | Merchant isolation, identity, roles, entitlements, quotas, owner controls, audit and data lifecycle |
| CMS and merchant admin | Pages, posts/articles, media, menus, navigation, settings, content revisions and admin workflows |
| Builder and page composition | Visual editor, AST, widgets, templates, device behavior, preview, autosave, publish and rollback |
| Themes and storefront | Theme manifests, tokens, runtime, rendering, cache, routes, assets, activation, previews, versions and rollback |
| Widgets and app blocks | Canonical catalog, prop schemas, server validation, capability rules, versioned sandbox and renderer compatibility |
| Plugins and marketplace | Plugin manifests, permissions, worker sidecars, install/activate/deactivate/update/uninstall/purge, review and compatibility |
| Commerce | Products, variants, catalog, search, cart, promotions, tax, inventory, orders, POS and fulfillment |
| Payments and money | BDT minor units, MFS, COD, gateway adapters, idempotency, refunds, payouts, settlement and reconciliation |
| Marketing and content distribution | SEO/AEO, articles, campaigns, forms, coupons, consent, email and event delivery |
| URLs and search visibility | Slugs, canonical URLs, redirects, locale routes, sitemap, robots directives, structured data and crawlability |
| Integrations | SMTP/email, SMS, WhatsApp, couriers, payment providers, API keys, OAuth, webhooks, SDKs and MCP |
| Analytics, AI and fraud | Event integrity, attribution, consent, grounded AI answers, human escalation, scoring and abuse controls |
| Platform operations | Jobs, queues, retries, DLQs, backups, restore, deployments, feature flags, observability, incident response and billing |

### 1.2 Current repository facts to preserve

The public repository documentation currently describes:

- Bun, TypeScript, TanStack Start/Router/Query, Vite/Nitro, Tailwind and a shared UI kit.
- Self-hosted Supabase/Postgres with RLS, Auth, PostgREST and Storage; Redis; Go payment and rate-limiter services; Meilisearch; OpenResty/CDN.
- Prometheus, Grafana, Loki/Promtail, Sentry and Alertmanager for operations and observability.
- `SYSTEM.md` as the architecture record; `AGENTS.md` as the operating rules; `BUILD.md` as the feature ledger; `docs/00-meta` as the planning/design protocol; per-domain `docs/` as the domain specifications.
- A six-layer verification architecture in `AGENTS.md`: feature map/specification, architectural/static constraints, logic/property testing, formal verification, runtime exploration and verified release.
- CircleCI as the only CI system. Do not introduce GitHub Actions.
- Vitest, fast-check, TLA+/TLC, Lean 4, Bombadil and Playwright already appear in the repository's documented verification toolchain.
- Existing browser journey families include store, admin, builder, market, public, failure, owner, currency, fraud, AI support and tenant-isolation workflows.

The SDLC must preserve these choices unless a separately approved architecture decision changes them.

### 1.3 Current status must not be overstated

The documentation has different maturity labels. Every baseline audit must classify each capability as:

- `IMPLEMENTED_AND_VERIFIED`
- `IMPLEMENTED_NOT_VERIFIED`
- `PARTIALLY_IMPLEMENTED`
- `SPECIFIED_NOT_IMPLEMENTED`
- `NOT_SPECIFIED`
- `DEPRECATED`

Only `IMPLEMENTED_AND_VERIFIED` can be treated as an accepted baseline without qualification. An existing production behavior may be characterized and protected while its intended contract is being clarified, but an accidental defect must not be frozen as a requirement.

Specific baseline items to reconcile during implementation:

1. `.e2e/README.md` says plugin authenticated journeys are outside the current CI spec sets and can be skipped when the authenticated loopback stack is absent. A release-critical plugin lifecycle must not be accepted on the strength of such a skip. Add a required authenticated plugin job/qualification environment or keep that capability explicitly blocked.
2. The current CircleCI configuration pins Lean 4 `v4.15.0` for Lake, while Bend 2.0.40 LeanTT kernel uses `v4.34.0`. Reconcile the CI image, `lean-toolchain`, Lake manifest and actual theorem receipt before accepting any combined proof report.
3. `AGENTS.md`, `package.json`, `.e2e/README.md` and CircleCI must agree on the canonical command names, test inclusion and skip behavior.
4. MCP is not described in the canonical `SYSTEM.md` and domain plans inspected for this specification. Treat MCP as a new domain requiring an approved architecture/security specification before implementation.
5. The SEO vault and marketing strategy documents are not a substitute for runtime SEO behavior. SEO acceptance must test actual rendered routes, metadata, redirects, sitemap and robots behavior.

---

## 2. Engineering constitution

These rules apply to humans, coding agents, plugins, automation and release jobs.

### 2.1 Requirement authority

- Product requirements, domain invariants, user-visible acceptance criteria, protected architecture rules and release policies are human-owned.
- Agents may propose additions or amendments, but may not unilaterally approve them.
- Tests must be authored from the approved specification or independent reference behavior, not inferred solely from the implementation.
- A failed test is a finding. It is not permission to weaken the test.
- A requirement amendment must include the previous requirement, proposed requirement, reason, affected domains, compatibility impact, test/proof impact, migration/rollback impact, approving owner and effective version.

### 2.2 Preserve accepted capabilities

- Every accepted feature has a durable feature contract and verification record (Permanent Die).
- New work must execute its own feature checks, all affected existing feature checks and mandatory system checks.
- The registry is additive. An accepted contract cannot be silently deleted, downgraded, weakened or removed from CI.
- When an existing defect is found, preserve the valid requirement, fix the implementation and add a regression check. If the requirement itself is wrong or incomplete, amend it independently.

### 2.3 Scope authority

Every change must declare authorized product surfaces, files/globs, database objects, API contracts, events, configuration, dependencies, visual areas and external systems. The scope gate must inspect the actual Git diff, not trust the agent's report.

A file being authorized does not authorize every possible behavior change inside that file. Behavioral and contract regressions remain independently gated.

### 2.4 Fail closed

The mandatory result states are:

- `PASS` — command executed and evidence satisfies the declared requirement.
- `FAIL` — requirement was violated.
- `BLOCKED` — required environment, evidence, toolchain, credential or test is missing/unavailable.
- `NOT_APPLICABLE` — documented technical reason plus independent approval.

A skipped mandatory test is `BLOCKED`, never `PASS`. Missing output is `BLOCKED`. A mocked core business behavior is not accepted as a real integration test. An unexecuted proof is not a proof result.

### 2.5 Risk classification

Reuse the existing `[A]` marker in `BUILD.md` for money, transaction integrity, data safety, tenant isolation and vulnerability risks. Add a change-risk field to each change contract:

| Risk | Examples | Required assurance |
|---|---|---|
| Critical / `[A]` | Tenant/RLS, authentication, authorization, payment, money, inventory reservation, secrets, API keys, plugin execution, MCP tool execution, destructive migrations, publishing authority, backup/restore | Independent specification; deny and replay tests; audit assertions; property tests; security review; formal model where state/concurrency warrants it; mutation testing; isolated end-to-end qualification; explicit human approval |
| High | Theme runtime, builder AST, plugin/theme lifecycle, SEO route/slug/canonical behavior, SMTP/message delivery, webhooks, OAuth, public API, scheduled jobs, data exports | Contract and compatibility tests; generated properties; failure/replay tests; browser/API E2E; security review where exposed; mutation checks for critical invariants |
| Standard | Isolated admin UI, copy, non-authoritative presentation, low-risk internal refactor | Static checks, unit/component tests, accessibility/visual checks as relevant, affected feature regression |

Risk is based on the blast radius and consequence of failure, not the apparent size of the diff.

### 2.6 No invented thresholds

Use approved, measured budgets and SLOs owned by the relevant domain. If a timeout, quota, retention period, performance budget or error threshold is not specified, record a named `TBD` with an owner and decision date. Do not invent numbers in tests or documentation to make a feature appear complete.

---

## 3. Canonical engineering records

Do not duplicate state machines or create competing documentation sources. Use this ownership model:

| Record | Authority |
|---|---|
| `SYSTEM.md` | Cross-platform architecture, topology, trust boundaries, data flow and platform-wide decisions |
| `AGENTS.md` | Agent operating rules, coding conventions, mandatory commands, test rules and CI authority |
| `BUILD.md` | Feature inventory, launch tier, `[A]` risk marker and acceptance status |
| `docs/00-meta/PLAN.md` and `docs/00-meta/` | Product sequencing, design baseline, approved architecture decisions, lifecycle protocol and shared policy |
| `docs/<domain>/README.md` and depth specs | Domain requirements, canonical state machines, data contracts, failures and domain-owned acceptance criteria |
| `features/` | Machine-readable index of workflows, entry points, preconditions, actions, states, invariants, impact links and verification commands. |
| `dies/` | Permanent, versioned specifications of accepted product capabilities backed by independent verification obligations. |
| `.e2e/` | Deterministic browser journeys and browser test harness |
| `specs/lean/`, `specs/tla/`, `specs/bend/` | Formal models and proofs with explicit production correspondence |
| `docs/verification-evidence/` | Raw, reproducible verification receipts and evidence index |
| `report.md` and release record | Release candidate identity, qualification results, deployment reconciliation, live probes and rollback record |
| `.circleci/config.yml` | Only CI pipeline and mandatory merge gates |

Every domain state machine has one canonical owner. Other documents link to it rather than copying it.

---

## 4. Complete SDLC lifecycle

A feature moves through the following 18 controlled states:

```
[1. REQUESTED] ──► [2. TRIAGED] ──► [3. BASELINED] ──► [4. DESIGNED]
                                                           │
[8. IMPLEMENTATION_AUTHORIZED] ◄── [7. VERIFICATION_DESIGNED] ◄── [6. CONTRACT_APPROVED] ◄── [5. IMPACT_MAPPED]
       │
       ▼
[9. IMPLEMENTING] ──► [10. LOCAL_VERIFIED] ──► [11. CI_QUALIFIED] ──► [12. STAGING_QUALIFIED]
                                                                                │
[16. CANARY] ◄── [15. RELEASE_CANDIDATE] ◄── [14. MERGE_AUTHORIZED] ◄── [13. INDEPENDENTLY_REVIEWED]
       │
       ▼
[17. RELEASED] ──► [18. POST_RELEASE_VERIFIED] ──► [CLOSED]
```

A failure transitions to `FAIL` or `BLOCKED`. A canary failure transitions to `ROLLBACK` or a human-approved `HOLD`. No agent may jump from implementation directly to merge/release authorization.

---

## 5. Feature Change Contract

Every non-trivial feature, bug fix, refactor, schema migration, dependency upgrade, theme/plugin update and operational change must have a validated change contract before code is changed.

Contracts may be authored in JSON or YAML format and validated against `features/contracts/schema.json`.

---

## 6. Change impact and dependency analysis

File-based allowlists are necessary but insufficient. Frame30's dependency graph must evaluate shared boundaries across RLS, AST schemas, theme runtime, plugin scopes, slug resolvers, SMTP, APIs, payments, global design tokens, and queues.

If dependency analysis is incomplete or a shared boundary is poorly understood, run the broader suite.

---

## 7. Verification architecture

Use a shared verification engine and a permanent feature-contract registry. Do not create one bespoke CI workflow per feature.

### 7.1 Layer 0 — Policy, source and static constraints
Scope guard, contract validation, typecheck, lint, secret scan, SAST, migration check, manifest validation.

### 7.2 Layer 1 — Unit, component and deterministic integration
Test pure logic at module boundary. Real server function paths without mocking business logic.

### 7.3 Layer 2 — Contract tests
Provider/consumer contracts for DB RPC, APIs, events, AST schemas, widget catalogs, plugin manifests, SMTP adapters.

### 7.4 Layer 3 — Property-based and fuzz testing
`fast-check` against production functions across randomized inputs, seeds, and shrinking counterexamples.

### 7.5 Layer 4 — Formal verification
- **Lean 4**: Mathematical properties (minor unit money arithmetic, discount bounds, responsive resolution).
- **Bend 2**: Human-owned correctness laws (`LAWS.bend`) proved by agent (`PROOF.bend`) and checked by LeanTT kernel (`--verdict`).
- **TLA+ / TLC**: State-space model checking for concurrent operations (autosave, inventory reservations, theme activation).

### 7.6 Layer 5 — Browser property exploration
Bombadil autonomous exploration across 8 viewports asserting invariants (`scrollWidth <= innerWidth`, zero 5xx, zero uncaught errors).

### 7.7 Layer 6 — Deterministic end-to-end workflows
Playwright journeys for merchant, customer, and operator workflows with fail-closed authentication.

### 7.8 Layer 7 — Visual, accessibility, performance and localization
Representative screenshots across 8 viewports (320px–1440px), WCAG 2.2 AA target, Bangla/English localization, Core Web Vitals budgets.

### 7.9 Layer 8 — Security and adversarial testing
OWASP ASVS 5.0.0 baseline, negative authorization, cross-tenant injection, token replay, privilege escalation.

### 7.10 Layer 9 — Mutation sensitivity
Adversarial scratch mutations deliberately breaking critical invariants to verify fail-closed detector sensitivity.

---

## 8. Frame30 domain assurance catalogue

Minimum assurance requirements defined across:
1. Tenancy, identity, staff RBAC and owner control
2. CMS content: pages, articles, media, menus and revisions
3. Builder, AST, widgets and templates
4. Themes, theme runtime and theme marketplace
5. Widgets and community extensions
6. Plugins and plugin marketplace
7. Slugs, URL resolution, SEO and marketing architecture
8. SMTP, transactional email and marketing delivery
9. REST API, SDK, OAuth and webhooks
10. MCP integration (new design domain; not assumed implemented)
11. Commerce, payments, inventory, POS, courier and tax
12. Analytics, AI support and fraud
13. Operations, queues, backup, deployment and recovery

---

## 9. Agent execution controls

- Agents can propose, implement code in scope, run local tests, and prepare evidence.
- Agents cannot alter human laws, expand scope unilaterally, bypass review, approve their own PRs, or deploy production.
- Worktree isolation per task recommended.

---

## 10. CI and merge governance

- CircleCI is the sole CI authority.
- 16 mandatory gate groups.
- Protected branch rules: PR required, independent approval required, blocking CI checks required.

---

## 11. Release engineering and shipping

- Build once, promote immutable artifact.
- Blue/Green canary deployment with health monitoring.
- Expand-and-contract database migration sequencing.
- Production reconciliation verifying deployed SHA and live route health.

---

## 12. SLOs, observability and incident learning

- Measure storefront latency, admin responsiveness, payment idempotency, background job DLQ.
- Corrective actions must strengthen the smallest authoritative constraint preventing recurrence.

---

## 13. Definition of Done

21 explicit criteria covering requirements, base commit, scope conformance, layered verification, mutation testing, accessibility, security, and release provenance.

---

## 14. Frame30 implementation programme

- **Stage 0**: Baseline and contradictions audit (Completed in `F30-AUDIT-STAGE0-001`).
- **Stage 1**: SDLC policy and control plane (Active in `FRAME30-SDLC-000`).
- **Stage 2**: CMS core pilot.
- **Stage 3**: Theme and plugin supply-chain lifecycle.
- **Stage 4**: Marketing, URL and communication correctness.
- **Stage 5**: APIs, OAuth, webhooks, SDK and MCP.
- **Stage 6**: Full platform qualification and release maturity.

---

## 15. Ticket FRAME30-SDLC-000 Execution

Authoritative change contract `features/contracts/FRAME30-SDLC-000.json` governs the control plane implementation.
