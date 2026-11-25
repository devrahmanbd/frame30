# Frame30 DICE CircleCI Pipeline Enforcement Report
**Continuous Integration Security Architecture & Isolated Attestation Pipeline**

- **Specification Authority**: Human Specification Authority (`@devrahmanbd`)
- **CI Authority**: CircleCI Sole Authority (Zero GitHub Actions Workflows)
- **Configuration File**: `.circleci/config.yml`
- **Date**: 2026-11-25

---

## 1. Exclusive CI Authority Model

In accordance with `AGENTS.md` and `F30-SDLC-001` Section 11:
- **CircleCI is the sole CI authority for Frame30.**
- No GitHub Actions workflows (`.github/workflows/`) exist or are permitted.
- All branch protection rules and release qualification gates require CircleCI job checks to pass before pull request merge authorization.

---

## 2. Pinned Reference Architecture in CircleCI

To defeat candidate-injected tampering, the CircleCI configuration enforces pinned reference extraction:

```yaml
TRUSTED_REF="${DICE_TRUSTED_REF:-9e6a82abb3502edb84f2d7be9fcc36401b380bfb}"
ROOT_REF="${DICE_ROOT_REF:-2d1d32f9b49628ce0a4ae8ff9cbe805e94cb4271}"
```

Before running any verification commands:
1. `git fetch origin $TRUSTED_REF $ROOT_REF 382261db0cb5b796046ae03c28fd8f309b901123` retrieves the immutable baseline and trusted reference commits.
2. `git archive "$TRUSTED_REF"` extracts trusted verification scripts and registries into external directories (`/tmp/dice-protected-launcher`, `/tmp/dice-protected-signer`).
3. In-tree candidate scripts are strictly bypassed and cannot override the verification launcher or signer.

---

## 3. Dedicated Verification & Signing Jobs

The DICE CI pipeline isolates unprivileged execution from attestation signing through two sequential jobs:

```
[ unit-contract ]
       │
       ▼
[ dice-qualification ] ────────► artifacts/dice-evidence (Unsigned Receipts)
       │                                     │
       ▼                                     ▼
[ dice-attestation-signing ] ◄──────── Workspace Transfer
       │
       ▼
artifacts/dice-evidence (Signed Attestation Bundle + Detached Digest Signature)
```

### Job 1: `dice-qualification` (Unprivileged Worker Execution)
- **Executor**: Ubuntu 22.04 (`ubuntu-2204:current`) machine runner with native kernel Bubblewrap support (`bwrap`).
- **Steps**:
  1. Unshallow git repository and verify `$TRUSTED_REF` and `$ROOT_REF` commits.
  2. Execute mechanical scope guard: `ACTIVE_CHANGE_CONTRACT=features/contracts/F30-DICE-COMPLETE.json bun run gate:scope`.
  3. Install Bubblewrap OS sandbox substrate (`sudo apt-get install -y bubblewrap`).
  4. Extract and run protected launcher from `$TRUSTED_REF` using independently authorized test qualification contract without `--dry-run`.
  5. Run all DICE Vitest test suites with serialized execution (`--fileParallelism=false`).
  6. Store raw execution receipts and qualification summary in `artifacts/dice-evidence`.

### Job 2: `dice-attestation-signing` (Isolated Cryptographic Signing)
- **Executor**: Ubuntu 22.04 (`ubuntu-2204:current`) machine runner with pure Node execution.
- **Access Boundary**: Possesses `DICE_SIGNING_KEY` credential in environment (inaccessible to `dice-qualification` worker).
- **Isolation Guarantees**:
  1. No candidate dependencies installed (`bun install` omitted).
  2. No candidate-controlled tests executed in signing context.
  3. Pure Node runner extracts protected signer distribution directly from `$TRUSTED_REF`.
  4. Error suppression eliminated (zero `|| true`). Non-zero exit code on `UNATTESTED` or failure.
  5. Evaluates candidate qualification using Two-Tier Engine (`evaluateCandidateQualification`).
  6. If and only if qualification evaluates strictly to `QUALIFIED_PASS`, generates in-toto DSSE attestation envelope (`attestation.dsse.json`) with Ed25519 signature.
  7. Stores verifiable signed attestation in `artifacts/dice-evidence/attestation.dsse.json`.

---

## 4. Pipeline Gate Flow & Upstream Dependencies

Per `F30-DICE-ARCH-001` Section 10 and P0-2, `dice-attestation-signing` executes strictly downstream of every mandatory technical qualification job:

```
[ lint-typecheck ] ──┐
[ unit-contract ]  ──┤
[ dice-qualification ]─┤
[ scan ]           ──┤
[ build ]          ──┼──► [ e2e-critical ] ──────────────┐
                     ├──► [ e2e-security ] ──────────────┼──► [ dice-attestation-signing ]
                     ├──► [ e2e-levelb-production ] ─────┤      (Requires ALL 11 jobs)
                     ├──► [ e2e-seven-templates ] ───────┤
                     └──► [ bombadil-staging ] ──────────┤
[ plugin-storefront-gate ] ──────────────────────────────┘
```

