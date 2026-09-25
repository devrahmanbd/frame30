# Widget Skins — same widget, per-theme look (Elementor model)

Date: 2026-09-25. Status: approved for implementation.

## Problem

Framique has exactly one renderer per `SectionType` (`WIDGET_COMPONENTS`,
`widgets.tsx`), and a test-enforced rule keeps widgets theme-agnostic
(global tokens only). Themes author section props but cannot change how a
widget looks or moves. Result: every theme renders the same widgets with
the same face — vanilla. Reference: Elementor `Skin_Base` + `get_style_depends`,
WordPress `theme.json` `settings` + `styles.blocks`
(Context7: `/websites/developers_elementor`, `/kasparsd/wp-docs-md`).

## Design

### 1. `skin` prop (closed vocabulary, per widget)

Each skinnable widget gains a `skin` prop whose values are a closed,
per-widget set, e.g.:

| Widget | Skins |
|---|---|
| `product_rail` | `editorial` (default), `compact`, `minimal` |
| `hero_carousel` | `split`, `fullbleed`, `minimal` |
| `testimonials` | `wall`, `carousel`, `single` |
| `product_grid` | `cards`, `rows` |

Generalizes the existing `cardVariant` precedent into a system. Catalog
entry gets a `skin` select field (style panel) so the builder exposes it
with zero custom UI. Unknown values fall back to the widget default —
never a crash, never empty.

### 2. Renderer branches on `skin`

`WidgetCtx` already carries `str()`; renderers switch class/layout blocks
per skin value. Shared structure (a11y, data hooks, slots) stays common —
only presentation forks. Keeps the closed-map gate green.

### 3. Theme-owned skin CSS (conditional)

Themes ship skin sheets keyed by attribute selectors:

```css
[data-widget="product_rail"][data-skin="minimal"] { /* … */ }
```

Renderer emits `data-widget` + `data-skin` attributes (already have
`data-fq-node`; this is additive). Loaded only when a used skin needs
it — our `get_style_depends`. Token-only (the tokens-only gate scans
widget files; theme skin sheets live in theme folders, outside the scan
— documented, not a loophole: sheets may use `var(--theme-*)` + literals
for artwork only).

### 4. Theme preset defaults

Each theme package declares default widget props:

```ts
// lib/themes/songoskriti/skins.ts
export const SONGOSKRITI_WIDGET_DEFAULTS = {
  product_rail: { skin: "editorial" },
  hero_carousel: { skin: "split" },
} satisfies Partial<Record<SectionType, Record<string, PropValue>>>;
```

Applied at section creation (factory/blueprint builders merge defaults
under authored props), merchant-overridable in the inspector. This is
what makes "same widget, better look" automatic per theme.

### 5. Non-goals (explicit)

- No per-theme widget forks (no `songoskriti_product_rail` types).
- Demo data stays data-only (`previewDemoMap` untouched).
- No new npm dependencies. No migration (props live in section JSON).

## Test plan

- Contract: unknown skin → default render; every skin renders h1-safe
  headings, 44px targets, bn/en copy, reduced-motion collapse.
- Registry gates stay green (no hex/theme imports in widget files).
- Theme default tests: factory output carries theme defaults;
  authored props win over defaults.
- Live: preview each skin per theme before deploy.

## Rollout

1. Core: `skin` prop + branches for product_rail, hero_carousel,
   testimonials, product_grid (+ catalog fields).
2. Songoskriti skin sheet + preset defaults.
3. Somvabona skin sheet + preset defaults.
4. Preview matrix check → deploy.
