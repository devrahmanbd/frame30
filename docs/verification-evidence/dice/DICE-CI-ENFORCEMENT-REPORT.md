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
- **Workflow Context**: Attached restricted CircleCI Context `dice-trust-authority`.
- **Environment**: `DICE_REQUIRE_EXTERNAL_ANCHORS: "1"` enforced fail-closed.
- **Access Boundary**: Possesses `DICE_SIGNING_KEY` credential in environment for production mode (inaccessible to `dice-qualification` worker). In test mode, `DICE_SIGNING_KEY` must be strictly absent.
- **Isolation Guarantees**:
  1. No candidate dependencies installed (`bun install` omitted).
  2. No candidate-controlled tests executed in signing context.
  3. External Signer Distribution (P0-1 & Stage 2.4.3): Pure Node runner extracts the protected signer distribution exclusively from an external authority directory (`externalDistDir` via `DICE_EXTERNAL_DIST_DIR`) and verifies it against externally established cryptographic digests:
     - Expected Distribution SHA-256: `8ae4ee24a51b6f02529a590c291cd8260c6e44d5eb58559e63944e917cbb62c1` (covers all 16 verifier scripts, registries, and schemas)
     - Expected Test Policy SHA-256: `eb447909aff1afe029c5207e069259690a7975245926dd7ae0caef01b789380d`
  4. External Trust Authority Injection: `DICE_EXPECTED_SIGNER_DIST_DIGEST` and `DICE_EXPECTED_TEST_POLICY_DIGEST` are injected exclusively via CircleCI Context `dice-trust-authority`. Zero candidate-controlled fallback constants exist in `.circleci/config.yml`.
  5. Fail-Closed Fallback Elimination:
     - Missing external anchors => `BLOCKED` (exit code 1).
     - Missing external distribution => `BLOCKED` (exit code 1).
     - Incorrect distribution digest => `FAIL` (exit code 1).
     - Incorrect policy digest => `FAIL` (exit code 1).
     - Candidate-local signer substitution => `FAIL` (exit code 1).
  6. Evaluates candidate qualification using Two-Tier Engine (`evaluateCandidateQualification`).
  7. If and only if qualification evaluates strictly to `QUALIFIED_PASS`, generates DSSE attestation envelope (`test-attestation.dsse.json` in test mode or `attestation.dsse.json` in production mode) with Ed25519 signature.
  8. Standalone Independent DSSE Verification Step: Separately executed verification step via `scripts/dice-evidence.mjs --verify-attestation=...` validating the full 8-point criteria before storing artifacts.
  9. Stores verifiable signed attestation in `artifacts/dice-evidence/`.

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
                     ├──► [ e2e-levelb-production ] ─────┤      (Requires ALL 11 jobs
                     ├──► [ e2e-seven-templates ] ───────┤       + context: dice-trust-authority)
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

| Verification Dimension             | Baseline (`c88c44d5`)                                                                   | Candidate (`a4e57f5a` / HEAD)                                                                                                        | Status & Corrective Action |
| ---------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| **Authoritative Launcher**         | Non-authoritative `--dry-run` (0 obligations run)                                       | Genuine Linux Bubblewrap execution (all mandatory obligations executed)                                                              | Corrected (P0-1)           |
| **Contract Transport**             | Host `/tmp` file path (fails closed in isolated bwrap `/tmp`)                           | Explicit single-file read-only input mount (`/workspace/input/contract.json`) with pre-execution and intra-sandbox digest checks     | Corrected (P0-1)           |
| **Contract Approval**              | Synthetic in-pipeline mutation of production contract (`owner = "@devrahmanbd"`)        | Immutable test fixture `registries/dice/test-qualification-contract.json` bound to `test-policy.json` (`owner: "@dice-test-runner"`) | Corrected (P0-2)           |
| **Signing Mode Separation**        | Single mode with ambiguous test key export (`export DICE_SIGNING_KEY=...`)              | Explicit `--mode=test` vs `--mode=production` separation; test mode refuses execution if `DICE_SIGNING_KEY` is present               | Corrected (P0-3)           |
| **Attestation Output**             | Attempted production `attestation.dsse.json` with test key                              | Non-authoritative `test-attestation.dsse.json` (`TEST_QUALIFIED_NON_AUTHORITATIVE`)                                                  | Corrected (P0-3)           |
| **Upstream Gate Dependencies**     | Missing dependencies (`dice-attestation-signing` only depended on `dice-qualification`) | Strictly requires all 11 mandatory upstream qualification jobs before signing                                                        | Corrected (P0-4)           |
| **Dependency Isolation in Signer** | Potential dependency bleed                                                              | Pure Node.js runner in isolated `/tmp/dice-protected-signer` with zero package installations                                         | Preserved                  |
| **Production Contract Safety**     | Production contract risked accidental modification                                      | `F30-DICE-COMPLETE.json` remains strictly `"approval_state": "proposed"`                                                             | Preserved                  |
| **CircleCI Context Attachment**    | Unattached in workflow invocation                                                       | Attached `context: [dice-trust-authority]` at job invocation                                                                         | Activated (Stage 2.4.3)    |
| **External Digest Anchors**        | Inline candidate-local fallback constants                                               | Enforced fail-closed external injection (`DICE_REQUIRE_EXTERNAL_ANCHORS=1`); zero fallback constants                                 | Activated (Stage 2.4.3)    |
| **Independent Distribution**       | Candidate checkout file copy (`process.cwd()`)                                          | External distribution directory (`externalDistDir`) with candidate substitution rejection                                          | Activated (Stage 2.4.3)    |
| **Independent DSSE Verification**  | Embedded self-verification only                                                         | Standalone independent DSSE verification step covering all 8 criteria                                                                | Activated (Stage 2.4.3)    |

---

## 6. Baseline Reconciliation

In accordance with `F30-SDLC-001` Section 13:

1. **Active Feature Contract Baseline**:
   - Contract: `features/contracts/F30-DICE-COMPLETE.json`
   - Authoritative Base Commit: `382261db0cb5b796046ae03c28fd8f309b901123`
   - Authoritative Base Tree: `fbf972496f7783cae45267f524ee9cbf0238ad58`
   - Enforced by `scripts/scope-guard.mjs` against all 217 touched files.

2. **Historical Revision 2.3 Specification Baseline**:
   - Contract: `features/contracts/F30-DICE-REV2-3.json`
   - Ratified Baseline Commit: `5d2e538552d7c5c7905266de57153065fac83060`
   - Ratified Baseline Tree: `3fc7226b47369e804b9f17bd8051cb68207a6952`
   - Preserved immutably in `features/contracts/F30-DICE-REV2-3.json` (protected in `forbidden_file_changes`).

3. **Step-Level Delta Baselines**:
   - Stage 2.4.2 step base: `be144358d91bf36a73e85071b4f67fda09a48c1e`
   - Stage 2.4.3 step base: `a4e57f5addbfc8c1e6194d70d6d23ac5e0279b08`
   - All step baselines trace monotonically to the authoritative contract baseline `382261db`.

---

## 7. External CI Enforcement Limitations & Administration Requirements (P0-5)

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

## 8. Conclusion

The DICE CircleCI pipeline architecture achieves complete trust boundary separation, immutable reference extraction, single-file sandbox input containment, mode-segregated cryptographic attestation signing, and full upstream gate integrity. Candidate pull requests have zero opportunity to tamper with verification policies or forge passing production attestations.