The signing job requires all eleven upstream gates:
1. `lint-typecheck`
2. `unit-contract`
3. `dice-qualification`
4. `scan`
5. `build`
6. `e2e-critical`
7. `e2e-security`
8. `e2e-levelb-production`
9. `e2e-seven-templates`
10. `bombadil-staging`
11. `plugin-storefront-gate`

If any upstream job fails or is blocked, attestation signing is blocked fail-closed and never runs.

---

## 5. Baseline vs Candidate Pipeline Comparison

| Verification Dimension | Baseline (`c88c44d5`) | Candidate (`ea4af641` / HEAD) | Status & Corrective Action |
|---|---|---|---|
| **Authoritative Launcher** | Non-authoritative `--dry-run` (0 obligations run) | Genuine Linux Bubblewrap execution (all mandatory obligations executed) | Corrected (P0-1) |
| **Contract Transport** | Host `/tmp` file path (fails closed in isolated bwrap `/tmp`) | Explicit single-file read-only input mount (`/workspace/input/contract.json`) with pre-execution and intra-sandbox digest checks | Corrected (P0-1) |
| **Contract Approval** | Synthetic in-pipeline mutation of production contract (`owner = "@devrahmanbd"`) | Immutable test fixture `registries/dice/test-qualification-contract.json` bound to `test-policy.json` (`owner: "@dice-test-runner"`) | Corrected (P0-2) |
| **Signing Mode Separation** | Single mode with ambiguous test key export (`export DICE_SIGNING_KEY=...`) | Explicit `--mode=test` vs `--mode=production` separation; test mode refuses execution if `DICE_SIGNING_KEY` is present | Corrected (P0-3) |
| **Attestation Output** | Attempted production `attestation.dsse.json` with test key | Non-authoritative `test-attestation.dsse.json` (`TEST_QUALIFIED_NON_AUTHORITATIVE`) | Corrected (P0-3) |
| **Upstream Gate Dependencies** | Missing dependencies (`dice-attestation-signing` only depended on `dice-qualification`) | Strictly requires all 11 mandatory upstream qualification jobs before signing | Corrected (P0-4) |
| **Dependency Isolation in Signer** | Potential dependency bleed | Pure Node.js runner in isolated `/tmp/dice-protected-signer` with zero package installations | Preserved |
| **Production Contract Safety** | Production contract risked accidental modification | `F30-DICE-COMPLETE.json` remains strictly `"approval_state": "proposed"` | Preserved |

---

## 6. External CI Enforcement Limitations & Administration Requirements (P0-5)

While `.circleci/config.yml` mechanically enforces job dependencies, input isolation, and test signing separation, CircleCI project administrators must enforce the following platform-level controls outside the repository:

1. **CircleCI Context Security & Production Key Boundary**:
   - The production signing key `DICE_SIGNING_KEY` must **never** be defined as a project-level environment variable.
   - It must reside exclusively in a restricted CircleCI Context (e.g., `dice-production-signer`).
   - The context must be configured with CircleCI Security Group restrictions permitting access **only** on protected production release branches (`main`, `frame30`) and requiring human specification authority approval (`@devrahmanbd`).
   - In all normal PR and candidate branch builds, `DICE_SIGNING_KEY` is strictly absent from the environment.

2. **Fork and Pull Request Secret Masking**:
   - In CircleCI Advanced Project Settings, verify that `Pass secrets to builds from forked pull requests` is **DISABLED**.
   - Verify that `Only build pull requests` is **ENABLED** to prevent redundant parallel workflow triggers.

3. **Branch Protection & Status Check Policy**:
   - GitHub/Git repository branch protection on `main` and `frame30` must require the following CircleCI gate jobs as mandatory blocking status checks:
     - `ci/circleci: lint-typecheck`
     - `ci/circleci: unit-contract`
     - `ci/circleci: dice-qualification`
     - `ci/circleci: scan`
     - `ci/circleci: build`
     - `ci/circleci: e2e-critical`
     - `ci/circleci: e2e-security`
     - `ci/circleci: e2e-levelb-production`
     - `ci/circleci: e2e-seven-templates`
     - `ci/circleci: bombadil-staging`
     - `ci/circleci: plugin-storefront-gate`
     - `ci/circleci: dice-attestation-signing`
   - Linear history must be enforced (no merge commits, fast-forward or squash merge only).
   - Direct pushes and force-pushes to `main` and `frame30` must be restricted to `@devrahmanbd`.

4. **Human Release Authority Verification**:
   - Autonomous agents have zero authority to approve change contracts or release production builds.
   - The active change contract `features/contracts/F30-DICE-COMPLETE.json` remains in `proposed` state until formal human review by `@devrahmanbd`.
   - Production attestations can only be generated when human authorization changes `approval_state` to `approved` in an authorized release lane.

---

## 7. Conclusion

The DICE CircleCI pipeline architecture achieves complete trust boundary separation, immutable reference extraction, single-file sandbox input containment, mode-segregated cryptographic attestation signing, and full upstream gate integrity. Candidate pull requests have zero opportunity to tamper with verification policies or forge passing production attestations.


