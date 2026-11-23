# GitHub Branch Protection & Repository Ruleset Specification
## Frame30 Proof-Driven SDLC Governance Enforcement

**Repository**: `https://github.com/devrahmanbd/frame30`  
**Governance Authority**: Human Specification Owner (`@devrahmanbd`)  
**CI Authority**: CircleCI (Blocking)  
**Status**: SPECIFICATION AUTHORITATIVE — Live Settings Status: `BLOCKED (Requires Human Admin Configuration)`

---

## 1. Governance Boundary & Authority Separation

Per the Frame30 Proof-Driven SDLC Authority Model, autonomous coding agents operate under strict **Implementation Authority** and do not possess GitHub Organization Administrator credentials. Consequently, repository branch protection rules, push restrictions, and ruleset configurations cannot be altered by agents and require human administrative action.

| Setting Domain | Authority | Agent Access | Configuration Status |
| :--- | :--- | :--- | :--- |
| **CODEOWNERS Rules** | Repository | Read / Propose | **ENFORCED** in repository |
| **Pre-commit / CI Verification** | CircleCI | Execution | **ENFORCED** in `.circleci/config.yml` |
| **GitHub Branch Protection Rulesets** | GitHub Admin API | Inaccessible | `BLOCKED (Requires Human Admin Configuration)` |
| **Force-Push & Deletion Locks** | GitHub Repo Settings | Inaccessible | `BLOCKED (Requires Human Admin Configuration)` |
| **Required Status Check Policy** | GitHub Repo Settings | Inaccessible | `BLOCKED (Requires Human Admin Configuration)` |

---

## 2. Authoritative Branch Protection Configuration for `main`

The production release branch `main` must be protected by the following exhaustive ruleset:

### 2.1. Pull Request & Review Requirements
- **Require a pull request before merging**: `true`
- **Required approving reviews**: `1`
- **Dismiss stale pull request approvals when new commits are pushed**: `true`
- **Require review from Code Owners**: `true` (Enforces human owner `@devrahmanbd` on governance, contracts, DB migrations, and CI)
- **Require approval of the most recent push**: `true`
- **Require conversation resolution before merging**: `true`
- **Restrict review dismissals**: Restricted to `@devrahmanbd`

### 2.2. Required Status Checks (CircleCI Strict Gating)
- **Require status checks to pass before merging**: `true`
- **Require branches to be up to date before merging**: `true` (Strict fast-forward / merge-base validation)
- **Required Check Contexts**:
  1. `ci/circleci: lint-typecheck` (ESLint, tsgo typecheck, shell syntax)
  2. `ci/circleci: unit-contract` (Scope guard, drift check, Bend 2, Lean 4, TLA+, fast-check, mutation harness)
  3. `ci/circleci: scan` (Secret scan, SAST diff scan, dependency audit)
  4. `ci/circleci: build` (Vite + Nitro production bundle compilation)
  5. `ci/circleci: e2e-critical` (Playwright critical merchant and customer loops)
  6. `ci/circleci: e2e-security` (Adversarial security and tenant isolation specs)
  7. `ci/circleci: e2e-levelb-production` (Genuine bundle Level B theme execution)
  8. `ci/circleci: e2e-seven-templates` (Isolated Docker loopback merchant journey)
  9. `ci/circleci: bombadil-staging` (8-viewport browser property exploration)
  10. `ci/circleci: plugin-storefront-gate` (Plugin isolation tripwires)

### 2.3. Commit & History Invariants
- **Require linear history**: `true` (Rebase or squash merge only; no merge bubbles)
- **Require signed commits**: `true` (GPG / SSH verified commits)
- **Do not allow bypassing the above settings**: `true` (Enforce restrictions for administrators)
- **Allow force pushes**: `false` (Strictly blocked across all actors)
- **Allow deletions**: `false` (Branch cannot be deleted)

---

## 3. Authoritative Ruleset for Integration & Feature Branches (`governance/*`, `feat/*`)

All feature, governance, and integration branches must adhere to:
- **Block direct pushes from automated agents without PR**: Enforced.
- **Block force pushes to shared branches**: Enforced.
- **Require CircleCI passing status**: `unit-contract` and `lint-typecheck` mandatory.

---

## 4. Human Admin Execution Instructions (1-Step API / CLI)

To activate this ruleset, the human repository administrator (`@devrahmanbd`) can execute the following `gh` CLI command:

```bash
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/devrahmanbd/frame30/branches/main/protection \
  -f required_status_checks[strict]=true \
  -f required_status_checks[contexts][]="ci/circleci: lint-typecheck" \
  -f required_status_checks[contexts][]="ci/circleci: unit-contract" \
  -f required_status_checks[contexts][]="ci/circleci: scan" \
  -f required_status_checks[contexts][]="ci/circleci: build" \
  -f required_status_checks[contexts][]="ci/circleci: e2e-critical" \
  -f required_status_checks[contexts][]="ci/circleci: bombadil-staging" \
  -f required_status_checks[contexts][]="ci/circleci: e2e-seven-templates" \
  -f enforce_admins=true \
  -f required_pull_request_reviews[dismiss_stale_reviews]=true \
  -f required_pull_request_reviews[require_code_owner_reviews]=true \
  -f required_pull_request_reviews[required_approving_review_count]=1 \
  -f required_linear_history=true \
  -f allow_force_pushes=false \
  -f allow_deletions=false
```

---

## 5. Audit & Conformance Evidence

- **CODEOWNERS File**: Verified at `.github/CODEOWNERS` (covers `/features/contracts/`, `/specs/`, `AGENTS.md`, `.circleci/`).
- **CircleCI Enforcement**: Verified in `.circleci/config.yml` (all 10 check contexts configured as blocking).
- **GitHub API Rule Status**: Logged as `BLOCKED (Requires Human Admin Configuration)` per strict agent containment laws.
