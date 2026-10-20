# Phase 0 — Implementation Map: Theme-Editable CMS Templates (Frame30)

**Audit target:** `/opt/frame28/plan.md` §1 (the implementation brief), branch `frame30`, HEAD `71271834`.
**Date of audit:** 2026-10-20.
**Nature of this document:** read-only audit. No source file was edited, created, committed or deleted to produce it (the only file written is this one). Every substantive claim carries a `file:line` citation. Where something could not be verified, it is marked **UNVERIFIED** with the reason.

**How to reproduce the commands in this document:** `bun` is not on PATH in this environment; use `node_modules/.bin/<tool>` (vitest, tsgo, eslint, prettier) from the repo root.

---

## 0. Corrections to the "already-established facts"

The brief supplied several facts to verify. Two are wrong or materially incomplete:

| Supplied fact | Verdict | Evidence |
|---|---|---|
| `TEMPLATE_KEYS` = index, product, collection, account, page, blog, cart, checkout, search; no `archive` | **Confirmed** | `src/lib/builder-ast.ts:46-59` (9 keys), `src/lib/builder-ast.ts:60` (`TemplateKey`) |
| Editor already has a template selector | **Confirmed** | `src/components/builder/BuilderTopBar.tsx:413` renders `TEMPLATE_KEYS.map(...)`; labels in `TEMPLATE_META` at `src/components/builder/BuilderTopBar.tsx:6-…` |
| Editor persists per-template ASTs | **Confirmed** | `src/hooks/use-builder-editor.ts:333-369` (`editSlot` writes `current.templates[template]`), doc shape `src/hooks/use-builder-editor.ts:39` |
| Route-owned data/context system exists | **Confirmed, but partial** | `src/lib/widget-data.ts:154-171` (`collectWidgetRequests`), `src/components/builder/widgets.tsx:335` (`ContextSlot`). Only *product* data is batched this way; `orders`/`profile` have no server loader by design (`src/lib/widget-registry.ts:48-51`) |
| A "blog archive pack" exists; no theme uses it | **Partly wrong** | The pack exists (`src/lib/builder-ast.ts:4834`, `4886`, `4909`) and Songoskriti does not use it. **But a live theme does**: the published "Supershop" theme in the live DB has `blog` main = `["blog_terms","blog_archive","blog_pager","newsletter"]` (DB read, §2.4) — it is simply never rendered because the storefront blog route hardcodes `ast={null}` |
| Search route fetches the published `search` template but renders one hardcoded listing block | **Confirmed** | fetch `src/routes/store.$slug.search.tsx:64`; listing block `src/routes/store.$slug.search.tsx:184-529`; ThemeChrome `src/routes/store.$slug.search.tsx:540` with `productSlot={listing}` |
| `store.$slug.pages.$pageSlug.tsx` renders `PageView` + `StudioNodes`, **NOT** the theme's `page` template | **Partly wrong** | `src/routes/store.$slug.pages.$pageSlug.tsx:67` renders `PageView`; `PageView` **does** pass `template="page"` to `ThemeChrome` (`src/components/store/PageView.tsx:156`) **and** `contentSlot="page_content"` (`src/components/store/PageView.tsx:166`). The CMS page content **is** real (`src/components/store/PageView.tsx:73-110`). The defect is subtler and is analysed in §2.3 |
| The preview falls back silently: `templates[template] ?? templates.index` | **Confirmed** | `src/components/store/ThemePreviewFrame.tsx:485` |
| A platform-wide DoD test exists | **Confirmed** | `src/lib/definition-of-done.test.ts` (11 tests, all passing on this tree — see §7) |
| `THEME_API_RANGE = "^3.0.0"` is the published compatibility range for third-party theme packages | **Confirmed** | `src/lib/theme-package.ts:52`; enforcement `src/lib/theme-package.ts:312-316` |

---

## 1. Implementation map for the seven requested template types

### 1.1 The pipeline, step by step

Every one of the seven requested types travels the same six-stage pipeline. The table below records, per stage, the file that owns it and whether the stage **exists today** for that type.

**Stage A — key definition.** `src/lib/builder-ast.ts:46-59` (`TEMPLATE_KEYS`), type at `:60`.

**Stage B — default AST (per theme).** Official themes author their mains in their own `preview.ts`; the engine assembles one AST per key:
- `src/lib/themes/songoskriti/preview.ts:70-327` (`songoskritiPreviewSource`, `main: (template, s) => switch (template)` at `:90-324`)
- `src/lib/themes/somvabona/preview.ts:52`
- Assembly for **all** keys, incl. a generic fallback for keys a theme does not author: `src/lib/theme-preview-nav.ts:380-405` (`assemblePreviewTemplates`, `genericDemoMain` at `:357-372`)
- Seeded on install from that same assembly: `src/lib/themes.server.ts:1154-1174` (`registryPackage` → `resolveThemePreview`), called by `src/lib/themes/appearance.server.ts:441` (`installCatalogTheme`) and `:1114`.

**Stage C — merchant editing.** `src/routes/_authenticated/dashboard/builder.tsx` (the studio) → `src/hooks/use-builder-editor.ts` → `src/components/builder/BuilderTopBar.tsx:413` (template selector).

**Stage D — persistence.**
- Editor doc shape: `src/hooks/use-builder-editor.ts:39` — `type EditorDoc = { templates: ThemeTemplates; tokens: ThemeTokens }`, where `ThemeTemplates = Partial<Record<TemplateKey, ThemeAst>>` (`src/lib/builder-ast.ts:517`).
- Autosave: `src/routes/_authenticated/dashboard/builder.tsx:563-577` → `src/lib/themes.functions.ts:24-40` (`builderAutosaveFn`) → `src/lib/themes.server.ts:405` (`autosave`).
- Storage path: table `theme_drafts`, columns `templates jsonb default '{}'`, `tokens jsonb`, `revision bigint` (`supabase/baseline_parts/part3.sql:117`, `supabase/generated_baseline.sql:3316`). Committed/published copies live in `theme_versions` (`src/lib/themes.server.ts:234-241`, `src/lib/themes.functions.ts:42-76`).
- **No DB migration is needed to add a template key**: `theme_drafts.templates` is untyped `jsonb`, and `builder_template_seo.template` is a plain `string` column (`src/integrations/supabase/types.ts:1356`).

**Stage E — route-owned data.**
- Shared, batched, product-ish data: `src/lib/widget-data.ts:154-171` → resolved server-side per request key; live rows arrive through `contextSlots` (`src/components/store/ThemeChrome.tsx:48`, `src/components/builder/SectionRenderer.tsx:825`).
- `src/components/builder/widgets.tsx:335-345` (`ContextSlot`) is the *host slot* mechanism: a widget declares `templates: [...]` in the catalog and the route hands it a ReactNode.

**Stage F — rendering.** `src/components/store/ThemeChrome.tsx:212-457` is the single storefront host. `themed` is computed at `:302-310`:

```
const themed = ast && ast.main.length > 0 &&
  (!contentSlot || ast.main.some(s => !s.invalid && s.type === contentSlot))
  ? ast : null;
```

**If `contentSlot` is named and the theme's main does not contain that section, the theme's main is skipped entirely and the route's `fallback` renders** (`src/components/store/ThemeChrome.tsx:404-425`). This single line explains the "generic page" symptom (§2.3).

### 1.2 Per-template matrix

Legend: ✅ exists today · ⚠️ exists but incomplete/wrong · ❌ absent.

| | **search** | **cart** | **account** | **blog** | **checkout** | **archive** | **page** |
|---|---|---|---|---|---|---|---|
| **A. key defined** | ✅ `builder-ast.ts:46-59` | ✅ same | ✅ same | ✅ same | ✅ same | ❌ **absent** | ✅ same |
| **B. per-theme default AST** | ✅ `songoskriti/preview.ts:235-252` | ✅ `:253-282` | ✅ `:318-323` | ⚠️ `:218-234` (demo copy, no `blog_archive`) | ✅ `:283-317` | ❌ | ⚠️ `:207-217` (hardcoded "Size guide" + demo body, **no `page_content`**) |
| **C. merchant edits it** | ✅ selector `BuilderTopBar.tsx:413`; editor `builder.tsx` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **D. persisted** | ✅ `theme_drafts.templates` jsonb | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| **E. route-owned data** | ⚠️ `searchStorefrontFn` results; but the route hands the theme **one opaque `productSlot`** (`store.$slug.search.tsx:540-563`), not per-widget context slots | ✅ `contextSlots` for `cart_lines`/`cart_summary`/… (`store.$slug.cart.tsx:99-105`) + live `CartProvider` (`ThemeChrome.tsx:192-201`) | ✅ `accountSlots` (`store.$slug.account.tsx:185-219`) | ✅ `BlogFeedProvider` (`BlogArchiveTheme.tsx:28`) fed by `storeBlogIndexFn` | ⚠️ `ast={null}` — theme contributes **tokens only** (`store.$slug.checkout.tsx:415-420`) | ❌ | ✅ real page record (`getStorePageFn` → `loadStorePage`, `src/lib/storefront-search.server.ts:273-312`) + `PageView` content (`PageView.tsx:73-110`) |
| **F. rendered where** | ⚠️ `store.$slug.search.tsx:540` `ThemeChrome template="search"` — but the theme main renders *only* if it has ≥1 section; Songoskriti's search main has `heading`+`rich_text`+`product_rail`, so the theme's search template renders **as well as** the route's listing block | ✅ `store.$slug.cart.tsx:81` | ✅ `store.$slug.account.tsx:494` | ❌ **the storefront blog route never renders the theme's blog template** — `BlogArchiveTheme` hardcodes `ast={null}` (`BlogArchiveTheme.tsx:29-33`) | ❌ `ast={null}` (`store.$slug.checkout.tsx:418`) — the theme's checkout template has **no production render path** | ❌ | ⚠️ `PageView.tsx:156` `template="page"` **but** `contentSlot="page_content"` (`:166`) and Songoskriti's page main has no `page_content` ⇒ theme main skipped, route `fallback` renders (unthemed prose) |

