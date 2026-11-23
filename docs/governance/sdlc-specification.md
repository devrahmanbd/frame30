# Frame30 Proof-Driven Software Development Lifecycle (SDLC)
## Strict Agent Containment, Formal Verification, Property-Based UI Testing & Release Governance

**Programme**: Frame30 Engineering Governance  
**Status**: APPROVED SPECIFICATION (Gate C)  
**Authority**: Human Specification Owner (`@devrahmanbd`)  
**CI Authority**: CircleCI (Blocking)  
**Required Technologies**: TLA+/TLC, Lean 4, Bend 2, fast-check, Bombadil, Playwright  

---

## 1. Mission and Authority Separation

The objective of this SDLC is to establish mathematical and operational containment over autonomous coding agents. An agent can discover and implement *how* to fulfill an approved feature, but cannot decide *what* is allowed to change, redefine correctness criteria, expand its own scope, bypass verification, or approve its own release.

### Three Independent Responsibilities

```
+--------------------------------------------------------------------------+
|                     A. Specification & Policy Authority                  |
|                                  (Human)                                 |
|  - Owns change contracts, correctness laws, acceptance criteria          |
|  - Owns CODEOWNERS, protected branch rules, release authorizations       |
+------------------------------------+-------------------------------------+
                                     | Defines boundary & laws
                                     v
+------------------------------------+-------------------------------------+
|                     B. Implementation Authority                          |
|                            (Coding Agent)                                |
|  - Prepares plans, touches authorized files, writes code & proofs        |
|  - Proves correspondence; CANNOT expand scope or modify laws             |
+------------------------------------+-------------------------------------+
                                     | Produces code & proof artifacts
                                     v
+------------------------------------+-------------------------------------+
|                    C. Independent Verification Authority                 |
|               (Machine Verifiers, CI Gates, Release Auditor)             |
|  - Scope Guard (Git diff vs contract)                                    |
|  - Bend 2 (verdict-capable kernel), Lean 4 (Lake), TLA+ (TLC)            |
|  - fast-check properties, Bombadil browser exploration, Playwright tests |
|  - Verification Drift checker; MUST be able to reject implementation     |
+--------------------------------------------------------------------------+
```

### Inviolable Governance Principles
1. **No Client-Side / Agent-Trusted Decisions**: Money uses integer minor units (`amount_minor_int`). Roles, discounts, stock, and access resolve server-side.
2. **Fail-Closed Verification**: A missing credential, toolchain, or test environment produces `BLOCKED` or `FAIL`. Silent skipping or vacuous passes are forbidden.
3. **Immutability of Baseline**: Production deployments require exact commit SHA and tree SHA correspondence. `.output/DEPLOYED_SHA` is strictly read-only for agents.
4. **Zero GitHub Actions Workflows**: CircleCI (`.circleci/config.yml`) is the sole CI authority.

---

## 2. The 15-State Change-Control State Machine

Every engineering modification follows an explicit, monotonic lifecycle:

```
 [1. REQUESTED]
       |
       v
 [2. BASELINED] -------- (git rev-parse HEAD & HEAD^{tree} recorded)
       |
       v
 [3. SPECIFICATION_APPROVED] -- (Human-authorized Change Contract in features/contracts/)
       |
       v
 [4. VERIFICATION_DESIGNED] --- (Bend laws, Lean theorem stubs, property designs defined)
       |
       v
 [5. BASELINE_CHALLENGED] ----- (Mutation sensitivity proven on existing baseline)
       |
       v
 [6. IMPLEMENTATION_AUTHORIZED] (Scope guard armed with immutable change contract)
       |
       v
 [7. IMPLEMENTED] ------------- (Code written strictly within allowed_file_changes)
       |
       v
 [8. FORMALLY_VERIFIED] ------- (Bend check + Lean Lake build + TLA+ TLC pass)
       |
       v
 [9. PROPERTY_VERIFIED] ------- (fast-check property suites pass across 100+ seeds)
       |
       v
 [10. BROWSER_VERIFIED] ------- (Bombadil 8 viewports + Playwright deterministic journeys)
       |
       v
 [11. REGRESSION_VERIFIED] ---- (Visual baselines, theme compliance, blast-radius checked)
       |
       v
 [12. INDEPENDENTLY_ACCEPTED] - (Independent review against all 14 governance sections)
       |
       v
 [13. MERGE_AUTHORIZED] ------- (Human owner approval via CODEOWNERS)
       |
       v
 [14. RELEASE_AUTHORIZED] ----- (Staging verification, migration rehearsal completed)
       |
       v
 [15. RELEASE_VERIFIED] ------- (Production SHA equality, canary probe, health check)
```

