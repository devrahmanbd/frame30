# Frame30 DICE Trust Boundary Architecture & Threat Analysis
**Verification Boundary Containment, Authority Isolation & Threat Modeling**

- **Specification Authority**: Human Specification Authority (`@devrahmanbd`)
- **Document Status**: Complete & Verified
- **Date**: 2026-11-25

---

## 1. Architectural Trust Boundaries

The Frame30 DICE verification mould enforces five independent architectural trust boundaries to guarantee that candidate code cannot influence the authority that qualifies it or tamper with verification evidence.

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                               TRUST BOUNDARY MAP                                  │
├───────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  [ CIRCLECI HOST / TRUSTED AUTHORITY ]                                            │
│  Pinned Commit: $TRUSTED_REF (9e6a82ab)                                           │
│  Pinned Root:   $ROOT_REF    (2d1d32f9)                                           │
│       │                                                                           │
│       ├─────────────────────────────────┐                                         │
│       ▼ (Boundary 1)                    ▼ (Boundary 3)                            │
│  ┌─────────────────────────┐       ┌──────────────────────────┐                   │
│  │  Protected Launcher     │       │  Isolated Signer         │                   │
│  │  (scripts/dice-launcher)│       │  (scripts/dice-signing)  │                   │
│  │  Extracts trusted dist  │       │  Has DICE_SIGNING_KEY    │                   │
│  └────────────┬────────────┘       └────────────▲─────────────┘                   │
│               │ (Boundary 2)                    │ (Detached Digest Transfer)      │
│               ▼                                 │                                 │
│  ┌──────────────────────────────────────────────┴─────────┐                       │
│  │  UNPRIVILEGED BWRAP WORKER SANDBOX                     │                       │
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

### Boundary 1: Candidate Checkout vs. Protected Verification Launcher
- **Rule**: The verification launcher never executes in-tree candidate code.
- **Enforcement**: In CI, the launcher script (`scripts/dice-launcher.mjs`) is extracted directly from the immutable `$TRUSTED_REF` commit via `git archive` into an isolated host directory (`/tmp/dice-protected-launcher`).
- **Proof**: `src/lib/dice/authority-mutation.test.ts` (Attack Vector 1) proves that modifying `scripts/dice-launcher.mjs` in the candidate tree has zero effect on the launcher execution.

### Boundary 2: Protected Launcher vs. Worker Sandbox
- **Rule**: Candidate test execution and build commands operate strictly inside an unprivileged Bubblewrap sandbox.
- **Enforcement**: Root filesystem remounted read-only (`--remount-ro /`); host `/root`, `/home`, and `/etc/shadow` completely omitted; network unshared (`--unshare-net`); PID unshared (`--unshare-pid`).
- **Proof**: `src/lib/dice/sandbox.test.ts` validates that attempts to write outside staging fail with `EROFS`, network connections fail with `ENETUNREACH`, and background processes are killed on supervisor exit.

### Boundary 3: Worker Sandbox vs. Isolated Signing Service
- **Rule**: Workers never possess, read, or inherit `DICE_SIGNING_KEY`.
- **Enforcement**: Signing occurs in a dedicated, decoupled CI job (`dice-attestation-signing`) that only runs after the verification worker job completes. Evidence is transferred via authenticated workspace files, and all receipt digests are independently recalculated.
- **Proof**: `src/lib/dice/signing-isolation.test.ts` and `src/lib/dice/mutation-matrix.test.ts` (`MC-15`) prove that workers cannot read host secrets or forge signatures.

### Boundary 4: Candidate Tree Isolation
- **Rule**: Untrusted candidate repositories cannot mutate their own base snapshot or inject rogue `.git` configurations.
- **Enforcement**: `trustedRoot.createCandidateSnapshot()` archives the candidate tree into an ephemeral sandbox directory. The host `.git` is never mounted; candidate `.git` is masked, and `.env*` files are shadowed with `/dev/null`.
- **Proof**: `src/lib/dice/sandbox.test.ts` validates that reading `/workspace/src/.git/config` fails with `ENOENT` and `/workspace/src/.env` yields 0 bytes.

### Boundary 5: CI Environment Protection
- **Rule**: CircleCI is the sole CI authority; candidate pull requests cannot alter CI workflow definitions without authorized contract modification.
- **Enforcement**: `scripts/scope-guard.mjs` checks `.circleci/config.yml` modifications against the active change contract. Unauthorized changes trigger immediate fail-closed exit.
- **Proof**: `src/lib/dice/authority-mutation.test.ts` (Attack Vector 3) confirms scope guard rejection.

---

## 2. Threat Model Analysis & Attack Vector Mitigations

| Threat ID | Threat Description | Attacker Objective | DICE Countermeasure & Mitigating Component | Result |
|---|---|---|---|---|
| **TH-01** | Malicious in-tree `dice-launcher.mjs` | Hijack launcher execution to bypass verification | Pinned reference extraction (`git archive $TRUSTED_REF`) | **FAIL-CLOSED (Ignored)** |
| **TH-02** | Malicious in-tree `dice-root-of-trust.mjs` | Redefine approved roots or bypass key validation | Trusted root extraction from `$TRUSTED_REF` | **FAIL-CLOSED (Ignored)** |
| **TH-03** | Unauthorized `.circleci/config.yml` edit | Disable CI checks or skip mandatory jobs | Scope guard change contract validation (`gate:scope`) | **FAIL-CLOSED (Rejected)** |
| **TH-04** | Malicious `scripts/dice-bootstrap.mjs` | Fake tool execution results inside worker | Bootstrap runner extracted from trusted root distribution | **FAIL-CLOSED (Ignored)** |
| **TH-05** | Malicious `scripts/dice-qualify.mjs` | Force `QUALIFIED_PASS` on failing candidate | Evaluator executes from trusted root distribution | **FAIL-CLOSED (Ignored)** |
| **TH-06** | Malicious `scripts/dice-signing-service.mjs`| Self-sign attestation bundle without checks | Signer extracted from `$TRUSTED_REF` in isolated job | **FAIL-CLOSED (Ignored)** |
| **TH-07** | Candidate `registries/dice/trusted-keys.json` | Inject rogue public key to accept forged sigs | Key registry loaded exclusively from trusted root | **FAIL-CLOSED (Ignored)** |
| **TH-08** | Tampered candidate dependencies (`package.json`)| Inject malicious packages into launcher | Launcher runs outside node_modules with zero candidate deps | **FAIL-CLOSED (Isolated)** |
| **TH-09** | Tampered `scripts/dice-evidence.mjs` | Alter canonical serialization or digest math | Evidence serializer loaded from trusted root | **FAIL-CLOSED (Ignored)** |
| **TH-10** | Path traversal in candidate paths (`../../etc`) | Escape sandbox or overwrite host files | `validateSafePath()` lexical and resolve containment | **FAIL-CLOSED (Blocked)** |
| **TH-11** | Malicious change contract in candidate | Expand `allowed_file_changes` arbitrarily | Contract baseline commit and tree SHA validated vs git HEAD | **FAIL-CLOSED (Rejected)** |
| **TH-12** | Secret extraction via worker environment | Steal `DICE_SIGNING_KEY` or deployment tokens | Environment variable allowlisting; keys absent from worker | **FAIL-CLOSED (Inaccessible)** |

---

## 3. Boundary Verification Conclusion

All five trust boundaries are verified mechanically by automated test suites. The candidate code operates strictly as an untrusted input substrate and possesses zero authority to modify the policies, tools, evaluators, or credentials that qualify it.