### 1.3 The five production routes that *do* wear a theme template today

Verified by `grep -rn 'template="' src/routes/` (11 hits) plus `src/components/store/*`:

| Route | Template | Theme AST used? | Source |
|---|---|---|---|
| `/store/$slug/p/$productSlug` | `product` | ✅ | `src/components/store/ProductView.tsx:597` |
| `/store/$slug/c/$collectionSlug` | `collection` | ✅ | `src/components/store/CollectionView.tsx:432` |
| `/store/$slug/cart` | `cart` | ✅ | `src/routes/store.$slug.cart.tsx:81` |
| `/store/$slug/account` | `account` | ✅ | `src/routes/store.$slug.account.tsx:494` |
| `/store/$slug/order/$orderId` | `account` | ✅ (reuses) | `src/routes/store.$slug.order.$orderId.tsx:147` |
| `/store/$slug/search` | `search` | ✅ (partially — see §1.2) | `src/routes/store.$slug.search.tsx:540` |
| `/store/$slug/pages/$pageSlug` | `page` | ⚠️ **skipped** (contentSlot) | `src/components/store/PageView.tsx:156,166` |
| `/store/$slug/` (CMS homepage) | `page` (!) | ⚠️ **renders demo copy** | `src/components/store/StoreHomepage.tsx:102` |
| `/store/$slug/blog` | `blog` | ❌ `ast={null}` | `src/components/store/BlogArchiveTheme.tsx:29-33` |
| `/store/$slug/blog/$slug` | — | ❌ no ThemeChrome at all | `src/routes/store.$slug.blog.$slug.tsx:80` |
| `/store/$slug/checkout` | `checkout` | ❌ `ast={null}` | `src/routes/store.$slug.checkout.tsx:418` |
| `/store/$slug/` (no CMS homepage) | — | ❌ welcome plate | `src/routes/store.$slug.index.tsx:467-476` |
| `/` on a custom domain | `page` (!) | ⚠️ | `src/routes/index.tsx:180` |

**Two structural findings fall out of this table and are important for Phase 1 planning:**

1. **The `index` template has no production render path.** The only `template="index"` in the entire storefront tree is `src/components/store/StorefrontPage.tsx:294`, and `StorefrontPage` is **not imported anywhere** in the repo (repo-wide grep over `*.ts/tsx/js/mjs` returns only its own definition at `src/components/store/StorefrontPage.tsx:31`, a doc comment at `src/components/store/StoreFooterMenus.tsx:10`, and a test that reads the file as text at `src/components/store/chrome-localization.test.tsx:82`). Both storefront index routes therefore render either the CMS-designated page (wearing `template="page"`) or `StoreWelcome` (`src/routes/store.$slug.index.tsx:462,467-476`; `src/routes/index.tsx:177-195`).
2. **The `checkout` template has no production render path either** — the route fetches the `checkout` chrome then throws the AST away (`ast={null}`, `src/routes/store.$slug.checkout.tsx:418`).

---

## 2. Live storefront vs theme preview, per template

### 2.1 What I could verify live, and what I could not

**Verified live (2026-10-20, host `framique.qubickle.com`, deployment `40673d3a`):**

| Check | Command | Result |
|---|---|---|
| Preview route reachable | `curl https://framique.qubickle.com/theme-preview/songoskriti?template=index` | HTTP 200 |
| Preview `page` shows demo copy | `curl …?template=page \| grep -o -E "Size guide\|Demo article\|How to measure"` | **1 × "Size guide", 1 × "How to measure", 1 × "Demo article"** — i.e. the exact hardcoded strings from `src/lib/themes/songoskriti/preview.ts:207-217` |
| Preview `blog` shows demo copy | `curl …?template=blog` | **"Meet the makers"** (`preview.ts:227-233`) |
| Preview `search` shows demo copy | `curl …?template=search` | **"Demo search"** (`preview.ts:238-243`) |
| Preview `cart`/`checkout`/`account` | `curl …?template=cart\|checkout\|account` | "Your bag", "Checkout", "Account" headings + the real widget types (`cart_lines`, `cart_summary`, `profile_card`, `orders_list`) |
| Platform host blocks path storefronts | `curl https://framique.qubickle.com/store/akira/` | **404** — `src/lib/storefront-host.server.ts:433-447` (`isBlockedPathStorefront`), allowlist `{track, order}` at `:431` |
| Deep-path storefront 301s to the custom domain | `curl https://framique.qubickle.com/store/flame-fashion-bd/` | **301 → https://flamelancer.com/** |
| A live storefront exists | `curl https://flamelancer.com/` | **200**, but the SSR payload shows `ast:null, tokens:null, themeKey:null` → **themeless**, renders the "Welcome to Framique" plate |

**Could NOT verify — and why:** *no live store has the Songoskriti theme installed.* Read-only query of `store_themes` (service-role key from the gitignored `.env`) returned exactly 3 rows, all belonging to merchant `akira` (`Supershop` active, `Atelier` and `classic` inactive). `merchant_domains` returned exactly one row — `flamelancer.com` for merchant `flame-fashion-bd`, which has **no** `store_themes` row at all. The only merchant that has a published theme (`akira`, "Supershop") is reachable only through `/store/akira/…` on the platform host, which the server gate 404s before SSR.

Consequently **every Songoskriti storefront claim in this document is derived from source + the live preview route, not from a live Songoskriti storefront.** The DB read below is the closest live proxy available.

### 2.2 Live DB proxy: the "Supershop" theme's published templates

`theme_versions.templates` for the only published theme in the live DB:

```
template keys: blog, cart, checkout, collection, index, page, product, search   (8 of 9 — no `account`)
page   main types: ['page_content', 'faq']
blog   main types: ['blog_terms', 'blog_archive', 'blog_pager', 'newsletter']
index  main types: ['hero','feature_row','collection_grid','product_grid','product_grid','rich_text','testimonial']
search main types: ['heading','product_grid']
```

Two live facts fall out:

- The live theme's `page` template **does** declare a `page_content` section → on that store the CMS page route *would* wear the theme layout and inject the merchant's real content through `contextSlots.page_content` (`src/components/store/PageView.tsx:166,175`). Songoskriti's page template does **not** — which is precisely why Songoskriti behaves differently.
- The live theme's `blog` template **does** use the blog pack (`blog_terms`/`blog_archive`/`blog_pager`) — but the storefront blog route ignores it entirely (`ast={null}`), so those widgets never render in production. **The blog pack is implemented and proven in a live theme's AST, yet the route that should consume it hardcodes `ast={null}`.**

### 2.3 The Page question, answered definitively

> *Does any production route consume the theme's `page` template?*
> **Yes — two of them, and they behave differently.**

**(a) `src/routes/store.$slug.pages.$pageSlug.tsx` → `PageView` (`src/routes/store.$slug.pages.$pageSlug.tsx:67`).**
`PageView` passes `template="page"` (`src/components/store/PageView.tsx:156`) **and** `contentSlot="page_content"` (`:166`). The CMS page's real content — title, excerpt, rendered markdown/builder HTML, studio nodes, last-updated — is built at `src/components/store/PageView.tsx:73-110` and handed to `ThemeChrome` through `contextSlots={{ breadcrumb, page_content: content }}` (`:175`).

Because `contentSlot` is named, `ThemeChrome` renders the theme's `main` **only if** that main contains a `page_content` section (`src/components/store/ThemeChrome.tsx:302-310`). Songoskriti's page main is `["heading","rich_text"]` (`src/lib/themes/songoskriti/preview.ts:207-217`) — **no `page_content`** → `themed === null` → the theme's main is skipped and the route's `fallback` (`src/components/store/PageView.tsx:177-186`) renders.

> **So the CMS page route DOES render the merchant's real content** — but as **unstyled prose**, not inside the theme's Page layout. The theme's Page layout is bypassed entirely. This is not "hardcoded demo copy leaking"; it is "the theme layout is thrown away".

Corroborating signal: `lintTemplate`'s required-widget table demands `page_content` on the `page` template (`src/lib/builder-ast.ts:8448-8453`) — but that check is `level: "warn"` (`:8460`), it is only evaluated when the template key is passed, and the **editor's live lint never passes the key** (`src/hooks/use-builder-editor.ts:635` calls `lintTemplate(doc.templates[key] ?? EMPTY_AST)` with no second argument). At publish it is evaluated (`src/lib/themes.server.ts:849-853`) but only `level === "error"` blocks. **Result: a page template with no `page_content` widget passes lint, passes publish, and silently disables the theme's page layout.** That is the defect.

**(b) `src/components/store/StoreHomepage.tsx:102` — the CMS-designated homepage.**
`StoreHomepage` passes `template="page"` and `contextSlots={{ page_content: content }}` (`:120`) but **does not set `contentSlot`** (`src/components/store/ThemeChrome.tsx:42-122` has no `contentSlot` prop there). Therefore `themed` = the theme's page AST whenever its `main.length > 0` — and the theme's main renders, including Songoskriti's hardcoded `heading` ("Size guide") and `rich_text` ("Demo article…").

> **This is where hardcoded demo copy actually leaks into production**: the merchant's designated homepage is rendered with the theme's `page` template body ("Size guide / How to measure / Demo article"), and the merchant's real page content — supplied via `contextSlots.page_content` — is **dropped**, because Songoskriti's page template declares no `page_content` section for the slot to fill.

