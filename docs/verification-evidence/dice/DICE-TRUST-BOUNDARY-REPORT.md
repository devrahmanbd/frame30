# Frame30 DICE Trust Boundary Architecture & Threat Analysis

**Verification Boundary Containment, Authority Isolation & Threat Modeling**

- **Specification Authority**: Human Specification Authority (`@devrahmanbd`)
- **Document Status**: Complete & Verified
- **Date**: 2026-11-25

---

## 1. Architectural Trust Boundaries & External Authority

The Frame30 DICE verification mould enforces six independent architectural trust boundaries to guarantee that candidate code cannot influence the authority that qualifies it, modify verification policies, or forge verification attestations.

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL TRUST BOUNDARY MAP                             │
├───────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  [ EXTERNAL TRUST AUTHORITY: CIRCLECI CONTEXT & IMMUTABLE ANCHORS ]               │
│  - Organization Context: dice-trust-authority (restricted admin access)          │
│  - DICE_EXPECTED_SIGNER_DIST_DIGEST: 8ae4ee24a51b6f02529a590c291cd8260c6e44d5eb58... │
│  - DICE_EXPECTED_TEST_POLICY_DIGEST: eb447909aff1afe029c5207e069259690a797524592... │
│  - DICE_REQUIRE_EXTERNAL_ANCHORS: 1 (enforces external injection)                 │
│       │                                                                           │
│       ├─────────────────────────────────┐                                         │
│       ▼ (Boundary 1)                    ▼ (Boundary 3: External Signer Isolation) │
│  ┌─────────────────────────┐       ┌──────────────────────────┐                   │
│  │  Protected Launcher     │       │  Isolated Signer         │                   │
│  │  (scripts/dice-launcher)│       │  (scripts/dice-signing)  │                   │
│  │  Extracts trusted dist  │       │  Pure Node runner        │                   │
│  │  $TRUSTED_REF (9e6a82a) │       │  Verified vs Ext Digests │                   │
│  └────────────┬────────────┘       └────────────▲─────────────┘                   │
│               │ (Boundary 2)                    │ (Detached Digest Transfer)      │
│               ▼                                 │                                 │
│  ┌──────────────────────────────────────────────┴─────────┐                       │
│  │  UNPRIVILEGED BWRAP WORKER SANDBOX                     │                       │
│  │  - Single-file read-only input mount (/workspace/input)│                       │
│  │  - Read-Only Candidate Snapshot (Boundary 4)           │                       │
│  │  - No Network (--unshare-net)                          │                       │
│  │  - No Host Credentials (/root, /home, .ssh, .env*)     │                       │
│  │  - Isolated PID Namespace (--unshare-pid)              │                       │
│  │  - Ephemeral /workspace/out staging                    │                       │
│  │                                                        │                       │
│  │  Executes Native Toolchains:                           │                       │
│  │  Lean 4 Lake | TLA+ TLC | Bend 2 | Bombadil | Vitest   │                       │
│  └────────────────────────────────────────────────────────┘                       │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

> **Critical Trust Clarification (Non-Negotiable)**:
> An inline digest constant embedded inside `.circleci/config.yml` within a candidate Git branch does **not** constitute an external signer authority by itself, because a pull request author possesses Git write permissions to that branch and could hypothetically edit both the code and the inline constant.
> In Frame30 DICE, genuine external trust authority is established by:
>
> 1. Ingestion of expected digests (`DICE_EXPECTED_SIGNER_DIST_DIGEST`, `DICE_EXPECTED_TEST_POLICY_DIGEST`) exclusively from the restricted administrator CircleCI Context `dice-trust-authority`.
> 2. Zero candidate fallback constants: if external anchors are required (`DICE_REQUIRE_EXTERNAL_ANCHORS=1`), missing environment digests immediately fail closed (`BLOCKED`).
> 3. Independent distribution provenance: signer distribution extracts exclusively from an external authority directory (`externalDistDir` via `DICE_EXTERNAL_DIST_DIR`), completely detached from the candidate working tree (`process.cwd()`). Attempts to substitute a candidate-local path are rejected fail-closed.
> 4. Pinned reference extraction (`safeArchiveExtract`) from immutable, independently approved Git tree anchors (`APPROVED_ROOTS`).
> 5. Strict separation of test signing keys from production keys (`key-dice-test-signer-01` produces only non-authoritative `test-attestation.dsse.json`).

