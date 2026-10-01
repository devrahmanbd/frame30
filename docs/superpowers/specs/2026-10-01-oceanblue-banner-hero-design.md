# Oceanblue Biba-Style Banner Hero — Design Spec

**Status:** proposed for implementation (user approved: "Full biba clone", Approach A — new `banner` skin) · **Date:** 2026-10-01
**Scope:** oceanblue hero presentation only. Reference: biba.in homepage hero (slick-carousel banner). Follows the nav-fix (`2bf8924`, pushed, not deployed).

## 1. Problem & decision

Oceanblue's hero today is the `hero_carousel` widget with skin `split` — an editorial copy-left/art-right grid that crossfades 3 slides (`key={current}` remount) with thin progress tabs, autoplay 5000ms, and **no arrows or dots anywhere** (`HeroSlideControls`, `heritage.tsx:156`, returns `null`).

Biba.in's hero (from the saved capture) is materially different:

- slick-carousel, `slidesToShow:1, arrows:true, dots:true, autoplay:true, autoplaySpeed:4000, infinite:true`
- full-width fixed-aspect banner (1440×700 desktop ≈ 2:1, 800×1494 portrait mobile)
- horizontal slide transition; each slide a single linked image

Approved decisions (clarifying Q&A):

1. **Full biba clone** — full-width banner slides at fixed aspect + visible prev/next arrows and dot pagination + horizontal sliding + 4s autoplay, infinite.
2. **Image + text overlay** — keep CMS bilingual headline/subhead/CTA copy overlaid on the photo (biba's copy is baked into images; our defaults are imageless and must stay meaningful).
3. **2:1 desktop, 4:5 mobile** — one merchant photo per slide, `object-cover` adapts the crop; no separate mobile art.
4. **Approach A** — a new `banner` skin on the shared `hero_carousel` widget; other themes untouched.

## 2. Skin vocabulary contract

`src/lib/builder-ast.ts`:

- `WIDGET_SKINS.hero_carousel` (`:600`): `["split", "fullbleed", "minimal"]` → `["split", "fullbleed", "minimal", "banner"]` — **appended last**: the first-option convention keeps the global default `split` (`DEFAULT_WIDGET_SKIN`, `:618`), so songoskriti/heritage/somvabona renders are unchanged. `SKIN_FIELD` (`:647`) derives studio options from this array — the inspector gains "banner" for free.
- `resolveSkin` (`:637`) then accepts `"banner"` at `heritage.tsx:400`.

`src/lib/themes/oceanblue/skins.ts`:

- `OCEANBLUE_SKIN_SETS.hero_carousel` (`:30`): → `["banner", "split", "fullbleed", "minimal"]` — **banner first** so oceanblue's own first-option default is banner and `resolveOceanblueSkin` (`:71`) accepts it instead of falling back to split.
- `OCEANBLUE_WIDGET_DEFAULTS.hero_carousel` (`:48`): `{ skin: "split" }` → `{ skin: "banner" }`.
- `OCEANBLUE_SKIN_DEFAULTS.hero_carousel` (`:60`): `"split"` → `"banner"`.
- Doc comment (`:8`, "split hero") → "banner hero".

## 3. Widget render changes (`src/components/builder/heritage.tsx`)

The `HeroCarousel` shell (`:374–633`) stays shared: autoplay interval + reduced-motion gate (`:422–430`), pause on hover/focus, keyboard ←/→/Home/End, touch swipe (±40px), live region "Slide n / N", empty-slides guard, `useHeroMotion` scope. Only presentation forks by skin — a new banner branch joins the existing split / (fullbleed+minimal) branches.

### 3.1 Banner branch (new, `skin === "banner"`)

- **Track layout** (replaces keyed crossfade for this skin only):
  - Outer: `relative w-full overflow-hidden aspect-[4/5] md:aspect-[2/1] bg-background` — sits in normal flow, **no** `-mt-[68px]` header overlap (unlike `fullbleed`).
  - Track: `flex h-full w-full` with `transform: translateX(-{index * 100}%)`, `transition-transform duration-500 ease-out`; each slide `relative h-full w-full shrink-0`.
  - **Seamless infinite**: render slides + a duplicate of slide 1 at the end; on landing on the clone, snap back to index 0 with the transition disabled (and the mirror path for prev). Under reduced motion the transition is disabled entirely (instant jumps).
  - Slide 1 art: `loading="eager"` + `fetchPriority="high"`; others `lazy` (as today).
  - Imageless fallback: `WeaveMotif` fills the slide frame (existing art fallback), banner-shaped by the aspect container.
- **Copy overlay** (bottom-left, per slide): scrim `bg-gradient-to-t from-[var(--theme-ink)]/70 via-[var(--theme-ink)]/25 to-transparent` over the art; then `data-hero-eyebrow` caption → `data-hero-headline` (`Heading`, bn lang-gated) → `data-hero-sub` → `data-hero-cta` with the **solid `bg-foreground` CTA** (split's button classes — readable on any photo; no raw `uppercase` in new classes; copy keeps `fq-caps` where already used).
- **Controls** (only rendered when `slides.length > 1`):
  - New `BannerControls` component: prev/next arrow buttons pinned to the left/right edges (vertically centered, 44px targets, translucent ink background, `backdrop-blur`, `aria-label` = existing bilingual `prevLabel`/`nextLabel`), plus dot buttons following split's proven a11y pattern (`role="tablist"`/`role="tab"`, `aria-selected`, 44px target, active dot wider).
  - **Dot position:** bottom-right on mobile (`right-4 bottom-4`), bottom-center from `md:` up (`md:left-1/2 md:-translate-x-1/2`) — refinement of the approved "bottom-center" so dots never collide with bottom-left copy on the 4:5 mobile crop.
  - `HeroSlideControls` stays `return null` — `fullbleed`/`minimal` (and every theme using them) keep today's control-free behavior. BannerControls is consumed only by the banner branch.
- **Atmosphere:** no aurora layer (the wash gate is `skin === "split"` today, `:489` — banner joins fullbleed/minimal in skipping it; photo + scrim carries the visual).
- **SSR/editing:** initial `translateX(0)` is pure style output — safe under `renderToStaticMarkup`; builder preview and `editing` affordances are unchanged.

### 3.2 Unchanged

- Split branch (byte-identical), `HeroSkinSlide` fullbleed/minimal branches, all non-hero widgets, `fq-enter-fade` behavior on other skins, existing `data-hero-*` part hooks (studio data-part contract).

## 4. Theme data (`src/lib/themes/oceanblue/homepage.ts`)

- `:35` `skin: "split"` → `skin: "banner"`.
- `:74` `autoAdvanceMs: 5000` → `4000` (biba cadence).
- Slide rows (3 slides, bilingual copy, collection permalinks) untouched.

## 5. Tests

Red-first where a slot exists; all under `src/lib`/`src/components` next to the code:

| File | Change |
| --- | --- |
| `src/lib/widget-skins.test.tsx` | `resolveSkin("hero_carousel", "banner") === "banner"` in the closed-vocabulary describe (`:127`); new banner render: aspect classes, `BannerControls` arrows (`Previous slide`/`Next slide`), dot tablist, track present, **no** `fq-theme-aurora`; existing split/fullbleed/minimal cases untouched |
| `src/components/builder/heritage-contracts.test.tsx` | banner case: scrim gradient class + overlay parts present; split atmosphere cases (`:114`, `:134`) untouched |
| `src/components/builder/hero-locale.test.tsx` | banner branch renders bn headline/subhead/CTA under `bn` and en copy under `en` (all slides now in the DOM — assert per-slide gating, not absence of bn siblings) |
| `src/lib/themes/oceanblue/skins.test.ts` | sets/defaults list banner first; flip the three pinned `skin: "split"` literals (`:36`, `:67`, `:113`) to `banner`; `resolveOceanblueSkin("hero_carousel", "banner")` passes through; unknown value now falls back to `banner` |
| `src/lib/themes/oceanblue/preview.test.ts` / `wiring.test.ts` | section lists unchanged (`hero_carousel` still first); they do not pin the skin literal (grep verified) — no edit expected |

Surfaces **verified during spec review — no edit needed**: `studio/catalog.ts:635` (defaults `{ slides: [], autoAdvanceMs: 5000 }`, no skin literal), `studio/controls.ts:2138` (slides repeater only — the skin control comes from `SKIN_FIELD` in `builder-ast.ts:4654`, auto-derived from `WIDGET_SKINS`), `widget-help.ts:565` (widget-level help, no skin list), `theme-imports.server.ts` (`importThemeSlides` copies slide data only; zero `skin` references in the file).

## 6. Explicit non-goals

- No changes to `split`, `fullbleed`, `minimal` visuals or behavior; no other theme's homepage/skins touched.
- No new widget key, no `SectionType` additions, no migration/registry row changes, no homepage prop shape changes.
- Header/topbar/nav chrome (both shipped fixes) untouched.
- No deploy and no CHANGELOG dated entry — only on explicit user request.
- No `@/components/*` imports from theme files (isolation guard); no raw `uppercase` in new storefront classes.
- Biba assets/branding/copy — never copied; layout/behavior reference only.

## 7. Verification plan

1. `bun run typecheck` — clean.
2. `bun run test` — full suite green (4830 baseline + new banner tests; skin-set changes must not regress songoskriti/heritage expectations).
3. `bun run test:contracts` — 258 baseline stays green.
4. `bun run lint` — touched files clean; repo-wide stays at the 828 pre-existing baseline (net 0 — never claim "clean").
5. Prod build: `VITE_SUPABASE_URL=http://dummy.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=dummy bun run build`.
6. Browser check (`http://localhost:3000/theme-preview/oceanblue`, preview rebuild if needed; `emulate` viewport + `evaluate_script` — screenshot tool times out):
   - banner aspect 2:1 at 1440/1000, 4:5 at mobile viewport; horizontal slide animation on autoplay (4s) and on arrow/dot click; seamless wrap 3→1 without a visible jump;
   - arrows + dots visible, ≥44px, keyboard ←/→ works, hover pauses autoplay;
   - EN↔বাং switches overlay copy; imageless default shows WeaveMotif filling the banner;
   - songoskriti preview hero still renders split with no arrows/dots; zero console errors.
7. Commit style: `feat(theme): add banner skin — biba-style hero carousel for oceanblue` with bullet body; CHANGELOG only with a deploy.

## 8. Risks & mitigations

- **Other themes regressing** — mitigated by appending `banner` last in core vocab (global default unchanged), banner-only controls branch, and untouched split/fullbleed/minimal tests; songoskriti skins tests are the canary.
- **Seamless wrap complexity** (clone + snap-back interacting with autoplay state) — isolate in the banner branch; reduced-motion path is transition-less so it cannot desync on snaps; if wrap snaps prove flaky, fall back to a plain modulo jump (visually acceptable) and note it in the plan.
- **`useHeroMotion` load timeline vs track** — motion scope is the section; verify the timeline doesn't transform the track itself (it animates `data-hero-*` children). If it does, scope it off the track container.
- **Overlay legibility on bright photos** — scrim `from-/70 via-/25` + solid CTA button; same pattern the split CTA already relies on.
- **CLS** — aspect-ratio boxes reserve height before images load; first image eager, rest lazy.