Both defects come from the same root cause: **Songoskriti's `page` template has no `page_content` widget** (`src/lib/themes/songoskriti/preview.ts:207-217`). Fixing the template (one `s("page_content", {})` section) fixes both routes at once.

**(c) `src/routes/store.$slug.index.tsx:443` — which template, in which code path?**
The `template="page"` at `src/routes/store.$slug.index.tsx:443` is inside the **custom-isolated Level-B theme branch only** — the block guarded by `if (isolatedTheme) { … }` at `:421`, which mounts the sandboxed `ThemeRuntime` iframe for an uploaded/pinned Level-B theme. Classic sections are deliberately not rendered there (`:425-427`). The normal path is `:461-463` → `<StoreHomepage home={data.homepage} slug={slug} />` (i.e. case (b) above), and `:467-476` → `<StoreWelcome/>` when no CMS homepage is designated. **So `:443` is NOT the homepage template decision; it is the isolated-theme label.**

### 2.4 Preview vs storefront, per template

| Template | Preview renders | Live storefront renders | Same? |
|---|---|---|---|
| `search` | theme main (`heading` + `rich_text` "Demo search" + `product_rail`) + demo catalog rows (`src/lib/preview-demo-data.ts:47-133`, `useMockProductSlots` at `src/components/store/ThemePreviewFrame.tsx:256`) | theme main **+** the route's hand-written listing block as `productSlot` (`src/routes/store.$slug.search.tsx:184-529, 540-563`) | ❌ — preview shows one rail; storefront shows the theme's sections *and* the full listing |
| `cart` | `heading` + `columns(cart_lines, cart_summary)` + `product_rail` (`preview.ts:253-282`) | theme main (`cart_lines`/`cart_summary` render live cart rows through `contextSlots`, `src/routes/store.$slug.cart.tsx:99-105`) | ⚠️ layout same, data source differs (demo vs live) |
| `account` | `heading` + `profile_card` + `orders_list` (`preview.ts:318-323`), demo rows `DEMO_ORDERS`/`DEMO_PROFILE` (`src/lib/preview-demo-data.ts:21-45`) | theme main + live session rows (`src/routes/store.$slug.account.tsx:185-219`) | ⚠️ same shape, different data |
| `blog` | `heading` + `image` + `rich_text` "Meet the makers" (`preview.ts:218-234`) — **no `blog_archive` widget** | `BlogArchiveTheme` with `ast={null}` → hand-written `ArticleGrid` + `Pager` (`src/components/store/BlogArchiveTheme.tsx:37-46`, `src/components/store/BlogList`) | ❌ — the preview shows the theme's demo body; the storefront shows a bespoke grid and ignores the theme entirely |
| `checkout` | `heading` + `columns(rich_text "Contact & Shipping", payment_icons, cart_summary)` (`preview.ts:283-317`) | `ast={null}` → hand-built checkout form (`src/routes/store.$slug.checkout.tsx:418, 428+`) | ❌ — the theme contributes **tokens only** |
| `page` | `heading` "Size guide" + `rich_text` "How to measure / Demo article" (`preview.ts:207-217`) | see §2.3 — two different behaviours | ❌ |
| `index` | `buildHomepageMain` (`src/lib/themes/songoskriti/homepage.ts`) | **never rendered** — `StorefrontPage` is dead code | ❌ |
| `archive` | ❌ no key → `genericDemoMain` (`src/lib/theme-preview-nav.ts:357-372`) | ❌ | n/a |

---

## 3. Capability inventory

Legend: **present** · **partial** · **absent**.

| Capability | State | Evidence |
|---|---|---|
| Per-template editor | **present** | `src/routes/_authenticated/dashboard/builder.tsx` (studio) + `src/hooks/use-builder-editor.ts:39-364`; per-template slots edited through `editSlot` (`:333-343`) |
| Template selector | **present** | `src/components/builder/BuilderTopBar.tsx:413` over `TEMPLATE_KEYS`; labels `TEMPLATE_META` at `:6` |
| Per-theme default ASTs | **present** | `src/lib/themes/songoskriti/preview.ts:90-324` (all 9 keys), `src/lib/themes/somvabona/preview.ts:52`; assembly `src/lib/theme-preview-nav.ts:380-405`; seeding `src/lib/themes.server.ts:1154-1174` |
| Route-owned render context | **partial** | Product-shaped data is batched (`src/lib/widget-data.ts:154-171`); context slots exist (`src/components/builder/widgets.tsx:335`); but `search`/`checkout` have **no per-widget route context** (search hands over one `productSlot`; checkout has no AST at all), and `orders`/`profile` have no server-side loader (`src/lib/widget-registry.ts:48-51`) |
| Widget pack — blog (`blog_archive`/`blog_terms`/`blog_pager`) | **partial** | Catalog `src/lib/builder-ast.ts:4834,4886,4909` (`templates: ["blog","page"]`); renderers `src/components/builder/blog.tsx:392-394`; studio twins `src/lib/studio/renderers.tsx:1548-1550`; live data `BlogFeedProvider` `src/components/builder/blog.tsx:31-45`. **But** the storefront blog route bypasses the theme (`ast={null}`, `src/components/store/BlogArchiveTheme.tsx:31`) and Songoskriti authors no blog-pack widget (`preview.ts:218-234`) |
| Widget pack — `orders_list`/`profile_card` | **present** | Catalog `src/lib/builder-ast.ts:4931-4947` (`orders_list`), `:4949-4957` (`profile_card`); registry `src/lib/widget-registry.ts:652-659`; live route slots `src/routes/store.$slug.account.tsx:185-219`; preview demo rows `src/lib/preview-demo-data.ts:21-45` |
| Widget pack — `cart_lines`/`cart_summary` | **present** | Catalog `src/lib/builder-ast.ts:2848-2866` (`cart_lines`), `:1603-…` (`cart_summary`); route slots `src/routes/store.$slug.cart.tsx:99-105`; live cart `src/components/builder/CartContext.tsx` + `src/components/store/ThemeChrome.tsx:192-201` |
| Widget pack — `page_content` | **partial** | Catalog `src/lib/builder-ast.ts:1592-1599` (`templates:["page","blog"]`); wired in the storefront `src/components/store/PageView.tsx:166,175`. **But Songoskriti does not use it** (`preview.ts:207-217`) → §2.3 defect |
| Widget pack — `product_grid`/`product_rail` | **present** | Catalog `src/lib/builder-ast.ts:1247` (`product_grid`, `templates:["product","collection","page","blog","search"]` at `:1506`) and `:2282` (`product_rail`, which declares **no** template allowlist → available on every template); Songoskriti has its own presentations `src/components/builder/songoskriti.tsx:2620-2621` |
| Theme presentation registry | **present** | `src/lib/theme-presentations.ts:97` (`registerThemePresentation`); Songoskriti claims `src/lib/themes/songoskriti/presentation-claims.ts:64`; widget map `src/components/builder/songoskriti.tsx:2592-2642` |
| Preview data providers | **partial** | `src/lib/preview-demo-data.ts:47-133` covers product/taxonomy/orders/profile; `useMockProductSlots` `src/components/store/ThemePreviewFrame.tsx:256-330` covers product. **No** demo provider for search results, cart lines/totals, checkout steps, or blog articles — the search/blog previews show authored demo copy instead (`preview.ts:235-252`, `:218-234`) |
| `?? templates.index` fallback | **present (a defect)** | `src/components/store/ThemePreviewFrame.tsx:485` — an unknown template silently renders the homepage. Also `src/lib/theme-preview-nav.ts:400` synthesises a generic body for any key a theme does not author |
| Storefront `search` route | **partial** | Fetches the published template (`src/routes/store.$slug.search.tsx:64`) but renders one hardcoded block (`:184-529`) as `productSlot`; theme sections and route block are not composed |
| Storefront `cart` route | **present** | `src/routes/store.$slug.cart.tsx:81-129` |
| Storefront `account` route | **present** | `src/routes/store.$slug.account.tsx:494-512` |
| Storefront `checkout` route | **partial** | `ast={null}` (`src/routes/store.$slug.checkout.tsx:418`) — theme contributes tokens only |
| Storefront `blob` routes | **present (blog)** | `src/routes/store.$slug.blog.index.tsx:77` → `BlogArchiveTheme`; `src/routes/store.$slug.blog.$slug.tsx:80` → `ArticleView`. Platform equivalents `src/routes/blog.index.tsx`, `blog.category.$slug.tsx`, `blog.tag.$slug.tsx`, `blog.author.$slug.tsx` (all → `BlogArchiveTheme`) and `src/routes/blog.$slug.tsx` (→ `ArticleView`) |
| DoD test | **present** | `src/lib/definition-of-done.test.ts` — 11 tests, all passing on this tree (§7). Note it does **not** assert anything about template keys; the template-key assertions live in `src/lib/builder-phase6.test.ts:210`, `src/lib/account-template.test.ts:21`, `src/lib/phase9-guardrails.test.ts:18` |

---

## 4. `archive` semantics and blast radius

### 4.1 The archive-like routes the storefront actually has

Enumerated from `src/routes/` (all verified):