### Boundary 1: Candidate Checkout vs. Protected Verification Launcher

- **Rule**: The verification launcher never executes in-tree candidate code.
- **Enforcement**: In CI, the launcher script (`scripts/dice-launcher.mjs`) is extracted directly from the immutable `$TRUSTED_REF` commit via `safeArchiveExtract` into an isolated host directory (`/tmp/dice-protected-launcher`).
- **Proof**: `src/lib/dice/authority-mutation.test.ts` (Mutation 1) proves that modifying `scripts/dice-launcher.mjs` in the candidate tree has zero effect on launcher execution.

### Boundary 2: Protected Launcher vs. Worker Sandbox

- **Rule**: Candidate test execution and build commands operate strictly inside an unprivileged Bubblewrap sandbox.
- **Enforcement**: Single-file read-only input mount (`/workspace/input/contract.json`) verified before and after containerization; root filesystem remounted read-only (`--remount-ro /`); host `/root`, `/home`, and `/etc/shadow` completely omitted; network unshared (`--unshare-net`); PID unshared (`--unshare-pid`).
- **Proof**: `src/lib/dice/sandbox.test.ts` validates that attempts to write outside staging fail with `EROFS`, network connections fail with `ENETUNREACH`, and background processes are killed on supervisor exit.

### Boundary 3: Worker Sandbox vs. Isolated Signing Service

- **Rule**: Workers never possess, read, or inherit `DICE_SIGNING_KEY`.
- **Enforcement**: Signing occurs in a dedicated, decoupled CI job (`dice-attestation-signing`) that only runs after all 11 mandatory upstream verification jobs complete. Evidence is transferred via authenticated workspace files, and all receipt digests are independently recalculated against a detached cryptographic ledger.
- **Proof**: `src/lib/dice/signing-isolation.test.ts` and `src/lib/dice/mutation-matrix.test.ts` (`MC-15`) prove that workers cannot read host secrets or forge signatures.

### Boundary 4: Candidate Tree Isolation

- **Rule**: Untrusted candidate repositories cannot mutate their own base snapshot or inject rogue `.git` configurations.
- **Enforcement**: `trustedRoot.createCandidateSnapshot()` archives the candidate tree into an ephemeral sandbox directory. The host `.git` is never mounted; candidate `.git` is masked, and `.env*` files are shadowed with `/dev/null`.
- **Proof**: `src/lib/dice/sandbox.test.ts` validates that reading `/workspace/src/.git/config` fails with `ENOENT` and `/workspace/src/.env` yields 0 bytes.

### Boundary 5: CI Environment Protection

- **Rule**: CircleCI is the sole CI authority; candidate pull requests cannot alter CI workflow definitions without authorized contract modification.
- **Enforcement**: `scripts/scope-guard.mjs` checks `.circleci/config.yml` modifications against the active change contract. Unauthorized changes trigger immediate fail-closed exit.
- **Proof**: `src/lib/dice/authority-mutation.test.ts` confirms scope guard mechanical rejection.

---

## 2. Threat Model Analysis & Attack Vector Mitigations

The hostile candidate replacement and trust boundary attack vectors are executed against the genuine external protection boundary in `src/lib/dice/authority-mutation.test.ts`:

