# Lean 4 Algorithmic Formal Verification & Test-Vector Correspondence (Wave 23)

**Date:** 2026-11-18  
**Toolchain:** `leanprover/lean4:v4.15.0` (pinned in `specs/lean/lean-toolchain`)  
**Source Specification:** [`specs/lean/Framique/Pricing.lean`](../../specs/lean/Framique/Pricing.lean)  
**Refinement Target:** [`src/lib/commerce/pricing.ts`](../../src/lib/commerce/pricing.ts) (`calculateDiscount`)  
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
    exact Nat.min_le_right a s
  | percent r =>
    simp [calculateDiscount]
    have h1 : Nat.min 100 r <= 100 := Nat.min_le_left 100 r
    have h2 : (s * Nat.min 100 r) <= s * 100 := Nat.mul_le_mul_left s h1
    have h3 : (s * 100) / 100 = s := Nat.mul_div_right s (by decide)
    have h4 : (s * Nat.min 100 r) / 100 <= (s * 100) / 100 := Nat.div_le_div_right h2
    rw [h3] at h4
    exact h4
  | bogo _ _ cheapest =>
    simp [calculateDiscount]
    exact Nat.min_le_right cheapest s
  | freeShipping =>
    simp [calculateDiscount]
    exact Nat.zero_le s
```

---

## 2. Theorem 2: Exact Fixed Discount Bound (`fixed_discount_exact`)

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

## 3. Theorem 3: 100% Percentage Discount Equality (`percent_100_exact`)

### Mathematical Statement:
$$\forall s \in \mathbb{N},\quad \text{calculateDiscount}(s, \text{Coupon.percent}(100)) = s$$

### Formal Lean 4 Proof:
```lean
theorem percent_100_exact (s : Nat) :
    calculateDiscount s (Coupon.percent 100) = s := by
  simp [calculateDiscount]
```

---

## 4. Test-Vector Correspondence Proof: Lean Model vs Production TypeScript

Executed via `scripts/lean-verify.mjs` comparing the formal model semantics against `src/lib/commerce/pricing.ts`:

| Test Vector # | Subtotal | Coupon Spec | Formal Lean Semantics | Production TS Output | Correspondence |
|---|---|---|---|---|:---:|
| 1 | 10,000 | fixed(2500) | 2,500 | 2,500 | **MATCH** |
| 2 | 5,000 | fixed(5000) | 5,000 | 5,000 | **MATCH** |
| 3 | 3,000 | fixed(7500) | 3,000 (clamped) | 3,000 (clamped) | **MATCH** |
| 4 | 0 | fixed(1000) | 0 | 0 | **MATCH** |
| 5 | 12,000 | percent(10) | 1,200 | 1,200 | **MATCH** |
| 6 | 12,000 | percent(25) | 3,000 | 3,000 | **MATCH** |
| 7 | 9,999 | percent(33) | 3,299 | 3,299 | **MATCH** |
| 8 | 15,000 | percent(100) | 15,000 | 15,000 | **MATCH** |
| 9 | 15,000 | percent(150) | 15,000 (clamped) | 15,000 (clamped) | **MATCH** |
| 10 | 8,000 | freeShipping | 0 | 0 | **MATCH** |
| 11 | 20,000 | bogo(1, 1, cheapest=4500) | 4,500 | 4,500 | **MATCH** |
| 12 | 3,000 | bogo(1, 1, cheapest=5000) | 3,000 (clamped) | 3,000 (clamped) | **MATCH** |

**Status:** 12/12 formal test vectors matched production TypeScript exactly.
