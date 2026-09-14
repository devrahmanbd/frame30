# Storefront Catalog — depth spec (S2)

Status: Planning · Slice S2 (core store) · Reference: `plan.md` §3.3, `docs/03-storefront/README.md`
Design baseline: `00-meta/design-system.md` (semantic+component layers only; themes override)
Scope: public catalog arm — homepage, collections, product detail, search/facets, related products.
Out of scope (own specs): cart/checkout → `07-commerce` + `06-payments` (S3); customer accounts → S3; theme runtime/manifest → `04-builder` (S1 skeleton + S7).

---

## 1. Purpose

The catalog arm is the read-only public surface of the storefront: it serves
**published** products, variants, collections, and search to anonymous visitors
at `<merchant>.store.framique.com`, renderable by any theme runtime. Speed,
honesty (BDT + VAT explicit), and correctness of stock/availability are the
non-negotiables; every rule below exists to keep that surface secure and fast
without ever trusting the client or leaking unpublished data.

## 2. Design decisions

- **DD-1 — Anonymous access is RPC-only, slug-keyed.** `anon` gets NO direct
  table grants on products/variants/collections. Catalog RPCs take
  `p_merchant_slug` (URL-safe, unique per tenant) and resolve it to
  `merchant_id`; every query then applies `WHERE merchant_id = <resolved>` AND
  publication filters. This is the tenant-scope boundary for anonymous traffic —
  anon JWTs carry no `merchant_id` claim, so RLS alone cannot scope them.
- **DD-2 — Publication = flag + visibility window.** A product row is public iff
  `published = true` AND (`publish_at` IS NULL OR `publish_at <= now()`) AND
  (`unpublished_at` IS NULL OR `unpublished_at > now()`). Draft/preview rows are
  invisible to every catalog RPC, unconditionally. Merchants preview drafts via
  the builder's `?preview` path (edge + `staff_has`, S1) — never through catalog RPCs.
- **DD-3 — Search is one RPC, set-based.** `search_products` handles query,
  filters, facets, and keyset pagination server-side. Bangla fuzzy: normalized
  lowercase matching + `pg_trgm` similarity on name/description; Latin→Bangla
  transliteration table (e.g. "shari" → "saree") applied to the query. Facet
  counts computed in the same statement batch (no N+1 facet calls).
- **DD-4 — Pagination is keyset, never offset.** Cursor = (score, id) for search,
  (sort_key, id) for collections. Stable under concurrent inserts; no deep-page
  drift; cache-friendly.
- **DD-5 — Stock status is inventory-derived.** `stock_status` = `in_stock` |
  `low_stock` | `out_of_stock` computed from `inventory` (S2) + merchant low-stock
  threshold. Out-of-stock → hide add-to-cart + "Out of stock" label; low-stock badge
  only when merchant enables it (no dark patterns — badge is informational).
- **DD-6 — Variant switching on PDP is server-rendered data.** PDP returns all
  variants with price/stock; theme switches client-side with zero extra network
  calls. Prices in BDT (integer), tabular numerals; VAT note visible at
  checkout per `07-commerce`, not on PDP.
- **DD-7 — Related products v1 = same collection, merchant-order, limit N.**
  Co-purchase ranking arrives with analytics (S8); this spec pins the fallback.
- **DD-8 — Caching is layered and bounded.** Catalog RPC responses cache 60s at
  the edge (per README); assets via CDN with immutable hashes. Prices/stock may
  be ≤60s stale by design — acceptable; never cache >60s without merchant opt-in.
- **DD-9 — URLs are slug-based and stable.** `/{product-slug}` and
  `/{collection-slug}`; slugs unique per merchant. Canonical + OG meta are the
  theme's job (SEO tooling lands S6) but slugs are the contract — never expose
  numeric IDs in public URLs.
- **DD-10 — Events are fire-and-forget.** `page.viewed`, `product.viewed`,
  `catalog.search` emitted to the analytics pipeline (S8) with zero blocking of
  the render path. No event payload may contain PII (PII-minimal per AGENTS.md).

## 3. Data model & RLS contract

Existing merchant tables (products, product_variants, collections,
product_collections, product_tags, tags, inventory) remain the single source of
truth — no read-side projection table for catalog.

