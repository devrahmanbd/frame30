# Biba.in Competitive Audit — What They Have (Sept 25, 2026)

> **Method**: subagent sweep of 18 live pages on `https://www.biba.in/` (ROW locale, `/row`).
> Static HTML + markdown fetch (no browser). Effects marked *(inferred)* are strongly
> implied by library + markup; everything else was observed directly. Nothing invented.
> **Why this report exists**: our storefront reads as static HTML+CSS — no transitions,
> hover choreography, marquee, or gradients. This is the gap inventory.

## 1. Page inventory (18 visited, 0 blocked)

| # | URL | Purpose |
|---|-----|---------|
| 1 | `/` → `/row` | Homepage: brand hub + Einstein recommendation rails |
| 2 | `/row/kurtas-and-tops/kurtas/` | Listing: Kurtas, 670 products, filter/sort lab |
| 3 | `/row/salwar-kameez/` | Listing: Salwar Kameez, 1,462 products, 8-tile subcategory nav |
| 4 | `/row/collections/saree/` | Listing: Sarees (pre-draped), 10 products, premium pricing |
| 5 | `/row/salwar-kameez/lehenga-and-skirts-sets/` | Listing: Lehengas, 42 products, $155–$888 |
| 6 | `/row/sale/` | Clearance, 2,579 products, deepest facet set |
| 7 | `/row/new-arrival/` | New arrivals AW'26, 434 products |
| 8 | `/row/collections/wedding/` | Wedding Splendor edit, 574 products |
| 9 | `/row/off-white-cotton-…/IKT21579SS26OWHT.html` | PDP: kurta, $77.70 (30% off) |
| 10 | `/row/cart/` | Cart (empty state observed) |
| 11 | `/row/checkout/?stage=customer` | 3-step checkout: Cart → Address → Payment |
| 12 | `/row/login/` | OTP-first auth + password + signup + reset modals |
| 13 | `/row/wishlist/` | Gated wishlist |
| 14 | `/row/contact-us/` | Contact + form + corporate block |
| 15 | `/row/about-us.html` | Editorial brand story |
| 16 | `/row/stores/?showMap=true` | Store locator (**map broken** — literal "obtain a google maps api key" string) |
| 17 | `/row/shipping-policy.html` | Per-region shipping rates + tariff disclaimers |
| 18 | `/row/return-policy.html` | No-intl-returns, cancel-before-packed policy |

Gaps in Biba's own IA: no standalone size-guide page (PDP modal only), no countdown/lookbook/video page.

## 2. What makes Biba feel alive (observed patterns)

**Product card hover system (strongest pattern, every listing).** Each tile ships 6–8
angles; hover crossfades front → back/detail, reveals a Quick View button (modal with
size/qty/ATC, no page leave), wishlist heart fills + header count updates via AJAX.
Badges: `Sale` ribbon, `Online Exclusive`, `Only Few Left`.

**Transparent → solid sticky header.** `show-fixed-transparent-header`: transparent over
hero, gains solid background + fixed position on scroll. Persistent nav without losing
hero immersion.

**Mega-menu as merchandising.** Hover opens full-width panel: Category/Collection
columns + right-side campaign photo (rotated nav promos like `nav-kurta-sept17.jpg`).
AW'26/Sale links are crimson `#a72f30` pills.

**Rails everywhere.** "Most Loved", "Recommended For You" (Salesforce Einstein),
"Recently Viewed", "SHOP BY COLOR" swatch tiles — horizontal Slick rails with arrows,
lazy-image fade-in on scroll into view.

**PDP gallery.** Left vertical thumb strip (7 thumbs) + high-priority main stage,
pinch-zoom on mobile, size pills with per-size stock (`32/S (1 Left)`), size-guide
modal, sticky duplicate ATC block on mobile, accordions (details/specs/wash-care/
delivery), trust badges (24h dispatch, free-ship threshold, WhatsApp `wa.me` chat).

**Cart micro-interactions.** AJAX minicart popover + header badge increment on every
Add to Bag (no reload); delete-confirm, address add/edit, coupon modals.

**Auth without friction.** OTP-first (4-box + resend + validation states), password
fallback, guest-checkout escape hatch, inline checkout errors, payment tabs with
per-method failure copy.

**Search that helps.** Typeahead suggestions endpoint, clear + voice buttons, color
swatch tiles as visual facet entry.

**Scarcity microcopy instead of animation.** `Only Few Left`, per-size `1 Left`,
strikethrough pricing — urgency is textual; no timers, no flashing deals.

## 3. What Biba does NOT have (our opening)

No marquee/ticker (single-message dismissible promo bar only). No gradients or
glassmorphism (flat white/black/crimson `#a72f30`). No cart fly-to animation, no
toast system, no skeleton loaders (1px-gif lazy placeholders), no countdown timers,
no PDP video/360/spin (8 stills max even at $888), no shoppable hotspots or lookbook
storytelling, broken store-locator map.

## 4. Stack + style tokens (observed)

Salesforce Commerce Cloud (SFRA); jQuery 3.3.1 + Slick 1.8.1 + lazysizes;
Einstein/CQuotient recommendations; pinch-zoom 2.3.5 (PDP). Fonts: WorkSans (UI),
CrimsonPro (editorial serif), Montserrat (headings/promo), thin-line icomoon commerce
icons + FontAwesome utilities. Imagery: 100% on-model photography, portrait 2:3
(`sw=650&sh=975` tiles, `sw=900&sh=1350` PDP), 6–8 angles per product, studio +
occasional outdoor backdrops. No flat-lay, no ghost-mannequin.

## 5. Top 10 to steal, ranked by wow-factor

1. Card hover image-swap (6–8 angles, crossfade) — biggest alive-signal, zero video cost.
2. Hover Quick View modal — shop without leaving the grid.
3. Personalized rails (Most Loved / Recommended / Recently Viewed).
4. Transparent-to-solid sticky header.
5. Mega-menu with editorial promo image per menu.
6. PDP thumb-rail + pinch-zoom gallery with sticky mobile ATC.
7. Scarcity microcopy system (Only Few Left, per-size counts, badges).
8. OTP-first login + guest-checkout escape hatch.
9. Minicart popover + badge (AJAX, no reload).
10. SHOP BY COLOR swatch tiles as playful facet entry.
