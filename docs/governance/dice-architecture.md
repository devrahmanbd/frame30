# F30-DICE-ARCH-001 — Revision 2.1
## Mandatory Formal and Runtime Verification Tool Architecture & Repository Discovery Reconciliation

> **Standard Identifier**: `F30-DICE-ARCH-001`  
> **Revision**: 2.1 (Canonical Architecture Standard)  
> **Normative Framework**: Frame30 Engineering SDLC (`F30-SDLC-001`, Version 1.0)  
> **Repository Authority**: Human Specification Authority (`@devrahmanbd`)  
> **CI Authority**: CircleCI exclusively (Zero GitHub Actions)  
> **Permanent Registry**: `dies/` (Permanent-Die System)  
> **Change Control**: `features/contracts/`  
> **Status**: Adopted Architecture & Discovery Reconciliation Standard  

---

## 1. Executive Summary & Core Objectives

DICE (**D**ie-driven **I**nvariant & **C**onformance **E**ngine) is Frame30's unified verification orchestrator.

Under `F30-SDLC-001`, verification is not a loose collection of shell commands, nor are formal methods interchangeable with standard test runners. DICE orchestrates ten verification layers by binding versioned, native adapters to four formal and property-based verification engines:

1. **Lean 4**: Pure mathematical theorem verification for algorithms, graph closures, qualification logic, and arithmetic invariants.
2. **TLA+ / TLC**: Exhaustive state-space model checking for concurrent workflows, state machines, distributed races, and lifecycle transitions.
3. **Bend 2**: Typed, executable computational laws evaluated with Lean-backed BendTT kernel proof checking (`--verdict`).
4. **Bombadil**: Property-based browser and terminal DOM exploration evaluating runtime invariants across 8 viewports under autonomous generated action sequences.

DICE is **not** a generic shell-command runner. It enforces:
- **Native Versioned Adapters**: Every tool invocation is governed by an adapter declaring exact binaries, version hashes, specification hashes, execution bounds, and semantic result parsers. Process exit codes alone are never trusted.
- **Mould Self-Verification**: Before DICE may qualify Frame30 product releases, DICE must verify its own adapters and interpreters against 15 mandatory adversarial defect classes.
- **Fail-Closed Qualification**: Incomplete, unexecuted, timed-out, version-mismatched, or unverified obligations fail closed as `BLOCKED` or `FAIL`. Missing evidence is never accepted as `PASS`.
- **Cryptographic Provenance**: Every verdict is cryptographically bound to the candidate Git commit SHA, Git tree SHA, specification SHA-256, and execution environment.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       F30-DICE-ARCH-001 (Revision 2.1)                      │
│                DICE: Die-driven Invariant & Conformance Engine              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                  ┌────────────────────┴───────────────────┐
                  ▼                                        ▼
   ┌─────────────────────────────┐          ┌─────────────────────────────┐
   │ Permanent Die Registry      │          │ Feature Change Contracts    │
   │ (`dies/<id>/die.json`)      │          │ (`features/contracts/*.json`)│
   └──────────────┬──────────────┘          └──────────────┬──────────────┘
                  │                                        │
                  └────────────────────┬───────────────────┘
                                       ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │                     DICE Verification Orchestrator                       │
   │           (Impact Selector, Dependency Closure, Task Scheduler)          │
   └───────┬──────────────┬───────────────────┬───────────────────┬───────────┘
           │              │                   │                   │
           ▼              ▼                   ▼                   ▼
    ┌────────────┐ ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │ Lean 4     │ │ TLA+ / TLC  │     │ Bend 2      │ │ Bombadil    │
    │ Adapter    │ │ Adapter     │     │ Adapter     │     │ Adapter     │
    └──────┬─────┘ └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
           │              │                   │                   │
           ▼              ▼                   ▼                   ▼
    ┌────────────┐ ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │ Theorems & │ │ State-Space │     │ Laws &      │     │ DOM Fuzzing │
    │ Axiom Audit│ │ Check (Cfg) │     │ Kernel Ver. │     │ & Invariants│
    └──────┬─────┘ └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
           │              │                   │                   │
           └──────────────┴─────────┬─────────┴───────────────────┘
                                    ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │            Semantic Result Interpreters & Evidence Collector             │
   │         (Parser teeth, candidate binding, SHA-256 evidence ledger)       │
   └────────────────────────────────┬─────────────────────────────────────────┘
                                    ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │            Fail-Closed Qualification Engine (F30-SDLC-001)               │
   │           [ PASS | FAIL | BLOCKED | NOT_RUN | NOT_APPLICABLE ]           │
   └──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Section A: Repository Discovery Reconciliation