| Surface | Access |
|---|---|
| `products` / `product_variants` / `collections` / `product_collections` / `tags` | no anon grants; staff RLS as in `02-merchant`; catalog reads happen inside definer RPCs |
| `inventory` | never exposed; only aggregated `stock_status` flows out |
| `catalog_search_translit` (new, helper) | Latin→Bangla transliteration pairs; write-only via seed/migration, read inside `search_products` |
| catalog RPCs | `execute` granted to `anon` only |

Catalog RPCs are `security definer` with `set search_path = ''`; inside, every
statement re-applies the DD-2 publication predicate and the resolved
`merchant_id`. The tenant row must carry `storefront_enabled = true` (merchant
settings, S1) — otherwise catalog RPCs return 404 for the slug.

## 4. RPC surface

| RPC | Params | Returns |
|---|---|---|
| `list_collections(p_merchant_slug)` | slug | published collections (name, slug, image, product_count) |
| `get_collection(p_merchant_slug, p_collection_slug, p_cursor, p_page_size)` | slug, keyset | collection meta + product cards + `next_cursor` |
| `get_product_detail(p_merchant_slug, p_product_slug)` | slugs | product, all variants (price/stock), gallery, tags, related (DD-7) |
| `search_products(p_merchant_slug, p_query, p_collection_slug, p_price_min, p_price_max, p_tags, p_in_stock, p_cursor, p_page_size)` | filters | product cards + facet counts + `next_cursor` |
| `get_homepage(p_merchant_slug)` | slug | featured collections + featured products (merchant-picked order) |

All: `volatile`, max page_size 48, response shape fixed (theme-agnostic JSON;
themes map to their own templates). Errors: `not_found` (bad slug / storefront
disabled), `invalid_cursor`, `invalid_filter` — literal, testable codes.

## 5. Failure/recovery

- Edge down → cached HTML serves (README); catalog RPCs never crash the theme —
  theme falls back to cached page or maintenance template.
- RPC timeout → 503 + retry-after; theme shows retry state, never partial data.
- Invalid slug → 404 + "Store not found" fallback page.
- Search unavailability (trigram/translit error) → degrade to plain ILIKE
  prefix match, never blank results.

## 6. E2E coverage (feeds `docs/15-e2e` store_loop)

1. Anonymous browse: homepage → collection → PDP → variant switch — all published-only.
2. Draft/past-window product invisible to anon; visible via staff `?preview`.
3. Search "shari" (Latin) returns saree; Bangla query + filters + facets + keyset paging.
4. Out-of-stock hides add-to-cart; low-stock badge gated by merchant setting.
5. Disabled `storefront_enabled` → 404 on every catalog RPC.
6. No direct anon table access (probe: SELECT on products as anon → denied).
7. 60s edge cache hit serves correct page; price change propagates ≤60s.
8. A11y AA spot-check on PDP + search (contrast, alt, keyboard) — AAA is checkout/auth only.

## 7. Open items

- Transliteration table seeding strategy (full dictionary vs generated phonetic pairs).
- `get_homepage` featured ordering source of truth (merchant settings table vs collection flags).
- Co-purchase related products (S8) will supersede DD-7 — keep RPC shape additive.

---

### Design guidelines — catalog pages (all themes)

- Intent: editorial, product-forward, airy — a well-stocked BD boutique, not a template dump; speed is the aesthetic (mobile-first, mid-range Android).
- Key surfaces: hero, product grid card, PDP (image-first, sticky buy box), search/facets, collection page, cart stub bar.
- Palette: theme maps merchant brand → semantic; BD teal default; sale = Rickshaw Red badge; contrast auto-checked live (badge warns when brand fails).
- Typography: "Noto Sans Bengali" display on ≥1 surface; tabular numerals for BDT; fluid `clamp()` scale; line-height ≥1.6 (Bangla conjuncts).
- Density: storefront-airy — 24/32/48px sections; cards radius xl/2xl; touch targets ≥44px; sticky mobile cart bar; bottom-sheet filters on mobile.
- Motion: hero/product hover lift 200ms (transform only); page transition 240ms fade+rise; reduced-motion → opacity-only.
- A11y: skip-link, keyboard carousel, `lang="bn"`, alt text, focus-visible rings, contrast 4.5:1, ARIA live for cart updates.
- Performance: LCP < 2.5s mid-Android (hero ≤250KB preloaded), JS ≤100KB gz theme budget, no render-blocking third-party, aspect-ratio boxes → CLS < 0.1.
- Anti-slop: price always in BDT with VAT line at checkout; COD/MFS/BNPL badges first-class; Bangla display numerals on hero stats; stock labels in Bangla, never color-only.
