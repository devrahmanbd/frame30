# Creating a Framique theme (author guide)

This is the end-to-end guide for shipping a complete storefront theme.
It describes only what exists in this repo — every section links to the
source it came from. The integrator reference (server functions, tables,
registry pipeline, error codes) lives in `./sdk.md`.

## 1. What a complete theme is (definition of done)

A complete theme ships all 12 areas below. Treat this list as acceptance
criteria: a theme missing any area is incomplete and must not be submitted
for catalogue review.

| # | Area | What "done" means | Where it lives |
|---|------|-------------------|----------------|
| 1 | Layout | `header` / `main` / `footer` slot arrays on every template; responsive `bp` overrides per section | `src/lib/builder-ast.ts:79-83`, `src/lib/builder-ast.ts:256-279` |
| 2 | Design system | Full `ThemeTokens` set incl. light + designed `dark` set, `globals`, font pairing | `src/lib/builder-ast.ts:5085-5114`, `src/lib/theme-globals.ts:32-48` |
| 3 | Homepage | `index` template with hero, merchandising, trust and footer composition | `src/lib/theme-presets.ts:123-173`, `src/lib/theme-blueprints.ts:190-246` |
| 4 | Product pages | `product` template: media, price, variant/size, buy box, delivery, reviews/Q&A, related | `src/lib/theme-presets.ts:175-209`, `src/lib/theme-blueprints.ts:247-331` |
| 5 | Collection pages | `collection` template: category header, facets, toolbar, grid, pagination, empty state | `src/lib/theme-presets.ts:211-239`, `src/lib/theme-blueprints.ts:332-394` |
| 6 | Posts / blog | `blog` template: `blog_terms` + `blog_archive` + `blog_pager` + newsletter | `src/lib/theme-presets.ts:291-325`, `src/lib/theme-blueprints.ts:431-463` |
| 7 | Menus | Header nav (`mega_menu`, `nav_menu`, `search_command`, `account_cart`) driven by taxonomy/menu data | `src/lib/builder-ast.ts:1440-1519`, `src/lib/studio/catalog.ts:2029-2044` |
| 8 | Footer | `footer_sitemap`, `payment_icons`, `social_strip`/`support_strip`, about `rich_text` | `src/lib/theme-presets.ts:107-121`, `src/lib/theme-blueprints.ts:113-135` |
| 9 | Widgets with presets | Every widget the theme renders has catalogue defaults and bilingual props filled at build | `src/lib/theme-section.ts:44-68`, `src/lib/studio/catalog.ts:48-64` |
| 10 | Forms | Contact (`form`), newsletter, search, quiz/consult/trade-in submittable patterns (see §5) | `src/lib/studio/catalog.ts:2010-2027`, `src/lib/studio/catalog.ts:2046-2057`, `src/lib/contact.functions.ts:4-24`, `src/lib/newsletter.functions.ts:13-50` |
| 11 | Sign in | Storefront account entry: header `account_cart` link + `src/routes/store.$slug.account.tsx` + `src/routes/account.tsx`; there is **no** sign-in theme template — the theme's job is the link, not the form | `src/lib/studio/catalog.ts:1686-1692`, `src/routes/store.$slug.account.tsx`, `src/routes/account.tsx` |
| 12 | Sign up | Same surface as sign in (merchant console auth at `src/routes/auth.tsx`); theme must not invent its own credential form | `src/routes/auth.tsx` |

Notes on areas 11–12: the template keys are fixed at
`src/lib/builder-ast.ts:46-59` (`index`, `product`, `collection`, `page`,
`blog`, `cart`, `checkout`, `search`). There is no `signin`/`signup`
template key. A theme satisfies 11–12 by wiring the header account entry
and by not breaking the account/checkout routes — not by authoring auth
markup.

## 2. Anatomy

### 2.1 Tokens (light / dark, globals)

The token shape is `ThemeTokens` parsed by `parseTokens`
(`src/lib/builder-ast.ts:5149-5216`). Defaults live at
`src/lib/builder-ast.ts:5085-5107`:

