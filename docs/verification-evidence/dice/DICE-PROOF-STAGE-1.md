# Frame30 DICE Proof Programme — Stage 1 Evidence Audit Report
**Establishment of Authoritative Proof Target and Verification of Remote CircleCI Provenance**

- **Specification Authority**: Human Specification Authority (`@devrahmanbd`)
- **Normative Architecture**: `F30-DICE-ARCH-001` Revision 2.3 (Ratified)
- **Governing Standard**: Frame30 Engineering SDLC (`F30-SDLC-001` Version 1.0)
- **Active Change Contract**: `features/contracts/F30-DICE-COMPLETE.json`
- **Execution Mode**: Strictly READ-ONLY (No modifications to application code, DICE code, tests, contracts, CI config, or trust policies)
- **Audit Date**: 2026-11-28

---

## 1. Executive Summary & Proof Target Establishment

In accordance with Prompt 1 of the Frame30 DICE Five-Stage Proof Programme, this audit independently establishes the authoritative proof target and cryptographically verifies the execution records and diagnostic artifacts reported from CircleCI.

### Proof Target Identities
| Property | Value | Verification Method | Status |
|---|---|---|---|
| **Current Branch** | `dice/complete-implementation` | `git branch --show-current` | Confirmed |
| **Full HEAD Commit SHA** | `0fd3e50134bf6cdbe68ec4ab81c25dc400dc3799` | `git rev-parse HEAD` | Confirmed |
| **Git Tree SHA** | `acafa3dd56193ca9c82e663b7c2ccba9a0eb990b` | `git rev-parse HEAD^{tree}` | Confirmed |
| **Working-Tree Cleanliness** | 0 modified, 0 staged files | `git status --porcelain` | Clean |
| **Untracked Files** | 0 untracked files | `git status -uall` | Clean |
| **Remote Synchronization** | Exactly in sync with `origin/dice/complete-implementation` | `git fetch origin --dry-run` | Synchronized |
| **Candidate Equality** | `HEAD == 0fd3e50134bf6cdbe68ec4ab81c25dc400dc3799` | Direct cryptographic comparison | Exact Match |
| **Contract Approval State** | `proposed` | JSON inspect `F30-DICE-COMPLETE.json` | Unaltered |

### Diagnostic Baseline Identities
| Property | Value | Verification Method |
|---|---|---|
| **Diagnostic Baseline Commit** | `5c3b0726db7de1fb0e20f111d36c2e2f89c36ebb` | `git rev-parse 5c3b0726^{commit}` |
| **Diagnostic Baseline Tree** | `c03c2ecf6715b681d1e1ac748b31feada764e97d` | `git rev-parse 5c3b0726^{tree}` |

---

## 2. Recent Commit History Leading to Candidate

The commit history on `dice/complete-implementation` establishes the exact lineage from diagnostic baseline `5c3b0726` to candidate `0fd3e501`:

1. `0fd3e50134bf6cdbe68ec4ab81c25dc400dc3799` — `fix(dice): ensure worktree binary PATH and execution permissions in baseline differential engine` **(CURRENT HEAD / CANDIDATE)**
2. `cbb9882f2ec8ccaf1b79d3afb4a3475086843692` — `fix(dice): enforce scanner output completeness for ESLint and TypeScript (stage 5.3.1)`
3. `2ecfc6d023e0537d48040261c640196c90341f2b` — `style(dice): format test file to satisfy eslint prettier rules`
4. `69769dbdfcb9b53276703c95e3a33bd29bf0542c` — `test(dice): make stage 5.2.1.5 dirty tree test isolated`
5. `d824bad647aacbbfc2f39cb7af1a33f754fe9677` — `fix(dice): correct baseline differential engine defects and harden static gates (stage 5.2.1)`
6. `c29a9a01f5aca657cb5ca0124df1e7b866e67eea` — `feat(dice): implement executable baseline-differential static gates (stage 5.2)`
7. `0a3272de35eced8bfc17962c5388e5e590361c06` — `docs(dice): document stage 5 typescript baseline reconciliation, diagnostic equivalence, and circleci dependency analysis`
8. `f5027c393ce817ba8f7e2403d7435941e31962a8` — `fix(dice): complete integrated qualification, trusted reference reconciliation, and pipeline containment`
9. `5c3b0726db7de1fb0e20f111d36c2e2f89c36ebb` — `fix(dice): anchor launcher seal in trusted authority and isolate privileged pipeline` **(REPORTED BASELINE / TRUSTED RELEASE)**

