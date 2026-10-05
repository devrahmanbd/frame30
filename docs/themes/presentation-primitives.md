# Presentation primitives — the composable theme contract (T4.2)

Themes compose; they never inject CSS. A theme changes how a storefront looks
exclusively by **composing eight closed-vocabulary primitives** — prop values
from the lists below, resolved through tokens. No theme edits shared renderer
markup, no theme ships free-form CSS outside its token-scoped skin sheets,
and no widget renders a look the inspector cannot select through controlled
schema. The isolation rules behind this stand in
[the author guide §13](./creation.md#13-theme-isolation-the-elementor-rule--read-before-touching-widgets):
one renderer per widget key, no brand content in shared renderers, no
cross-theme imports, own demo data.

## Form decision — why this is a doc, not a code registry

Every primitive below is already enforced in code: catalogue fields coerce at
parse, the renderer emits attributes/classes from closed maps, and tests pin
the vocabularies. A second code registry would duplicate those vocabularies
(`WIDGET_SKINS`, `MOTION_EFFECTS`, `DENSITY`/`CARD_VARIANT` options) and drift
from them — a second source of truth with no enforcement power of its own.
The lighter sufficient form is this authoritative pin list: each primitive
names the engine code that enforces it (`file:line`), so reviewers and theme
authors check one page and the code stays the single source of truth.

The one place new code _was_ needed is builder-side discovery — the builder
must ask per widget which presentation surface exists. That lives as an
additive, derived-only API in `src/lib/studio/controls.ts:7021-7152` (§T4.2
appendix: `capabilitiesFor`, `supportsCapability`,
`presentationControlsFor`), and §10 of this doc is its contract. It derives
from the control tables already in that file, so it cannot drift.

## The eight primitives

| #   | Primitive              | What the theme composes                                          | Engine enforcement (read-only pins)                                                                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Layout variant         | `columns`, `layout`, `direction`, `contentWidth`, `maxW`, `span` | Container catalogue entry `src/lib/builder-ast.ts:935-992`; universal style layer `STYLE_FIELDS` (`maxW`, `span`) `src/lib/builder-ast.ts:5685-5741` merged by `withStyleLayer` `:5766-5772`; wrapper classes `MAXW_CLASS` + `spanClass` in `sectionStyle` `:6420-6424,6471`; studio container composition `src/lib/studio/controls.ts:505-660` (`CONTAINER_CONTROLS`)                        |
| 2   | Media treatment        | `ratio`                                                          | Universal `ratio` field `src/lib/builder-ast.ts:5710-5721`, class map `RATIO_CLASS` `:6430-6435`; per-widget ratios (image `:1144-1160`, product media `:1456-1481` incl. portrait `4/5`, `3/4` survival note); studio mirrors `src/lib/studio/controls.ts:802-811` (video), `:4710-4720` (product media)                                                                                     |
| 3   | Content alignment      | `align`                                                          | Shared `ALIGN` field `src/lib/builder-ast.ts:892-902`, class map `ALIGN_CLASS` `:6425-6429`; universal `align` field `:5697-5708`; studio `ALIGN_OPTIONS` `src/lib/studio/controls.ts:64-69` plus per-widget `textAlign` choices                                                                                                                                                              |
| 4   | Density                | `density` (comfortable / compact; engine `DENSITY` field)        | Engine `DENSITY` `src/lib/builder-ast.ts:707-716` (style panel, `product_grid` default `:1184`); page-level `ThemeTokens.density` (`dense \| comfortable \| airy`) `:6634`, default `:6689`. Studio side this is style-tab territory by design — twin parity excludes style-layer keys (`src/lib/studio/catalog.test.ts:830-836`, contract `src/lib/studio/catalog.ts:2455-2463`)             |
| 5   | Card composition       | `cardVariant` (standard / compact / wide / editorial)            | Engine `CARD_VARIANT` `src/lib/builder-ast.ts:718-729` (grid `:1183`, collection grid `:1216`); studio content mirrors `src/lib/studio/controls.ts:4511-4520`, `:6852-6863`. Generalised into skins per the comment at `:731-737`                                                                                                                                                             |
| 6   | Navigation composition | `FooterPresentation` (`columns` / `stacked`), menu pick bindings | Data/presentation split `src/components/store/StoreFooterMenus.tsx:18-35`: `FooterData` `:91-101` via `buildFooterData` `:111-133`, `ThemeFooterRenderer` `:145-240` over `FooterPresentation` `:104`. Menu bindings (`menuId`, `handles`, `pages`, `query`) follow the pick-key convention with twin-parity pins in `src/lib/studio/catalog.test.ts:946-1032`                                |
| 7   | Responsive composition | `responsive` flags, `bp` overrides, `hidden` / `hiddenOn`        | Control opt-in `responsive` (`Control` `src/lib/studio/controls.ts:57`; engine `Field.responsive` `src/lib/builder-ast.ts:557`); per-breakpoint `bp` + `hidden` on `Section` `:417-423` (base inherits downward); studio `hiddenOn` + `StudioNode.slot` (`src/lib/studio/model.ts:40-48`, `STUDIO_SLOTS` `:50-52`); responsive style/advanced tabs (`controls.ts:96-499`) are universal       |
| 8   | Interaction style      | `advMotion` (motion manifest), `advAnimation`, `reveal`          | Closed manifest `MOTION_EFFECTS` `src/lib/builder-advanced.ts:56-66`, `motionEffectOf` unknown→`none` `:85-91`, entrance/JS split `:93-105`, inspector `ADVANCED_FIELDS` `:107-203`; engine executors `fq-fx fq-fx-<effect>` (`SectionRenderer` + `src/styles.css:653-729`, collapsing under `prefers-reduced-motion` and `data-motion="none"`); semantics in `creation.md` §8.6 (`:701-744`) |

Two cross-cutting systems every primitive runs through:

- **Skins (variant mechanism).** Closed per-widget vocabularies
  `WIDGET_SKINS` (`src/lib/builder-ast.ts:738-750`), defaults
  `DEFAULT_WIDGET_SKIN` (`:756-764`), `resolveSkin` unknown→default
  (`:777-784`), inspector `SKIN_FIELD` (`:787-796`), per-page collection
  `usedWidgetSkins` (`:818-841`) and conditional combining
  `combineUsedSkinCss` (`:857-865`) — the `get_style_depends` seam. Studio
  mirrors with `skinControl` (`src/lib/studio/controls.ts:73-90`,
  decoupled by design) at five call sites (`:2209` hero carousel,
  `:4671` product grid, `:4699` product rail, `:6557` testimonials,
  `:6878` urgency rail). Theme defaults merge **under** authored props
  (`withThemeWidgetDefaults` `:873-890`;
  `src/lib/themes/songoskriti/skins.ts:52-57,109-119`,
  `src/lib/themes/somvabona/skins.ts:40-52,96-125`). Merchant skin assets
  load conditionally (`skinKeyForAssetName`, `combineThemeCss`,
  `filterSkinCss` in `src/lib/themes/assets.ts:196-312`).
- **Tokens (the only styling channel).** `ThemeTokens`
  (`src/lib/builder-ast.ts:6625-6659`, defaults `:6680-6699`,
  `FONT_PAIRINGS` `:6662-6676`); runtime rule TR-3 (tokens are the only
  styling channel, `--fq-*` primitives locked —
  `docs/04-builder/theme-runtime.md:32-36`); skin sheets stay token-only
  (`var(--theme-*)`, `color-mix` washes), gated per theme by test
  (`src/lib/themes/songoskriti/skins.test.ts:182`,
  `src/lib/themes/somvabona/skins.test.ts:167`); full author flow in
  `creation.md` §2.1, §4–§5.

Theme-affecting props beyond the eight (`atmosphere` on `hero`,
`src/lib/builder-ast.ts:909-918`; `surface` on `editorial_banner`,
`:924-933`) follow the same pattern — widget-scoped selects whose first
option matches the renderer default — and graduate into the table above
once a second widget adopts them.

## Rules for themes (compose, don't inject)

1. Request a look by setting primitive values (skin defaults, preset props,
   tokens). Never override a generic widget key, never branch on the active
   theme's identity, never ship markup — `creation.md` §13.
2. Skin values are style keys, never copy: no `_bn` twins for skins.
3. Authored props always win over theme defaults (`{ ...defaults,
...authored }` merge order) — the inspector is the merchant's, not the
   theme's.
4. Motion: one orchestrated moment per viewport; every animated variant
   hooks the existing reduced-motion / `data-motion="none"` collapse blocks
   (`src/styles.css:712-729`), never a parallel mechanism.
5. Budgets and gates from the runtime contract apply at publish
   (`theme-runtime.md` TR-12, §4): JS ≤ 100 KB gz, hero ≤ 250 KB, LCP <
   2.5 s, CLS < 0.1, contrast re-checked.

## §10 — Builder capability discovery contract

The builder queries per-widget support through three functions in
`src/lib/studio/controls.ts:7021-7152` (additive; derived from that file's
control tables; no new source of truth):

- `capabilitiesFor(el): { theme, responsive, variant, slot }` —
  - `theme`: a `skin` `select`/`choice` exists (theme-presentation switch,
    including repeater-nested ones). True exactly for the five skinnable
    studio controls (hero_carousel, product_grid, product_rail,
    testimonials, urgency_rail); false for everything else including
    unknown keys.
  - `responsive`: any `responsive: true` control exists. Universally true
    (shared style/advanced tabs) — pinned so the shared tabs cannot lose
    it silently.
  - `variant`: a closed-option treatment switch exists (`cardVariant`,
    `variant`, `size`, `style`, `tone`, `ratio`). Layout-variant and
    alignment have their own controls and do not set this flag.
  - `slot`: the widget hosts slot composition (`container`, `grid`).
    Root placement in header/main/footer is universal via
    `StudioNode.slot` (`src/lib/studio/model.ts:43-52`).
- `supportsCapability(el, capability)` — single-key query over the above.
- `presentationControlsFor(el): Control[]` — the theme-presentation
  options themselves, in content order. Every entry is a closed-vocabulary
  `select`/`choice`: the inspector renders these and nothing else for
  theme presentation. This is the enforcement point for "theme-specific
  presentation options via controlled schema only" — a theme can only ever
  receive values from its published vocabulary.

Inspector rule: edit data/behavior through `contentControls` /
`controlsFor`; edit presentation only through `presentationControlsFor`.
There is no per-widget markup handle, and none may be added — a widget
that needs a new look gets a new closed-vocabulary value, not a raw
handle.