```ts
// src/lib/builder-ast.ts:5085-5107
export const DEFAULT_TOKENS: ThemeTokens = {
  brand: "#0F766E",
  accent: "#0D9488",
  surface: "#FFFFFF",
  ink: "#0F172A",
  radius: "8px",
  fontDisplay: "Noto Sans Bengali",
  fontBody: "Noto Sans Bengali",
  container: "1200px",
  density: "comfortable",      // "dense" | "airy" | "comfortable"
  typeScale: "default",        // "compact" | "expressive" | "default"
  spaceUnit: "16px",
  shadow: "soft",              // "none" | "soft" | "lifted"
  motion: "subtle",            // "none" | "subtle" | "lively"
  digits: "latin",             // "latin" | "bengali"
  locale: "en",                // "en" | "bn"
  currencyDisplay: "symbol",   // "symbol" | "code"
  fontPairing: "bengali-classic",
  dark: null,                  // or { brand, accent, surface, ink }
  globals: DEFAULT_GLOBALS,
  timezone: DEFAULT_MERCHANT_TIMEZONE,
  allowCustomerTimezone: false,
};
```

Designed dark sets are plain objects on `tokens.dark`, e.g. Atelier
(`src/lib/theme-blueprints.ts:643-648`) and Circuit
(`src/lib/theme-blueprints.ts:1248-1253`). Globals are the merchant-editable
palette: `DEFAULT_GLOBALS` (`src/lib/theme-globals.ts:32-48`) seeds four
colours + two fonts; bindings are stored as `var(--fq-g-<id>)`
(`src/lib/theme-globals.ts:50-63`).

### 2.2 Templates per key

`TEMPLATE_KEYS` (`src/lib/builder-ast.ts:46-59`):

```ts
export const TEMPLATE_KEYS = [
  "index", "product", "collection", "page",
  "blog", "cart", "checkout", "search",
] as const;
```

Each template is a `ThemeAst` (`src/lib/builder-ast.ts:281-286`):
`{ header: Section[], main: Section[], footer: Section[] }`.

Reference compositions:

- Code presets build all eight keys in `build()`
  (`src/lib/theme-presets.ts:387-407`), with per-key builders at
  `indexTemplate` (`:123`), `productTemplate` (`:175`),
  `collectionTemplate` (`:211`), `searchTemplate` (`:246`),
  `pageTemplate` (`:266`), `blogTemplate` (`:291`), `cartTemplate` (`:327`),
  `checkoutTemplate` (`:353`).
- Blueprints author six templates by hand and derive `search` from
  `collection` via `withSearch()` (`src/lib/theme-blueprints.ts:56-80`).
- Route-supplied `<h1>` templates (`product`, `collection`, `page`, `blog`,
  `search`) must NOT contain an h1-claiming widget; every other template
  must contain exactly one (`src/lib/builder-ast.ts:61-77`).

### 2.3 Sections (type + props)

`Section` (`src/lib/builder-ast.ts:256-279`):

```ts
export type Section = {
  id: string;                 // globally unique, see §3
  type: SectionType;          // src/lib/builder-ast.ts:85-243
  props: Record<string, PropValue>;
  children?: Section[];       // only when catalogue flags container: true
  hidden?: Breakpoint[];      // per-breakpoint visibility
  bp?: Partial<Record<Breakpoint, Record<string, PropValue>>>;
  invalid?: string;
  when?: VisibilityRule[];
  ab?: { experiment: string; variant: string };
};
```

- `PropValue = string | number | boolean | PropRow[]`
  (`src/lib/builder-ast.ts:245-250`); repeatable rows cap at
  `MAX_ARRAY_ROWS = 24` (`:250`); nesting caps at `MAX_TREE_DEPTH = 6`,
  `MAX_NODES_PER_TEMPLATE = 300` (`:252-254`).
