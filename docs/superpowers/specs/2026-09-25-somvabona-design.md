# Somvabona Theme — Design Spec

**Status:** approved for implementation · **Date:** 2026-09-25
**Key:** `somvabona` (সম্ভাবনা, "possibility") — new standalone theme.
Songoskriti untouched.

## 1. Identity & scope

Everyday-ethnic franchise retail for Bangladesh: Cotton Culture's
comfort-first positioning and trust machinery fused with Biba's taxonomy
depth, in a BD skin (BDT-first, EN/BN inline, bKash/Nagad/Rocket/COD
badges, Eid/wedding occasion matrix). Prices, ratings, dispatch promises
and store presence lead; craft storytelling closes. No luxury-editorial
detours above the fold.

Out of scope for v1: PDP rebuild (existing PDP widgets carry it),
multi-currency, merchant photography (briefs + placeholder pipeline only).

## 2. Homepage rhythm (approved)

1. Announcement marquee — offer-led, bilingual
2. Hero carousel — every slide shops (festive / new-in / wedding)
3. Trust marquee (NEW) — looping proof strip, real numbers only
4. Category image tiles (Biba-style)
5. Price buckets (NEW — Under ৳999 / ৳1999 / ৳2999 tiles)
6. Product rails ×2 with urgency badges + ratings
7. Occasion matrix (NEW — collection × occasion grid)
8. Flagship outlets (franchise proof, names + hours, never invented addresses)
9. Craft story (heritage depth, below the fold)
10. Testimonials + footer (statement, newsletter, sitemap, payment badges, colophon)

## 3. New widget pack (all twins: catalog + controls + canvas + theme renderer + SSR)

- `trust_marquee` — looping badges (rating, dispatch, stores, helpline).
  Props: `items[]` repeater {icon, title, body}, speed. prefers-reduced-motion freezes it.
- `price_buckets` — tiles {label, maxPrice, href, image}. No fabricated prices; bucket bounds only.
- `occasion_matrix` — collection × occasion grid {occasions[] {label, href}, collections[]}.
- `urgency_rail` — new rail type reusing the product_rail data shape plus
  sale badges, % off (computed from real prices, never typed), stock hints
  ("Only few left" from real inventory flags), ratings row.
- `rating_stars` — display-only stars from real review aggregates; renders nothing with no data (never fake 4.8s).

## 4. Tokens & visual system

Terracotta heritage base (Songoskriti-adjacent but distinct key):
brand deep-maroon, warm-paper surface, ink text; comfortable density
(not airy); default type scale (not expressive); Inter body + Bangla stack
+ display serif reserved for campaign headlines only. Motion: subtle,
gated on prefers-reduced-motion throughout.

## 5. PDP / category patterns (reuse, no rebuild)

PDP: gallery + zoom, SKU, COD/secure badges, stock states, size-wise
pricing, delivery checker, complete-the-look, spec tables, seller info,
photo reviews with merchant replies, FAQ block. Category: breadcrumbs,
live counts, facets (price/size/color/fabric/fit/occasion), 6 sorts,
hover-swap cards, wishlist hearts, Quick View. All exist as widgets —
Somvabona composes, not rebuilds.

## 6. Imagery appendix

Briefs + placeholder/dept-art pipeline now; merchant photography swaps 1:1
later. Per-asset briefs (hero, 6 category tiles, lookbook, product cards):
composition, palette, crop-safe zones — tracked as follow-up TODOs, not
this build.

## 7. Testing & rollout

Contract tests per widget (catalog defaults, controls parity, SSR render,
fail-closed cases: no phone → no link, no ratings → no stars, empty buckets
omitted). Typecheck + lint + build gates. Progress in `progress.md`.
No live merchants on the key yet: ship direct to `main`, verify on the
theme-preview route with screenshots.