---

## 3. Cryptographic Hash Manifest

All core verification scripts, contracts, CI configurations, and governing standards were independently fingerprinted at HEAD (`0fd3e50134bf6cdbe68ec4ab81c25dc400dc3799`):

| File Path | SHA-256 Digest | Classification |
|---|---|---|
| `features/contracts/F30-DICE-COMPLETE.json` | `923db8c9a9a2b614d1498a51f9c2de2f45c7074a6e4402aa55fc36f8c9a7c308` | Active Change Contract |
| `.circleci/config.yml` | `3c235e388558390c92555f2ffb30114f4964889e1f1394580e688fef19008e24` | Authoritative CI Pipeline |
| `scripts/dice-baseline-differential.mjs` | `d0d4c13887adf6eabda2d231b82cb5822ef2b2c135b4c77c11cb06f5b3115c98` | Differential Static Engine |
| `scripts/dice-root-of-trust.mjs` | `df4ec7ee9aa54aa5f8ddfa7f8d35b7c76bc30993a7eec32cc368f3caca1819b3` | Root of Trust Engine |
| `scripts/dice-launcher.mjs` | `e11517728899b8b8e0f57eb28ad61e3f6cbb4ec1318c01c83f6431b2cdfcf6be` | Verification Launcher |
| `scripts/dice-signing-service.mjs` | `e98dd0f6e4eb4624a149556741b69ce7d23aa1bb7151e85f499927ad1fc43095` | Attestation Signer Service |
| `bun.lock` | `8dd6810239ae19108eb03f762fa06f4ed8d3d764edeb97fb77a0b557a6a58169` | Dependency Lockfile |
| `package.json` | `9fdb8c67036cb793af18d3eec3f54047039248d2dd6d6cd8bdf98625bacef301` | Manifest & Toolchain Definition |
| `registries/dice/test-qualification-contract.json` | `1183a8790d95ae213f4adecf890dc448c1b2adcef5bf90a3185609ed344f6873` | Normative Qualification Contract |
| `registries/dice/test-policy.json` | `eb447909aff1afe029c5207e069259690a7975245926dd7ae0caef01b789380d` | Test Policy Manifest |
| `registries/dice/trusted-keys.json` | `89c0356f74b6f73bd0579bc7f5f6a51604e7814f3b2d443369c63fb4458683b6` | Cryptographic Key Registry |
| `registries/dice/trusted-profiles.json` | `ba4861e030f939dd79cd28f44d2c6390dcd08a19fbe45017358f62b777d23901` | Trusted Execution Profiles |
| `docs/governance/dice-architecture.md` | `23ef4a564cd884a5a292931c1bf2270861311d1c8682ebdca1109da333d57f68` | Normative Architecture Standard |
| `docs/governance/sdlc-specification.md` | `1aec57b3ca6908d8360cd10f63191dede2068af7b851aba187bfb35be1acac64` | Normative SDLC Standard |

---

## 4. Independent CircleCI Remote Execution Verification

Direct verification of the reported CircleCI API execution records via the CircleCI REST API (Project Slug: `circleci/VfeeWorer8D31zQ3C4Lwa4/HGTLJR7PtcPaaFPfgFoJdR`):

### 4.1 Pipeline Provenance
- **Pipeline UUID**: `9ef8a80d-635d-4a29-aaef-a545b149aeef`
- **Pipeline Number**: `796`
- **Trigger Event**: GitHub push webhook to `refs/heads/dice/complete-implementation`
- **Trigger Actor**: `devrahmanbd`
- **Commit Title**: `fix(dice): ensure worktree binary PATH and execution permissions in baseline differential engine`
- **Reported Commit SHA**: `0fd3e50134bf6cdbe68ec4ab81c25dc400dc3799`
- **Created Timestamp**: `2026-11-28T07:02:18.941Z`
- **State**: `created`

