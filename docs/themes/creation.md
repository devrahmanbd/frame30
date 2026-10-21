# Creating a Framique theme (author guide)

Last verified: 2026-10-22 @ 0a794b549315

Verification scope (2026-10-22): the template-key list, the route semantics, the
variant vocabulary, the route-owned render contexts and the package rules were
read against the shipped code at `0a794b549315`; `node scripts/doc-gate.mjs`
reports 0 findings, and the repository's own test suite passes apart from
three pre-existing, environment-bound failures recorded in the phase-3 evidence
record. Line pins are working-tree lines: the pins this pass wrote or
corrected point at the declaration that owns the block, and older pins
elsewhere in this document are best-effort pointers that may have drifted
with the code.

This is the end-to-end guide for shipping a complete storefront theme —
the single authoring reference for tokens, skins, homepage builders,
`skins.css`, preview sources, the unified widget registry, and the theme
test suite. It describes only what exists in this repo — every section
links to the source it came from.
Runtime theory (token channel, preview engine, persist shape, twin parity)
lives in [the builder runtime guide](../04-builder/README.md); the
integrator contract (server functions, tables, registry pipeline, error
codes) lives in [the theme SDK](./sdk.md); the third-party package gates
live in [the theme package spec](./packages.md). This guide links to those
references instead of restating them.

The registry sections (§14–§15) define how themes dress shared widgets,
register theme-owned widgets, and reach productive graphs; §15 summarises
the Songoskriti reference port, mapped row-by-row in
[the Songoskriti port map](./songoskriti-port-map.md).

## 1. What a complete theme is (definition of done)

A complete theme ships all 13 areas below. Treat this list as acceptance
criteria: a theme missing any area is incomplete and must not be submitted
for catalogue review.

| #   | Area                 | What "done" means                                                                                                                                                                                          | Where it lives                                                                                                                                             |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Layout               | `header` / `main` / `footer` slot arrays on every template; responsive `bp` overrides per section                                                                                                          | `src/lib/builder-ast.ts:523`, `src/lib/builder-ast.ts:412`                                                                                                 |
| 2   | Design system        | Full `ThemeTokens` set incl. light + designed `dark` set, `globals`, font pairing                                                                                                                          | `src/lib/builder-ast.ts:7144`, `src/lib/theme-globals.ts:32-48`                                                                                            |
| 3   | Homepage             | `index` template with hero, merchandising, trust and footer composition                                                                                                                                    | `src/lib/themes/songoskriti/homepage.ts:23`, `src/lib/themes/somvabona/homepage.ts:22`                                                                     |
| 4   | Product pages        | `product` template: media, price, variant/size, buy box, delivery, reviews/Q&A, related                                                                                                                    | `src/lib/themes/songoskriti/preview.ts` (`product` case), `src/lib/builder-ast.ts` PDP widgets                                                             |
| 5   | Collection pages     | `collection` template: category header, facets, toolbar, grid, pagination, empty state                                                                                                                     | `src/lib/themes/songoskriti/preview.ts` (`collection` case), `src/lib/builder-ast.ts` listing widgets                                                      |
| 6   | Posts / blog         | `blog` template: `blog_terms` + `blog_archive` + `blog_pager` + newsletter                                                                                                                                 | `src/lib/themes/songoskriti/preview.ts` (`blog` case), per-theme article CSS in `skins.css`                                                                |
| 7   | Menus                | Header nav (`mega_menu`, `nav_menu`, `search_command`, `account_cart`) driven by taxonomy/menu data                                                                                                        | `src/lib/builder-ast.ts:2139-2283`, `src/lib/builder-ast.ts:4755`, `src/lib/studio/catalog.ts:1396-1404`                                                   |
| 8   | Footer               | `footer_sitemap`, `payment_icons`, `social_strip`/`support_strip`, about `rich_text`                                                                                                                       | `src/lib/themes/songoskriti/footer.ts:160`, shared copy in `src/lib/footer-copy.ts`                                                                        |
| 9   | Widgets with presets | Every widget the theme renders has catalogue defaults and bilingual props filled at build                                                                                                                  | `src/lib/theme-section.ts:44-68`, `src/lib/studio/catalog.ts:115-120`                                                                                      |
| 10  | Forms                | Contact (`form`), newsletter, search, quiz/consult/trade-in submittable patterns (see §5)                                                                                                                  | `src/lib/studio/catalog.ts:1388-1395`, `src/lib/studio/catalog.ts:1405-1412`, `src/lib/contact.functions.ts:4-24`, `src/lib/newsletter.functions.ts:13-50` |
| 11  | Sign in              | Storefront account entry: header `account_cart` link + `src/routes/store.$slug.account.tsx` + `src/routes/account.tsx`; there is **no** sign-in theme template — the theme's job is the link, not the form | `src/lib/studio/catalog.ts:1196-1203`, `src/routes/store.$slug.account.tsx`, `src/routes/account.tsx`                                                      |
| 12  | Sign up              | Same surface as sign in (merchant console auth at `src/routes/auth.tsx`); theme must not invent its own credential form                                                                                    | `src/routes/auth.tsx`                                                                                                                                      |
| 13  | Content archive      | `archive` template: the category header, the blog pack (`blog_terms` + `blog_archive` + `blog_pager`), the pager and the empty state — the three supported kinds are a category, a tag and an author       | `src/lib/themes/songoskriti/preview.ts` (`archive` case), `src/lib/template-variants.ts`, `src/lib/archive-context.ts`                                     |

Notes on areas 11–12: the template keys are fixed at
`src/lib/builder-ast.ts:46-61` — **ten** of them (`index`, `product`,
`collection`, `account`, `page`, `blog`, `cart`, `checkout`, `search`,
`archive`) — plus the closed **variant** vocabulary (§2.3). There is no
`signin`/`signup` template key. A theme satisfies 11–12 by wiring the header
account entry and by not breaking the account/checkout routes — not by
authoring auth markup.

Account template (areas 11–12 revision): the `account` template key exists at
`src/lib/builder-ast.ts:46-61` with `main`-slot content and a route-supplied
`<h1>` (same treatment as `collection`); its widget scope and preset bodies
land separately.

## 2. Anatomy

### 2.1 Tokens (light / dark, globals)

The token shape is `ThemeTokens` parsed by `parseTokens`
(`src/lib/builder-ast.ts:7211`). Defaults live at
`src/lib/builder-ast.ts:6329-6351`:

```ts
// src/lib/builder-ast.ts:6329-6351
export const DEFAULT_TOKENS: ThemeTokens = {
  brand: "#0F766E",
  accent: "#0D9488",
  surface: "#FFFFFF",
  ink: "#0F172A",
  radius: "8px",
  fontDisplay: "Noto Sans Bengali",
  fontBody: "Noto Sans Bengali",
  container: "1200px",
  density: "comfortable", // "dense" | "airy" | "comfortable"
  typeScale: "default", // "compact" | "expressive" | "default"
  spaceUnit: "16px",
  shadow: "soft", // "none" | "soft" | "lifted"
  motion: "subtle", // "none" | "subtle" | "lively"
  digits: "latin", // "latin" | "bengali"
  locale: "en", // "en" | "bn"
  currencyDisplay: "symbol", // "symbol" | "code"
  fontPairing: "bengali-classic",
  dark: null, // or { brand, accent, surface, ink }
  globals: DEFAULT_GLOBALS,
  timezone: DEFAULT_MERCHANT_TIMEZONE,
  allowCustomerTimezone: false,
};
```

Designed dark sets are plain objects on `tokens.dark`, e.g. Somvabona
(`src/lib/themes/somvabona/tokens.ts:32-37`) — the reference dark set.
Songoskriti is light-only (`dark: null`). Globals are the merchant-editable
palette: `DEFAULT_GLOBALS` (`src/lib/theme-globals.ts:32-48`) seeds four
colors + two fonts; bindings are stored as `var(--fq-g-<id>)`
(`src/lib/theme-globals.ts:50-63`).

`ThemeTokens` carries 19 required keys plus 2 optional ones (`timezone`,
`allowCustomerTimezone`) (`src/lib/builder-ast.ts:7089`). The two
shipped themes lock the values below — copy one column verbatim as the
starting point, then change brand/accent/surface/ink plus layout knobs:

| Token             | Songoskriti (`src/lib/themes/songoskriti/tokens.ts:9`) | Somvabona (`src/lib/themes/somvabona/tokens.ts:14`)                                          |
| ----------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `brand`           | `#1a1a1a`                                              | `#7C2A1A`                                                                                    |
| `accent`          | `#8B4513`                                              | `#B95A38`                                                                                    |
| `surface`         | `#faf9f7`                                              | `#FBF6EE`                                                                                    |
| `ink`             | `#1a1a1a`                                              | `#2E2620`                                                                                    |
| `radius`          | `0px` (sharp, fashion-editorial)                       | `4px`                                                                                        |
| `fontDisplay`     | `Playfair Display`                                     | `Playfair Display` (campaign headlines only)                                                 |
| `fontBody`        | `Inter`                                                | `Inter`                                                                                      |
| `container`       | `1320px`                                               | `1320px`                                                                                     |
| `density`         | `comfortable`                                          | `comfortable`                                                                                |
| `typeScale`       | `default`                                              | `default`                                                                                    |
| `spaceUnit`       | `16px`                                                 | `16px`                                                                                       |
| `shadow`          | `soft`                                                 | `soft`                                                                                       |
| `motion`          | `subtle`                                               | `subtle`                                                                                     |
| `digits`          | `latin`                                                | `latin`                                                                                      |
| `locale`          | `en`                                                   | `en`                                                                                         |
| `currencyDisplay` | `symbol`                                               | `symbol`                                                                                     |
| `fontPairing`     | `editorial-serif`                                      | `editorial-serif`                                                                            |
| `dark`            | `null` (light-only)                                    | `{ brand, accent, surface, ink }` (designed set, `src/lib/themes/somvabona/tokens.ts:32-37`) |
| `globals`         | `DEFAULT_GLOBALS`                                      | `DEFAULT_GLOBALS`                                                                            |

Both themes keep bilingual EN/BN inline props on every user-facing string
and a BDT-first money display (symbol, Latin digits). How published tokens
reach the storefront as CSS variables is runtime theory — see [the builder
token reference](../04-builder/README.md).

### 2.2 Templates per key

`TEMPLATE_KEYS` (`src/lib/builder-ast.ts:46-61`) — **ten** keys:

