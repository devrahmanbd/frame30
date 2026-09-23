# Task 6 Report — Verification + gates + PR

- Branch: `songoskriti/t6-verify` (in `/tmp/opencode/songoskriti`, never main)
- True baseline: merge-base with upstream = `d95d32a` (local `main` ref `ba620a1`
  is stale; `origin/main` = `ce13b55` after fetch. The 291-file diff vs the stale
  local ref is other merged workstreams, NOT songoskriti. Songoskriti stack =
  8 commits `ec617eb..15903f3`, 31 files — verified via
  `git diff d95d32a..HEAD --name-only`.)
- Dev server: `vite dev --port 3208` (own instance, port 3200+), verified
  `pwd` under `/tmp/opencode/songoskriti` for every run.
- Status: **DONE_WITH_CONCERNS** (numeric gates pass; strict console-zero and
  strict 44px fail on pre-existing/blocked items detailed below — no code
  changed in this task, verification only)

## Gate table (spec §6, baseline = PR merge-base `d95d32a`)

| Gate | Result | Evidence |
|---|---|---|
| Preview screenshots desktop + mobile | PASS | `docs/superpowers/songoskriti-evidence/t6-desktop-1440.png`, `t6-w320/375/414/768.png` (emulated widths; headless window floors at 500px outer so `emulate` viewport override was used — `innerWidth` verified 320/375/414/768) |
| Zero console errors on preview route | **FAIL (attributed)** | 5× 404 for `/ph/songoskriti/prod-*.png` (Task 3 assets ungenerated, gate RED 14/15 — blocked on owner key rotation) + 1 hydration `nonce=""` vs `nonce="ZSDp..."` (**pre-existing**: reproduced on `/` landing, untouched by songoskriti) + 5× `[tanstack-router]` code-split warns (**pre-existing**, dashboard routes) |
| a11y ≥ 90 | PASS 93 desktop / 97 mobile | `t6-lh-desktop.json` / `t6-lh-mobile.json` (chrome-devtools `lighthouse_audit`, navigation mode) |
| CLS < 0.1 | PASS 0.014 desktop / 0 mobile-width | buffered `layout-shift` observer, post-reload + 4s settle |
| LCP < 2.5s | PASS 340ms desktop / 372ms mobile-width | buffered `largest-contentful-paint` observer. Lab conditions: dev server, no throttling — noted as mobile-simulated/infra-bound per spec parenthetical |
| 4-width matrix: no h-scroll | PASS all widths | `documentElement.scrollWidth == innerWidth` at 320/375/414/768; zero offenders. (768 shows snap-rail `LI.shrink-0` track nodes wider than viewport — clipped by design inside `overflow-x-auto` rail, no page leak.) Snapshot + screenshot per width committed |
| 4-width matrix: CTA single-line | PASS all widths | every `[data-hero-cta] a` + `a[class*=min-h]` renders `getClientRects().length === 1`, incl. hero `Shop festive` (`whitespace-nowrap`) |
| 4-width matrix: targets ≥ 44px | **MARGINAL** | all CTA/button heights 44–48 (`min-h-11/12`); 3 elements under 44 wide: header search icon link 42×44, account icon link 42×44 (generic `search_command`/`account_cart` chrome — shared, out of scope to resize here), preview-frame `Preview controls` 40×40 (preview chrome, not theme). Inline text links (17px) exempt per WCAG 2.5.8, same exemption as repo `responsive-sweep.mjs` |
| vitest touched suites (Tasks 1–5) | PASS 497/497 | wiring 4 + widgets 16 + catalog 400 + songoskriti.test 19 + phase4 11 + marketplace-songoskriti 5 + theme-preview-nav 8 + motion 10 + themes/appearance 24 (appearance lives at `src/lib/themes/appearance.test.ts`, not `src/lib/appearance.test.ts`) |
| `tsc --noEmit` zero NEW vs merge-base | PASS with 1 documented surfaced latent | full-output sorted diff `d95d32a` → HEAD: **−3 / +1** (228 → 225 error lines). Removed: 3× `hero_carousel` not-assignable (Task 2 fix). Added: `heritage.tsx(905,3)` `department_grid` excess-property — pre-existing latent the Task 2 union addition made visible, heritage-pack owner scope (documented since Task 2). Per-file filter: **zero errors in any songoskriti-owned file** |
| `vite build` exit 0 | PASS | `✓ built in 2.54s`, exit 0 |
| Branch-only PR, no main push, no deploy | PASS | PR `songoskriti/t6-verify` → `main` (see below); no deploy |

