# Theme Report — clothing-heritage v2 dynamic/customization audit + docs accuracy

Date: 2026-09-22 · Scope: read-only (no code changed)
Method: two parallel audit agents + direct verification of every disputed ref
Note: an earlier session already fixed one cited item (import-fn line refs
in sdk.md were re-checked and are CORRECT as written — audit claim rejected).

## 1. How dynamic / customization-friendly is clothing-heritage v2?

Scores 0–10 (evidence in repo):

| # | Dimension | Score | One-line justification |
|---|---|---|---|
| 1 | Token-driven design | 8 | Full token partial + dark set, panel-editable; container 1320px not in editor choices (`themes/clothing-heritage/tokens.ts:3-23`) |
| 2 | Section prop coverage | 9 | ~90% visible copy is props; only size-table numbers/fit strings baked in (`homepage.ts:6-265`) |
| 3 | Data-driven sections | 5 | Rails/grids bind live data; dept grid, textiles, lookbook, testimonials are static rows/placeholders |
| 4 | Variants/slots | 6 | Layout/offset/cardVariant/columns/scrim/speed/flip exist; no per-section alignment/tone switch |
| 5 | Responsive controls | 4 | Zero breakpoint/hidden overrides shipped; Tailwind + generic studio controls only |
| 6 | Bilingual | 8 | EN+BN twins via withBn dict + explicit hero headline_bn; row fields need manual _bn |
| 7 | Panel editability | 6 | Every widget has catalog+controls, but shapes diverge (panel-dead props below) |
| 8 | Menu/location integration | 4 | Mega menu + footer links are hardcoded strings, not menu locations |
| 9 | Presets/blueprints | 5 | One v2.0.0 preset + 6 secondary templates; no merchant-pickable starter variations |
| 10 | Extensibility | 4 | New section needs core touches (SectionType union + catalog + widget map); only override is contextSlots |

Panel-dead props (visible on site, uneditable in panel): department_grid
heading/name_bn/count, heritage_story eyebrow/headline_bn/founder_*,
editorial_banner eyebrow/overlay, hero_carousel headline_bn/subhead_bn,
trust_bar iN* flat vs items[] repeater.

## 2. Docs accuracy (docs/themes/creation.md + sdk.md vs code)

Confirmed-stale items (fixed in this pass): blueprint split-out layout
(v2 directory), Atelier/Circuit token refs, preset build refs, row-12
auth route, repeater-blueprint term, appearance.server line refs,
listCatalog filter ref, resolveHomepageSlug refs.

Rejected audit claim: sdk.md import-function line refs are correct as
written (verified `themes.functions.ts:208/219/230/241/260/271`).

Still open in docs: repeater migrations section, StudioNodes rendering
contract detail, preview-route matrix (`/theme-preview/$key` vs signed
draft URLs), screenshotPlate vs screenshot_url question.

## 3. Top improvements for theme customization power

1. Per-breakpoint/hidden overrides on heritage sections (homepage.ts,
   secondary.ts via theme-section Extras).
2. Align studio repeaters to theme shapes (department_grid, heritage_story,
   editorial_banner control gaps above).
3. Location-driven mega_menu + footer_sitemap (menuId/location props instead
   of hardcoded hrefs).
4. Bind textile/department/lookbook/testimonial static rows to
   collection/query sources with static fallback.
5. Ship 2–3 starter variations (minimal/editorial/festive) as preset options.

## 4. Standing theme-designer flag (from progress.md)

5/12 v2 sections use prop keys with no studio counterpart — align theme
props to studio widget schemas or ports stay LOSSY forever.
