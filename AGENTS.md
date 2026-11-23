# Framique Engineering Rules & Operating Constitution

> **Authority**: Human Specification Authority (`@devrahmanbd`)  
> **Normative Standard**: Frame30 Engineering SDLC (`F30-SDLC-001`, Version 1.0)  
> **CI Authority**: CircleCI only (No GitHub Actions)  
> **Permanent Registry**: `dies/` (Permanent-Die System)  
> **Change Control**: `features/contracts/` (Feature Change Contracts)  

Keep the repository in a clean, working state. All tests and type checks must pass before pushing changes.

---

## 🔴 Central Engineering Law (non-negotiable)

> **Requirement-First, Proof-Backed Development (F30-SDLC-001)**
>
> 1. **The implementation is not the definition of correctness.**
> 2. **The approved requirement defines correctness.**
> 3. **Formal specifications express the mathematical properties that must hold.**
> 4. **Independent verification challenges the implementation.**
> 5. **Existing accepted contracts (Permanent Dies) remain active throughout every subsequent development cycle.**
> 6. **A feature is not accepted merely because it builds, its own tests pass, or an agent says so.**
> 7. **It is accepted only when its new obligations and every applicable existing obligation have passed independent verification, with any unproved or untested claims explicitly disclosed.**

### 4-Way Capability Baseline Classification
Every capability in Frame30 has one of four classifications:
- **Confirmed stable**: Intended behaviour is understood and accepted -> Protect it permanently via versioned dies in `dies/`.
- **Existing but unverified**: Works today, but full requirements unknown -> Characterise it and establish expected behaviour before locking contracts.
- **Known defect**: Current behaviour is incorrect -> Document the defect and define the correct requirement. **Never write a test asserting the bug.**
- **Approved change**: Old behaviour is intentionally being replaced -> Record the authorised change contract and protect the new behaviour.

**Inviolable Law**: *Never weaken a valid requirement merely to make an implementation pass verification.* If an oracle fails, the default presumption is that the implementation is defective.

---

## 0. Six Governing Requirements of the Frame30 SDLC

Per `F30-SDLC-001 Section 0`, all engineering modifications must conform to these six requirements:

1. **Requirements define correctness.** The implementation and its tests do not get to redefine the approved requirement.
2. **Every change has an explicit boundary.** The agent may only change authorized product surfaces, files, schemas, APIs, configuration, and behavior. All changes are enforced mechanically via `bun run gate:scope`.
3. **Existing accepted behavior remains protected.** New features add obligations; they do not erase old ones. Dies in `dies/` accumulate monotonically and are never deleted or relaxed.
4. **Verification is risk-based and layered.** Static constraints, contracts, generated properties, browser exploration, deterministic journeys, formal methods, security tests, and operational checks each have a defined job across 10 verification layers.
5. **Evidence is tied to the exact source and artifact.** A green command, a Git commit, a built artifact, and a production deployment are different facts. Receipts must be mechanically aggregated via `bun run sdlc:evidence`.
6. **Release and production authority are separate from implementation.** An agent may prepare a release candidate but may not approve its own work or deploy without designated human authorization.

---

## 1. Agent Execution Authority Model & Containment

Per `F30-SDLC-001 Section 9.1`, autonomous agents operate under strict containment:

### What the Agent CAN Do:
- Read repository files and approved human specifications.
- Propose designs, tests, formal properties, and change contracts.
- Modify files authorized explicitly in `allowed_file_changes` within an isolated work environment.
- Execute approved local verification checks and test environments.
- Produce evidence receipts, change reports, and pull requests.

### What the Agent CANNOT Do (without explicit human authorization):
- Change protected requirements, architecture policy, CI gates, CODEOWNERS, scope checker, release policy, or secrets.
- Expand approved file paths, permissions, or scope boundaries unilaterally.
- Push directly to protected production branches (`main`, `frame30`), rewrite history, or force-push.
- Access production credentials or mutate production data.
- Approve its own work, bypass peer reviews, or trigger production deployments.
- Accept its own visual baselines, weaken tests, or modify test expectations to make a failed suite pass.

---

## 2. The 18-State Change-Control Lifecycle

Every non-trivial engineering modification follows an explicit, monotonic lifecycle:

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

### Fail-Closed Result Accounting
- `PASS`: Command executed and evidence satisfies declared requirements.
- `FAIL`: Requirement was violated.
- `BLOCKED`: Required environment, toolchain, credential, or test is missing.
- `NOT_APPLICABLE`: Documented technical reason plus independent approval.

