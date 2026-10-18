# Songoskriti Unified Port — Classification Map (Task 2)

**Branch:** `frame30` · **Scope:** classification only; no src/ edits. **Input:** `inventory.md` (capture commit `72e8c54e`; HEAD `2de3d192`). **Rubric:** spec §4.2/§4.3/§4.4. Each row: `row-id | surface | lane | dormant? | slug/key | purpose | props | target graphs | carrier files | existing renderer to follow | evidence`.

Lane key: (a) shared key (contract + rendering shared & theme-neutral in every graph); (b) presentation (same key, theme-owned markup/styling via `registerThemePresentation` / versioned dressing); (c) theme-owned (`theme:songoskriti/<slug>` or theme-owned asset). Dormancy: `yes (<proof>)` / `no` / `user-approval-required`. Props column populated only for (c) widgets (from inventory renderer evidence); `n/a` otherwise.

## Rows

### Templates (§1)

| row-id | surface | lane | dormant? | slug/key | purpose | props | target graphs | carrier files | existing renderer to follow | evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| TPL-INDEX | index template | (c) | no | index | Theme preview source for homepage; dresses template zone | n/a | storefront | `src/lib/themes/songoskriti/preview.ts:70` (via `builtin-themes.ts:12`) | `src/lib/themes/songoskriti/preview.ts` | inventory.md §1 index; `preview.ts:70` |
| TPL-PRODUCT | product template | (c) | no | product | Theme preview source for product page | n/a | storefront | `src/lib/themes/songoskriti/preview.ts:128` | `src/lib/themes/songoskriti/preview.ts` | inventory.md §1 product; `preview.ts:128` |
| TPL-COLLECTION | collection template | (c) | no | collection | Theme preview source for collection page | n/a | storefront | `src/lib/themes/songoskriti/preview.ts:72` | `src/lib/themes/songoskriti/preview.ts` | inventory.md §1 collection; `preview.ts:72` |
| TPL-ACCOUNT | account template | (c) | no | account | Theme preview source for account pages | n/a | storefront | `src/lib/themes/songoskriti/preview.ts:297` | `src/lib/themes/songoskriti/preview.ts` | inventory.md §1 account; `preview.ts:297` |
| TPL-PAGE | page template | (c) | no | page | Theme preview source for static pages | n/a | storefront | `src/lib/themes/songoskriti/preview.ts:186` | `src/lib/themes/songoskriti/preview.ts` | inventory.md §1 page; `preview.ts:186` |
| TPL-BLOG | blog template | (c) | no | blog | Theme preview source for blog | n/a | storefront | `src/lib/themes/songoskriti/preview.ts:197` | `src/lib/themes/songoskriti/preview.ts` | inventory.md §1 blog; `preview.ts:197` |
| TPL-SEARCH | search template | (c) | no | search | Theme preview source for search results | n/a | storefront | `src/lib/themes/songoskriti/preview.ts:214` | `src/lib/themes/songoskriti/preview.ts` | inventory.md §1 search; `preview.ts:214` |
| TPL-CART | cart template | (c) | no | cart | Theme preview source for cart | n/a | storefront | `src/lib/themes/songoskriti/preview.ts:232` | `src/lib/themes/songoskriti/preview.ts` | inventory.md §1 cart; `preview.ts:232` |
| TPL-CHECKOUT | checkout template | (c) | no | checkout | Theme preview source for checkout | n/a | storefront | `src/lib/themes/songoskriti/preview.ts:262` | `src/lib/themes/songoskriti/preview.ts` | inventory.md §1 checkout; `preview.ts:262` |
| TPL-VARIATIONS | variations (minimal, festive) | (c) | no | minimal/festive | Token + skin-default overrides only | n/a | storefront | `src/lib/themes/songoskriti/variations.ts:22,66` | `src/lib/themes/songoskriti/variations.ts` | inventory.md §1 variations; `variations.ts:22` |

### Homepage (§2, union 14 types)

