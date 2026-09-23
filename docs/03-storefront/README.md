# 03 — Storefront

Status: Planning · Slices S2/S3 · Reference: `/plan.md` §3.3 (storefront), 6 (checkout)
Design baseline: `00-meta/design-system.md` (themes override semantic+component layers only)
Depth specs: `catalog.md` (S2 catalog arm — anon RPC surface, search, stock, E2E contract) · `checkout.md` (S3 checkout arm — gateway API, idempotent confirm, COD/MFS, E2E contract) · `accounts.md` (S3 accounts arm — OTP identity, consent hub, address book, wishlist, GDPR erasure, E2E contract) · `i18n.md` (S2/S3 arm — bn/en catalogs, fallback clock, translation surfaces, E2E contract) · `product-reviews.md` (S2/S3 arm — 1–5 star PDP reviews, verified-purchase gate, moderation queue, server-side aggregates, E2E contract)

---

## Purpose

Headless, runtime-agnostic storefront: themes render at `<merchant>.store.framique.com` with their own runtime (framework-free sandbox), not TanStack SSR. Includes catalog, search, cart/checkout skeleton, customer accounts.

## Pages & features

- **Catalog**: homepage, collections, product detail (gallery, variants, price, VAT note, MFS/COD badges), search results (Bangla fuzzy, facets, price/stock), related products.
- **Cart & checkout skeleton**: cart drawer (sticky mobile bar), checkout page with COD + MFS methods (details in 06), order confirmation, tracking page (courier timeline).
- **Customer accounts**: register/login (OTP email/SMS + password), address book, orders, reorder, wishlist.
- **Theme runtime**: theme manifest (`theme.yaml`: tokens, pages, assets), JS sandbox (iframe/worker), server renderer, preview mode (`?preview` for builder).

## Data flow

Theme runtime → PostgREST (public reads via RLS `anon` only for published) → render → cache (60s edge) → OTel. Checkout writes go through Go gateway + order service.

## State machine (cart/checkout)

`cart → checkout → payment_selected → payment_pending → confirmed/paid` with `cancelled` on abandon; resumable via cart persistence (Redis + DB).

## Events

`page.viewed`, `product.viewed`, `cart.updated`, `checkout.started`, `order.placed`, `order.paid`, `order.cod_confirmed`.

## Failure/recovery

- Edge down → cached HTML serves; theme crash → fallback template with maintenance notice.
- Payment MFS timeout → checkout shows "Payment processing" and retries via status poll (see 06).

---

### Design guidelines — storefront pages (all themes)

- Intent: editorial, product-forward, airy — like a well-stocked BD boutique, not a template dump. Speed is the aesthetic (mobile-first, mid-range Android).
- Key surfaces: hero, product grid card, product detail (image-first, sticky buy box), search, cart drawer, checkout, order confirmation, tracking timeline, account.
- Palette: theme maps merchant brand → semantic; BD teal default; sale uses Rickshaw Red badge; contrast auto-checked live (badge warns if merchant brand fails).
- Typography: Bangla display font ("Noto Sans Bengali") on at least one display surface per theme; tabular numerals for BDT; fluid `clamp()` scale; line-height ≥1.6.
- Density: storefront-airy — 24/32/48px sections; cards radius xl/2xl; touch targets ≥44px; sticky mobile cart bar; bottom-sheet on mobile for filters.
- Motion: hero/product hover lift 200ms (transform only); page transition 240ms fade+rise; reduced-motion → opacity-only; image lazy-load + srcset + WebP/AVIF; CLS < 0.1 via aspect-ratio.
- A11y: skip-link, keyboard carousel, `lang="bn"`, alt text, focus-visible rings, contrast 4.5:1, ARIA live for cart.
- Performance: LCP < 2.5s on mid Android (hero ≤250KB preloaded), JS ≤100KB gz theme budget, no render-blocking third-party.
- Anti-slop: distinctive — price always in BDT with VAT line visible at checkout; COD/MFS/BNPL badges as first-class UI; tracking page styled like an SMS thread (BD-native courier UX); Bangla display numerals on hero stats.

---

## Strict guardrails

### Money & orders

- Prices render in BDT with VAT line visible at checkout; no client-side arithmetic decides totals/discounts — display and confirm with server-validated values only.
- Storefront keeps no order state of its own: orders live in the order machine (03/06); this surface only renders its timeline.

### Data & tenancy

- Public reads go through RLS `anon` (published only); drafts/previews never leak to visitors keys — preview mode is gated.
- Even store front cookies/tracking are minimal; consent-managed per 05 before any cross-store data use.

### State transitions

- Cart/checkout machine owned here: `cart → checkout → payment_selected → payment_pending → confirmed/paid` (`cancelled` on abandon), resumable via Redis+DB cart persistence.

### Vendors

- Theme runtime is the sandbox boundary; its registry (manifest + assets) is validated at build, never executed unvalidated.
- Cached HTML (60s edge TTL) keeps pages serving if the runtime or API blips; fallback template with maintenance notice when theme crashes.

### Consent & privacy

- Analytics events (`page.viewed`, `product.viewed`, `cart.updated`) are PII-minimal; cart resumption is cross-device only for signed-in, consented customer.

### Accessibility & performance

- LCP < 2.5s mid-Android (hero ≤ 250KB preloaded), JS ≤ 100KB gz theme budget, CLS < 0.1 ∩ aspect-ratio images, `prefers-reduced-motion` → opacity-only.
- A11y: skip-link, keyboard carousel, `lang="bn"`, 4.5:1 contrast AA (AAA on checkout), ARIA live for cart.

### Failure & recovery

- MFS timeout → "Payment processing" + status poll; edge down → cached HTML; theme crash → maintained fallback.
- Idempotency for cart writes (client keys) so a refresh never duplicates items.

### Testing gates

- store_loop is the critical E2E: browses, adds, BOGO/order, courier, delivered/refund — must pass on any storefront change; preview-mode + fallback-template paths covered in tests.

### Audit verdict — checklist

Follow-up record for `00-meta/audit-verdict.md`; every line below is verifiable in this plan's own sections or the plans it references.

- **Sections audited**: money (BDT-only display), Data & tenancy, State transitions, Vendors, Consent & privacy, Accessibility & performance, Failure & recovery, Testing gates.
- **i18n**: v0 ships `bn | en` for every storefront string (`i18n.md` §5/§6); a third locale is an explicit v0 non-goal — see `i18n.md` §10.
- **Cart state machine quoted**: `cart → checkout → payment_selected → payment_pending → confirmed/paid` (`cancelled` on abandon), resumable via Redis+DB cart persistence.
- **RLS**: public reads go through `anon` (published only); drafts/previews never leak — preview mode is gated.
- **Edge cache**: cached HTML 60s edge TTL keeps pages serving on runtime/API blips; fallback template with maintenance notice on theme crash.
- **A11y contract**: LCP < 2.5s mid-Android, JS ≤ 100KB gz theme, CLS < 0.1, skip-link, `lang="bn"`, 4.5:1 contrast AA (AAA on checkout), ARIA live cart.
- **Owners**: storefront for TR-8 serving rules + cart machine; 03/06 for the order machine; 04-builder for theme runtime validation.
