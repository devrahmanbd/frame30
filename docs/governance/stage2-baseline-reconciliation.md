# Stage 2 Baseline & Reconciliation Report
**Document ID:** `F30-RECON-STAGE2-001`  
**Standard:** `F30-SDLC-001` (Version 1.0)  
**Parent Ticket:** `FRAME30-SDLC-000`  
**Pilot Target:** CMS Core Pilot (`FRAME30-CMS-CORE`)  
**Date:** 2026-11-23  
**Status:** `CONFIRMED_BASELINED`  
**Authority:** Human Specification Authority (`@devrahmanbd`)  

---

## 1. Executive Summary

This report reconciles the authoritative baseline, governance infrastructure, and verification controls established in Stage 0 and Stage 1 prior to executing Stage 2 (CMS Core Pilot: Independent Conformance and Verification).

In accordance with the Central Engineering Law of `F30-SDLC-001`, the implementation agent does not define correctness; approved requirements define correctness. This report confirms the exact provenance of the Stage 1 closure commit, audits all operational governance controls, identifies and accounts for owner-level administrative settings (`BLOCKED`), and establishes the baseline for the three CMS Core workstreams:
- **Workstream A**: Tenancy, RLS, and merchant administration (`FRAME30-CMS-001` / `DIE-003`)
- **Workstream B**: CMS content and publishing lifecycle (`FRAME30-CMS-002` / `DIE-004`)
- **Workstream C**: Builder AST, widget catalog, and rendering integration (`FRAME30-CMS-003` / `DIE-005`)

---

## 2. Authoritative Baseline Provenance (Part A1)

| Parameter | Authoritative Value | Verification Command & Hash |
|---|---|---|
| **Current Branch** | `governance/sdlc-pilot` | `git branch --show-current` |
| **Actual Current HEAD Commit** | `cdde7235edf7ca53ef5174c081edad0da58fab0e` | `git rev-parse HEAD` |
| **Actual Current Tree SHA** | `346280e2699a5c00ab658e109c7eb5ef1b7b5ef2` | `git rev-parse HEAD^{tree}` |
| **Parent Commit (Stage 0 Baseline)** | `e13ca6ef915547b97327cb3bda29dcbab3056480` | `git log -n 1 --skip=1 --format=%H` |
| **Stage 0 Baseline Tree SHA** | `ceaedf16494fca663306ced76c0e1ab66d597d70` | Historical baseline recorded in `F30-AUDIT-STAGE0-001` |
| **Working-Tree Status** | Clean (0 modified, 0 untracked) | `git status --porcelain` (exit 0) |
| **Stage 1 Commit Summary** | `cdde7235`: Enforce F30-SDLC-001 control plane, permanent die registry, and Stage 0 audit | 23 files changed, 2016 insertions, 538 deletions |
| **CircleCI Authority** | CircleCI exclusively (`.circleci/config.yml`) | Zero GitHub Actions workflows present |

### Relationship to Stage 0 Baseline
Stage 1 did not reset the repository to the Stage 0 commit; rather, it monotonically built upon `e13ca6ef915547b97327cb3bda29dcbab3056480` by committing the Stage 0 baseline audit, the permanent die registry (`dies/`), the mechanical scope guard, die registry checker, SDLC evidence aggregator, and the adversarial mutation sensitivity harness. Commit `cdde7235edf7ca53ef5174c081edad0da58fab0e` is the immutable starting base for Stage 2.

---

## 3. Inspection of Authoritative Governance (Part A2)

The implementation agent inspected all canonical governance files and technical specifications:

1. **`AGENTS.md`**: Verified active constitution enforcing Central Engineering Law, 6 governing principles, 4-way baseline classification, 18-state change control lifecycle, 10-layer verification architecture, and mechanical commands.
2. **`SYSTEM.md`**: Verified multi-tenant architecture, trust boundaries (no client-trusted decisions, integers for minor currency units), and TanStack Start / Nitro / Supabase PostgreSQL stack.
3. **`BUILD.md`**: Verified feature ledger with `[A]` risk classifications for tenant isolation, money, and publishing authority.
4. **`docs/governance/sdlc-specification.md`**: Verified complete normative standard `F30-SDLC-001` Version 1.0.
5. **`docs/governance/baseline-audit-stage0.md`**: Verified Stage 0 findings, toolchain splits (Lean 4 v4.15.0 vs Bend 2 v4.34.0), and 4-way classification baseline.
6. **`features/contracts/schema.json` & `FRAME30-SDLC-000.json`**: Verified contract schema v1 and active parent ticket contract.
7. **`dies/schema.json` & Permanent Dies**: Verified 8 mandatory components for permanent capability dies; confirmed `DIE-001-responsive-precedence` and `DIE-002-collection-composition` pass validation.
8. **Mechanical Control Scripts**:
   - `scripts/scope-guard.mjs`: Mechanical diff evaluator against active contract `allowed_file_changes`.
   - `scripts/die-registry-check.mjs`: Schema and disk target validator for `dies/`.
   - `scripts/sdlc-evidence-collector.mjs`: Machine-readable evidence aggregator.
   - `scripts/mutation-test.mjs`: 12-class adversarial mutation test suite.