- Field kinds for the inspector: `text | textarea | number | select | url |
  boolean | embed | bitext | color | range | image | taxonomy | unit |
  group | html | array | menu` (`src/lib/builder-ast.ts:299-316`).
- `CatalogEntry` (`src/lib/builder-ast.ts:355-371`) declares label, group,
  slots, `heading` (h1-claim), `templates` scope, `container`, `defaults`,
  `fields`.

### 2.4 Presets vs blueprints

- **Preset** (`ThemePreset`, `src/lib/theme-presets.ts:37-50`): `{ key,
  nameEn, nameBn, summaryEn, summaryBn, category, version, api, sortOrder,
  tokens, templates }`. `SPECS` (`:421-778`) + `SHIPPED_BLUEPRINTS`
  (`:785-788`) form `THEME_PRESETS`. Lookup: `presetByKey()`
  (`:790-792`). Preset swap without content loss: `applyPreset()`
  (`:824-850`).
- **Blueprint** (`src/lib/theme-blueprints.ts:1-12`): vertical themes
  (Bazaar, Atelier, Circuit, Rupaboti) built through the shared section
  factory, plus the split-out `src/lib/themes/clothing-heritage/`
  directory (`index.ts` wires `tokens/header/footer/homepage/secondary`;
  shipped keys at `src/lib/theme-blueprints.ts:578` via
  `SHIPPED_BLUEPRINT_KEYS`, re-exported into `THEME_PRESETS`
  (`src/lib/theme-presets.ts:785-787`)). The curated offer ships
  Supershop + Clothing Heritage.
- **Catalogue metadata** (`src/lib/themes/catalog-meta.ts:13-21`):
  `{ author, subjects, features, layouts, tags, rating, installs }`.
  `rating`/`installs` are honest zeros until marketplace telemetry exists
  (file header `:1-11`); `catalogMeta()` falls back to `FALLBACK`
  (`:235-247`).

## 3. Building step-by-step

### Step 1 — Tokens

Start from `DEFAULT_TOKENS` and override brand/accent/surface/ink plus
layout knobs. Copy an existing `tokens({...})` call, e.g. Atelier
(`src/lib/theme-blueprints.ts:618-644`), heritage
(`src/lib/themes/clothing-heritage/tokens.ts`), or a preset
`Spec.tokens` (`src/lib/theme-presets.ts:432-444`). Heritage dark sets
live beside the light set in the same file.

### Step 2 — Templates

Write one builder per template key returning `{ header, main, footer }`.
Follow the slot discipline in §2.2 and keep the h1 rule
(`src/lib/builder-ast.ts:67-77`). For search, reuse the collection listing
via `withSearch()` (`src/lib/theme-blueprints.ts:56-80`) — do not duplicate
the listing by hand.

### Step 3 — Sections

Always build sections through the shared factory so ids stay unique and
বাংলা props are filled (`src/lib/theme-section.ts:44-68`):