## Live verification notes

- `/theme-preview/songoskriti` renders end-to-end on the dev server: masthead +
  menubar (New Arrivals/Bestsellers/Eid & Festive/Wedding/Gifting), announcement
  marquee, hero slide 1 (EN + `_bn` headline, CTA), 6 category circles, occasion
  finder, product rail (6 products, BDT minor-unit prices, discounts), newsletter
  + footer. A11y snapshot saved per width (5 files).
- Product/hero/category PNGs are absent (Task 3 RED): 5 rail `<img>` 404
  (broken-image icons in screenshot region below hero — hero art panel itself
  renders the weave-lattice SVG fallback correctly; circles render initial
  tiles; kids product correctly uses `/api/public/ph` fallback). No `onError`
  fallback exists in the generic `product_rail` renderer — flagged as a
  follow-up, NOT fixed here (generic renderer = shared engine surface).
- Storefront live-install smoke via Appearance/seed was NOT run: no Supabase/DB
  in this environment (no `SUPABASE_*` env). Covered instead by Task 5's
  7-point code-path smoke (all PASS) + this task's live preview render of the
  same AST + demo catalog. Live DB install remains deferred with owner order.
- Copy gates observed (not asserted by a test — none exists): sentence case
  throughout; `_bn` twins on hero/finder/craft/testimonials; no invented
  metrics (craft story carries no numbers). **Spec naming gap:** spec §2/§4
  require a literal `cta-primary` anchor per section with a grep test — the
  codebase convention is `fq-cta-primary`/`bg-primary` + `min-h-11/12` and no
  such class or test exists in builder code. CTAs meet the measurable intent
  (single-line, ≥44px height, one primary action per section) but the literal
  gate was never implemented by Tasks 1–5.

## Lighthouse failure attribution (a11y still ≥ 90)

- `aria-prohibited-attr` (serious, 1 node): runtime `aria-label` on
  `p[data-hero-headline][lang=bn]` — NOT in SSR source (`heritage.tsx:172-180`
  has no aria-label); added client-side, almost certainly SplitText
  `aria:"auto"` from the Task 5 motion controller. Score impact absorbed
  (93/97) but should be fixed by the motion owner (configure SplitText aria
  handling or move the accessible name to a role-appropriate wrapper).
- `document-title` / `meta-description`: restored preview route sets no
  `<title>`/meta (restoration gap from `dddfdc2^`, SEO 83). Preview-only
  surface; document for owner triage.
- `errors-in-console`: the launch-blocking 404s + pre-existing hydration
  mismatch above.

## Remaining gaps (owner actions)

1. **Task 3 image generation still waits on owner key rotation** (`GEMINI_API_KEY`
   env-only). Fallback assets in use until then: hero ×3 → weave-lattice SVG
   panel; categories ×6 → initial-letter tiles; products ×5 → **broken `<img>`**
   (no renderer fallback); kids product → `/api/public/ph` SVG (correct).
   After rotation: `node scripts/gen-songoskriti-assets.mjs &&
   node scripts/songoskriti-assets-check.mjs` → GREEN (14/15 pending).
2. Tsc `heritage.tsx(905,3)` + 7 missing builder-ast keys (`department_grid`,
   `heritage_story`, `textile_showcase`, `editorial_banner`,
   `testimonial_carousel`, `marquee_strip`, `story_trunk`) → heritage-pack owner.
3. Hydration CSP-nonce mismatch on ALL routes → platform owner (pre-existing).
4. Search/account icon links 42px wide → header-chrome owner if strict 44px is
   required (2px short, shared component).
5. Live DB install smoke (Appearance → publish → demo import) → needs owner
   order + provisioned Supabase.

## Hygiene

- `node_modules` symlinked from `/opt/frame28` for runs; removed after (both
  worktrees). Scratch worktrees `/tmp/opencode/base-main` (stale-ref
  experiment) and `/tmp/opencode/base-true` removed after use. Dev server
  stopped. Sorted tsc evidence kept at `/tmp/opencode/tsc-t6-{truebase,now}*.txt`.
- `progress.md` 1-line Task 5 note + `task-*-report.md` siblings left
  untouched/un-staged per convention. `task-6-report.md` committed (PR task
  needs it in-branch for review).
- No metrics invented anywhere in this report: every number above names its
  command/source.