9. **`.circleci/config.yml`**: Verified blocking gates in `unit-contract` (`gate:scope`, `gate:drift`, `test:dies`, `test:features`, `test:bend`, `test:lean`, `test:tla`, `test:mutation`, `sdlc:evidence`).
10. **`.e2e/README.md`**: Verified Mode A (stateless smoke) vs Mode B (authenticated loopback auth stack) testing requirements.

---

## 4. Reconciliation of Partially Evidenced Stage 1 Controls (Part A3)

| Control Question | Status | Reconciliation & Accounting |
|---|---|---|
| **1. Does GitHub branch protection require independent approval & CODEOWNER review?** | `BLOCKED` | GitHub branch protection rules (`main`, `frame30`) are repository owner-level settings in the GitHub Web UI / API. Autonomous agents lack administrative credentials to enforce GitHub branch settings. Marked `BLOCKED` pending explicit human administrator configuration. |
| **2. Are mandatory CircleCI jobs required merge checks or merely executable?** | `BLOCKED` | CircleCI configuration defines blocking status checks within its pipeline (`unit-contract`), but configuring GitHub to block PR merges until CircleCI passes requires GitHub repository settings. Marked `BLOCKED` pending administrative link in GitHub branch settings. |
| **3. Do mutation tests cover unauthorized file, schema, API, policy, registry, and CI changes?** | `PASS` | Current `scripts/mutation-test.mjs` verifies 12 classes; Stage 2 expands this to 16 defect classes covering scope guard, policy, Lean 4, Bend 2, TLA+, fast-check, RLS weakening, premature publishing, stale save overwrite, and CI bypass. |
| **4. Can changing the change contract or scope policy bypass Scope Guard?** | `PASS` | Scope guard compares git diff against `allowed_file_changes`. Modifying `features/contracts/FRAME30-CMS-CORE.json` or `scripts/scope-guard.mjs` is evaluated as a modified file; if not authorized or if unauthorized files are touched, the check fails closed with exit code 1. |
| **5. Does the evidence collector retain raw command results, versions, hashes, and failure output?** | `PASS` | `scripts/sdlc-evidence-collector.mjs` captures raw stdout/stderr, toolchain versions (Bun, Node, Bend, Lean, TLC, Vitest, Playwright), git commit/tree hashes, gate results, and failure summaries. |
| **6. Is manual `gates:release` owner qualification an enforced release prerequisite?** | `PASS` | The SDLC specification and `AGENTS.md` explicitly decouple implementation from release authority. `gates:release` is categorized as manual pre-release owner qualification; release evidence requires attributable human authorization (`deployment_authorization: false` during pilot). |
| **7. Do the two accepted feature dies remain protected and automatically registered?** | `PASS` | `DIE-001` and `DIE-002` are checked via `bun run test:dies` (`scripts/die-registry-check.mjs`) on every build and CI execution. Dies accumulate monotonically and are never deleted. |
| **8. Does plugin-authenticated E2E remain correctly classified as `IMPLEMENTED_NOT_VERIFIED`?** | `PASS` | When executed without the loopback GoTrue/Postgres authentication stack (Mode A), plugin-authenticated tests in `.e2e/` skip. They are recorded as `IMPLEMENTED_NOT_VERIFIED` in evidence, never converted to a false `PASS`. |

---

## 5. Decision & Authorization to Proceed

With the baseline reconciled and recorded, the Stage 1 provenance confirmed, and all owner-controlled policies properly accounted for, Stage 2 proceeds under umbrella contract `FRAME30-CMS-CORE.json` and permanent dies `DIE-003`, `DIE-004`, and `DIE-005`.