```ts
export const TEMPLATE_KEYS = [
  "index",
  "product",
  "collection",
  "account",
  "page",
  "blog",
  "cart",
  "checkout",
  "search",
  "archive",
] as const;
```

Each template is a `ThemeAst` (`src/lib/builder-ast.ts:512`):
`{ header: Section[], main: Section[], footer: Section[] }`.

**The route semantics.** A template key names a _surface_, and the storefront
route that serves the surface owns the data on it. The theme authors the
**frame**; the route owns the **content**.

| key          | the surface                 | the route that serves it                                                 | the route owns                                              |
| ------------ | --------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `index`      | the storefront landing page | `/store/$slug`                                                           | the catalogue blocks                                        |
| `product`    | the product detail (PDP)    | `/store/$slug/p/$productSlug`                                            | the product, its variants, its price                        |
| `collection` | the product collection      | `/store/$slug/c/$collectionSlug`                                         | the product grid, the facets, the paging                    |
| `search`     | the search results          | `/store/$slug/search`                                                    | the query, the result block, the limits                     |
| `cart`       | the cart                    | `/store/$slug/cart`                                                      | the lines, the summary, the drawer, the trail, the rails    |
| `checkout`   | the checkout                | `/store/$slug/checkout`                                                  | the form, the server quote, the stock hold, the order write |
| `account`    | the shopper's account       | `/store/$slug/account`                                                   | the session, the overview, the tab state                    |
| `page`       | a merchant's CMS page       | `/store/$slug/pages/$pageSlug`                                           | the page record and its body                                |
| `blog`       | the blog                    | `/store/$slug/blog` (listing), `/store/$slug/blog/$articleSlug` (detail) | the articles, the article body                              |
| `archive`    | the content archive         | `/blog/category/$slug`, `/blog/tag/$slug`, `/blog/author/$slug`          | the term, the records, the facets, the paging               |

Two rules make the table hold:

1. **A route may not silently substitute another template.** The template
   resolution inspects the match it got and accepts only `"suffix"` or
   `"base"` (`resolveVariantAst`, `src/lib/template-variants.ts:280-294`); a
   route that finds no composition renders its **own** platform surface — never
   the homepage.
2. **A route that cannot name a store renders the platform's own surface.**
   The three content-archive routes carry no store slug (a term carries a
   `merchant_id`, not a slug, and the author archive is not merchant-scoped at
   all), so they cannot resolve a theme and they keep the platform's grid.
   The `archive` key's storefront render path is therefore the editor and the
   theme preview host — both merchant-scoped by construction — until the
   platform grows a merchant-scoped taxonomy route. This is a **deferral**,
   not a shortcut: the key is real, it is authorable, it is lintable and it
   is publishable.

**The variant vocabulary.** Two of the ten keys own _variants_ — closed
variants of a key, so one key can carry two genuinely different
compositions. The table is `TEMPLATE_VARIANTS`
(`src/lib/template-variants.ts:55-58`) and it is the **only** place a variant
may be added:

```ts
export const TEMPLATE_VARIANTS = {
  blog: ["listing", "article"],
  archive: ["category", "tag", "author"],
} as const;
```

| base      | variant            | the surface it distinguishes                                  |
| --------- | ------------------ | ------------------------------------------------------------- |
| `blog`    | `blog_listing`     | the blog index — the terms rail, the article grid, the pager  |
| `blog`    | `blog_article`     | one article — the frame around the story, the related reading |
| `archive` | `archive_category` | the articles of one category                                  |
| `archive` | `archive_tag`      | the articles of one tag                                       |
| `archive` | `archive_author`   | the articles of one author                                    |

A variant key is persisted in the **same** `templates` map as its base (the
column is `jsonb`, keyed by template key — no migration, no new table), and it
resolves through the **same** machinery: the variant first, then the base
(`resolveVariantAst`, `src/lib/template-variants.ts:280-294`). The vocabulary
is **closed**: `blog_anything` is not a key the platform routes to, and the
editor's switcher can only offer what the table lists
(`templateVariantEntries`, `src/lib/template-variants.ts:214-226`).

Reference compositions:

- Shipped themes build their template keys in `preview.ts`
  (`src/lib/themes/songoskriti/preview.ts:91-486`): `index`, `collection`,
  `product`, `page`, `blog`, `archive`, `search`, `cart`, `checkout`,
  `account` — plus the two blog variants
  (`src/lib/themes/songoskriti/preview.ts:487-530`).
- Search reuses the collection listing pattern from the theme's own
  `collection` case — do not duplicate the listing by hand.
- Route-supplied `<h1>` templates (`product`, `collection`, `account`,
  `page`, `blog`, `search`, `archive`) must NOT contain an h1-claiming
  widget; every other template must contain exactly one
  (`ROUTE_H1_TEMPLATES`, `src/lib/builder-ast.ts:72-86`).

### 2.3 Sections (type + props)

`Section` (`src/lib/builder-ast.ts:306-329`):

```ts
export type Section = {
  id: string; // globally unique, see §3
  type: SectionType; // src/lib/builder-ast.ts:114-293
  props: Record<string, PropValue>;
  children?: Section[]; // only when catalogue flags container: true
  hidden?: Breakpoint[]; // per-breakpoint visibility
  bp?: Partial<Record<Breakpoint, Record<string, PropValue>>>;
  invalid?: string;
  when?: VisibilityRule[];
  ab?: { experiment: string; variant: string };
};
```

- `PropValue = string | number | boolean | PropRow[]`
  (`src/lib/builder-ast.ts:404`); repeatable rows cap at
  `MAX_ARRAY_ROWS = 24` (`:300`); nesting caps at `MAX_TREE_DEPTH = 6`,
  `MAX_NODES_PER_TEMPLATE = 300` (`:303-304`).
- Field kinds for the inspector: `text | textarea | number | select | url |
boolean | embed | bitext | color | range | image | taxonomy | unit |
group | html | array | menu` (`src/lib/builder-ast.ts:611-628`).
- `CatalogEntry` (`src/lib/builder-ast.ts:707`) declares label, group,
  slots, `heading` (h1-claim), `templates` scope, `container`, `defaults`,
  `fields`.

### 2.4 Theme anatomy (what shipped themes actually contain)

A theme is a folder under `src/lib/themes/<key>/` — no preset table; the
shared registry layer is optional (§14). The shipped themes (Songoskriti,
Somvabona) each contain:

- `tokens.ts` — the `ThemeTokens` override (brand/accent/surface/ink plus
  layout knobs and an optional designed `dark` set).
- `skins.ts` — skin vocabularies + `with<Theme>Defaults()` merger (defaults
  merge **under** authored props; merchant inspector values always win).
- `homepage.ts` — `buildHomepageMain()` returning `Section[]`.
- `header.ts` / `footer.ts` — chrome builders (footer emits statement +
  newsletter + sitemap + payments + colophon).
- `preview.ts` — the `PreviewThemeSource` (demo bodies per template).
- `skins.css` — token-only skin sheets + per-theme article rules.
- `wiring.test.ts` / `skins.test.ts` / `preview.test.ts` — the pinned gates.
- Registry layer (optional, §14) — presentation-claim registrars
  (`src/lib/themes/songoskriti/presentation-claims.ts`), theme-owned widget
  defs (`src/lib/themes/songoskriti/ornament-def.ts`), and their universal
  bodies (`src/lib/themes/songoskriti/ornament-generic-presentation.tsx`).
  A data-only theme skips this layer entirely.

Sections are built through the shared factory so ids stay unique and
বাংলা props are filled (`src/lib/theme-section.ts:44-68`). Catalogue
metadata lives beside the code (`src/lib/themes/catalog-meta.ts:13-21`):
`{ author, subjects, features, layouts, tags, rating, installs }`.
`rating`/`installs` are honest zeros until marketplace telemetry exists;
`catalogMeta()` falls back to `FALLBACK` (`:216-227`).

> Retired: an earlier preset/blueprint registry (`theme-presets.ts`,
> `theme-blueprints.ts`) was removed. Guides referencing it are stale —
> this section is the current architecture. Theme retirement convention:
> land a migration deactivating the theme's registry rows (never delete
> history), remove the theme directory, and note it in the guidelines.

### 2.5 Homepage builder pattern

Build the homepage as one function returning `Section[]`, wrapped so theme
skin defaults merge **under** authored props (merchant inspector values
always win):

- Songoskriti: `buildHomepageMain()` (`src/lib/themes/songoskriti/homepage.ts:23`)
  wrapped in `withSongoskritiDefaults()` (`src/lib/themes/songoskriti/skins.ts:109`).
  Ships a 21-section homepage with `hero_carousel` first: `hero_carousel`,
  `department_grid`, `product_rail`, `craft_story`, `product_rail`,
  `split_feature`, `product_rail`, `recently_viewed` (after the third product
  rail), `finder_row`, `split_feature`, `product_rail`, `product_rail`,
  `split_feature`, `collection_story`, `product_rail`, `craft_story`,
  `ugc_gallery`, `testimonials`, `split_feature`, `trust_footer`,
  `store_locator`.
- Somvabona: `buildHomepageMain()` (`src/lib/themes/somvabona/homepage.ts:22`)
  wrapped in `withSomvabonaWidgetDefaults()` (`src/lib/themes/somvabona/skins.ts:113`).
  Ships a 12-section homepage on 11 distinct types (the urgency rail
  doubles): `announcement_bar`, `hero_carousel`, `trust_marquee`,
  `circle_categories`, `price_buckets`, `urgency_rail` × 2, `occasion_matrix`,
  `recently_viewed` (after the matrix), `store_locator`, `craft_story`,
  `testimonials`.

Pattern rules for new themes: first section owns the H1 claim (a
`hero_carousel` up front, matching the full composition lists in [the
builder homepage reference](../04-builder/README.md));
every user-facing string carries its `_bn` twin inline; rail sections read
from `collection` sources with explicit `limit` values; never invent
metrics, ratings, or addresses in demo copy.

### 2.6 The route-owned render contexts

A template is not free-form markup. Each surface's route **grants** a fixed
set of **context slots**, and a theme's section renders only where the route
granted the slot it needs. A widget placed in a slot the route did not grant
is skipped by the renderer, so the composition and the route must agree — and
a widget's own catalogue row declares which templates it may live on
(`templates: [...]`, the allowlist in `src/lib/builder-ast.ts`).

