# Frame30 DICE Requirement Traceability Matrix
**Normative Architecture F30-DICE-ARCH-001 Revision 2.3 & F30-SDLC-001 Traceability Record**

- **Specification Authority**: Human Specification Authority (`@devrahmanbd`)
- **Document Status**: Complete & Verified
- **Date**: 2026-11-25

---

## 1. Traceability Overview

This matrix maps every architectural requirement, invariant, and constraint declared in `F30-DICE-ARCH-001 Revision 2.3` and `F30-SDLC-001` to its implementing code, formal verification suite, automated tests, and verification status.

---

## 2. Inviolable Invariants (`F30-DICE-ARCH-001` Section 1.3)

| Invariant ID | Requirement Statement | Implementation Module | Verification Suite | Status |
|---|---|---|---|---|
| **INV-01** | *Requirements Define Correctness*: The implementation is not the definition of correctness; accepted requirements and dies define correctness. | `scripts/dice-qualify.mjs`, `dies/*` | `src/lib/dice/qualification.test.ts`, `bun run test:dies` | **PASS** |
| **INV-02** | *Candidate Isolation*: Untrusted candidate code cannot modify or influence the authority that verifies it. | `scripts/dice-root-of-trust.mjs`, `scripts/dice-launcher.mjs` | `src/lib/dice/authority-mutation.test.ts`, `src/lib/dice/root-of-trust.test.ts` | **PASS** |
| **INV-03** | *Non-Waivability of Mandatory Baselines*: Mandatory baseline obligations can never be waived by candidate or agent. | `scripts/dice-qualify.mjs` (`MANDATORY_WAIVER_PROHIBITED`), `scripts/dice-plan-generator.mjs` | `src/lib/dice/mutation-matrix.test.ts` (`MC-17`), `src/lib/dice/qualification.test.ts` | **PASS** |
| **INV-04** | *Two-Tier Precedence*: Qualification strictly enforces `FAIL > BLOCKED > WAIVED > PASS`. | `scripts/dice-qualify.mjs` (`evaluateCandidateQualification`) | `src/lib/dice/qualification.test.ts` | **PASS** |
| **INV-05** | *Fail-Closed Sandboxing*: Non-Linux or non-bwrap execution of unprivileged workers must report `BLOCKED`, never silent bypass. | `scripts/dice-sandbox.mjs` (`execute`) | `src/lib/dice/sandbox.test.ts` | **PASS** |
| **INV-06** | *Attestation Key Isolation*: Attestation signing keys (`DICE_SIGNING_KEY`) are accessible solely to the isolated signing service. | `scripts/dice-signing-service.mjs`, `.circleci/config.yml` | `src/lib/dice/signing-isolation.test.ts`, `src/lib/dice/signing-e2e.test.ts` | **PASS** |
| **INV-07** | *Monotonic Accumulation*: Accepted capabilities and dies accumulate monotonically; existing dies are never deleted or relaxed. | `scripts/scope-guard.mjs`, `dies/` | `bun run test:dies`, `bun run gate:scope` | **PASS** |

---

## 3. Architectural Sections Traceability

### Section 2: Gaps, Boundaries & Quarantines
- **Bend Laws 1–6 (Ratified)**: Mapped to responsive precedence cascade and collection self-exclusion in `specs/bend/LAWS.bend`. Verified via `Bend2Adapter` and `bun run test:bend`. Status: **PASS**.
- **Bend Laws 7–12 (Quarantined)**: Tautological CMS algebraic laws strictly segregated from production die ratification. Verified via `LawFileSegregator` in `src/lib/dice/mutation-matrix.test.ts` (`MC-09`). Status: **PASS**.
- **Toolchain Boundary Isolation**: Independent environment configurations for Lake (Lean 4.15.0) and BendTT (Lean 4.34.0) inside `Lean4Adapter` and `Bend2Adapter`. Status: **PASS**.

### Section 3: Two-Tier Qualification Engine
- **Tier 1 Obligation Disposition `Disp(o, C)`**: Resolves conjunctive multi-method checks, missing receipts, duplicate receipts, and stale provenance tree mismatches in `scripts/dice-qualify.mjs`. Verified in `src/lib/dice/qualification.test.ts`. Status: **PASS**.
- **Tier 2 Candidate Qualification `Qual(C)`**: Enforces partition law, baseline presence, and monotonic precedence in `scripts/dice-qualify.mjs`. Verified in `src/lib/dice/qualification.test.ts`. Status: **PASS**.
- **Vacuous Pass Prevention**: If all obligations are waived, candidate receives `QUALIFIED_WAIVED`, preventing merge authorization. Verified in `src/lib/dice/qualification.test.ts`. Status: **PASS**.