A complete forensic discovery audit of the repository was conducted:

### 2.1 Governance & Architectural Records
- **`SYSTEM.md`**: Master architecture record (1,102 lines). Establishes single-source trust boundaries: server-only functions (`*.server.ts`), Postgres RLS on every tenant table, integer minor units (`amount_minor_int` + `currency_code`), self-hosted Supabase/Postgres, Redis with DB fallbacks, and zero client-trusted decisions.
- **`AGENTS.md`**: Operating rules and constitution. Governs the 18-state lifecycle, 10 verification layers, permanent dies, monotonic capability accumulation, CircleCI sole CI authority, and strict agent containment.
- **`BUILD.md`**: Feature ledger categorizing product capabilities with launch tiers and `[A]` critical risk markers.
- **`F30-SDLC-001` (`docs/governance/sdlc-specification.md`)**: Normative specification of the Frame30 Engineering SDLC.
- **`dies/`**: Active Permanent Die Registry containing 5 versioned capabilities:
  - `DIE-001-responsive-precedence` (v1.0.0): Responsive Breakpoint Cascade & Reset Restoration.
  - `DIE-002-collection-composition` (v1.0.0): Collection Rail Self-Exclusion & Cross-Sell Preservation.
  - `DIE-003-cms-tenant-isolation` (v1.0.0): Row-Level Security & Multi-Tenant CMS Isolation.
  - `DIE-004-cms-content-lifecycle` (v1.0.0): Content Lifecycle State Machine & Optimistic Concurrency.
  - `DIE-005-builder-widget-ast` (v1.0.0): Builder AST Schema Validation & Responsive Prop Cascade.

### 2.2 Exact Installed vs. Repository-Pinned Versions
| Toolchain | Repository Pinned Declaration | Local Installed Environment | CircleCI CI Environment |
|---|---|---|---|
| **Bun** | `1.3.14` (`.circleci/config.yml:39`) | `1.3.14` | `1.3.14` on `cimg/node:24.21` |
| **Node.js** | `^22.16.5` / `24.21` | `v26.10.0` | `24.21` (`cimg/node:24.21`) |
| **Lean 4** | `leanprover/lean4:v4.15.0` (`specs/lean/lean-toolchain`) | `Lean 4.15.0, arm64-apple-darwin23.6.0` | `leanprover/lean4:v4.15.0` via `elan` |
| **Lake** | Pinned with Lean 4.15.0 | `Lake 5.0.0-1165156` | `Lake 5.0.0-1165156` |
| **BendTT Kernel** | `leanprover/lean4:v4.34.0` (`scripts/bend-verify.mjs:48`) | `leanprover/lean4:v4.34.0` in `elan` | `leanprover/lean4:v4.34.0` via `elan` |
| **Bend 2** | `2.0.40` (`scripts/bend-verify.mjs:6`) | `bend 2.0.40` (SHA: `c362cdac...`) | `v2.0.40` binary download |
| **TLA+ TLC** | `specs/tla/tla2tools.jar` | `TLC2 Version 2026.11.15.002146` (SHA: `7e53aa63...`) | Pinned `tla2tools.jar` via OpenJDK 21 |
| **Java** | OpenJDK 21 (`scripts/tla-verify.mjs:29`) | `openjdk 21.0.13.1` (`/opt/homebrew/opt/openjdk@21`) | `openjdk-21-jre-headless` |
| **Bombadil** | `^0.7.10` (`package.json:155`) | `@antithesishq/bombadil 0.7.10` | `@antithesishq/bombadil 0.7.10` |
| **Playwright**| `1.56.0` (`package.json:157`) | `@playwright/test 1.56.0` | Pinned `1.56.0` with browser binaries |
| **Vitest** | `^4.1.10` (`package.json:177`) | `vitest 4.1.10` | `vitest 4.1.10` |
| **fast-check**| `^4.10.2` (`package.json:170`) | `fast-check 4.10.2` | `fast-check 4.10.2` |