**Zero Tolerance for Silent Skips**: A skipped mandatory test is `BLOCKED`, never `PASS`. Plugin authenticated tests in `.e2e/` skipped in mode A cannot satisfy release qualification.

---

## 3. Risk Classification

Reuse the `[A]` marker in `BUILD.md` for money, transaction integrity, data safety, tenant isolation, and security risks:

| Risk Class | Product Domains & Examples | Required Assurance |
|---|---|---|
| **Critical / `[A]`** | Tenant/RLS, authentication, authorization, payment, money, inventory reservation, secrets, API keys, plugin execution, destructive migrations, publishing authority, backup/restore | Independent human specification; deny + replay + audit tests; fast-check property tests; formal proof/model (Lean/Bend/TLA+); mutation sensitivity testing; isolated E2E qualification; explicit human CODEOWNER sign-off |
| **High** | Theme runtime, builder AST, plugin/theme lifecycle, SEO route/slug/canonical behavior, SMTP/message delivery, webhooks, OAuth, public API, scheduled jobs, data exports | Contract and compatibility tests; generated properties; failure/replay tests; browser/API E2E; security review; mutation checks for critical invariants |
| **Standard** | Isolated admin UI, copy, non-authoritative presentation, low-risk internal refactors | Static checks, unit/component tests, accessibility/visual checks, affected feature regression |

---

## 4. The 10-Layer Verification Architecture

Framique enforces mathematical, structural, and behavioral containment across ten complementary verification layers:

```
  [09 — Mutation Sensitivity]      Adversarial scratch mutations proving fail-closed detector teeth
  [08 — Security & Adversarial]    OWASP ASVS 5.0.0, negative auth, token replay, injection tests
  [07 — Visual, A11y & Perf]       8-viewport stills (320-1440px), WCAG 2.2 AA, Core Web Vitals
  [06 — Deterministic E2E]         Playwright browser journeys (critical loops, theme isolation)
  [05 — Property DOM Fuzzing]      Bombadil 8-viewport DOM exploration & runtime invariant assertion
  [04 — Formal Verification]       Lean 4 theorems, Bend 2 laws (--verdict), TLA+ TLC model checker
  [03 — Generative Properties]     fast-check randomized property testing across thousands of inputs
  [02 — Contract Tests]            Provider/consumer contracts for DB RPC, APIs, events, AST schemas
  [01 — Unit & Component Tests]    Deterministic isolated component & server-function logic tests
  [00 — Policy, Source & Static]   Scope guard (git diff vs contract), drift guard, typecheck, lint, SCA
```

---

## 5. The Permanent-Die System (`dies/`)

A **Frame30 Die** is an immutable, versioned specification of an accepted product capability, backed by independent verification obligations.

Every die (`dies/<die_id>/die.json`) must contain 8 mandatory components:
1. **Requirement**: What the capability accomplishes from the merchant/shopper perspective.
2. **Protected Behaviour**: Invariants that must continue working under all future refactors.
3. **Forbidden Behaviour**: Specific failure modes that are strictly prohibited.
4. **Formal Laws**: Pure mathematical properties stated in Bend 2 (`LAWS.bend`) or Lean 4.
5. **Executable Model**: Independent reference implementation acting as the oracle.
6. **Conformance Obligations**: Automated test suites linking production code to the specification.
7. **Adversarial Checks**: Deliberate mutation tests proving that verification gates catch defects.
8. **Regression Requirements**: Explicit dependencies on previously accepted dies that must remain unbroken.

**Monotonic Accumulation**: New capabilities add new dies. Existing dies are never deleted, silenced, or weakened.

---

## 6. Canonical Commands