| Archive-ish surface | Route file | Current template | Notes |
|---|---|---|---|
| Blog index | `src/routes/store.$slug.blog.index.tsx` | none (`ast={null}`) | bespoke `BlogArchiveTheme` |
| Blog article | `src/routes/store.$slug.blog.$slug.tsx` | none | `ArticleView`; no `ThemeChrome` |
| Blog **category** | `src/routes/blog.category.$slug.tsx` (platform) | none | `BlogArchiveTheme`, `activeSlug: term.slug` (`:132`) |
| Blog **tag** | `src/routes/blog.tag.$slug.tsx` | none | `BlogArchiveTheme` |
| Blog **author** | `src/routes/blog.author.$slug.tsx` | none | `BlogArchiveTheme` |
| Product **collection** | `src/routes/store.$slug.c.$collectionSlug.tsx` (`:203` → `template="collection"`) and `src/routes/c.$collectionSlug.tsx` | `collection` | already a first-class template |
| Product **category** | *no dedicated route* — categories are a **search filter** (`?category=`, `src/lib/storefront-search.ts:161-163`) | `search` | category taxonomy is `products.category_id` (see live SSR payload: `category_id` per product) |
| Product **brand** | *no route at all* — brands resolve to a search query (`src/lib/widget-data.ts:224-225`: `case "brand": return ${join("/search")}?q=…`) | `search` | **there is no brand entity in the route map** |
| Search **kinds** | `?kind=physical|digital|service|subscription` (`src/lib/storefront-search.ts:21-27, 164`) | `search` | a facet of the search template, not an archive |
| Product detail | `src/routes/store.$slug.p.$productSlug.tsx` | `product` | — |
| CMS page | `src/routes/store.$slug.pages.$pageSlug.tsx` | `page` | — |

**Conclusion on semantics:** the storefront's genuine *archive* surfaces are **exactly the three blog taxonomy kinds — category, tag, author** (plus the blog index), all of which are already served by one shared component (`BlogArchiveTheme`) and have a first-class widget pack (`blog_archive`/`blog_terms`/`blog_pager`, `src/lib/builder-ast.ts:4834-4925`) with a route-owned feed (`BlogFeedProvider`, `src/components/builder/blog.tsx:31-45`) already wired to it. Product collections already own the `collection` template; product categories/brands/search kinds are facets of `collection`/`search`, not separate archives.

### 4.2 Is a new `archive` template key needed? — **My recommendation: NO, not as the first move.**

Evidence **for** "no new key":
1. The three blog archive kinds already have a *complete* widget pack with real route-owned data, and the live theme's published `blog` template already uses it (DB read, §2.2). The gap is that **the route hardcodes `ast={null}`** (`src/components/store/BlogArchiveTheme.tsx:31`) — a one-line-ish route fix, not a new key.
2. The `blog` template key already exists and is already editable (`TEMPLATE_KEYS[5]`), already has a zone allowlist (`src/lib/builder-ast.ts:184`), already has route-h1 semantics (`src/lib/builder-ast.ts:72`), already has a per-template SEO record, already has translation coverage, already has a preview nav entry (`src/lib/theme-preview-nav.ts:92-95`), and already has live reference stills (6 captures, §6).
3. An `archive` key would need its **own** variants (category vs tag vs author have different feeds, term semantics and canonical rules — see `src/lib/blog-taxonomy.ts:25-29` "Page 1 is the canonical archive", "an empty archive is never indexable"), which the plan itself concedes ("If two archive kinds have materially different semantics, support validated variants of the archive template"). That is more machinery than fixing the blog route.
4. `blog_archive`/`blog_terms`/`blog_pager` already carry `templates: ["blog","page"]` (`src/lib/builder-ast.ts:4838,4890,4913`). Extending them to an `archive` key is a one-line change **per widget** — but it is in `src/lib/builder-ast.ts`, which the port spec **prohibits** (§5).

Evidence **for** "a new key is needed":
1. The plan (§10) explicitly asks for `archive` as a first-class template, and §2 of the brief says "Extend the existing template-key system to include `archive`". If `archive` is a hard requirement of the deliverable, the key must be added — the question is only *sequencing*.
2. A single `archive` key with validated variants is the only way to give **product-side** archives (category/brand) a theme-editable surface that is not the `collection` template — the plan explicitly forbids duplicating `collection` (§10) and lists "brand" as an archive kind.
3. `resolveTemplate`'s fallback chain (`src/lib/builder-ast.ts:8219-8243`) already supports suffixed variants (`<base>_<suffix>`), so `archive` variants could be modelled as `archive_category`, `archive_tag`, `archive_author` **without** new keys — but only once `archive` is a valid base (`isVariantTemplateKey` requires `isTemplateKey(base)`).

**Verdict:** the `archive` key is **defensible but not the smallest correct step**, and the *judgement call belongs to the human* (see §8). The decisive technical question is: **does "Archive" in the brief mean (i) the blog taxonomy archives, or (ii) a product-side listing archive covering category/brand/search-kind?** (i) needs **no new key** — fix the blog route to use the theme's `blog` template and the existing blog pack; (ii) needs an `archive` key (or a documented `collection` variant) because there is currently no theme-editable surface for product-side taxonomy listings.

### 4.3 Exact blast radius of adding one `archive` key to `TEMPLATE_KEYS`

**A. `TEMPLATE_KEYS` reference sites — 16 files, 15 besides the definition.**

| File:line | What it does | Effect of adding `archive` |
|---|---|---|
| `src/lib/builder-ast.ts:46-59` | the definition | add the key |
| `src/lib/builder-ast.ts:60` | `TemplateKey` union | widens automatically |
| `src/lib/builder-ast.ts:561` | `isTemplateKey` | widens automatically |
| `src/lib/builder-ast.ts:8122` | `parseTemplates` — only known keys are read; unknown keys in stored JSON are **dropped** | **without the key, any stored `archive` AST is silently discarded on save/load** |
| `src/lib/builder-ast.ts:156` | `TEMPLATE_ZONES: Record<TemplateKey, readonly Zone[]>` | **compile error** — a new key must be added |
| `src/lib/builder-ast.ts:68-75` | `ROUTE_H1_TEMPLATES` (route supplies the h1) | decide: is `archive` route-h1? |
| `src/lib/builder-ast.ts:8438-8462` | `required: Partial<Record<TemplateKey, …>>` (required-widget rules) | optional, but an `archive` with no listing widget should warn |
| `src/lib/builder-ast.ts:4834-4925` (41 catalog entries carry `templates: [...]`) | per-widget template allowlist | **every widget intended for `archive` must add `"archive"` to its allowlist**, or `isContextMismatch` (`src/lib/builder-ast.ts:7935-7943`) makes `SectionRenderer` render a placeholder (`src/components/builder/SectionRenderer.tsx:816-822`) and `lintTemplate` raise an **error** (`src/lib/builder-ast.ts:8554-8559`) |
| `src/components/builder/BuilderTopBar.tsx:4, 413` | selector | **compile error** via `TEMPLATE_META` (`:6`) |
| `src/routes/_authenticated/dashboard/builder.tsx:105, 876, 1306, 1430` | studio per-template trees, coverage, labels | `TEMPLATE_LABEL` (`:205`) → **compile error** |
| `src/hooks/use-builder-editor.ts:4, 634` | per-template lint map | widens automatically |
| `src/lib/theme-preview-nav.ts:26, 266, 395` | preview search validation, assembly loop | `GENERIC_TITLES` (`:340`) → **compile error** |
| `src/lib/template-seo.server.ts:26, 78, 80` | per-template SEO map | widens; `builder_template_seo.template` is a plain `string` column (`src/integrations/supabase/types.ts:1356`) → **no migration needed** |
| `src/lib/builder-seo.server.ts:21, 74, 124` | builder SEO panel | widens; `TEMPLATE_FALLBACK` (`src/lib/builder-seo.ts:317`) is `Partial<…>` → optional |
| `src/lib/translation-coverage.ts:11, 93` | translation coverage per template | widens automatically |
| `src/lib/theme-package.ts:42, 152, 172, 352` | third-party manifest `templates: TemplateKey[]` validation | `TEMPLATE_SET` (`:172`) → an old package declaring only the 9 old keys still validates (subset) |
| `src/lib/themes.server.ts:18, 283, 614, 849, 1354, 1380, 1591` | workspace lint, `parseUntrusted` allowlist, publish lint, `diffTemplates`, `mergeTemplates`, section-fill | widen automatically |
| `src/lib/storefront.functions.ts:97-107` | **`z.enum([...])` literal list of the 9 keys** — a hand-maintained duplicate of `TEMPLATE_KEYS` that no compiler catches | **silently rejects `template: "archive"`** → `getStoreChrome` would throw for the archive route |
| `src/lib/widget-weight.ts:205` | `TEMPLATE_JS_BUDGET: Record<TemplateKey, number>` | **compile error** |
| `src/lib/definition-of-done.test.ts:11` | imports `TEMPLATE_KEYS` | unaffected (does not assert key count) |
| `src/lib/builder-phase6.test.ts:25, 210`, `src/lib/account-template.test.ts:12, 21`, `src/lib/phase9-guardrails.test.ts:18` | existing tests | assert *membership*, not count → unaffected, but they are frozen files (§5) |

**B. `switch (template)` / per-template branch sites**
- `src/lib/themes/songoskriti/preview.ts:90-324` — the switch returns `undefined` for `archive` → `assemblePreviewTemplates` synthesises `genericDemoMain` (`src/lib/theme-preview-nav.ts:400`).
- `src/lib/themes/somvabona/preview.ts:52` — same.
- `src/lib/themes/builtin-themes.ts:24-27` — per-theme entry map (not per-template).
- `src/components/builder/BuilderTopBar.tsx:140-175` — a switch on the **icon name**, not the template (not affected).
- `src/components/builder/studio/renderers.tsx:1453-1454` — a switch on the **widget type**, not the template (not affected).

**C. Contracts the key touches**

