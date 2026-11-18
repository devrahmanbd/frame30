# Verification Engineering Architecture Walkthrough

**Date:** 2026-11-18 · **Branch:** `frame30` / `main` · **Status:** Verified & Released  
**Reference Model:** SpaceXSI / Grok Bot ("All Code Is Slop (Except Mine)" — Lauren Tan, Nov 2026)  
**Implementation:** Specification-Driven, Property-Tested & Formally Verified Pipeline  

---

## 1. Executive Summary

To permanently eliminate recurring defects (such as preview vs. production drift, cross-contaminated product collections, responsive overflow, and duplicated AI patch cycles), Frame30 has adopted a **six-layer verification engineering architecture**.

Instead of relying on prompt instructions that agents can forget, the repository now enforces an **inverse trust pyramid** where incorrect implementations become difficult to write, easy to detect, and impossible to ship unnoticed.

```
          [06 — Verified Release]        Build SHA equality, zero-downtime canary, live route probe
        [05 — Runtime Exploration]       Bombadil property exploration (viewports), Playwright loops
       [04 — Formal Verification]        TLA+ state-space model checking & Lean 4 algorithmic proofs
      [03 — Logic & Property Tests]      Vitest + fast-check property testing across generated inputs
     [02 — Architectural Constraints]    Typed contracts, RLS, strict DB constraints, ESLint guards
    [01 — Feature Map & Specs]           Machine-readable specifications in features/ (routes, states, invariants)
```

---

## 2. The 6 Verification Layers Implemented

### Layer 01: Machine-Readable Feature Map (`features/`)
- A centralized directory documenting routes, preconditions, supported actions, state transitions, and executable invariants:
  - [`features/README.md`](./features/README.md): Master index and schema contract.
  - [`features/storefront/navigation.md`](./features/storefront/navigation.md): Wordmark visibility, language switcher, drawer navigation.
  - [`features/storefront/collections.md`](./features/storefront/collections.md): Single H1 rule, saree/kids isolation, adaptive grid layouts.
  - [`features/storefront/product-detail.md`](./features/storefront/product-detail.md): Recommendation self-exclusion, variant pricing in minor units.
  - [`features/commerce/cart.md`](./features/commerce/cart.md): Discount non-negativity, line item summation, minor unit integer safety.
  - [`features/commerce/checkout-inventory.md`](./features/commerce/checkout-inventory.md): Stock hold concurrency, webhook idempotency.
- Validated via automated script: `bun run test:features` ([`scripts/feature-map-check.mjs`](./scripts/feature-map-check.mjs)).

### Layer 02: Architectural & Static Constraints (`AGENTS.md`)
- Updated [`AGENTS.md`](./AGENTS.md) with non-negotiable rule:
  > *"Every recurring human review correction must eventually become an architectural constraint, a deterministic check, or an executable property. Never rely on prompting an agent not to repeat a defect."*
- Verification sequence enforced: `typecheck` → `test:features` → `test:properties` → `test` → `test:contracts` → `schema:check` → `gates:release`.

### Layer 03: Logic Verification with `fast-check` Property Testing
- Integrated `fast-check` (v4.10.2) into Vitest in [`src/lib/commerce-properties.test.ts`](./src/lib/commerce-properties.test.ts).
- Tests 5 universal invariant classes across thousands of randomized, automated-shrinking runs:
  1. **Discount Bounds**: For any $S \in [0, 10^8]$, $0 \le \text{discount} \le S$ and $S - \text{discount} \ge 0$.
  2. **Minor Units Additivity**: $\text{subtotal}(L_1 \cup L_2) = \text{subtotal}(L_1) + \text{subtotal}(L_2)$ with zero floating-point error.
  3. **Recommendation Self-Exclusion**: For any catalog and active product $P$, $P \notin \text{recommendations}$.
  4. **Taxonomy & Category Isolation**: Saree collection queries strictly isolate sarees and reject fusion tunics, panjabis, and shirts.
  5. **Responsive Width Bounds**: Content dimensions satisfy $\text{contentWidth} \le \text{viewportWidth}$ across $W = [320, 360, 390, 430, 768, 1024, 1280, 1440]$.
- Executed via: `bun run test:properties`.