| surface          | the slots the route grants                                                                                                                                                           | what the theme may contribute                                                                      | what the platform keeps                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `search`         | `result_toolbar`, `filter_chips`, `pagination`, `category_header`, and `empty_state` **only** when the search really is empty; plus the platform's results block as the product slot | the toolbar, the chips, the pager, the band, the empty copy                                        | the query, the result block, the result limit, the tenant scope                                         |
| `collection`     | the platform's grid as the product slot                                                                                                                                              | the category header, the toolbar, the chips, the pager, the empty state                            | the product grid, the facets, the paging                                                                |
| `cart`           | `cart_lines`, `cart_summary`, `cart_drawer`, `checkout_steps`, `payment_methods`                                                                                                     | the arrangement and the labels around them                                                         | the lines, the totals, the rails                                                                        |
| `checkout`       | the same five cart slots plus `page_content` — the route's own form                                                                                                                  | the frame: the trail, the section order, the summary's placement, the payment block's presentation | the `<form>`, the customer fields, the server quote, the stock hold, the order write, the payment rails |
| `account`        | `orders_list`, `profile_card`, plus `page_content` — the route's dashboard                                                                                                           | the merchant's own profile section, and the frame around the dashboard                             | the session, the overview RPC, the tab state, every write                                               |
| `blog` (listing) | the platform's listing block                                                                                                                                                         | the terms rail, the grid, the pager                                                                | the articles, the paging                                                                                |
| `blog` (article) | `page_content` — the article body — plus `blog_terms`, `blog_archive`, `blog_pager`                                                                                                  | the frame around the story                                                                         | the article body, the related reading                                                                   |
| `archive`        | `category_header`, `blog_terms`, `blog_archive`, `blog_pager`, `pagination`, `empty_state`                                                                                           | the archive's opening band, its facet rail, its grid, its pager, its empty state                   | the term, the records, the facets, the paging                                                           |

**The archive contract.** The archive's kinds are **closed**: `category`,
`tag`, `author` (`ARCHIVE_KINDS`, `src/lib/archive-context.ts:32`) — those
are the only content-archive routes the platform serves. A product collection
is not an archive (it keeps the `collection` template) and a product category
is a search facet, not a route. The context is **derived, never fetched**:
the route's own server-function output is mapped into a closed shape by
`archiveContextFrom` (`src/lib/archive-context.ts:235`), carrying the kind,
the state, the term's id/slug/name, the description, the trail, the records,
the facets and the paging — and nothing else. An unresolved term is an
**explicit not-found** state, never an empty-but-200 archive.

**The blog variant contract.** Two surfaces, two compositions: `blog_listing`
(the terms rail, the article grid, the pager) and `blog_article` (the frame
around one story). The store-scoped routes resolve them through the same
storefront seam with a `variant` suffix (`getStoreChrome`,
`src/lib/storefront.functions.ts:120-190`). With no authored composition the
resolution is null and the platform's own surface renders — never the
homepage.

**The checkout composition contract.** The theme may contribute the **frame**:
the progress trail, the section order, the order-summary placement, the
payment block's presentation. The route keeps the `<form>`, the customer
fields, the validation, the server-quoted totals, the stock hold and the
order write. The route also supplies its **own** payment picker and its
**own** summary when the theme's body carries neither
(`src/routes/store.$slug.checkout.tsx:243-260`) — a checkout with no rail
chosen and no total shown is not a checkout. A theme's checkout body
therefore contains **no** form and **no** input element.

**The account context contract.** Five tabs, all `?tab=` values on the
**same** route (`ACCOUNT_TABS`, `src/lib/account-tab.ts:8-14`): `orders`,
`addresses`, `wishlist`, `profile`, `privacy`. There is no `/account/orders`
route — a link to one 404s, so a nav that links outside the tab set is a
defect. The permitted data is the `customer_overview` RPC's own fields: the
profile, the orders, the addresses, the wishlist and the consents. The
surface distinguishes **six** states — signed out, loading, failed, signed
in with orders, signed in without orders, and the disclosed order detail
(loaded, loading or failed); the route's own status mapping is
`accountStatus` (`src/lib/account-status.ts:45`) and the dashboard adds the
orders-present and order-detail branches on top
(`src/components/store/AccountDashboard.tsx:221`).

### 2.7 The Page template and the CMS page record

Two different things answer to "page", and a theme author needs both:

|               | the **Page template**                                                                                                              | the **CMS page record**                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| what it is    | one entry of the theme's `templates` map — the theme's composition for every merchant page                                         | one row of the merchant's content — the record a merchant wrote                                                      |
| who edits it  | the theme editor, `/dashboard/builder`, in the template switcher (`src/components/builder/BuilderTopBar.tsx:11`)                   | the content editor, `/dashboard/content/editor?kind=page                                                             | post&id=<uuid>` (`src/routes/_authenticated/dashboard/content/editor.tsx:23-37`) — which has **no** template selector at all |
| what it holds | sections, slots and props                                                                                                          | the page's title, body, SEO and publication state                                                                    |
| how they meet | the storefront page route (`/store/$slug/pages/$pageSlug`) renders the merchant's record **inside** the theme's `page` composition | the route grants `breadcrumb` and `page_content` — the merchant's own body (`src/components/store/PageView.tsx:216`) |

So: the theme decides the **frame** every merchant page sits in; the merchant
decides the **content** inside it. When the theme's `page` body does not
declare the `page_content` slot, the route's own fallback renders instead —
the merchant's record is never lost, and the theme never has to reproduce it.

## 3. Building step-by-step

### Step 1 — Tokens

Start from `DEFAULT_TOKENS` and override brand/accent/surface/ink plus
layout knobs. Copy an existing tokens file, e.g. Songoskriti
(`src/lib/themes/songoskriti/tokens.ts:9-29`) or Somvabona
(`src/lib/themes/somvabona/tokens.ts:14-34`, with the reference designed
`dark` set at `:32-37`). Songoskriti is light-only (`dark: null`).

### Step 2 — Templates

Write one builder per template key returning `{ header, main, footer }`.
Follow the slot discipline in §2.2 and keep the h1 rule
(`src/lib/builder-ast.ts:72-86`). For search, reuse the collection listing
pattern from the theme's own `collection` case (see §2.5 reference
compositions) — do not duplicate the listing by hand.

**Variants.** A base that owns variants gets one builder **per variant**, not
one builder per surface: `blog` needs a `blog_listing` body and a
`blog_article` body, and `archive` needs an `archive_category`, an
`archive_tag` and an `archive_author` body (§2.2). Each variant is its own
entry in the same `templates` map, keyed `<base>_<suffix>`; the suffix must
be one the closed table lists, and nothing else is addressable. A route that
asks for a variant the theme did not author falls back to the base body —
never to the homepage.

### Step 3 — Sections

Always build sections through the shared factory so ids stay unique and
বাংলা props are filled (`src/lib/theme-section.ts:44-68`):

```ts
// Minimal theme skeleton — copy, rename, extend.
import { DEFAULT_TOKENS } from "@/lib/builder-ast";
import { sectionFactory } from "@/lib/theme-section";

const BN: Record<string, string> = {};
const s = sectionFactory(BN);

export function myTheme() {
  const k = "my-theme";
  const header = () => [
    s(k, "banner", { text: "Free delivery over BDT 2,000", tone: "info" }),
  ];
  const footer = () => [
    s(k, "newsletter", {
      heading: "Stay in touch",
      body: "Offers and new arrivals by email. Unsubscribe any time.",
      buttonLabel: "Subscribe",
    }),
  ];
  return {
    // In the shipped themes this becomes tokens.ts + preview.ts in
    // src/lib/themes/<key>/ — no registry object. Kept together here so
    // the example copies in one block.
    tokens: {
      ...DEFAULT_TOKENS,
      brand: "#0F766E",
      accent: "#0D9488",
      surface: "#FFFFFF",
      ink: "#0F172A",
    },
    templates: {
      index: {
        header: header(),
        main: [
          s(k, "hero", {
            heading: "Welcome",
            subheading: "",
            ctaLabel: "Shop now",
            ctaHref: "#products",
            align: "left",
          }),
          s(k, "product_grid", { heading: "Featured", limit: 12, columns: 4 }),
        ],
        footer: footer(),
      },
      product: {
        header: [s(k, "breadcrumb", { homeLabel: "Home" })],
        main: [
          s(k, "product_media", { ratio: "1/1", showThumbnails: true }),
          s(k, "price_block", { showCompareAt: true, note: "" }),
          s(k, "add_to_cart", { label: "Add to cart", showQuantity: true }),
        ],
        footer: footer(),
      },
      collection: {
        header: [s(k, "breadcrumb", { homeLabel: "Home" })],
        main: [
          s(k, "category_header", {
            heading: "All products",
            body: "",
            showCount: true,
            showBreadcrumb: true,
            homeLabel: "Home",
          }),
          s(k, "product_grid", {
            heading: "All products",
            limit: 24,
            columns: 4,
          }),
        ],
        footer: footer(),
      },
      search: {
        header: [s(k, "breadcrumb", { homeLabel: "Home" })],
        main: [
          s(k, "heading", {
            text: "Search results",
            level: "h1",
            align: "left",
          }),
          s(k, "product_grid", { heading: "", limit: 16, columns: 4 }),
        ],
        footer: footer(),
      },
      page: {
        header: [s(k, "breadcrumb", { homeLabel: "Home" })],
        main: [s(k, "page_content", {})],
        footer: footer(),
      },
      blog: {
        header: [s(k, "breadcrumb", { homeLabel: "Home" })],
        main: [
          s(k, "blog_terms", { heading: "", style: "pills", showCounts: true }),
          s(k, "blog_archive", {
            heading: "",
            layout: "grid",
            columns: 3,
            limit: 9,
            showCover: true,
            showExcerpt: true,
            showMeta: true,
            emptyText: "No articles yet.",
          }),
          s(k, "blog_pager", { align: "center" }),
        ],
        footer: footer(),
      },
      cart: {
        header: [],
        main: [
          s(k, "cart_lines", { heading: "" }),
          s(k, "cart_summary", { heading: "Order summary" }),
        ],
        footer: footer(),
      },
      checkout: {
        header: [s(k, "banner", { text: "Secure checkout", tone: "info" })],
        main: [
          s(k, "checkout_steps", {
            heading: "",
            step1: "Cart",
            step2: "Details",
            step3: "Payment",
            step4: "Done",
            activeStep: 3,
          }),
          s(k, "cart_lines", { heading: "" }),
          s(k, "cart_summary", { heading: "Order summary" }),
          s(k, "payment_methods", {
            heading: "",
            note: "",
            emptyText: "No payment method is enabled yet.",
          }),
        ],
        footer: footer(),
      },
    },
  };
}
```

