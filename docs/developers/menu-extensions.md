# Menu extensions

Last verified: 2026-10-06.

Audience: plugin developers contributing to navigation, and theme
developers rendering it. Menus have platform-owned data; plugins
supply rows or (only when approved) renderers; themes own markup.

```text
merchant menus (dashboard)  -->  canonical rows  -->  engine markup
         |                              ^                    ^
   first claimant                  plugin rows          theme or
   per location                    via bridge /         approved plugin
   (header/footer/mobile)          swap rows            renderer
```

## Data: merchant-owned, canonical by the time you see it

- Merchants edit a flat ordered list with `parentId`; nesting,
  reordering, and validation live in the pure module
  (`src/lib/menus/menu.ts:1-23`).
- Locations are `header`, `footer`, `mobile`
  (`src/lib/menus/menu.ts:27-47`); the first menu claiming a
  location wins and unclaimed locations stay empty
  (`src/lib/menus/menu.ts:414-439`). A store with only a header menu
  still gets mobile navigation via the header fallback
  (`src/lib/menus/menu.ts:446-450`).
- Every renderer consumes the canonical shape `CanonicalMenuItem`
  with bitext labels, children, badge, metadata, and optional
  image/promo (`src/lib/menus/menu.ts:525-535`); labels resolve with
  the বাংলা twin winning for `bn`
  (`src/lib/menus/menu.ts:538-564`). Map trees with
  `toCanonicalMenu` (`src/lib/menus/menu.ts:619-623`).
- No new server hook exists for menus: `SERVER_HOOKS` is unchanged
  by design (`src/lib/plugin-manifest.ts:46-61`).

## Locations: sanctioned fill points

Plugin fill points are exactly `menu_bar`, `menu_dropdown`,
`menu_drawer` (`src/lib/marketplace-scopes.ts:291-299`). The engine
keeps layout and accessibility control at every point: a plugin
contributes rows, never markup.

## Shape 1 (fill): supply rows through `menus.list`

```js
// Inside the sandbox entry: rows in, markup out.
const rows = await window.framique.call("menus.list", { slot: "menu_bar" });
```

- `menus.list` is a bridge method behind `read_menus`
  (`src/lib/marketplace-scopes.ts:260-279`).
- Menus stay readable by default: any storefront grant
  (`render_storefront`, which every widget contribution already
  requires) or explicit `read_menus` authorizes the read
  (`src/lib/marketplace-scopes.ts:306-317`).
- Name an unsanctioned fill point and the call never reaches the
  host (`sandbox.unknown_slot`); the slot selector is validated by
  the caller (`src/components/marketplace/WidgetSandbox.tsx:62-108`).
- Manifest widgets may target menu slots alongside block slots
  (`src/lib/plugin-manifest.ts:250-254`).

Shape 1 needs no review beyond the normal listing review: reads are
low risk and the engine renders every pixel.

## Shape 2 (swap): replace a renderer only when approved

A full nav renderer swap wins only behind **both** the
`replace_menus` scope **and** an explicit review approval flag.
Any failure renders the theme default — fail-open, never blank
(`src/lib/plugin-manifest.ts:97-125`):

| Outcome                                    | Shopper sees             |
| ------------------------------------------ | ------------------------ |
| No claim for the slot                      | Theme default            |
| Claim without review approval              | Theme default            |
| Approval without the `replace_menus` scope | Theme default            |
| Approved renderer throws                   | Theme default            |
| Approved renderer with empty rows          | Theme rows (never blank) |

What each piece does (all **internal** engine machinery, not
extension points):

- `decideMenuRenderer` gates the swap; first claim per slot wins
  (`src/lib/plugin-manifest.ts:102-125`).
- `registerMenuRenderer` / `resolveMenuRenderer` hold host-side
  renderer components by `pluginId x slot`
  (`src/lib/plugin-menu-renderers.ts:46-105`); the mount point
  selects through `selectPluginMenuRenderer`, which returns
  `undefined` unless the decision is `plugin` for that exact slot
  (`src/lib/plugin-menu-renderers.ts:112-135`).
- Row selection keeps theme rows unless the swap carries non-empty
  plugin rows (`src/lib/plugin-manifest.ts:167-228`).
- `PluginMenuBoundary` catches a throwing renderer and renders the
  theme fallback it was given
  (`src/lib/plugin-menu-renderers.ts:179-202`).

As a plugin developer you do not construct claims or wire these
functions: request the `replace_menus` scope (high risk,
`src/lib/marketplace-scopes.ts:97-104`), justify it, and wait for
the review approval flag. As a theme developer you render the
winning rows you are given and always supply the theme fallback.

## Desktop, mobile, and fallback

- Themes render desktop and mobile structure from the same
  canonical list (dropdown/drawer modes;
  `src/lib/menus/menu.ts:504-516`).
- Hrefs rebase onto path hosts; absolute, hash, and contact hrefs
  pass through (`src/lib/menus/menu.ts:458-474`).
- Menu item URLs validate to `https?://`, `/`, `#`, `mailto:`, or
  `tel:` (`src/lib/menus/menu.ts:323-348`); depth is capped at
  `MAX_MENU_DEPTH = 3` (`src/lib/menus/menu.ts:57`).

Next: [Global Chrome](global-chrome.md).
