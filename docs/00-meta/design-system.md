# Framique Design System — Shared Foundation

Status: Approved baseline (S1 design-skeleton slice)
Owners: Product Design + Frontend Platform
Scope: All pages (merchant admin, storefront themes, builder editor, POS, marketing, platform/auth). Every page-specific plan MUST include a "Design Guidelines" section that derives from this document and adds page-specific intent.

---

## 1. Design Principles (every page, every theme)

1. **Bangla-first, English-safe.** UI copy defaults to Bangla for merchants and storefront customers; typography must render both Bangla (Bengali script) and Latin beautifully on one line. Never break Bangla script across lines for headlines (use `word-break` rules; avoid overflow-wrap on long conjuncts).
2. **Calm density for work, expressive density for storefront.** Admin = high information density with clear visual hierarchy (dense tables, compact controls). Storefront = airy, editorial, product-forward.
3. **Money clarity.** Prices in BDT are the single most important visual element — always prominent, never truncated, consistent decimal rules (0 decimals for product prices, 2 for tax/payout lines), tabular numerals.
4. **Trust in transactions.** Every payment, refund, COD handover, and payout action uses explicit confirmation, clear status color coding, and an audit trail link — no ambiguous green/gray.
5. **Performance is design.** Storefront LCP budget < 2.5s on mid-range BD Android devices over 3G-class networks. No component ships without a performance consideration (see §8).
6. **Mobile-first, thumb-reachable.** Admin works fully on phones (merchants manage from bKash-charged Androids); storefront is primarily mobile. Touch targets ≥ 44×44px, primary actions bottom-anchored on mobile admin.
7. **Accessibility is non-negotiable.** WCAG 2.2 AA minimum everywhere, AAA on critical flows (checkout, refunds, auth). Keyboard-complete admin. `prefers-reduced-motion` respected.

---

## 2. Token Architecture

Three layers, emitted as CSS custom properties (runtime-agnostic — themes consume tokens, not compiled design):

| Layer | Contents | Mutation |
|---|---|---|
| **Primitive** | `--fq-color-bd-teal-50..950`, `--fq-radius-xs..3xl`, `--fq-space-1..16`, `--fq-font-bangla`, `--fq-font-latin`, elevation shadows, motion durations/easings | Never changes; semantic maps to them |
| **Semantic** | `--fq-bg-canvas`, `--fq-bg-surface`, `--fq-text-primary`, `--fq-text-muted`, `--fq-border`, `--fq-accent`, `--fq-accent-fg`, `--fq-success`, `--fq-warning`, `--fq-danger`, `--fq-info`, `--fq-focus-ring`, `--fq-overlay`, status chips, input states | Mapped per theme (light/dark; storefront theme overrides) |
| **Component** | button/input/card/table/stepper/kbd/modal variants consuming semantic tokens | Per-theme tweaks only |

Theming rule: **merchant admin themes and storefront themes only ever override semantic + component layers.** Storefront theme authors get a documented subset (brand palette → semantic mapping) — see 03-storefront and 04-builder.

---

## 3. Color

### 3.1 Brand palette (primitives, single source of truth)
- **BD Teal** (primary identity; evokes river + rickshaw-green commerce): scale `#0d9488`-family (50–950).
- **Rickshaw Red** (secondary accent / sale & urgency): `#e11d48`-family.
- **Bondhu Amber** (warning / COD-pending / attention): `#f59e0b`-family.
- **Mint** (success / paid / delivered): `#10b981`-family.
- **Slate neutrals** (canvas/surface/text): full 50–950 scale.
- Dark mode: semantic maps swap to dark surfaces; BD Teal brightens (e.g. 400-range as accent).

### 3.2 Semantic usage rules
- Success (`paid`, `delivered`, `active`): mint. Warning (`COD pending`, `low stock`, `trial expiring`): amber. Danger (`refunded? no — danger = failed/cancelled/overdue payout`): red. Info (`processing`, `in transit`, `syncing`): BD teal. Neutral (`draft`, `queued`): slate.
- **Status never communicated by color alone** — always pair with icon + text label (WCAG 1.4.1).
- Text contrast ≥ 4.5:1 on canvas; large text ≥ 3:1; UI component borders ≥ 3:1 against adjacent.

### 3.3 Storefront brand mapping
Themes map merchant brand (primary/secondary/background) → semantic tokens via the builder's brand editor; contrast is auto-checked with a live badge ("This color makes text hard to read" / "contrast too low").

---

## 4. Typography

