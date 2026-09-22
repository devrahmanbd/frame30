# Clothing Heritage — Aarong-parity rebuild (design)

> Spec for autonomous rebuild. Builds on `2026-09-21-heritage-complete-store-design.md`
> (8/8 shipped) and 5 live refs (aarong.com, yellowclothing.net, rang-bd.com,
> shordindu.com.bd, shelai.com.bd). User approved autonomous full redesign.

## 1. Audience / use / tone

- Audience: BD festive/family shoppers (Women/Men/Kids/Home), bilingual EN/BN.
- Job: find occasion wear fast (Puja/Eid/wedding), trust artisan quality, COD checkout.
- Tone: classic heritage editorial — warm paper, terracotta accent, sharp serif
  display, quiet cards. One risk only: hand-built Jamdani lattice as hero art
  (no stock, no photos exist, hotlinking banned).

## 2. Approaches considered

- A) Prop-fix only (fast, still looks empty) — rejected: homepage keeps holes.
- B) Aarong-parity rebuild (chosen): fix 6 renderer/contract mismatches, rewrite
  blueprint homepage to ref rhythm, enrich demo-mapped sections, fix preview
  duplication. No new infra, no route changes.
- C) Greenfield theme system — rejected: breaks builder-ast contracts + studio panels.

## 3. Reference DNA (what we steal, what we skip)

- Aarong: subbrand bar (Taaga/Herstory/Earth) + utility (stores/help/rewards) +
  sticky search header + inline menubar + full-bleed hero + category tiles +
  product rails + campaign story + brand spotlight + trust + footer payments.
- Yellow: Top Categories 8-tile grid, campaign story with Bengali display type.
- Rang: Explore-tiles (4 looks), Shop-By-Category (5), announcement marquee.
- Shordindu: SALE/NEW badges, quick-view/wishlist on cards (already in ProductCard).
- Shelai: Latest Catalogues rail, Shop-By-Brand (skip: no brand rows in demo catalog;
  use subbrand_spotlight with static props instead).
- Skip: perpetual marquees (>1/page), purple glows, 3-equal-cards rows, fake screenshots.

## 4. Homepage rhythm (index.main, DOM order)

1. hero_carousel (3 slides, festive first, caption eyebrow, lattice art)
2. trust_bar (4: dispatch/exchange/genuine/helpline)
3. department_grid (8 depts filled: Women/Men/Kids/Living/Jewelry/Taaga/Earth/Sale)
4. product_rail "New arrivals" (existing demo mapping)
5. collection_story Puja campaign (scrim, CTA)
6. lookbook "Shop the look" (4 tiles, offset)
7. textile_showcase (items[4]: Jamdani/Taant/Kantha/Silk)
8. wedding_shop (c1-3 filled) 9. gift_finder (o1-3 filled)
10. heritage_story (headline variant) 11. editorial_banner (headline variant)
12. testimonial_carousel (2) 13. rewards_club (tiers+CTA)
14. subbrand_spotlight (Taaga/Taaga Man/Herstory/Earth)
15. marquee_strip (items[], single) — footer: support/sitemap/payments(comma-separated)/newsletter/colophon.

## 5. Contracts (renderer dual-read, blueprint aligns)

- heritage_story: headline|heading, eyebrow|caption, image, body, ctaLabel|buttonLabel + ctaHref|buttonHref, founder_quote/name, layout.
- textile_showcase: headline|heading + products[]|items[] (image/title|name/subtitle).
- editorial_banner: headline|heading, subhead|body, cta_label|ctaLabel, cta_url|ctaHref, eyebrow, image, overlay.
- marquee_strip: items[]|label (split on ·/newline/comma).
- department_grid: departments[] (image/name|title/name_bn/count/href).
- payment_icons: split comma OR newline (fixes single-blob footer).
- utility_bar showLanguage=false in preview (StoreHeader owns language toggle).

## 6. Tokens

Keep `brand #1A1A1A / accent #C45D3E / surface #FAF8F5 / ink #2D2A26`
(placeholder.ts + demo seeds depend on them). Change only `radius 2px→4px`
(premium, less harsh). Dark set unchanged. Playfair Display justified:
genuine heritage/editorial brief (taste-skill serif exception).

## 7. Testing

TDD: failing test first for each dual-read + payment split + blueprint shape
(departments/items/testimonials non-empty, no empty headings on index).
Targeted vitest on touched files + tsc on touched files. No full suite locally
(CI owns it per progress.md D5). Preview via /theme-preview/clothing-heritage.