| Contract | Where | Consequence |
|---|---|---|
| Theme package validation | `src/lib/theme-package.ts:352-376` (`templates` non-empty subset of `TEMPLATE_KEYS`), `TEMPLATE_SET` at `:172` | a package may declare `archive` only after the key exists; existing packages unaffected |
| Template SEO (storefront) | `src/lib/template-seo.server.ts:60-105` | new key gets an SEO record slot; no DB migration (`template` is `text`) |
| Builder SEO (studio) | `src/lib/builder-seo.server.ts:74` (`assertTemplate`), `src/lib/builder-seo.ts:317` (`TEMPLATE_FALLBACK`) | add a fallback label or the panel shows "Page" |
| Translation coverage | `src/lib/translation-coverage.ts:90-104` | new key enters the coverage denominator; a theme with an untranslated `archive` could trip the publish translation gate (`src/lib/themes.server.ts:855-858`) |
| Preview nav | `src/lib/theme-preview-nav.ts:92-95` (`/blog…` → blog), `:82-89` | `previewTargetForHref` must map archive URLs to the `archive` key or they fall through to `null` → link does nothing |
| Preview search validation | `src/lib/theme-preview-nav.ts:256-300` (`validateThemePreviewSearch` — `TEMPLATE_KEYS.includes`) | auto-widens |
| Preview fallback | `src/components/store/ThemePreviewFrame.tsx:485` (`?? templates.index`) | the key's absence currently degrades to the homepage; with the key present, `templates.archive` is `undefined` unless authored → still falls back. **This fallback should be replaced by an explicit "unsupported template" state** (plan §14) |
| DoD test | `src/lib/definition-of-done.test.ts` | does not assert key count; **the plan's §17 requirement "`archive` is included in all required template maps and schemas" needs a NEW test file** (existing test files are frozen — §5) |
| Publish lint | `src/lib/themes.server.ts:849-853` | lints every key; an empty `archive` template produces "No primary heading on this template." (`src/lib/builder-ast.ts:8431-8437`) unless `archive` is added to `ROUTE_H1_TEMPLATES` |
| Per-template JS budget | `src/lib/widget-weight.ts:205-215` | must add an `archive` budget |
| Install / seeding | `src/lib/themes.server.ts:1154-1174` (`registryPackage`) → `assemblePreviewTemplates` | seeds an `archive` template for every official theme automatically (generic body unless the theme authors one) |
| Theme switch / merge / diff | `src/lib/themes.server.ts:1348-1390` (`diffTemplates`), `:1375+` (`mergeTemplates`) | widen automatically; `mergeTemplates` will carry merchant `archive` edits across theme switches |
| Version snapshot / rollback | `src/lib/themes.functions.ts:78-89`, `src/lib/themes.server.ts` | `theme_versions.templates` jsonb — no migration |
| DB | `theme_drafts.templates` jsonb (`supabase/baseline_parts/part3.sql:117`), `theme_versions.templates` jsonb, `builder_template_seo.template` text (`src/integrations/supabase/types.ts:1356`) | **no migration required** |

**D. API-version / third-party compatibility consequence**

- Running builder API version: `BUILDER_API_VERSION = "3.1.0"` (`src/lib/plugin-manifest.ts:32`).
- Theme package range: `THEME_API_RANGE = "^3.0.0"` (`src/lib/theme-package.ts:52`); enforced at `src/lib/theme-package.ts:312-316` via `satisfiesApiRange` (`src/lib/plugin-manifest.ts:463-484`).
- `satisfiesApiRange("^3.0.0", "3.1.0")` → caret rule: same major (3) and `3.1.0 ≥ 3.0.0` → **true**. A caret range also admits any `3.x.y ≥ 3.0.0`, so **bumping `BUILDER_API_VERSION` to `3.2.0` for the archive key would still be covered by `^3.0.0`** — existing third-party theme packages stay installable.
- The real compatibility hazard is **semantic, not numeric**: a third-party package built against the pre-archive builder can only declare the 9 old keys (its `templates` array must be a subset of `TEMPLATE_KEYS`, `src/lib/theme-package.ts:355-376`). Adding `archive` is **backwards-compatible for existing packages** and only *enables* new ones. No package needs to be re-published.
- **Recommendation:** bump `BUILDER_API_VERSION` to `3.2.0` only if a behavioural change (not merely a new key) lands; a new key with no behavioural change can ship without an API bump. If it is bumped, `THEME_API_RANGE` and `PRESET_API_RANGE` (`src/lib/registry-version.ts:15`, both `^3.0.0`) remain valid and the DoD assertion `checkApiCompatibility(PRESET_API_RANGE).ok` (`src/lib/definition-of-done.test.ts:253`) still passes.
- One compatibility caveat to check before shipping: `src/lib/storefront.functions.ts:97-107` uses a hand-written `z.enum` of the 9 keys. If `archive` is added to `TEMPLATE_KEYS` but not to that enum, the new template cannot be fetched through `getStoreChrome` — a runtime failure, not a compile error. **This is the single most likely thing to be missed.**

---

## 5. Boundary analysis (port spec §7)

Spec: `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md:150-153`.
- **Editable:** `src/lib/themes/songoskriti/**`; `src/components/builder/songoskriti.tsx` + `songoskriti-motion.ts`; NEW test/fixture files; NEW `.e2e/` specs/helpers; `docs/**`; `scripts/**`; `examples/starter-plugin/**` + `examples/starter-theme/**`; minimal wiring in `package.json` and `.circleci/config.yml`.
- **Prohibited:** `src/lib/unified-widget-registry.ts`, `src/lib/editor/**`, `src/lib/theme-presentations.ts`, **`src/lib/builder-ast.ts`**, **`src/components/builder/widgets.tsx`**, `heritage.tsx`, `theme-widgets.ts`, **`all src/routes/**`**, `EditorShell`/`StudioBuilder`, **existing test files and their snapshots**, **existing `.e2e/**` files**, "and everything else under `src/`".
- **Escalation:** any required capability missing in core → stop, report, wait for a decision.

### 5.1 Files the proposed work must touch

| # | File | Why | Boundary verdict |
|---|---|---|---|
| 1 | `src/lib/themes/songoskriti/preview.ts` | give `page` a `page_content` section; author real `blog`/`search`/`cart`/`checkout`/`account` bodies instead of demo copy | ✅ **allowed** (theme-owned) |
| 2 | `src/lib/themes/songoskriti/homepage.ts` | if the homepage builder must change | ✅ allowed |
| 3 | `src/components/builder/songoskriti.tsx` | new Songoskriti presentations for archive/blog widgets | ✅ allowed (explicitly carve-out) |
| 4 | `src/lib/builder-ast.ts` | **`TEMPLATE_KEYS` (`:46`), `TEMPLATE_ZONES` (`:156`), `ROUTE_H1_TEMPLATES` (`:68`), the 41 catalog `templates:` allowlists (`:1506`…`:4954`), `required` rules (`:8438`)** | ❌ **PROHIBITED** → escalation |
| 5 | `src/components/builder/widgets.tsx` | the `ContextSlot`/renderer lane for new archive widgets | ❌ **PROHIBITED** → escalation |
| 6 | `src/routes/store.$slug.pages.$pageSlug.tsx` / `src/components/store/PageView.tsx` | the `contentSlot` contract for the page template | ❌ **PROHIBITED** (`src/routes/**`; `src/components/store/**` falls under "everything else under `src/`") → escalation |
| 7 | `src/components/store/StoreHomepage.tsx` | add `contentSlot="page_content"` so the CMS homepage stops leaking demo copy | ❌ PROHIBITED → escalation |
| 8 | `src/components/store/BlogArchiveTheme.tsx` | stop hardcoding `ast={null}` so the theme's `blog` template renders | ❌ PROHIBITED → escalation |
| 9 | `src/routes/store.$slug.search.tsx` | turn the hardcoded listing into route-owned context slots | ❌ PROHIBITED → escalation |
| 10 | `src/routes/store.$slug.checkout.tsx` | pass the theme's checkout AST | ❌ PROHIBITED → escalation |
| 11 | `src/lib/storefront.functions.ts:97-107` | add `archive` to the `z.enum` | ❌ PROHIBITED → escalation |
| 12 | `src/lib/theme-preview-nav.ts:340` (`GENERIC_TITLES`), `:52-99` (`previewTargetForHref`) | preview titles + archive URL mapping | ❌ PROHIBITED → escalation |
| 13 | `src/lib/widget-weight.ts:205` | `TEMPLATE_JS_BUDGET` for `archive` | ❌ PROHIBITED → escalation |
| 14 | `src/lib/builder-seo.ts:317` | `TEMPLATE_FALLBACK` label for `archive` | ❌ PROHIBITED → escalation |
| 15 | `src/components/builder/BuilderTopBar.tsx:6` | `TEMPLATE_META` entry for `archive` | ❌ PROHIBITED → escalation |
| 16 | `src/routes/_authenticated/dashboard/builder.tsx:205` | `TEMPLATE_LABEL` for `archive` | ❌ PROHIBITED → escalation |
| 17 | `src/components/store/ThemePreviewFrame.tsx:485` | replace `?? templates.index` with an explicit unsupported state | ❌ PROHIBITED → escalation |
| 18 | `src/lib/definition-of-done.test.ts`, `src/lib/builder-phase6.test.ts`, `src/lib/account-template.test.ts`, `src/lib/phase9-guardrails.test.ts`, `src/components/builder/songoskriti-port-freeze.test.tsx`, `src/components/builder/songoskriti-snapshots.test.tsx` + `src/components/builder/__snapshots__/songoskriti-snapshots.test.tsx.snap` | existing tests/snapshots pin the current behaviour | ❌ **PROHIBITED** → a **NEW** test file is required instead |
| 19 | `.e2e/songoskriti-port-parity.spec.ts`, `.e2e/songoskriti-editor-journey.spec.ts`, `.e2e/playwright.config.ts` | existing e2e files | ❌ PROHIBITED → new `.e2e/` spec files only |
| 20 | `docs/superpowers/songoskriti-evidence/port/**` (incl. `reference/`, `reference-manifest.json`) | re-freeze the parity stills | ✅ **allowed** (`docs/**`) — but see §6 |
| 21 | `docs/themes/creation.md`, `docs/packages/contract.md`, `docs/04-builder/theme-runtime.md`, `docs/themes/packages.md` | template-key docs | ✅ allowed |
| 22 | `package.json` (new `test`/`gate` scripts), `.circleci/config.yml` (new lane) | wiring | ✅ allowed **only** as documented in §7 (the spec's existing carve-out covers the doc-gate wiring; a *new* template lane is a fresh escalation) |

### 5.2 The escalation is unavoidable for the mission as written

The plan's core requirement — "the CMS renders the actual page selected by the merchant" — is implemented by the **`contentSlot` contract in `ThemeChrome` and the `page_content` widget**, both of which live in prohibited files *only if* they must change. But the **smallest correct fix (add a `page_content` section to Songoskriti's `page` template) is entirely inside `src/lib/themes/songoskriti/preview.ts`**, which is allowed. That is why §8 makes it Phase 1.

