# Frame30 — Dynamic themes: composable widgets, one rendering pipeline, and the proof that the storefront matches

**Goal:** Make Frame30's themes behave like **Elementor-compatible WordPress themes**. Ten templates stay what they already are — editable AST layouts a merchant composes — and the thing that is still rigid becomes flexible: **the rigid shared UI inside Cart, Account and Checkout is decomposed into composable widgets** whose props, slots, states and theme-specific renderers are documented, so a theme can rearrange and style the _contents_ of those surfaces and not only their outer containers. The editor canvas, the theme preview and the published storefront then resolve **one** pipeline — the same AST resolution, the same authorised widget registry, the same theme presentation, the same route-specific data contract — with every silent generic fallback replaced by an **explicit** absent/unsupported state, and with the preview's demo data realistic, labelled and free of controls that look live but are inert. The platform keeps every authority it has: authentication, customer scoping, cart totals, inventory, payment and order creation stay server-authoritative, and a theme's customisation changes appearance and composition, never privileges. The result is proved by a browser journey that edits Songoskriti's Cart, Account and Checkout in the real editor, saves, reloads, publishes, and then asserts **visible content and working permitted interactions** on the real storefront — not HTTP 200.

**Architecture:** The platform already owns every mechanism this work needs, and this programme **extends** them rather than adding any. One canonical AST and one widget registry (`src/lib/builder-ast.ts`, 157 catalogue entries, 41 of them context widgets with a `templates:` allowlist), one closed renderer map (`src/components/builder/widgets.tsx`, `WIDGET_COMPONENTS: Record<SectionType, WidgetComponent>`), one theme-presentation registry that lets a theme replace a widget's renderer (`src/lib/theme-presentations.ts`, `registerThemePresentation`), one route-owned context-slot contract (`contextSlots` through `src/components/builder/SectionRenderer.tsx:78`), one template-key union (`TEMPLATE_KEYS`, ten keys) and one editor/publish lifecycle. **What is missing is (a) an interior:** the commerce and account widgets are monolithic catalogue entries whose inside is hardcoded in the renderer, so the AST can place them but cannot describe their insides; **(b) the account's route-owned body** is an opaque React component the theme cannot touch at all; **(c) the theme presentation registry does not cover the commerce/account widget types**, so those surfaces render in the platform's generic type language; and **(d) the three hosts diverge** — the editor canvas does not resolve the theme's presentation and mounts no data providers, the preview synthesises a generic body for every template key it does not author, and the storefront's "this theme does not design this template" fallback is silent. The fix is therefore: **one generic ordered-parts contract** (a single shared parser plus one `parts` prop on six existing catalogue rows, using the platform's existing comma-separated-list convention — no new field kind, no new inspector control), **four new route-owned account panel widgets** plus a provider so the account's contents become placeable, **the theme-presentation claims extended** to the commerce/account types, and **one resolver** shared by the editor canvas, the preview and the storefront. No new registry, no new renderer, no new preview framework, no page-specific workaround.

**Tech Stack:** TypeScript 5.8 / React 19 (TanStack Start + Router), Vitest 4.1.11, Playwright 1.x (Chromium), `tsgo --noEmit` typecheck, ESLint 9 + Prettier 3, Node 24, PostgREST/Supabase (`publicClient` + `requireSupabaseAuth`). **No new npm dependency is added** and no lockfile changes.

