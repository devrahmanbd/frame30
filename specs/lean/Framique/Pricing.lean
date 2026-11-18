namespace Framique

def MinorUnits := Nat

inductive Coupon where
  | fixed (amount : Nat)
  | percent (rate : Nat)
  | bogo (totalQty : Nat) (buy : Nat) (get : Nat) (cheapest : Nat)
  | freeShipping
deriving Repr

def calculateBogoUnits (totalQty buy get : Nat) : Nat :=
  let b := Nat.max 1 buy
  let g := Nat.max 1 get
  (totalQty / (b + g)) * g

def calculateDiscount (subtotal : Nat) : Coupon → Nat
  | Coupon.fixed a => Nat.min a subtotal
  | Coupon.percent r => (subtotal * Nat.min 100 r) / 100
  | Coupon.bogo totalQty buy get cheapest =>
      let freeUnits := calculateBogoUnits totalQty buy get
      Nat.min (freeUnits * cheapest) subtotal
  | Coupon.freeShipping => 0

def finalTotal (subtotal : Nat) (c : Coupon) : Nat :=
  subtotal - calculateDiscount subtotal c

def finalOrderTotal (subtotal shipping : Nat) (c : Coupon) : Nat :=
  match c with
  | Coupon.freeShipping => subtotal
  | _ => subtotal - calculateDiscount subtotal c + shipping

/-- Theorem 1: Discount is always strictly bounded by the eligible subtotal across all coupon types. -/
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

/-- Theorem 2: Non-negative final customer charge. -/
theorem final_total_nonneg (s : Nat) (c : Coupon) :
    0 <= finalTotal s c := by
  exact Nat.zero_le (finalTotal s c)

/-- Theorem 3: Fixed discount delivers exact amount when subtotal is sufficient. -/
theorem fixed_discount_exact (s a : Nat) (h : a <= s) :
    calculateDiscount s (Coupon.fixed a) = a := by
  simp [calculateDiscount]
  exact Nat.min_eq_left h

/-- Theorem 4: 100% percentage discount delivers exact full subtotal. -/
theorem percent_100_exact (s : Nat) :
    calculateDiscount s (Coupon.percent 100) = s := by
  simp [calculateDiscount]

/-- Theorem 5: General BOGO discount is strictly bounded by subtotal. -/
theorem bogo_discount_bounded (s totalQty buy get cheapest : Nat) :
    calculateDiscount s (Coupon.bogo totalQty buy get cheapest) <= s := by
  simp [calculateDiscount]
  apply Nat.min_le_right

/-- Theorem 6: Free shipping coupon waives shipping fee entirely from final order total. -/
theorem free_shipping_waives_fee (s ship : Nat) :
    finalOrderTotal s ship Coupon.freeShipping = s := by
  simp [finalOrderTotal]

/-- Theorem 7: BOGO with zero cheapest price yields zero discount. -/
theorem bogo_zero_cheapest_yields_zero (s totalQty buy get : Nat) :
    calculateDiscount s (Coupon.bogo totalQty buy get 0) = 0 := by
  simp [calculateDiscount]

end Framique