### Preconditions and Transition Rules
- **Precondition to IMPLEMENTED**: The agent must never touch a file not explicitly listed in `allowed_file_changes` of the authorized change contract.
- **Precondition to FORMALLY_VERIFIED**: Zero `sorry` in Lean; zero syntax/type errors in Bend 2; zero unhandled states or invariant violations in TLC.
- **Precondition to BROWSER_VERIFIED**: Real browser execution across all 8 viewports (`320`, `360`, `390`, `430`, `768`, `1024`, `1280`, `1440`). Zero horizontal overflow (`scrollWidth <= innerWidth`).
- **Failure Fallback**: Any invariant violation immediately halts the pipeline, resetting status to `FAIL` or `BLOCKED`. Transitions can never be skipped.

---

## 3. Feature Change Contract Schema

All work must be authorized by an immutable contract stored in `features/contracts/<feature_id>.json`.

### Schema Specification
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Frame30FeatureChangeContract",
  "type": "object",
  "required": [
    "feature_id",
    "title",
    "owner",
    "baseline_commit",
    "baseline_tree",
    "objective",
    "merchant_or_user_outcome",
    "in_scope",
    "out_of_scope",
    "allowed_file_changes",
    "forbidden_file_changes",
    "api_contract_changes",
    "database_schema_changes",
    "dependency_changes",
    "security_changes",
    "required_invariants",
    "required_acceptance",
    "required_formal_verification",
    "required_ui_properties",
    "required_browser_workflows",
    "required_regression_suites",
    "deployment_authorization"
  ],
  "properties": {
    "feature_id": { "type": "string", "pattern": "^[A-Z0-9_-]+$" },
    "title": { "type": "string" },
    "owner": { "type": "string" },
    "baseline_commit": { "type": "string", "pattern": "^[0-9a-f]{40}$" },
    "baseline_tree": { "type": "string", "pattern": "^[0-9a-f]{40}$" },
    "objective": { "type": "string" },
    "merchant_or_user_outcome": { "type": "string" },
    "in_scope": {
      "type": "object",
      "required": ["routes", "components", "services", "files"],
      "properties": {
        "routes": { "type": "array", "items": { "type": "string" } },
        "components": { "type": "array", "items": { "type": "string" } },
        "services": { "type": "array", "items": { "type": "string" } },
        "files": { "type": "array", "items": { "type": "string" } }
      }
    },
    "out_of_scope": {
      "type": "object",
      "required": ["routes", "components", "services", "files"],
      "properties": {
        "routes": { "type": "array", "items": { "type": "string" } },
        "components": { "type": "array", "items": { "type": "string" } },
        "services": { "type": "array", "items": { "type": "string" } },
        "files": { "type": "array", "items": { "type": "string" } }
      }
    },
    "allowed_file_changes": { "type": "array", "items": { "type": "string" } },
    "forbidden_file_changes": { "type": "array", "items": { "type": "string" } },
    "api_contract_changes": { "type": "boolean" },
    "database_schema_changes": { "type": "boolean" },
    "dependency_changes": { "type": "boolean" },
    "security_changes": { "type": "boolean" },
    "required_invariants": { "type": "array", "items": { "type": "string" } },
    "required_acceptance": { "type": "array", "items": { "type": "string" } },
    "required_formal_verification": {
      "type": "object",
      "required": ["bend", "lean", "tla"],
      "properties": {
        "bend": { "type": "object" },
        "lean": { "type": "object" },
        "tla": { "type": "object" }
      }
    },
    "required_ui_properties": { "type": "array", "items": { "type": "string" } },
    "required_browser_workflows": { "type": "array", "items": { "type": "string" } },
    "required_regression_suites": { "type": "array", "items": { "type": "string" } },
    "deployment_authorization": { "type": "boolean", "const": false }
  }
}
```

---

## 4. Mandatory Scope Enforcement (`scripts/scope-guard.mjs`)

The Scope Guard is a mechanical gate that executes in CircleCI and locally before any build or test suite:
1. Determines the active change contract from `features/contracts/` or environment variable `ACTIVE_CHANGE_CONTRACT`.
2. Inspects `git diff --name-status <baseline_commit>...HEAD` (plus uncommitted changes if local).
3. Evaluates every touched path against `allowed_file_changes` and `forbidden_file_changes`.
4. Rejects additions, modifications, renames, mode changes, and deletions outside authorized bounds.
5. Emits a non-zero exit code on unauthorized modifications. Fails closed if the contract is missing, malformed, or references an invalid baseline.

---

## 5. Protected Policy Ownership (`CODEOWNERS`)

The following files constitute the engineering constitution and governance framework. They are protected by `CODEOWNERS` and require explicit human review by `@devrahmanbd`:
- `AGENTS.md` (Engineering constitution)
- `features/contracts/**` (Change contracts)
- `CODEOWNERS` (Ownership assignments)
- `specs/bend/LAWS.bend` (Human-owned correctness laws)
- `specs/lean/**` (Lean theorem specifications)
- `specs/tla/**` (TLA+ concurrency models and configurations)
- `scripts/scope-guard.mjs`, `scripts/bend-verify.mjs`, `scripts/verification-drift.mjs`
- `.circleci/config.yml` (CI authority pipeline)
- `docs/governance/**` (SDLC specifications and records)

---

## 6. Formal Verification System Architecture

Three complementary formal technologies are deployed, each mapped to a distinct domain of verification:

| Technology | Authority & Repository | Responsibility | Toolchain |
|---|---|---|---|
| **Bend 2** | `specs/bend/LAWS.bend` (Human)<br>`specs/bend/PROOF.bend` (Agent) | Pure functional correctness laws: responsive cascade precedence, override reset semantics, collection rail self-exclusion, cross-sell preservation | `bend-lang 0.2.38` via `bend check` & `bend run-rs` |
| **Lean 4** | `specs/lean/Pricing.lean`<br>`specs/lean/ThemeLifecycle.lean` | Deep mathematical invariants: non-negative integer minor unit arithmetic, discount bounds, idempotent migrations, schema version preservation | `leanprover/lean4:v4.15.0` via `lake build` + `#print axioms` |
| **TLA+ / TLC** | `specs/tla/CheckoutInventory.tla`<br>`specs/tla/ThemeLifecycle.tla`<br>`specs/tla/ResponsiveAutosave.tla` | Distributed concurrency & state transitions: stock holds, inventory reservation timeouts, theme version activation, builder autosave revision order | TLC2 (rev: bc1b506) with OpenJDK 21 |

### Verification Drift Protection (`scripts/verification-drift.mjs`)
Every formal model declares the exact SHA-256 hashes of the production source files it models. The verification drift gate recalculates production source hashes on every CI run; any divergence between model declarations and current code fails closed.

---

## 7. Property-Based Testing & Browser Exploration

1. **fast-check**: Mathematical property sweeps testing thousands of randomized permutations of AST overrides, device breakpoints, collection hierarchies, and pricing rules with automatic counterexample shrinking.
2. **Bombadil**: Autonomous runtime exploration executing non-deterministic action sequences (device switching, override clearing, navigation, taxonomy filtering) across 8 responsive viewports (`320px`, `360px`, `390px`, `430px`, `768px`, `1024px`, `1280px`, `1440px`), continuously asserting invariants (`scrollWidth <= innerWidth`, zero 5xx, zero uncaught JS exceptions).
3. **Playwright**: Deterministic regression suites for critical merchant and customer user journeys with fail-closed authentication (no silent skips).

---

## 8. Adversarial Mutation Sensitivity Harness

A verification suite is only trusted if it is proven capable of detecting the exact classes of defects it guards against. The mutation harness (`scripts/mutation-test.mjs`) tests:
1. **Responsive Mutation**: Break reset inheritance (e.g. mutate desktop or ignore parent device) -> Assert `test:responsive`, `test:properties`, and `bend-verify` FAIL.
2. **Collection Merchandising Mutation**: Disable self-exclusion or omit cross-sells -> Assert `test:properties` and `songoskriti-preview-compositions.test.tsx` FAIL.
3. **Scope Control Mutation**: Touch unauthorized backend file (`src/lib/server.ts`) -> Assert `scripts/scope-guard.mjs` FAILS with exit code 1.

---

## 9. CircleCI Gate Pipeline Architecture

The pipeline order is strictly sequenced to ensure fast feedback and fail-closed security:

```
1. scope-guard           (git diff vs features/contracts/*.json)
2. lint-typecheck        (ESLint + tsgo --noEmit + bash -n)
3. verification-drift    (SHA-256 source sync check)
4. formal-verification   (Bend check + Lean 4 lake build + TLA+ TLC)
5. property-testing      (fast-check 9 suites, 57+ properties)
6. deterministic-tests   (Vitest unit/contract + responsive customization)
7. browser-exploration   (Bombadil 8 viewports + Playwright A3/A4)
8. build                 (Vite 8 + Nitro production build)
```