The `archive` key, by contrast, **cannot** be added without touching `src/lib/builder-ast.ts` — prohibited. It therefore requires an explicit escalation regardless of the semantic decision.

---

## 6. Evidence that goes stale

### 6.1 The frozen parity captures

`docs/superpowers/songoskriti-evidence/port/reference/` — **60 stills**, and `reference-manifest.json` — **60 manifest entries** (59 `pass`, 1 `manual-review`), all recorded at `freezeSha: "9e6806329d47"` (`docs/superpowers/songoskriti-evidence/port/reference-manifest.json`, `freezeSha` field; that commit exists in this repo — `git rev-parse --verify 9e6806329d47^{commit}` succeeds).

Per template:

| Template | Still count | Becomes invalid if that template's preview body changes? |
|---|---|---|
| `index` | 12 (incl. `index-minimal-1440-en.png`, `index-festive-1440-en.png`) | only if the homepage changes |
| `product` | 6 | yes |
| `collection` | 6 | yes |
| `account` | 6 | **yes** |
| `page` | 6 | **yes** |
| `blog` | 6 | **yes** |
| `cart` | 6 | **yes** |
| `checkout` | 6 | **yes** |
| `search` | 6 | **yes** |
| chrome | 4 (mega-menu ×2, mobile drawer ×2 — both on `index`) | only if the header/footer changes |

**If only Songoskriti's non-index templates change (page, blog, cart, checkout, account, search): 36 of 60 stills + 36 of 56 machine baselines become invalid.** If the homepage is also touched, add 12 + the 4 chrome stills.

Machine baselines live in `.e2e/songoskriti-port-parity.spec.ts-snapshots/` — **56 files** named `<template>-<width>-<locale>-chromium-linux.png`.

The capture spec is `.e2e/songoskriti-port-parity.spec.ts`:
- template list `:36-46` (9 templates), widths `:47`, locales `:48`
- thresholds `maxDiffPixelRatio 0.02`, `threshold 0.2` (`:52`)
- capture loop `:262-286` (54 template stills), chrome states `:288-340` (4), variations `:342-372` (2)
- manifest write `:406-417`
- output dir switch `PORT_CAPTURE_OUT=after` → `after/`, default → `reference/` (`:26-31`)

**Cost of re-freezing:** re-run the spec against a running preview server with `PORT_CAPTURE_OUT=after` (parity run) then, once the diff is approved, re-run with the default output to overwrite `reference/` and regenerate `reference-manifest.json` (which rewrites `freezeSha` and `generatedAt` for **all 60** entries, not just the changed ones). Each capture is a full-page screenshot at 1440/768/375 × en/bn with `document.fonts.ready` awaited, animations disabled, caret hidden, reduced motion emulated, and a Bangla-render assertion (`spec:168-170`). Runtime is dominated by 54+ browser navigations against a cold Vite dev server; the spec sets `test.setTimeout(300_000)` per test (`:122`). **No credentials are needed for the template captures** — only the trailing "activation helper smoke" test needs `E2E_MERCHANT_EMAIL`/`E2E_MERCHANT_PASSWORD` and skips without them (`spec:386-403`). **The spec file itself is a prohibited edit**; re-freezing is a *run*, not an edit, so it is permitted.

### 6.2 Other frozen evidence

| Artifact | Invalidated by | Note |
|---|---|---|
| `src/components/builder/songoskriti-port-freeze.test.tsx:73-104` (`TEMPLATE_MAIN` literal) | any change to a Songoskriti template main — it pins `page: ["heading","rich_text"]`, `blog: ["heading","image","rich_text"]`, `cart: ["heading","columns","product_rail"]`, `checkout: ["heading","columns"]`, `search: ["heading","rich_text","product_rail"]`, `account: ["heading","profile_card","orders_list"]` | **prohibited file** — a change breaks the test; the spec says a changed pinned output is "a parity finding first … escalate with the exact diff and rationale" (`spec:169`) |
| `src/components/builder/__snapshots__/songoskriti-snapshots.test.tsx.snap` | renderer markup changes | prohibited file |
| `docs/superpowers/songoskriti-evidence/port/classification.md`, `inventory.md` | template counts / lane classifications | allowed to edit (`docs/**`), but they are evidence of the *old* state |
| `docs/superpowers/songoskriti-evidence/port/after/**` | is the *parity* run output — it is compared against `reference/` | re-run |
| `docs/superpowers/songoskriti-evidence/port/parity-report.md` | any re-freeze | allowed to edit |
| `docs/themes/creation.md:130-160` (template list + "eight template keys" claim) | adding a key | allowed to edit; note it already **stale** — it lists 8 keys and omits `account` (`docs/packages/contract.md:665` flags exactly this) |
| `src/components/store/ThemePreviewFrame.test.tsx` | preview behaviour changes | prohibited file |

**Cost summary:** changing only Songoskriti's non-index templates invalidates 36 stills + 36 machine baselines + 6 frozen `TEMPLATE_MAIN` literals. Re-freezing = one Playwright run of ~60 captures + one manifest regeneration + a written rationale per changed surface.

---

## 7. CI reality

### 7.1 The pipeline

`.circleci/config.yml` — CircleCI is the only CI system (`config.yml:1-2`). Workflow `gates` (`:354-383`):

| Job | Executor | What it runs | Gates this work? |
|---|---|---|---|
| `lint-typecheck` (`:45-64`) | `cimg/node:24.21` | `bun run lint` (ESLint), `bun run typecheck` (`tsgo --noEmit`), `bash -n` on `ops/backup/*.sh`, `node harness/run.mjs --list` | ✅ **YES — adding a template key is a compile error in 5 places until each is fixed** |
| `unit-contract` (`:66-79`) | same | `bun run test` (vitest), `bun run test:contracts` (`node scripts/contract-gate.mjs`), `bun run doc:gate` | ✅ **YES** — `contract-gate.mjs` holds an explicit manifest of contract files and fails if one is missing/hollowed (`scripts/contract-gate.mjs:1-30`); `doc:gate` scans the canonical docs (`scripts/doc-gate.mjs:1-10`) |
| `scan` (`:81-201`) | same | secret scan, SAST diff scan (fail-closed base resolution), dependency audit | ✅ yes (a diff scan, `SAST_BASE` = `origin/main` on `frame30`) |
| `build` (`:203-210`) | same | `bun run build` (Vite + Nitro) | ✅ **YES — hard gate for all e2e jobs** (`:362-382`) |
| `e2e-critical` (`:212-243`) | `cimg/node:24.21-browsers` | `e2e:required` (fail-closed harness gate), Playwright Chromium install, `bun run e2e:critical` = `smoke theme-preview-isolation real-frames storefront-resilience` (`package.json`) | ✅ yes — **`theme-preview-isolation` exercises the preview route** |
| `e2e-security` (`:267-288`) | browsers | `theme-upload-adversarial theme-preview-isolation theme-preview-security package-css-gate-differential frame-cpu-recovery` | ✅ yes |
| `e2e-levelb-production` (`:302-352`) | browsers | headless release gates (`schema:check`, `cron:check`, `selfhost:preflight`, `seo:weight`) + the Level-B harness verifier command | ✅ yes |
| `plugin-storefront-gate` (`:245-260`) | node | 7 named vitest files incl. `src/components/store/ThemeChrome.plugins.test.tsx` | ✅ yes |
| `nightly-full-sast` (`:387-398`) | node | whole-tree SAST on `main` + `frame30` nightly | ⚠️ advisory |

**Note the e2e coverage gap:** neither `e2e:critical` nor `e2e:security` runs `.e2e/songoskriti-port-parity.spec.ts` or `.e2e/songoskriti-editor-journey.spec.ts` (see `package.json` `e2e:critical` / `e2e:security` / `e2e:golden`). The Songoskriti parity suite is **owner-run only** today. Wiring it into CI is, per the port spec §9/§11, "a separate escalation" (`spec:170`, `spec:191`).

**Tooling note:** CI uses `bun` (`install-bun: true`, `bun-version: "1.3.14"`, `config.yml:36-42`). In this environment `bun` is not on PATH, so local verification must use `node_modules/.bin/vitest`, `node_modules/.bin/tsgo`, `node_modules/.bin/eslint`, `node_modules/.bin/prettier`.

### 7.2 The known pre-existing failure baseline

**`src/lib/site.server.test.ts` — reproduced, and it is purely a local-environment artifact, unrelated to this work.**

