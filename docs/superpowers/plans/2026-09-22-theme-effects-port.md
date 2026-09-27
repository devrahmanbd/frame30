# Theme Effects Port (atmosphere + motion controls) — Implementation Plan

> **For agentic workers:** implement task-by-task in this session. Steps use checkbox (`- [ ]`) syntax. Progress is tracked in this file's task states (NOT `progress.md` — owned by another loop, do not touch).

**Goal:** Marketing-grade atmosphere and motion controls available to themes and the builder: hero wash, glass card, line-reveal, all theme-tinted, reduced-motion safe.

**Architecture:** Port the `.fq-site` effect utilities into theme scope as token-driven variants (no violet/magenta/teal leakage; tints derive from `--theme-brand`/`--theme-accent`), expose toggles in the section style panel, document in `creation.md`. No new deps, no GSAP additions (already a dependency; choreography mounts via existing islands).

**Tech Stack:** Tailwind v4 `@utility`, existing `advancedAttrs`/`sectionStyle` prop pipeline, builder panels.

**Spec:** This file. Prior art: `fq-heritage-aurora` (styles.css), `advAnimation` (builder-advanced.ts), `MOTION_TOKENS` (motion-policy).

## Global Constraints

- Static gradients only for washes (no animation loops) → inert under `prefers-reduced-motion` by construction; any animated effect gates on the existing reduced-motion blocks.
- Token-driven: hard-coded hues banned outside the two heritage anchors (`#c45d3e`, `#d9a441`, `#8a3b1f` already approved); everything else `color-mix` from theme vars.
- TDD, targeted suites green, full-suite baseline diff zero-new.
- Files are split per task with no overlap; respect the split.

## Review Focus

- Wash layer intercepting clicks (must be `pointer-events-none`, test pins it).
- Animated variant ignoring reduced-motion.
- Panel toggle writing props the renderer ignores (round-trip test pins it).
- Token fallback when theme omits brand/accent (must degrade to current look).

---

### Task 1: Theme-scope effect utilities + hero integration

**Files:** `src/styles.css`, `src/components/builder/heritage.tsx`, `src/components/builder/heritage-contracts.test.tsx`
**Produces:** `fq-theme-aurora` (brand/accent-tinted wash), `fq-theme-glass` (card elevation), `fq-theme-linereveal` trigger class; hero uses aurora variant prop (`atmosphere: "wash" | "none"`, default `"wash"`).

- [ ] Step 1: extend the aurora test to cover `none` (renders no wash div) and glass class passthrough on `editorial_banner` (`surface: "glass" | "card"`, default `"card"`).
- [ ] Step 2: run tests, watch fail.
- [ ] Step 3: implement utilities (static gradients, `color-mix` from `--theme-brand`/`--theme-accent` with heritage fallbacks) + hero `atmosphere` prop + banner `surface` prop.
- [ ] Step 4: green + commit `feat(themes): theme-scope effect utilities`.

### Task 2: Builder panel toggles

**Files:** section style panel (discover: start at `src/components/builder/FormsPanel.tsx`, follow to the style/advanced panel editing `adv*`/`bg`/`radius` props), plus its test file if present else extend `heritage-contracts.test.tsx` round-trip.
**Produces:** atmosphere + surface controls writing the exact prop keys Task 1 reads.

- [ ] Step 1: test that panel output props round-trip through `advancedAttrs`/`sectionStyle` (or renderer) unchanged.
- [ ] Step 2: watch fail. Step 3: implement. Step 4: green + commit `feat(builder): effect toggles in style panel`.
- [ ] Constraint: touch ONLY panel files; never `styles.css` or renderers (Task 1 owns them).

### Task 3: Docs + example + gates

**Files:** `docs/themes/creation.md` (effects chapter), example package if `docs/themes/example-studio.theme.json` exists (extend), `src/lib/theme-package.test.ts` (fixture validity).
**Produces:** designer-readable effects guide; example stays validator-clean.

- [ ] Steps follow the same TDD loop; commit `docs(themes): effects guide`.
