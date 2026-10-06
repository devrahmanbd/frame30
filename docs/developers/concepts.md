# Concepts for third-party developers

Last verified: 2026-10-06.

One page for the whole mental model. Read this before building
anything.

## Widget is functionality, Theme is presentation

```text
+---------------------+        +---------------------+
|  WIDGET (plugin)    |        |  THEME (presentation)|
|  schema / data /    |  --->  |  tokens, skins,      |
|  actions / slots /  | dresses| markup, chrome       |
|  states             |        |                      |
+---------------------+        +---------------------+
        functionality                 every pixel
```

- A **widget** provides functionality: data shape, actions, states.
  Core widgets live in the closed `SectionType` enum; community
  widgets are addressed `plugin:{pluginId}/{widget}`
  (`src/lib/plugin-manifest.ts:295-306`).
- A **theme** owns every pixel: tokens, skins, markup, header,
  announcement, and footer presentation. A theme never replaces
  widget logic — it claims a presentation pair and renders the same
  data differently.
- Proof the split holds: the same announcement data renders two
  different markups through two theme presentations
  (`src/lib/themes/announcement-presentations-proof.test.tsx:134-158`),
  and the same footer data renders two different grids
  (`src/lib/themes/footer-presentations-proof.test.tsx:184-206`).

## The three registries

Everything a third party can claim flows through one of three
opaque two-level maps. All three share the same contract: first
registration wins (duplicates warn, never throw), resolution never
throws (unknown keys return the caller-supplied fallback), and no
theme or plugin ever resolves to another theme's or plugin's
presentation.

| #   | Registry                       | Key shape               | Claim with                                                                   | Resolve with                                                                |
| --- | ------------------------------ | ----------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Widget presentations           | `themeKey x widgetType` | `registerThemePresentation` (`src/lib/theme-presentations.ts:35-64`)         | `resolveThemePresentation` (`src/lib/theme-presentations.ts:72-83`)         |
| 2   | Community presentations        | `themeKey x pluginKey`  | `registerCommunityPresentation` (`src/lib/plugin-theme-contract.ts:165-200`) | `resolveCommunityPresentation` (`src/lib/plugin-theme-contract.ts:208-220`) |
| 3   | Menu renderers (approved only) | `pluginId x menu slot`  | `registerMenuRenderer` (`src/lib/plugin-menu-renderers.ts:51-86`)            | `selectPluginMenuRenderer` (`src/lib/plugin-menu-renderers.ts:120-135`)     |

Registry 3 additionally requires the review gate: a renderer only
resolves when the decision is `plugin`, which needs both the
`replace_menus` scope and the review approval flag
(`src/lib/plugin-manifest.ts:102-125`). Unapproved slots resolve to
`undefined` and the caller renders the theme default.

The engine consults registry 1 first and falls back to the existing
resolution when nothing is registered
(`src/components/builder/SectionRenderer.tsx:272-275`, over
`src/components/builder/theme-widgets.ts:45`), so unregistered pairs
render exactly as before — zero behavior change.

## Class A vs Class B

Community widgets come in two classes, decided by one optional
manifest field (`src/lib/plugin-manifest.ts:250-271`,
`src/lib/plugin-theme-contract.ts:58-70`):

```text
manifest widget without `themeable`  -->  Class A (isolated)
manifest widget with valid `themeable` contract (version 1)
                                         -->  Class B (themeable)
```

- **Class A (isolated):** the bundle owns arbitrary UI inside the
  sandbox frame. The theme cannot restyle inside it.
- **Class B (themeable):** the plugin declares the theme-safe
  contract (`version`, `schema`, optional `data`, `actions`,
  `slots`, `states`; `src/lib/plugin-theme-contract.ts:44-56`). The
  theme dresses it through registry 2; when no theme dresses it, the
  generic sandboxed island is the fallback
  (`src/lib/plugin-theme-contract.ts:266-297`).

The one decision point both paths share is `resolveCommunityRender`
(**internal**, `src/lib/plugin-theme-contract.ts:266-297`): `blocked`
renders a labeled placeholder, `sandbox` and `island` render the
frame, `theme` renders the theme presentation with the bundle never
executed.

## What is public API and what is internal

**Public (build on these):**

- Manifest fields validated by `parseManifest`
  (`src/lib/plugin-manifest.ts:393-543`).
- The bridge allow-list `WIDGET_API`
  (`src/lib/marketplace-scopes.ts:260-279`) plus `menus.list`.
- `registerThemePresentation` / `resolveThemePresentation`.
- `registerCommunityPresentation` / `resolveCommunityPresentation`
  and the `themeable` contract shape.
- Theme tokens, skins, and the starter folders.

**Internal (read, do not extend):**

- `resolveCommunityRender`, `resolveMenuSwapRows`,
  `renderMenuWithFallback`, `decideMenuRenderer` wiring,
  `selectPluginMenuRenderer`, `PluginMenuBoundary` — the engine's
  fail-open machinery (`src/lib/plugin-manifest.ts:102-228`,
  `src/lib/plugin-menu-renderers.ts:112-202`).
- `themeChromeFor` / the chrome map
  (`src/components/store/theme-chrome.ts:53-68`) — platform config,
  not an extension point.
- Review, vault, install, and lifecycle server modules — they enforce
  your manifest; they are not APIs you call.

Next: [Theme Development](themes.md), then
[Widget Development](widget-development.md).