- **Bangla display font**: “Noto Sans Bengali” (variable, free) for headings+body; fallback “SolaimanLipi”/“Kalpurush” for legacy OS. Load via `font-display: swap`, subset Bangla glyphs only, preload the main weight.
- **Latin font**: Inter (admin UI) / system-ui on storefront themes.
- Type scale (fluid, `clamp()`): display 2.5–3.5rem, h1 1.875–2.25rem, h2 1.5–1.875rem, h3 1.25–1.5rem, body 1rem, small 0.875rem, caption 0.75rem. Line-height Bangla ≥ 1.6 (conjunct-heavy glyphs need air).
- **Numerals**: `font-variant-numeric: tabular-nums` on all prices, order numbers, dashboards.
- Admin: dense 0.875rem default, 8px line-height increments. Storefront: relaxed 1rem body, 1.75 line-height.
- No all-caps Bangla (script has no uppercase; use weight+size for hierarchy).

---

## 5. Space, Radius, Elevation, Motion

- Spacing: 4px base scale (`--fq-space-1=4 … 16=64`). Admin density: tables row 44px, controls 36px. Storefront: generous 24/32/48 sections.
- Radius: xs 2, sm 4, md 6, lg 8, xl 12, 2xl 16, full. Admin leans sm/md; storefront leans xl/2xl; **rounded-full only for pills/badges**, never for buttons with multiple words.
- Elevation: 3 shadow levels + 1 overlay. Admin: subtle 1-level shadows (data surfaces), overlay for modals. Storefront: cards at level-1, sticky headers level-2, dialogs overlay.
- Motion tokens: `--fq-dur-fast 120ms`, `--fq-dur-base 200ms`, `--fq-dur-slow 300ms`; easings `--fq-ease-out (cubic-bezier(0.22,1,0.36,1))`, `--fq-ease-in-out`. Enter/exit: fade + 8px rise, 200ms. Page transitions 240ms. **`@media (prefers-reduced-motion: reduce)` → all motion becomes opacity-only, dur ≥ 200ms snap.**
- Storefront hero/product hover: translateY(-2px) + shadow-1 → level-2, 200ms ease-out. Never animate layout properties (use transform/opacity).

---

## 6. Responsive & Breakpoints

- Mobile-first: `<640` base, `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`.
- Admin: sidebar collapses to bottom nav (≤ sm), tables become card stacks with sticky first column, filters become horizontal scroll chips, primary action docks to bottom (≤ sm).
- Storefront: container queries for product cards inside carousels; fluid `clamp()` type; images `loading=lazy` + `srcset`; sticky mobile cart bar.
- Thumb reach: primary/back actions within bottom ⅓ on mobile; FAB only for create actions.

---

## 7. Accessibility (WCAG 2.2)

- Keyboard: full focus visibility (`--fq-focus-ring` 2px offset), logical tab order, skip-to-content on all storefront pages, arrow-key navigation for tables/combo boxes.
- Forms: labels always visible (no placeholder-as-label), errors inline + `aria-describedby`, error summary on submit, `aria-live` for async results.
- Focus trap + Esc + backdrop click for modals; restore focus on close.
- Target size ≥ 24×24 minimum, 44×44 recommended.
- Reduced motion (see §5), color-blind-safe status (icon+text+color), screen-reader text for icons/empty states.
- Bangla: `lang="bn"` on storefront, proper `dir="ltr"` (Bengali is LTR), logical `bdi` for mixed numerals.
- Content: headings hierarchical, tables with `th scope`, no nested interactive elements.

---

## 8. Performance Gates (part of design)

- Storefront LCP: hero image ≤ 250KB (WebP/AVIF), preload font subset, no render-blocking third-party, CLS < 0.1 (reserve aspect ratios).
- Admin: route-level code splitting, virtualized tables > 200 rows, skeletons over spinners for data pages.
- Theme weight budget: CSS ≤ 60KB gzipped, JS ≤ 100KB gzipped per theme.

---

## 9. Anti-Slop / Distinctiveness Checklist (applies to every new page)

Adapted from the design-taste/hallmark/frontend-design practices — **every page spec must pass this before sign-off**:

1. No default purple-blue "AI gradient" hero; use BD Teal + brand palette intentionally.
2. Typography hierarchy exists (no everything-18px-gray). Bangla display font used on at least one display surface per storefront theme.
3. No generic emoji illustrations — iconography from one icon set (custom outline set for admin, themes may use their own).
4. Empty states are designed (illustration + next action), not bare text.
5. Micro-interactions exist (focus states, hover lifts, loading shimmer) but nothing animated without purpose.
6. Real content previews (Bengali text, BDT prices, actual product names) — never Lorem Ipsum in mockups.
7. Consistent radius/space/elevation from tokens — no bespoke values.
8. Dark mode exists for admin + every official theme ships light+dark.
9. Mobile layout is designed, not a CSS afterthought.
10. Accessibility auto-checks (axe) run in CI on every page snapshot.

---

## 10. Per-Page Design Guidelines Template

Each planning doc page must include:

```markdown
### Design guidelines — <page>
- Intent: <one sentence: what the page must feel like>
- Key surfaces: <list of surfaces/components specific to this page>
- Palette emphasis: <which semantic tokens dominate + why>
- Typography: <special type needs: big numbers, Bangla display, tabular nums>
- Density: <admin-dense vs storefront-airy + mobile behavior>
- Motion: <what animates, durations from tokens, reduced-motion note>
- A11y: <page-specific WCAG notes beyond baseline>
- Performance: <page-specific budgets>
- Anti-slop check: <the 1–3 distinctive things that make this page feel Framique, not template>
```

---

## 11. Design Deliverables per Slice (kept in sync with PLAN.md)

- S1: token spec → first admin screens (login, onboarding, dashboard) + first storefront theme (Theme 01 "Char").
- S3/S4: checkout + payment pages (the most sensitive design surface — see 06-payments).
- S6: marketing pages + email templates (Bangla-first copy, brand palette).
- S7: builder editor (canvas/tokens/device preview) + marketplace pages.
- S8: AI support chat widget + fraud review screens.

---

## S7 — Marketing surface (Phase 10.1)

The public site (`/`, `/features`, `/pricing`, `/contact`, `/blog/*`, `/docs/*`)
is its own visual register. It shares the brand palette and the Bangla
typography rules above; it adds motion, a display face and a wider rhythm.
Nothing in this section is allowed to leak into merchant admin or a tenant
storefront: every rule is scoped to `.fq-marketing` or to a named utility.

### Direction

One direction, committed to: **teal-on-warm-paper, editorial, numbers-forward.**

- **Primary** `--color-bd-teal-700` — already AA on white at 12px. Never lighten.
- **Accent** `--color-bondhu-amber-500` for proof, numbers and badges only.
- **Headlines** use the display face; body stays Inter/Noto Sans Bengali.
- **Money and metrics** always `tabular` — the count-up in the numbers band pads
  to the settled width so a figure never reflows its row.
- **No** default Inter-on-purple-gradient, no glassmorphism, no stock hero
  illustration. Backdrops are the `GradientMesh` blobs or nothing.

### Tokens (`src/styles.css`, `@utility fq-marketing`)

| Token | Use |
| --- | --- |
| `--fq-gradient-hero` | hero/section wash, two radial stops, never on text |
| `--fq-gradient-ink` | headline ink gradient, foreground → teal |
| `--shadow-lift`, `--shadow-lift-lg` | card and panel elevation |
| `--ring-focus` | the *only* focus treatment; outlines are replaced, never removed |
| `--fq-rhythm-xs…lg` | every vertical gap on the site comes from this scale |
| `--fq-measure` | 68ch max line length for long-form copy |

### Motion

One engine: **GSAP + ScrollTrigger**, dynamically imported by
`src/lib/motion-engine.ts` and by nothing else. A second animation dependency is
a contract failure (`src/lib/motion.contract.test.ts`).

Layers:

1. `src/lib/motion-policy.ts` — pure rules: intent resolution, stagger and
   marquee schedules, parallax/magnetic clamps, the concurrency budget, the
   engine retry/backoff plan, log shaping. No DOM, unit-tested in Node.
2. `src/lib/motion-runtime.ts` — one IntersectionObserver per observation
   config, one rAF ticker that halts when the tab is hidden or nothing is
   subscribed, one live `prefers-reduced-motion` store, one page-wide budget.
3. `src/lib/motion-engine.ts` — lazy load with timeout, bounded retries,
   jittered backoff, a session circuit breaker and a degraded mode that returns
   `null` so callers render flat.
4. `src/components/public/motion/*` — `Reveal`, `Stagger`, `Marquee`, `Counter`,
   `Parallax`, `MagneticButton`, `GradientMesh`.

Non-negotiables:

- **SSR renders the settled state.** If JS never runs, the page is complete.
- **Intent downgrades.** `prefers-reduced-motion`, Save-Data, `deviceMemory < 2`
  and `hardwareConcurrency <= 2` all resolve to `reduced` (opacity only, no
  translation). A product override may never beat the OS setting.
- **Budget.** At most 14 concurrent JS-driven animations; overflow renders the
  final state instead of queueing.
- **Off-screen and background work stops** — observers unobserve after reveal,
  the ticker is cancelled on `visibilitychange`, the marquee parks on hover,
  focus, tab-hide and scroll-out.
- **Heavy media** (Lottie / Rive / Spline / shader) is `ClientOnly` + dynamic
  import + poster-first + `full` intent only, and is capped by
  `scripts/perf-budget.mjs`.
- **Keyboard.** Every animated control is reachable and operable; the magnetic
  offset is visual only and never moves the hit target more than 10px.

Enforced by `bun run test:contracts` (policy + contract suites) and
`bun run a11y:gate`, which now sweeps a forced `reduced-motion` variant and
fails if any node is left in a pending reveal or any decorative loop is still
running.
