# Global chrome: header, announcement, footer

Last verified: 2026-10-06.

Audience: theme developers presenting store-wide chrome. Chrome is
the three surfaces every storefront renders around page content:
header (with navigation), announcement bar, and footer. Data is
platform-owned; presentation is theme-owned through the same widget
registry used for widgets — no second registration path.

```text
platform data (menus, chrome copy, footer data)
        |
  themeKey x mega_menu          -> header shell + nav
  themeKey x announcement_bar   -> announcement bar
  themeKey x footer_sitemap     -> footer grid
        |
  unregistered pair -> generic fallback (never a crash, never blank)
```

## Platform owns the data

- Menus arrive as dashboard `MenuNode` trees with a first-claimant
  rule per location (see [Menu Extensions](menu-extensions.md));
  render sites treat fallback nodes opaquely.
- Header chrome (fallback menu tree, বাংলা twin resolver, logo
  lockup, announcement copy) resolves by explicit merchant theme key
  — never by store slug or display name — through `themeChromeFor`,
  which returns `null` for unknown keys so the generic header
  renders (`src/components/store/theme-chrome.ts:53-68`). The
  `ThemeHeaderChrome` shape is
  (`src/components/store/theme-chrome.ts:30-39`).
- The chrome map itself is platform config (**internal**): themes
  extend chrome by claiming the three registry pairs below, not by
  adding chrome keys.
- Footer data is merchant content (repeater `items` rows win, scalar
  columns stay as fallback, picked page slugs append one column,
  hrefs rebased through `ctx.link`); the theme owns presentation,
  never the sitemap contract
  (`src/lib/themes/songoskriti/footer-proof-presentation.tsx:17-215`).
- Announcement state (items, rotation, dismissal, locale,
  reduced-motion gating) comes from shared headless state; the theme
  owns chrome around it, never the message contract
  (`src/lib/themes/songoskriti/announcement-presentation.tsx:21-46`).

## Present chrome through the widget registry

| Surface      | Pair claimed                  | Shipped example                                                                                                                          |
| ------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Header + nav | `themeKey x mega_menu`        | `registerThemePresentation("songoskriti", "mega_menu", ...)` (`src/lib/themes/songoskriti/header-presentation.tsx:784-788`)              |
| Announcement | `themeKey x announcement_bar` | `registerThemePresentation("songoskriti", "announcement_bar", ...)` (`src/lib/themes/songoskriti/announcement-presentation.tsx:108-112`) |
| Footer       | `themeKey x footer_sitemap`   | `registerThemePresentation("songoskriti", "footer_sitemap", ...)` (`src/lib/themes/songoskriti/footer-proof-presentation.tsx:215`)       |

Registry semantics are identical to widget presentations: first wins,
never throws, unknown keys fall back
(`src/lib/theme-presentations.ts:35-83`). Same data through two
themes renders different markup and nothing else — pinned for
announcement (`src/lib/themes/announcement-presentations-proof.test.tsx:134-158`)
and footer (`src/lib/themes/footer-presentations-proof.test.tsx:184-206`).

## Header shells attach to the registered presentation

A theme's full-header renderer is a `HeaderShell` static attached to
its registered `mega_menu` presentation; `StoreHeader` resolves it opaquely
through the existing registry with the generic shell as fallback
(**internal** lookup,
`src/components/store/StoreHeader.tsx:289-324`):

```tsx
// Conceptual: attach your header shell to your registered presentation.
(MyHeaderPresentation as { HeaderShell?: HeaderShellComponent }).HeaderShell =
  MyHeaderShell;
```

The shipped pattern is
(`src/lib/themes/songoskriti/header-presentation.tsx:777-788`).
The shell receives `HeaderShellProps` — slug, name, menu data,
behavior, counts, locale, and `t` — and wires the same plugin menu
boundary around its own nav, so approved menu swaps keep working
inside theme chrome. The announcement slot inside the header
resolves `themeKey x announcement_bar` with the neutral platform
surface as fallback
(`src/components/store/StoreHeader.tsx:338-380`).

## Fallback and responsive expectations

- Unknown or shell-less themes render the generic shell and the
  neutral announcement surface — shoppers never see a blank header
  or footer.
- Render desktop and mobile structure from the same rows (shipped
  themes pair a desktop nav with an accordion drawer).
- Style token-only (`var(--theme-*)`); collapse to `null` on empty
  data rather than rendering empty chrome.

Next: [Security / Sandbox](security-sandbox.md).