### Section 4: Root of Trust & Pinned Extraction
- **Pinned Reference Extraction**: `DiceTrustedRoot` resolves all trusted assets (`schemas/`, `registries/`, `scripts/`) from `$TRUSTED_REF` (`9e6a82ab`). Verified in `src/lib/dice/root-of-trust.test.ts`. Status: **PASS**.
- **Commit & Tree SHA Pinning**: `APPROVED_ROOTS` enforces verified hashes for trusted bases. Verified in `src/lib/dice/root-of-trust.test.ts`. Status: **PASS**.
- **Policy Manifest Calculation**: Canonical hashing of all verifiers, schemas, and profiles. Verified in `src/lib/dice/root-of-trust.test.ts`. Status: **PASS**.

### Section 5: Frozen Plan Generator
- **Precomputed Immutable Plan**: `generateFrozenPlan` generates canonical RFC 8785 JSON plan with deterministic SHA-256 hash. Verified in `src/lib/dice/plan-generator.test.ts`. Status: **PASS**.
- **Tamper Resistance**: Plan hash mismatch detects unauthorized obligation substitution or omitted mandatory checks. Verified in `src/lib/dice/mutation-matrix.test.ts` (`MC-04`). Status: **PASS**.

### Section 6: Native Verification Adapters
- **Unified Interface (`DiceAdapter`)**: `src/lib/dice/adapters/types.ts` defines standardized lifecycle methods: `validateEnvironment`, `validateSpecifications`, `parseExecutionResult`, and `execute`.
- **Lean 4 Adapter**: `src/lib/dice/adapters/lean4-adapter.ts` audits axioms and parses Lake verdicts. Verified in `src/lib/dice/adapters.test.ts`. Status: **PASS**.
- **TLA+/TLC Adapter**: `src/lib/dice/adapters/tla-adapter.ts` parses state space counts and deadlocks. Verified in `src/lib/dice/adapters.test.ts`. Status: **PASS**.
- **Bend 2 Adapter**: `src/lib/dice/adapters/bend2-adapter.ts` parses BendTT kernel verdicts. Verified in `src/lib/dice/adapters.test.ts`. Status: **PASS**.
- **Bombadil Adapter**: `src/lib/dice/adapters/bombadil-adapter.ts` parses 8-viewport DOM exploration logs. Verified in `src/lib/dice/adapters.test.ts`. Status: **PASS**.
- **Vitest Adapter**: `src/lib/dice/adapters/vitest-adapter.ts` wraps property and contract suites. Verified in `src/lib/dice/adapters.test.ts`. Status: **PASS**.

### Section 7: Linux Bubblewrap OS Sandbox
- **Scenario 1 (Unprivileged & Read-Only Root)**: `--remount-ro /`, read-only source snapshot. Verified in `src/lib/dice/sandbox.test.ts`. Status: **PASS**.
- **Scenario 2 (Credential Access Prohibited)**: Host `/root`, `/home`, `.ssh`, `/etc/shadow`, `.env*` unmapped. Verified in `src/lib/dice/sandbox.test.ts`. Status: **PASS**.
- **Scenario 3 (Host .git Exclusion)**: Host `.git` never bound; candidate `.git` masked. Verified in `src/lib/dice/sandbox.test.ts`. Status: **PASS**.
- **Scenario 4 (Network Isolation)**: `--unshare-net` mandates complete network detachment. Verified in `src/lib/dice/sandbox.test.ts`. Status: **PASS**.
- **Scenario 5 (Process & PID Containment)**: `--unshare-pid`, `--die-with-parent`, `--new-session` reaps all background descendants. Verified in `src/lib/dice/sandbox.test.ts`. Status: **PASS**.
- **Scenario 6 (Ephemeral Staging & Scratch Containment)**: Isolated tmpfs mounts for `/workspace/out` and `/workspace/tmp`. Verified in `src/lib/dice/sandbox.test.ts`. Status: **PASS**.

### Section 8: Signing Service & Key Isolation
- **Ed25519 Detached Signature**: Signing over canonical receipt digests in `scripts/dice-signing-service.mjs`. Verified in `src/lib/dice/signing-e2e.test.ts`. Status: **PASS**.
- **Key Access Isolation**: Worker runs have zero access to private key environment or disk locations. Verified in `src/lib/dice/signing-isolation.test.ts`. Status: **PASS**.

### Section 9: CircleCI Pipeline Integration
- **Sole CI Authority**: CircleCI exclusively (`.circleci/config.yml`), no GitHub Actions. Verified by repo inspection. Status: **PASS**.
- **Protected Launcher Step**: Archives trusted tools from `$TRUSTED_REF` before candidate evaluation. Verified in `.circleci/config.yml`. Status: **PASS**.
- **Protected Signer Step**: Independent job executing signing service with workspace-transferred evidence. Verified in `.circleci/config.yml`. Status: **PASS**.