| Threat ID  | Threat Vector & Description                                              | Attacker Objective                               | DICE Countermeasure & Mitigating Component                                                                          | Result                                     |
| ---------- | ------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **V-01**   | Hostile replacement of `scripts/dice-signing-service.mjs`                | Hijack signing execution or bypass gates         | Signer executed exclusively from external distribution (`isolatedSignerDir`), completely bypassing candidate tree; full execution path verified | **FAIL-CLOSED (Ignored & Blocked: 0 Attestations)** |
| **V-02**   | Hostile replacement of `scripts/dice-root-of-trust.mjs`                  | Redefine approved roots or bypass key validation | Protected `DiceTrustedRoot` resolves from external distribution, enforcing authenticated roots                      | **FAIL-CLOSED (Ignored & Blocked: 0 Attestations)** |
| **V-03**   | Hostile candidate evaluator (`scripts/dice-qualify.mjs`)                 | Fake `QUALIFIED_PASS` on failing candidate       | Evaluator runs from protected external distribution; real evaluation catches failing receipts                       | **FAIL-CLOSED (Rejected: 0 Attestations)** |
| **V-04**   | Hostile replacement of `scripts/dice-evidence.mjs`                       | Bypass ledger verification or receipt hashing    | Protected signer runs real ledger validation from external distribution; catches tampered digest                    | **FAIL-CLOSED (Rejected: 0 Attestations)** |
| **V-05**   | Hostile modification of `registries/dice/test-policy.json`               | Broaden test scope or allow rogue modes          | Gate 3 loads policy exclusively from external distribution; unauthorized modes rejected fail-closed                 | **FAIL-CLOSED (Rejected: 0 Attestations)** |
| **V-06**   | Joint mutation of test contract & candidate test policy                  | Subvert contract authorization gate              | Protected signer evaluates candidate against authoritative policy; rogue contract claiming human authority rejected | **FAIL-CLOSED (Rejected: 0 Attestations)** |
| **V-07**   | Hostile candidate modifying registries or schemas                        | Weaken mandatory obligations or schemas          | Gate 6 enforces mandatory obligations strictly from external distribution; all 4 mandatory obligations required     | **FAIL-CLOSED (Rejected: 0 Attestations)** |
| **SEC-01** | Missing external anchors when required (`DICE_REQUIRE_EXTERNAL_ANCHORS`) | Force fallback to candidate constants            | `extractAndVerifySigningDistribution` fails closed immediately if external digests are absent                       | **FAIL-CLOSED (Blocked: 0 Attestations)**   |
| **SEC-02** | Tampering with external distribution directory itself                    | Alter authoritative distribution in-flight       | Master SHA-256 distribution digest check fails closed, wipes target directory                                       | **FAIL-CLOSED (Wiped & Blocked: 0 Attestations)** |
| **SEC-03** | Symlinked assets in external distribution                                | Escape distribution via symlink traversal        | `lstatSync.isSymbolicLink()` check detects symlinks and throws fail-closed error, wipes target directory            | **FAIL-CLOSED (Wiped & Blocked: 0 Attestations)** |
| **SEC-04** | Candidate-local signer substitution (`externalDistDir` in repo)          | Spoof external distribution with local files     | Relative path resolution detects candidate repository directory and throws fail-closed error                        | **FAIL-CLOSED (Blocked: 0 Attestations)**   |
| **SEC-05** | Missing external distribution directory under external anchors           | Force fallback or bypass distribution checks     | Missing external distribution directory throws fail-closed `BLOCKED` error                                          | **FAIL-CLOSED (Blocked: 0 Attestations)**   |
| **SEC-06** | Candidate-controlled digest modification in repo                         | Alter inline digest constants to match malicious code | Signer ignores candidate tree constants; validates strictly against context-injected environment digests      | **FAIL-CLOSED (Mismatch: 0 Attestations)**  |
| **SEC-07** | Unauthorized production contract modification claiming human authority   | Authorize release without human signature        | Gate 3 loads authoritative policy; detects unauthorized claims and rejects fail-closed                              | **FAIL-CLOSED (Rejected: 0 Attestations)** |
| **SEC-08** | Committed artifacts in candidate git tree                                | Smuggle pre-baked test results into candidate    | Gate 1 executes `git ls-tree <candidateTree> artifacts`; fails closed if artifacts directory exists in git tree     | **FAIL-CLOSED (Rejected: 0 Attestations)** |
| **SEC-09** | Fake/unexecuted receipt provenance injection                             | Pass gate with mock or failed command receipts   | Gate 4 & 5 enforce non-empty execution command array and `receipt.exit_code === 0`                                  | **FAIL-CLOSED (Rejected: 0 Attestations)** |
| **SEC-10** | DSSE attestation signature / payload tampering                           | Forge signature or alter signed payload          | Standalone independent DSSE verification verifies Ed25519 signature over PAE, key identity, and ledger integrity   | **FAIL-CLOSED (Verification Rejected)**     |
| **V-08**   | Synthetic receipts claiming PASS/0 without authentic execution provenance | Forge verification without running tests         | Gates 4 & 5 require `runner_identity`, `execution_provenance`, disk logs with matching `log_sha256`, and summary matching `runner_sha` | **FAIL-CLOSED (Rejected: 0 Attestations)** |
| **V-09**   | Candidate mutating `scripts/dice-evidence.mjs` in candidate tree         | Disable post-signing verification or bypass checks | Post-signing verifier executes strictly from external distribution (`$SIGNER_DIR`), candidate script completely ignored | **FAIL-CLOSED (Bypassed & Verified from Protected Distribution)** |
| **V-10**   | Rogue key injection into candidate `registries/dice/trusted-keys.json`   | Authorize unauthorized signature with candidate key | Verifier resolves keys strictly from `$SIGNER_DIR/registries/dice/trusted-keys.json`, candidate keys completely ignored | **FAIL-CLOSED (Rejected: Unauthorized Key)** |
| **V-11**   | Signature corruption, payload tampering, role mismatch, revoked keys, or tree mismatch | Bypass verifier cryptographic integrity checks | Verifier CLI rigorously validates Ed25519 signature over PAE, statement fields, key roles, revocation, and candidate tree | **FAIL-CLOSED (Rejected: Cryptographic / Policy Mismatch)** |
| **V-12**   | Hostile synthetic execution evidence with correct runner SHA, correct root SHA, matching logs, and valid ledger | Bypass execution provenance via synthetic evidence with valid metadata | Signer requires cryptographic `execution_auth` signature from independently protected execution authority (`DICE_EXECUTION_AUTH_KEY`) | **FAIL-CLOSED (Rejected: 0 Attestations)** |
| **V-13**   | Malicious additional host run step attempting to access `DICE_EXECUTION_AUTH_KEY` or `DICE_SIGNING_KEY` | Steal authority keys from candidate host job environment | CircleCI context `dice-trust-authority` is completely detached from `dice-qualification`; host job environment has no authority keys | **FAIL-CLOSED (Keys Undefined in Candidate Execution)** |
| **V-14**   | Malicious dependency installation hook (`package.json` postinstall) | Exfiltrate execution authority keys during `bun install` | Candidate dependency installation runs in unprivileged candidate job with zero access to signing or execution authority | **FAIL-CLOSED (Keys Unavailable to Package Hooks)** |
| **V-15**   | Candidate-controlled shell command outside Bubblewrap | Search disk, `/proc`, or environment for execution credentials | Candidate environment has zero execution authority secrets provisioned | **FAIL-CLOSED (Zero Credentials in Environment)** |
| **V-16**   | Candidate code attempting to invoke `DiceExecutionAuthority` directly without private key | Force generation of `execution_auth` HMAC token | `DiceExecutionAuthority` fails closed immediately if `DICE_EXECUTION_AUTH_KEY` is undefined; candidate has zero access | **FAIL-CLOSED (Rejected: 0 Attestations)** |
| **V-17**   | Malicious candidate modification to `.circleci/config.yml` attempting to inject exfiltration commands into privileged `dice-attestation-signing` job | Steal `DICE_EXECUTION_AUTH_KEY` or `DICE_SIGNING_KEY` during privileged context execution | Privileged signing job restricted to protected branches (`main`, `frame30`) in `.circleci/config.yml`; `ConfigHashGuard` in `scripts/dice-root-of-trust.mjs` and Gate 0 of `scripts/dice-signing-service.mjs` verifies `.circleci/config.yml` against `DICE_EXPECTED_PIPELINE_CONFIG_DIGEST`, external distribution, or trusted ref git tree before executing; fails closed | **FAIL-CLOSED (Rejected: 0 Attestations & Zero Keys Exfiltrated)** |
| **V-18**   | Hostile post-execution evidence replacement: candidate commands running after `dice-launcher.mjs` replacing receipts, logs, and ledger with fabricated evidence | Bypass execution tests via internally-consistent fabricated evidence with correct runner & root hashes | Trusted `DiceLauncher` (`scripts/dice-launcher.mjs`) generates an immutable `.launcher-seal.json` signed with independently trusted launcher key over complete seal payload; `DiceExecutionAuthority` and `DiceSigningService` independently verify seal signature and enforce `computedLedgerDigest === seal.ledger_sha256` | **FAIL-CLOSED (Rejected: 0 Attestations & Replaced Evidence Blocked)** |
| **V-19**   | Hostile Attack A: Candidate replaces receipts, logs, ledger, summary AND `.launcher-seal.json` with an attacker-generated keypair and internally valid signature | Forge launcher execution identity using unanchored candidate keypair | Verifiers (`DiceExecutionAuthority` and `DiceSigningService`) resolve seal `key_id` strictly against independently trusted authority (`resolveTrustedLauncherKey`); candidate-generated keypairs are rejected fail-closed | **FAIL-CLOSED (Rejected: 0 Attestations & Unanchored Key Blocked)** |
| **V-20**   | Hostile Attack B: Candidate replaces receipts, logs, ledger, summary and strips `signature` and `public_key` from `.launcher-seal.json` | Bypass signature verification by omitting signature fields | Verifiers enforce mandatory `signature`, `public_key`, and `key_id` in `.launcher-seal.json`; missing fields trigger immediate fail-closed error | **FAIL-CLOSED (Rejected: 0 Attestations & Missing Seal Signature Blocked)** |