Prop names above are the catalogue `defaults` keys for each widget in
`src/lib/builder-ast.ts` (e.g. `hero` `:911-925`, `cart_summary`
`:1366-1380`, `blog_archive` `:4517-4530`). Never invent a prop — copy
the key from the catalogue entry.

### Step 4 — theme folder + preview source

Add `src/lib/themes/<key>/` with `tokens.ts`, `skins.ts`
(`with<Theme>Defaults()` merger), `homepage.ts` (`buildHomepageMain()`),
`header.ts` / `footer.ts`, `preview.ts` (the `PreviewThemeSource`), and
`skins.css` (token-only), plus `wiring.test.ts` / `skins.test.ts` /
`preview.test.ts` pinning the composition. Register the key in the theme
registry so the catalogue, preview route, and installer see it — the exact
functions, tables, and seed semantics live in [the SDK registry
pipeline](./sdk.md). Then add the Step 5 `catalog-meta` entry below.

### Step 5 — `catalog-meta` entry

Add the key to `CATALOG_META` (`src/lib/themes/catalog-meta.ts:30-214`).
Subjects/features/layouts drive the Feature filter drawer
(`src/lib/themes/appearance.ts:67-116`); keep `rating: 0, installs: 0`
until real telemetry exists (no-fabrication rule, file header `:1-11`).
This file is the metadata floor — SQL rows override it at runtime
(`src/lib/themes/appearance.server.ts:123-144`).

### Step 6 — Registry seed

Generate the seed migration from code presets and apply it live — the exact
commands, curated keys, and `INSERT ... ON CONFLICT` semantics live in
[the SDK registry pipeline](./sdk.md).
Authors only need to know: the registry is the catalogue source demo
imports read from, so seed before testing imports.

### Step 7 — Install / publish / activate lifecycle

Install, publish, and activate through the Appearance-desk and builder
functions documented in [the SDK marketplace flow](./sdk.md)
(copy-pasteable sequence included there). Publishing is gated on lint,
Bengali coverage, fonts, and contrast — see the publishing checklist in §7
below, and [the builder runtime guide](../04-builder/README.md) for the
state machine behind it.

## 4. Widgets with presets

- Register catalogue widgets a theme renders by using their exact
  `SectionType` and prop keys. The builder catalogue is `BASE_CATALOG` +
  phase packs in `src/lib/builder-ast.ts` (chrome `:1927-2277`,
  merchandising `:2279-2435`, PDP `:2437-2687`, collection/search
  `:2689-2844`, cart/checkout, Atelier/Circuit/Rupaboti/heritage packs).
  The studio panel mirror is `WIDGETS` in `src/lib/studio/catalog.ts:122+`
  with per-widget `defaults` (e.g. `form` `:1388-1395`, `nav_menu`
  `:1396-1404`, `newsletter` `:1405-1412`).
- Prop conventions: **flat scalars** (`string | number | boolean`) plus
  repeatable `PropRow[]` arrays (`src/lib/builder-ast.ts:404`).
  Bilingual text uses `bitext` fields with `${key}_bn` twins filled via
  `withBn()` at construction (`src/lib/theme-section.ts:23-39`) — pass the
  theme dictionary (a `Record<string, string>`, empty is fine) to `sectionFactory()`
  (`src/lib/theme-section.ts:61-68`).
- Responsive: `hidden: ["mobile"]` and `bp: { tablet: {...}, mobile: {...} }`
  on any section (`src/lib/builder-ast.ts:412-417`); per-device layers only
  accept responsive-flagged fields (see the per-device reference on the
  shipped homepages: Songoskriti MOST LOVED, Somvabona recently-viewed).
- Containers only: `children` is accepted solely on catalogue entries
  flagged `container: true` (`src/lib/builder-ast.ts:311-314`); trees cap
  at `MAX_TREE_DEPTH`/`MAX_NODES_PER_TEMPLATE` (`:303-304`).

### Skins — closed vocabularies and theme defaults

The core lane owns the `skin` prop: every skinnable widget gains a **Skin**
select field in the style panel via `SKIN_FIELD`
(`src/lib/builder-ast.ts:871`), with the closed vocabulary in
`WIDGET_SKINS` (`src/lib/builder-ast.ts:822`) and the core default in
`DEFAULT_WIDGET_SKIN` (`src/lib/builder-ast.ts:840`). The first option is
the documented default. Unknown or empty values resolve to the widget
default — never a crash, never empty.

| Widget          | Core vocab (first = core default) | Songoskriti default | Somvabona default |
| --------------- | --------------------------------- | ------------------- | ----------------- |
| `product_rail`  | `editorial`, `compact`, `minimal` | `editorial`         | `compact`         |
| `hero_carousel` | `split`, `fullbleed`, `minimal`   | `split`             | `fullbleed`       |
| `testimonials`  | `carousel`, `wall`, `single`      | `wall`              | `carousel`        |
| `product_grid`  | `cards`, `rows`                   | `cards`             | `rows`            |
| `urgency_rail`  | `editorial`, `compact`, `minimal` | — (core default)    | `compact`         |

Theme-side sets: `SONGOSKRITI_SKIN_SETS`
(`src/lib/themes/songoskriti/skins.ts:35`), `SONGOSKRITI_WIDGET_DEFAULTS`
(`src/lib/themes/songoskriti/skins.ts:52`), `SOMVABONA_WIDGET_DEFAULTS`
(`src/lib/themes/somvabona/skins.ts:40`). Wire them with
`withSongoskritiDefaults()` (`src/lib/themes/songoskriti/skins.ts:109`) or
`withSomvabonaWidgetDefaults()` (`src/lib/themes/somvabona/skins.ts:113`):
defaults merge **under** authored props, so an explicit `skin` in the
inspector always wins. Skin values are style keys, never copy, so they
carry no `_bn` twins (bilingual props are declared per widget in
`BITEXT_FIELDS`, `src/lib/builder-ast.ts:5883`).

### `skins.css` — token-only rule

Theme skin stylesheets are token-only: every value reads `var(--theme-*)`,
keyed off the renderer's `[data-widget]` + `[data-skin]` attributes.
Washes use `color-mix()` over theme tokens, so a merchant re-tint re-skins
every rule automatically; motion rules collapse under
`prefers-reduced-motion`. See `src/lib/themes/songoskriti/skins.css` and
`src/lib/themes/somvabona/skins.css`. Per-theme article treatment lives at
the tail of each sheet — the active theme owns article styles with no
scoping attribute: Songoskriti editorial serif with a brand rule
(`src/lib/themes/songoskriti/skins.css:413-432`), Somvabona compact with
accent links (`src/lib/themes/somvabona/skins.css:276-293`). Both stay
token-only (`var(--theme-*)`), so a merchant re-tint re-skins article
headlines, body rhythm, and links automatically. The gate is enforced per
theme by
test: `stays token-driven: theme vars only, no hex literals` in
`src/lib/themes/songoskriti/skins.test.ts:182`, and `is token-driven: no
hex literals or raw colour utilities` in
`src/lib/themes/somvabona/skins.test.ts:166`.

## 5. Forms + auth pages

Submittable patterns (server validates, client never decides):

- **Contact**: fixed `form` widget defaults
  (`src/lib/builder-ast.ts:4724`: heading/body/labels/button/
  successText/consentText/showPhone) → `submitContactFn`
  (`src/lib/contact.functions.ts:4-24`) with
  `{ name, email, phone?, topic: "sales"|"support"|"migration", message,
locale, honeypot?, renderedAt? }`.
- **Newsletter**: `newsletter` widget (`src/lib/builder-ast.ts:1440`,
  `src/lib/studio/catalog.ts:1405-1412`) → `subscribeNewsletterFn` /
  `verifyNewsletterFn` / `unsubscribeNewsletterFn`
  (`src/lib/newsletter.functions.ts:13-50`).
- **Search**: `search_command` widget (`src/lib/builder-ast.ts:2258`)
  rendering into the `search` template (reuse the theme's `collection`
  listing pattern — see §2.5).
- **Other submittables**: `quiz`, `trade_in`, `back_in_stock`,
  `bundle_builder`/`bundle_offer`, `gift_builder`, `consult_cta` — each posts
  to its server path and renders the returned result (see catalogue
  `defaults` in `src/lib/builder-ast.ts` and the studio mirror in
  `src/lib/studio/catalog.ts`).
- **Sign in / sign up pages**: required as _routes_, not templates. Ship the
  header `account_cart` entry (`src/lib/studio/catalog.ts:1196-1203`) and
  keep `src/routes/store.$slug.account.tsx`, `src/routes/account.tsx` and
  `src/routes/root/login.tsx` reachable. Do not author credential inputs
  inside theme sections.

## 6. Demo data

Granular, idempotent import RPCs read blueprints from `theme_registry` —
an empty registry makes every demo import a noop, so seed first (§3 step
6). What authors need to know:

- Imports run in order: slides → media → products → posts. Slides come
  from `hero_carousel` (with a `hero` repeater fallback); each sub-import
  noops independently when its data already exists (`status: "noop"`).
- Before overwriting anything, run the read-only preflight: it compares
  demo slugs against live products, collections, pages, articles, and
  media file names and returns the sorted collision set.
- `overwrite: true` first deletes **only** colliding rows in FK order
  (links → variants → products → collections/categories, then
  pages/posts/media); non-colliding merchant rows are never touched.

The full function inventory, service mapping, and SQL references live in
[the SDK demo-imports section](./sdk.md).

## 7. Publishing checklist + common pitfalls

Publishing checklist:

1. `lintTemplate()` per key has zero `error`-level issues
   (`src/lib/builder-ast.ts:8397`; enforced in
   `src/lib/themes.server.ts:921`, and again at `:1722` for a registry
   update). A **variant** is linted **with its base key**, so a variant can
   never reach a merchant's storefront unlinted.
2. Translation gate: authored-string বাংলা coverage ≥
   `TRANSLATION_PUBLISH_FLOOR = 90` (`src/lib/builder-guardrails.ts:148`,
   `:166-179`).
