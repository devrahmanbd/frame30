# Verification Engineering Architecture Walkthrough (Wave 23.2)

**Date:** 2026-11-19 · **Branch:** `frame30` / `main` · **Status:** Verified & Released  
**Reference Model:** SpaceXSI / Grok Bot ("All Code Is Slop (Except Mine)" — Lauren Tan, Nov 2026)  
**Implementation:** Specification-Driven, Fail-Closed, Property-Tested & Formally Verified Pipeline  
**Master Evidence Catalog:** [`docs/verification-evidence/EVIDENCE_INDEX.md`](./docs/verification-evidence/EVIDENCE_INDEX.md)  

---

## 1. Executive Summary

To permanently eliminate recurring defects (such as preview vs. production drift, cross-contaminated product collections, responsive overflow, and duplicated AI patch cycles), Frame30 has deployed a **six-layer verification engineering architecture**.

In Wave 23.2, all verification mechanisms were hardened with extreme precision to address formal audit feedback:
- **Truthful & Fail-Closed Bombadil Exploration:** Removed synthetic trace stubs; missing traces fail closed; parsed 82 real executed actions and dynamic action types from actual trace events across all 8 viewports; added fail-closed image decoding verification via custom action `await_image_decodes`.
- **Refined TLA+ Concurrent Checkout Semantics:** Separated physical inventory quantities (`qty`, `availableStock`, `holds`) from financial monetary minor units (`orderTotalMinor`, `capturedAmountMinor`, `refundedAmountMinor`). Capture strictly uses modeled order totals, and refunds model cumulative partial and full amounts bounded by capture. Proved 12 invariants (**3,283,425 states generated, 52,880 distinct states found with 0 errors**, depth 12).
- **Tightened Lean 4 Formal Correspondence:** Pinned `leanprover/lean4:v4.15.0`, machine-checked 7 formal theorems, and asserted 13 unique test vectors with nonzero shipping and BOGO edge cases matching production TypeScript 100% exactly.
- **Dedicated CI Staging Job:** Added `bombadil-staging` job to `.circleci/config.yml` executing the explicit 8-viewport matrix against seeded loopback staging.

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

### A. Fail-Closed Bombadil Image Verification (P0)
- **Files:** `bombadil/properties/images.ts`, `bombadil/specification.ts`
- Missing browser document state (`!doc`) strictly fails closed with `brokenCount: 1`.
- Canonical image container validation: requires expected images to exist in homepage heroes (`[data-hero-image] img, img[alt='Dashboard'], .fq-halo ~ img`), collection cards (`[data-product-card] img`), PDP product galleries (`[data-gallery-image] img`), and cart items (`[data-cart-item] img`).
- Rejects missing sources (`!src`) and invalid sources (`src="undefined"`, `src="null"`).
- Requires completed images to decode with strictly positive dimensions (`naturalWidth > 0 && naturalHeight > 0`).
- Custom browser action `await_image_decodes` explicitly awaits `img.decode()` during exploration.
- Exercises lazy-loaded images after scrolling into the active viewport.
- Captures all failed URLs and specific failure reasons (`missing-src`, `invalid-src`, `incomplete-load`, `zero-natural-dimensions`, `decode-failed`) in trace output.

### B. Truthful 8-Viewport Responsive Matrix (`test:bombadil:all`) (P1)
- **Command:** `bun run test:bombadil:all` (added to `package.json`).
- Automatically manages local test server lifecycle on port 3000 with TanStack Start SSR pre-warming.
- Removed synthetic trace fallback; missing traces fail closed immediately.
- Dynamically parses real executed actions, action types, violations, and image failures from `trace.jsonl`.
- Explores all 8 viewports:
  1. `mobile-320` (320x568, route `/`) — **PASS** (10 actions, 0 violations, 0 image failures)
  2. `mobile-360` (360x640, route `/c/sarees`) — **PASS** (1 action, 0 violations, 0 image failures)
  3. `mobile-390` (390x844, route `/`) — **PASS** (26 actions, 0 violations, 0 image failures)
  4. `mobile-430` (430x932, route `/p/dhakai-jamdani-silk-saree`) — **PASS** (9 actions, 0 violations, 0 image failures)
  5. `tablet-768` (768x1024, route `/cart`) — **PASS** (9 actions, 0 violations, 0 image failures)
  6. `laptop-1024` (1024x768, route `/auth`) — **PASS** (10 actions, 0 violations, 0 image failures)
  7. `desktop-1280` (1280x800, route `/c/sarees`) — **PASS** (6 actions, 0 violations, 0 image failures)
  8. `desktop-1440` (1440x900, route `/`) — **PASS** (11 actions, 0 violations, 0 image failures)
- Preserves separate trace files in `docs/verification-evidence/bombadil/traces/<viewport>/` with cryptographic SHA-256 digests.
- Records complete execution metrics in `docs/verification-evidence/bombadil-trace-summary.json`.
- Protects production customer data by targeting `staging-loopback (seeded-preview-fixtures)` at `http://127.0.0.1:3000`.

### C. Refined TLA+ Payment & Refund Semantics with Minor-Unit Separation (P1)
- **Model:** `specs/tla/CheckoutInventory.tla` & `specs/tla/CheckoutInventory.cfg`
- Separated physical inventory quantities (`qty \in 1..MaxStock`, `availableStock`, `holds`) from financial monetary amounts (`orderTotalMinor \in 1000..MaxOrderTotalMinor`, `capturedAmountMinor`, `refundedAmountMinor`).
- Capture strictly uses modeled order total minor units (`target.orderTotalMinor`), NOT physical quantity.
- Modeled cumulative partial and full refunds up to captured amount (`target.refundedAmountMinor + refundAmountMinor <= target.capturedAmountMinor`).
- Proved 12 invariants (`TypeOK` plus 11 safety invariants):
  - `TypeOK`
  - `StockNonNegative`
  - `InventoryConservation`
  - `UniqueOrderIds`
  - `MaxActiveOrderPerShopper`
  - `AtMostOneCapturePerPayment`
  - `AtMostOneSuccessfulRefundPerPayment`
  - `OrderSettlementConsistency`
  - `RefundRequiresCapture`
  - `NoRefundOnFailedPayment`
  - `RefundAmountBoundedByCapture` (`0 <= refundedAmountMinor <= capturedAmountMinor`)
  - `ExplicitRefundFailureRepresented`
- **TLC Model Checker Results:** **3,283,425 states generated, 52,880 distinct states found with 0 errors** (depth 12).
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
bun run test:tla          # PASS (TLC verified 3,283,425 states, 12 invariants, 0 errors)
bun run test:bombadil:all # PASS (All 8 viewports pass with 82 real actions executed, 0 violations, 0 image failures)
bun run test:contracts    # PASS (13 contract suites, 258/258 cases passed)
bun run test              # PASS (642 Vitest test files)
```