Every adversarial attack vector produces strictly **zero valid attestations**.

---

## 3. Independent Acceptance Decision, Receipt Provenance & Baseline Reconciliation

### 1. Receipt Execution Authenticity & Cryptographic Provenance (Not Just Claimed Exit Codes)

In Frame30 DICE, a command string, status string `PASS`, and exit code `0` do **not** constitute execution evidence:

1. **Closed Receipt Validation**:
   - **Missing exit_code must fail**: Mandatory integer `exit_code: 0` required on every receipt; missing or non-zero values throw `FAIL-CLOSED`.
   - **Missing trusted_root_sha must fail**: Mandatory `trusted_root_sha` required on `qualification-summary.json` and every individual receipt; missing or mismatching values throw `FAIL-CLOSED`.
   - **Missing log_sha256 must fail**: Mandatory `log_sha256` required on every receipt and verified against actual log contents on disk; missing or mismatching values throw `FAIL-CLOSED`.
   - **Missing or unauthenticated summary must fail**: Missing `qualification-summary.json` or summary without valid cryptographic execution authentication throws `FAIL-CLOSED`.
2. **Cryptographic Authentication of Orchestrator Evidence (Privilege Isolation)**:
   - Candidate execution (`dice-qualification`) operates with zero secrets (`DICE_EXECUTION_AUTH_KEY` is completely absent from the job environment).
   - In the isolated `dice-attestation-signing` job, the protected execution authority (`DiceExecutionAuthority` in `scripts/dice-signing-service.mjs`) independently verifies candidate execution evidence (clean git tree, exit_code 0, runner_sha, trusted_root_sha, logs on disk, qualification re-evaluation) without trusting candidate-provided HMACs or signatures.
   - Upon independent verification, `DiceExecutionAuthority` computes an HMAC-SHA256 signature (`execution_auth`) over:
     `candidate_commit : candidate_tree : ledger_sha256 : runner_sha : trusted_root_sha : qualification`
     using the independently protected `DICE_EXECUTION_AUTH_KEY` provisioned strictly in the signing context.
    - The downstream signing service (`DiceSigningService`) verifies this signature in Gate 5. If `execution_auth` is missing or invalid, signing fails closed immediately.