3. Font licence + budget gates pass (`src/lib/themes.server.ts:930-943`).
4. `composePublishGate()` is green
   (`src/lib/publish-gates.ts`, called at
   `src/lib/themes.server.ts:946`).
5. Publish creates a `published` version and moves
   `store_themes.published_version_id` (`theme_publish`,
   `supabase/migrations/20260917210000_phase2e_theme_engine.sql:96-120`).
6. Rollback path known: `builderRollbackFn({ versionId })` →
   `theme_rollback` RPC, custom code restored
   (`src/lib/themes.server.ts:1020-1059`).
7. A package that declares the `archive` template declares an `api` range
   whose lower bound is `>= 3.1.0` (§9.3).

Common pitfalls:

- **Draft-only rows can't render.** The storefront only renders the version
  named by `published_version_id` with `status = published`
  (`src/lib/themes/appearance.server.ts:299-309`). Activating a theme with
  nothing publishable throws `theme.unpublished` (`:380-385`, `:401-405`) —
  publish first. (Legacy draft-only rows are materialised once at
  activation, `:342-349`, `:356-408` — do not rely on this for new themes.)
- **Unpublished pointer.** A stale `published_version_id` (deleted/demoted
  version) falls through to the newest `published` version, never
  `MAX(version)` (`:310-340`). An unpublished theme renders nothing — that
  is the guard working.
- **Half-Bangla publish.** Below 90% coverage the publish is blocked with a
  `translation` failure — fill `${key}_bn` twins via the factory dictionary
  instead of hand-editing SQL. **Measured on the shipped Songoskriti theme
  (2026-10-21): its copy is 76% বাংলা against the 90% floor**, so a merchant
  publish of that theme is refused with `theme.publish_blocked codes=translation`.
  The unblock is an owner action — translate the remaining ~32 strings, or
  rule on the floor for a source-owned official theme (an official theme is
  **installed from source**, not published by a merchant). The refusal is the
  platform's rule working, not a defect: see the phase-3 evidence record for
  the full measurement.
- **NULL `installed_at`.** The column has no DB default; omitting it breaks
  the installed-list sort for the whole merchant
  (`src/lib/themes/appearance.server.ts:204-208`,
  `src/lib/themes.server.ts:112-119`,
  `src/lib/themes/appearance.ts:286-299`).
- **Activation overwrites.** `activateTheme` refreshes from the registry
  with `overwrite=false` (`src/lib/themes/appearance.server.ts:473-489`) —
  a present draft wins. Never call the registry install with overwrite on
  activation.
- **Empty registry.** `listRegistry` degrades to the code floor
  (`src/lib/themes.server.ts:553-601`), but demo imports need SQL rows —
  run the seed (§3 step 6) before testing imports.
- **A reset is per template.** The studio's **Reset to default** affordance
  restores **one** template (or one variant) to the theme's own default; it
  never touches the rest of the map, and it is armed before it fires
  (`src/routes/_authenticated/dashboard/builder.tsx:1574-1609`).

## 8. Theme effects (atmosphere + motion controls)

Three effects, each token-driven and theme-scoped. They are ports of the
`.fq-site` marketing-surface utilities into `.fq-theme-scope`: the same
look, but tinted by the theme instead of the marketing palette. Tints
derive from `--theme-brand` / `--theme-accent` via `color-mix`; nothing
else carries a hue.

### 8.1 What each effect does

- **Hero wash (`fq-theme-aurora`).** A low-alpha static gradient wash
  behind hero copy — atmosphere, never a section fill. Port of
  `fq-heritage-aurora` (`src/styles.css:352`), which bakes in the
  terracotta/amber anchors; the theme variant keeps those anchors only as
  fallbacks and otherwise mixes from `--theme-brand`/`--theme-accent`.
  The wash layer must be `pointer-events-none` — a wash that intercepts
  clicks is a catalogue rejection (see §8.5).
- **Glass card (`fq-theme-glass`).** Card elevation surface for
  `editorial_banner`: translucent card fill, hairline border, soft shadow,
  `backdrop-filter` blur. Port of `.fq-site .fq-glass`
  (`src/styles.css:1004-1009`, dark variant `:1011-1018`) into theme
  scope, so the surface follows theme tokens instead of marketing tokens.
- **Line reveal (`fq-theme-linereveal` trigger class).** The one authored
  typography moment: masked lines that rise into overflow-clipped boxes on
  a per-line delay. Port of `.fq-line` (`src/styles.css:1056-1074`),
  which is static before hydration and inert under reduced motion. This
  sits alongside — not instead of — the existing entrance system: the
  universal `reveal` style prop (`fq-reveal`, `src/styles.css:417-455`)
  and per-widget `advAnimation` (`none | fade | rise | slide-left |
slide-right | zoom`, `src/lib/builder-advanced.ts:36-44`). One
  orchestrated moment per viewport; scattered effects read as decoration.

### 8.2 Which prop toggles it

| Effect         | Prop                                        | Values                                                                  | Default  |
| -------------- | ------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| Hero wash      | `atmosphere` on `hero`                      | `"wash" \| "none"`                                                      | `"wash"` |
| Banner surface | `surface` on `editorial_banner`             | `"glass" \| "card"`                                                     | `"card"` |
| Entrance       | `advAnimation` (Advanced tab, every widget) | `"none" \| "fade" \| "rise" \| "slide-left" \| "slide-right" \| "zoom"` | `"none"` |

`atmosphere: "none"` renders no wash div at all — it is not a
transparent wash, so there is no extra layer in the tree.
`advAnimation` values are stored as ordinary `adv`-prefixed props and
flow through the per-breakpoint cascade like any other prop
(`src/lib/builder-advanced.ts:13-26`).

### 8.3 Reduced-motion behavior

The contract has two halves:

1. **Static effects are inert by construction.** Washes are static
   gradients with no animation loop — like `fq-heritage-aurora`
   (`src/styles.css:349-351`) — so there is nothing to gate.
2. **Animated effects gate on the existing reduced-motion blocks.**
   `fq-reveal` drops to `animation: none` under
   `prefers-reduced-motion: reduce` (`src/styles.css:451-455`) and when
   the theme sets motion `none` (`[data-motion="none"]`,
   `src/styles.css:447-450`); the aurora-drift pattern shows the same
   gate for looped motion (`src/styles.css:1195-1199`). `advAnimation:
"none"` covers a reduced-motion visitor
   (`src/lib/builder-advanced.ts:35`). Any new animated variant must
   hook into these blocks — never its own parallel mechanism.

### 8.4 The no-hardcoded-hues rule

Hard-coded hues are banned outside the two heritage anchors (`#c45d3e`,
`#d9a441`, `#8a3b1f`) already approved in `fq-heritage-aurora`. Every
other tint is `color-mix` from `--theme-brand`/`--theme-accent`, with
the heritage values as fallbacks — so a theme that omits brand/accent
degrades to the current heritage look instead of rendering unstyled.
This mirrors the scope fallback pattern (e.g.
`var(--theme-brand, ...)` in `src/styles.css:387-397`).

### 8.5 Rejection reasons reviewers will apply

1. **Wash layer intercepts clicks.** The wash must be
   `pointer-events-none` (the `.fq-site` aurora sets this on its
   `::before` layer, `src/styles.css:1136`). A submission whose wash
   blocks interaction with hero copy or CTAs is rejected.
2. **Animated variant ignores reduced-motion.** Any effect with a motion
   loop must gate on the existing reduced-motion blocks (§8.3). A
   submission that animates under `prefers-reduced-motion: reduce` — or
   that invents a separate opt-out instead of reusing `data-motion` /
   the media query — is rejected.

### 8.6 Motion semantics (tokens → manifest → engine)

Theme motion has three layers: a token intent, a closed effect manifest,
and engine execution. Themes request; the engine renders.

`motion: "none" | "subtle" | "lively"`
(`src/lib/builder-ast.ts:6290-6291`) defaults to `subtle`
(`src/lib/builder-ast.ts:6342`), parses through `oneOf`
(`src/lib/builder-ast.ts:6431-6435`), and maps to duration/rise variables
(`src/lib/builder-ast.ts:6569-6580`). Pick by page role: `none` for a
static storefront (behaves like `prefers-reduced-motion` everywhere —
the catalogue default for text-heavy pages); `subtle` for the standard
theme (420ms, 12px rise — entrances settle without drawing the eye);
`lively` for campaign moments only (620ms, 20px rise — hero drops,
festive takeovers, never the catalogue default). `ThemeSurface` publishes
the intent as `data-motion`
(`src/components/builder/ThemeSurface.tsx:102`), so every collapse gate
below keys off one attribute.

`MOTION_EFFECTS` is the closed vocabulary
(`src/lib/builder-advanced.ts:54-63`): `none`, `fade`, `rise`, `zoom`,
`stagger-grid`, `marquee`, `line-reveal`. A theme requests a named effect
via the `advMotion` select (`src/lib/builder-advanced.ts:151-165`);
unknown or empty values resolve to `none`
(`src/lib/builder-advanced.ts:66-72`). `SectionRenderer` executes the
request (`src/components/builder/SectionRenderer.tsx:194-198`), emitting
`fq-fx fq-fx-<effect>`
(`src/components/builder/SectionRenderer.tsx:218`) plus a
`data-motion-effect` hook
(`src/components/builder/SectionRenderer.tsx:242`); entrance effects park
behind the shared observer until on-screen
(`src/lib/builder-advanced.ts:75-77`). Themes never touch shared renderer
code (isolation rule, §13). Only CSS-executable effects are listed —
scroll-linked scenes and animated numerals need JS executors.

Moment budget: one orchestrated moment per viewport (§8.1) — a single
`marquee` loop (`src/styles.css:702-704`) or one `stagger-grid` with 60ms
steps capped at 360ms past the sixth child (`src/styles.css:696-701`),
never both competing in the same viewport. Everything collapses under
`prefers-reduced-motion: reduce` (`src/styles.css:712-721`) and under
`motion: none` (`src/styles.css:722-729`): animations drop to `none` with
content left fully visible — a downgrade never hides anything. Any new
animated variant must hook into these two blocks, never its own parallel
mechanism.

## 9. External authors: from zero to submitted

You need nothing installed — no checkout, no CLI, no repo access. If you
can open the builder, you can ship a theme. The whole path is: get
approved, build, export, submit, respond to review.

