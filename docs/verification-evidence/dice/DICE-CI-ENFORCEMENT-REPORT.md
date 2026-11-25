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

## 5. External CI Enforcement Limitations & Administration Requirements

1. **Context Protection**: Production `DICE_SIGNING_KEY` credentials must be bound to protected CircleCI contexts restricted to authoritative branches (`main`, `frame30`) and human specification authority (`@devrahmanbd`).
2. **Test Key Segregation**: In development branches, test qualification keypairs (`key-dice-test-signer-01`) authenticate pipeline mechanics without producing production-authoritative attestations.
3. **Repository Containment**: Candidate branch pull requests cannot mutate the CircleCI configuration outside authorized scope (`gate:scope` blocks unauthorized `.circleci/**` changes).
4. **Human Authority Preservation**: The production change contract (`F30-DICE-COMPLETE.json`) remains in `"approval_state": "proposed"`. Autonomous agents possess zero authority to approve production contracts or deploy production attestations.

---

## 6. Conclusion

The CircleCI configuration enforces complete trust boundary separation, immutable reference extraction, upstream qualification dependencies, and decoupled cryptographic attestation signing. Candidate pull requests have zero opportunity to tamper with verification policies or forge passing attestations.