### 4.2 Workflow Provenance
- **Workflow UUID**: `7ef423c4-1a4e-4136-ae9b-caa6a4873844`
- **Workflow Name**: `gates`
- **Status**: `failed`
- **Started**: `2026-11-28T07:02:19.324Z`
- **Stopped**: `2026-11-28T07:34:28.024Z`
- **Evaluated Commit SHA**: `0fd3e50134bf6cdbe68ec4ab81c25dc400dc3799`

### 4.3 Job 1: `dice-static-baseline-preview`
- **Job UUID**: `6a8d409d-50ba-47e8-8ef6-357d49776d91`
- **Job Number**: `5248`
- **Executor**: `bun-executor` (`cimg/node:24.21`, resource class `medium` — 2 vCPU, 4GB RAM Docker container)
- **Status**: `failed`
- **Started**: `2026-11-28T07:02:21.315Z`
- **Stopped**: `2026-11-28T07:09:35.938Z`
- **Duration**: `434,623 ms` (~7m 14s)
- **Step Outcome**: Step 113 (`Execute baseline-differential static analysis (non-authoritative preview)`) failed with **exit code 1**.
- **Underlying Failure Log**:
  ```
  $ node scripts/dice-baseline-differential.mjs "--report-dir=artifacts/dice-static-baseline"
  [dice-baseline-differential] ✗ Candidate TS parse error: Incomplete diagnostic output: TypeScript compiler exited with code 1 but 0 diagnostics parsed
  [dice-baseline-differential] Candidate stderr (sample):
  $ tsgo --noEmit
  error: script "typecheck" was terminated by signal SIGKILL (Forced quit)

  =======================================================
  DICE BASELINE DIFFERENTIAL
  Baseline:  5c3b0726db7de1fb0e20f111d36c2e2f89c36ebb
  Candidate: 0fd3e50134bf6cdbe68ec4ab81c25dc400dc3799
  =======================================================
  ERROR: TypeScript diagnostic parsing error on candidate: Incomplete diagnostic output: TypeScript compiler exited with code 1 but 0 diagnostics parsed

  FINAL RESULT: BLOCK
  error: script "static:baseline" exited with code 1
  ```

### 4.4 Job 2: `dice-qualification`
- **Job UUID**: `1b3167c6-f0d8-4d48-9594-2b4f12deae6c`
- **Job Number**: `5239`
- **Executor**: `machine: ubuntu-2204:current` (resource class `large` — 4 vCPU, 16GB RAM)
- **Status**: `failed`
- **Started**: `2026-11-28T07:02:22.967Z`
- **Stopped**: `2026-11-28T07:02:50.182Z`
- **Duration**: `27,214 ms` (~27s)
- **Step Outcome**: Step 106 (`Extract and Execute Protected DICE Launcher from Pinned Reference`) failed with **exit code 1**.
- **Underlying Failure Log**:
  ```
  ===============================================================================
    FRAME30 UNIVERSAL VERIFICATION MOULD (DICE) — TRUSTED LAUNCHER (STAGE 2.4)
    Normative Standard: F30-DICE-ARCH-001 Revision 2.3 & Stage 2.4
    Pinned Trusted Ref:  5c3b0726db7de1fb0e20f111d36c2e2f89c36ebb
    Distribution Cache:  /tmp/dice-trusted-dist
    Candidate Target:    /home/circleci/project
    Change Contract:     registries/dice/test-qualification-contract.json
  ===============================================================================

  [dice-launcher] Step 1: Resolving independent trusted root-of-trust...

  [dice-launcher] ✗ FAIL-CLOSED: FAIL-CLOSED: Unrecognized or unapproved trusted root commit '5c3b0726db7de1fb0e20f111d36c2e2f89c36ebb'. Root identity rejected (BLOCKED).
  ```

---

## 5. Artifact Inventory and Cryptographic Checksums

The artifacts emitted by Job `5248` (`6a8d409d-50ba-47e8-8ef6-357d49776d91`) were independently downloaded and hashed:

| Artifact Path | CircleCI Storage URL | SHA-256 Digest |
|---|---|---|
| `dice-static-baseline/dice-static-baseline-report.json` | `https://output.circle-artifacts.com/output/job/6a8d409d-50ba-47e8-8ef6-357d49776d91/artifacts/0/dice-static-baseline/dice-static-baseline-report.json` | `dbe54401b54894980da8796f8d9871f68b8af8f30ca7c5d1567149830eb0a92b` |
| `dice-static-baseline/dice-static-baseline-report.txt` | `https://output.circle-artifacts.com/output/job/6a8d409d-50ba-47e8-8ef6-357d49776d91/artifacts/0/dice-static-baseline/dice-static-baseline-report.txt` | `3a3af9dae810a128c2f92216e40b05e90a8da19f3d7e3339dd1f282a46dba558` |

Job `5239` (`1b3167c6-f0d8-4d48-9594-2b4f12deae6c`) emitted **0 artifacts** because the job terminated fail-closed at Step 106 before reaching the artifact collection step (Step 107).

---

## 6. Diagnostic Discrepancy Reconciliation (1,542 vs 1,551)

An in-depth investigation was conducted to determine why previous local reports noted 1,551 ESLint diagnostics whereas clean worktrees and earlier baseline reports recorded 1,542 diagnostics.

### 6.1 Mechanical Reconciliation Findings
1. **Host Checkout Scan**:
   Executing `bun run lint -- -f json` directly on the local repository checkout evaluates **2,045 files** and emits **1,551 diagnostics** (1,220 errors, 331 warnings across 211 files).
2. **Gitignored File Identification**:
   Filtering all files with diagnostics against `git check-ignore` revealed exactly one untracked/ignored file being processed by ESLint:
   `/.superpowers/sdd/phase1b/StoreHeader.pre-phase1b.tsx`
3. **Diagnostic Attribution in Ignored File**:
   This single file accounts for **exactly 9 diagnostics**:
   - `line 23:14`: `react-refresh/only-export-components` (severity 1 — warning)
   - `line 379:60`: `@typescript-eslint/no-explicit-any` (severity 2 — error)
   - `line 390:58`: `@typescript-eslint/no-explicit-any` (severity 2 — error)
   - `line 405:41`: `@typescript-eslint/no-explicit-any` (severity 2 — error)
   - `line 409:53`: `@typescript-eslint/no-explicit-any` (severity 2 — error)
   - `line 433:56`: `@typescript-eslint/no-explicit-any` (severity 2 — error)
   - `line 551:36`: `@typescript-eslint/no-explicit-any` (severity 2 — error)
   - `line 581:50`: `@typescript-eslint/no-explicit-any` (severity 2 — error)
   - `line 591:56`: `@typescript-eslint/no-explicit-any` (severity 2 — error)
   **Total in `.superpowers/`: 8 errors + 1 warning = 9 diagnostics.**
4. **Clean Git Worktree Scans (Hermetic Execution)**:
   In disposable git worktrees created by `scripts/dice-baseline-differential.mjs` (`git worktree add --detach`), only tracked repository files are present.
   - Baseline `5c3b0726`: **1,542 diagnostics** (1,212 errors, 330 warnings).
   - Candidate `0fd3e501`: **1,542 diagnostics** (1,212 errors, 330 warnings).
   - Delta: **0 new, 0 changed, 0 removed**.
5. **Conclusion**:
   The discrepancy is 100% accounted for by local host environment leakage into ESLint's default globbing in the unisolated host tree. In hermetic CI worktrees, the true diagnostic count across tracked source code is **1,542**.

---

## 7. Root-Cause Analysis of Remote Failures

### 7.1 Baseline Preview Job Failure (`6a8d409d-50ba-47e8-8ef6-357d49776d91`)
1. **Point of Failure**:
   During `scripts/dice-baseline-differential.mjs`, ESLint completed successfully on both baseline and candidate. TypeScript completed on the baseline. However, during the candidate TypeScript invocation (`bun run typecheck`, executing `tsgo --noEmit`), the compiler process was abruptly terminated:
   `error: script "typecheck" was terminated by signal SIGKILL (Forced quit)`
2. **Executor Environment**:
   `bun-executor` runs within a Docker container on CircleCI with `resource_class: medium` (2 vCPUs, 4GB RAM).
