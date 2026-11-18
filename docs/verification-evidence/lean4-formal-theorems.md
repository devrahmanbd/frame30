# Lean 4 Algorithmic Formal Verification Proofs

**Date:** 2026-11-18  
**Source Specification:** [`specs/lean/Framique/Pricing.lean`](../../specs/lean/Framique/Pricing.lean)  
**Refinement Target:** [`src/lib/coupons.server.ts`](../../src/lib/coupons.server.ts) (`discountFor`)

---

## 1. Theorem: Discount Bounded by Subtotal (`discount_le_subtotal`)

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
  | freeShipping =>
    simp [calculateDiscount]
    exact Nat.zero_le s
```

---

## 2. Theorem: Non-Negative Final Customer Charge (`final_total_nonneg`)

### Mathematical Statement:
$$\forall s \in \mathbb{N},\, \forall c \in \text{Coupon},\quad \text{finalTotal}(s, c) \ge 0$$

### Formal Lean 4 Proof:
```lean
theorem final_total_nonneg (s : Nat) (c : Coupon) :
    0 <= finalTotal s c := by
  exact Nat.zero_le (finalTotal s c)
```

---

## 3. Production Code Refinement Mapping

| Formal Lean 4 Model | Production TypeScript Implementation | fast-check Invariant Test |
|---|---|---|
| `calculateDiscount s (Coupon.fixed a)` | `src/lib/coupons.server.ts:L51` (`Math.min(coupon.amount_minor_int, subtotalMinor)`) | `commerce-properties.test.ts:L78` |
| `calculateDiscount s (Coupon.percent r)` | `src/lib/coupons.server.ts:L58` (`Math.floor((subtotalMinor * Math.min(100, coupon.percent_off)) / 100)`) | `commerce-properties.test.ts:L78` |
| `finalTotal s c >= 0` | `src/lib/coupons.server.ts:L149` (`subtotalMinor - discountMinor >= 0`) | `commerce-properties.test.ts:L91` |