| row-id | surface | lane | dormant? | slug/key | purpose | props | target graphs | carrier files | existing renderer to follow | evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| HP-COMPOSITION | homepage composition (21 sections) | (c) | no | homepage | Theme-authored homepage builder emitting 12 distinct types | n/a | storefront | `src/lib/themes/songoskriti/homepage.ts:23` | `src/lib/themes/songoskriti/homepage.ts` | inventory.md §2; `homepage.ts:23` (A1: 21 sections/12 types) |
| HP-HERO-CAROUSEL | hero_carousel | (b) | no | hero_carousel / dressed-hero | Shared hero dressed by versioned Songoskriti dressing | n/a | storefront/editor | `src/lib/themes/songoskriti/dressed-hero-dressings.ts:49` (versioned) | `src/lib/themes/songoskriti/dressed-hero-presentation.tsx` | inventory.md §2 hero_carousel; `dressed-hero-dressings.ts:49` |
| HP-DEPARTMENT-GRID | department_grid | (b) | no | department_grid | Shared key with Songoskriti markup (leak) | n/a | storefront/editor | `src/components/builder/songoskriti.tsx:2611` (pack) | `src/components/builder/songoskriti.tsx` (SongoskritiDepartmentGrid) | inventory.md §2/§3 department_grid; `songoskriti.tsx:2611` |
| HP-PRODUCT-RAIL | product_rail | (b) | no | product_rail | Shared key with Songoskriti rail (leak) | n/a | storefront/editor | `src/components/builder/songoskriti.tsx:2605` (pack) | `src/components/builder/songoskriti.tsx` (SongoskritiProductRail) | inventory.md §2/§3 product_rail; `songoskriti.tsx:2605` |
| HP-CRAFT-STORY | craft_story | (b) | no | craft_story | Shared key with Songoskriti markup; **core-required leak** (no generic fallback) | n/a | storefront/editor | `src/components/builder/songoskriti.tsx:2602` (pack) | `src/components/builder/songoskriti.tsx` (CraftStory) | inventory.md §2/§3 craft_story; `songoskriti.tsx:2602`; keyed unreachable |
| HP-SPLIT-FEATURE | split_feature | (b) | no | split_feature | Shared key with Songoskriti markup (leak) | n/a | storefront/editor | `src/components/builder/songoskriti.tsx:2614` (pack) | `src/components/builder/songoskriti.tsx` (SongoskritiSplitFeature) | inventory.md §2/§3 split_feature; `songoskriti.tsx:2614` |
| HP-RECENTLY-VIEWED | recently_viewed | (a) | no | recently_viewed | Shared key, neutral rendering in every graph | n/a | storefront/editor | `src/components/builder/widgets.tsx:1608` (base) | `src/components/builder/widgets.tsx` | inventory.md §2 recently_viewed; `widgets.tsx:1608` |
| HP-FINDER-ROW | finder_row | (b) | no | finder_row | Shared key with Songoskriti markup; **core-required leak** (no generic fallback) | n/a | storefront/editor | `src/components/builder/songoskriti.tsx:2601` (pack) | `src/components/builder/songoskriti.tsx` (FinderRow) | inventory.md §2/§3 finder_row; `songoskriti.tsx:2601`; keyed unreachable |
| HP-COLLECTION-STORY | collection_story | (b) | no | collection_story | Shared key with Songoskriti markup (leak) | n/a | storefront/editor | `src/components/builder/songoskriti.tsx:2615` (pack) | `src/components/builder/songoskriti.tsx` (SongoskritiCollectionStory) | inventory.md §2/§3 collection_story; `songoskriti.tsx:2615` |
| HP-UGC-GALLERY | ugc_gallery | (b) | no | ugc_gallery | Shared key with Songoskriti markup (leak) | n/a | storefront/editor | `src/components/builder/songoskriti.tsx:2616` (pack) | `src/components/builder/songoskriti.tsx` (SongoskritiUgcGallery) | inventory.md §2/§3 ugc_gallery; `songoskriti.tsx:2616` |
| HP-TESTIMONIALS | testimonials | (b) | no | testimonials | Shared key with Songoskriti markup; **core-required leak** (no generic fallback) | n/a | storefront/editor | `src/components/builder/songoskriti.tsx:2603` (pack) | `src/components/builder/songoskriti.tsx` (Testimonials) | inventory.md §2/§3 testimonials; `songoskriti.tsx:2603`; keyed unreachable |
| HP-TRUST-FOOTER | trust_footer | (b) | no | trust_footer | Shared key with Songoskriti markup; **core-required leak** (no generic fallback) | n/a | storefront/editor | `src/components/builder/songoskriti.tsx:2604` (pack) | `src/components/builder/songoskriti.tsx` (TrustFooter) | inventory.md §2/§3 trust_footer; `songoskriti.tsx:2604`; keyed unreachable |
| HP-STORE-LOCATOR | store_locator | (b) | no | store_locator | Shared key with Songoskriti markup (leak) | n/a | storefront/editor | `src/components/builder/songoskriti.tsx:2613` (pack) | `src/components/builder/songoskriti.tsx` (SongoskritiStoreLocator) | inventory.md §2/§3 store_locator; `songoskriti.tsx:2613` |
| HP-ANNOUNCEMENT-BAR | announcement_bar | (b) | yes (proof: A8 grep returns only test files + comments; `preview.ts` does not import it; `index.ts` re-exports header-presentation + ornament only) | announcement_bar | Shared key with dormant Songoskriti presentation | n/a | storefront (if activated) | `src/lib/themes/songoskriti/announcement-presentation.tsx:108` (test-only) | `src/lib/themes/songoskriti/announcement-presentation.tsx` | inventory.md §4 announcement; A8 |
| HP-CIRCLE-CATEGORIES | circle_categories | (a) | no | circle_categories | Shared key, generic only, neutral in every graph | n/a | storefront/editor | `src/components/builder/widgets.tsx` (generic collection) | `src/components/builder/widgets.tsx` | inventory.md §2 (intended-only); `builder-ast.ts` circle_categories |

