# Framique Verification Engineering Architecture — Master Evidence Index (Wave 23.2)

> **Core Invariant:** *"Every recurring human review correction must eventually become an architectural constraint, a deterministic check, or an executable property. Never rely on prompting an agent not to repeat a defect."*

**Repository:** `https://github.com/devrahmanbd/frame30`  
**Production Host:** `https://flamelancer.com`  
**Production Server:** `88.99.250.99:3200` (`framique.service`, OpenResty edge, OpenJDK 21, Lean 4.15.0)  
**Date:** 2026-11-19  
**Release Wave:** Wave 23.2 (Verification Evidence Integrity & Formal Model Precision)  
**Architecture Reference:** Lauren Tan (SpaceXSI / Grok Bot), *"All Code Is Slop (Except Mine)"*, Nov 2026  

---

## 1. The 6-Layer Verification Pyramid

```
          [06 — Verified Release]        Build SHA equality, zero-downtime canary, live route probe
        [05 — Runtime Exploration]       Bombadil property exploration (viewports), Playwright loops
       [04 — Formal Verification]        TLA+ state-space model checking & Lean 4 algorithmic proofs
      [03 — Logic & Property Tests]      Vitest + fast-check property testing across generated inputs
     [02 — Architectural Constraints]    Typed contracts, RLS, strict DB constraints, ESLint guards
    [01 — Feature Map & Specs]           Machine-readable specifications in features/ (routes, states, invariants)
```

| Layer | Technology | Primary Target | Defect Mode Prevented |
|---|---|---|---|
| **01 — Feature Map & Specs** | Markdown Feature Schema (`features/`) + documentation & file linkage validator (`scripts/feature-map-check.mjs`) | Domain contracts, state transitions, test linkages | Feature drift, missing edge cases, orphaned workflows |
| **02 — Architectural Constraints** | TypeScript strict mode, integer minor units, Supabase RLS, `*.server.ts` naming | Financial data, security boundaries, tenant isolation | Floating point rounding errors, client-side price tampering, unauthorized tenant access |
| **03 — Logic & Property Tests** | `fast-check` v4 + Vitest v4 (`src/lib/commerce-properties.test.ts`) | Real production commerce functions (`src/lib/commerce/`) across 3,000 generated inputs (2,500 domain + 500 layout) | Uncapped discounts, self-recommendations, saree taxonomy contamination, responsive overflow |
| **04 — Formal Verification** | TLA+ (TLC Model Checker) + Lean 4 (Lake compiler) | Concurrent checkout inventory, payment settlement idempotency & mathematical pricing theorems | Overselling under concurrency, inventory leaks, duplicate captures/refunds, late cancel races |
| **05 — Runtime Exploration** | Bombadil (`@antithesishq/bombadil` v0.7.10) + Playwright | Fail-closed autonomous DOM property fuzzing across 8 viewports (320px–1440px) with staging safeguards | Horizontal scrolling overflow, missing accessible headers, multiple H1s, broken images, 5xx errors |
| **06 — Verified Release** | Git HEAD SHA equality (`.output/DEPLOYED_SHA`), OpenResty zero-downtime canary | Deployment reconciliation | Stale preview builds, uncommitted server mutations, drift between branches |

---

## 2. Master Verification Evidence Catalog