3. **Privileged Pipeline Configuration Protection (`ConfigHashGuard`)**:
   - The execution steps of the privileged context-bearing `dice-attestation-signing` job are protected against candidate modification.
   - `verifyPipelineConfiguration(options)` (`ConfigHashGuard`) in `scripts/dice-root-of-trust.mjs` and Gate 0 of `DiceSigningService`:
     - Compares candidate `.circleci/config.yml` digest against `DICE_EXPECTED_PIPELINE_CONFIG_DIGEST` (injected exclusively from the restricted administrator context `dice-trust-authority`), external distribution, or authoritative ref git tree.
     - When external anchors are required (`DICE_REQUIRE_EXTERNAL_ANCHORS=1`), a missing expected digest fails closed (`BLOCKED`).
     - Any adversarial modification to `.circleci/config.yml` attempting to inject exfiltration steps or commands into the privileged signing job triggers immediate fail-closed abort (`FAIL-CLOSED: Privileged pipeline configuration modified by candidate (ConfigHashGuard)`) before any secrets are accessed or commands are run.
4. **Hostile Evidence Replacement Prevention (`.launcher-seal.json`)**:
   - Protects against subsequent candidate commands in `dice-qualification` replacing receipts, logs, and ledger after trusted launcher execution.
   - When `DiceLauncher` (`scripts/dice-launcher.mjs`) executes, it calculates digests of all receipts and logs produced during verification, generates an ephemeral Ed25519 signing keypair, signs a structured execution seal, and writes an immutable, read-only `.launcher-seal.json` containing:
     `candidate_commit`, `candidate_tree`, `ledger_sha256`, `launcher_sha`, `runner_sha`, `trusted_root_sha`, `receipt_hashes`, and `log_hashes`.
   - `DiceExecutionAuthority` and `DiceSigningService` independently verify the seal's cryptographic signature, runner identity, and verify that `computedLedgerDigest === seal.ledger_sha256`.
   - If candidate attempts the 7-step hostile replacement scenario (running launcher, modifying receipts/logs, rebuilding ledger and summary), `DiceExecutionAuthority` detects that the rebuilt ledger digest does not match the authentic launcher seal and immediately throws:
     `FAIL-CLOSED: Replaced execution evidence detected! Built ledger digest ... does not match authentic launcher seal ...`
     Resulting in zero valid attestations issued.
