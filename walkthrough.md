# Verification Engineering Architecture Walkthrough (Wave 23)

**Date:** 2026-11-18 · **Branch:** `frame30` / `main` · **Status:** Verified & Released  
**Reference Model:** SpaceXSI / Grok Bot ("All Code Is Slop (Except Mine)" — Lauren Tan, Nov 2026)  
**Implementation:** Specification-Driven, Fail-Closed, Property-Tested & Formally Verified Pipeline  
**Master Evidence Catalog:** [`docs/verification-evidence/EVIDENCE_INDEX.md`](./docs/verification-evidence/EVIDENCE_INDEX.md)  

---

## 1. Executive Summary

To permanently eliminate recurring defects (such as preview vs. production drift, cross-contaminated product collections, responsive overflow, and duplicated AI patch cycles), Frame30 has deployed a **six-layer verification engineering architecture**.

In Wave 23, all verification mechanisms were hardened to guarantee **fail-closed execution**, eliminate tautological tests, connect property suites directly to real production code, and refine formal concurrency models with external payment settlements.

```
          [06 — Verified Release]        Build SHA equality, zero-downtime canary, live route probe
        [05 — Runtime Exploration]       Bombadil property exploration (viewports), Playwright loops
       [04 — Formal Verification]        TLA+ state-space model checking & Lean 4 algorithmic proofs
      [03 — Logic & Property Tests]      Vitest + fast-check property testing across generated inputs
     [02 — Architectural Constraints]    Typed contracts, RLS, strict DB constraints, ESLint guards
    [01 — Feature Map & Specs]           Machine-readable specifications in features/ (routes, states, invariants)
```

---

## 2. Key Accomplishments & Hardened Verification Gates

### A. Fail-Closed Verification Runners
- **Bombadil Runner (`bombadil/runner.mjs`):** Child process failure codes now strictly terminate the entire test process with non-zero exit codes. Silent passes are completely eliminated.
- **TLA+ Verification Runner (`scripts/tla-verify.mjs`):** Checks SHA-256 integrity of `tla2tools.jar` (`7e53aa636dac8a3cb0533f343115c0548e03fc0ce5edc7739becf58d3d0fb84f`), requires a valid OpenJDK runtime, and fails closed if TLC encounters any invariant violation or is skipped.
- **CircleCI Pipeline (`.circleci/config.yml`):** Automatically installs `openjdk-21-jre-headless` in the `unit-contract` job, executing TLC model checking in every CI build.

### B. Production Commerce Modules (`src/lib/commerce/`)
Extracted pure domain logic into reusable production modules:
- `pricing.ts`: Bounded discount calculation and non-negative customer order totals.
- `money.ts`: Minor-unit integer arithmetic and cart summation free of float drift.
- `recommendations.ts`: Active product self-exclusion filters and cross-sell candidate ranking.
- `taxonomy.ts`: Category isolation rules protecting Saree craft collections.
- `collection-filters.ts`: Pure collection filtering used by both preview rendering and property tests.

### C. Refined TLA+ Payment Settlement Model
- Modeled external gateway transaction references (`PaymentRefs`) and settlement state tracking.
- Explored 169,413 states and 9,348 distinct reachable states with 0 violations across 7 invariants:
  1. `StockNonNegative`
  2. `InventoryConservation`
  3. `UniqueOrderIds`
  4. `MaxActiveOrderPerShopper`
  5. `AtMostOneSettlementPerPayment`
  6. `OrderSettlementConsistency`
  7. `TypeOK`

### D. Lean 4 Formal Verification & Correspondence Gate
- Pinned `leanprover/lean4:v4.15.0`.
- Proved `discount_le_subtotal`, `fixed_discount_exact`, and `percent_100_exact`.
- Verified 12/12 formal test vectors against production TypeScript (`src/lib/commerce/pricing.ts`) via `bun run test:lean`.

### E. Trace Preservation & Exploration Coverage
- Autonomous Bombadil exploration traces are saved directly to `docs/verification-evidence/bombadil/traces/`.
- Invariants enforce accessible headers (`page_has_title_or_heading`), single primary H1 (`single_primary_h1`), and fail-closed horizontal bounds (`no_horizontal_overflow`).

---

## 3. Verification Sequence & Status

All verification suites pass cleanly with 0 errors:

```bash
bun run typecheck       # PASS (tsgo --noEmit: 0 errors)
bun run test:features   # PASS (5/5 features pass schema & file linkages)
bun run test:properties # PASS (7/7 tests: 5 property suites + 2 mutation proofs)
bun run test:lean       # PASS (12/12 test vectors match production TS)
bun run test:tla        # PASS (TLC verified 169,413 states, 0 errors)
bun run test:bombadil   # PASS (0 property violations, traces preserved)
bun run test:contracts  # PASS (13 contract suites, 258/258 cases passed)
bun run test            # PASS (640+ Vitest test files)
```
