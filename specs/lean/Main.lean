import Framique.Pricing

open Framique

def formatVector (id : String) (subtotal : Nat) (c : Coupon) : String :=
  let d := calculateDiscount subtotal c
  let f := finalTotal subtotal c
  s!"\{\"id\": \"{id}\", \"subtotal\": {subtotal}, \"discount\": {d}, \"finalTotal\": {f}}"

def main : IO Unit := do
  let vectors : List String := [
    formatVector "fixed-less" 10000 (Coupon.fixed 2500),
    formatVector "fixed-exact" 5000 (Coupon.fixed 5000),
    formatVector "fixed-overflow" 3000 (Coupon.fixed 7500),
    formatVector "fixed-zero" 0 (Coupon.fixed 1000),
    formatVector "percent-10" 12000 (Coupon.percent 10),
    formatVector "percent-25" 12000 (Coupon.percent 25),
    formatVector "percent-33" 9999 (Coupon.percent 33),
    formatVector "percent-100" 15000 (Coupon.percent 100),
    formatVector "percent-150-clamp" 15000 (Coupon.percent 150),
    formatVector "freeship" 8000 (Coupon.freeShipping),
    formatVector "bogo-standard" 20000 (Coupon.bogo 4 1 1 4500),
    formatVector "bogo-uneven" 30000 (Coupon.bogo 5 2 1 5000),
    formatVector "bogo-clamp" 3000 (Coupon.bogo 4 1 1 5000)
  ]
  IO.println ("[" ++ String.intercalate ", " vectors ++ "]")
