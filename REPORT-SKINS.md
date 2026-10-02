# Why Both Themes Wear the Same Skin — Analysis Report

> Retired 2026-09-30: the second theme covered here was removed from the
> tree; this dated audit is preserved for its engine-level findings only.
> "Theme B" = the retired theme. Its folder/asset paths are redacted.

Date: 2026-09-26. Method: token/skin/renderer/blueprint comparison of
`songoskriti` vs the retired theme + live DOM inspection of both previews.
File:line refs against `origin/main`. No code changed.

## Verdict in one paragraph

The themes differ **on paper** (tokens, copy, section lists) but render
**identically** because the look lives in three places themes don't control:
(1) the one token that actually differs — `brand` — is consumed **0 times**
by any builder component, while everything visual keys off `--theme-ink`,
which is near-identical on both; (2) layout, typography and
spacing are hardcoded Tailwind classes inside **shared renderers**, and
Songoskriti's renderers override the generic ones **globally**, so Theme B
is painted by Songoskriti's components; (3) both homepages speak the same
section grammar in the same order. "Theme" today means _copy + tint_, not
_skin_. Details below.

## 1. Tokens: different values, same pixels

| Token                   | Songoskriti                 | Theme B                     | Rendered?                                                   |
| ----------------------- | --------------------------- | --------------------------- | ----------------------------------------------------------- |
| brand                   | `#1a1a1a`                   | deep maroon                 | **0 uses** in `components/builder/*.tsx` — dead difference  |
| accent                  | `#8B4513`                   | warm terracotta             | ~unused (same pattern)                                      |
| ink                     | `#1a1a1a`                   | near-black warm grey        | **104 uses** — everything keys off this; visually identical |
| surface                 | `#faf9f7` ivory             | warmer paper                | negligible delta at a glance                                |
| fontDisplay/fontBody    | Playfair Display / Inter    | Playfair Display / Inter    | **identical**                                               |
| fontPairing             | `editorial-serif`           | `editorial-serif`           | identical                                                   |
| density/container/space | comfortable / 1320px / 16px | comfortable / 1320px / 16px | identical                                                   |
| radius                  | `0px`                       | `4px`                       | only visible delta, and tiny                                |

Pipeline itself works (`tokensToCss`, `builder-ast.ts:6274` → CSS vars via
`ThemeSurface`). The problem is _which_ tokens vary and _which_ get consumed:
CTAs, prices, badges and headings all resolve to ink/surface/muted. The maroon
brand that should scream Theme B never reaches a pixel.

Evidence: `grep -rn "theme-brand" src/components/builder/*.tsx` → zero hits;
`theme-ink` → 104 hits. Live: both themes' buttons/headlines render near-black.

## 2. Structure: hardcoded in shared renderers, not theme-owned

Section renderers carry fixed layout classes — e.g. `SongoskritiFooterSitemap`
(`songoskriti.tsx:997`): `max-w-[1440px]`, `font-serif text-[40px]/[56px]/[72px]`,
`py-10/sm:py-16`, uppercase tracking. Themes supply _props_ (copy), never
_composition_. Two themes picking `hero_carousel → trust → categories → rails`
get byte-similar DOM by construction.

Worse, the override is global, not per-theme (`widgets.tsx:1139` CHROME spread
first, `:1675` SONGOSKRITI spread later — last write wins for **all** themes):

| Overridden key                                                                                                                        | Winner for every theme |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| product_rail, product_grid, rich_text, newsletter, footer_sitemap, payment_icons, department_grid, mega_menu, store_locator (+7 more) | Songoskriti's renderer |

Theme B defines only 5 unique widgets (`trust_marquee`, `price_buckets`,
`occasion_matrix`, `urgency_rail`, `rating_stars`). Everything else it "renders"
is Songoskriti's component in Theme B's colors.

## 3. Brand leakage: Songoskriti prints itself on Theme B's page (live proof)

`SongoskritiFooterSitemap` imports `STATEMENT, NEWSLETTER, PAYMENT_MARKS,
COLOPHON` from the songoskriti theme footer module (`songoskriti.tsx:62-65`)
and renders them around whatever columns it's given. Live DOM on
Theme B's preview tab shows the sitemap node
rendering _"Woven in Bangladesh, worn everywhere… Songoskriti… © 2026
Songoskriti"_. Same for `store_locator`: hardcoded songoskriti
imagery + songoskriti motion hooks for any theme that uses the section.

Bonus find: Songoskriti's **own** page renders its footer statement +
newsletter **twice** (theme authors standalone sections AND the renderer
hardcodes the same zones) — brand coupling hurts the owner too.

## 4. Same data, same rhythm

- The retired theme's rails showed songoskriti-catalog products (demo-catalog
  alias — its rails sold heritage-silk titles; own-catalog fix exists, unmerged).
- Homepage grammar, both themes: hero → trust → category circles → product
  rails → store locator → craft story → testimonials → statement → newsletter
  → sitemap. Different counts (20 vs 11 sections), same sentence structure.
- Skins work but are cosmetic-only: 4–5 skinnable types, per-theme defaults
  (`editorial/split/wall/cards` vs compact family), varying padding and a
  serif rule — never layout, type, or rhythm.

## 5. Editor-friendliness: half true

TRUE: everything on both pages is widget-built — the page builder can see,
move and edit every section; no hand HTML. FALSE as a skin system: because
look lives in shared renderer code, a theme **cannot** diverge visually
without touching `/editor` files — the exact thing the widget guidelines
forbid. Today "create a theme" = write copy + pick tokens + hope the shared
components flatter it. Elementor inverts this: structure lives in templates,
rendering follows.

## What would actually differentiate the skins

1. **Per-theme renderer registration** (engine port, not global spread):
   `footer_sitemap` et al. resolve the _active theme's_ renderer; generic
   stays the fallback. Kills §§2–3 at the root. (audited, unmerged)
2. **Consume `brand` in prominent slots** (CTAs, prices, badges, rules):
   one-line-per-slot change, highest visual ROI. (§1)
3. **Divergent token postures**: different display/body fonts, density
   (`airy` vs `compact`), type scale, radius — currently copy-pasted.
4. **Divergent grammars**: different section vocabularies/order per theme,
   not the same 10-block rhythm with different nouns.
5. **Own catalogs** (fix exists, unmerged) + per-theme demo art (§4).