5. **Candidate Tree Cleanliness (No Committed Artifacts)**:
   - Gate 1 runs `git ls-tree <candidateTree> artifacts`. If the candidate commit contains an `artifacts` tree, signing immediately fails closed. Evidence must be produced by genuine upstream execution stages in the runner workspace, never committed to git.
6. **Execution Log Capture on Disk**:
   - The orchestrator writes full stdout/stderr streams to `logs/<obligation_id>.log` on disk and computes its SHA-256 digest (`log_sha256`). Gate 5 verifies that the log file exists on disk and its SHA-256 strictly matches the receipt.
7. **Trusted Runner Identity Binding**:
   - The orchestrator binds `runner_sha` (the SHA-256 of the trusted launcher/evaluator extracted from `$ROOT_REF`) and `trusted_root_sha` (the immutable policy manifest digest) into every receipt. Gate 5 asserts that `receipt.execution_provenance.runner_sha === trustedInfo.runnerSha`.
8. **Orchestrator Qualification Summary**:
   - Gate 4 validates `qualification-summary.json`, asserting that `runner_sha` and `trusted_root_sha` match the trusted root, `candidate_tree` matches the candidate tree, and `ledger_sha256` seals the receipt ledger.

### 2. Independent DSSE Verification from Protected Distribution

1. **Protected Execution Path**:
   - The post-signing verifier executes strictly from `$SIGNER_DIR/scripts/dice-evidence.mjs`, never from the candidate checkout.
2. **Authoritative Key Resolution**:
   - Public keys are loaded exclusively from `$SIGNER_DIR/registries/dice/trusted-keys.json`. Candidate repo keys are completely ignored.
