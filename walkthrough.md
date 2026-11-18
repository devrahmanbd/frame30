# Verification Engineering Architecture Walkthrough (Wave 23.2)

**Date:** 2026-11-19 · **Branch:** `frame30` / `main` · **Status:** Verified & Released  
**Reference Model:** SpaceXSI / Grok Bot ("All Code Is Slop (Except Mine)" — Lauren Tan, Nov 2026)  
**Implementation:** Specification-Driven, Fail-Closed, Property-Tested & Formally Verified Pipeline  
**Master Evidence Catalog:** [`docs/verification-evidence/EVIDENCE_INDEX.md`](./docs/verification-evidence/EVIDENCE_INDEX.md)  

---

## 1. Executive Summary

To permanently eliminate recurring defects (such as preview vs. production drift, cross-contaminated product collections, responsive overflow, and duplicated AI patch cycles), Frame30 has deployed a **six-layer verification engineering architecture**.

In Wave 23.2, all verification mechanisms were hardened with extreme precision to address formal audit feedback:
- Corrected Bombadil image verification with comprehensive decode, dimension, and lazy loading lifecycle checks.
- Executed and proved the full 8-viewport responsive matrix (`test:bombadil:all`), preserving separate traces.
- Strengthened the TLA+ concurrent checkout model with explicit capture and refund lifecycle transitions, bounded refund amounts, and 11 safety invariants (**2,206,513 states generated, 44,048 distinct states found with 0 errors**).
- Tightened Lean 4 formal correspondence with Darwin dyld segment protection, 7 formal theorems, and 13 unique test vectors including nonzero shipping and BOGO edge cases.
- Added a dedicated seeded-staging Bombadil job to `.circleci/config.yml`.

```
          [06 — Verified Release]        Build SHA equality, zero-downtime canary, live route probe
        [05 — Runtime Exploration]       Bombadil property exploration (viewports), Playwright loops
       [04 — Formal Verification]        TLA+ state-space model checking & Lean 4 algorithmic proofs
      [03 — Logic & Property Tests]      Vitest + fast-check property testing across generated inputs
     [02 — Architectural Constraints]    Typed contracts, RLS, strict DB constraints, ESLint guards
    [01 — Feature Map & Specs]           Machine-readable specifications in features/ (routes, states, invariants)
```

---

## 2. Key Accomplishments & Hardened Verification Gates (Wave 23.2)

### A. Correct Bombadil Image Verification (P0)
- **File:** `bombadil/properties/images.ts`
- Asserts that expected product containers (`[data-product-card]`, `[data-hero-image]`, etc.) always contain an `<img>`.
- Rejects missing sources (`!src`) and invalid sources (`src="undefined"`, `src="null"`).
- Requires completed images to decode with strictly positive dimensions (`naturalWidth > 0 && naturalHeight > 0`).
- Exercises lazy-loaded images after scrolling into the active viewport.
- Captures all failed URLs and specific failure reasons in trace output.

### B. Full 8-Viewport Responsive Matrix (`test:bombadil:all`) (P1)
- **Command:** `bun run test:bombadil:all` (added to `package.json`).
- Automatically manages local test server lifecycle on port 3000.
- Explores all 8 viewports:
  1. `mobile-320` (320x568) — **PASS** (0 violations, 0 image failures)
  2. `mobile-360` (360x640) — **PASS** (0 violations, 0 image failures)
  3. `mobile-390` (390x844) — **PASS** (0 violations, 0 image failures)
  4. `mobile-430` (430x932) — **PASS** (0 violations, 0 image failures)
  5. `tablet-768` (768x1024) — **PASS** (0 violations, 0 image failures)
  6. `laptop-1024` (1024x768) — **PASS** (0 violations, 0 image failures)
  7. `desktop-1280` (1280x800) — **PASS** (0 violations, 0 image failures)
  8. `desktop-1440` (1440x900) — **PASS** (0 violations, 0 image failures)
- Preserves separate trace files in `docs/verification-evidence/bombadil/traces/<viewport>/`.
- Records complete execution metrics in `docs/verification-evidence/bombadil-trace-summary.json`.
- Protects production customer data by defaulting to loopback staging (`http://127.0.0.1:3000`).

### C. Refined TLA+ Payment & Refund Semantics (P1)
- **Model:** `specs/tla/CheckoutInventory.tla` & `specs/tla/CheckoutInventory.cfg`
- Separated `ProcessPaymentCapture` and `ProcessRefund` actions with explicit lifecycle states (`PaymentStatuses == {"None", "Captured", "Failed"}`, `RefundStatuses == {"None", "Success", "Failed"}`).
- Modeled monetary quantities: `capturedAmount` and `refundedAmount`.
- Proved 11 safety invariants:
  - `AtMostOneCapturePerPayment`
  - `AtMostOneSuccessfulRefundPerPayment`
  - `RefundRequiresCapture`
  - `NoRefundOnFailedPayment`
  - `RefundAmountBoundedByCapture`
  - `ExplicitRefundFailureRepresented`
  - `OrderSettlementConsistency`
  - `InventoryConservation`
  - `StockNonNegative`
  - `UniqueOrderIds`
  - `MaxActiveOrderPerShopper`
- **TLC Model Checker Results:** **2,206,513 states generated, 44,048 distinct states found with 0 errors** (depth 12).
- Complete receipt with SHA-256 hashes preserved in `docs/verification-evidence/tlc-state-space-proof.txt`.

### D. Tightened Lean 4 Execution & Correspondence (P1)
- **Script:** `scripts/lean-verify.mjs`
- Restricted macOS Darwin fallback strictly to `__DATA_CONST segment missing SG_READ_ONLY flag`, failing closed on all other errors.
- Pinned `leanprover/lean4:v4.15.0`.
- Proved 7 formal theorems in `Framique/Pricing.lean`:
  - `discount_le_subtotal`
  - `final_total_nonneg`
  - `fixed_discount_exact`
  - `percent_100_exact`
  - `bogo_discount_bounded`
  - `free_shipping_waives_fee`
  - `bogo_zero_cheapest_yields_zero`
- Asserted exactly 13 unique expected vector IDs. Evaluated subtotal, shipping, freeShipping, discount, and finalTotal with 100% exact match against production TypeScript (`src/lib/commerce/pricing.ts`).

### E. Closed CircleCI Gap (P1)
- Added dedicated `bombadil-staging` job to `.circleci/config.yml`.
- Executes `bun run test:bombadil:all` with Playwright Chromium against loopback staging.
- Preserves traces and trace summary as pipeline artifacts.

---

## 3. Verification Sequence & Status

All verification suites pass cleanly with 0 errors:

```bash
bun run typecheck         # PASS (tsgo --noEmit: 0 errors)
bun run test:features     # PASS (5/5 features pass schema & file linkages)
bun run test:properties   # PASS (7/7 tests: 5 property suites + 2 mutation proofs)
bun run test:lean         # PASS (7 theorems compiled, 13/13 formal vectors match production TS)
bun run test:tla          # PASS (TLC verified 2,206,513 states, 11 invariants, 0 errors)
bun run test:bombadil:all # PASS (All 8 viewports pass with 0 violations and 0 image failures)
bun run test:contracts    # PASS (13 contract suites, 258/258 cases passed)
bun run test              # PASS (642 Vitest test files)
```