> **Scope.** This export lane covers merchant and community submissions.
> Official (Framique-built) themes are not ordinary exported packages:
> they are source-owned and resolve through the built-in registry
> (`src/lib/themes/builtin-themes.ts`). §14 is their contract; the
> [theme package spec](./packages.md) does not describe them.

### 9.1 The path

1. **Get approved.** Submission is allowlisted: your merchant account must
   be an approved developer before the Themes screen accepts a package. If
   there is no submit control, you are not on the list yet — ask staff.
2. **Build in the builder.** Compose the theme the way §3 describes:
   tokens first, one composition per template key, catalogue widgets only,
   every bilingual prop filled in both languages. The builder lints as you
   go — treat each red error as a rejection arriving early and fix it now.
3. **Export the package.** Use the "Export package" action beside the
   builder's commit/publish controls. It runs the package validator first
   and shows the first error instead of downloading on failure — a file
   that will not export is a submission that would not pass. On success
   you get `<key>-<version>.theme.json`.
4. **Submit via the Themes screen.** Upload the exported file. It lands as
   `pending`: nothing renders and nothing installs until staff decide.
5. **Respond to review.** Staff approve or reject with a note. A rejection
   names the failing gate (§9.2); fix it in the builder, bump `version`,
   re-export, resubmit.

### 9.2 What review checks

The full gate definitions live in [the theme package spec](./packages.md). In one glance:

1. **Size** — no per-submission megabyte cap exists in code. The
   enforced ceilings are the archive caps plus `AST_LIMITS` (see [the
   package contract](../packages/contract.md) §§1, 5).
2. **Budget** — no sections-per-template budget exists in code. The
   enforced section/node/depth ceilings are `AST_LIMITS` (same
   source).
3. **Clean lint** — zero error-level findings on every template the package
   defines.
4. **One H1** — exactly one primary heading per page. Route-headed
   templates (`product`, `collection`, `account`, `page`, `blog`, `search`,
   `archive`) get theirs from the route, so they carry no claimant; any other
   template you ship carries exactly one.
5. **Bilingual** — বাংলা coverage at or above 90% of authored strings,
   with real বাংলা inside every `_bn` twin — never English pasted into
   the Bengali field.
6. **No executable content** — no `html` widgets, no script markup, no
   `javascript:` / `data:` / `vbscript:` URLs anywhere in props.
7. **API range** — `api` sits inside `^3.0.0`, and a package that declares
   the `archive` template declares a range whose lower bound is `>= 3.1.0`
   (§9.3).
8. **Upload gates** — the upload lane refuses dangling asset refs and
   over-quota uploads, inventories external URLs into the install
   audit, and capability-widening updates need re-consent while
   scan-flagged versions need a recorded approval before activation
   (see [the package contract](../packages/contract.md) §§1, 3, 6, 10).

A human reader then spot-checks bilingual completeness — the gate counts
twins, the reviewer reads them.

### 9.3 Versioning rules

- `api` stays inside `^3.0.0`. Anything else is rejected outright: a
  package that installs but renders broken is worse than one that never
  ships.
- **The `archive` exception.** The `archive` template key landed in the
  **3.1.0** line of the builder API, so a package that declares `archive` in
  its `templates` must declare an `api` range whose **lower bound is
  `>= 3.1.0`**. The two admitted range shapes are `^a.b.c` (which floors at
  `a.b.c`) and `>=a.b.c <d.e.f` (which floors at `a.b.c`). A package that
  declares `archive` while claiming a lower floor is rejected with the
  stable reason code **`templates.archive_requires_api`**. A package that
  does **not** declare `archive` is unaffected — it keeps `^3.0.0` and
  installs exactly as before. The full table, with the reason codes, is in
  [the package contract](../packages/contract.md) §2.1.
- `version` is semver and moves forward on every resubmission, rejections
  included. Patch for fixes (`1.0.0` → `1.0.1`), minor/major for new
  templates and breaking prop changes.
- `key` is forever. Choose the slug once — lowercase letters, digits and
  dashes, max 60 characters. It is the theme's identity across installs,
  updates and marketplace listings, and it is never renamed after first
  publish.

### 9.4 Rejection reasons

The closed list. A rejection always names one of these, each mapping to a
gate in §9.2 or a rule in §9.3:

1. Package over the enforced archive / payload ceilings ([package
   contract](../packages/contract.md) §§1, 5) — no 2 MB / 200-section
   caps exist in code.
2. A template over the `AST_LIMITS` ceilings (same source).
3. Lint errors (the note quotes the first; the builder shows the rest).
4. Missing or duplicated primary heading.
5. বাংলা coverage below 90%, or `_bn` twins with no বাংলা in them.
6. Executable content: raw HTML widgets, script markup, blocked URL
   schemes.
7. `api` outside `^3.0.0` — or, for a package that declares `archive`, an
   `api` range whose lower bound is below `3.1.0`
   (`templates.archive_requires_api`).
8. Resubmission without a version bump, or a renamed `key`.

### 9.5 Worked example

`./example-studio.theme.json` is a minimal package that clears every
gate: a single `index` template — packages ship only the templates they
define, anything absent falls back to the built-in empty template — with
a `hero_carousel` claiming the one H1, a `product_rail` for
merchandising, and a footer `newsletter` signup, every authored string
twinned in বাংলা. Copy its manifest shape verbatim and grow from there:
add template keys one at a time, keep the twin discipline, export often.

Staff-side handling after approval (listing, install ledger, activation,
audit) is integrator work — see [the theme SDK](./sdk.md).

## 10. Preview-source wiring

Theme previews render through a theme-agnostic engine: the theme only
implements the `PreviewThemeSource` port, and the registry wires it in.

- Implement `songoskritiPreviewSource()` in
  `src/lib/themes/songoskriti/preview.ts` (Somvabona mirrors it in
  `src/lib/themes/somvabona/preview.ts`): `{ key, themeName, author,
tokens, header, footer, main }`, where `main(template, s)` returns the
  authored demo body per template key or `null` for templates the theme
  does not author. The port type lives in
  `src/lib/theme-preview-nav.ts:283`.
- Register the source in `src/lib/preview-sources.ts:14-19` — that map is
  the only place that names themes for preview. The engine never imports a
  theme module directly.
- Since the unified registry (§14.2), the preview source is also the
  theme's storefront activation carrier: side-effect imports in
  `preview.ts` (presentation claims, theme-owned widgets, universal
  bodies) run when the storefront graph loads the source. Registration
  placed behind the theme barrel (`src/lib/themes/songoskriti/index.ts`)
  reaches no productive graph — a re-export is not an import root.
- In-preview navigation maps demo links onto the preview's own template
  tabs, and focus links use the `?focus=` contract (never `?slug=`).
  Engine behavior, blocked paths, and demo-focus resolution are runtime
  theory — see [the builder preview reference](../04-builder/README.md).

### 10.1 The preview fixtures

The preview host renders **every authored composition** — every template key
the theme authors, and every **variant** of a base that owns variants — over
the theme's own **labelled demo data**. The fixtures are synthetic and
labelled; they are never the merchant's live data, and a preview render is
never cached, never counted as analytics and never published.

- The demo rows come from the theme's own demo catalogue
  (`src/lib/demo-catalog.ts`) mapped into widget rows
  (`src/lib/preview-demo-data.ts`) — the preview has no merchant data, so
  every data widget is fed demo rows rather than a live query.
- A template the theme does **not** author gets the engine's generic demo
  body (`genericDemoMain`, `src/lib/theme-preview-nav.ts:469`); a template
  the theme **does** author gets the theme's own body, verbatim.
- A **variant** is previewed like a base: the host resolves it through
  `resolveVariantAst` (`src/lib/template-variants.ts:280`), so
  `?template=blog_article` shows the article frame and
  `?template=blog` shows the listing.
- The preview and the storefront **agree** by construction: the same AST, the
  same linter and the same context slots (`lintTemplate`,
  `resolveVariantAst`) serve both. That is the preview-parity contract the
  test lanes assert.

### 10.2 The preview's action policies

The preview is a **reading** surface, not an acting one. Its action
policies are deliberate and closed:

| in the preview                 | policy                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| navigating to another template | mapped onto the preview's own template tabs — never a real storefront navigation                                                                 |
| a link that leaves the store   | blocked                                                                                                                                          |
| account and sign-in paths      | blocked (`isPreviewBlockedHref`, `src/lib/theme-preview-nav.ts:54`) — a preview never signs anyone in                                            |
| a `?focus=` link               | resolves to a **demo** row (`resolveDemoFocus`), so the clicked product or collection changes with the link instead of repeating one static demo |
| a form submit                  | no live write — the preview's forms are inert                                                                                                    |

The rule behind all of them: **the preview must not be able to write, sign
in, or reach the merchant's data.** A preview that acted would be a
production surface wearing a preview badge.

## 11. Test files to update

A theme change is done when these suites stay green — update them
alongside the theme, not after:

| Suite                                   | What it pins                                                        |
| --------------------------------------- | ------------------------------------------------------------------- |
| `src/lib/themes/<name>/wiring.test.ts`  | Header/footer/homepage builders emit the locked composition (§2.5)  |
| `src/lib/themes/<name>/skins.test.ts`   | Skin defaults resolve; `skins.css` stays token-driven (§4)          |
| `src/lib/themes/<name>/preview.test.ts` | Preview source covers every authored template (§10)                 |
| `src/lib/studio/catalog.test.ts:843`    | Studio twin parity — every catalogue entry stays editable in studio |
| `src/lib/theme-preview-nav.test.ts`     | Preview engine resolves theme sources and blocks account paths      |
| `src/lib/theme-preview.test.ts`         | Preview route renders the resolved preset                           |
| `src/lib/themes/isolation.test.ts`      | No theme imports another theme; shared chrome holds no theme names  |

Skin defaults must survive both the in-memory builders and a
persist/parse round trip (`parseSection` drops undeclared props — a new
`skin` value needs its catalogue field first). Preview sources must return
`null`, not empty arrays, for unauthored templates so the engine can
synthesize the generic demo body.

## 12. WordPress handbook map

Authors coming from WordPress will recognize the shape; the vocabulary
differs. [The archived handbook index](./wordpress-handbook-index.md)
records the September 2026 WordPress chapter list for reference — the
table below is the only mapping this guide maintains:

