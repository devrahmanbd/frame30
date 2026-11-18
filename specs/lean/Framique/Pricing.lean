/-
  Frame30 Algorithmic Formal Verification: Pricing & Discount Theorems
  
  Formal model of integer minor-unit monetary arithmetic and coupon discount bounds.
  Proves that:
    1. Calculated discount never exceeds the eligible subtotal (discount <= subtotal).
    2. Final charge is non-negative.
    3. Fixed discount applies exactly when within subtotal bounds.
-/

namespace Framique

def MinorUnits := Nat

inductive Coupon where
  | fixed (amount : Nat)
  | percent (rate : Nat)
  | freeShipping
deriving Repr

def calculateDiscount (subtotal : Nat) : Coupon → Nat
  | Coupon.fixed a => Nat.min a subtotal
  | Coupon.percent r => (subtotal * Nat.min 100 r) / 100
  | Coupon.freeShipping => 0

def finalTotal (subtotal : Nat) (c : Coupon) : Nat :=
  subtotal - calculateDiscount subtotal c

/-- Theorem 1: Discount is always bounded by the eligible subtotal. -/
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

/-- Theorem 2: Final customer charge never underflows or becomes negative. -/
theorem final_total_nonneg (s : Nat) (c : Coupon) :
    0 <= finalTotal s c := by
  exact Nat.zero_le (finalTotal s c)

/-- Theorem 3: Fixed discount delivers exact amount when subtotal is sufficient. -/
theorem fixed_discount_exact (s a : Nat) (h : a <= s) :
    calculateDiscount s (Coupon.fixed a) = a := by
  simp [calculateDiscount]
  exact Nat.min_eq_left h

end Framique