```ts
// Minimal preset skeleton — copy, rename, extend.
import { DEFAULT_TOKENS } from "@/lib/builder-ast";
import type { ThemePreset } from "@/lib/theme-presets";
import { sectionFactory } from "@/lib/theme-section";
import { PRESET_BN } from "@/lib/theme-presets.bn";

const s = sectionFactory(PRESET_BN);

export function myTheme(): ThemePreset {
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
    key: k,
    nameEn: "My theme",
    nameBn: "মাই থিম",
    summaryEn: "One-line English summary.",
    summaryBn: "এক লাইনের বাংলা সারাংশ।",
    category: "general",
    version: "1.0.0",
    api: "^3.0.0",
    sortOrder: 140,
    tokens: { ...DEFAULT_TOKENS, brand: "#0F766E", accent: "#0D9488", surface: "#FFFFFF", ink: "#0F172A" },
    templates: {
      index: {
        header: header(),
        main: [
          s(k, "hero", { heading: "Welcome", subheading: "", ctaLabel: "Shop now", ctaHref: "#products", align: "left" }),
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
          s(k, "category_header", { heading: "All products", body: "", showCount: true, showBreadcrumb: true, homeLabel: "Home" }),
          s(k, "product_grid", { heading: "All products", limit: 24, columns: 4 }),
        ],
        footer: footer(),
      },
      search: {
        header: [s(k, "breadcrumb", { homeLabel: "Home" })],
        main: [
          s(k, "heading", { text: "Search results", level: "h1", align: "left" }),
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
          s(k, "blog_archive", { heading: "", layout: "grid", columns: 3, limit: 9, showCover: true, showExcerpt: true, showMeta: true, emptyText: "No articles yet." }),
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
          s(k, "checkout_steps", { heading: "", step1: "Cart", step2: "Details", step3: "Payment", step4: "Done", activeStep: 3 }),
          s(k, "cart_lines", { heading: "" }),
          s(k, "cart_summary", { heading: "Order summary" }),
          s(k, "payment_methods", { heading: "", note: "", emptyText: "No payment method is enabled yet." }),
        ],
        footer: footer(),
      },
    },
  };
}
```

Prop names above are the catalogue `defaults` keys for each widget in
`src/lib/builder-ast.ts` (e.g. `hero` `:581-610`, `cart_summary`
`:987-1032`, `blog_archive` per `blogTemplate`
`src/lib/theme-presets.ts:301-315`). Never invent a prop — copy the key
from the catalogue entry.

### Step 4 — `presets` entry

Add a `Spec` to `SPECS` (`src/lib/theme-presets.ts:421-778`) or a builder
function merged into `THEME_PRESETS` (`:785-788`). Required fields:
`key, nameEn, nameBn, summaryEn, summaryBn, category, sortOrder, tokens,
banner, bannerTone, hero, sub, ctaLabel, about, columns, gridHeading,
heroAlign, addToCartLabel, faq, trust` (type `Spec`, `:52-89`).

### Step 5 — `catalog-meta` entry

Add the key to `CATALOG_META` (`src/lib/themes/catalog-meta.ts:30-233`).
Subjects/features/layouts drive the Feature filter drawer
(`src/lib/themes/appearance.ts:67-116`); keep `rating: 0, installs: 0`
until real telemetry exists (no-fabrication rule, file header `:1-11`).
This file is the metadata floor — SQL rows override it at runtime
(`src/lib/themes/appearance.server.ts:123-144`).

### Step 6 — Registry seed

```bash
# Regenerate the seed migration from code presets (curated keys inside
# scripts/seed-theme-registry.ts:16), review, then apply live as supabase_admin.
bun scripts/seed-theme-registry.ts > supabase/migrations/<timestamp>_theme_registry_seed.sql
```

Semantics: `INSERT ... ON CONFLICT (key) DO UPDATE`
(`scripts/seed-theme-registry.ts:46-51`); current seed keys are
`supershop` + `clothing-heritage` (`:16`). Generated migrations look like
`supabase/migrations/20260922090000_theme_registry_seed.sql:15-16`.

### Step 7 — Install / publish / activate lifecycle

```ts
// Appearance desk (merchant scope). Permission: themes.update except where noted.
import { themeInstallFn, themeActivateFn } from "@/lib/themes/appearance.functions";
import { builderPublishFn, builderInstallFn } from "@/lib/themes.functions";

// 1. Install a catalogue theme -> NEW INACTIVE row + v1 published + draft
//    + ledger row (src/lib/themes/appearance.server.ts:174-297).
await themeInstallFn({ key: "my-theme" });

// 2. Edit the draft (autosave/commit), then publish. Publish blocks on
//    lint errors + <90% বাংলা + font/contrast gates
//    (src/lib/themes.server.ts:382-448).
await builderPublishFn({ themeId, templates, tokens, note: "First release" });

// 3. Activate. The guard adopts the valid published pointer, else the newest
//    published version — never a draft (src/lib/themes/appearance.server.ts:310-349).
await themeActivateFn({ id: themeId });
```

