import Framique.Pricing
import Framique.ThemeLifecycle

open Framique
open Framique.ThemeLifecycle

def formatPricingVector (id : String) (subtotal shipping : Nat) (c : Coupon) : String :=
  let d := calculateDiscount subtotal c
  let f := finalOrderTotal subtotal shipping c
  let freeShip := match c with | Coupon.freeShipping => true | _ => false
  s!"\{\"id\": \"{id}\", \"subtotal\": {subtotal}, \"shipping\": {shipping}, \"freeShipping\": {freeShip}, \"discount\": {d}, \"finalTotal\": {f}}"

def formatThemeVector (id : String) (doc : ThemeDoc) : String :=
  let res := migrateDoc doc
  let (status, outSchema, isStructured, url, alt, focalX, focalY, pubEligible) := match res with
    | MigrationResult.ok out =>
      let (u, a, fx, fy) := match out.media with
        | MediaValue.legacyUrl link => (link, "", 0, 0)
        | MediaValue.structured link desc x y => (link, desc, x, y)
      ("ok", "1.0.0", isStructuredMedia out.media, u, a, fx, fy, isPublishEligible out)
    | MigrationResult.rejected orig =>
      let s := match orig.schema with
        | SchemaVersion.legacy => "0.9.0"
        | SchemaVersion.canonical => "1.0.0"
        | SchemaVersion.future => "2.0.0"
      let (u, a, fx, fy) := match orig.media with
        | MediaValue.legacyUrl link => (link, "", 0, 0)
        | MediaValue.structured link desc x y => (link, desc, x, y)
      ("rejected", s, isStructuredMedia orig.media, u, a, fx, fy, false)
  s!"\{\"id\": \"{id}\", \"status\": \"{status}\", \"schema\": \"{outSchema}\", \"isStructured\": {isStructured}, \"url\": \"{url}\", \"alt\": \"{alt}\", \"focalX\": {focalX}, \"focalY\": {focalY}, \"publishEligible\": {pubEligible}}"

def main : IO Unit := do
  let pricingVectors : List String := [
    formatPricingVector "fixed-less" 10000 5000 (Coupon.fixed 2500),
    formatPricingVector "fixed-exact" 5000 0 (Coupon.fixed 5000),
    formatPricingVector "fixed-overflow" 3000 1500 (Coupon.fixed 7500),
    formatPricingVector "fixed-zero" 0 2000 (Coupon.fixed 1000),
    formatPricingVector "percent-10" 12000 3000 (Coupon.percent 10),
    formatPricingVector "percent-25" 12000 0 (Coupon.percent 25),
    formatPricingVector "percent-33" 9999 2500 (Coupon.percent 33),
    formatPricingVector "percent-100" 15000 4000 (Coupon.percent 100),
    formatPricingVector "percent-150-clamp" 15000 0 (Coupon.percent 150),
    formatPricingVector "freeship" 8000 5000 (Coupon.freeShipping),
    formatPricingVector "bogo-standard" 20000 3000 (Coupon.bogo 4 1 1 4500),
    formatPricingVector "bogo-insufficient-qty" 10000 2000 (Coupon.bogo 2 2 1 5000),
    formatPricingVector "bogo-zero-cheapest" 5000 1500 (Coupon.bogo 4 1 1 0)
  ]
  let legacyDoc : ThemeDoc := { schema := SchemaVersion.legacy, media := MediaValue.legacyUrl "https://cdn.framique.com/artisan.jpg", valid := true }
  let canonicalDoc : ThemeDoc := { schema := SchemaVersion.canonical, media := MediaValue.structured "https://cdn.framique.com/artisan.jpg" "Handloom" 25 75, valid := true }
  let futureDoc : ThemeDoc := { schema := SchemaVersion.future, media := MediaValue.structured "https://cdn.framique.com/artisan.jpg" "Futuristic" 50 50, valid := true }
  let invalidDoc : ThemeDoc := { schema := SchemaVersion.canonical, media := MediaValue.structured "https://cdn.framique.com/artisan.jpg" "Invalid" 50 50, valid := false }
  let migratedLegacyDoc : ThemeDoc := { schema := SchemaVersion.canonical, media := MediaValue.structured "https://cdn.framique.com/artisan.jpg" "" 0 0, valid := true }

  let themeVectors : List String := [
    formatThemeVector "tv-legacy-migrate" legacyDoc,
    formatThemeVector "tv-canonical-preserve" canonicalDoc,
    formatThemeVector "tv-future-reject" futureDoc,
    formatThemeVector "tv-invalid-reject" invalidDoc,
    formatThemeVector "tv-idempotent" migratedLegacyDoc
  ]

  IO.println ("{\"pricing\": [" ++ String.intercalate ", " pricingVectors ++ "], \"theme\": [" ++ String.intercalate ", " themeVectors ++ "]}")
