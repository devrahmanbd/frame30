# Lean 4 Algorithmic Formal Verification & Test-Vector Correspondence (Wave 23.2)

**Date:** 2026-11-19  
**Toolchain:** `leanprover/lean4:v4.15.0` (pinned in `specs/lean/lean-toolchain`)  
**Source Specification:** [`specs/lean/Framique/Pricing.lean`](../../specs/lean/Framique/Pricing.lean)  
**Main Executable Generator:** [`specs/lean/Main.lean`](../../specs/lean/Main.lean)  
**Refinement Target:** [`src/lib/commerce/pricing.ts`](../../src/lib/commerce/pricing.ts) (`calculateDiscount`, `calculateOrderTotal`)  
**Correspondence Gate:** `bun run test:lean` ([`scripts/lean-verify.mjs`](../../scripts/lean-verify.mjs))

---

## 1. Theorem 1: Discount Bounded by Subtotal (`discount_le_subtotal`)

### Mathematical Statement:
$$\forall s \in \mathbb{N},\, \forall c \in \text{Coupon},\quad \text{calculateDiscount}(s, c) \le s$$

### Formal Lean 4 Proof:
```lean
theorem discount_le_subtotal (s : Nat) (c : Coupon) :
    calculateDiscount s c <= s := by
  cases c with
  | fixed a =>
    simp [calculateDiscount]
    apply Nat.min_le_right
  | percent r =>
    simp [calculateDiscount]
    apply Nat.div_le_of_le_mul
    rw [Nat.mul_comm 100 s]
    have h : Nat.min 100 r <= 100 := Nat.min_le_left 100 r
    exact Nat.mul_le_mul_left s h
  | bogo totalQty buy get cheapest =>
    simp [calculateDiscount]
    apply Nat.min_le_right
  | freeShipping =>
    simp [calculateDiscount]
```

---

## 2. Theorem 2: Non-Negative Final Customer Charge (`final_total_nonneg`)

### Mathematical Statement:
$$\forall s \in \mathbb{N},\, \forall c \in \text{Coupon},\quad 0 \le \text{finalTotal}(s, c)$$

### Formal Lean 4 Proof:
```lean
theorem final_total_nonneg (s : Nat) (c : Coupon) :
    0 <= finalTotal s c := by
  exact Nat.zero_le (finalTotal s c)
```

---

## 3. Theorem 3: Exact Fixed Discount Bound (`fixed_discount_exact`)

### Mathematical Statement:
$$\forall s, a \in \mathbb{N},\, a \le s \implies \text{calculateDiscount}(s, \text{Coupon.fixed}(a)) = a$$

### Formal Lean 4 Proof:
```lean
theorem fixed_discount_exact (s a : Nat) (h : a <= s) :
    calculateDiscount s (Coupon.fixed a) = a := by
  simp [calculateDiscount]
  exact Nat.min_eq_left h
```

---

## 4. Theorem 4: 100% Percentage Discount Equality (`percent_100_exact`)

### Mathematical Statement:
$$\forall s \in \mathbb{N},\quad \text{calculateDiscount}(s, \text{Coupon.percent}(100)) = s$$

### Formal Lean 4 Proof:
```lean
theorem percent_100_exact (s : Nat) :
    calculateDiscount s (Coupon.percent 100) = s := by
  simp [calculateDiscount]
```

---

## 5. Theorem 5: General BOGO Discount Bounded by Subtotal (`bogo_discount_bounded`)

### Mathematical Statement:
$$\forall s, \text{totalQty}, \text{buy}, \text{get}, \text{cheapest} \in \mathbb{N},\quad \text{calculateDiscount}(s, \text{Coupon.bogo}(\text{totalQty}, \text{buy}, \text{get}, \text{cheapest})) \le s$$

### Formal Lean 4 Proof:
```lean
theorem bogo_discount_bounded (s totalQty buy get cheapest : Nat) :
    calculateDiscount s (Coupon.bogo totalQty buy get cheapest) <= s := by
  simp [calculateDiscount]
  apply Nat.min_le_right
```

---

## 6. Theorem 6: Free Shipping Waives Fee Completely (`free_shipping_waives_fee`)