Full function inventory with input shapes is in `./sdk.md` §1.

## 4. Widgets with presets

- Register catalogue widgets a theme renders by using their exact
  `SectionType` and prop keys. The builder catalogue is `BASE_CATALOG` +
  phase packs in `src/lib/builder-ast.ts` (chrome `:1280-1519`,
  merchandising `:1521-1660`, PDP `:1661-1895`, collection/search
  `:1896-...`, cart/checkout, Atelier/Circuit/Rupaboti/heritage packs).
  The studio panel mirror is `WIDGETS` in `src/lib/studio/catalog.ts:48+`
  with per-widget `defaults` (e.g. `form` `:2010-2027`, `nav_menu`
  `:2029-2044`, `newsletter` `:2046-2057`).
- Prop conventions: **flat scalars** (`string | number | boolean`) plus
  repeatable `PropRow[]` arrays (`src/lib/builder-ast.ts:245-250`).
  Bilingual text uses `bitext` fields with `${key}_bn` twins filled via
  `withBn()` at construction (`src/lib/theme-section.ts:23-39`) — pass the
  theme dictionary (`PRESET_BN` / `BLUEPRINT_BN`) to `sectionFactory()`
  (`src/lib/theme-section.ts:61-68`).
- Responsive: `hidden: ["mobile"]` and `bp: { tablet: {...}, mobile: {...} }`
  (`src/lib/theme-presets.ts:91-93`, `src/lib/theme-blueprints.ts:40-42`).
- Containers only: `children` is accepted solely on catalogue entries
  flagged `container: true` (`src/lib/builder-ast.ts:261-265`); trees cap
  at `MAX_TREE_DEPTH`/`MAX_NODES_PER_TEMPLATE` (`:252-254`).

## 5. Forms + auth pages

Submittable patterns (server validates, client never decides):

- **Contact**: fixed `form` widget defaults
  (`src/lib/studio/catalog.ts:2010-2027`: heading/body/labels/button/
  successText/consentText/showPhone) → `submitContactFn`
  (`src/lib/contact.functions.ts:4-24`) with
  `{ name, email, phone?, topic: "sales"|"support"|"migration", message,
  locale, honeypot?, renderedAt? }`.
- **Newsletter**: `newsletter` widget (`src/lib/builder-ast.ts:827-845`,
  `src/lib/studio/catalog.ts:2046-2057`) → `subscribeNewsletterFn` /
  `verifyNewsletterFn` / `unsubscribeNewsletterFn`
  (`src/lib/newsletter.functions.ts:13-50`).
- **Search**: `search_command` widget (`src/lib/builder-ast.ts:1489-1506`)
  rendering into the `search` template (`src/lib/theme-presets.ts:246-264`).
- **Other submittables**: `quiz`, `trade_in`, `back_in_stock`,
  `bundle_builder`/`bundle_offer`, `gift_builder`, `consult_cta` — each posts
  to its server path and renders the returned result (see catalogue
  `defaults` in `src/lib/builder-ast.ts` and the studio mirror in
  `src/lib/studio/catalog.ts`).
- **Sign in / sign up pages**: required as *routes*, not templates. Ship the
  header `account_cart` entry (`src/lib/studio/catalog.ts:1686-1692`) and
  keep `src/routes/store.$slug.account.tsx`, `src/routes/account.tsx` and
  `src/routes/root/login.tsx` reachable. Do not author credential inputs
  inside theme sections.

## 6. Demo data

Granular, idempotent import RPCs read blueprints from `theme_registry`
(`scripts/seed-theme-registry.ts:4-7` — an empty registry makes every demo
import a noop):

