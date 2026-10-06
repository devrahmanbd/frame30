# Widget development (built-in model)

Last verified: 2026-10-06.

Audience: theme developers presenting built-in widgets, and plugin
developers who need to understand what themes may and may not do with
widgets. For the theme build path read the [Theme guide](themes.md);
for plugin-owned widgets read [Community Plugins](community-plugins.md)
and [Themeable Widgets](themeable-widgets.md).

## The built-in model: schema, data, actions + theme presentation

A built-in widget is data plus behavior owned by the platform, with
presentation owned by the active theme:

```text
catalog entry (props, slots)  -->  section data  -->  renderer reads props
                                                            |
                                              theme presentation (registry 1)
                                              wins when claimed, else fallback
```

- Widget types form a closed enum; third-party code adds no new core
  renderer branch — the only plugin branch is `plugin_block`
  (`src/lib/plugin-manifest.ts:8-11`,
  `src/components/builder/PluginBlock.tsx:12-26`).
- Templates are `{ header, main, footer }`, each widget sits in a
  legal slot, and props are flat scalars plus capped repeatable rows
  (see [Theme guide](themes.md#compose-the-homepage-hero-first)).
- The theme presentation receives a widget context (`ctx`) with
  `section`, `locale`, `link`, and typed prop readers (`str`, `int`,
  `bool`) plus row data — the same context every theme adapter reads
  (for example `src/lib/themes/songoskriti/footer-proof-presentation.tsx:17-215`).

## The theme never replaces logic

A theme presentation re-renders the same data contract; it never
changes validation, hooks, pricing, auth, or checkout behavior. The
five locked rejections for themes that take over platform territory
(payments, SEO meta injection, tracking pixels, auth forms, custom
post types) are documented in the
[review policy](review-policy.md#1-no-plugin-territory-rule-c6).

Concretely, a theme presentation:

- Reads the section's props through `ctx` (repeater rows win, scalar
  fallbacks stay) — mirroring the generic renderer, never inventing
  a prop the catalogue entry does not declare.
- Rebases root-relative hrefs through `ctx.link` so navigation works
  on every host.
- Returns `null` for empty data so the section collapses instead of
  rendering chrome around nothing (for example
  `src/lib/themes/songoskriti/footer-proof-presentation.tsx:17-215`).

## Claim one pair per presentation

```ts
import { registerThemePresentation } from "@/lib/theme-presentations";
import type { WidgetComponent } from "@/components/builder/widgets";

export const MyRail: WidgetComponent = (ctx) => {
  const heading = ctx.str("heading");
  if (!heading) return null;
  return <section data-widget="product_rail">{heading}</section>;
};

// First registration wins; duplicates warn and are ignored; never throws.
registerThemePresentation("my-theme", "product_rail", MyRail);
```

Rules, all enforced in `src/lib/theme-presentations.ts:35-83`:

1. Claim from your own theme module init only; name only your own
   `themeKey`.
2. Shared code names no theme and branches on no theme.
3. Unknown, null, and missing keys return the fallback — your
   presentation never leaks into another theme, and another theme's
   never leaks into yours.

## Responsive and fallback expectations

- Render desktop and mobile structure from the same data (the
  shipped themes render a desktop nav plus a mobile drawer from one
  canonical list; see [Global Chrome](global-chrome.md)).
- Style token-only: stylesheets read `var(--theme-*)` keyed off
  `[data-widget]` + `[data-skin]`; a hex literal fails the gate
  (see [Theme guide](themes.md#keep-skinscss-token-only)).
- Unregistered pairs fall back to the existing resolution with zero
  behavior change
  (`src/components/builder/SectionRenderer.tsx:272-275`), so ship
  only the pairs you dress and let the fallback carry the rest.

Next: [Community Plugins](community-plugins.md).
