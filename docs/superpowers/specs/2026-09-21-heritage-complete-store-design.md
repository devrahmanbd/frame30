# Clothing Heritage — Complete Store Theme (v2)

**Date:** 2026-09-21
**Status:** Approved by merchant — autonomous loop
**Builds on:** `2026-09-20-heritage-clothing-theme-design.md` (8/8 programs shipped)
**References:** shordindu.com.bd, yellowclothing.net, rang-bd.com, shelai.com.bd, aarong.com

## Audit baseline (verified in code, Sept 21)

Template coverage is structurally complete. Heritage defines all 8
`TemplateKey`s (`index, collection, product, page, blog, cart, checkout`
+ `search` via `withSearch`). PDP is deep: breadcrumb → price →
stock/delivery → size_selector → size_guide → fit_note → cart →
wishlist → delivery_promise → care_panel → cross-sell → rating_summary
→ review_list. Collection has facets + toolbar. Demo catalog holds 95
products. `wedding_shop` + `gift_finder` already wired.

Gaps vs. the five references (all verified against live screenshots):

| # | Gap | Reference proof |
|---|-----|-----------------|
| 1 | Homepage is collection-generic, not campaign-first | Yellow Puja '26 masthead, Rang শারদ উৎসব |
| 2 | No Bangla display typography as brand device | Yellow পূজা lettering, Rang রঙে রাঙা |
| 3 | No lookbook / shop-the-look / UGC sections in templates (widgets exist, unwired) | Yellow "Shop the look" |
| 4 | No occasion entry points on homepage (finders exist, buried) | Rang Family Series, couple sets |
| 5 | Demo catalog has 95 products but zero real imagery (monogram tiles only) | All five refs are photography-led |
| 6 | No performance / a11y gates ever run against the theme | — |
| 7 | No versioned v2 release through the publish pipeline | — |

Out of scope: cart/checkout redesign (shared routes, already working),
third-party theme directory, merchant-side AI merchandising.

## Slices

### Slice 1 — Campaign homepage
Rework heritage `index` main: campaign hero copy (festival-drop voice,
bilingual), occasion entry grid (wedding_shop + gift_finder surfaced,
not buried), lookbook section, UGC/testimonial band. Keep all section
ids stable (no merchant-breakage on upgrade).

### Slice 2 — Bangla display identity
Homepage + collection headers get Bangla display lines (Playfair stays
for Latin; Bangla renders in system Bangla stack — no webfont
without a licensed file). Announcement bar bilingual rotation.

### Slice 3 — Demo imagery direction
Photography brief per department (8 depts) + crop-safe placeholder
seeds so every demo product renders a distinct, art-directed tile
until merchants upload photos. No hotlinking, ever.

### Slice 4 — Gates
Lighthouse (mobile) on preview homepage + PDP: LCP ≤ 2.5s, CLS ≤ 0.1,
a11y ≥ 90. Zero console errors. COD test order on a live demo store.
`bun run test` theme suites green.

### Slice 5 — Release
Versioned `clothing-heritage` v2 through the publish pipeline
(draft → published → activation-pointer coherence + audit row).

## Acceptance
Every slice verified live with screenshots before the next begins.
Done = demo store running Heritage v2 end-to-end (home → collection
→ PDP → cart → checkout → order) with no lorem ipsum and gates green.

## Slice 3 — Photography brief (per department)

Until merchants upload photos, dept-tinted monogram tiles stand in
(`paletteForDept` + `/ph/<dept>/<slug>`). When shooting real catalog:

| Dept | Direction |
|------|-----------|
| Sarees (womens) | Full-drape on model, close-up weave macro, blouse-piece flat-lay |
| Panjabis (mens) | On-model festive + detail collar/button macro,off-white backdrop |
| Kids | Outdoor daylight, movement, matching family sets |
| Living & crafts | Styled interiors, hands-in-frame process shots |
| Jewelry | Macro on dark slate, on-model ear/neckline context |
| Shawls & winter | Texture drape, folded stack color stories |
| Wedding & festive | Campaign editorial, gold-hour light, full looks |
| Fabrics | Bolt + drape + weave macro triptych per textile |

Rules: 4:5 portrait master, fronts first, no filters that shift dye
lots, alt text = fabric + color + occasion.