### Renderer neutrality (remaining leak keys not in homepage)

| row-id | surface | lane | dormant? | slug/key | purpose | props | target graphs | carrier files | existing renderer to follow | evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| RK-PRODUCT-GRID | product_grid | (b) | no | product_grid | Shared key with Songoskriti grid (leak; studio delegation bypasses presentation) | n/a | storefront/editor | `src/components/builder/songoskriti.tsx:2606` (pack); `studio/renderers.tsx:1457` | `src/components/builder/songoskriti.tsx` (SongoskritiProductGrid) | inventory.md §3 product_grid; `songoskriti.tsx:2606`; `renderers.tsx:1457` |
| RK-RICH-TEXT | rich_text | (b) | no | rich_text | Shared key with Songoskriti markup (leak) | n/a | storefront/editor | `src/components/builder/songoskriti.tsx:2607` (pack) | `src/components/builder/songoskriti.tsx` (SongoskritiRichText) | inventory.md §3 rich_text; `songoskriti.tsx:2607` |
| RK-NEWSLETTER | newsletter | (b) | no | newsletter | Shared key with Songoskriti markup (leak) | n/a | storefront/editor | `src/components/builder/songoskriti.tsx:2608` (pack) | `src/components/builder/songoskriti.tsx` (SongoskritiNewsletter) | inventory.md §3 newsletter; `songoskriti.tsx:2608` |
| RK-FOOTER-SITEMAP | footer_sitemap | (b) | yes (proof: no non-test importer of `footer-proof-presentation` except the file itself + somvabona's own; spec §3 test-only) | footer_sitemap | Shared key with Songoskriti footer (leak); dormant proof variant footer-proof | n/a | storefront/editor | `src/components/builder/songoskriti.tsx:2609` (pack); `footer-proof-presentation.tsx:217` (dormant) | `src/components/builder/songoskriti.tsx` (SongoskritiFooterSitemap) | inventory.md §3/§4 footer_sitemap; `songoskriti.tsx:2609`; `footer-proof-presentation.tsx:217` |
| RK-PAYMENT-ICONS | payment_icons | (b) | no | payment_icons | Shared key with Songoskriti markup (leak) | n/a | storefront/editor | `src/components/builder/songoskriti.tsx:2610` (pack) | `src/components/builder/songoskriti.tsx` (SongoskritiPaymentIcons) | inventory.md §3 payment_icons; `songoskriti.tsx:2610` |
| RK-MEGA-MENU | mega_menu | (b) | no | mega_menu | Shared key with Songoskriti header nav (leak); live presentation | n/a | storefront/editor | `src/lib/themes/songoskriti/header-presentation.tsx:776` (live via `preview.ts:16`) | `src/lib/themes/songoskriti/header-presentation.tsx` | inventory.md §3/§4 mega_menu; `header-presentation.tsx:776`; `preview.ts:16` |
| RK-CATEGORY-HEADER | category_header | (b) | no | category_header | Shared key with Songoskriti markup (leak) | n/a | storefront/editor | `src/components/builder/songoskriti.tsx:2617` (pack) | `src/components/builder/songoskriti.tsx` (SongoskritiCategoryHeader) | inventory.md §3 category_header; `songoskriti.tsx:2617` |
| RK-RESULT-TOOLBAR | result_toolbar | (b) | no | result_toolbar | Shared key with Songoskriti markup (leak) | n/a | storefront/editor | `src/components/builder/songoskriti.tsx:2618` (pack) | `src/components/builder/songoskriti.tsx` (SongoskritiResultToolbar) | inventory.md §3 result_toolbar; `songoskriti.tsx:2618` |

### Global chrome (remaining non-widget rows)

| row-id | surface | lane | dormant? | slug/key | purpose | props | target graphs | carrier files | existing renderer to follow | evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| CHR-HEADER-BUILDER | header builder | (c) | no | header | Theme-owned header preview source | n/a | storefront | `src/lib/themes/songoskriti/header.ts:17` | `src/lib/themes/songoskriti/header.ts` | inventory.md §4 header builder; `header.ts:17` |
| CHR-HEADER-FALLBACK | header fallback (mega-menu tree) | (a) | no | header-fallback | Neutral data module, no theme import | n/a | storefront | `src/lib/header-copy.ts` + `header-fallback.ts` | `src/lib/header-copy.ts` | inventory.md §4 header fallback; `header-copy.ts` |
| CHR-HEADER-ANNOUNCEMENT | header announcement | (a) | no | announcement | Neutral data module | n/a | storefront | `src/lib/header-copy.ts:247` | `src/lib/header-copy.ts` | inventory.md §4; `header-copy.ts:247` |
| CHR-HEADER-LOGO | header logo lockup | (a) | no | logo-lockup | Neutral data module | n/a | storefront | `src/lib/header-copy.ts:241` | `src/lib/header-copy.ts` | inventory.md §4; `header-copy.ts:241` |
| CHR-FOOTER-BUILDER | footer builder | (c) | no | footer | Theme-owned footer preview source | n/a | storefront | `src/lib/themes/songoskriti/footer.ts:202` | `src/lib/themes/songoskriti/footer.ts` | inventory.md §4 footer builder; `footer.ts:202` |
| CHR-FOOTER-COPY | footer copy constants | (a) | no | footer-copy | Neutral data module | n/a | storefront | `src/lib/footer-copy.ts:16,24,37,40` | `src/lib/footer-copy.ts` | inventory.md §4; `footer-copy.ts:16` |

### Tokens / skins (§5)

| row-id | surface | lane | dormant? | slug/key | purpose | props | target graphs | carrier files | existing renderer to follow | evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| TOK-TOKENS | tokens | (c) | no | tokens | Theme-owned token set | n/a | storefront | `src/lib/themes/songoskriti/tokens.ts:9` | `src/lib/themes/songoskriti/tokens.ts` | inventory.md §5 tokens; `tokens.ts:9` |
| TOK-SKINS | skins (widget defaults) | (c) | no | skins | Theme-owned widget skin defaults | n/a | storefront | `src/lib/themes/songoskriti/skins.ts:52` | `src/lib/themes/songoskriti/skins.ts` | inventory.md §5 skins; `skins.ts:52` |
| TOK-SKINS-CSS | skins.css | (c) | no | skins-css | Theme-owned CSS (imported in skins.ts) | n/a | storefront | `src/lib/themes/songoskriti/skins.css` (imported `skins.ts:28`) | `src/lib/themes/songoskriti/skins.css` | inventory.md §5 skins.css; `skins.ts:28` |
| TOK-SKIN-SETS | skin sets | (c) | no | skin-sets | Theme-owned skin sets (product_rail, hero_carousel, testimonials, product_grid) | n/a | storefront | `src/lib/themes/songoskriti/skins.ts:35` | `src/lib/themes/songoskriti/skins.ts` | inventory.md §5 skin sets; `skins.ts:35` |

### Bilingual copy (§6)

| row-id | surface | lane | dormant? | slug/key | purpose | props | target graphs | carrier files | existing renderer to follow | evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| COPY-HP | homepage bilingual | (c) | no | homepage-bn | Theme-authored bilingual props (`_bn`) | n/a | storefront | `src/lib/themes/songoskriti/homepage.ts` (all sections) | `src/lib/themes/songoskriti/homepage.ts` | inventory.md §6 homepage bilingual |
| COPY-HEADER-MENU | header menu bilingual | (a) | no | header-menu-bn | Neutral data module (`HEADER_MENU_BN`) | n/a | storefront | `src/lib/header-copy.ts:185,233` | `src/lib/header-copy.ts` | inventory.md §6; `header-copy.ts:185` |
| COPY-FOOTER | footer copy bilingual | (a) | no | footer-copy-bn | Neutral data module (`STATEMENT`/`NEWSLETTER`/`COLOPHON` `_bn`) | n/a | storefront | `src/lib/footer-copy.ts` | `src/lib/footer-copy.ts` | inventory.md §6 footer copy bilingual |
| COPY-WIDGET-BILINGUAL | widget bilingual (`t()` calls in songoskriti.tsx) | (b) | no | widget-bn | Inherent to (b) leak components; unkeyed renders Songoskriti component | n/a | storefront/editor | `src/components/builder/songoskriti.tsx` (t() calls) | `src/components/builder/songoskriti.tsx` | inventory.md §6 widget bilingual; `songoskriti.tsx` (FinderRow 117-122, TrustFooter 527-528) |
| COPY-ARCHETYPES | archetypes bilingual | (c) | no | archetypes-bn | Theme-authored bilingual archetype fields | n/a | storefront | `src/lib/themes/songoskriti/archetypes.ts` (`_bn` fields) | `src/lib/themes/songoskriti/archetypes.ts` | inventory.md §6 archetypes bilingual |

### Media / assets (§7)

| row-id | surface | lane | dormant? | slug/key | purpose | props | target graphs | carrier files | existing renderer to follow | evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| MED-PUBLIC-DIR | `public/ph/songoskriti/` | (c) | no | media | Theme-owned asset directory | n/a | storefront | `public/ph/songoskriti/` | `public/ph/songoskriti/` | inventory.md §7 public/ph/songoskriti |
| MED-ASSET-GEN | asset generator | (c) | no | asset-gen | Build-time asset generation script | n/a | n/a | `scripts/gen-songoskriti-assets.mjs` | `scripts/gen-songoskriti-assets.mjs` | inventory.md §7 asset generator |
| MED-PH-PATHS | `/ph/songoskriti/` paths | (c) | no | ph-paths | Theme-authored asset path references | n/a | storefront | `src/lib/themes/songoskriti/homepage.ts`, `archetypes.ts`, `header-copy.ts` | n/a (data) | inventory.md §7 /ph/songoskriti/ paths |
| MED-C-HREFS | `/c/` collection hrefs | (c) | no | collection-hrefs | Theme-authored collection route references | n/a | storefront | `src/lib/themes/songoskriti/homepage.ts`, `archetypes.ts` | n/a (data) | inventory.md §7 /c/ hrefs |
| MED-COLLECTIONS | `SONGOSKRITI_COLLECTIONS` archetypes | (c) | no | collections | Theme-owned collection archetype data | n/a | storefront | `src/lib/themes/songoskriti/archetypes.ts:22` | `src/lib/themes/songoskriti/archetypes.ts` | inventory.md §7; `archetypes.ts:22` |

### Motion + product-data (§8)

| row-id | surface | lane | dormant? | slug/key | purpose | props | target graphs | carrier files | existing renderer to follow | evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| MOT-MOTION | songoskriti-motion | (a) | no | motion | Shared motion hooks (neutral, theme-agnostic) | n/a | storefront/editor | `src/components/builder/songoskriti-motion.ts` (imported `songoskriti.tsx:50`) | `src/components/builder/songoskriti-motion.ts` | inventory.md §8 songoskriti-motion; `songoskriti-motion.ts` |
| MOT-HOOKS | shared motion hooks (`useCarouselCycle`, `useScrollReveals`) | (a) | no | motion-hooks | Shared neutral hooks | n/a | storefront/editor | `src/components/builder/songoskriti-motion.ts:519,589` | `src/components/builder/songoskriti-motion.ts` | inventory.md §8; `songoskriti-motion.ts:519` |
| MOT-DEMO-DATA | demo-data assumptions (collection slugs) | (c) | no | demo-data | Theme-authored demo catalogue assumptions | n/a | storefront | `src/lib/themes/songoskriti/homepage.ts` (slugs: sarees, new-in, festive, …) | n/a (data) | inventory.md §8 demo-data assumptions |

### Versioned dressings (§8)

| row-id | surface | lane | dormant? | slug/key | purpose | props | target graphs | carrier files | existing renderer to follow | evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| VER-DRESSED-HERO | dressed-hero (versioned) | (b) | yes (proof: spec §3 lists dressed-hero as test-only; no productive importer of `dressed-hero-dressings.ts` outside tests) | dressed-hero | Versioned dressing for `builtin:hero` + `headline`→`title` migration | n/a | storefront (if activated) | `src/lib/themes/songoskriti/dressed-hero-dressings.ts:49-50` | `src/lib/themes/songoskriti/dressed-hero-presentation.tsx` | inventory.md §8 dressed-hero; `dressed-hero-dressings.ts:49` |
| VER-DRESSED-REVIEWS | dressed-reviews (versioned) | (b) | yes (proof: spec §3 test-only; no productive importer) | dressed-reviews | Versioned dressing for `plugin:acme/reviews` | n/a | storefront (if activated) | `src/lib/themes/songoskriti/dressed-hero-dressings.ts:50` | `src/lib/themes/songoskriti/dressed-hero-presentation.tsx` | inventory.md §8 dressed-hero; `dressed-hero-dressings.ts:50` |

### Theme-owned widget (§8)

| row-id | surface | lane | dormant? | slug/key | purpose | props | target graphs | carrier files | existing renderer to follow | evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| THM-ORNAMENT | ornament (theme-owned) | (c) | no | ornament | Reference theme-owned widget `theme:songoskriti/ornament` | fields: `PropField[]` from `src/lib/widget-props.ts` kinds; closed `propsSchema` (`{ fields: PropField[] }`); stable id `theme:songoskriti/ornament`, namespace `theme`, themes `["songoskriti"]`, version 1.0.0 (per spec §4.4) | storefront/editor | `src/lib/themes/songoskriti/ornament-def.ts:20,64` (re-export activation `index.ts:14-17`, test-only today) | `src/lib/themes/songoskriti/ornament-def.ts` + `ornament-presentation.tsx` | inventory.md §8 ornament; `ornament-def.ts:20,64` |

## Leaks

Every `songoskriti-leak` key from inventory §3, with graph and owner verdict. Hypothesis tested: "presentation claim + removal of the key from the `SONGOSKRITI_WIDGETS` export yields keyed parity and unkeyed neutrality" (mechanism: keyed resolution = `THEME_WIDGETS['songoskriti']?.()[type] ?? GENERIC_WIDGETS[type]` at `theme-widgets.ts:73-78`; unkeyed = `WIDGET_COMPONENTS` spread `...SONGOSKRITI_WIDGETS` last at `widgets.tsx:1666-1668`; studio delegation `renderers.tsx:1457` for `product_grid`).

| key | graph | keyed songoskriti survives removal? | verdict | mechanism |
|---|---|---|---|---|
| finder_row | keyed storefront + unkeyed editor/studio | no — no generic fallback; removal deletes the catalog key (not present in any generic map) → keyed songoskriti cannot insert/render; removal breaks keyed parity | core-required | inventory.md §3 finder_row (`keyed: unreachable`); `theme-widgets.ts:73-78`; `unified-widget-registry.ts:1148-1156` (packs include `SONGOSKRITI_WIDGETS`) |
| craft_story | same | no — no generic fallback; same catalog-deletion breakage | core-required | inventory.md §3 craft_story (`keyed: unreachable`) |
| testimonials | same | no — no generic fallback | core-required | inventory.md §3 testimonials (`keyed: unreachable`) |
| trust_footer | same | no — no generic fallback | core-required | inventory.md §3 trust_footer (`keyed: unreachable`) |
| product_rail | same | yes — generic merch rail fallback remains; presentation claim carries SongoskritiProductRail | theme-fixable | inventory.md §3 product_rail (`keyed: neutral`) |
| product_grid | same (+ studio delegation) | yes — generic grid fallback remains; presentation claim carries SongoskritiProductGrid (studio delegation bypasses presentation → parity gap, see Escalations) | theme-fixable | inventory.md §3 product_grid; `renderers.tsx:1457` |
| rich_text | same | yes — generic base fallback remains | theme-fixable | inventory.md §3 rich_text |
| newsletter | same | yes — generic base fallback remains | theme-fixable | inventory.md §3 newsletter |
| footer_sitemap | same | yes — generic chrome fallback remains; footer-proof presentation is the dormant proof variant | theme-fixable | inventory.md §3/§4 footer_sitemap |
| payment_icons | same | yes — generic chrome fallback remains | theme-fixable | inventory.md §3 payment_icons |
| department_grid | same | yes — generic heritage fallback remains | theme-fixable | inventory.md §3 department_grid |
| mega_menu | same | yes — generic chrome fallback remains; live presentation already claims it (`header-presentation.tsx:776` via `preview.ts:16`) | theme-fixable | inventory.md §3/§4 mega_menu; `header-presentation.tsx:776` |
| store_locator | same | yes — generic apparel fallback remains | theme-fixable | inventory.md §3 store_locator |
| split_feature | same | yes — generic apparel fallback remains | theme-fixable | inventory.md §3 split_feature |
| collection_story | same | yes — generic apparel fallback remains | theme-fixable | inventory.md §3 collection_story |
| ugc_gallery | same | yes — generic apparel fallback remains | theme-fixable | inventory.md §3 ugc_gallery |
| category_header | same | yes — generic collection fallback remains | theme-fixable | inventory.md §3 category_header |
| result_toolbar | same | yes — generic collection fallback remains | theme-fixable | inventory.md §3 result_toolbar |

Counts: theme-fixable 14, core-required 4.

## Escalations

- core-required leak `finder_row`: removal deletes the catalog key (no generic fallback) → keyed Songoskriti broken; neutralizing unkeyed resolution without core changes impossible. Evidence: inventory.md §3 finder_row (`keyed: unreachable`); spec §4.2/(a) requires neutral in every graph; §4.4 says escalate if surface unreachable from theme-owned files. Spec clause: §4.2 (a) neutrality bar + §7 escalation.
- core-required leak `craft_story`: same catalog-deletion breakage. Evidence: inventory.md §3 craft_story (`keyed: unreachable`).
- core-required leak `testimonials`: same. Evidence: inventory.md §3 testimonials (`keyed: unreachable`).
- core-required leak `trust_footer`: same. Evidence: inventory.md §3 trust_footer (`keyed: unreachable`).
- `product_grid` studio delegation bypasses `resolveThemePresentation` (`studio/renderers.tsx:1457` uses `WIDGET_COMPONENTS.product_grid` directly): after removal, Songoskriti-themed studio renders the generic grid, not the themed grid; making the themed grid live in studio requires editing the prohibited `studio/renderers.tsx`. Evidence: inventory.md §3 product_grid; spec §7 prohibited files. Escalate if studio parity for the themed grid is required this cycle.
- (No dormancy escalations: announcement, footer-proof, dressed-hero, dressed-reviews all carry proof per A8 / spec §3 / grep; visual-parity items remain in the matrix per §4.5.)

## Parity targets (frozen surfaces for Task 4)

- Templates: every `TEMPLATE_KEYS` route — `index, product, collection, account, page, blog, cart, checkout, search` (inventory.md §1; `builder-ast.ts:46-57`).
- Homepage: `homepage` composition + all 14 union types (hero_carousel, department_grid, product_rail, craft_story, split_feature, recently_viewed, finder_row, collection_story, ugc_gallery, testimonials, trust_footer, store_locator, announcement_bar, circle_categories).
- Chrome states: header (builder/presentation/fallback/announcement/logo/mega_menu), footer (builder/proof/copy), announcement bar, menu behavior (desktop/mobile drawer).
- Each (b) live surface: mega_menu (live), hero_carousel (dressed-hero, once wired), plus all 14 theme-fixable leak keys as they go live.
- Representative sections: every (c) widget (ornament) + at least one per lane — (a) recently_viewed or circle_categories; (b) product_rail or mega_menu; (c) ornament. Mobile/tablet widths 1440/768/375; locales en+bn; reduced-motion capture per §4.3.