```bash
# Static & Policy Controls
bun run gate:scope                 # Mechanical scope guard (git diff vs contract)
bun run gate:drift                 # Verification drift gate (SHA-256 source sync)
bun run lint                       # ESLint
bun run format                     # Prettier
bun run typecheck                  # tsgo --noEmit

# Formal Verification Tools
bun run test:bend                  # Bend 2 formal verifier with Lean-backed kernel (--verdict)
bun run test:lean                  # Lean 4 formal verification & refinement (Lake build + axioms)
bun run test:tla                   # TLA+ specification validation (TLC model checking)

# Logic, Contracts & Properties
bun run test                       # Vitest unit + integration tests
bun run test:contracts             # Contract gate
bun run test:properties            # fast-check property suites
bun run test:features              # Feature map documentation integrity gate
bun run test:dies                  # Permanent die registry schema & linkage gate
bun run test:mutation              # 12-class adversarial mutation sensitivity harness

# Browser Exploration & E2E
bun run test:bombadil              # Bombadil property-based UI exploration (smoke)
bun run test:bombadil:all          # Bombadil 8-viewport DOM fuzzing matrix
bun run e2e:critical               # Playwright critical browser journeys
bun run e2e:security               # Playwright adversarial security specs
bun run e2e                        # Playwright full suite

# Release Engineering & Evidence
bun run sdlc:evidence              # Machine-readable SDLC evidence aggregator
bun run schema:check               # Repo migrations vs live schema fingerprint
bun run secrets:scan               # Blocking secret scan
bun run sast:scan                  # Blocking SAST suspicious diff scan
bun run build                      # Production build (Vite 8 + Nitro)
bun run gates                      # Full release gate suite
bun run gates:release              # Pre-release owner qualification gates (perf, seo, a11y, vitals)
```

**Standard Verification Sequence**:  
`gate:scope` → `gate:drift` → `lint` → `typecheck` → `test:dies` → `test:features` → `test:bend` → `test:lean` → `test:tla` → `test:properties` → `test` → `test:contracts` → `test:mutation` → `build` → `sdlc:evidence`

---

## 7. Architecture Rules (non-negotiable)

1. **No client-trusted decisions**: price, discount, stock, tax, entitlement, risk, and role resolve server-side only.
2. **Integer minor units for money**: `amount_minor_int` + `currency_code`. No floats stored, transmitted, or computed.
3. **Secrets never leave the server boundary**: never in error bodies, logs, or metric labels.
4. **RLS on every public table** plus explicit `GRANT`s per role.
5. **No `server-only` import** — use `*.server.ts` naming instead (ESLint enforced).
6. **Append-only audit rows** for every `[A]` action (actor, before, after, reason).
7. **Scope Authority**: Every modification requires an active Feature Change Contract (`features/contracts/*.json`). Modifications outside `allowed_file_changes` fail closed via `bun run gate:scope`.
8. **Permanent-Die System**: Accepted capabilities join the permanent registry in `dies/`. Dies accumulate monotonically.
9. **Concurrent sessions claim files first**: Multiple agents share this tree and `main`. Before starting a lane, append files under a `CLAIMED:` line in `/tmp/opencode/progress.md`; treat other lanes' claimed files as read-only.
10. **CircleCI is the sole CI authority**: Never create or modify GitHub Actions workflows (`.github/`).

---

## 8. Definition of Done

Per `F30-SDLC-001 Section 13`, a change is complete only when:
- Its requirement and observable acceptance criteria were approved before implementation.
- Its base commit/tree and existing behavior were recorded.
- Its risk class and impact map are complete.
- Its actual Git diff conforms strictly to the approved scope via `bun run gate:scope`.
- Its tests are derived from the approved requirement or independent reference behavior.
- New and affected existing contracts pass; mandatory system contracts pass.
- Required denied/negative/replay/audit cases pass for `[A]` changes.
- Applicable formal verification executes with valid provenance and production correspondence.
- Generated properties and browser exploration cover the actual production path in declared scope.
- No required check is skipped or silently conditional.
- Mutation tests demonstrate detection for critical laws and controls.
- Accessibility, responsiveness, localization, and performance are verified where relevant.
- Security and supply-chain findings are resolved or approved.
- CI jobs are required by branch protection.
- Independent review approves the exact final diff.
- Build artifact and release evidence identify exact source/build provenance via `bun run sdlc:evidence`.
- The production artifact, live behavior, and post-release health are reconciled.
- `BUILD.md`, feature map, domain docs, and evidence index are updated.

---

## Related Documentation

- `docs/governance/sdlc-specification.md` — Normative Frame30 Engineering SDLC (`F30-SDLC-001`)
- `docs/governance/baseline-audit-stage0.md` — Stage 0 Baseline & Contradictions Audit Report
- `SYSTEM.md` — Architecture, stack decisions, trust boundaries, deployment topology
- `BUILD.md` — Feature ledger with launch tiers and `[A]` risk markers
- `DESIGN.md` — Design system tokens and component specs
- `CODEOWNERS` — Protected policy ownership assignments
- `dies/README.md` — Permanent Die Registry index and architecture
- `features/contracts/` — Feature Change Contracts