### 2.3 Permanent Requirements vs. Current Implementation Specifications
- **Permanent Requirements**:
  - Lean `discount_le_subtotal`, `final_total_nonneg`: Discount bounds and customer charge non-negativity.
  - Lean `responsive_precedence_mobile`, `tablet`, `desktop`, `reset_restores_inheritance`: Breakpoint inheritance cascade.
  - Lean `matching_rail_is_redundant`, `distinct_cross_sell_is_preserved`: Merchandising self-exclusion logic.
  - TLA+ `StockNonNegative`, `InventoryConservation`, `RefundRequiresCapture`, `RefundAmountBoundedByCapture`: Monetary and inventory safety.
  - TLA+ `NoPublicDraft`, `ScheduledNotPublicBeforeTime`: Content publishing lifecycle.
  - Bend 2 Laws 1–6: Pure functional properties of the cascade and self-exclusion rules.
- **Implementation-Characterizing / Tautological Specifications (Quarantined)**:
  - **Bend 2 Laws 7–12**: In `LAWS.bend`, Laws 7–12 assert properties on algebraic types (`Draft{}`, `Published{}`) defined and matched directly in `PROOF.bend`. They are **quarantined** and not ratified.
  - **Lean `Framique.CmsLifecycle`**: Theorems operate on simplified Lean types (`Actor`, `ContentDoc`) rather than production database queries; linked only via 4 synthetic test vectors.
  - **Vitest `cms-tenant-rls.test.ts`**: Tests run against `fakeDb` in-memory mocks, not a live PostgreSQL instance with RLS enabled.
  - **Bombadil `cms_lifecycle.ts`**: `no_cross_tenant_data_leak` checks for multiple `data-merchant-id` tags in the DOM; passes vacuously if zero or one tag is rendered.

### 2.4 Gaps Identified
1. **Missing `SPEC.bend`**: No normative definition file exists separating specification types from implementation code in `PROOF.bend`.
2. **Empty `bombadil/actions/`**: Directory contains 0 action generators; runner relies solely on default browser actions.
3. **Dual Lean Toolchains**: Divergence between Lean 4.15.0 (Lake builds) and Lean 4.34.0 (BendTT kernel) requires strict environment isolation by adapters.
4. **Missing DICE Native Orchestrator**: Current verification is handled by disjoint ad-hoc scripts rather than a unified orchestrator.

---

## 3. Section B: Formal Tool Responsibilities & Boundaries

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DICE Verification Tool Responsibility Matrix             │
├──────────────┬───────────────────────────────┬──────────────────────────────┤
│ Technology   │ What It Formally Establishes  │ What It CANNOT Establish     │
├──────────────┼───────────────────────────────┼──────────────────────────────┤
│ Lean 4       │ Pure mathematical logic,      │ Does not prove DB schemas,   │
│              │ algorithm properties, graph   │ HTTP routes, or TypeScript   │
│              │ closures, qualification rules.│ runtime execution.           │
├──────────────┼───────────────────────────────┼──────────────────────────────┤
│ TLA+ / TLC   │ State transitions, concurrent │ Does not prove unbounded     │
│              │ races, temporal safety &      │ state spaces or production   │
│              │ liveness in finite models.    │ code correspondence.         │
├──────────────┼───────────────────────────────┼──────────────────────────────┤
│ Bend 2       │ Executable typed laws with    │ Does not prove I/O, network, │
│              │ LeanTT kernel proof verdict   │ database RLS, or browser DOM │
│              │ against pure reference models.│ interactions.                │
├──────────────┼───────────────────────────────┼──────────────────────────────┤
│ Bombadil     │ Live browser DOM exploration, │ Does not prove hidden APIs,  │
│              │ layout invariants, error      │ database tenant boundaries,  │
│              │ traps across real viewports.  │ or exhaustive state safety.  │
└──────────────┴───────────────────────────────┴──────────────────────────────┘
```

### 3.1 Lean 4 — Mathematical Theorem Verification
- **Scope**: Mathematical properties of critical algorithms, graph closures, qualification aggregation, candidate evidence hashing, and fail-closed qualification monotonicity.
- **Execution & Protocol**: Pinned `leanprover/lean4:v4.15.0`. Requires clean `lake build`. Automated `#print axioms` audit against allowlist:
  $$\text{Allowed Axioms} = \{\text{propext}, \text{Quot.sound}, \text{Classical.choice}\}$$
  Strict fail-closed rejection of `sorryAx`. Byte-for-byte correspondence verification of vector output binary (`lake exe framique_verify`) with TypeScript.
- **Boundaries**: Does not prove requirement validity, graph completeness, or production TypeScript correspondence without conformance bridges.