### Mathematical Statement:
$$\forall s, \text{shipping} \in \mathbb{N},\quad \text{finalOrderTotal}(s, \text{shipping}, \text{Coupon.freeShipping}) = s$$

### Formal Lean 4 Proof:
```lean
theorem free_shipping_waives_fee (s shipping : Nat) :
    finalOrderTotal s shipping Coupon.freeShipping = s := by
  simp [finalOrderTotal, calculateDiscount]
```

---

## 7. Theorem 7: BOGO with Zero Cheapest Unit Yields Zero Discount (`bogo_zero_cheapest_yields_zero`)

### Mathematical Statement:
$$\forall s, \text{totalQty}, \text{buy}, \text{get} \in \mathbb{N},\quad \text{calculateDiscount}(s, \text{Coupon.bogo}(\text{totalQty}, \text{buy}, \text{get}, 0)) = 0$$

### Formal Lean 4 Proof:
```lean
theorem bogo_zero_cheapest_yields_zero (s totalQty buy get : Nat) :
    calculateDiscount s (Coupon.bogo totalQty buy get 0) = 0 := by
  simp [calculateDiscount]
```

---

## 8. Test-Vector Correspondence Proof: Compiled Lean 4 Runtime vs Production TypeScript

Executed via `scripts/lean-verify.mjs` comparing the **actual compiled Lean 4 runtime execution output** (via `lake exe framique_verify` / `lean --run Main.lean`) against `src/lib/commerce/pricing.ts` (`calculateDiscount` + `calculateOrderTotal`):

| Vector ID | Subtotal | Shipping | FreeShip? | Coupon Definition | Compiled Lean Output | Production TS Output | Result |
|---|---|---|:---:|---|---|---|:---:|
| `fixed-less` | 10,000 | 5,000 | No | fixed(2500) | disc=2,500, total=12,500 | disc=2,500, total=12,500 | **MATCH** |
| `fixed-exact` | 5,000 | 0 | No | fixed(5000) | disc=5,000, total=0 | disc=5,000, total=0 | **MATCH** |
| `fixed-overflow` | 3,000 | 1,500 | No | fixed(7500) | disc=3,000, total=1,500 | disc=3,000, total=1,500 | **MATCH** |
| `fixed-zero` | 0 | 2,000 | No | fixed(1000) | disc=0, total=2,000 | disc=0, total=2,000 | **MATCH** |
| `percent-10` | 12,000 | 3,000 | No | percent(10) | disc=1,200, total=13,800 | disc=1,200, total=13,800 | **MATCH** |
| `percent-25` | 12,000 | 0 | No | percent(25) | disc=3,000, total=9,000 | disc=3,000, total=9,000 | **MATCH** |
| `percent-33` | 9,999 | 2,500 | No | percent(33) | disc=3,299, total=9,200 | disc=3,299, total=9,200 | **MATCH** |
| `percent-100` | 15,000 | 4,000 | No | percent(100) | disc=15,000, total=4,000 | disc=15,000, total=4,000 | **MATCH** |
| `percent-150-clamp` | 15,000 | 0 | No | percent(150) | disc=15,000, total=0 | disc=15,000, total=0 | **MATCH** |
| `freeship` | 8,000 | 5,000 | Yes | freeShipping | disc=0, free=true, total=8,000 | disc=0, free=true, total=8,000 | **MATCH** |
| `bogo-standard` | 20,000 | 3,000 | No | bogo(qty=4, buy=1, get=1, cheap=4500) | disc=9,000, total=14,000 | disc=9,000, total=14,000 | **MATCH** |
| `bogo-insufficient-qty` | 10,000 | 2,000 | No | bogo(qty=1, buy=2, get=1, cheap=5000) | disc=0, total=12,000 | disc=0, total=12,000 | **MATCH** |
| `bogo-zero-cheapest` | 5,000 | 1,500 | No | bogo(qty=4, buy=1, get=1, cheap=0) | disc=0, total=6,500 | disc=0, total=6,500 | **MATCH** |

**Status:** All 13/13 formal test vectors matched production TypeScript exactly with zero discrepancies. Verification gate is strictly fail-closed.


