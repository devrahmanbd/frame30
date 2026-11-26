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

## 7. External CI Enforcement Limitations & Operational Trust Authority States (P0-3 & P0-5)

To maintain rigorous truth in advertising and prevent false claims of remote production activation, Frame30 DICE strictly differentiates the four lifecycle states of CircleCI Context integration:

| Trust Lifecycle State | Scope & Location | Verification Status | Operational Notes |
|---|---|---|---|
| **State 1: Context Attachment in Repository YAML** | Declarative pipeline configuration in `.circleci/config.yml` (`context: [dice-trust-authority]`) | **`IMPLEMENTED` & `LOCALLY VERIFIED`** | Code is complete, syntactically valid, validated by unit and local CI pipeline tests. |
| **State 2: Actual Administrator-Created Context** | CircleCI Organization Settings (`Organization Settings > Contexts > dice-trust-authority`) containing `DICE_EXPECTED_SIGNER_DIST_DIGEST` and `DICE_EXPECTED_TEST_POLICY_DIGEST` | **`BLOCKED`** | Requires human specification authority (`@devrahmanbd`) to create the context and populate external trust digests in CircleCI UI. |
| **State 3: Effective Context Access Restrictions** | Security Group restrictions in CircleCI ensuring context is restricted to authorized workflows and release branches | **`BLOCKED`** | Requires human specification authority (`@devrahmanbd`) to enforce branch/team containment. |
| **State 4: Successful Protected Workflow Execution** | Remote CircleCI workflow run where `dice-attestation-signing` actually consumes injected external anchors without fallback | **`BLOCKED`** | Retains `BLOCKED` status until State 2 and State 3 are provisioned and an authoritative run completes remotely. |

### 7.1 Administrator Provisioning Runbook (Human Authority: `@devrahmanbd`)

To transition State 2, State 3, and State 4 from `BLOCKED` to `OPERATIONAL`:

1. **Context Creation**:
   - Navigate to CircleCI Web Console: `Organization Settings > Contexts > Create Context`.
   - Context Name: `dice-trust-authority`.
2. **Environment Variable Configuration**:
   - `DICE_EXPECTED_SIGNER_DIST_DIGEST`: `8ae4ee24a51b6f02529a590c291cd8260c6e44d5eb58559e63944e917cbb62c1` (covers all 16 signer distribution files).
   - `DICE_EXPECTED_TEST_POLICY_DIGEST`: `eb447909aff1afe029c5207e069259690a7975245926dd7ae0caef01b789380d` (covers `test-policy.json`).
   - `DICE_EXECUTION_AUTH_KEY`: `<cryptographic secret key>` (independently generated secret shared strictly between protected orchestrator and signing service).
   - `DICE_SIGNING_KEY`: (Production signing only; remains unset until human specification authority approves change contract).
3. **Workflow Security Boundaries**:
   - In CircleCI Context settings, configure Security Groups limiting `dice-trust-authority` access strictly to protected branches (`main`, `frame30`) and authorized release tags.
   - `dice-qualification` has **NO Context attached** and runs completely unprivileged. No candidate code, dependency installation hook, or host step can ever access `DICE_EXECUTION_AUTH_KEY` or `DICE_SIGNING_KEY`.
   - `dice-attestation-signing` is the **sole job attached to `context: [dice-trust-authority]`**. It runs pure Node without candidate dependencies or candidate tests.
4. **Provisioning External Distribution**:
   - In `.circleci/config.yml` `dice-attestation-signing`, if `DICE_EXTERNAL_DIST_DIR` is not externally mounted, the pipeline provisions `/tmp/dice-external-distribution` directly from `$ROOT_REF` (`git archive "$ROOT_REF" | tar -x -C /tmp/dice-external-distribution`), completely outside the candidate working tree (`process.cwd()`).
   - Candidate-local substitution is detected via relative path resolution and rejected fail-closed.

---

## 8. Receipt Execution Authenticity & Cryptographic Execution Provenance

### 8.1 Proving Receipt Execution Authenticity (Not Just Claimed Exit Codes)

A claimed command array, a status string `PASS`, and an asserted exit code `0` do **not** constitute execution evidence; an attacker can synthesize them trivially. In Frame30 DICE Stage 2.4.3:

1. **Closed Receipt Validation (Zero Permissive Defaults)**:
   - **Missing exit_code must fail**: `typeof exitCode !== "number" || exitCode !== 0` throws `FAIL-CLOSED: Receipt '...' missing mandatory exit_code`.
   - **Missing trusted_root_sha must fail**: Missing `summary.trusted_root_sha` or missing `receipt.runner_identity.trusted_root_sha` throws `FAIL-CLOSED: missing mandatory trusted_root_sha`.
   - **Missing log_sha256 must fail**: Missing `receipt.execution_provenance.log_sha256` throws `FAIL-CLOSED: missing mandatory log_sha256`.
   - **Missing or unauthenticated qualification summary must fail**: Missing `qualification-summary.json` or unauthenticated summary throws `FAIL-CLOSED`.

2. **Cryptographic Authentication of Orchestrator Execution Evidence (Privilege Isolation)**:
   - Candidate execution (`dice-qualification`) operates with zero secrets (`DICE_EXECUTION_AUTH_KEY` is completely absent from the job environment).
   - In the isolated `dice-attestation-signing` job, the protected execution authority (`DiceExecutionAuthority` in `scripts/dice-signing-service.mjs`) independently verifies candidate execution evidence (clean git tree, exit_code 0, runner_sha, trusted_root_sha, logs on disk, qualification re-evaluation) without trusting candidate-provided HMACs or signatures.
   - Upon independent verification, `DiceExecutionAuthority` computes an HMAC-SHA256 signature (`execution_auth`) over:
     `candidate_commit : candidate_tree : ledger_sha256 : runner_sha : trusted_root_sha : qualification`
     using the independently protected `DICE_EXECUTION_AUTH_KEY` provisioned strictly in the signing context.
   - The downstream signing service (`DiceSigningService`) verifies this signature in Gate 5. If `execution_auth` is missing or invalid, signing fails closed immediately.

3. **Adversarial Verification (Zero Attestations on Hostile Synthesis)**:
   - In `src/lib/dice/authority-mutation.test.ts`, a dedicated hostile candidate test creates:
     * Correct trusted runner SHA (`trustedInfo.runnerSha`).
     * Correct trusted-root SHA (`trustedInfo.trustedRootSha`).
     * Fabricated successful execution (`exit_code: 0`, `status: "PASS"`).
     * Fabricated execution logs with matching log SHA (`log_sha256`).
     * Valid receipt ledger (`receipts.sha256`).
     * Matching qualification summary (`qualification-summary.json`).
     * Matching candidate commit and tree.
   - Result: Because the attacker lacks the independently protected execution authority key, the protected signer rejects the fabricated evidence fail-closed (`FAIL-CLOSED: Missing or unauthenticated qualification-summary evidence`), producing strictly **zero valid attestations**.

### 8.2 Independent Protection of DSSE Verifier

To prevent candidate pull requests from tampering with the attestation verification logic:

1. **Protected Execution Path**: The post-signing verifier executes strictly from the externally pinned distribution (`$SIGNER_DIR/scripts/dice-evidence.mjs`), never from the candidate checkout.
2. **External Key Registry**: The trusted public-key registry is resolved exclusively from `$SIGNER_DIR/registries/dice/trusted-keys.json`. Candidate repo keys are completely ignored.
3. **Rejection Matrix**: The verifier CLI rejects:
   - Corrupted/invalid Ed25519 signatures (`FAIL-CLOSED: Ed25519 signature verification failed`).
   - Tampered statements/payloads (`FAIL-CLOSED: Ed25519 signature verification failed`).
   - Unauthorized signing keys (`FAIL-CLOSED: Key lacks authorized role`).
   - Revoked signing keys (`FAIL-CLOSED: Key was revoked`).
   - Candidate tree mismatches (`FAIL-CLOSED: Candidate tree SHA mismatch`).

---

## 9. Conclusion

The Frame30 DICE pipeline enforces complete cryptographic trust boundary separation:
- Declarative CircleCI context attachment is implemented and locally verified; actual operational activation remains appropriately **`BLOCKED`** pending human administrative provisioning.
- Receipt authenticity is bound to actual orchestrator execution provenance, runner identity, and raw log files on disk.
- DSSE verification executes exclusively from the protected external distribution with full fail-closed rejection teeth.