| WordPress concept                       | Framique equivalent (this guide)                                             |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `theme.json` global settings and styles | `ThemeTokens` + `DEFAULT_GLOBALS` (§2.1)                                     |
| Template hierarchy                      | `TEMPLATE_KEYS` with fixed slot arrays (§2.2)                                |
| Block patterns                          | Catalogue widgets with `defaults` presets (§4)                               |
| Style variations                        | Skins: closed vocabularies + theme defaults (§4)                             |
| Customizer controls                     | Builder inspector: catalogue fields, **Skin** select in the style panel (§4) |
| Theme review guidelines                 | Package gates and the closed rejection list (§9.2–§9.4)                      |
| Submitting and updating themes          | **Export package** → **Themes** screen submit, semver bumps (§9.1, §9.3)     |

Framique has no PHP layer, no `functions.php`, and no child-theme
mechanism: merchant edits live in drafts and versions, and theme upgrades
arrive through the registry, not file overrides.

## 13. Theme isolation (the Elementor rule — read before touching widgets)

A theme **calls** engine widgets; it never **forks** them. Concretely:

1. **One renderer per widget key.** Generic keys (`product_rail`,
   `footer_sitemap`, `store_locator`, …) have exactly one renderer in the
   shared packs. A theme that wants a different look registers a **skin**
   (`WIDGET_SKINS` + `skins.css` + theme defaults, §4), registers a **theme
   presentation** (§14.1), or ships a **new theme-owned widget key**
   (§14.1) — it must never override a generic key in the global merge,
   because last-write-wins then restyles every other theme.
