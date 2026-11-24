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
  4. Extract and run protected launcher from `$TRUSTED_REF`.
  5. Run DICE Vitest test suites with serialized execution (`--fileParallelism=false`).
  6. Store raw execution receipts in `artifacts/dice-evidence`.

### Job 2: `dice-attestation-signing` (Isolated Cryptographic Signing)
- **Executor**: Machine runner with isolated context.
- **Access Boundary**: Possesses `DICE_SIGNING_KEY` credential in environment (inaccessible to `dice-qualification` worker).
- **Steps**:
  1. Extract signing service, evaluator, and key registry from `$TRUSTED_REF`.
  2. Execute `dice-signing-service.mjs` against `artifacts/dice-evidence`.
  3. Evaluates candidate qualification using Two-Tier Engine (`evaluateCandidateQualification`).
  4. If and only if qualification evaluates strictly to `QUALIFIED_PASS`, generates Ed25519 detached signature and signs attestation bundle.
  5. Stores verifiable signed attestation in `artifacts/dice-evidence/attestation-bundle.json`.

---

## 4. Pipeline Gate Flow

The complete release gate workflow in `.circleci/config.yml` executes in strict monotonic order:
1. `lint-typecheck`: ESLint, TypeScript `tsgo --noEmit`, shell script syntax.
2. `unit-contract`: Scope guard, drift gate, TLA+ TLC model checker, Lean 4 Lake build, Bend 2 laws.
3. `dice-qualification`: Bubblewrap sandbox verification, 27-mutation suite, DICE test harness.
4. `dice-attestation-signing`: Attestation signing service validation and Ed25519 attestation creation.
5. `e2e-critical` & `e2e-levelb`: Deterministic browser journeys and security specs.

---

## 5. Conclusion

The CircleCI configuration enforces complete trust boundary separation, immutable reference extraction, and decoupled cryptographic attestation signing. Candidate pull requests have zero opportunity to tamper with verification policies or forge passing attestations.
