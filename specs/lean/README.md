# Frame30 Algorithmic Formal Verification: Lean 4

## Scope
Formal verification of core monetary calculation algorithms in interactive theorem prover Lean 4.

## Theorems Formally Proved
1. **`discount_le_subtotal`**:
   $$\forall s \in \mathbb{N},\, \forall c \in \text{Coupon},\quad \text{calculateDiscount}(s, c) \le s$$
   The discount computed for any coupon (fixed amount, percentage rate up to 100%, or free shipping) is mathematically bounded by the order subtotal.
2. **`final_total_nonneg`**:
   $$\forall s \in \mathbb{N},\, \forall c \in \text{Coupon},\quad \text{finalTotal}(s, c) \ge 0$$
   Customer final charges never underflow or become negative in minor units.
3. **`fixed_discount_exact`**:
   $$\forall s, a \in \mathbb{N},\, a \le s \implies \text{calculateDiscount}(s, \text{fixed}(a)) = a$$
   Fixed coupon discounts apply exactly when subtotal meets the threshold.

## Refinement to Production TypeScript
The verified Lean 4 specification connects directly to:
- [`src/lib/coupons.server.ts`](../../src/lib/coupons.server.ts): `discountFor()` implements the exact function verified in `Pricing.lean`.
- [`src/lib/commerce-properties.test.ts`](../../src/lib/commerce-properties.test.ts): `fast-check` tests verify this refinement relation over thousands of randomly generated runtime inputs.

## Building with Lake
When `lean` and `lake` are installed:
```bash
lake build
```
