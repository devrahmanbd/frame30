# Storefront read runtime (Tier 1.5)

Normative for storefront search, tenant pages, shopper accounts and crawler surfaces.

## Boundaries

| Surface | Boundary | Tenancy | Identity |
|---|---|---|---|
| `/store/$slug/search` | `searchStorefrontFn` → `storefront_search` RPC | slug in URL | none (public) |
| `/store/$slug/pages/$pageSlug` | `getStorePageFn` (SSR loader) | slug in URL | none (public) |
| `/store/$slug/account` | `account*Fn` with `requireSupabaseAuth` | slug in URL | `auth.uid()` |
| `/store/$slug/sitemap.xml`, `/robots.txt` | server route handlers | slug in URL | none (public) |
| `/admin/pages` | `pagesDeskFn`, `savePageFn`, `archivePageFn` | `merchant_id` + RLS | staff session |

The storefront slug is the only tenancy source. No surface accepts a
`merchant_id` from the client except the admin desk, where RLS re-checks it.

## Search

- `products.search_doc` is a `tsvector` maintained by `products_search_doc_refresh`
  (title, description, tags). A trigger, not a generated column: `array_to_string`
  is `STABLE`, not `IMMUTABLE`.
- GIN on `search_doc`; trigram GIN on `title` for partial-word matching.
- All filtering, sorting, paging and facet counts happen in `storefront_search`.
  The client cannot widen the result set: sorts are whitelisted, page size is
  fixed at `PAGE_SIZE`, and `page` is clamped.
- Prices are integer minor units end to end. The filter inputs accept major
  units for humans and convert once, with `Math.round`, before the URL is built.
- Rate limit `storefront.search` (90/min per store per hashed IP); 20s cache with
  40s stale-while-revalidate; `framique_storefront_search_total` and
  `framique_storefront_search_ms` metrics. Zero-result terms are logged without
  any shopper identifier.
- Result pages are `noindex,follow` — they are not canonical landing pages.

## Tenant pages

- `storefront_pages` is soft-deleted and RLS-scoped; the public policy exposes a
  row only when `is_published` and `deleted_at IS NULL`.
- Markdown is rendered server-side by `renderPageMarkdown`, which escapes `& < >`
  first and then emits only `h2`–`h4`, `p`, `ul`/`li`, `a`, `strong`, `em`.
  No raw HTML passes through, so tenant content cannot script the storefront.
- Per-page `robots` is authored by the merchant and copied into the route `head()`.
  A `noindex` page is also excluded from the sitemap.

## Shopper accounts

- Every account read resolves through a security-definer routine keyed on
  `auth.uid()`; `customer_order_detail` returns `null` for another customer's
  order rather than a partial row.
- Writes are rate limited on `storefront.account` (60/min per shopper per store).
- Consent toggles write the audited consent rows; opt-out is honored everywhere.
- The dashboard is `noindex,nofollow` and renders nothing before a session.

## Crawler surfaces

- `/robots.txt` disallows `/admin`, `/root`, `/auth`, `/checkout`, `/api/` and
  `/unsubscribe`, then advertises the global sitemap plus one sitemap per
  published store.
- `/store/$slug/sitemap.xml` 404s for unknown or unpublished stores and lists
  only that tenant's paths.

## Verification

`bun run e2e:storefront` (`storefront_loop`) covers search results and empty
state, `noindex` on search and account, float-free money, cross-tenant slug
isolation, draft-page 404, sitemap tenancy, and robots policy. It is part of
`e2e:critical`.