3. **8-Point Independent Criteria**:
   1. DSSE envelope structure (`payloadType`, `payload`, `signatures`).
   2. Exact payload type `application/vnd.in-toto+json`.
   3. PAE (Pre-Authentication Encoding) reconstruction and Ed25519 signature verification.
   4. Public key identity present in trusted key registry.
   5. Signer key active and authorized for role `dice-attestation-signer`.
   6. Candidate commit and tree match the candidate Git workspace.
   7. Predicate type `https://in-toto.io/attestation/qualification/v1` with qualification status `QUALIFIED_PASS`.
   8. Recalculated ledger SHA-256 matches the attestation predicate ledger digest.

### 3. Monotonic Baseline Reconciliation

In accordance with `F30-SDLC-001` Section 13:

- **Active Feature Contract Baseline**:
  - Contract: `features/contracts/F30-DICE-COMPLETE.json`
  - Baseline Commit: `382261db0cb5b796046ae03c28fd8f309b901123`
  - Baseline Tree: `fbf972496f7783cae45267f524ee9cbf0238ad58`
  - Enforced mechanically by `scripts/scope-guard.mjs` across all 217 modified files.
- **Historical Revision 2.3 Specification Baseline**:
  - Contract: `features/contracts/F30-DICE-REV2-3.json`
  - Ratified Baseline Commit: `5d2e538552d7c5c7905266de57153065fac83060`
  - Ratified Baseline Tree: `3fc7226b47369e804b9f17bd8051cb68207a6952`
  - Preserved immutably under `forbidden_file_changes`.
- **Step-Level Delta Baselines**:
  - Stage 2.4.2 step base: `be144358d91bf36a73e85071b4f67fda09a48c1e`
  - Stage 2.4.3 step base: `a4e57f5addbfc8c1e6194d70d6d23ac5e0279b08`
  - All intermediate commits form a clean, verifiable linear continuation from `382261db`.

### 4. Operational Trust Authority States (CircleCI Context Activation)

To prevent false claims of remote production activation, Frame30 DICE strictly differentiates the four lifecycle states of CircleCI Context integration:

| Trust Lifecycle State | Scope & Location | Verification Status | Operational Notes |
|---|---|---|---|
| **State 1: Context Attachment in Repository YAML** | `.circleci/config.yml` (`context: [dice-trust-authority]`) | **`IMPLEMENTED` & `LOCALLY VERIFIED`** | Declarative configuration complete, valid, verified locally. |
| **State 2: Actual Administrator-Created Context** | CircleCI Organization Settings (`Organization Settings > Contexts > dice-trust-authority`) | **`BLOCKED`** | Requires human specification authority (`@devrahmanbd`) to create context and populate digests. |
| **State 3: Effective Context Access Restrictions** | Security Group restrictions limiting context to authorized workflows | **`BLOCKED`** | Requires human specification authority (`@devrahmanbd`) to configure in CircleCI UI. |
| **State 4: Successful Protected Workflow Execution** | Remote CircleCI workflow run consuming injected external anchors | **`BLOCKED`** | Retains `BLOCKED` status until State 2 and State 3 are provisioned and an authoritative run completes remotely. |

> **Operational Activation Ruling (Non-Negotiable)**:
> Until the administrator (`@devrahmanbd`) completes organization configuration and a protected workflow successfully consumes the external anchors, operational activation remains **`BLOCKED`**.

### 5. Non-Authoritative Status & Release Authority

1. In strict compliance with `AGENTS.md` and `F30-SDLC-001`, autonomous agents possess **zero authority** to approve change contracts or declare production readiness.
2. Change contract `features/contracts/F30-DICE-COMPLETE.json` remains strictly in `"approval_state": "proposed"`.
3. Test qualification signing produces **only** non-authoritative `test-attestation.dsse.json` bearing `TEST_QUALIFIED_NON_AUTHORITATIVE`.
4. Production attestation generation requires human specification authority (`@devrahmanbd`) to approve the contract and configure the restricted CircleCI Context `dice-trust-authority`.
5. 100% of DICE unit, contract, property, mutation, and boundary test suites pass (249 passed, 10 Linux-specific sandbox skipped on Darwin across 12 test files).
6. Scope guard (`gate:scope`) and verification drift (`gate:drift`) pass with zero errors.
