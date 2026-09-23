# Rupaboti Beauty Store — Design (beautyproductsbd-style storefront)

Date: 2026-09-19. Approach: theme-first (A). Status: store + catalog + theme
live; homepage composition wiring is implementation scope.

## 1. Objective

A beauty store on Framique that looks and shops like beautyproductsbd.com:
bilingual EN/বাং header with search/account/wishlist/cart, category mega-menu
(Skin Care, Makeup, Combos, Ingredients, Concern), hero sliders, New Product
grid with discount badges, offer banners, trust strip, campaign countdown,
combos, tabbed featured products, category tiles, order tracking + login.

## 2. Store + demo catalog (DONE, live)

- Merchant `Rupaboti Beauty` (slug `rupaboti-beauty`, id b0ba0000…), BDT, COD
  on, launch plan trial. Owner: flamedev7.
- 5 top categories + 22 subcategories, 5 brands, 24 active products with BDT
  price + compare-at + stock 20–100, one Default variant each.
- Seed: `supabase/migrations/20260919100000_rupaboti_demo_catalog.sql`
  (idempotent fixed-UUID upserts, Frame19 pattern). Applied live.

## 3. Theme install + preview (DONE, live)

- Rupaboti preset (`theme-presets.ts`) installed via the dashboard catalogue
  and activated on the new merchant, all in-browser.
- Live storefront: `/store/rupaboti-beauty` renders 24/24 priced, in-stock,
  with category chips, search, EN/বাং, cart. Works because the public
  variants policy repair is live.
- Multi-tenant permission fix shipped alongside (`merchant-scope.server.ts`):
  the dashboard switcher mirrors into a verified cookie; actor + scope
  resolve the active store. Creating the second store had broken every
  merchant-blind permission gate — now covered by tests.

## 4. Widgets (built, tested, committed ecd6c0c)

Existing registry already covered: hero, banner, countdown, tabs,
product_grid/rails, newsletter, quiz, bundle_offer, quick_view, mega_menu,
trust_bar, rank_list. Built new in `beauty-home.tsx`: `discount_badge`
(TK OFF + %), `combo_card` (server-quoted fixed packs), `concern_rail`,
`ingredient_rail` (taxonomy-bound, Latin names glossed not translated).
12/12 tests; gates green; Rupaboti tokens (ivory/ink/rose-clay, grotesk +
Noto Sans Bengali), sentence case, no generic tells, reduced-motion safe.

## 5. Homepage composition (implementation scope, NOT started)

Wire the reference sections in the builder using §4 widgets + existing ones:
announcement bar, header chrome, mega menu, 3 hero slides, New Product grid
(discount badges), offer banners, trust strip, campaign countdown block,
combos, tabbed featured products, category tiles, footer. Then publish and
screenshot-verify each section against the reference.

## 6. Verification

- Catalog counts via live SELECT (27 cats / 24 products / 24 variants).
- In-browser: install → activate → storefront renders priced + stocked.
- Tests: beauty-home 12/12, registry/metadata gates, tsc clean on touched
  files. Full suite: only pre-existing env failures remain.

## 7. Open items / non-goals

- No real brand assets or scraped images (demo names/prices only).
- No custom domain for the beauty store yet (owner call).
- No checkout changes needed (proven tonight on the clothing store).
- `schema:check` gate still broken; column-rename migrations deferred.