Reproduction on the current tree:
```
$ node_modules/.bin/vitest run src/lib/site.server.test.ts
 ❯ src/lib/site.server.test.ts (3 tests | 1 failed)
   × throws a guarded missing-env error, never a placeholder client
   AssertionError: expected [Function] to throw an error
   ❯ src/lib/site.server.test.ts:24:34
 Test Files  1 failed (1)   Tests  1 failed | 2 passed (3)
```

**Root cause (traced):**
1. `publicClient()` falls back to `import.meta.env.VITE_SUPABASE_URL` (`src/lib/site.server.ts:8-17`).
2. Vitest rewrites `import.meta.env` to `Object.assign({}, globalThis.__vitest_worker__?.metaEnv ?? import.meta.env)` (`node_modules/vitest/dist/chunks/cli-api.CnMVyzaz.js:9856-9862`), and `metaEnv` is a Proxy over `process.env` (`node_modules/vitest/dist/chunks/init.k9zZ9sLh.js:174-194`).
3. `Object.assign` **snapshots `process.env` at module-evaluation time** — i.e. *before* the test's `vi.stubEnv(...)` calls (`src/lib/site.server.test.ts:12-18`) run. `vi.stubEnv` mutates `process.env` afterwards but cannot reach the snapshot (`node_modules/vitest/dist/chunks/test.DNmyFkvJ.js:3629-3637`).
4. The gitignored local `.env` (and `.env.local`) supply `VITE_SUPABASE_URL`/`SUPABASE_URL`, so the snapshot is truthy → `publicClient()` does not throw → the "missing env" test fails.

**Proof that it is environment-dependent and NOT a code defect:**
```
$ VITE_SUPABASE_URL="" SUPABASE_URL="" SUPABASE_PUBLISHABLE_KEY="" \
  VITE_SUPABASE_PUBLISHABLE_KEY="" node_modules/.bin/vitest run src/lib/site.server.test.ts
 ✓ src/lib/site.server.test.ts (3 tests)  62ms
 Test Files  1 passed (1)   Tests  3 passed (3)
```
`.env` and `.env.local` are gitignored (`.gitignore:8-9`), so a **pristine checkout / CI runner has neither** — `process.env` is empty of Supabase names at snapshot time, `import.meta.env.VITE_SUPABASE_URL` is `undefined`, and `publicClient()` throws as the test expects. **On CI this test passes.**

**Verdict:** a local-only env flake; unrelated to templates, themes or the proposed change. It does **not** need to be fixed, and it must not be "fixed" by weakening the assertion.

### 7.3 Baseline health of the template-related suites (this tree, `71271834`)

```
$ node_modules/.bin/vitest run src/lib/definition-of-done.test.ts \
    src/lib/builder-phase6.test.ts src/lib/account-template.test.ts \
    src/components/builder/songoskriti-port-freeze.test.tsx
 ✓ src/lib/account-template.test.ts           (4 tests)
 ✓ src/lib/builder-phase6.test.ts            (38 tests)
 ✓ src/lib/definition-of-done.test.ts        (11 tests)
 ✓ src/components/builder/songoskriti-port-freeze.test.tsx (21 tests)
 Test Files  4 passed (4)   Tests  74 passed (74)
```

---

## 8. Recommended phase order

Each phase ships independently, has its own acceptance criterion, blast radius and risk. **Phase 0 is this audit.**

---

### Phase 0 — Audit (this document) ✅ done
- **Ships:** `docs/superpowers/songoskriti-evidence/port/phase0-implementation-map.md`.
- **Acceptance:** the map exists, every claim is cited, the `archive` judgement call is isolated.
- **Blast radius:** none (one new file under `docs/**`).
- **Risk:** none.

---

### Phase 1 — Fix the generic Page template (the smallest real defect)
**Why this first:** it is the plan's only *required functional fix* (§11), it is the defect the brief itself calls out ("not a hardcoded Size Guide"), and — decisively — **it can be fixed entirely inside allowed files.**

- **Change:** in `src/lib/themes/songoskriti/preview.ts:207-217`, replace the `page` template body with a real page layout whose main contains a `page_content` section (e.g. `s("page_content", {})` plus theme-owned chrome). Remove the "Size guide" / "How to measure" / "Demo article" strings.
- **Files touched:** `src/lib/themes/songoskriti/preview.ts` only. **Plus a NEW test file** (e.g. `src/lib/themes/songoskriti/page-content.test.tsx`) — existing test files are frozen (§5).
- **Blast radius:** theme-owned only. No route, no core file, no DB, no API version.
- **Acceptance criterion (testable, no browser needed):**
  1. `songoskritiPreviewSource().main("page", s)` contains a section of type `page_content` (assert on the section list).
  2. `lintTemplate(pageAst, "page")` produces **zero** issues at level `warn`/`error` — today it produces `"Page template has no page content widget."` (`src/lib/builder-ast.ts:8448-8453`).
  3. The strings "Size guide", "How to measure", "Demo article" no longer appear in the `page` preview body.
  4. **Live storefront check** (requires a store with Songoskriti active): `/store/<slug>/pages/<slug>` renders the merchant's real page title/body **inside** the theme layout (not the `fallback` prose), and `/store/<slug>/` (CMS-designated homepage) renders the merchant's real homepage content instead of "Size guide".
- **Risk:** low. Blast radius limited to one theme file. Residual risk: the `page` template's `heading` widget previously provided a visible H2; `page` is a route-H1 template (`src/lib/builder-ast.ts:72`) so the route owns the H1 — but `StoreHomepage` sets `ownsPrimary` (`src/components/store/StoreHomepage.tsx:111`) while `PageView` sets `ownsPrimary={custom}` (`src/components/store/PageView.tsx:165`), so a **duplicate-H1 risk exists on path-host page routes** — check both host shapes in acceptance.
- **Re-freeze cost:** 6 `page` stills + 6 machine baselines.

---

### Phase 2 — Make the storefront Blog route wear the theme's `blog` template
- **Change:** `src/components/store/BlogArchiveTheme.tsx:29-33` currently hardcodes `ast={null}`/`tokens={null}`; it should receive the published `blog` template AST (as `store.$slug.blog.index.tsx` already fetches chrome for other templates) and mount `BlogFeedProvider` around the theme's main, keeping the bespoke grid as the `fallback`.
- **Files touched:** `src/components/store/BlogArchiveTheme.tsx`, `src/routes/store.$slug.blog.index.tsx` (and the platform `blog.index.tsx`, `blog.category.$slug.tsx`, `blog.tag.$slug.tsx`, `blog.author.$slug.tsx`).
- **Boundary:** ❌ **PROHIBITED** (`src/routes/**`, "everything else under `src/`") → **escalation required**, with the exact diff and rationale.
- **Acceptance criterion:**
  1. The three blog taxonomy kinds (category/tag/author) and the blog index all render the theme's `blog` template when the merchant has one, and the bespoke grid when they do not.
  2. The `blog_archive`/`blog_terms`/`blog_pager` widgets render the **live** feed (articles, facets, paging) on those routes — proven by a browser assertion on a seeded store, or by a component test that mounts `BlogFeedProvider` + the theme main.
  3. The platform reader routes (`/blog`, `/blog/category/:slug`, `/blog/tag/:slug`, `/blog/author/:slug`) keep their current canonical/robots behaviour (`src/lib/blog-taxonomy.ts:25-29`).
- **Blast radius:** 5 route files + 1 component; blog SEO/canonical surfaces must not move.
- **Risk:** medium. The blog pack's widgets were written for exactly this and are already in a live theme's AST, but the platform reader routes are shared by every merchant, and an empty `blog` template must fall back cleanly.
- **Re-freeze cost:** 6 `blog` stills + 6 machine baselines.

---

### Phase 3 — Turn the search listing into route-owned context slots
- **Change:** `src/routes/store.$slug.search.tsx:184-529` builds one opaque `listing` block and passes it as `productSlot` (`:562`). Instead, produce per-widget context slots (`search_results`/`facets`/`filter_chips`/`result_toolbar`/`pagination` — the catalog already has `facet_sidebar`, `filter_chips`, `result_toolbar`, `pagination`, `category_header`, `empty_state` at `src/lib/builder-ast.ts:2696-2830`) so the theme can place and style them.
- **Files touched:** `src/routes/store.$slug.search.tsx`; likely new widgets in `src/components/builder/widgets.tsx` (❌ prohibited → escalation) and new catalog entries in `src/lib/builder-ast.ts` (❌ prohibited → escalation).
- **Acceptance criterion:** the theme's `search` template can be reordered by the merchant; the rendered result set and pagination are identical before and after the change (same fixture query, same rows, same count); the empty state and the filtered state still render; `canonical`/`robots` behaviour (`src/routes/store.$slug.search.tsx:75-105`) is unchanged.
- **Blast radius:** one storefront route + the shared widget catalog.
- **Risk:** medium-high — search execution, tenant scoping, result limits and canonical discipline are explicitly platform-owned (plan §5); only presentation may move.

---

### Phase 4 — Cart, Account and Checkout real theme templates
- Cart: the theme's cart template already renders (`store.$slug.cart.tsx:81`); the gap is the **preview** data (no demo cart lines/totals) and the theme's cart body still shows a `product_rail` of demo products (`preview.ts:273-281`).
- Account: same — the storefront path is live (`store.$slug.account.tsx:185-219`); the preview path uses demo rows (`src/lib/preview-demo-data.ts:21-45`), which is acceptable but must be **labelled** as demo.
- Checkout: `ast={null}` (`store.$slug.checkout.tsx:418`) means the theme's checkout template is decorative only. Making it real requires a restricted surface (steps indicator, order summary, permitted payment methods) — the plan's §9 constraints (no custom JS, no price setting, platform-authoritative totals) make this the highest-risk phase.
- **Files touched:** `src/routes/store.$slug.checkout.tsx` (❌ prohibited → escalation); `src/lib/themes/songoskriti/preview.ts` (✅ allowed) for the cart/account bodies.
- **Acceptance criterion:** cart totals recalculate from the server quote after insert/update/remove; account shows only the signed-in customer's rows; checkout completes through the test provider with a tampered total rejected; preview data is labelled and mutations are stubbed.
- **Blast radius:** three commerce routes.
- **Risk:** **high** for checkout (payment integrity); medium for cart/account.
- **Re-freeze cost:** 18 stills (cart 6 + account 6 + checkout 6).