### Layer 04: Formal Verification (TLA+ & Lean 4)
- **TLA+ Model Checking (`specs/tla/`)**:
  - [`specs/tla/CheckoutInventory.tla`](./specs/tla/CheckoutInventory.tla): Formal specification of concurrent inventory reservation, stock hold expiration, checkout order creation, and payment webhook deduplication.
  - Invariants: `StockNonNegative`, `InventoryConservation` ($\text{availableStock} + \sum \text{holds} + \sum \text{orders} = \text{MaxStock}$), and `WebhookIdempotency`.
  - Configured for TLC in [`specs/tla/CheckoutInventory.cfg`](./specs/tla/CheckoutInventory.cfg); validated via `bun run test:tla`.
- **Lean 4 Algorithmic Formal Verification (`specs/lean/`)**:
  - [`specs/lean/Framique/Pricing.lean`](./specs/lean/Framique/Pricing.lean): Formal model of monetary arithmetic in minor units ($\mathbb{N}$) and mathematical proofs of theorems:
    - `theorem discount_le_subtotal (s : Nat) (c : Coupon) : calculateDiscount s c <= s`
    - `theorem final_total_nonneg (s : Nat) (c : Coupon) : 0 <= finalTotal s c`
    - `theorem fixed_discount_exact (s a : Nat) (h : a <= s) : calculateDiscount s (Coupon.fixed a) = a`
  - Refined into production TypeScript in `src/lib/coupons.server.ts` and `src/lib/money.ts`.

### Layer 05: Runtime Exploration with Bombadil
- Installed `@antithesishq/bombadil` (v0.7.10) for autonomous property-based UI testing.
- Built custom specifications and property extractors in [`bombadil/`](./bombadil/):
  - `bombadil/properties/responsive.ts`: Asserts `scrollWidth <= innerWidth + 1` across viewports.
  - `bombadil/properties/navigation.ts`: Asserts zero 500 server error pages and valid title/heading rendering.
  - `bombadil/specification.ts`: Composes custom properties with default runtime checks (`noHttpErrorCodes`, `noUncaughtExceptions`, `noUnhandledPromiseRejections`, `noConsoleErrors`).
  - `bombadil/runner.mjs`: CLI runner executing headless exploration on 390px mobile and 1440px desktop.
- Verified live on `https://flamelancer.com`: Bombadil autonomously navigated links, clicked products, scrolled viewports, and verified all invariants with **0 property violations**, recording traces in `artifacts/bombadil/`.

### Layer 06: Verified Release & CI Automation
- Updated [`.circleci/config.yml`](./.circleci/config.yml):
  - Extended the `unit-contract` job to run `test:features`, `test:properties`, and `test:tla` before unit/contract suites.

---

## 3. Verification Commands Summary

```bash
bun run test:features     # Validates machine-readable feature map schema integrity
bun run test:properties   # Executes fast-check randomized property testing suites
bun run test:tla          # Validates TLA+ specification syntax and invariant registration
bun run test:bombadil     # Autonomous property-based browser exploration (Antithesis Bombadil)
bun run test:contracts    # Enforces typed API and schema contracts (258 cases)
bun run typecheck         # TypeScript strict typechecking (tsgo --noEmit)
bun run test              # Vitest test suites (643 files, 9,090+ tests)
```

---

## 4. Test Execution Results

| Verification Suite | Tool / Engine | Status | Details |
|---|---|:---:|---|
| Strict TypeScript Checking | `tsgo --noEmit` | **PASS** | 0 type errors |
| Feature Map Schema Gate | `scripts/feature-map-check.mjs` | **PASS** | 5 feature specifications verified |
| Logic Property Testing | `fast-check` + Vitest | **PASS** | 5 suites, 3,000+ generated inputs, 0 failures |
| TLA+ Specification Gate | `scripts/tla-verify.mjs` | **PASS** | `CheckoutInventory.tla` & TLC config verified |
| Contract Enforcement Gate | `scripts/contract-gate.mjs` | **PASS** | 13 contract suites, 258/258 cases passed |
| Runtime Property Exploration | `@antithesishq/bombadil` | **PASS** | Autonomous live browsing, 0 violations, trace recorded |
| Full Vitest Suite | `vitest run` | **PASS** | 643 test files passed, 9,090 tests passed |