### 3.2 TLA+ / TLC — Lifecycle and Concurrency Verification
- **Scope**: State transitions, concurrent workers, late-arriving results, timeouts, retries, and race conditions.
- **First Model (`DiceLifecycle.tla`) Mandatory Properties**:
  1. *Incomplete Obligation Safety*: No run with incomplete required obligations can transition to `QUALIFIED_PASS`.
  2. *Terminal Status Non-Regression*: A failed, blocked, timed-out, or cancelled obligation cannot silently transition to `PASS`.
  3. *Candidate Cross-Contamination Freedom*: Evidence collected for Candidate SHA $A$ cannot satisfy obligations for Candidate SHA $B$.
  4. *Concurrent Isolation*: Concurrent verification runs in parallel workspaces cannot mutate or overwrite each other's evidence receipts.
  5. *Dependency Soundness*: Unknown dependencies cannot cause the impact selector to reduce the required verification obligation set.
  6. *Model Execution Atomicity*: A partially executed or aborted TLC run cannot emit a valid proof receipt.
- **Execution & Protocol**: Pinned `tla2tools.jar` via OpenJDK 21. Requires both `.tla` and `.cfg`. Record state count, distinct states, search depth, and full counterexample trace.
- **Boundaries**: TLC proves safety only within declared finite models.

### 3.3 Bend 2 — Executable Laws and Proofs
- **Scope**: Typed executable laws for obligation classification, state transition semantics, verdict aggregation, and fail-closed qualification.
- **Normative Architectural Separation**:
  - `specs/bend/LAWS.bend`: Human-owned, immutable laws. Agents must never delete or weaken accepted laws.
  - `specs/bend/SPEC.bend`: Reviewed normative definitions and types imported by laws and proofs.
  - `specs/bend/PROOF.bend`: Implementation-side proofs and reference functions.
- **Execution & Protocol**: Official `bend 2.0.40` compiler with Lean 4 v4.34.0 `BendTT` kernel via `--verdict`. Requires exact terminal verdict: `"ALL PROOFS CHECK"`.
- **Boundaries**: Pure functional algorithms only; no database, network, or browser effects.

### 3.4 Bombadil — Property-Based UI Exploration
- **Scope**: Autonomous live browser DOM exploration across an 8-viewport matrix (`320px` to `1440px`) asserting layout invariants, image decoding, title presence, and error boundary traps.
- **Required Declarations**: Universal invariants (`no_horizontal_overflow`, `no_server_error_pages`, `single_primary_h1`, `all_images_loaded`, `noUncaughtExceptions`), action generators in `bombadil/actions/`, target URL and seeded preview environment, time budget, and structured `trace.jsonl` output.
- **Boundaries**: Client-side DOM accessibility only; does not replace API security or database tenant isolation testing.

---

## 4. Section C: Preserving Existing Testing Layers

DICE integrates formal verification with all existing empirical layers:
- **Layer 00**: Policy, source, and scope guards (`gate:scope`, `gate:drift`, typecheck, lint).
- **Layer 01**: Deterministic unit and component tests (Vitest).
- **Layer 02**: Contract tests (API schemas, database RPCs, AST validation).
- **Layer 03**: fast-check generative property tests (randomized invariants across seeds).
- **Layer 04**: Formal verification (Lean 4, TLA+/TLC, Bend 2).
- **Layer 05**: Property-based DOM fuzzing (Bombadil).
- **Layer 06**: Deterministic browser journeys (Playwright).
- **Layer 07**: Visual, accessibility (WCAG 2.2 AA), and performance gates.
- **Layer 08**: Security and adversarial tests (OWASP ASVS, negative auth, replay).
- **Layer 09**: Adversarial mutation sensitivity testing (16 defect classes).

---

## 5. Section D: DICE Native Versioned Adapter Interface

DICE specifies a versioned native adapter contract (`DiceAdapter`) with 12 mandatory fields:

```typescript
export interface DiceAdapter {
  readonly tool: {
    readonly name: "lean4" | "tlc" | "bend2" | "bombadil" | "vitest" | "fast-check";
    readonly version: string;
    readonly binaryHash: string;
  };
  readonly invocation: {
    readonly id: string;
    readonly approvedArgs: readonly string[];
  };
  readonly specifications: readonly {
    readonly path: string;
    readonly sha256: string;
  }[];
  readonly environment: {
    readonly requiredBinaries: readonly string[];
    readonly requiredEnvVars: readonly string[];
    readonly platform: "darwin" | "linux";
  };
  readonly provenance: {
    readonly commitSha: string;
    readonly treeSha: string;
  };
  readonly linkage: {
    readonly dieId: string;
    readonly obligationId: string;
    readonly riskClass: "critical" | "high" | "standard";
  };
  readonly expectedSemantics: {
    readonly requiredSuccessMarkers: readonly string[];
    readonly prohibitedFailureMarkers: readonly string[];
  };
  readonly executionTimeoutMs: number;
  readonly evidenceOutput: {
    readonly rawLogPath: string;
    readonly receiptPath: string;
    readonly traceDirectory?: string;
  };
  validateArtifacts(receiptBuffer: Buffer): boolean;
  parseExecutionResult(rawStdout: string, rawStderr: string, exitCode: number): AdapterVerdict;
  normalizeOutcome(verdict: AdapterVerdict): "PASS" | "FAIL" | "BLOCKED";
}
```

---

## 6. Section E: Mould Self-Verification (15 Defect Classes)

Before DICE may govern Frame30 code releases, DICE verifies its own adapters and result interpreters against 15 deliberate faults:

| # | Mutation Injected | Expected Detector | Expected Result |
|---|---|---|---|
| 1 | Remove Lean theorem target | `Lean4Adapter.verifyDeclarations()` | `FAIL` (Missing theorem) |
| 2 | Incomplete Lean proof (`sorry`) | `Lean4Adapter.auditAxioms()` | `FAIL` (`sorryAx` rejected) |
| 3 | Remove TLA+ `.cfg` config file | `TlcAdapter.validateSpecificationFiles()` | `BLOCKED` (Missing config) |
| 4 | Invert TLA+ model invariant | `TlcAdapter.parseExecutionResult()` | `FAIL` (Invariant violated) |
| 5 | Leave Bend law open | `Bend2Adapter.parseExecutionResult()` | `FAIL` (Incomplete proof) |
| 6 | Delete/weaken approved Bend law | `Bend2Adapter` kernel check (`--verdict`) | `FAIL` (Proofs fail) |
| 7 | Inject horizontal overflow DOM violation | `BombadilAdapter.parseExecutionResult()` | `FAIL` (Property violation) |
| 8 | Omit Bombadil specification | `BombadilAdapter.validateSpecificationFiles()` | `BLOCKED` (Missing spec) |
| 9 | Zero exit code with missing expected evidence | `DiceAdapter.validateEvidence()` | `BLOCKED` (Empty evidence) |
| 10 | Incompatible tool version (e.g. Bend 0.2.38) | `VersionGuard.verifyToolchainVersion()` | `BLOCKED` (Version mismatch) |
| 11 | Reused evidence from different candidate SHA | `DiceQualificationEngine.verifyProvenance()` | `BLOCKED` (Stale candidate) |
| 12 | Altered artifact post-collection | `DiceEvidenceLedger.verifyChecksums()` | `BLOCKED` (Checksum mismatch) |
| 13 | Premature `SIGKILL` process interruption | `DiceProcessSupervisor` | `BLOCKED` (Premature exit) |
| 14 | Unavailable runtime environment (e.g. no Java) | `TlcAdapter.verifyEnvironment()` | `BLOCKED` (Environment missing) |
| 15 | Parser oracle misclassifying error as PASS | `DiceMouldOracleAuditor` | `FAIL` (Misclassification trap)|

---

## 7. Section F: Evidence Identity and Qualification Engine

Every verification execution produces an immutable Evidence Receipt in `docs/verification-evidence/`. Receipts are cryptographically bound to the Candidate Commit SHA, Git Tree SHA, tool binary SHA-256, and pre-execution specification SHA-256.

The qualification engine computes the final candidate verdict:
$$\text{Final Verdict} = \begin{cases}
\text{PASS} & \text{if } \forall o \in \text{Obligations}_{\text{required}}, \text{status}(o) = \text{PASS} \land \text{provenance}(o) = \text{Candidate} \\
\text{FAIL} & \text{if } \exists o \in \text{Obligations}_{\text{required}}, \text{status}(o) = \text{FAIL} \\
\text{BLOCKED} & \text{if } \exists o \in \text{Obligations}_{\text{required}}, \text{status}(o) \in \{\text{BLOCKED}, \text{NOT\_RUN}, \text{UNKNOWN}\} \\
\text{NOT\_APPLICABLE} & \text{only if explicitly approved by human CODEOWNER with documented rationale}
\end{cases}$$

Only candidates with a strictly computed `PASS` across all required obligations qualify for merge authorization and release engineering.