| Evidence Artifact | Verification Layer | Scope & Highlights | Direct Link |
|---|---|---|---|
| **TLA+ TLC State-Space Proof** | Layer 04 (Formal) | **2,206,513 states generated, 44,048 distinct states explored with 0 violations** across stock conservation, separate capture and refund lifecycle transitions, idempotency, bounded refunds, and 11 safety invariants (`NoRefundOnFailedPayment`, `RefundRequiresCapture`, `RefundAmountBoundedByCapture`, `AtMostOneCapturePerPayment`, `AtMostOneSuccessfulRefundPerPayment`). | [`tlc-state-space-proof.txt`](./tlc-state-space-proof.txt) |
| **fast-check Property Receipts** | Layer 03 (Property) | **3,000 randomized inputs (2,500 domain logic + 500 responsive layout) tested directly against production modules** (`pricing.ts`, `money.ts`, `recommendations.ts`, `taxonomy.ts`, `collection-filters.ts`). Includes counterexample shrinking proof. | [`fast-check-property-receipts.txt`](./fast-check-property-receipts.txt) |
| **Bombadil Trace Summary & Traces** | Layer 05 (Exploration) | Fail-closed autonomous browser exploration across **all 8 viewports** (`mobile-320` through `desktop-1440`) with 0 property violations. Rigorous image decode, load, and dimension validation. Reproducible trace files committed in `traces/`. | [`bombadil-trace-summary.json`](./bombadil-trace-summary.json)<br>[`bombadil/traces/`](./bombadil/traces/) |
| **Lean 4 Formal Proofs & Correspondence** | Layer 04 (Formal) | Pinned toolchain `leanprover/lean4:v4.15.0`. Machine-checked proofs of 7 formal theorems. Evaluates 13 formal vectors via compiled executable (`lake exe framique_verify` / `lean --run Main.lean`) with nonzero shipping and BOGO edge cases matching production TypeScript 100% exactly (fail-closed, zero JS mock fallback). | [`lean4-formal-theorems.md`](./lean4-formal-theorems.md) |
| **Bombadil Visual Proofs** | Layer 05 (Exploration) | Visual exploration frames captured during property-based browser exploration across responsive viewports. | [`bombadil/screenshots/`](./bombadil/screenshots/) |

---

## 3. Toolchain & Execution Receipts (Wave 23.2)

### A. Machine-Readable Feature Map Gate (`bun run test:features`)
Validates that all core merchant and customer workflows conform to the standard documentation contract and have verified source code linkages:
```bash
$ bun run test:features
[feature-map-check] Documentation completeness and source-reference validation check...
[feature-map-check] Found 5 feature specifications to audit.
[feature-map-check] ✓ features/commerce/cart.md passes schema contract with verified file linkages.
[feature-map-check] ✓ features/commerce/checkout-inventory.md passes schema contract with verified file linkages.
[feature-map-check] ✓ features/storefront/collections.md passes schema contract with verified file linkages.
[feature-map-check] ✓ features/storefront/navigation.md passes schema contract with verified file linkages.
[feature-map-check] ✓ features/storefront/product-detail.md passes schema contract with verified file linkages.
[feature-map-check] All feature specifications are fully populated, linked, and compliant.
```

### B. Property-Based Logic Suite (`bun run test:properties`)
Exercises production commerce functions across thousands of randomized inputs and asserts counterexample shrinking under mutation:
```bash
$ bun run test:properties
 ✓ src/lib/commerce-properties.test.ts (5 tests) 256ms
   ✓ Production Pricing (pricing.ts) > guarantees 0 <= discountMinor <= subtotal and non-negative final total (1000 runs)
   ✓ Production Money Arithmetic (money.ts) > guarantees strict integer additivity, associativity, and line total correctness (500 runs)
   ✓ Production Recommendations (recommendations.ts) > guarantees active product slug and aliases are never present in recommendations (500 runs)
   ✓ Production Taxonomy & Collection Filters (taxonomy.ts & collection-filters.ts) > ensures saree collections contain strictly sarees and reject fusion/tunics/panjabis (500 runs)
   ✓ Responsive Layout Width Arithmetic > guarantees layout dimensions never exceed viewport boundary (500 runs)
 ✓ src/lib/commerce-properties-mutation.test.ts (2 tests) 10ms
   ✓ Mutation Proof: proves fast-check immediately catches and shrinks an unconstrained discount defect
   ✓ Mutation Proof: proves fast-check catches a self-recommendation defect

 Test Files  2 passed (2)
      Tests  7 passed (7)
```