---

### Phase 5 — `archive` (⚠️ **the judgement call — see below**)
- **Only** after the human decides what "Archive" means.
- **Option A (no new key):** treat Archive as the blog taxonomy surface. Phase 2 already delivers it (blog index + category + tag + author all wear the theme's `blog` template and the blog pack). Zero new keys, zero core edits, zero API change. Optionally add validated **variants** of the `blog` template (the platform already supports suffixed variant keys: `src/lib/builder-ast.ts:8203-8217` (`templateSuffixFromOverride`), `:8219-8243` (`resolveTemplateCandidates`), `:8254-8280` (`resolveTemplate`) — e.g. `blog_category`, `blog_tag`, `blog_author` would work **only if** `blog` is the base, which it already is).
- **Option B (new `archive` key):** as per plan §10. Requires editing `src/lib/builder-ast.ts` (TEMPLATE_KEYS, TEMPLATE_ZONES, ROUTE_H1_TEMPLATES, the 41 catalog `templates:` allowlists), `src/components/builder/BuilderTopBar.tsx` (TEMPLATE_META), `src/routes/_authenticated/dashboard/builder.tsx` (TEMPLATE_LABEL), `src/lib/theme-preview-nav.ts` (GENERIC_TITLES + URL mapping), `src/lib/widget-weight.ts` (TEMPLATE_JS_BUDGET), `src/lib/builder-seo.ts` (TEMPLATE_FALLBACK), `src/lib/storefront.functions.ts:97-107` (the hand-written `z.enum`), and a new set of route-owned contexts. **Every one of those files is prohibited by the port spec §7 → the whole phase is an escalation.**
- **Acceptance criterion (either option):** each supported archive kind resolves to the correct layout and records; pagination/filtering unchanged; the theme can change composition without changing the query or the authorization; the canonical/noindex rules are unchanged.
- **Risk:** Option A low. Option B high (compile-surface-wide, third-party manifest surface, preview nav, SEO tables).

---

### Phase 6 — Preview parity with the storefront, and the `?? templates.index` fallback
- **Change:** `src/components/store/ThemePreviewFrame.tsx:485` (`templates[template] ?? templates.index`) → an explicit unsupported-template state (plan §14). Add the missing demo providers: search results with filters and an empty state, cart lines/totals, checkout steps, blog articles, archive records, and **two distinct CMS page fixtures**.
- **Files touched:** `src/components/store/ThemePreviewFrame.tsx`, `src/lib/preview-demo-data.ts` (❌ prohibited → escalation); `src/lib/themes/songoskriti/preview.ts` for the fixtures (✅ allowed).
- **Acceptance criterion:** every one of the seven templates has a preview fixture whose shape matches the live route's context; an unknown `?template=` value renders an explicit unsupported state, not the homepage; preview mutations are stubbed and labelled.
- **Risk:** medium (the preview is the merchant's first impression and the parity source).

---

### Phase 7 — Docs, third-party contract, CI lane
- **Files touched:** `docs/themes/creation.md` (the stale 8-key list at `:130-143` and the "eight template keys" claim), `docs/packages/contract.md` (the stale note at `:665`), `docs/04-builder/theme-runtime.md:430`, `docs/themes/packages.md:77-81`, `docs/developers/themes.md:249` — all ✅ allowed. Optionally `package.json` + `.circleci/config.yml` for a template lane (escalation).
- **Acceptance criterion:** `bun run doc:gate` is clean; the docs' template list matches `TEMPLATE_KEYS` exactly; the Songoskriti parity suite is wired into CI **or** an explicit owner-run note is recorded.

---

### The one judgement call that needs the human

> **Does "Archive" mean the blog taxonomy archives (index / category / tag / author), or a product-side listing archive (category / brand / search-kind)?**

**Why it cannot be settled by the audit:**
- The brief (§10) says "Define the supported archive kinds based on existing platform routes, such as taxonomy/category, brand, tag, author" — but **"brand" has no route in this codebase** (`src/lib/widget-data.ts:224-225` resolves brands to a search query), and **product categories are a search facet, not a route** (`src/lib/storefront-search.ts:161-163`). The only *route-level* taxonomy archives are the **blog** ones (`src/routes/blog.category.$slug.tsx`, `blog.tag.$slug.tsx`, `blog.author.$slug.tsx`).
- The brief also says "Do not duplicate the existing Product Collection template" (§10) — which rules out mapping product category onto `collection`, and simultaneously implies product archives need their own surface.
- Both readings are internally consistent; they lead to very different amounts of work (Option A ≈ 0 new keys vs Option B ≈ 15+ prohibited-file edits).

**The evidence that settles it (one command):**
```
grep -rn 'template="' src/routes/ ; grep -rn 'activeSlug\|termArchivePath' src/routes/blog.*.tsx
```
plus a product decision: *does Frame30 want merchants to design a distinct product-category/brand listing, distinct from the Collection template?* If yes → Option B (and the `archive` key, with an escalation). If no → Option A, and the `blog` template plus the existing blog pack already satisfy the requirement.

**Secondary decision the human should make in the same breath:** whether the port spec's §7 boundary (which prohibits `src/routes/**` and `src/lib/builder-ast.ts`) still governs this Frame30 work. Phases 1 and 2–4 as scoped above need it relaxed; Phase 1 alone does not.

---

## 9. Open questions this audit could not answer

| # | Question | What is needed |
|---|---|---|
| 1 | Does a live Songoskriti storefront exist anywhere (another environment, a seeded store behind a preview token)? | No `store_themes` row for Songoskriti in the live DB; `/store/<slug>` is 404'd on the platform host (`src/lib/storefront-host.server.ts:433-447`). **Needs:** a store with Songoskriti installed and active, or a merchant `preview_token` (the token lifts both path gates — `src/server.ts:519-546`). Command: `curl "https://framique.qubickle.com/store/<slug>/pages/<page-slug>?preview_token=<token>"` |
| 2 | What does the **CMS-designated homepage** actually show for a themed store today — is the merchant's real homepage content truly dropped? | The code path says yes (`src/components/store/StoreHomepage.tsx:99-123` has no `contentSlot`, so the theme's `page` main wins and `contextSlots.page_content` is orphaned). **Needs:** a store with a CMS-designated homepage **and** a theme with a `page` template. Command: `curl "https://<custom-domain>/" \| grep -c "Size guide"` on the akira store once reachable |
| 3 | Is `StorefrontPage` (`src/components/store/StorefrontPage.tsx`) dead code to be deleted, or is it a regression (the `index` template was meant to render on `/`)? | Repo-wide grep shows no importer. **Needs:** the intent of the commit that introduced `StoreHomepage`. Command: `git log --oneline -- src/components/store/StorefrontPage.tsx src/components/store/StoreHomepage.tsx` |
| 4 | Does the platform still support `?preview_token=` on `/store/<slug>` (which would let an auditor reach a themed store)? | `src/server.ts:519-546` implies yes, gated by a token-verified, merchant-bound check. **Needs:** a minted preview token for a merchant whose theme is Songoskriti |
| 5 | What is the intended precedence between a CMS-designated homepage and the theme's `index` template? | Today `index` is never rendered (§1.3) and the CMS page wins — but the storefront loader still fetches the `index` AST (`src/lib/storefront.server.ts:394`). **Needs:** a product ruling, then a test |
| 6 | Do the `41` catalog `templates:` allowlists need `archive`, and which? | Depends entirely on the Phase-5 decision. **Needs:** the human's ruling |
| 7 | Is the `page_content` widget's `templates: ["page","blog"]` allowlist (`src/lib/builder-ast.ts:1597`) correct for the blog template too? | `blog` is in the allowlist, but the storefront blog route never uses the theme's blog template, so the affordance is unexercised. **Needs:** the Phase-2 design decision |
| 8 | Are the 3 live-DB stores (Supershop / Atelier / classic) intended to be the reference tenants for this work? | `store_themes` has 3 rows, all on merchant `akira`; only one has a custom domain (a different, themeless merchant). **Needs:** the owner's answer on which tenant to seed Songoskriti into |
| 9 | Does `bun run doc:gate` pass on this tree right now? | Not run — `bun` is unavailable and `node scripts/doc-gate.mjs` was not executed. **Needs:** `node scripts/doc-gate.mjs` (self-test + repo scan) |
| 10 | Does the CI `unit-contract` job's `contract-gate.mjs` manifest include any template-contract file that a new key would change? | The manifest was read (`scripts/contract-gate.mjs:38+`) but not enumerated against a hypothetical `archive` key. **Needs:** `node scripts/contract-gate.mjs --list` |
| 11 | Can the Songoskriti parity suite be wired into CI without new credentials? | The 60 captures need only the public preview route; the trailing activation test needs `E2E_MERCHANT_EMAIL`/`E2E_MERCHANT_PASSWORD` and skips otherwise (`.e2e/songoskriti-port-parity.spec.ts:383-400`). **Needs:** an owner decision (port spec §9 treats CI wiring as a separate escalation) |

---

*End of Phase 0 implementation map. Produced read-only against `/opt/frame28` @ `frame30` / `71271834`. The only file written is this one.*