2. **No brand content in shared renderers.** Renderers read props, tokens
   and demo data. A theme name, slogan, copyright line or flagship list
   hardcoded in a shared renderer prints on every theme that uses the
   section (incident 2026-09-27: Songoskriti's footer statement rendered on
   Somvabona's page). Brand copy lives in theme builders and section props.
3. **No cross-theme imports.** Nothing under `src/lib/themes/<A>/` imports
   from `src/lib/themes/<B>/`; shared chrome holds no theme-name branches
   (use the per-key config port pattern). Enforced by
   `src/lib/themes/isolation.test.ts` and the `no-restricted-imports` lint
   layer — both fail fast, see §11.
4. **Own data.** Every theme ships its own demo catalog. Aliasing another
   theme's catalog makes two themes sell the same products.

Violating any of the four is a catalogue rejection for new themes and a
must-fix for shipped ones.

## 14. The unified widget registry — themes dress widgets

The binding product model is **theme = dress, widget = body**. A
`SectionType` key, its renderer contract, and its studio catalogue entry
are platform surface — universal and theme-independent. A theme never
forks them (§13); it dresses them, or — only when a capability is
genuinely unique — ships its own widget under a namespaced id. The
registry layer lives in `src/lib/unified-widget-registry.ts`
(`registerWidget`, `src/lib/unified-widget-registry.ts:929`) plus the
presentation registry `src/lib/theme-presentations.ts`.

Canonical reference: this guide is the home of **theme presentations** and
**source-owned** registration semantics — other documents link
[the theme authoring guide](./creation.md) instead of restating them.

### 14.1 Three layers on a theme's shelf

1. **(a) Shared keys — reuse.** The key ships in the shared renderer maps
   and renders theme-neutrally in every resolution graph. The keyed
   storefront resolves a theme override else the generic map
   (`resolveWidgetComponent`, `src/components/builder/theme-widgets.ts:73-78`);
   the unkeyed editor/studio graph resolves the shared `WIDGET_COMPONENTS`
   map (`src/components/builder/widgets.tsx`). A clean (a) row needs a
   proof pin, not a change.
2. **(b) Theme presentations — dress.** Same key, theme-owned
   markup/styling: `registerThemePresentation(themeKey, widgetId,
Component)` (`src/lib/theme-presentations.ts:97`). Only the owning theme
   renders the dress; every other theme keeps the generic fallback — never
   another theme's brand. Versioned dressings
   (`registerVersionedPresentation`) cover vendor widget versions. A claim
   must be live in its target graph(s) and tested; dormancy requires a
   proof of non-use or supersession.
3. **(c) Theme-owned widgets — new bodies.** A genuinely unique capability
   ships as one `WidgetDef` with `namespace: "theme"`, a namespaced id
   `theme:<key>/<slug>`, a closed `propsSchema`, and `defaults` — registered
   with `registerWidget` (`src/lib/unified-widget-registry.ts:929`).
   Widgets are universal: the def stays insertable under every active
   theme. Under the owning theme the owner component renders; under any
   other theme resolution walks owner → universal body → recoverable
   fallback (`resolvePresentation`, `src/lib/widget-presentation.ts:585`).
   Register the universal body with `registerGenericPresentation(widgetId,
Component)` (`src/lib/theme-presentations.ts:1006`) so a foreign-theme
   cold load renders a complete widget — "Widget preview unavailable" is
   retired for registered components. Without a registered body, the
   placeholder remains the fail-closed last resort (never another owner's
   component).

Tray visibility follows the same model: the studio extension tray lists
registered defs under every active theme (`resolveExtensionTrayEntries`,
`src/components/builder/studio/StudioBuilder.tsx:836`). The legacy
per-theme claim seam (`themeTrayEntries`,
`src/lib/widget-presentation.ts:856`) still powers the older
platform-discovery surfaces; it does not decide renderability.

### 14.2 Source registration — activation is an import graph

Registration is inert until something imports it: a def or registrar
module does nothing until a productive import graph evaluates it. Two
carriers activate a theme:

- **Editor carrier** — the theme's widget pack
  (`src/components/builder/songoskriti.tsx`), reached because
  `src/lib/unified-widget-registry.ts` statically imports the pack.
- **Storefront carrier** — the theme's preview source
  (`src/lib/themes/songoskriti/preview.ts`), reached through the
  preview-source registry (`src/lib/preview-sources.ts`).

**Productive-path rule.** A re-export is not an import root:
`src/lib/themes/songoskriti/index.ts` is a convenience barrel and nothing
in the production graph imports it, so registration placed behind it never
runs. Prove activation by the graph that reaches the module, not by the
barrel.

**Cycle constraint.** The pack and the widget registry import each other's
evaluation windows — a static theme-file → registry import can crash on a
TDZ read or be silently swallowed. Theme-side registration therefore stays
registry-import-free at runtime (type-only imports) and claims through one
of two reviewed patterns: a guarded lazy dynamic self-claim
(`src/lib/themes/songoskriti/ornament-def.ts` — idempotent, first-wins,
rejection-handled) or a lazy hop that receives the already-evaluated pack
(`src/lib/themes/songoskriti/claims-activation.ts`, called from
`src/components/builder/songoskriti.tsx:2642`). Registrars are idempotent:
calling one from every carrier is safe.

### 14.3 Schemas, assets, bilingual copy

The widget contract itself — identity, `propsSchema` (`PropField[]` from
`src/lib/widget-props.ts`), `defaultProps`, slots, rendering modes, and
`themeable` plugin widgets — is canonical in
[the widget contract](../04-builder/app-blocks.md); this guide covers only
what a theme adds. Kinds come from the closed `PROP_KINDS` vocabulary —
unknown kinds fail closed, never a fallback input.

Assets are theme-owned: `public/ph/<key>/…` referenced as
`/ph/songoskriti/…`, with generators under `scripts/`
(`scripts/gen-songoskriti-assets.mjs`). ZIP-lane packages carry an
`assetManifest` instead — see [the package
contract](../packages/contract.md) for the distribution lanes.

Bilingual copy stays inline: every authored string carries its `_bn` twin
filled through the factory dictionary (`src/lib/theme-section.ts`), and
publishing gates বাংলা coverage at or above 90% (§7).

#### Songoskriti asset rules

Theme art lives in `public/ph/songoskriti/` and is referenced as
`/ph/songoskriti/<file>`. `scripts/songoskriti-assets-manifest.mjs` is the
single source of truth for the file set (21 files), and
`scripts/songoskriti-assets-expected.json` freezes each shipped file's
format, geometry and digest.

**Format rule.** A file's bytes must match its extension — JPEG bytes under
a `.png` name are a defect, not a rename. The generator refuses to write a
mismatched payload, and the gate reports `asset.extension_mismatch` and
`asset.format_mismatch` against the manifest.

**Budgets.** 3,000,000 B per file, 28,000,000 B for the set, 2.0 B/px for
PNG, 1.0 B/px for JPEG. A file that breaks one of those budgets is a
finding, not a note.

**Approved locations.** Theme art is the only theme-owned raster set; a copy
of one outside `public/ph/songoskriti/` is a finding too. Alongside it the
theme may use:

- `/api/public/ph/<seed>` placeholder URLs served by the public asset lane —
  never a file-shaped path under `/api/public/ph/songoskriti/…`;
- merchant fonts from the closed catalogue in `src/lib/theme-fonts.ts`, served
  from `/api/public/font/<uuid>/<family>/<weight>.woff2`;
- the two approved Google font origins, `https://fonts.googleapis.com` and
  `https://fonts.gstatic.com`;
- inline Tabler icon components imported from
  `src/components/icons/tabler.tsx` — never an icon file referenced by URL.

**Commands.** `bun run assets:songoskriti` reports every finding across the
theme's asset surface; `bun run assets:songoskriti:gen` replays the
generator's plan against the frozen expectation and prints GREEN when the
set matches. Both run keyless and offline. The release chain runs the first
one (`gates:release`). The font, icon and packaging rules are covered
vitest-side in `src/lib/themes/songoskriti-assets.test.ts`.

##### Seeded catalogue paths

The seeded Songoskriti catalogue is repaired by
`supabase/migrations/20261019000000_songoskriti_asset_paths.sql`, which
creates `public.theme_apply_songoskriti_asset_paths()`. The applied seed
re-applies the retired paths after any demo purge, so re-apply them after a
re-seed:

```sql
select public.theme_apply_songoskriti_asset_paths();
```

Verify afterwards that no retired path remains. The check must cover the
product **and** the collection catalogue: the migration repairs three
collection rows too, and those are the tiles a re-seed brings back, so a
products-only check would report a clean catalogue while three collection
tiles still point at retired assets.

```sql
with allowed(path) as (
  values ('/ph/songoskriti/prod-panjabi.png'),
         ('/ph/songoskriti/prod-saree.png'),
         ('/ph/songoskriti/prod-necklace.png'),
         ('/ph/songoskriti/cat-women.png'),
         ('/ph/songoskriti/cat-newin.png'),
         ('/ph/songoskriti/cat-living.png'),
         ('/ph/songoskriti/cat-jewelry.png')
)
select 'product' as source, p.id::text as id, p.image_url
  from public.products p
 where p.image_url like '/ph/songoskriti/%'
   and p.image_url ~ '\.png$'
   and not exists (select 1 from allowed a where a.path = p.image_url)
union all
select 'collection' as source, c.id::text as id, c.image_url
  from public.collections c
 where c.image_url like '/ph/songoskriti/%'
   and c.image_url ~ '\.png$'
   and not exists (select 1 from allowed a where a.path = c.image_url);
```

It must return **zero rows**. The seven allow-listed paths are the assets that
legitimately keep a `.png` name; every other `.png` path under
`/ph/songoskriti/` is retired. A row in the result is a retired path still in
use — re-run the repair above, then check again.

### 14.4 Visual-parity tests

Parity is proven per surface, from frozen artifacts:

- Freeze fixtures pin serialized compositions and static markup:
  `src/components/builder/songoskriti-port-freeze.test.tsx`.
- Frozen reference stills + capture parameters:
  `docs/superpowers/songoskriti-evidence/port/reference/` and
  `docs/superpowers/songoskriti-evidence/port/reference-manifest.json`.
- Post-port comparison + per-surface verdicts:
  `docs/superpowers/songoskriti-evidence/port/parity-report.md` (after
  stills under `docs/superpowers/songoskriti-evidence/port/after/`).
- Browser journey: `.e2e/songoskriti-editor-journey.spec.ts`.
- Row-level evidence: `docs/superpowers/songoskriti-evidence/port/inventory.md`
  and `docs/superpowers/songoskriti-evidence/port/classification.md`.

### 14.5 Migrating an existing theme (the port recipe)

1. **Inventory** every surface: definition site, editor visibility,
   winning renderer per resolution graph (keyed storefront, unkeyed
   editor/studio), neutrality verdict.
2. **Classify** each row (a)/(b)/(c) against the duplication bar — a
   shared capability is (a) unless the theme needs its own markup (b);
   only a genuinely unique capability is (c).
3. **Land** the rows: prove (a) with per-graph neutrality tests; claim
   (b) presentations through productive carriers; ship (c) defs plus
   universal bodies. Keep carriers lazy and registrars idempotent (§14.2).
4. **Freeze** reference stills before the port, run the after run against
   the frozen manifest, and record verdicts.
5. **Write the row map** and keep it with the port's evidence.

Songoskriti followed exactly this recipe — the result is summarised below
and mapped row-by-row in
[the Songoskriti port map](./songoskriti-port-map.md).

## 15. The Songoskriti reference port at a glance

- **Homepage:** 21 sections / 12 distinct types emitted by
  `buildHomepageMain` (`src/lib/themes/songoskriti/homepage.ts:23`); 9
  intended types in `HOMEPAGE_SECTION_TYPES`
  (`src/lib/themes/songoskriti/types.ts:17`); union 14 (emitted ∪
  {`announcement_bar`, `circle_categories`}). Evidence:
  `docs/superpowers/songoskriti-evidence/port/inventory.md` §§2, A1–A3.
- **Rows:** 59 classified — (a) 11 reuse, (b) 22 presentation, (c) 26
  theme-owned. Evidence:
  `docs/superpowers/songoskriti-evidence/port/classification.md`.
- **Live claims:** 13 theme-fixable presentation claims activated through
  both carriers, plus `mega_menu` already live through its own
  presentation. Dormant with proofs: `announcement_bar`, the
  `footer_sitemap` proof variant, `dressed-hero`, `dressed-reviews`.
- **Parity:** frozen reference at `9e680632`; after run at `b3258d8c` —
  60 passed / 1 skipped (recorded manual-review) / 0 failed — see
  `docs/superpowers/songoskriti-evidence/port/parity-report.md`.
- **Escalated, docs-only this cycle:** the four shared keys with no
  universal body yet (`finder_row`, `craft_story`, `testimonials`,
  `trust_footer`) and the `product_grid` studio delegation bypass.

Per-row lanes, per-graph neutrality verdicts, and live/dormant proof
pointers: [the Songoskriti port map](./songoskriti-port-map.md).

## 16. The official source-owned theme lifecycle

An official theme is **source-owned**: its code lives in this repository, it
resolves through the built-in registry (`src/lib/themes/builtin-themes.ts`),
and it is **installed from source** — no package is built, uploaded,
installed or published for it. The lane's whole difference from a
third-party package is the distribution step; the runtime contract (tenant
authorization, the ledger, the audit, the lifecycle guarantees) is shared.

| step          | the official lane                                                                                                                                                                          | the third-party lane                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| the artifact  | the source definition in `src/lib/themes/<key>/`                                                                                                                                           | an exported `theme.json`                                             |
| the install   | `installCatalogTheme` → tenant rows from the registered definition (`src/lib/themes/appearance.server.ts:393`)                                                                             | `installPackage` (theme lane)                                        |
| the API range | the running builder's own line — no declaration needed                                                                                                                                     | a declared `api` range (≥ 3.1.0 when the package declares `archive`) |
| the seed      | the registry preset, merged **per key** into the merchant's map — a key the merchant already edited is **never** overwritten (`installRegistryTheme`, `src/lib/themes.server.ts:1425`)     | the package's own templates                                          |
| publish       | the merchant's edits are published from the studio (`publishVersion`, `src/lib/themes.server.ts:897`)                                                                                      | the same publish path, gated by the package's declared range         |
| versioning    | the registry's own version line; a theme update merges and diffs the **whole** template map, variants included (`mergeTemplates`, `src/lib/themes.server.ts:1604`)                         | the same merge and diff                                              |
| rollback      | `rollbackVersion` mints a **new** version carrying the target's content and moves the published pointer (`src/lib/themes.server.ts:1020`) — history is append-only, never a pointer rewind | the same                                                             |

Three rules that hold for both lanes, because the lanes share the engine:

1. **No migration, no DDL.** The `templates` map is `jsonb`, keyed by
   template key. A new key is a new object in an existing map — a layout
   written before the key existed resolves to the empty AST, not a crash.
2. **A theme update carries the variants.** The merge and the diff walk the
   **whole** map, not only the base keys, so a merchant's variant survives an
   update.
3. **Every variant is linted with its base key.** A variant AST never
   reaches a merchant's storefront unlinted.

## 17. What the platform keeps: Account, Cart, Checkout and extensions

The theme controls **presentation**. It never controls access, price or
authority. The four surfaces where that matters most:

**Account.** The theme's `account` body is a **frame** around the route's
dashboard. The session, the overview (the `customer_overview` RPC, scoped to
`auth.uid()`), the tab state and every write — the profile save, the address
save and delete, the wishlist toggle, the consent switch — stay with the
platform. A theme may place the merchant's own `profile_card`; it may not
read a field the RPC does not return, and it may not link outside the
`?tab=` set (§2.6).

**Cart.** The lines, the quantities, the totals, the drawer, the progress
trail and the payment rails are platform widgets that read the **live cart**
through the cart context. The theme arranges them and labels them; it does
not price them.

**Checkout.** The theme gets a **frame, not a form**. The route keeps the
`<form>`, the customer fields, the server-quoted totals (`quoteCart`), the
stock hold (`reserveCheckout` / `releaseCheckout`), the validated customer
schema and the order write (`placeOrder`); only the signed return marks an
order paid. The theme's checkout body contributes **no** input element and
**no** form, and the checkout zone forbids the overlay zones — a popup can
never cover a payment step (`TEMPLATE_ZONES.checkout`,
`src/lib/builder-ast.ts:164`).

**Extensions.** A Level B bundle's code runs only inside the `ThemeRuntime`
frame — a null origin, `default-src 'none'`, no host DOM, no cookies, no
same-origin storage — and it talks to the platform only through the
authorised bridge. A theme's JavaScript never runs on the host. The
platform-controlled actions stay platform-controlled: search execution,
tenant scoping, result limits, cart and checkout prices, discounts, stock,
totals, order state, payment rails, account scoping, publication status and
permissions.

## 18. The verification commands and their real status

These are the commands that verify this guide's claims, with the status they
actually returned on **2026-10-22** at `0a794b549315`. The environment has
no `bun` on `PATH`, so each of the `bun run …` forms below is invoked as its
`node_modules/.bin/…` or `node scripts/…` equivalent; the CI pipeline runs
the `bun` form.

| what it proves               | the command                                       | status                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the documentation gate       | `node scripts/doc-gate.mjs`                       | **green** — 0 findings, exit 0                                                                                                                                                                                                                                                                                                                             |
| the unit and contract suites | `node_modules/.bin/vitest run`                    | **red on three pre-existing, environment-bound failures** — 619 files: 616 passed, 1 skipped, 2 failed; 8 769 tests: 8 763 passed, 3 skipped, 3 failed. The three failures are `src/lib/analytics-live-shape.test.ts` (2) and `src/lib/site.server.test.ts` (1); they need a warehouse/`.env` shape CI does not have, and they fail at the base commit too |
| the type checker             | `node_modules/.bin/tsgo --noEmit`                 | **green** — no output, exit 0                                                                                                                                                                                                                                                                                                                              |
| the linter                   | `node_modules/.bin/eslint src scripts`            | **green** — exit 0: 0 errors and 319 pre-existing warnings, none of them added here (a repo-wide `eslint .` stalls on the untracked `.output-snapshots/` tree, so lint the paths)                                                                                                                                                                          |
| the theme's asset gate       | `node scripts/songoskriti-assets-check.mjs`       | **green** — 0 findings, 11 advisory notes                                                                                                                                                                                                                                                                                                                  |
| the asset generator          | `node scripts/gen-songoskriti-assets.mjs --check` | **green** — 21 planned assets match the expectation                                                                                                                                                                                                                                                                                                        |
| the contract gate            | `node scripts/contract-gate.mjs`                  | **expected red**, exit 2 — it hardcodes `spawnSync("bunx", …)` and `bun` is not on `PATH` here                                                                                                                                                                                                                                                             |
| the schema fingerprint       | `node scripts/schema-fingerprint.mjs --check`     | **expected red**, exit 1 — it needs a live Supabase RPC                                                                                                                                                                                                                                                                                                    |

The two reds in the last two rows are **pre-existing and environmental**, not
failures of this guide: neither is fixed, neither is hidden, and neither is
counted as a pass. The remote CI run is a separate matter and is stated
exactly, in the phase-3 CI record.