### C. Formal TLA+ State-Space Verification (`bun run test:tla`)
Executed via the TLC model checker on OpenJDK 21 with pinned JAR SHA-256 integrity:
```bash
$ bun run test:tla
[tla-verify] Validating TLA+ specification and formal invariants...
[tla-verify] ✓ TLC JAR integrity verified (SHA-256: 7e53aa636dac8a3c...)
[tla-verify] Model SHA-256:  7f8f41bbfa06f8e17cf546280a7beb3e006874a37b897f5685bf3bd88da35194
[tla-verify] Config SHA-256: f57180f0cfa0e348ec3234547a64f6c7967d09ae597099a216e46e9b8701a72c
[tla-verify] ✓ TLA+ specification structure and TLC invariants validated.
[tla-verify] Java runtime detected: openjdk version "21.0.13.1"
[tla-verify] Executing TLC model checker...
TLC2 Version 2026.11.15.002146 (rev: bc1b506)
Model checking completed. No error has been found.
2206513 states generated, 44048 distinct states found, 0 states left on queue.
The depth of the complete state graph search is 12.
Finished in 06s
[tla-verify] ✓ TLA+ state-space model verification complete with 0 errors.
```

### D. Lean 4 Formal Verification & Correspondence Gate (`bun run test:lean`)
Fail-closed compilation and executable vector evaluation:
```bash
$ bun run test:lean
[lean-verify] Validating Lean 4 formal specification and production correspondence...
[lean-verify] Pinned Lean toolchain: leanprover/lean4:v4.15.0
[lean-verify] ✓ All 7 formal theorems declared in Lean 4 specification.
[lean-verify] Lake compiler detected: Lake version 5.0.0-1165156 (Lean version 4.15.0)
[lean-verify] Compiling Lean theorems with 'lake build'...
Build completed successfully.
[lean-verify] ✓ Lean 4 theorems and executable machine-checked and compiled successfully.
[lean-verify] Executing compiled Lean 4 vector binary to obtain formal outputs...
[lean-verify] Received 13 formal test vectors evaluated by Lean 4 runtime.
[lean-verify] ✓ Asserted exactly 13 unique expected formal vector IDs from Lean runtime.
  ✓ Vector 'fixed-less': subtotal=10000, ship=5000, freeShip=false, discount=2500, finalTotal=12500 [Lean ↔ TypeScript match]
  ✓ Vector 'fixed-exact': subtotal=5000, ship=0, freeShip=false, discount=5000, finalTotal=0 [Lean ↔ TypeScript match]
  ✓ Vector 'fixed-overflow': subtotal=3000, ship=1500, freeShip=false, discount=3000, finalTotal=1500 [Lean ↔ TypeScript match]
  ✓ Vector 'fixed-zero': subtotal=0, ship=2000, freeShip=false, discount=0, finalTotal=2000 [Lean ↔ TypeScript match]
  ✓ Vector 'percent-10': subtotal=12000, ship=3000, freeShip=false, discount=1200, finalTotal=13800 [Lean ↔ TypeScript match]
  ✓ Vector 'percent-25': subtotal=12000, ship=0, freeShip=false, discount=3000, finalTotal=9000 [Lean ↔ TypeScript match]
  ✓ Vector 'percent-33': subtotal=9999, ship=2500, freeShip=false, discount=3299, finalTotal=9200 [Lean ↔ TypeScript match]
  ✓ Vector 'percent-100': subtotal=15000, ship=4000, freeShip=false, discount=15000, finalTotal=4000 [Lean ↔ TypeScript match]
  ✓ Vector 'percent-150-clamp': subtotal=15000, ship=0, freeShip=false, discount=15000, finalTotal=0 [Lean ↔ TypeScript match]
  ✓ Vector 'freeship': subtotal=8000, ship=5000, freeShip=true, discount=0, finalTotal=8000 [Lean ↔ TypeScript match]
  ✓ Vector 'bogo-standard': subtotal=20000, ship=3000, freeShip=false, discount=9000, finalTotal=14000 [Lean ↔ TypeScript match]
  ✓ Vector 'bogo-insufficient-qty': subtotal=10000, ship=2000, freeShip=false, discount=0, finalTotal=12000 [Lean ↔ TypeScript match]
  ✓ Vector 'bogo-zero-cheapest': subtotal=5000, ship=1500, freeShip=false, discount=0, finalTotal=6500 [Lean ↔ TypeScript match]

[lean-verify] SUCCESS: All 13/13 Lean 4 formal test vectors match production TypeScript exactly.
[lean-verify] Zero discrepancies detected. Formal verification gate PASSED (fail-closed).
```