3. **Fail-Closed Behavior**:
   Upon SIGKILL, the process exited with code 1 and emitted 0 diagnostics on stdout. `scripts/dice-baseline-differential.mjs` enforced Invariant 5.3.1 (scanner output completeness):
   `Incomplete diagnostic output: TypeScript compiler exited with code 1 but 0 diagnostics parsed`
   The engine correctly refused to pass an incomplete compilation and returned `BLOCK`.

### 7.2 Linux Qualification Job Failure (`1b3167c6-f0d8-4d48-9594-2b4f12deae6c`)
1. **Point of Failure**:
   Step 106 in `.circleci/config.yml` extracted the launcher from `TRUSTED_REF="5c3b0726db7de1fb0e20f111d36c2e2f89c36ebb"` into `/tmp/dice-protected-launcher` and invoked it with `--trusted-ref="5c3b0726db7de1fb0e20f111d36c2e2f89c36ebb"`.
2. **Root Identity Rejection**:
   Inside the extracted `scripts/dice-root-of-trust.mjs` from commit `5c3b0726`, `APPROVED_ROOTS` is defined as:
   ```javascript
   export const APPROVED_ROOTS = Object.freeze({
     "9e6a82abb3502edb84f2d7be9fcc36401b380bfb": "2194ec156151f39002d78e3a1cffdcd760d80ead",
     "2d1d32f9b49628ce0a4ae8ff9cbe805e94cb4271": "f8932f94a9179feea432073105739ed3c2fac294",
     b09a772c59f9669af51d53f8411588a1eb95283c: "6cacd5c6ad96b0c2fc4aa7822c31e0ce31d6f166",
   });
   ```
   Notice that `5c3b0726db7de1fb0e20f111d36c2e2f89c36ebb` is **NOT** present in `APPROVED_ROOTS` of `5c3b0726`. A git commit cannot predict or approve its own commit SHA within its own committed tree.
3. **Fail-Closed Result**:
   `DiceRootOfTrust` rejected `5c3b0726` fail-closed:
   `FAIL-CLOSED: Unrecognized or unapproved trusted root commit '5c3b0726db7de1fb0e20f111d36c2e2f89c36ebb'. Root identity rejected (BLOCKED).`
   Because the launcher aborted at Step 1, the Bubblewrap sandbox tests were never dispatched.

---

## 8. Remaining Blockers for Programme Progression

| Blocker ID | Domain | Nature of Blocker | Resolution Path |
|---|---|---|---|
| **B1** | Stage 2 CI Resources | `bun-executor` (`resource_class: medium`) exhausts memory during sequential/differential `tsgo` execution in `dice-static-baseline-preview`. | Allocate dedicated sufficient resource class (e.g. `large` or `xlarge`) for the baseline preview job in `.circleci/config.yml`. |
| **B2** | Stage 3 Trust Chain | Pinned `DICE_TRUSTED_REF` (`5c3b0726`) is not an approved root within its own extracted policy. | Anchor verification in an authentic ratified historical root (`9e6a82abb3502edb84f2d7be9fcc36401b380bfb`) or execute a human-authorized root rotation. |
| **B3** | Stage 5 Trust Authority | CircleCI Context `dice-trust-authority` is not provisioned or populated with required external digests. | Administrator (`@devrahmanbd`) must provision the context with verified digests in CircleCI UI. |
| **B4** | Stage 5 Contract Authority | `features/contracts/F30-DICE-COMPLETE.json` remains in `proposed` state. | Must remain `proposed` until all technical stages pass and explicit human sign-off is given. |

---

## 9. Stage 1 Acceptance Gate Verdict

- **Proof-Target Commit SHA**: `0fd3e50134bf6cdbe68ec4ab81c25dc400dc3799`
- **Proof-Target Tree SHA**: `acafa3dd56193ca9c82e663b7c2ccba9a0eb990b`
- **Remote Pipeline Provenance**: Pipeline `9ef8a80d-635d-4a29-aaef-a545b149aeef`, Workflow `7ef423c4-1a4e-4136-ae9b-caa6a4873844`
- **Acceptance State**: **`LOCALLY VERIFIED`** (for Stage 1 proof target establishment and remote record audit).
- **Stage 1 Status**: **COMPLETE & VERIFIED**. Ready to proceed to Prompt 2.