| Step | Server fn (`src/lib/themes.functions.ts`) | Service (`src/lib/theme-imports.server.ts`) | SQL |
|------|-------------------------------------------|---------------------------------------------|-----|
| Preflight (read-only conflicts) | `importPreflightFn` (`:208-217`) `{ themeKey }` | `importPreflight` (`:108-159`) | — |
| Slides (hero_carousel; `hero` fallback for repeater-shaped blueprints — themes whose hero is a `hero` repeater widget rather than `hero_carousel`) | `importThemeSlidesFn` (`:219-228`) | `importThemeSlides` (`:273-309`) | `import_theme_slides` (`supabase/migrations/20260920_import_rpcs.sql:15-150`, amended `20260922090100_import_slides_hero.sql:8-190`) |
| Media | `importThemeMediaFn` (`:230-239`) `{ themeKey, overwrite? }` | `importThemeMedia` (`:315-360`) | `import_theme_media` |
| Products (+variants, collections link) | `importThemeProductsFn` (`:241-258`) `{ themeKey, overwrite? }` (+ catalog) | `importThemeProducts` (`:367-414`) | `import_theme_products` |
| Posts (articles + storefront pages) | `importThemePostsFn` (`:260-269`) `{ themeKey, overwrite? }` | `importThemePosts` (`:420-465`) | `import_theme_posts` |
| All four in order | `importThemeAllFn` (`:271-280`) `{ themeKey, overwrite? }` | `importThemeAll` (`:471-522`) | slides → media → products → posts |
| Legacy one-shot | `builderDemoImportFn` (`:192-201`) `{ themeKey }` | `importDemoContent` (`src/lib/themes.server.ts`) | blueprint-dependent |
| Purge demo rows | `builderDemoPurgeFn` (`:282-288`) | `purgeDemoContent` (`src/lib/themes.server.ts`) | `is_demo` flags (`supabase/migrations/20260917210000_phase2e_theme_engine.sql:7-10`) |

Preflight + overwrite rules:

- Preflight compares demo slugs against live `products`, `collections`,
  `storefront_pages`, `articles` slugs and `media_assets` file names
  (`src/lib/theme-imports.server.ts:42-52`, `:108-159`); conflicts are a
  sorted intersection (`matchConflicts`, `:64-79`).
- `overwrite: true` first deletes **only** colliding rows in FK order
  (links → variants → products → collections/categories, then pages/posts/
  media) via `removeImportConflicts()` (`:185-267`); non-colliding merchant
  rows are never touched.
- Without `overwrite`, each sub-import noops independently when its data
  already exists (`status: "noop"`, reasons like `slides_already_exist`,
  `blueprint_not_found`, `no_theme`).

## 7. Publishing checklist + common pitfalls

Publishing checklist:

1. `lintTemplate()` per key has zero `error`-level issues
   (`src/lib/builder-ast.ts:5972`; enforced in
   `src/lib/themes.server.ts:393-399`).
2. Translation gate: authored-string বাংলা coverage ≥
   `TRANSLATION_PUBLISH_FLOOR = 90` (`src/lib/builder-guardrails.ts:148`,
   `:166-179`).
3. Font licence + budget gates pass (`src/lib/themes.server.ts:404-416`).
4. `composePublishGate()` is green
   (`src/lib/publish-gates.ts:262-...`, called at
   `src/lib/themes.server.ts:419-431`).
5. Publish creates a `published` version and moves
   `store_themes.published_version_id` (`theme_publish`,
   `supabase/migrations/20260917210000_phase2e_theme_engine.sql:96-120`).
6. Rollback path known: `builderRollbackFn({ versionId })` →
   `theme_rollback` RPC, custom code restored
   (`src/lib/themes.server.ts:450-478`).

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
  instead of hand-editing SQL.
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

| Effect | Prop | Values | Default |
|--------|------|--------|---------|
| Hero wash | `atmosphere` on `hero` | `"wash" \| "none"` | `"wash"` |
| Banner surface | `surface` on `editorial_banner` | `"glass" \| "card"` | `"card"` |
| Entrance | `advAnimation` (Advanced tab, every widget) | `"none" \| "fade" \| "rise" \| "slide-left" \| "slide-right" \| "zoom"` | `"none"` |

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
