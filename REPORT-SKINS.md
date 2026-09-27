# Why Both Themes Wear the Same Skin — Analysis Report

Date: 2026-09-26. Method: token/skin/renderer/blueprint comparison of
`songoskriti` vs `somvabona` + live DOM inspection of both previews.
File:line refs against `origin/main`. No code changed.

## Verdict in one paragraph

The themes differ **on paper** (tokens, copy, section lists) but render
**identically** because the look lives in three places themes don't control:
(1) the one token that actually differs — `brand` — is consumed **0 times**
by any builder component, while everything visual keys off `--theme-ink`,
which is near-identical (`#1a1a1a` vs `#2E2620`); (2) layout, typography and
spacing are hardcoded Tailwind classes inside **shared renderers**, and
Songoskriti's renderers override the generic ones **globally**, so Somvabona
is painted by Songoskriti's components; (3) both homepages speak the same
section grammar in the same order. "Theme" today means *copy + tint*, not
*skin*. Details below.

## 1. Tokens: different values, same pixels

| Token | Songoskriti | Somvabona | Rendered? |
|---|---|---|---|
| brand | `#1a1a1a` | `#7C2A1A` (maroon) | **0 uses** in `components/builder/*.tsx` — dead difference |
| accent | `#8B4513` | `#B95A38` | ~unused (same pattern) |
| ink | `#1a1a1a` | `#2E2620` | **104 uses** — everything keys off this; visually identical |
| surface | `#faf9f7` ivory | `#FBF6EE` warmer paper | negligible delta at a glance |
| fontDisplay/fontBody | Playfair Display / Inter | Playfair Display / Inter | **identical** |
| fontPairing | `editorial-serif` | `editorial-serif` | identical |
| density/container/space | comfortable / 1320px / 16px | comfortable / 1320px / 16px | identical |
| radius | `0px` | `4px` | only visible delta, and tiny |

Pipeline itself works (`tokensToCss`, `builder-ast.ts:6274` → CSS vars via
`ThemeSurface`). The problem is *which* tokens vary and *which* get consumed:
CTAs, prices, badges and headings all resolve to ink/surface/muted. The maroon
brand that should scream "Somvabona" never reaches a pixel.

Evidence: `grep -rn "theme-brand" src/components/builder/*.tsx` → zero hits;
`theme-ink` → 104 hits. Live: both themes' buttons/headlines render near-black.

## 2. Structure: hardcoded in shared renderers, not theme-owned

Section renderers carry fixed layout classes — e.g. `SongoskritiFooterSitemap`
(`songoskriti.tsx:997`): `max-w-[1440px]`, `font-serif text-[40px]/[56px]/[72px]`,
`py-10/sm:py-16`, uppercase tracking. Themes supply *props* (copy), never
*composition*. Two themes picking `hero_carousel → trust → categories → rails`
get byte-similar DOM by construction.

Worse, the override is global, not per-theme (`widgets.tsx:1139` CHROME spread
first, `:1675` SONGOSKRITI spread later — last write wins for **all** themes):

| Overridden key | Winner for every theme |
|---|---|
| product_rail, product_grid, rich_text, newsletter, footer_sitemap, payment_icons, department_grid, mega_menu, store_locator (+7 more) | Songoskriti's renderer |

Somvabona defines only 5 unique widgets (`trust_marquee`, `price_buckets`,
`occasion_matrix`, `urgency_rail`, `rating_stars`). Everything else it "renders"
is Songoskriti's component in Somvabona's colors.

## 3. Brand leakage: Songoskriti prints itself on Somvabona's page (live proof)

`SongoskritiFooterSitemap` imports `STATEMENT, NEWSLETTER, PAYMENT_MARKS,
COLOPHON` from `@/lib/themes/songoskriti/footer` (`songoskriti.tsx:62-65`)
and renders them around whatever columns it's given. Live DOM on
`/theme-preview/somvabona` shows `data-fq-node="footer_sitemap-3-index"`
rendering *"Woven in Bangladesh, worn everywhere… Songoskriti… © 2026
Songoskriti"*. Same for `store_locator`: hardcoded `/ph/songoskriti/*`
imagery + `useSongoskritiReveals` motion for any theme that uses the section.

Bonus find: Songoskriti's **own** page renders its footer statement +
newsletter **twice** (theme authors standalone sections AND the renderer
hardcodes the same zones) — brand coupling hurts the owner too.

## 4. Same data, same rhythm

- `demo-catalog.ts:2895`: `somvabona: SONGOSKRITI` alias — Somvabona's rails
  show silk/jamdani products (own-catalog fix exists, unmerged).
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
   `footer_sitemap` et al. resolve the *active theme's* renderer; generic
   stays the fallback. Kills §§2–3 at the root. (audited, unmerged)
2. **Consume `brand` in prominent slots** (CTAs, prices, badges, rules):
   one-line-per-slot change, highest visual ROI. (§1)
3. **Divergent token postures**: different display/body fonts, density
   (`airy` vs `compact`), type scale, radius — currently copy-pasted.
4. **Divergent grammars**: different section vocabularies/order per theme,
   not the same 10-block rhythm with different nouns.
5. **Own catalogs** (fix exists, unmerged) + per-theme demo art (§4).