### E. Autonomous Runtime Exploration (`bun run test:bombadil:all`)
Autonomous fail-closed property exploration with staging safeguard across all 8 viewports:
```bash
$ bun run test:bombadil:all
[bombadil] Starting fail-closed property exploration against http://127.0.0.1:3000 (time limit: 8s, action-delay: 250ms)...
[bombadil] Spawning local development server on port 3000...
[bombadil] ✓ Local development server ready at http://127.0.0.1:3000

[bombadil] Exploring viewport mobile-320 (320x568)... [PASS - 0 violations, 0 image failures]
[bombadil] Exploring viewport mobile-360 (360x640)... [PASS - 0 violations, 0 image failures]
[bombadil] Exploring viewport mobile-390 (390x844)... [PASS - 0 violations, 0 image failures]
[bombadil] Exploring viewport mobile-430 (430x932)... [PASS - 0 violations, 0 image failures]
[bombadil] Exploring viewport tablet-768 (768x1024)... [PASS - 0 violations, 0 image failures]
[bombadil] Exploring viewport laptop-1024 (1024x768)... [PASS - 0 violations, 0 image failures]
[bombadil] Exploring viewport desktop-1280 (1280x800)... [PASS - 0 violations, 0 image failures]
[bombadil] Exploring viewport desktop-1440 (1440x900)... [PASS - 0 violations, 0 image failures]

[bombadil] ✓ All viewports passed with 0 property violations. Traces saved in docs/verification-evidence/bombadil/traces/
```

---

## 4. Defect Prevention Receipts & Bounded Model Assumptions

### Bounded Assumptions in TLA+ Model:
- **Shoppers:** $\{s_1, s_2\}$
- **Inventory Units:** $\text{MaxStock} = 2$
- **Order IDs:** $\{\text{ord}_1, \text{ord}_2\}$
- **Event IDs:** $\{\text{evt}_1, \text{evt}_2, \text{evt}_3\}$
- **Payment Gateway References:** $\{\text{pay}_1, \text{pay}_2\}$
- **States Explored:** **2,206,513 generated states, 44,048 distinct reachable states**, exploring 100% of concurrent permutations within the bounded model with search depth 12.

### Invariants Proved:
1. `AtMostOneCapturePerPayment`: Guarantees that duplicate webhooks or concurrent requests never create more than 1 captured settlement per payment reference.
2. `AtMostOneSuccessfulRefundPerPayment`: Guarantees idempotency of refund processing.
3. `OrderSettlementConsistency`: Paid and Fulfilled orders are strictly backed by verified captured settlement records.
4. `RefundRequiresCapture`: Refunds can only occur on previously captured payments.
5. `NoRefundOnFailedPayment`: Failed payments are strictly rejected from refund initiation.
6. `RefundAmountBoundedByCapture`: Refund amounts can never exceed captured amounts under any sequence.
7. `ExplicitRefundFailureRepresented`: Failed refund attempts are explicitly tracked in ledger history without corrupting inventory or settlement balances.
8. `InventoryConservation`: Stock available + holds + active orders exactly equals initial stock under all interleavings.
9. `StockNonNegative`: Stock reservation holds never oversell below 0.