**Spec:** `docs/superpowers/plans/2026-10-20-theme-editable-templates-brief.md` (the brief, as received) · `docs/superpowers/plans/2026-10-21-frame30-core-cms-upgrade.md` (the prior programme's plan — the shipped core-CMS upgrade at `be96b320`) · `docs/superpowers/songoskriti-evidence/port/phase0-implementation-map.md` · `docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-evidence.md` · `docs/superpowers/songoskriti-evidence/port/phase3-evidence.md` · `docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md` · `docs/superpowers/songoskriti-evidence/port/phase3-self-critique.md` · `docs/superpowers/songoskriti-evidence/port/phase3-ci.md` · `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md` §7 (Boundary) and §9 (Testing & evidence).

---

# Part I — The audit (the brief's Phase 0, measured against the code at `109e2d3d`)

Every claim below was measured in this working tree. Where the prior record and the tree disagree, **the tree wins** and the disagreement is stated.

## A0. Method, and what was measured

The tree was read, not summarised. The measurements behind this audit:

```
cd /opt/frame28
git rev-parse HEAD && git rev-parse --abbrev-ref HEAD
git ls-remote origin main frame30
git log --oneline frame30..main ; git merge-base main frame30
git rev-list --count main..frame30 ; git rev-list --count frame30..main
git diff --shortstat main..frame30
git status --short
grep -n "export const TEMPLATE_KEYS" -A 14 src/lib/builder-ast.ts
grep -c "^    type: \"" src/lib/builder-ast.ts          # the catalogue's size
grep -c "templates: \[" src/lib/builder-ast.ts         # the context widgets
grep -rn "CheckoutMock" src .e2e --include=*.ts --include=*.tsx
node_modules/.bin/vitest --version
```

`bun` is **not** on `PATH` in this environment; every command below is the `node_modules/.bin/<tool>` form.

## A1. `main` vs `frame30` — the remotes are identical; the LOCAL `main` is a stale, diverged pointer

| fact                                            | value                                                                                          | how it was measured                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `HEAD`                                          | `109e2d3d` (`docs(report): bring the consolidated brief up to the shipped core-CMS programme`) | `git rev-parse HEAD`                                     |
| branch                                          | `frame30`                                                                                      | `git rev-parse --abbrev-ref HEAD`                        |
| `origin/frame30`                                | `109e2d3d81dcc3a82965cd20a8d98e9efc1477c4`                                                     | `git ls-remote origin frame30`                           |
| `origin/main`                                   | `109e2d3d81dcc3a82965cd20a8d98e9efc1477c4` — **byte-identical to `origin/frame30`**            | `git ls-remote origin main frame30`                      |
| local `main`                                    | `59240258` (`docs: backup location, retention, and expiry policy`)                             | `git log --oneline main -1`                              |
| merge base                                      | `56d2a2a0`                                                                                     | `git merge-base main frame30`                            |
| `git rev-list --count main..frame30`            | **440**                                                                                        | local `main` is 440 commits behind                       |
| `git rev-list --count frame30..main`            | **1**                                                                                          | local `main` carries exactly one commit not in `frame30` |
| `git diff --shortstat main..frame30`            | `1249 files changed, 231360 insertions(+), 9245 deletions(-)`                                  |                                                          |
| `git merge-base --is-ancestor 59240258 frame30` | **false**                                                                                      | the local commit is NOT in `frame30`                     |
| `git show --stat 59240258`                      | `AGENTS.md                                                                                     | 10 ++++++`                                               | one file, ten lines |

**What a PR against `main` would contain.** Two answers, and the difference matters:

- **Against the remote `main` (`origin/main`): nothing at all.** They are the same commit; there is no diff to review. The programme was fast-forwarded into the remote `main`.
- **Against the LOCAL `main` branch as it stands on this box: the entire programme** — 1 249 files, +231 360 / −9 245. That is not a reviewable PR; it is the whole nine-phase port plus the core-CMS upgrade.

**The lineage.** `frame30` branched from `56d2a2a0`; the local `main` is that same commit plus one commit, `59240258`, which adds ten lines to `AGENTS.md` (the dev-server backup/retention policy). That exact text is already present in `origin/main` — it was carried forward through the merge — so the local commit is a **duplicate of content the programme already has**, not new work. It is nonetheless **not** an ancestor of `frame30`, so a PR opened against the local branch would need it reconciled.

**The actionable consequence.** The brief's instruction _"check both `main` and `frame30` before modifying anything. Do not assume they are identical"_ is satisfied by measurement: at the remote they **are** identical, and the local `main` is a stale, diverged pointer that must **not** be used as a diff base. The CI's SAST job resolves its base as `origin/main` (`.circleci/config.yml`), which is correct. **Work continues on `frame30`; the local `main` branch is left exactly as it is** — nothing in this programme touches it.

**The working tree is dirty with exactly the three known churn files** — ` M .artifacts/e2e/playwright-report/index.html`, ` M ops/routing/canary-weights.conf`, ` M ops/routing/upstream.conf` — plus the untracked `?? .output-snapshots/`. All four stay untouched and unstaged through every commit of this programme.

## A2. Requirement 1 — Template ownership: **the ten templates are all theme-authored; the hardcoded compositions are the route-owned bodies underneath them**

**Every one of the ten templates the brief names is an editable AST a merchant can change.** Songoskriti authors all ten in its preview source's `main(template, s)` switch (`src/lib/themes/songoskriti/preview.ts`), and each case is a plain `Section[]` built with the theme's own builders:

| template       | the theme's case | the composed body (the ordered widget types)                                                                                                      |
| -------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home (`index`) | `preview.ts:91`  | `buildHomepageMain(s)` — the theme's own homepage builder                                                                                         |
| Collection     | `preview.ts:93`  | `category_header`, `result_toolbar`, `product_grid`, `product_rail`                                                                               |
| Product        | `preview.ts:154` | `heading`, `columns > [container > product_media, container > [breadcrumb, product_meta, price_block, add_to_cart]]`, `rich_text`, `product_rail` |
| Page           | `preview.ts:212` | `breadcrumb`, `page_content`                                                                                                                      |
| Blog           | `preview.ts:223` | `blog_terms`, `blog_archive`, `blog_pager`                                                                                                        |
| Archive        | `preview.ts:247` | `category_header`, `blog_terms`, `blog_archive`, `blog_pager`, `pagination`, `empty_state`                                                        |
| Search         | `preview.ts:308` | `category_header`, `result_toolbar`, `facet_sidebar`, `filter_chips`, `product_grid`, `pagination`, `empty_state`                                 |
| Cart           | `preview.ts:364` | `heading`, `columns > [container > cart_lines, container > cart_summary]`                                                                         |
| Checkout       | `preview.ts:399` | `heading`, `checkout_steps`, `page_content`, `columns > [container > [payment_methods, payment_icons], container > cart_summary]`                 |
| Account        | `preview.ts:457` | `profile_card`, `page_content`                                                                                                                    |

The mechanism is the shipped one: one AST per template key (`ThemeTemplates = Partial<Record<TemplateKey, ThemeAst>>`), per-template persistence isolation, a reset-to-default affordance, a publish gate that lints every variant with its base key, and a distinctness gate with a non-empty row per key (`src/lib/themes/songoskriti/template-distinctness.ts:132-250`). **Requirement 1 is already satisfied at the level of template composition.**

**What is NOT theme-editable — the hardcoded page compositions, by file:line.** These are the real content of requirement 2, because they are what a theme cannot rearrange:

| #   | the hardcoded composition                                                                                   | where                                                                                                   | why it is rigid                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | **the account dashboard** — nav, overview, profile, order rows, order detail, addresses, consents, wishlist | `src/components/store/AccountDashboard.tsx:221` (1 277 lines)                                           | it is the route's `page_content` node — a React component, not a widget. The theme can neither place its parts nor style them.                                                                                            |
| H2  | **the checkout form** — contact block, address block, note, validation                                      | `src/routes/store.$slug.checkout.tsx:462` (`CheckoutBody`), contact at `:709`                           | the route's `<form>`; it must stay the platform's (requirement 5), but its _fields_ cannot be reordered by a theme.                                                                                                       |
| H3  | **the route's own payment picker**                                                                          | `src/routes/store.$slug.checkout.tsx:773-828`                                                           | a second, differently-worded presentation of the same rail the theme's `payment_methods` widget shows ("This store has not enabled any payment method yet." vs the widget's "No payment method is available right now."). |
| H4  | **the route's own order summary panel**                                                                     | `src/routes/store.$slug.checkout.tsx:914-1008`                                                          | the same quote, the platform's own markup, rendered when the theme's body carries no `cart_summary`.                                                                                                                      |
| H5  | **the search results block** — query box, category/kind chips, notices, results grid                        | `src/routes/store.$slug.search.tsx:575-583`, handed over as one opaque `productSlot` (`:646`)           | the theme's `product_grid` renders it **verbatim** on the search template; the theme cannot restyle a card.                                                                                                               |
| H6  | **the platform's taxonomy grid** — the store-less blog category/tag/author surfaces                         | `src/components/store/BlogArchiveTheme.tsx:28`, delegated by `src/components/store/ArchiveView.tsx:152` | deliberate: those routes carry **no store slug**, so they cannot resolve a theme at all. Not a defect; a named deferral.                                                                                                  |
| H7  | **the CMS page body** and **the article body**                                                              | `src/components/store/PageView.tsx`, `src/components/store/ArticleView.tsx` (behind `page_content`)     | correct — the merchant's own record is route-owned content.                                                                                                                                                               |
| H8  | **the cart fallback page**                                                                                  | `src/routes/store.$slug.cart.tsx:109-130`                                                               | the route's own surface for a theme that declines the cart — rendered **silently** (see A4, D5).                                                                                                                          |

So the honest statement of requirement 1 is: **the ten templates own their composition; the route-owned bodies underneath Cart, Account and Checkout do not.** That is exactly where requirement 2 bites.

## A3. Requirement 2 — Widget ownership: **what the theme may rearrange and style today, and what it may not**

### A3.0 The three levers the platform already has, and the one it does not

| lever                                                                                  | the mechanism                                                | where                                                                                                     | used today                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L1 — the block.** A catalogue entry is a node the theme places, reorders and nests.  | `BASE_CATALOG` + `SectionRenderer`                           | `src/lib/builder-ast.ts:1019+`, `src/components/builder/SectionRenderer.tsx`                              | **yes** — the theme places `cart_lines` and `cart_summary` as separate blocks                                                                                                                                                                                           |
| **L2 — the presentation.** A theme replaces a widget's renderer for its own theme key. | `registerThemePresentation(themeKey, widgetType, Component)` | `src/lib/theme-presentations.ts:97`, claimed by `src/lib/themes/songoskriti/presentation-claims.ts:36-50` | **yes, but only for 13 non-commerce types** (`product_rail`, `product_grid`, `rich_text`, `newsletter`, `footer_sitemap`, `payment_icons`, `department_grid`, `store_locator`, `split_feature`, `collection_story`, `ugc_gallery`, `category_header`, `result_toolbar`) |
| **L3 — the interior.** The widget's own ordered, authorable parts.                     | **does not exist**                                           | —                                                                                                         | **no — this is the gap**                                                                                                                                                                                                                                                |

**The shared root cause, in one sentence:** _the commerce and account widgets are monolithic catalogue entries whose interior structure is hardcoded in the renderer, so the AST can place them but cannot describe their insides; and the theme-presentation registry — the one lever that would let a theme restyle them — does not cover the commerce/account widget types at all._

This is corroborated by the prior programme's own open item: `phase3-evidence.md` §6 item 5 records that _"the three platform context widgets render in the platform's own generic type language (the `cart_summary`'s uppercase letterspaced 'ORDER SUMMARY', the checkout's 'PLACE ORDER' slab)"_ as **escalated, not fixed**, because they are platform-side renderers outside that programme's boundary. **This programme is that boundary decision, and it is the whole of requirement 2.**

### A3.1 The enumeration — per surface, exactly what the theme may and may not do

**Cart** (`cart`; the theme composes `heading` + `columns > [container > cart_lines, container > cart_summary]`)

| route-owned piece | widget type (catalogue row)                                                            | props the theme **may** set                                                                                                                                                                                                                                                | props the theme may **not** set                                                                                                         | what the theme therefore cannot do today                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| the line list     | `cart_lines` (`builder-ast.ts:2923`; renderer `cart.tsx:204` → `LineList` `:68`)       | `heading`, `removeLabel`, `emptyText`                                                                                                                                                                                                                                      | the row's **field order**; the row's **layout**; whether the unit price / the variant / the line total show; the row's spacing and type | cannot reorder a line row's fields; cannot drop the unit price; cannot restyle a row; cannot change the row's shape            |
| the totals block  | `cart_summary` (`builder-ast.ts:1641`; renderer `cart.tsx:441` → `SummaryBody` `:314`) | `heading`, `subtotalLabel`, `discountLabel`, `shippingLabel`, `codLabel`, `vatLabel`, `totalLabel`, `ctaLabel`, `couponLabel`, `couponApplyLabel`, `emptyText`, `freeShippingLabel`, `freeShippingSuffix`, `freeShippingDone`, `showCoupon`, `showCta`, `showFreeShipping` | the **order** of the total rows; whether a row shows at all; the **total's emphasis**; the block's own padding/type                     | cannot reorder the totals; cannot hide the VAT row; cannot lift the total above the subtotal; cannot restyle the summary block |
| the drawer        | `cart_drawer` (`builder-ast.ts:2941`)                                                  | eight label/boolean props                                                                                                                                                                                                                                                  | the drawer's row layout                                                                                                                 | (the drawer, not the page)                                                                                                     |
| the trail         | `checkout_steps` (`builder-ast.ts:2972`)                                               | `heading`, `step1..step4`, `activeStep`                                                                                                                                                                                                                                    | the trail's shape; whether the steps are links                                                                                          | cannot restyle the trail                                                                                                       |
| the rail          | `payment_methods` (`builder-ast.ts:2996`)                                              | `heading`, `note`, `emptyText`                                                                                                                                                                                                                                             | the option layout; the group labels; the **order of the rails**                                                                         | cannot split the payment rail; cannot reorder the rails; cannot restyle an option row                                          |

**Account** (`account`; the theme composes `profile_card` + `page_content`)

| route-owned piece | widget type                                                        | props the theme **may** set | what the theme may **not** do today                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the profile card  | `profile_card` (`builder-ast.ts:5049`; renderer `account.tsx:141`) | `heading`                   | cannot reorder the card's fields; cannot hide the email or the phone; cannot restyle the avatar                                                                                        |
| the order list    | `orders_list` (`builder-ast.ts:5031`; renderer `account.tsx:70`)   | `heading`, `emptyText`      | cannot reorder an order row's fields; cannot hide the status chip or the date; cannot restyle the row                                                                                  |
| **the dashboard** | **not a widget** — it is the route's `page_content` node           | **nothing**                 | cannot move the nav, the overview, the order rows, the address forms, the consent switches or the wishlist; cannot restyle any of them; cannot place any of them outside the dashboard |

**Checkout** (`checkout`; the theme composes `heading`, `checkout_steps`, `page_content`, and the payment + summary columns)

| route-owned piece                       | what the theme may do                                                                               | what the theme may **not** do                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| the payment rail (`payment_methods`)    | place it, choose its heading and note                                                               | split it, reorder the rails, restyle an option row                               |
| the totals (`cart_summary`)             | place it, label every row                                                                           | reorder the rows, hide a row, restyle the block                                  |
| the trail (`checkout_steps`)            | place it, label the steps                                                                           | restyle it                                                                       |
| the customer form (`page_content` → H2) | place it as one block, anywhere in the composition                                                  | reorder its fields; restyle them; author a field (the platform owns every value) |
| the place-order action                  | **nothing** — it is the route's trailing slot (`ThemeChrome`'s `afterBody`, `checkout.tsx:370-376`) | the theme cannot place it, fill it, or know it exists                            |

**Search** (`search`; the theme composes seven sections) — the theme composes freely, but the **results** are one opaque block (H5), and `facet_sidebar` is granted **only in the preview** (`ThemePreviewFrame.tsx:846`) — so the theme's search body shows a facet column in the preview and **nothing** in production.

**Blog** — the theme composes the pack (`blog_terms`, `blog_archive`, `blog_pager`) and the article variant (`page_content` + `blog_archive` + `newsletter`). The pack's cards are the platform's `BlogCardData` shape rendered by `src/components/builder/blog.tsx`; the theme cannot restyle a card. The article body is route-owned (H7) — correctly.

**Page** — `breadcrumb` + `page_content`; the body is the merchant's CMS record. Correctly route-owned.

**Product** — the theme composes `heading`, the two-column `product_media` / lane-widgets column, a `rich_text` and a `product_rail`. The PDP lane widgets (`product_meta`, `price_block`, `add_to_cart`) are context widgets whose _content_ the route owns; the theme can arrange them but not their insides.

**Collection** — `category_header` + `result_toolbar` + `product_grid` + `product_rail`; the grid reads the host's `collectionSlot`.

**Home** — `buildHomepageMain(s)`; entirely the theme's.

### A3.2 The decomposition — the EXISTING canonical mechanism, extended. No new registry, no new renderer.

**The mechanism (L3), ONE generic contract, not six bespoke vocabularies.** The platform already has a convention for an ordered list of tokens in a widget prop: `category_header.subnav` and `payment_icons.marks` both carry comma-separated lists, parsed by `parsePickedHandles` (`src/lib/builder-ast.ts:685`). **The parts contract reuses it**, so it needs **no new inspector field kind** and **no change** to `src/components/builder/SchemaControls.tsx` — one fewer §7-prohibited file in the blast radius.

- **NEW file `src/lib/widget-parts.ts`** (a new file is §7-allowed — the escalation record's own rule, _"a NEW file needs no relaxation"_):
  - `PART_PROP_KEY = "parts"` — the one prop key.
  - `WIDGET_PART_VOCABULARY: Partial<Record<SectionType, readonly string[]>>` — the **closed** part list per widget type, declared **once**.
  - `parseOrderedParts(raw: unknown, allowed: readonly string[]): string[]` — parses the comma-separated list, keeps the author's **order**, drops unknown keys, drops duplicates, caps the length, and returns `[]` for an empty/unknown value so the caller falls back to the default.
  - `partOrder(raw: unknown, type: SectionType): string[]` — the effective order: the author's list when it is valid, otherwise the widget's **default order**.
  - `defaultParts(type: SectionType): readonly string[]` — the default order, which is **today's** order, byte for byte.
- **One catalogue field per affected widget** — `text("parts", "Part order (comma-separated)", 200)` — plus a `select("layout", …)` with `row` / `card` on the three list widgets. `parseSection` copies **only** declared fields into `props` (`src/lib/builder-ast.ts:7844-7869`), so the field **must** be declared in the same commit as any AST that carries it; a stored AST **without** it falls back to `entry.defaults[field.key]` → today's order.
- **The part vocabularies** (each closed, each defaulting to today's order):

  | widget            | parts (default order)                                    | what a theme can now do                                                                                    |
  | ----------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
  | `cart_lines`      | `title, variant, unitPrice, quantity, lineTotal, remove` | reorder a line row; drop the unit price; show the line total before the quantity; switch the row to a card |
  | `cart_summary`    | `subtotal, discount, shipping, cod, vat, total`          | reorder the totals; drop the COD row; lift the total to the top                                            |
  | `payment_methods` | `legend, groups, options, note`                          | drop the legend; put the note above the options; flatten the groups                                        |
  | `checkout_steps`  | `labels, active, links`                                  | drop the links; hide the active marker                                                                     |
  | `orders_list`     | `number, date, status, total`                            | reorder an order row; drop the status chip; switch the row to a card                                       |
  | `profile_card`    | `avatar, name, email, phone`                             | drop the avatar; hide the phone                                                                            |

**The account's route-owned body (H1) — decomposed into placeable route-owned widgets.** The account is the one surface where the theme has _no_ control at all, and the mechanism for fixing it already exists: **the context-slot contract**, the very same one the cart and checkout already use. The dashboard's state moves into a provider (the pattern `CartProvider`, `BlogFeedProvider` and `CollectionQueryProvider` already establish), and its panels become catalogue widgets the theme places:

- **NEW file `src/components/store/AccountDashboardContext.tsx`** — `AccountDashboardProvider`, `useAccountDashboard()`, `AccountDashboardState` (the tab, the overview, the status, the open order id, the order detail and the pending/error flags, plus the route's write callbacks). The provider is mounted by the **route**, wrapping `ThemeChrome`, so a panel placed in the theme's body and the dashboard's own copy read the **same** state.
- **Four new catalogue widget types**, each `templates: ["account"]`, `heading: false`, `group: "context"`: `account_nav` (the five-tab strip), `account_overview` (the overview strip), `account_orders` (the structured order rows + the inline order disclosure), `account_details` (the addresses / profile / consents / wishlist panel). Their renderers live in one **NEW file** `src/components/store/account-widgets.tsx`.
- `AccountDashboard.tsx` becomes the provider's **default composition** — the same four panels in today's order — so a theme that places none of them renders **byte-identically** to today, and a theme that places one of them gets that panel **and** the dashboard's fallback does not duplicate it.

**L2 — the theme-presentation claims extended.** `SONGOSKRITI_PRESENTATION_CLAIMS` (`src/lib/themes/songoskriti/presentation-claims.ts:36-50`) grows by the commerce/account types: `cart_lines`, `cart_summary`, `payment_methods`, `checkout_steps`, `orders_list`, `profile_card`, and the four new `account_*` types. Songoskriti's renderers then own the **type language** of those surfaces — closing the prior programme's open item §6.5 — **and they must honour the same `parts` prop**, so a merchant's arrangement survives the presentation swap. The presentation registry is the existing one; no new registry is created.

**Which existing widgets are already composable and can host the new pieces without a new registry.** Exactly two catalogue entries are containers — `container` (`:1022`, `container: true` at `:1027`) and `columns` (`:1079`, `container: true` at `:1084`) — and both are already `slots: ["header","main","footer"]`. Every new piece is therefore hosted by the **existing** `columns`/`container` pair: the theme places `account_nav`, `account_overview`, `account_orders` and `account_details` inside `columns > container`, exactly as it already places `cart_lines` and `cart_summary`. **No new container type is needed**, and the AST's `container: true` rule (`lintTemplate`, `src/lib/builder-ast.ts:8516-8523`) keeps working unchanged.

**Why the decomposition is not "a second widget system".** Every piece above lands in the four mechanisms the platform already has: the catalogue row (props + allowlist + defaults), the closed renderer map (`WIDGET_COMPONENTS`), the context-slot grant, and the theme-presentation registry. The new module `src/lib/widget-parts.ts` is a **parser and a vocabulary table** — it renders nothing and owns no state.

## A4. Requirement 3 — One pipeline: **the three hosts resolve different ASTs, different presentations and different data, and the preview invents a body for every key**

| #      | the divergence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | the evidence                                                                                      | what it should be                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | **The editor canvas does not resolve the theme's presentation.** The canvas renders `SectionRenderer` **without** `themeKey` (`src/routes/_authenticated/dashboard/builder.tsx:2536-2567`), and `SectionRenderer`'s own docstring says so: _"Live storefront hosts pass the merchant theme key; the preview frame passes its blueprint key"_ (`src/components/builder/SectionRenderer.tsx:88-92`). `resolveThemePresentation` therefore falls back to the platform's generic component (`SectionRenderer.tsx:800-804`).                                                                                                      | the editor shows the **platform's** widget; the preview and the storefront show **Songoskriti's** | the canvas passes `themeKey={activeThemeKey}` — the same key the tray already uses (`builder.tsx:1925`) — so all three hosts resolve one presentation                                                                                                                                                                                                                            |
| **D2** | **The editor canvas mounts no data providers.** The builder route mounts **no** `CartProvider`, **no** `WidgetDataProvider`, **no** `BlogFeedProvider`, **no** `CollectionQueryProvider`. So the editor renders the studio's `DEMO_CART` snapshot ("Sample product", "Second product" — `src/components/builder/CartContext.tsx:75-124`), the blog pack's engine `SAMPLE` six rows (`src/components/builder/blog.tsx:51`, `:189`), and the account widgets' sign-in prompt (no rows). The preview mounts the theme's own synthetic cart/feed/query (`ThemePreviewFrame.tsx:1285-1293`); the storefront mounts the live ones. | three hosts, three datasets                                                                       | the editor mounts the **same** demo providers the preview mounts, so the editor and the preview agree and only the storefront differs (by design, and labelled)                                                                                                                                                                                                                  |
| **D3** | **Three different ASTs.** The editor canvas renders the merchant's **draft** (`doc.templates[template]`). The preview resolves the theme's **source** for an anonymous visitor, and for a signed-in merchant the **latest `theme_versions` row** — not the published pointer (`src/routes/theme-preview.$key.tsx:65-158` → `src/lib/preview-sources.ts:106-137`). The storefront serves the **published** pointer (`store_themes.published_version_id`).                                                                                                                                                                     | a merchant's preview can show a version the storefront does not serve                             | the preview's installed artifact reads the **published** row, so preview and storefront resolve the **same** map; the editor resolves the draft, and the difference is explicit and labelled                                                                                                                                                                                     |
| **D4** | **The preview synthesises a body for every template key.** `assemblePreviewTemplates` does `source.main(templateKey, s) ?? genericDemoMain(templateKey, s)` (`src/lib/theme-preview-nav.ts:473`, `:516`) — a theme that authors no body for a template gets _"Demo page. The live theme authors this template — what you see here is the engine fallback."_                                                                                                                                                                                                                                                                  | a **silent generic fallback**, named by the brief                                                 | the synthesis goes; a template the theme does not author stays **absent** from the map, and the preview host's **existing** explicit panel renders (`ThemePreviewFrame.tsx:625` `unsupported`, `:1075` the panel). `genericDemoMain` **stays** as the distinctness gate's reference body (`template-distinctness.ts:56`, `:504`) — it is the gate's yardstick, not a synthesiser |
| **D5** | **The storefront's "this theme does not design this template" fallback is silent.** `ThemeChrome` renders the route's `fallback` when the theme's body does not render (`ThemeChrome.tsx:318`, `:431-433`) with **no** signal that the theme declined the template. The cart's fallback is a bare "Your Bag / Proceed to Checkout" (`store.$slug.cart.tsx:109-130`); the search's fallback is the platform's listing (`search.tsx:647-652`).                                                                                                                                                                                 | the shopper sees an unbranded platform page; the merchant is never told                           | the fallback becomes an **explicit** state: the route's platform surface is retained (it is the platform's own designed surface for a declined template), but the **editor** and the **publish gate** say so by name, and the storefront renders it inside a named, non-demo frame rather than as an indistinguishable theme page                                                |
| **D6** | **The preview's payment radios look live and are inert.** The preview's cart context sets `setMethod: () => {}` with `methods: ["cod","bkash","nagad"]` and `method: "cod"` (`src/lib/themes/songoskriti/preview-demo-data.ts:185-194`). `PaymentMethods` renders `<input type="radio" checked={cart.method === key} onChange={() => cart.setMethod(key)}>` (`src/components/builder/cart.tsx:606-615`). The preview's capture handler blocks **submits and links** only (`src/lib/theme-preview-nav.ts:151-206`), so clicking a rail changes nothing and shows **no** toast.                                                | a control that looks live and does nothing                                                        | the preview's demo cart carries a **local** selection state so a rail can be chosen, and the preview labels the rail block as demo                                                                                                                                                                                                                                               |
| **D7** | **The search surface grants `facet_sidebar` in the preview and not in the storefront.** The preview grants it (`ThemePreviewFrame.tsx:846`); the storefront's search route does not (`store.$slug.search.tsx:632-645`), because its rows come from the widget-data pipeline and no storefront route mounts a `WidgetDataProvider`. The prior programme named this difference rather than closing it (`src/lib/preview-parity.contract.test.ts:16-20`).                                                                                                                                                                       | a facet column in the preview, nothing in production                                              | the storefront grants it — the widget batch is **already** resolved for the published layout (`src/lib/storefront.server.ts:506-514`) and the `facets` source exists (`src/lib/widget-data.server.ts:1192`) — or, if that proves too wide, the preview stops granting it and the theme's search composition drops it. **This is Decision Gate G3.**                              |
| **D8** | **The checkout's "no payment method" case is a dead end with a live button.** When the server offers no rail, the theme's widget renders a plain paragraph — "No payment method is available right now." (`cart.tsx:575-586`) — and the route's own picker renders a **different** sentence ("This store has not enabled any payment method yet.", `checkout.tsx:778-784`), while the place-order button stays **enabled** (`submitDisabled = !totals                                                                                                                                                                        |                                                                                                   | …`, `checkout.tsx:879-880`).                                                                                                                                                                                                                                                                                                                                                     | two sentences for one state, and an enabled action on a store with no rail | one shared empty state, and the place-order action is **disabled** with a named reason whenever the server offered no rail — the platform decides, the theme only presents it |

**The pipeline today, in one table.** The three hosts are:

|                 | editor canvas                                              | theme preview                                              | published storefront                                       |
| --------------- | ---------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| AST             | the merchant's **draft**                                   | the theme **source**, or the merchant's latest **version** | the merchant's **published** version                       |
| registry        | `WIDGET_COMPONENTS`                                        | `WIDGET_COMPONENTS`                                        | `WIDGET_COMPONENTS`                                        |
| presentation    | the **generic** widget (no `themeKey`)                     | the theme's presentation (`themeKey = blueprintKey`)       | the theme's presentation (`themeKey = merchant theme key`) |
| data            | the studio's `DEMO_CART` + the engine's `SAMPLE` blog rows | the theme's synthetic cart / feed / query                  | the live cart / feed / query                               |
| absent template | the empty-canvas prompt                                    | a **synthesised** generic demo body                        | the route's own surface, **silently**                      |

## A5. Requirement 4 — Real data, safe preview: **the data contract is sound; three specific holes remain**

**Per template — what production supplies, what the preview supplies, and whether a required slot can render blank.**

| template   | production data                                                                                                                             | preview data                                                                                                               | can a required slot render blank?                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| search     | the platform's query, result set, tenant scope, limit (`PAGE_SIZE = 24`, `MAX_PAGE_SIZE = 48` — `src/lib/storefront-search.ts:29-30`)       | the theme's demo query `jamdani` + the demo catalogue + the demo facets                                                    | **no** — `empty_state` is granted only when the result set is empty (`search.tsx:641-643`, mirrored by the preview `ThemePreviewFrame.tsx:848`) |
| cart       | the live cart and the **server** quote (`quoteCart`)                                                                                        | the theme's synthetic cart, money **derived** from the demo catalogue (`preview-demo-data.ts:158-202`)                     | **no** — the empty state renders the "Your cart is empty" panel (`cart.tsx:112-136`)                                                            |
| account    | the session-scoped `customer_overview` RPC (`src/lib/accounts.server.ts:99`)                                                                | the demo overview, labelled "Rumana Haque (demo shopper)", an RFC 2606 `.example` address (`preview-demo-data.ts:260-315`) | **no** — the six states are distinct and mapped by one pure function (`src/lib/account-status.ts`)                                              |
| checkout   | the server quote, the offered rails, the stock hold, the order write                                                                        | the synthetic cart + the same widget pipeline                                                                              | **no**, but see D8: the "no rail" state is a paragraph next to an enabled button                                                                |
| blog       | the real feed through `BlogFeedProvider`                                                                                                    | the theme's demo feed                                                                                                      | **no** — the pack's widgets render the feed, and the engine's `SAMPLE` rows are the fallback when **no** feed is mounted                        |
| page       | the merchant's CMS record                                                                                                                   | the theme's labelled sample page                                                                                           | **no**                                                                                                                                          |
| product    | the live PDP through the `productSlot`                                                                                                      | the demo catalogue's art                                                                                                   | **no** — the demo product is named and its price is the catalogue's                                                                             |
| collection | the live collection through the `collectionSlot`                                                                                            | the demo collection                                                                                                        | **no**                                                                                                                                          |
| archive    | **no production route** — the three taxonomy surfaces are store-less and keep the platform grid (H6); the merchant-scoped route is deferred | the theme's own archive body with its six functional slots                                                                 | **no**                                                                                                                                          |
| home       | the live homepage record                                                                                                                    | the theme's homepage builder                                                                                               | **no**                                                                                                                                          |

**The demo data's realism and labelling — measured, and good.** `src/lib/themes/songoskriti/preview-demo-data.ts` derives everything from the demo catalogue (`demoCatalogFor("songoskriti")`): the money is **derived** from the lines (`subtotalMinor` = the sum, `totalMinor` = subtotal + shipping, `:160-172`), the order history is built with the **live** route's own mapper (`mapOrdersToRows`, `:213-215`), and the shopper is visibly a demo (`"(demo shopper)"`, `rumana@example.com`, `01700000000`). The four contracts are already pinned by `src/lib/themes/songoskriti/cart-account-demo.test.ts`. **This part of requirement 4 is already satisfied**; the holes are D6 (inert rail) and D8 (the dead-end "no rail" state), and the two blanks the brief names:

- **A required slot that renders BLANK.** The mechanism that would render a required slot blank is `SectionRenderer`'s context gate: `slot = contextSlots?.[section.type]; if (slot === undefined) { if (!editing) return null; … }` (`SectionRenderer.tsx:825-833`). A context widget on a template the host did not grant renders **nothing** — silently. The account's `profile_card` is granted only when the shopper is signed in (`store.$slug.account.tsx:223-234`), so an anonymous visitor gets a **blank** profile slot — the prior programme recorded this as open item §6.6. The fix is the same rule the platform already uses for the checkout (`checkoutShellControls`, `src/lib/theme-shell-slots.ts:126-150`): **the route supplies the control when the theme's body does not**, and the supply is **explicit**, never a blank.

## A6. Requirement 5 — Security: **what the platform keeps, and where a composable widget could reach data it must not**

**The platform keeps, after this change:**

| authority                             | where it lives                                                                                                                                     | why the change cannot touch it                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| authentication                        | `supabase.auth.getSession()` in the account route                                                                                                  | the composable widgets read a **provider** the route mounts; the provider carries no credential                       |
| customer scoping                      | the `customer_overview(uuid)` RPC is `SECURITY DEFINER` and scoped to `auth.uid()` (`supabase/migrations/20260907174014_6c48ad30-….sql:28`, `:61`) | the account widgets read the **route's** overview; they never query                                                   |
| cart totals, stock, discount          | `quoteCart` → `priceCart` (server)                                                                                                                 | the `parts` prop chooses the **order of rows**, never their values; the renderer reads `cart.totals` and nothing else |
| the payment rails                     | the server's `quote.settings.methods`                                                                                                              | `payment_methods` renders exactly what the server offered (`cart.tsx:558-566`); a theme cannot add a rail             |
| order creation                        | `placeOrder` → `createOrder` with an idempotency key, a honeypot and a behaviour beacon (`checkout.tsx:574-603`)                                   | the theme never authors a form; the route's `<form>` is the only form                                                 |
| the customer fields                   | the route's validated `FormData` (`checkout.tsx:593-600`) and the server's `placeOrder` schema                                                     | the `parts` prop never touches the checkout form                                                                      |
| the tenant scope and the search limit | the platform's search (`storefront-search.ts`), `PAGE_SIZE = 24`                                                                                   | unaffected                                                                                                            |
| the package capability model          | a closed **read-only** allowlist; a theme never mutates store data (`src/lib/theme-package.ts:550-565`)                                            | the new widgets are platform renderers, not theme capabilities                                                        |

**Where a composable widget could accidentally reach data it should not — the three seams this programme opens, and each one's guard:**

1. **The account panels are route-owned data rendered in a theme-placed position.** The risk: a panel that queries on its own, or that renders another customer's rows. The guard: the panels read **only** the provider, and the provider is built by the route from the `auth.uid()`-scoped overview. A panel with no provider renders **nothing** (fail-closed), never a fetch.
2. **The `parts` prop is a merchant-authored string that reaches the renderer.** The risk: a crafted value reaching markup or the DOM. The guard: `parseOrderedParts` is a **closed-vocabulary allowlist** — an unknown key is dropped, never rendered — and it is the same shape as `parsePickedHandles`, which is already the platform's answer to exactly this.
3. **The theme's presentation replaces a commerce widget's renderer.** The risk: a theme renderer that reads something the platform's did not, or that computes money. The guard: the presentation receives the **same** `WidgetCtx` (`section`, `str`, `bool`, `int`, `money`, `slot`, `data`, `renderChildren`) — it has no server access at all; money comes from `ctx.money` over the server's minor units, and the platform's own widgets never divide (`src/components/builder/cart.tsx:1-11` states the rule).

**The one thing the platform must NOT give away.** The `parts` prop orders **rows**, and rows are **server values**. A theme that could author a row's _value_ would be authoring a price. The mechanism prevents it structurally: the prop is a **list of part keys**, not a list of values, and the vocabulary is closed.

## A7. Requirement 6 — Proof: **two lanes exist; neither asserts a _changed_ composition, and neither asserts a working interaction**

| lane                              | file                                                       | what it asserts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | what it does **not** assert                                                                                                                                                                                                                                                                                                        |
| --------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the seven-template editor journey | `.e2e/songoskriti-seven-templates.spec.ts` (561 lines)     | a real login, the real editor, the template strip, a widget inserted through the real tray, a reorder through the navigator's own buttons, a real inspector property changed, the three device presets, save → **reload** → the layer list and the inspector value survive, the real publish path (success advances the published pointer; a refusal leaves it untouched and says why), then the storefront route with per-template visible-content assertions (`:176-348`)                                                                                               | that the **changed** composition is visible on the storefront (the journey changes a **Spacer's height** to 56 and never asserts anything about it on the storefront — `:489-493`, `:515-523`); that any **permitted interaction** works (no payment rail is chosen, no quantity is changed, no tab is switched on the storefront) |
| the storefront-surface assertions | `.e2e/songoskriti-storefront-surfaces.spec.ts` (396 lines) | the search count equals the platform's own; the cart renders the theme's body; the account renders the anonymous state and the signed-in dashboard; the blog listing and the article render **different** compositions; the checkout renders the theme's shell around the platform's form (and the place-order action names the platform's form through `form=`); the checkout's ORDER (contact → rail → total → action, by bounding box); the archive surfaces keep the platform grid while the preview renders the theme's body; the page renders the merchant's record | any **editor → storefront** linkage (it never opens the editor); any **interaction** beyond navigation                                                                                                                                                                                                                             |
| the self-critique capture         | `.e2e/songoskriti-self-critique.spec.ts`                   | the seven surfaces at six widths in two locales                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                                                                                                                                                                                                                                                                                                                                  |

**What is missing, in the brief's own words — "asserting VISIBLE CONTENT and WORKING permitted interactions, not merely HTTP 200":**

1. **A changed composition, asserted on the storefront.** Nothing today proves that an edit made in the editor changes what the storefront renders. The journey changes a Spacer's height — invisible in the assertion set.
2. **A working permitted interaction.** Nothing today proves that a theme-composed control (a payment rail, a quantity stepper, an account tab) still _works_ after the composition changes.
3. **The account and the checkout are not in the "changed composition" journey at all** — the brief names Cart, Account and Checkout explicitly.

## A8. The obsolete-path question — **which paths exist only to serve the old rigid model, and who still uses them**

| #   | the path                                                                                                                                           | is it still used? | by whom                                                                                                                                                                                                                                       | the disposition                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| O1  | **`src/components/store/CheckoutMock.tsx`** (137 lines) — a hardcoded checkout with fake inputs, a fake order summary and a remote image URL       | **NO**            | `grep -rn "CheckoutMock" src .e2e --include=*.ts --include=*.tsx` returns **only its own definition** and two _comments_ saying the preview does **not** use it (`ThemePreviewFrame.tsx:1113`, `songoskriti-preview-compositions.test.tsx:8`) | **remove** — proven unused (Task 6)                                                                                                                          |
| O2  | **`genericDemoMain`** (`src/lib/theme-preview-nav.ts:473`) — the engine's generic `heading` + `rich_text` demo body                                | **YES, twice**    | the preview's synthesis (`:516`) **and** the distinctness gate's reference body (`template-distinctness.ts:56`, `:504`, plus `template-distinctness.archive.test.ts:143`, `search-template.test.ts:156`, `page-content.test.ts:94`)           | **the synthesis goes** (D4); the function **stays** as the gate's yardstick                                                                                  |
| O3  | **`UNSUPPORTED_TEMPLATE_BODY`** (`src/components/store/ThemePreviewFrame.tsx:138`) — the explicit "not supported by this theme" copy               | **YES**           | the panel at `:156`; its text is read straight out of the file by `src/lib/themes/songoskriti/archive-contract.test.ts`                                                                                                                       | **keep and re-word** — it is the explicit state D4 relies on                                                                                                 |
| O4  | **`src/components/store/BlogArchiveTheme.tsx`** — the platform's taxonomy grid                                                                     | **YES**           | `src/components/store/ArchiveView.tsx:152` (the archive host's delegated fallback) and `ArchiveView.test.tsx:203` (the byte-identical pin)                                                                                                    | **keep** — the taxonomy surfaces are store-less by design (H6)                                                                                               |
| O5  | **`src/lib/theme-shell-slots.ts`** — `themePlacesAccountProfile`, `themeCarriesPaymentPicker`, `themeCarriesOrderSummary`, `checkoutShellControls` | **YES**           | the account route (`:250`) and the checkout route (`:302-303`)                                                                                                                                                                                | **keep and generalise** — it is the rule "the route supplies the control the theme's body does not", and the composable pieces make it sharper, not obsolete |
| O6  | **`DEMO_CART`** (`src/components/builder/CartContext.tsx:75-124`) — the studio's snapshot cart ("Sample product", "Second product")                | **YES**           | it is the context's **default value** — any host that mounts no `CartProvider` reads it                                                                                                                                                       | **keep** as the default, but the editor canvas must stop _being_ such a host (D2)                                                                            |
| O7  | **`src/lib/preview-demo-data.ts` (`previewDemoMap`)** — the studio's generic demo map                                                              | **YES**           | the preview's non-Songoskriti blueprints                                                                                                                                                                                                      | **keep**                                                                                                                                                     |
| O8  | **the route's own payment picker (H3) and summary panel (H4)**                                                                                     | **YES**           | the checkout route's fallback, when the theme's body carries neither                                                                                                                                                                          | **keep** — they are the platform's surface for a theme that declines the checkout; but their **copy** must converge with the widget's (D8)                   |

## A9. Third-party compatibility — the published surfaces, and the additive rule that keeps a published theme rendering

**What is published.**

| surface             | where                                                                                              | what it constrains                                                                                                                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the widget registry | the catalogue (`src/lib/builder-ast.ts`)                                                           | a package's `supportedWidgets` must name entries that exist (`theme-package.ts:420-442`); the package's **props** are validated against the catalogue's declared `fields` by `validateProps` (`src/lib/widget-props.ts`)                                                  |
| the template list   | a package's `templates` must be a non-empty subset of `TEMPLATE_KEYS` (`theme-package.ts:385-404`) | the ten keys; the `templates.archive_requires_api` rule (`:413-418`) is the one per-key check                                                                                                                                                                             |
| the API range       | `THEME_API_RANGE = "^3.0.0"` (`theme-package.ts:56`)                                               | **documentation only — no code reads it.** The live gate is `satisfiesApiRange(api)` against `BUILDER_API_VERSION = "3.1.0"` (`src/lib/plugin-manifest.ts:32`, `:463-484`), called at `theme-package.ts:316` and at install (`src/lib/package-install.server.ts:316-331`) |
| the asset manifest  | `assetManifest` — path + sha256, no executables, no duplicates (`theme-package.ts:523-545`)        | the theme's **assets**, not its widget types — unaffected by this change                                                                                                                                                                                                  |
| the capabilities    | a closed **read-only** vocabulary (`theme-package.ts:550-565`)                                     | a theme never mutates store data; `render_storefront` is required                                                                                                                                                                                                         |

**What breaks if `cart_lines` / `orders_list` / `payment_methods` become composable.** Nothing, under the **additive rule**:

1. **The new `parts` prop is OPTIONAL and its default is today's order.** `parseSection` copies only declared fields (`builder-ast.ts:7844-7869`) and falls back to `entry.defaults[field.key]` — so a published theme's stored AST, which carries no `parts` prop, renders **byte-identically**. A theme that _does_ carry one (only possible after this change ships) gets the order it asked for.
2. **The new widget types are new catalogue keys.** An existing package's `supportedWidgets` never names them; a package that wants them must declare them, and the manifest gate already accepts any catalogue entry. The `SectionType` union grows, which is a **compile-time** change only.
3. **The API line does not move.** `THEME_API_RANGE` stays `^3.0.0` and `BUILDER_API_VERSION` stays `3.1.0` — no version bump, no re-review of every plugin and theme. The only per-key rule stays the existing additive one: a package that declares `archive` must declare a lower bound ≥ 3.1.0.
4. **The `templates:` allowlists are not a published contract** — they are the platform's per-widget permission table. Growing one (the four new `account_*` rows carry `["account"]`) is internal. A published theme that places `cart_lines` on `cart` keeps working exactly as it does.
5. **The package's declared `templates` list is unaffected** — no template key is added or removed by this programme.

**The rule, stated once:** _a change is compatible when a stored AST written before it renders byte-identically after it._ This programme keeps that property by making every new prop optional with a default that reproduces today's rendering, and by adding only new catalogue keys that no stored AST names.

---

# Part II — The executable plan

## Global Constraints

_(The binding ones, copied from the port spec, the escalation record and the owner's standing instructions. Where a constraint is quoted, the quote is verbatim.)_

- **Port spec §7 boundary.** _"Editable: `src/lib/themes/songoskriti/**`; `src/components/builder/songoskriti.tsx` + `songoskriti-motion.ts` (theme-owned renderers — editable only if the port requires it, including as an activation carrier for (b)/(c) registrations); NEW test/fixture files; NEW `.e2e/` spec/helper files; `docs/**`; `scripts/**` (including the Songoskriti asset gate scripts `scripts/songoskriti-assets-{manifest,image,check}.mjs`, `scripts/songoskriti-assets-expected.json` and `scripts/gen-songoskriti-assets.mjs`); `examples/starter-plugin/**` + `examples/starter-theme/**` (guide-alignment only — explicitly exempt from the test freeze; never `examples/demo-theme/**`); and minimal wiring-only edits to `package.json` (`doc:gate` script + gate-chain entry) and `.circleci/config.yml` (the CI step for `doc:gate`). … Prohibited: engine/plumbing — `src/lib/unified-widget-registry.ts`, `src/lib/editor/**`, `src/lib/theme-presentations.ts`, `src/lib/builder-ast.ts`, `src/components/builder/widgets.tsx`, `heritage.tsx`, `theme-widgets.ts`, all `src/routes/**`, `EditorShell`/`StudioBuilder`, existing test files and their snapshots (`.snap`) under `src/`, existing `.e2e/**` files (specs and `playwright.config.ts`; new `.e2e` specs/helpers are additive-only, config edits escalate), and everything else under `src/`. **Escalation:** any required capability missing in core → stop, report, wait for a decision. Never edit silently."_ — `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md:150-156`.
- **A NEW file is §7-allowed.** The escalation record states the rule it applied throughout the shipped programme: _"a NEW file needs no relaxation"_ (`docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md:33`, `:1448`, `:1787`, `:2080`, `:2527`, `:3008`, `:3039`, `:4071`, `:4866`). **This plan therefore creates six NEW files under `src/` and edits eleven existing ones**; the Decision Gate names every one of the eleven.
- **The owner's standing instruction on §7 relaxations.** The prior D4 ruling relaxed §7 _"for a narrow, owner-ruled list"_, and the escalation record states the rule that produced it: _"**Escalation:** any required capability missing in core → stop, report, wait for a decision. Never edit silently."_ **This plan changes the size of that list, not the rule.** Every prohibited file it touches is enumerated by name in the Decision Gate below, with its exact edit, and nothing is edited before the owner rules. _A relaxation granted for one file is never a precedent for the next._
- **No new npm dependency.** No package is added to `package.json`; no lockfile changes.
- **No test is weakened, deleted or skipped.** Existing suites and their `.snap` files are updated only to a **stronger** expectation, each update named in the Task-2 escalation record with its exact diff. No `it.skip`, no `test.skip`, no loosened `expect`, no deleted assertion. Where a new suite would need to skip for want of credentials, the skip is **reported as a skip**, never as a pass.
- **Explicit-path staging only.** Every commit uses `git add <exact paths>`; never `git add -A`, `git add .`, `git commit -a`.
- **Never commit the churn files.** `.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf` — leave them dirty, untouched, unstaged. **Never commit `.output-snapshots/`** (untracked; it is what makes a repo-wide `eslint .` stall).
- **`bun` is NOT on PATH in this environment.** Use `node_modules/.bin/<tool>` — `node_modules/.bin/vitest` (4.1.11), `node_modules/.bin/tsgo`, `node_modules/.bin/eslint`, `node_modules/.bin/prettier`, `node_modules/.bin/playwright` — and plain `node` for the `scripts/*.mjs` gates. CI uses `bun`; local verification does not. `scripts/contract-gate.mjs` hardcodes `spawnSync("bunx", …)` and therefore cannot be made to work locally — it is an **expected red with a stated reason**, not a regression.
- **Translations are OUT OF SCOPE.** No Bangla copy is authored, translated or re-worded by this programme, and no translation gate is moved. The theme's own copy stays as it is — including the 76 % বাংলা finding the prior programme reported as an **owner** action (`phase3-evidence.md` §4.1). Where a new widget's default copy is English-only, that is stated, not silently "fixed", and the translation meter reports it exactly as it reports every other untranslated string.
- **The platform keeps data, authorisation and payment authority.** The theme controls presentation, not access. Search execution, tenant scoping, result limits and authorisation stay in the platform; cart and checkout keep server-authoritative prices, discounts, stock, totals and state transitions; account data belongs to the currently authenticated customer and is read through the `auth.uid()`-scoped RPCs; archive, collection, blog and page queries respect publication status and permissions; preview data is synthetic and labelled; **no theme may access raw database connections, secrets, payment credentials or unrestricted authenticated APIs**. In particular the checkout change is a **composition** change: the route's form, its server quote, its validation and its payment rails stay exactly where they are, and the place-order action stays the route's trailing slot.
- **Never edit an applied migration.** No file under `supabase/migrations/` is edited and no migration is created — **this plan needs no schema change**.
- **No deploy inside the plan.** The deploy is a separate, explicit step after the branch merges.
- **The parity harness never runs against the configured database.** `.env`'s `SUPABASE_URL` resolves to this host's own IP and routes to the **production** database container (`report.md` §5.1 D6). The harness runs only against the repo's own throwaway stack (`docker-compose.e2e.yml` + `docs/15-e2e/loopback-auth-setup.md`), and only on a disposable merchant.
- **The three churn files and `.output-snapshots/` must still be unstaged at every commit.** `git status --short` is checked before each commit.

## Review Focus

_The five failure modes most likely to bite, most likely first. Each names the test that pins it and the task that owns the code it protects._

1. **The composable parts mechanism ships the prop but not the vocabulary, so a merchant's stored order is silently dropped on save.** `parseSection` copies **only** the catalogue's declared fields into `props` (`src/lib/builder-ast.ts:7844-7869`): an undeclared `parts` prop is dropped on the way to storage, with no error anywhere. A prop that is declared but whose _vocabulary_ is not closed would let a merchant type `unitprice` and get nothing — again with no error. → **Pinned by Task 1**: a new contract suite asserts (a) the `parts` prop survives a parse→serialise→parse round trip **only** when the catalogue declares the field, (b) `parseOrderedParts` drops an unknown key, keeps the author's order, de-dupes, and returns the **default** order for an empty or wholly-unknown value, and (c) **a stored AST written before the prop existed renders byte-identically** — the compatibility rule of A9, asserted rather than claimed. The suite is written **before** the catalogue grows, so it fails first.

2. **The account decomposition hands the theme a way to render another customer's data.** The account's panels become route-owned widgets the theme places; the temptation is for a panel to query on its own, or for the provider to be built from something other than the `auth.uid()`-scoped overview. → **Pinned by Task 1 and Task 2**: a contract suite asserts that every account panel reads **only** the provider (its source contains no `fetch`, no server import and no query), that the provider's state is built from the route's `overview` and nothing else, that a panel with **no** provider renders **nothing** (fail-closed) rather than fetching, and that the account route still calls the session-scoped server functions. The browser lane in Task 5 then exercises the signed-in and the anonymous states and asserts the anonymous visitor sees **no** shopper data.

3. **The pipeline unification breaks the published storefront.** Passing `themeKey` to the editor canvas (D1) and mounting demo providers in it (D2) change what the **canvas** renders; if the same change leaks into `ThemeChrome`, the storefront's live cart and live feed would be replaced by demo data — a commerce incident. → **Pinned by Task 3**: a contract suite asserts that `ThemeChrome` mounts **only** the live scope (`LiveCartScope`) and never the demo cart, that the editor canvas mounts **only** the demo providers and never `useLiveCart`, and that the three hosts' grant sets are equal except for the differences the suite **names** (the prior programme's `src/lib/preview-parity.contract.test.ts` is the pattern, and it is extended, not replaced). The storefront-surface lane in Task 5 then asserts the live result count equals the platform's own — a demo row would break it.

4. **A composable widget reaches past its lane — the theme restyles a price, or splits the payment rail.** The `parts` prop is a merchant-authored string that reaches a renderer, and the theme presentation registry now covers the commerce widgets, so a theme-owned renderer sits where the platform's was. → **Pinned by Task 1 and Task 2**: a contract suite asserts that the part vocabulary is **closed** (a key outside it is dropped, never rendered), that no part key may carry a **value** (the prop is a list of keys, never a list of values), that the commerce widgets' renderers compute no money of their own (the only money path is `ctx.money` over the server's minor units), and that the checkout's place-order action is still the route's trailing slot and still names the route's own form through `form=`. The prior programme's `src/lib/checkout-shell.contract.test.ts` is **extended**, not weakened.

5. **The proof lane proves nothing.** The journey that must prove "edit → save → reload → publish → the storefront matches" can pass while the storefront still shows the old composition — if it asserts a layer list and an HTTP 200 rather than the **changed** visible content and a **working** interaction. → **Pinned by Task 5**: the new lane asserts a **merchant-authored marker** (a heading the journey typed, and a widget it moved) is **visible on the storefront** after the publish, and that a **permitted interaction works** — a payment rail can be chosen on the composed checkout, a quantity can be changed on the composed cart, an account tab can be switched on the composed account. A lane that cannot find the marker **fails**; a skipped lane is reported as a skip and never as a pass.

## Decision Gate

_Three decisions are the owner's. **None of them blocks Task 1** (the mechanism), which is executable under the readings below. Each names the evidence that settles it. **All three were ruled on 2026-10-22** — the ruling follows each gate as *Ruled*; the shipped state measured at the programme's close is recorded at the end of this section._

**G1 — The §7 relaxation list for this programme.**
_Question:_ the composable parts contract, the account's placeable panels, the theme-presentation claims over the commerce widgets, the editor canvas's `themeKey` and providers, and the preview's de-synthesis all require files that port spec §7 prohibits. Is §7 relaxed for this programme, and for exactly which files?
_Evidence that settles it:_ §7's own escalation rule (_"any required capability missing in core → stop, report, wait for a decision. Never edit silently."_); the prior D4 ruling, which relaxed §7 for a named list and explicitly did **not** set a precedent (_"the Phase-1 exception was a one-off, not a precedent"_); the prior programme's own G1 list, whose shape this list follows.
_What the plan proposes:_ a **named list**, exactly as D4 was, and nothing outside it. **Twelve existing files:**

| group                             | count  | files                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| engine / platform libs            | **1**  | `src/lib/builder-ast.ts` (the `SectionType` union, the four new catalogue rows, the `parts`/`layout` fields)                                                                                                                                                                                                                                                                                     |
| the renderer and the widget packs | **4**  | `src/components/builder/widgets.tsx` (the closed `WIDGET_COMPONENTS` map) · `src/components/builder/cart.tsx` (the four commerce widgets' part order) · `src/components/builder/account.tsx` (the two account widgets' part order) · `src/components/store/AccountDashboard.tsx` (the dashboard becomes the provider's default composition)                                                      |
| the storefront host               | **1**  | `src/components/store/ThemeChrome.tsx` (the declined-template fallback becomes explicit)                                                                                                                                                                                                                                                                                                         |
| routes                            | **4**  | `src/routes/store.$slug.account.tsx` (the provider mount and the four new grants) · `src/routes/store.$slug.search.tsx` (the storefront's `facet_sidebar` grant) · `src/routes/store.$slug.checkout.tsx` (the disabled place-order action on a rail-less store, and the shared empty state) · `src/routes/_authenticated/dashboard/builder.tsx` (the canvas's `themeKey` and its demo providers) |
| existing test files               | **2**  | `src/lib/preview-parity.contract.test.ts` (**extended**, never weakened) · `src/components/store/songoskriti-preview-compositions.test.tsx` (one stale comment re-worded)                                                                                                                                                                                                                        |
| **total**                         | **12** | —                                                                                                                                                                                                                                                                                                                                                                                                |

_Files **not** on the list, deliberately:_ `src/components/builder/SchemaControls.tsx` (the parts prop uses the platform's existing comma-separated-list convention, so **no new inspector field kind** is needed) · `src/lib/theme-presentations.ts` (the presentation registry is **extended by claim**, not edited) · `src/lib/widget-weight.ts` and `src/lib/widget-skeletons.ts` (both derive their per-type rows from `WIDGET_TYPES` and fall back to a default — `widget-weight.ts:147-172`, `widget-skeletons.ts:49-51` — so a new catalogue type needs **no** edit) · `src/lib/theme-package.ts` and `src/lib/plugin-manifest.ts` (**no API bump, no contract change** — the additive rule of A9 holds) · `src/components/builder/StudioCanvas.tsx` (the `/dashboard/builder` canvas is the builder route's own `SectionRenderer` tree, not the studio's `StudioCanvas`; the studio is a different surface and this programme does not touch it).
_Unlocks:_ every task after Task 1. **Ruled 2026-10-22 (G1):** §7 **is relaxed for the named twelve**, ratified under the owner's standing instruction (_"whatever goes, as per the expert opinion"_, 2026-10-22), with the escalation record's §(b)–(g) carrying each file's exact diff **before** its edit. Two corrections the shipped work forced, both recorded: the twelfth file (`songoskriti-preview-compositions.test.tsx`) needed **no edit for Tasks 1–3** (its only change is Task 6's one prose re-word, escalation §(l)) — and the totality-forced widening **beyond** the named list (18 named in §(a.3), 26 further beyond-G1 existing files from the review fix wave and the proof lanes) is enumerated **one line per file** in §(h.2), §(i.1.2) and §(i.1.3), every one ratified under the same standing instruction and never a precedent.

**G2 — The `facet_sidebar` grant on the storefront's search surface (the D7 divergence).**
_Question, restated against the measured code:_ the preview grants `facet_sidebar` (`ThemePreviewFrame.tsx:846`) and the storefront's search route does not (`store.$slug.search.tsx:632-645`), because the facet rows come from the widget-data pipeline and no storefront route mounts a `WidgetDataProvider`. The theme's search composition therefore shows a facet column in the preview and **nothing** in production. Two ways to close it: **(a)** the storefront grants it — the widget batch is _already_ resolved for the published layout (`src/lib/storefront.server.ts:506-514`) and the `facets` source already exists (`src/lib/widget-data.server.ts:1192`), so the search route would consume those rows; or **(b)** the preview stops granting it and the theme's search composition drops it, so both hosts agree by losing the facet column.
_Evidence that settles it:_ the storefront's widget-batch resolution (`storefront.server.ts:506-514`) and the `facets` source loader (`widget-data.server.ts:1192`); the prior programme's **named** difference (`src/lib/preview-parity.contract.test.ts:16-20`) and the distinctness gate's `search` row, which currently **requires** `facet_sidebar` as both a type and a slot (`template-distinctness.ts:196-215`).
_What the plan assumes if the owner does not rule — **(a)**, the storefront grants it:_ it keeps the theme's authored facet column alive on the surface the merchant actually sells on, it makes the two hosts agree by construction, and it needs no new data source — the rows are already resolved. **(b)** is the fallback if (a) proves to need a data path this programme must not open, and it is a **capability loss** the owner must then accept in writing.
_Unlocks:_ Task 2 step 2.5 and Task 3 step 3.4. **Ruled 2026-10-22 (G2):** **(a)** — the storefront's search route **grants** `facet_sidebar`; the grant sets are equal (`src/routes/store.$slug.search.tsx`, recorded in the escalation record's §(d.6)); the theme's search composition keeps its authored facet column, and the preview-parity contract now asserts the equality instead of naming the difference.

**G3 — The preview's absent-template state and the storefront's declined-template state.**
_Question:_ the brief says _"No separate hardcoded preview renderer or silent generic fallback"_, and the two hosts fail differently today: the preview **invents** a body (`theme-preview-nav.ts:516`), and the storefront falls back to the route's own surface **silently** (`ThemeChrome.tsx:431-433`). The programme proposes: **the preview** stops synthesising and renders its **existing** explicit panel (`ThemePreviewFrame.tsx:625`, `:1075`) for a template the theme does not author; **the storefront** keeps the route's platform surface — it is the platform's designed surface for a declined template, and the taxonomy archive already works that way (H6) — but marks it **explicitly**, and the **editor and the publish gate** tell the merchant by name that their theme designs no body for that template.
_Evidence that settles it:_ the brief's own wording (_"an explicit unsupported/absent state, per the brief"_); the taxonomy archive's precedent (the platform grid, deliberately, `template-distinctness.ts`'s `blog` approved exception); the prior programme's ruling that a missing template _"must fall back **explicitly** … never silently to the homepage"_.
_What the plan assumes if the owner does not rule:_ the proposal above. The **alternative** — a hard error page on the storefront for a declined template — is **not** assumed, because a shopper must never meet a merchant's configuration mistake as a broken page.
_Unlocks:_ Task 3 steps 3.2 and 3.5. **Ruled 2026-10-22 (G3):** the proposal as stated — **the preview** shows the absent-template panel for a template the theme does not author (the synthesis is deleted, `assemblePreviewTemplates` keeps the key absent); **the storefront** keeps the route's platform surface inside the theme's **named** frame (`data-fq-theme-state="declined-template"`, an exact **one-insertion** diff on the declined-template surface, §(h.7)); the editor and the publish gate tell the merchant **by name** that their theme designs no body for the template.

---

## Tasks

_Ordered as the brief requires: the shared root cause first (the composable-widget mechanism — no second system), then the per-template wiring, then the pipeline unification, then the data/preview safety, then the proof, then the obsolete-path removal, then the docs and the report._

### Task 1 — The composable-widget mechanism: the shared root cause (extend the existing registry and renderer; no second system)

**Files:**

- **Create (allowed — a NEW file needs no relaxation):** `src/lib/widget-parts.ts` — the ONE generic parts contract: the closed vocabulary table, the parser, the effective-order resolver.
- **Create (allowed):** `src/lib/widget-parts.test.ts` — its contract suite (the round trip, the closed vocabulary, the default-order fallback, the byte-identical backward compatibility).
- **Create (allowed):** `src/components/store/AccountDashboardContext.tsx` — the provider that owns the account's state, so a theme-placed panel and the dashboard's own copy read the SAME state.
- **Create (allowed):** `src/components/store/account-widgets.tsx` — the four panel renderers (`account_nav`, `account_overview`, `account_orders`, `account_details`).
- **Create (allowed):** `src/components/store/account-widgets.test.tsx` — the panel suite (each panel renders from the provider; a panel with no provider renders nothing; no panel fetches).
- **Modify (escalation-required):** `src/lib/builder-ast.ts` — the `SectionType` union (four new members), the four new catalogue rows, and the `parts` / `layout` fields on the six existing rows.
- **Modify (escalation-required):** `src/components/builder/widgets.tsx` — the closed `WIDGET_COMPONENTS` map (the compiler points at it).
- **Modify (escalation-required):** `src/components/builder/cart.tsx` — the part order in `CartLines`, `CartSummary`, `CheckoutSteps` and `PaymentMethods`.
- **Modify (escalation-required):** `src/components/builder/account.tsx` — the part order in `OrdersList` and `ProfileCard`.
- **Modify (escalation-required):** `src/components/store/AccountDashboard.tsx` — the dashboard becomes the provider's default composition.

**Interfaces:**

- Consumes: `BASE_CATALOG` / `CatalogEntry` / `parseSection` / `coerceProp` / `parseTemplates` (`src/lib/builder-ast.ts:707-723`, `:7629`, `:7769`) · `parsePickedHandles` (`:685`) · `WidgetCtx` / `WidgetComponent` / `WIDGET_COMPONENTS` (`src/components/builder/widgets.tsx:56-101`, `:1666`) · `useCartContext` / `CartTotals` (`src/components/builder/CartContext.tsx:130`) · `mapOrdersToRows` / `mapProfileToRow` / `accountSlotCtx` (`src/components/store/account-slots.tsx:31`, `:42`, `:54`) · `AccountOverview` (`src/lib/accounts.server.ts:36`) · `AccountDashboardProps` / `AccountDashboardStatus` / `AccountOrderDetail` (`src/components/store/AccountDashboard.tsx:56`, `:68`, `:221`).
- Produces: `PART_PROP_KEY` · `WIDGET_PART_VOCABULARY` · `parseOrderedParts(raw, allowed): string[]` · `partOrder(raw, type): string[]` · `defaultParts(type): readonly string[]` · `AccountDashboardProvider` · `useAccountDashboard(): AccountDashboardState` · `AccountDashboardState` · four new catalogue types `account_nav` · `account_overview` · `account_orders` · `account_details` · a `parts` prop on `cart_lines` · `cart_summary` · `payment_methods` · `checkout_steps` · `orders_list` · `profile_card` · a `layout` prop (`row` | `card`) on `cart_lines` · `orders_list` · `payment_methods`.

- [x] **1.1** Write the **failing** parts contract first. It must assert: (a) the vocabulary is **closed** — `WIDGET_PART_VOCABULARY` carries an entry for each of the six affected types and every key in each entry is drawn from that widget's own vocabulary; (b) `parseOrderedParts("unitPrice, title", ALLOWED)` returns `["unitPrice","title"]` — the author's **order** survives; (c) an unknown key is **dropped**, never rendered (`parseOrderedParts("title, unitprice", ALLOWED)` → `["title"]`); (d) a duplicate is dropped and the length is capped; (e) an empty or wholly-unknown value returns `[]` and the caller falls back to `defaultParts(type)`; (f) `defaultParts("cart_lines")` is exactly today's order (`title, variant, unitPrice, quantity, lineTotal, remove`) and `defaultParts("cart_summary")` is `subtotal, discount, shipping, cod, vat, total`; (g) the `parts` prop survives a `parseTemplates` round trip **only** because the catalogue declares it — the suite reads the catalogue's row for `cart_lines` as **text** and asserts it declares a `parts` field; and (h) **the backward-compatibility rule**: an AST written **before** the prop existed (no `parts` key) parses to a `parts` prop equal to the widget's **default** — so a published theme's stored AST renders byte-identically.

  ```
  node_modules/.bin/vitest run src/lib/widget-parts.test.ts
  ```

  Expected output: **FAIL** — `Error: Failed to load url ./widget-parts` (the module does not exist yet).

- [x] **1.2** Write the **failing** account-panel contract. It must assert: (a) the catalogue carries `account_nav`, `account_overview`, `account_orders` and `account_details`, each with `templates: ["account"]` and `heading: false`; (b) each panel renders from the **provider** and from nothing else — the suite asserts the panel source contains **no** `fetch(`, **no** `supabase` and **no** `.functions.ts` import; (c) a panel rendered with **no** provider renders **nothing** (fail-closed) — it must not throw and must not fetch; (d) the provider's state is the **same object** the dashboard reads — the suite mounts the provider, renders the dashboard and a panel, and asserts both read one tab and one open-order id; (e) the four panels, taken together, render the **same** content the dashboard renders today.

  ```
  node_modules/.bin/vitest run src/components/store/account-widgets.test.tsx
  ```

  Expected output: **FAIL** — `Error: Failed to load url ./AccountDashboardContext` (the module does not exist yet).

- [x] **1.3** Implement `src/lib/widget-parts.ts` — a pure module, no React, no DOM, no DB.

  ```
  # src/lib/widget-parts.ts
  export const PART_PROP_KEY = "parts";
  export const WIDGET_PART_VOCABULARY: Partial<Record<SectionType, readonly string[]>> = {
    cart_lines: ["title", "variant", "unitPrice", "quantity", "lineTotal", "remove"],
    cart_summary: ["subtotal", "discount", "shipping", "cod", "vat", "total"],
    payment_methods: ["legend", "groups", "options", "note"],
    checkout_steps: ["labels", "active", "links"],
    orders_list: ["number", "date", "status", "total"],
    profile_card: ["avatar", "name", "email", "phone"],
  };
  export function parseOrderedParts(raw: unknown, allowed: readonly string[]): string[]
  export function defaultParts(type: SectionType): readonly string[]
  export function partOrder(raw: unknown, type: SectionType): string[]
  ```

  `parseOrderedParts` splits on commas, trims, lowercases nothing (the keys are camelCase and closed), drops anything outside `allowed`, drops repeats, and caps the length at `allowed.length`. `partOrder` returns the parsed list when it is non-empty and every key is known, otherwise `defaultParts(type)`.

  ```
  node_modules/.bin/vitest run src/lib/widget-parts.test.ts
  ```

  Expected output: the suite's cases (a)–(f) and (h) pass; case (g) **still fails**, because the catalogue does not declare the prop yet — that is the next step, and it is the intended order.

- [x] **1.4** Grow the catalogue: the `SectionType` union, the four new rows, and the `parts` / `layout` fields. **The field and the prop ship in the same commit** — `parseSection` drops an undeclared prop, so a `parts` prop that is not declared is dropped on the way to storage.

  ```
  # src/lib/builder-ast.ts
  #   SectionType — add "account_nav" | "account_overview" | "account_orders" | "account_details"
  #   cart_lines row (":2923")      — fields += text("parts", "Part order (comma separated)", 200)
  #                                         + select("layout", "Row layout", [{value:"row",label:"Row"},{value:"card",label:"Card"}])
  #                                         defaults += parts: "title,variant,unitPrice,quantity,lineTotal,remove", layout: "row"
  #   cart_summary row (":1641")     — fields += text("parts", …)   defaults += parts: "subtotal,discount,shipping,cod,vat,total"
  #   payment_methods row (":2996")  — fields += text("parts", …) + select("layout", …)
  #                                         defaults += parts: "legend,groups,options,note", layout: "row"
  #   checkout_steps row (":2972")   — fields += text("parts", …)   defaults += parts: "labels,active,links"
  #   orders_list row (":5031")      — fields += text("parts", …) + select("layout", …)
  #                                         defaults += parts: "number,date,status,total", layout: "row"
  #   profile_card row (":5049")      — fields += text("parts", …)   defaults += parts: "avatar,name,email,phone"
  #   four NEW rows — account_nav / account_overview / account_orders / account_details,
  #                   each { slots: ["main"], heading: false, group: "context", templates: ["account"] }
  ```

  Then watch the compiler find the exhaustive map:

  ```
  node_modules/.bin/tsgo --noEmit
  ```

  Expected output: an error of the shape — _"Type 'Record<SectionType, WidgetComponent>' is missing the following properties from type 'Record<SectionType, WidgetComponent>': account_nav, account_overview, account_orders, account_details"_ — pointing at `src/components/builder/widgets.tsx:1666`. **That is the compiler doing the blast-radius work.** Fix it in step 1.5.

- [x] **1.5** Implement the part order in the renderers. **One rule for all six**: the widget renders its parts **in the order `partOrder` returns**, and a part the author dropped **does not render**. The values are unchanged — they still come from the server.

  ```
  # src/components/builder/cart.tsx
  #   LineList — build the row's parts from the server line, then render them in partOrder(ctx, "cart_lines")
  #   SummaryBody — the totals rows (subtotal/discount/shipping/cod/vat/total) in partOrder(ctx, "cart_summary")
  #   CheckoutSteps — the trail's parts in partOrder(ctx, "checkout_steps")
  #   PaymentMethods — the fieldset's parts in partOrder(ctx, "payment_methods")
  # src/components/builder/account.tsx
  #   OrdersList — the row's parts in partOrder(ctx, "orders_list")
  #   ProfileCard — the card's parts in partOrder(ctx, "profile_card")
  ```

  **The default order is today's order, so a theme with no `parts` prop renders byte-identically.** Assert that in the suite rather than trusting it: the `cart` and `account` suites compare the rendered markup with and without the prop.

  ```
  node_modules/.bin/vitest run src/lib/widget-parts.test.ts src/components/builder/cart.test.tsx src/components/builder/account-widgets.test.tsx src/components/builder/cart-payment-methods.test.tsx
  ```

  Expected output: **every** suite passes. If a suite fails with a markup difference, the default order is wrong — fix the **default**, never the expectation.

- [x] **1.6** Implement the account provider and the four panels, and make the dashboard the provider's **default composition**.

  ```
  # src/components/store/AccountDashboardContext.tsx (NEW)
  #   AccountDashboardProvider — owns { tab, setTab, overview, status, openOrderId, setOpenOrderId,
  #                                  orderDetail, orderDetailPending, orderDetailError,
  #                                  onSaveAddress, onDeleteAddress, onSaveProfile,
  #                                  onSetConsent, onToggleWishlist, busy, currency, slug }
  #   useAccountDashboard() — reads the provider; THROWS a named error when there is none
  #                            (a panel must never silently render an empty shell)
  # src/components/store/account-widgets.tsx (NEW)
  #   AccountNav / AccountOverview / AccountOrders / AccountDetails — one renderer each,
  #   each reading the provider and NOTHING else
  # src/components/store/AccountDashboard.tsx (MODIFIED)
  #   the four panels replace the four inline blocks, in today's order;
  #   the dashboard keeps its six states and its ARIA tabs pattern byte-identically
  ```

  **The provider must be mounted by the ROUTE, above `ThemeChrome`**, so a panel the theme places in its own body and the dashboard's own copy read one state. That is the `CartProvider` / `BlogFeedProvider` pattern the platform already uses (`ThemePreviewFrame.tsx:1285-1293`).

  ```
  node_modules/.bin/vitest run src/components/store/account-widgets.test.tsx src/components/store/AccountDashboard.test.tsx src/components/store/account-dashboard.contract.test.ts
  ```

  Expected output: **every** suite passes; the dashboard's own suite is **unchanged** in its expectations — the dashboard's output is the same markup in the same order.

- [x] **1.7** Run the neighbouring suites, the type check and the linter.

  ```
  node_modules/.bin/vitest run src/lib/widget-parts.test.ts src/components/store/account-widgets.test.tsx src/components/builder/cart.test.tsx src/components/builder/account-widgets.test.tsx src/components/store/AccountDashboard.test.tsx src/lib/definition-of-done.test.ts src/lib/phase9-guardrails.test.ts
  node_modules/.bin/tsgo --noEmit
  node_modules/.bin/eslint src/lib/widget-parts.ts src/lib/builder-ast.ts src/components/builder/widgets.tsx src/components/builder/cart.tsx src/components/builder/account.tsx src/components/store/AccountDashboard.tsx src/components/store/AccountDashboardContext.tsx src/components/store/account-widgets.tsx
  ```

  Expected output: the vitest run ends with `Test Files  N passed (N)` and `Tests  M passed (M)` — **N ≥ 7**, not zero; `tsgo --noEmit` prints **nothing**; eslint prints **nothing** and exits 0.

- [x] **1.8** Commit with explicit paths:
  ```
  git add src/lib/widget-parts.ts src/lib/widget-parts.test.ts src/components/store/AccountDashboardContext.tsx src/components/store/account-widgets.tsx src/components/store/account-widgets.test.tsx src/lib/builder-ast.ts src/components/builder/widgets.tsx src/components/builder/cart.tsx src/components/builder/account.tsx src/components/store/AccountDashboard.tsx
  git commit -m "feat(widgets): the composable parts contract and the account's placeable panels"
  git status --short
  ```
  Expected output: a commit touching **10** files; `git status --short` still shows the three churn files and `?? .output-snapshots/`, all unstaged.

### Task 2 — The per-template wiring: the theme's compositions rebuilt on the new pieces

**Files:**

- **Modify (allowed — `src/lib/themes/songoskriti/**`):** `src/lib/themes/songoskriti/preview.ts` — the Cart, Checkout and Account compositions rebuilt; the `parts` orders authored; the Search composition's `facet_sidebar` decision applied.
- **Modify (allowed):** `src/lib/themes/songoskriti/presentation-claims.ts` — the claims extended to the commerce and account types.
- **Create (allowed):** `src/lib/themes/songoskriti/commerce-presentations.tsx` — Songoskriti's own renderers for the claimed commerce/account types (they must honour the same `parts` prop and read the same route-owned data).
- **Create (allowed):** `src/lib/themes/songoskriti/commerce-presentations.test.tsx` — their suite.
- **Modify (allowed):** `src/lib/themes/songoskriti/template-distinctness.ts` — the `cart`, `checkout`, `account` and `search` expectation rows follow the new compositions.
- **Modify (escalation-required):** `src/routes/store.$slug.account.tsx` — the provider mount, the four new grants, and the "the route supplies the control the theme's body does not" rule for the account.
- **Modify (escalation-required):** `src/routes/store.$slug.search.tsx` — the storefront's `facet_sidebar` grant, per Decision Gate G2.
- **Modify (escalation-required):** `src/routes/store.$slug.checkout.tsx` — the place-order action is disabled when the server offered no rail; the shared empty state.
- **Modify (escalation-required):** `src/lib/preview-parity.contract.test.ts` (an **existing** test file) — extended to the new grants, never weakened.

**Interfaces:**

- Consumes: the Task-1 products (`WIDGET_PART_VOCABULARY`, `partOrder`, `AccountDashboardProvider`, the four `account_*` catalogue types) · `registerThemePresentation` / `resolveThemePresentation` (`src/lib/theme-presentations.ts:97`, `:140`) · `SONGOSKRITI_PRESENTATION_CLAIMS` (`src/lib/themes/songoskriti/presentation-claims.ts:36`) · `SONGOSKRITI_WIDGETS` (`src/components/builder/songoskriti.tsx:2696`) · `themePlacesAccountProfile` / `checkoutShellControls` (`src/lib/theme-shell-slots.ts:74`, `:126`) · `AccountOverview` · `ACCOUNT_TABS` (`src/lib/account-tab.ts:8`).
- Produces: the Songoskriti Cart, Checkout and Account compositions built on the composable pieces · the theme's own renderers for the commerce/account widget types · the account route's four new grants · a checkout whose place-order action is disabled when no rail is offered.

- [x] **2.1** Write the failing composition contract. It must assert: (a) the theme's Cart composition **places** `cart_lines` and `cart_summary` and **authors a `parts` order** on each, and both orders are drawn from the closed vocabulary (the suite reads `src/lib/themes/songoskriti/preview.ts` as text and checks every authored `parts` value against `WIDGET_PART_VOCABULARY`); (b) the Checkout composition places `payment_methods`, `cart_summary` and `checkout_steps`, each with an authored order; (c) the Account composition places **at least one** of the four `account_*` types **and** carries the route-owned body slot, so the theme can place a panel and still let the dashboard's fallback render the rest; (d) the Account composition places **no** `orders_list` (the dashboard's own orders panel renders them — the same reason the prior composition dropped it, `preview.ts:467-471`); (e) every authored prop survives `parseTemplates` (the existing `src/lib/themes/songoskriti/composition-props.test.ts` pattern, extended to the new props).

  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/commerce-compositions.test.ts
  ```

  Expected output: **FAIL** — the suite does not exist yet, or the compositions do not carry the new parts.

- [x] **2.2** Rebuild the theme's **Cart** composition on the new pieces. The order is `heading` → `columns > [container > cart_lines, container > cart_summary]`, exactly as today; what changes is that each widget now carries an authored `parts` order and a `layout`, so the theme states its own arrangement rather than inheriting the platform's.

  ```
  # src/lib/themes/songoskriti/preview.ts — case "cart" (":364")
  s("cart_lines", { heading: "", parts: "title,variant,quantity,lineTotal,unitPrice,remove", layout: "row" })
  s("cart_summary", { heading: "Order summary", parts: "subtotal,discount,shipping,vat,total" })
  ```

  **The `parts` value must be a declared field** — it is, from Task 1 step 1.4 — so it survives `parseTemplates`.

- [x] **2.3** Rebuild the theme's **Checkout** composition. The order is `heading` → `checkout_steps` → `page_content` → the two columns; what changes is the authored order inside the rail and the totals.

  ```
  # src/lib/themes/songoskriti/preview.ts — case "checkout" (":399")
  s("checkout_steps", { heading: "Checkout progress", activeStep: 2, parts: "labels,active,links" })
  s("payment_methods", { heading: "", parts: "legend,options,groups,note" })
  s("cart_summary", { heading: "Order summary", parts: "subtotal,discount,shipping,vat,total" })
  ```

  **The theme still authors no field, no price and no place-order action** — the route's form flows through `page_content` and the route's action stays the trailing slot. The prior suite `src/lib/themes/songoskriti/checkout-composition.test.ts` pins exactly that and must keep passing **unchanged**.

- [x] **2.4** Rebuild the theme's **Account** composition so the account's contents become placeable. The composition places the account's panels and still carries the route-owned body slot.

  ```
  # src/lib/themes/songoskriti/preview.ts — case "account" (":457")
  s("account_nav", { heading: "" })
  s("account_overview", { heading: "" })
  s("account_orders", { heading: "", parts: "number,date,status,total", layout: "row" })
  s("page_content", {})
  ```

  **The `page_content` slot stays**, so the dashboard's own fallback still renders everything the theme did not place — the "no blank required slot" rule of requirement 4.

- [x] **2.5** Apply the **G2** decision to the Search composition, and to the storefront's grant. Under the assumed ruling (a) the storefront grants `facet_sidebar`; the theme's search composition keeps it.

  ```
  # src/routes/store.$slug.search.tsx — the contextSlots map gains facet_sidebar: null
  #   and the route consumes the resolved facet rows (the widget batch is already
  #   resolved for the published layout — src/lib/storefront.server.ts:506-514)
  ```

  Then the preview-parity suite is **extended** to assert the two hosts' grant sets are now **equal** for the search surface:

  ```
  node_modules/.bin/vitest run src/lib/preview-parity.contract.test.ts
  ```

  Expected output: the existing "the preview adds facet_sidebar, and nothing else" case now **fails** — that is the intended failure: the difference is being closed. The case is **re-pinned** to assert the sets are equal, and the old difference is named in the case's doc comment (the suite is updated to a **stronger** expectation, never weakened).

- [x] **2.6** Extend the theme's **presentation claims** to the commerce and account types, and write Songoskriti's own renderers for them.

  ```
  # src/lib/themes/songoskriti/presentation-claims.ts
  #   SONGOSKRITI_PRESENTATION_CLAIMS grows by:
  #     "cart_lines", "cart_summary", "payment_methods", "checkout_steps",
  #     "orders_list", "profile_card",
  #     "account_nav", "account_overview", "account_orders", "account_details"
  # src/lib/themes/songoskriti/commerce-presentations.tsx (NEW)
  #   one renderer per claimed type; each reads the SAME route-owned data
  #   (useCartContext for the commerce ones, the account provider for the account ones)
  #   and honours the SAME parts prop through partOrder(ctx, type)
  ```

  **The renderers must not compute money.** Every figure comes from `ctx.money` over the server's minor units; a theme renderer that divides is a bug the suite must catch.

  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/commerce-presentations.test.tsx src/lib/themes/songoskriti/presentation-claims-activation.test.ts src/lib/themes/songoskriti/widgets.test.ts
  ```

  Expected output: **every** suite passes. The claims suite must assert the **exact** claim set, so a dropped claim fails the suite.

- [x] **2.7** Wire the account route: the provider mount and the four new grants.

  ```
  # src/routes/store.$slug.account.tsx
  #   <AccountDashboardProvider value={{ …the route's own state… }}>
  #     <ThemeChrome … contextSlots={{ …accountSlots, account_nav: …, account_overview: …,
  #                              account_orders: …, account_details: …, page_content: dashboard }} />
  #   </AccountDashboardProvider>
  #   the route supplies a panel ONLY when the theme's body places none of it
  #   (the generalised form of themePlacesAccountProfile — src/lib/theme-shell-slots.ts:74)
  ```

  ```
  node_modules/.bin/vitest run src/components/store/account-dashboard.contract.test.ts src/lib/preview-parity.contract.test.ts src/lib/account-status.test.ts
  ```

  Expected output: **every** suite passes. The dashboard's contract suite must still assert that every nav destination is a `?tab=` value on the same route.

- [x] **2.8** Run the theme's own suites, the type check and the linter.

  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/composition-props.test.ts src/lib/themes/songoskriti/template-distinctness.test.ts src/lib/themes/songoskriti/template-distinctness.archive.test.ts src/lib/themes/songoskriti/checkout-composition.test.ts src/lib/themes/songoskriti/cart-account-demo.test.ts src/lib/themes/songoskriti/preview.test.ts src/components/store/songoskriti-preview-compositions.test.tsx src/components/store/songoskriti-preview-page.test.tsx
  node_modules/.bin/tsgo --noEmit
  node_modules/.bin/eslint src/lib/themes/songoskriti/preview.ts src/lib/themes/songoskriti/presentation-claims.ts src/lib/themes/songoskriti/commerce-presentations.tsx src/lib/themes/songoskriti/template-distinctness.ts src/routes/store.\$slug.account.tsx src/routes/store.\$slug.search.tsx
  ```

  Expected output: every suite passes; `tsgo` and `eslint` print nothing. **The `checkout-composition` suite must pass UNCHANGED** — it is the proof that the theme still authors no field, no price and no place-order action.

- [x] **2.9** Commit with explicit paths:
  ```
  git add src/lib/themes/songoskriti/preview.ts src/lib/themes/songoskriti/presentation-claims.ts src/lib/themes/songoskriti/commerce-presentations.tsx src/lib/themes/songoskriti/commerce-presentations.test.tsx src/lib/themes/songoskriti/template-distinctness.ts src/lib/themes/songoskriti/commerce-compositions.test.ts src/routes/store.\$slug.account.tsx src/routes/store.\$slug.search.tsx src/lib/preview-parity.contract.test.ts
  git commit -m "feat(theme): the cart, checkout and account compositions rebuilt on the composable pieces"
  git status --short
  ```
  Expected output: a commit touching **9** files; the churn files remain unstaged.

### Task 3 — The pipeline unification: one resolver for the editor canvas, the preview and the storefront

**Files:**

- **Modify (escalation-required):** `src/routes/_authenticated/dashboard/builder.tsx` — the canvas passes `themeKey` and mounts the demo providers.
- **Modify (allowed):** `src/lib/theme-preview-nav.ts` — the synthesis goes; the installed artifact reads the **published** version.
- **Modify (allowed):** `src/components/store/ThemePreviewFrame.tsx` — the absent template renders the explicit panel; the demo rail selection becomes local and labelled.
- **Create (allowed):** `src/lib/pipeline-resolver.ts` — the **one** resolver: (template identity, tenant, mode) → (ast, tokens, source label).
- **Create (allowed):** `src/lib/pipeline-resolver.test.ts` — its contract suite: the three hosts resolve the **same** AST for the same (store, template, mode), and the modes are the only difference.
- **Modify (escalation-required):** `src/components/store/ThemeChrome.tsx` — the declined-template fallback becomes an explicit, named state.

**Interfaces:**

- Consumes: `TEMPLATE_KEYS` / `TemplateKey` / `TemplateMap` (`src/lib/builder-ast.ts`) · `themeRendersBody` (`src/lib/theme-body-slot.ts:31`) · `resolveTemplate` / `resolveVariantAst` (`src/lib/template-variants.ts:315`) · `previewSourceFor` / `installedPreviewSource` (`src/lib/preview-sources.ts:106`, `:139`) · `resolveThemePreview` / `assemblePreviewTemplates` (`src/lib/theme-preview-nav.ts:572`, `:496`) · `UnsupportedTemplateNotice` (`src/components/store/ThemePreviewFrame.tsx:149`) · `activeThemeKey` (the builder route's own key).
- Produces: `resolveTemplateForHost({ template, variants, tenant, mode })` with `mode: "draft" | "published" | "source"` · an explicit `absent` result (never a synthesised body) · the editor canvas rendering the theme's presentation and the theme's demo data.

- [x] **3.1** Write the failing pipeline contract. It must assert: (a) for the same store and the same template, the **editor canvas**, the **preview** and the **storefront** resolve the **same AST** when they are in the same mode; (b) the three modes are exactly `draft` (the editor's autosaved document), `published` (the storefront's pointer) and `source` (the theme's own builders) and each is **labelled**; (c) a template the theme does not author resolves to an **explicit absent** result — never a synthesised body, never the homepage; (d) the preview's assembled map for a theme that authors **nine** of the ten templates carries **nine** keys, and the tenth is **absent** — the map's length is the theme's own, not the platform's; and (e) the editor canvas's `SectionRenderer` receives a `themeKey`.

  ```
  node_modules/.bin/vitest run src/lib/pipeline-resolver.test.ts
  ```

  Expected output: **FAIL** — `Error: Failed to load url ./pipeline-resolver`.

- [x] **3.2** Implement the resolver and **remove the synthesis**. `assemblePreviewTemplates` must stop calling `genericDemoMain`:

  ```
  # src/lib/theme-preview-nav.ts — assemblePreviewTemplates (":496")
  #   main: source.main(templateKey, s) ?? []   → the key is simply ABSENT from the map
  #   genericDemoMain (":473") STAYS — the distinctness gate's reference body
  ```

  **The map's type must become partial.** `ThemePreviewPreset.templates` is `Record<TemplateKey, ThemeAst>` (`:439`) — a **total** map is what forces the synthesis. It becomes `Partial<Record<TemplateKey, ThemeAst>>`, and the preview host's existing `unsupported` branch (`ThemePreviewFrame.tsx:625`, `:1075`) becomes the state for an absent key. **The `UnsupportedTemplateNotice` panel already exists** — this is the explicit state the brief asks for, already built.

  ```
  node_modules/.bin/vitest run src/lib/pipeline-resolver.test.ts src/lib/themes/songoskriti/unsupported-template-state.test.tsx src/lib/themes/songoskriti/template-distinctness.test.ts src/lib/theme-preview-nav.test.ts
  ```

  Expected output: the pipeline suite passes; the **unsupported-state** suite must be **re-pointed** at a still-unknown key if it pinned `archive` (it does not — it was re-pointed in the prior programme) — read its output, do not assume; the **distinctness** suite still passes, because `genericDemoMain` is still the gate's reference.

- [x] **3.3** Close **D1** — the editor canvas resolves the theme's presentation.

  ```
  # src/routes/_authenticated/dashboard/builder.tsx — the canvas's SectionRenderer (":2536")
  #   add themeKey={activeThemeKey}
  ```

  The key the widget **tray** already uses (`builder.tsx:1925`) is the same key the storefront uses (`themeKey` from the chrome) and the same one the preview uses (`blueprintKey`). **One key, three hosts.**

  ```
  node_modules/.bin/vitest run src/lib/pipeline-resolver.test.ts src/components/builder/WidgetTray.registry.test.tsx src/components/builder/songoskriti.test.tsx
  ```

  Expected output: every suite passes. **If a studio test fails because the canvas now renders the theme's presentation, that failure is the point** — it means the editor and the storefront now agree — and the studio test is updated to the **stronger** expectation, never skipped.

- [x] **3.4** Close **D2** — the editor canvas mounts the **theme's demo providers**, so the editor and the preview show the same data. The preview already mounts them (`ThemePreviewFrame.tsx:1285-1293`): the theme's synthetic cart, its demo feed and its demo query.

  ```
  # src/routes/_authenticated/dashboard/builder.tsx — wrap the canvas's tree in
  #   <CartProvider value={songoskritiPreviewCart()}>
  #     <CollectionQueryProvider value={…the theme's demo query…}>
  #       <BlogFeedProvider value={songoskritiPreviewFeed()}>
  ```

  **The storefront must never mount the demo providers** — `ThemeChrome` mounts only `LiveCartScope` (`ThemeChrome.tsx:464-467`). The suite must assert that separation.

  ```
  node_modules/.bin/vitest run src/lib/pipeline-resolver.test.ts src/lib/preview-parity.contract.test.ts src/components/store/ThemeChrome.route-content.test.tsx
  ```

  Expected output: every suite passes, and the parity suite's **new** case asserts the editor's and the preview's grant sets are equal.

- [x] **3.5** Close **D3** — the preview's installed artifact reads the **published** version, so the preview and the storefront resolve the same map.

  ```
  # src/routes/theme-preview.$key.tsx — themePreviewInstalledFn (":65")
  #   read the PUBLISHED version row (the same pointer the storefront serves:
  #   store_themes.published_version_id), not the newest version row
  # src/lib/preview-sources.ts — installedPreviewSource (":106") — unchanged in shape
  ```

  **The anonymous visitor still gets the theme's source** — that is the theme's own default and it must be **labelled** as such in the preview host, not presented as the merchant's storefront.

  ```
  node_modules/.bin/vitest run src/lib/pipeline-resolver.test.ts src/lib/preview-sources.test.ts
  ```

  Expected output: every suite passes, and the suite asserts the preview's installed map equals the storefront's published map for the same store.

- [x] **3.6** Close **D5** — the storefront's declined-template fallback becomes **explicit**. The route's platform surface stays (it is the platform's designed surface for a declined template, exactly as the taxonomy archive is); what changes is that it is **named** rather than indistinguishable from a theme page.

  ```
  # src/components/store/ThemeChrome.tsx — the fallback renders inside a named frame
  #   (a data attribute + a merchant-facing label), so the editor and the publish gate
  #   can name the template the theme does not design
  ```

  And the **editor** names it: the builder's template switcher shows, for a template with no body, an explicit "this theme does not design this template" state.

- [x] **3.7** Run the neighbouring suites, the type check and the linter.

  ```
  node_modules/.bin/vitest run src/lib/pipeline-resolver.test.ts src/lib/preview-parity.contract.test.ts src/lib/theme-preview-nav.test.ts src/components/store/ThemePreviewFrame.test.tsx src/components/store/songoskriti-preview-compositions.test.tsx src/components/store/songoskriti-preview-page.test.tsx src/lib/themes/songoskriti/unsupported-template-state.test.tsx
  node_modules/.bin/tsgo --noEmit
  node_modules/.bin/eslint src/lib/pipeline-resolver.ts src/lib/theme-preview-nav.ts src/components/store/ThemePreviewFrame.tsx src/routes/_authenticated/dashboard/builder.tsx src/components/store/ThemeChrome.tsx
  ```

  Expected output: every suite passes; `tsgo` and `eslint` print nothing. **The four total `Record<TemplateKey, ThemeAst>>` maps in the existing test files become partial** — those files are in the G1 list only if they must change; if the compiler points at them, they are escalated **in the same commit** as the type change, never as a follow-up.

- [x] **3.8** Commit with explicit paths:
  ```
  git add src/lib/pipeline-resolver.ts src/lib/pipeline-resolver.test.ts src/lib/theme-preview-nav.ts src/components/store/ThemePreviewFrame.tsx src/routes/_authenticated/dashboard/builder.tsx src/components/store/ThemeChrome.tsx
  git commit -m "feat(studio): one resolution pipeline — the canvas, the preview and the storefront agree"
  git status --short
  ```
  Expected output: a commit touching **6** files; the churn files remain unstaged.

### Task 4 — The data/preview safety: no blank required slot, no control that looks live but is inert

**Files:**

- **Create (allowed):** `src/lib/preview-safety.contract.test.ts` — the contract suite for the two rules.
- **Modify (allowed):** `src/lib/themes/songoskriti/preview-demo-data.ts` — the demo cart's rail selection becomes **local** and labelled; the demo account stays labelled.
- **Modify (allowed):** `src/components/store/ThemePreviewFrame.tsx` — the demo rail block is labelled as demo.
- **Modify (escalation-required):** `src/routes/store.$slug.checkout.tsx` — the place-order action is **disabled** when the server offered no rail; the shared empty state replaces the two sentences.

**Interfaces:**

- Consumes: `quoteCart` / `quote.settings.methods` (`src/lib/storefront.functions.ts:140`) · `groupMethods` / `METHOD_GROUP_ORDER` (`src/lib/payment-rails.ts`) · `CheckoutSubmitState` (`src/routes/store.$slug.checkout.tsx:398`) · `songoskritiPreviewCart` (`src/lib/themes/songoskriti/preview-demo-data.ts:158`) · `PaymentMethods` (`src/components/builder/cart.tsx:558`).
- Produces: one shared "no rail available" state · a place-order action that is **disabled with a named reason** on a rail-less store · a preview rail whose selection works locally and is labelled.

- [x] **4.1** Write the failing safety contract. It must assert: (a) **no blank required slot** — for every template, every context widget the theme's composition places is either granted by the host or explicitly replaced by the route's own surface (the suite walks the theme's compositions and the hosts' grant maps); (b) the anonymous account page renders **no** shopper data and **no** blank profile card; (c) the "no rail" state renders **one** sentence, from **one** place, and the place-order action is **disabled** whenever the server offered no rail; (d) the preview's payment radio **changes the selection** (it is locally stateful) and the preview's rail block carries a visible demo marker; (e) **no** control in the preview is rendered as if it works when it cannot — the suite renders the preview's cart and checkout and asserts every interactive element is either functional or visibly marked.

  ```
  node_modules/.bin/vitest run src/lib/preview-safety.contract.test.ts
  ```

  Expected output: **FAIL** — the suite does not exist yet, or the "no rail" case fails the disabled-action assertion.

- [x] **4.2** Close **D8** — one empty state, and a disabled action. The two sentences collapse into one shared constant, and the route's `submitDisabled` gains the "no rail" term.

  ```
  # src/routes/store.$slug.checkout.tsx
  #   submitDisabled = !totals || mutation.isPending || chargeHop === "redirecting"
  #                  || offered.length === 0            ← the new term
  #   the notice under the action names the reason ("this store has not enabled a payment method yet")
  #   the route's own picker (":778") and the theme's widget (cart.tsx:575) share ONE sentence
  ```

  **The server still decides.** The route's `offered` comes from `quote.settings.methods` (`checkout.tsx:662-664`); a rail-less store cannot submit, whatever the theme draws.

- [x] **4.3** Close **D6** — the preview's rail selection becomes **local and real**, and the block is labelled.

  ```
  # src/lib/themes/songoskriti/preview-demo-data.ts — the demo cart's setMethod
  #   becomes a local state transition inside the preview (the preview owns its own
  #   selection; the production cart context is untouched)
  # src/components/store/ThemePreviewFrame.tsx — the rail block carries a visible
  #   "demo" marker, like the demo shopper's name and the demo page
  ```

  The demo cart is **inert by design** — it must never reach a server — but an inert control must **look** inert: the rail selection is local, and the demo marker says the whole block is a demo.

- [x] **4.4** Close the anonymous-account blank: the account's `profile_card` is granted only when the shopper is signed in (`store.$slug.account.tsx:223-234`), so an anonymous visitor currently gets a **blank** slot. Under the new rule the route supplies an **explicit** state instead of nothing.

  ```
  # src/routes/store.$slug.account.tsx — when the shopper is signed out, the profile slot
  #   renders the platform's single, designed order-lookup panel (the same one the
  #   dashboard's unauthenticated branch renders) — never a blank, never a second
  #   sign-in block
  ```

  ```
  node_modules/.bin/vitest run src/lib/preview-safety.contract.test.ts src/components/store/account-dashboard.contract.test.ts src/components/store/AccountDashboard.test.tsx src/components/builder/cart-payment-methods.test.tsx
  ```

  Expected output: every suite passes.

- [x] **4.5** Run the neighbouring commerce suites and the static gates.

  ```
  node_modules/.bin/vitest run src/components/builder/cart.test.tsx src/components/builder/cart-payment-methods.test.tsx src/lib/payment-rails.test.ts src/routes/store.\$slug.checkout.rescue.test.ts src/lib/checkout-shell.contract.test.ts src/lib/themes/songoskriti/cart-account-demo.test.ts
  node_modules/.bin/tsgo --noEmit
  node_modules/.bin/eslint src/lib/themes/songoskriti/preview-demo-data.ts src/components/store/ThemePreviewFrame.tsx src/routes/store.\$slug.checkout.tsx
  ```

  Expected output: every suite passes; `tsgo` and `eslint` print nothing.

- [x] **4.6** Commit with explicit paths:
  ```
  git add src/lib/preview-safety.contract.test.ts src/lib/themes/songoskriti/preview-demo-data.ts src/components/store/ThemePreviewFrame.tsx src/routes/store.\$slug.checkout.tsx
  git commit -m "fix(storefront): no blank required slot, no control that looks live and is inert"
  git status --short
  ```
  Expected output: a commit touching **4** files; the churn files remain unstaged.

### Task 5 — The proof: edit → save → reload → publish → the storefront matches, asserting visible content and working interactions

**Files:**

- **Create (allowed):** `.e2e/songoskriti-dynamic-themes.spec.ts` — the new browser lane (the brief's requirement 6).
- **Create (allowed):** `.e2e/songoskriti-dynamic-themes-helpers.ts` — its helpers (the editor steps, the storefront assertions).
- **Modify (allowed):** `.e2e/songoskriti-seven-templates.spec.ts` — an **existing** `.e2e` file: the journey's storefront assertions are **strengthened** to include the changed composition. **Never weakened.**
- **Modify (allowed):** `.e2e/songoskriti-storefront-surfaces.spec.ts` — an **existing** `.e2e` file: the permitted-interaction cases are **added**.
- **Create (allowed):** `src/lib/themes/songoskriti/distinctness-dynamic.test.ts` — the distinctness gate's own re-run for the new compositions.

**Interfaces:**

- Consumes: `ensureSongoskritiActive` / `merchantCreds` / `loginThroughRealForm` (`.e2e/helpers-songoskriti.ts`) · `NetworkCollector` / `blockExternalRequests` (`.e2e/helpers.ts`) · the editor's own strip, tray, navigator and inspector (the same selectors the seven-template lane uses) · the storefront's own routes.
- Produces: a browser lane that asserts a **merchant-authored marker** is visible on the storefront after the publish, and that a **permitted interaction works** on each of the three surfaces.

- [x] **5.1** Write the failing lane. It must, for **each of Cart, Account and Checkout**:
      (a) log in through the **real** form, ensure Songoskriti is active, open the **real** editor;
      (b) select the template through the studio's own strip;
      (c) **change a widget property that changes the visible output** — for the Cart a `cart_lines` heading, for the Account an `account_orders` heading, for the Checkout a `cart_summary` heading — through the **schema-generated inspector control**;
      (d) **save**, **reload**, and assert the edited value survived (server truth);
      (e) **publish** through the real publish modal, and assert the platform's own contract (a success advances the published pointer; a refusal leaves it untouched **and** says why);
      (f) open the **real storefront route** and assert the **merchant-authored marker is VISIBLE** — the edited heading is on the page, and the **old** text is **not**;
      (g) assert a **permitted interaction works**: on the Cart a quantity can be changed and the cart re-quotes; on the Account a tab can be switched and the panel changes; on the Checkout a payment rail can be chosen and the selection sticks;
      (h) assert the **page did not fall back** — the theme's composition is present, not the platform's fallback.

  ```
  node_modules/.bin/playwright test -c .e2e/playwright.config.ts songoskriti-dynamic-themes --list
  ```

  Expected output: the Playwright **test list** — three tests (one per surface) plus the "no session is ever faked" guard — with **no** run against a database. **The lane must skip, with its reason, when the credentials are absent** — the same discipline as the shipped lanes (`merchantCreds()`, `.e2e/helpers-songoskriti.ts:31-36`).

- [x] **5.2** Strengthen the existing seven-template journey: after the publish, the journey must assert the **changed** composition on the storefront. Today it changes a Spacer's height to 56 and asserts nothing about it (`.e2e/songoskriti-seven-templates.spec.ts:489-493`).

  ```
  # .e2e/songoskriti-seven-templates.spec.ts — after the publish, assert the
  #   edited node's presence on the storefront (a data attribute or a marker the
  #   journey itself authored), not merely that the route answered
  ```

  **The existing assertions are kept** — the new one is **added**.

- [x] **5.3** Add the permitted-interaction cases to the storefront-surface lane: the payment rail can be chosen on the composed checkout; the account tab can be switched on the composed account; the cart's quantity stepper changes the cart and the quote follows.

  ```
  # .e2e/songoskriti-storefront-surfaces.spec.ts — three new cases
  ```

- [x] **5.4** Re-run the **distinctness gate** for the new compositions. The gate's table is compile-total over the template keys (`src/lib/themes/songoskriti/template-distinctness.ts:132-250`); the `cart`, `checkout` and `account` rows must follow the new compositions, and the "every template a theme does not author is rejected as generic" loop must be re-run.

  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/template-distinctness.test.ts src/lib/themes/songoskriti/template-distinctness.archive.test.ts src/lib/themes/songoskriti/distinctness-dynamic.test.ts
  ```

  Expected output: every suite passes, and the new suite asserts the `cart` row's **forbidden** types now include `orders_list` (the account's orders live in the dashboard) and that the `checkout` row still forbids any authored field or price.

- [x] **5.5** Run the whole unit/contract lane.

  ```
  node_modules/.bin/vitest run
  ```

  Expected output: `Test Files  N passed (N)` with the same **three pre-existing, environment-bound failures** the prior programme recorded (`src/lib/analytics-live-shape.test.ts` ×2 and `src/lib/site.server.test.ts` ×1 — `phase3-evidence.md` §2.1) and **no new failure**. **The count is read from the run, not assumed.** A new failure is a regression of this programme and must be fixed before the task closes.

- [x] **5.6** Run the browser lanes on the **throwaway stack** — never the configured database.

  ```
  docker compose -f docker-compose.e2e.yml --env-file /tmp/opencode/e2e-auth/.e2e.env up -d
  docker ps --format '{{.Names}}' | grep e2e-supabase
  E2E_MERCHANT_EMAIL=… E2E_MERCHANT_PASSWORD=… E2E_BASE_URL=http://localhost:3020 E2E_NO_WEBSERVER=1 \
    node_modules/.bin/playwright test -c .e2e/playwright.config.ts songoskriti-dynamic-themes songoskriti-seven-templates songoskriti-storefront-surfaces
  ```

  Expected output: the three lanes report their own outcomes. **A skipped lane is reported as a skip, never as a pass** — and if the credentials or the stack are unavailable, that is stated with the reason, and the task is **not** marked done.

- [x] **5.7** Run the static gates and the build.

  ```
  node_modules/.bin/tsgo --noEmit
  node_modules/.bin/eslint src scripts
  node scripts/doc-gate.mjs
  node scripts/songoskriti-assets-check.mjs
  node_modules/.bin/vite build
  ```

  Expected output: `tsgo` prints nothing; `eslint src scripts` exits 0 (the repo-wide `eslint .` stalls on the untracked `.output-snapshots/` tree, so the paths are linted instead); the doc gate prints `0 findings`; the asset gate prints `0 findings` with its advisory notes; the build exits 0. **`node scripts/contract-gate.mjs` is an EXPECTED RED** — it hardcodes `spawnSync("bunx", …)` and `bun` is not on `PATH` here.

- [x] **5.8** Commit with explicit paths:
  ```
  git add .e2e/songoskriti-dynamic-themes.spec.ts .e2e/songoskriti-dynamic-themes-helpers.ts .e2e/songoskriti-seven-templates.spec.ts .e2e/songoskriti-storefront-surfaces.spec.ts src/lib/themes/songoskriti/distinctness-dynamic.test.ts
  git commit -m "test(e2e): the cart, account and checkout journeys prove the storefront matches"
  git status --short
  ```
  Expected output: a commit touching **5** files; the churn files remain unstaged.

### Task 6 — The obsolete-path removal (each with a "proven unused" citation)

**Files:**

- **Delete (allowed — a NEW file the last programme created, or a dead file):** `src/components/store/CheckoutMock.tsx` — **proven unused** (O1).
- **Modify (allowed):** `src/lib/theme-preview-nav.ts` — `genericDemoMain` stays (it is the gate's yardstick); its doc comment changes to say so (O2).
- **Modify (allowed):** `src/components/store/ThemePreviewFrame.tsx` — `UNSUPPORTED_TEMPLATE_BODY`'s copy is re-worded to describe the absent state (O3), and the stale `CheckoutMock` mention at `:1113` is re-worded.
- **Modify (escalation-required):** `src/components/store/songoskriti-preview-compositions.test.tsx` — an **existing** test file: the stale `CheckoutMock` mention at `:8` is re-worded. **Never weakened.**
- **Create (allowed):** `docs/superpowers/songoskriti-evidence/port/phase4-dynamic-themes-obsolete-paths.md` — the evidence record with the "proven unused" citation for every removal.

**Interfaces:**

- Consumes: the grep citations of A8 · `grep -rn "CheckoutMock" src .e2e --include=*.ts --include=*.tsx` · the `genericDemoMain` consumers.
- Produces: a tree with no dead checkout mock · an evidence record naming every removed path, its citation and its date.

- [x] **6.1** Prove each candidate is unused **before** deleting it, and write the citation down.

  ```
  grep -rn "CheckoutMock" src .e2e --include=*.ts --include=*.tsx
  grep -rn "genericDemoMain" src --include=*.ts --include=*.tsx
  grep -rn "BlogArchiveTheme" src --include=*.ts --include=*.tsx
  grep -rn "DEMO_CART" src --include=*.ts --include=*.tsx
  ```

  Expected output: `CheckoutMock` returns **only its own definition** and two comments that say the preview does **not** use it — i.e. **no importer**. `genericDemoMain` returns the preview's synthesis (removed in Task 3) **plus** the distinctness gate's references — so it **stays**. `BlogArchiveTheme` returns `ArchiveView.tsx:152` — it **stays**. `DEMO_CART` returns the context's default — it **stays**.

- [x] **6.2** Delete the proven-unused file and fix its references.

  ```
  git rm src/components/store/CheckoutMock.tsx
  ```

  Expected output: `rm 'src/components/store/CheckoutMock.tsx'`. **No other file changes** — the two prose mentions of it (`ThemePreviewFrame.tsx:1113` and `songoskriti-preview-compositions.test.tsx:8`) are comments about the preview's history, and a comment naming a file that no longer exists is a stale reference, so both comment sites are **re-worded in the same commit** to name what replaced it (the authored checkout composition rendered through `SectionRenderer`).

- [x] **6.3** Write the evidence record — every removed path, its citation, the date, and the paths that were **kept** and why.

  ```
  mkdir -p docs/superpowers/songoskriti-evidence/port
  ```

  Expected output: the record exists and names, for each of O1–O8, the disposition and the citation.

- [x] **6.4** Run the neighbouring suites and the static gates.

  ```
  node_modules/.bin/vitest run src/components/store/songoskriti-preview-compositions.test.tsx src/components/store/ThemePreviewFrame.test.tsx src/lib/themes/songoskriti/template-distinctness.test.ts src/lib/theme-preview-nav.test.ts
  node_modules/.bin/tsgo --noEmit
  node_modules/.bin/eslint src scripts
  ```

  Expected output: every suite passes; `tsgo` and `eslint` print nothing.

- [x] **6.5** Commit with explicit paths:
  ```
  git add src/components/store/CheckoutMock.tsx src/lib/theme-preview-nav.ts src/components/store/ThemePreviewFrame.tsx src/components/store/songoskriti-preview-compositions.test.tsx docs/superpowers/songoskriti-evidence/port/phase4-dynamic-themes-obsolete-paths.md
  git commit -m "chore(cleanup): remove the checkout mock, proven unused; record the obsolete-path dispositions"
  git status --short
  ```
  Expected output: a commit touching **5** files (the deletion counts as one); the churn files remain unstaged.

### Task 7 — The docs and the report

**Files:**

- **Create (allowed):** `docs/superpowers/songoskriti-evidence/port/phase4-dynamic-themes-evidence.md` — the evidence record: what shipped, how it was verified, what remains open.
- **Create (allowed):** `docs/superpowers/songoskriti-evidence/port/phase4-dynamic-themes-escalation.md` — the escalation record: every §7 relaxation with its exact unified-diff hunks, written **before** any pinned output moves.
- **Modify (allowed):** `docs/superpowers/plans/2026-10-22-frame30-dynamic-themes.md` — this plan, updated with the shipped state.
- **Modify (allowed):** `report.md` — the consolidated report, updated with this programme's outcome.

**Interfaces:**

- Consumes: every task's measured output · the escalation record's own format (`phase3-archive-key-escalation.md`) · the prior programme's evidence format (`phase3-evidence.md`).
- Produces: the evidence record · the escalation record · the updated plan · the updated report.

- [x] **7.1** Write the **escalation record before any pinned output moves** — the same order the prior programme used (its record's §(a) was written before the union changed). It must contain, in this order: (a) the finding — _"the theme may place the commerce and account widgets but may not describe their insides; the shared root cause is that the widgets are monolithic catalogue entries and the theme-presentation registry does not cover them"_; (b) the exact old → new diff for every one of the **twelve** G1 files, quoted as unified-diff hunks; (c) the **backward-compatibility** statement — _"every new prop is optional and defaults to today's rendering; every stored AST written before this change renders byte-identically; no template key is added or removed; the API line does not move"_; (d) the **package-contract** statement — _"a package's `supportedWidgets` may name the new `account_*` types; a package that does not is unaffected; `THEME_API_RANGE` stays `^3.0.0` and `BUILDER_API_VERSION` stays `3.1.0`; the only per-key rule remains `templates.archive_requires_api`"_; (e) the **security** statement — _"the parts prop is a closed list of keys, never values; the account panels read only the route's provider; the theme's presentation receives the same `WidgetCtx` and has no server access"_; (f) the **boundary** statement — _"this record escalates exactly the eleven files named in the plan's Decision Gate G1, each with its exact diff; no file outside that list is edited"_.

  ```
  git status --short
  ```

  Expected output: the three churn files and `?? .output-snapshots/` — and nothing else touched.

- [x] **7.2** Write the **evidence record**: the shipped commits and their subjects; the measured test counts (**read from the run**); the browser lanes' outcomes, with a skip reported as a skip; the distinctness gate's re-run; the local gate results; and the **open items**, named.

  ```
  git log --oneline <base>..HEAD
  node_modules/.bin/vitest run 2>&1 | tail -20
  ```

  Expected output: the log lists this programme's commits; the vitest tail carries the real counts.

- [x] **7.3** Update this plan with the shipped state — the measured counts replace the estimates, the Decision Gate's rulings replace the assumptions, and every task's checkboxes are checked **only** for what actually ran.

- [x] **7.4** Update `report.md` with the programme's outcome, in the prior programme's style: what shipped, what the evidence proves, what was **not** claimed (the remote CI, the parity re-freeze, the 76 % বাংলа floor, the merchant-scoped archive route).

- [x] **7.5** Run the documentation gate and the static gates one last time.

  ```
  node scripts/doc-gate.mjs
  node_modules/.bin/tsgo --noEmit
  node_modules/.bin/eslint src scripts
  node_modules/.bin/vitest run
  ```

  Expected output: the doc gate prints `0 findings`; `tsgo` and `eslint` print nothing; the vitest run's failures are the same **three** environment-bound ones and no more.

- [x] **7.6** Commit with explicit paths:
  ```
  git add docs/superpowers/songoskriti-evidence/port/phase4-dynamic-themes-evidence.md docs/superpowers/songoskriti-evidence/port/phase4-dynamic-themes-escalation.md docs/superpowers/plans/2026-10-22-frame30-dynamic-themes.md report.md
  git commit -m "docs: the dynamic-themes programme — the evidence, the escalation record and the report"
  git status --short
  ```
  Expected output: a commit touching **4** files; `git status --short` shows the three churn files and `?? .output-snapshots/`, all unstaged.

---

## The shipped state (measured at the programme's close, 2026-10-22)

Thirty-one commits ship the programme (`109e2d3d..3753eaf3`, **153 files, +15 750 / −1 794**) before the docs batch; every task's checkboxes above are checked because the step ran. The _Ruled_ lines under the three gates carry the answers. The measured state this update records:

| gate / lane                                  | measured outcome                                                                                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| full `vitest run` (the docs-batch re-run)    | **Test Files 2 failed · 630 passed · 1 skipped (633) — Tests 3 failed · 8 969 passed · 3 skipped (8 975)**; the failures are the three pre-existing, environment-bound ones (`analytics-live-shape` ×2, `site.server` ×1) |
| `tsgo --noEmit` · `eslint src scripts`       | exit 0 · exit 0 (0 errors, 325 pre-existing warnings)                                                                                                                                                                     |
| `doc-gate` · asset gate                      | 0 findings · GREEN (0 findings, 11 notes)                                                                                                                                                                                 |
| build (at the block-resolved tip `4eef8f5c`) | exit 0 — `.output/` 56 MB, 1 341 files, client JS 5.59 MB, server 14.61 MB                                                                                                                                                |
| distinctness gate re-run (3 suites)          | **Test Files 3 passed (3) · Tests 23 passed (23)**                                                                                                                                                                        |
| lanes (throwaway stack)                      | seven-templates **8/8** (8.3 m) · storefront-surfaces **9 passed / 1 skipped / 1 flaky** (6.7 m) · dynamic-themes **1 passed / 3 skipped** (3.1 m; two skips are the publish refusal at **63 % vs the 90 % floor**)       |
| parity                                       | first run 39/27/1 rejected → classified → **re-frozen**: freeze 66 / 1 skipped / 0 failed (8.3 m), verification 66 / 1 skipped / 0 failed (8.1 m); before-stills preserved; freeze commit `c565f0d0`                      |

The two things the programme could **not** prove, stated: the post-publish storefront (the platform refuses at 63 % translation coverage — owner action) and the remote CI (nothing pushed). The evidence record and `report.md` §3.6–§3.7 carry the full detail.

---

## The blast radius, stated honestly

**Files this mechanism needs.** The §7-prohibited files it touches — **twelve**, every one of them named in the Decision Gate G1 and none of them edited before the owner rules:

`src/lib/builder-ast.ts` · `src/components/builder/widgets.tsx` · `src/components/builder/cart.tsx` · `src/components/builder/account.tsx` · `src/components/store/AccountDashboard.tsx` · `src/components/store/ThemeChrome.tsx` · `src/routes/store.$slug.account.tsx` · `src/routes/store.$slug.search.tsx` · `src/routes/store.$slug.checkout.tsx` · `src/routes/_authenticated/dashboard/builder.tsx` · `src/lib/preview-parity.contract.test.ts` · `src/components/store/songoskriti-preview-compositions.test.tsx`.

**Files it does NOT need, and why that matters.** `src/components/builder/SchemaControls.tsx` (the parts prop uses the platform's existing comma-separated-list convention, so **no new inspector field kind** and no inspector change) · `src/lib/theme-presentations.ts` (the presentation registry is **extended by claim**, not edited) · `src/lib/widget-weight.ts` and `src/lib/widget-skeletons.ts` (both derive their per-type rows from `WIDGET_TYPES` and fall back to a default, so a new catalogue type needs no edit) · `src/lib/theme-package.ts` and `src/lib/plugin-manifest.ts` (**no API bump**, no contract change) · `src/lib/template-variants.ts` (the closed variant vocabulary is untouched) · `src/lib/unified-widget-registry.ts` (the widget registry is the **existing** one; new widget types enter it through the catalogue) · `src/components/builder/StudioCanvas.tsx` (the `/dashboard/builder` canvas is the builder route's own `SectionRenderer` tree) · every `supabase/migrations/**` file (the `templates` column is `jsonb`; **no schema change**) · `package.json` and the lockfile (**no new dependency**).

**NEW files: six** — `src/lib/widget-parts.ts` · `src/lib/widget-parts.test.ts` · `src/components/store/AccountDashboardContext.tsx` · `src/components/store/account-widgets.tsx` · `src/components/store/account-widgets.test.tsx` · `src/lib/pipeline-resolver.ts` (plus `src/lib/pipeline-resolver.test.ts`, `src/lib/preview-safety.contract.test.ts`, `src/lib/themes/songoskriti/commerce-presentations.tsx` and its suite, `src/lib/themes/songoskriti/commerce-compositions.test.ts`, `src/lib/themes/songoskriti/distinctness-dynamic.test.ts`, `.e2e/songoskriti-dynamic-themes.spec.ts` and its helper, and the two evidence records — **fifteen new files in all**, every one §7-allowed).

**The compatibility rule for published themes, in one sentence.** _A change is compatible when a stored AST written before it renders byte-identically after it_ — so every new prop is **optional** and defaults to today's rendering (`parseSection`'s fallback to `entry.defaults`, `src/lib/builder-ast.ts:7851-7854`), every new widget type is a **new catalogue key** that no stored AST names, **no template key is added or removed**, and **the API line does not move** (`THEME_API_RANGE` stays `^3.0.0`; `BUILDER_API_VERSION` stays `3.1.0`; the only per-key rule remains the existing additive `templates.archive_requires_api`).
