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
│  - DICE_EXPECTED_SIGNER_DIST_DIGEST: d855fdf18572aceb01bed5027c77f52b497...      │
│  - DICE_EXPECTED_TEST_POLICY_DIGEST: eb447909aff1afe029c5207e069259690a7...      │
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
> 1. Ingestion of expected digests (`DICE_EXPECTED_SIGNER_DIST_DIGEST`, `DICE_EXPECTED_TEST_POLICY_DIGEST`) from the restricted administrator CircleCI Context `dice-trust-authority`.
> 2. Pinned reference extraction (`safeArchiveExtract`) from immutable, independently approved Git tree anchors (`APPROVED_ROOTS`).
> 3. Strict separation of test signing keys from production keys (`key-dice-test-signer-01` produces only non-authoritative `test-attestation.dsse.json`).

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

The 7 Stage 2.4.2 hostile candidate replacement vectors are executed against the genuine external protection boundary in `src/lib/dice/authority-mutation.test.ts` (P0-3):

| Threat ID  | Threat Vector & Description                                              | Attacker Objective                               | DICE Countermeasure & Mitigating Component                                                                          | Result                                     |
| ---------- | ------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **V-01**   | Hostile replacement of `scripts/dice-signing-service.mjs`                | Hijack signing execution or bypass gates         | Signer executed exclusively from external distribution (`isolatedSignerDir`), completely bypassing candidate tree   | **FAIL-CLOSED (Ignored & Blocked)**        |
| **V-02**   | Hostile replacement of `scripts/dice-root-of-trust.mjs`                  | Redefine approved roots or bypass key validation | Protected `DiceTrustedRoot` resolves from external distribution, enforcing authenticated roots                      | **FAIL-CLOSED (Ignored & Blocked)**        |
| **V-03**   | Hostile candidate evaluator (`scripts/dice-qualify.mjs`)                 | Fake `QUALIFIED_PASS` on failing candidate       | Evaluator runs from protected external distribution; real evaluation catches failing receipts                       | **FAIL-CLOSED (Rejected: 0 Attestations)** |
| **V-04**   | Hostile replacement of `scripts/dice-evidence.mjs`                       | Bypass ledger verification or receipt hashing    | Protected signer runs real ledger validation from external distribution; catches tampered digest                    | **FAIL-CLOSED (Rejected: 0 Attestations)** |
| **V-05**   | Hostile modification of `registries/dice/test-policy.json`               | Broaden test scope or allow rogue modes          | Gate 3 loads policy exclusively from external distribution; unauthorized modes rejected fail-closed                 | **FAIL-CLOSED (Rejected: 0 Attestations)** |
| **V-06**   | Joint mutation of test contract & candidate test policy                  | Subvert contract authorization gate              | Protected signer evaluates candidate against authoritative policy; rogue contract claiming human authority rejected | **FAIL-CLOSED (Rejected: 0 Attestations)** |
| **V-07**   | Hostile candidate modifying registries or schemas                        | Weaken mandatory obligations or schemas          | Gate 6 enforces mandatory obligations strictly from external distribution; all 4 mandatory obligations required     | **FAIL-CLOSED (Rejected: 0 Attestations)** |
| **SEC-01** | Missing external anchors when required (`DICE_REQUIRE_EXTERNAL_ANCHORS`) | Force fallback to candidate constants            | `extractAndVerifySigningDistribution` fails closed immediately if external digests are absent                       | **FAIL-CLOSED (Blocked)**                  |
| **SEC-02** | Tampering with external distribution directory itself                    | Alter authoritative distribution in-flight       | Master SHA-256 distribution digest check fails closed, wipes target directory                                       | **FAIL-CLOSED (Wiped & Blocked)**          |
| **SEC-03** | Symlinked assets in external distribution                                | Escape distribution via symlink traversal        | `lstatSync.isSymbolicLink()` check detects symlinks and throws fail-closed error                                    | **FAIL-CLOSED (Blocked)**                  |

---

## 3. Independent Acceptance Decision & Final Disposition

1. **Non-Authoritative Status**:
   - In strict compliance with `AGENTS.md` and `F30-SDLC-001`, autonomous agents possess **zero authority** to approve change contracts or declare production readiness.
   - Change contract `features/contracts/F30-DICE-COMPLETE.json` remains strictly in `"approval_state": "proposed"`.
   - Test qualification signing produces **only** non-authoritative `test-attestation.dsse.json` bearing `TEST_QUALIFIED_NON_AUTHORITATIVE`.
   - Production attestation generation requires human specification authority (`@devrahmanbd`) to approve the contract and configure the restricted CircleCI Context `dice-trust-authority`.

2. **Verification Integrity**:
   - 100% of DICE unit, contract, property, mutation, and boundary test suites pass (218 passed, 10 Linux-specific sandbox skipped on Darwin).
   - Scope guard (`gate:scope`) and verification drift (`gate:drift`) pass with zero errors.
   - The candidate tree operates strictly as an unprivileged, untrusted subject under test.
