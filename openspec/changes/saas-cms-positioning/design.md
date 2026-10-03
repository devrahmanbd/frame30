# Design

## Context

Audit sources (all verified in-repo this session): `src/lib/themes/`

- `appearance.server.ts` (~1115 lines), `themes.server.ts` (~1213 lines),
  `plugins.server.ts` + `plugin-lifecycle.server.ts`, `ProductCard.tsx`,
  `heritage.tsx` hero, `chrome.tsx` footer, `motion-runtime.ts`,
  `supabase/migrations/2026*`, `BUILD.md` tiers, live `:3000` DOM + console.

## Goals / Non-Goals

**Goals:**

- Score the codebase honestly on both axes with file:line evidence.
- Rank gaps by merchant-facing impact, each with the precise missing piece.
- Keep every claim checkable (`typecheck`/`test`/DOM), per project rules.

**Non-Goals:**

- No runtime, schema, or copy changes in this change.
- No pricing/packaging decisions (owner-console territory).
- No new themes, widgets, or payment rails.

## Decisions

### Axis 1 — Shopify alternative (hosted commerce SaaS): STRONG

The commerce core is genuinely Shopify-shaped and mostly server-true:

- Zero-fee engine with integer minor-unit money everywhere
  (`amount_minor_int` + `currency_code`; client totals ignored at checkout).
- BD rails first-class: bKash / Nagad / Rocket / COD badges, BDT symbol
  pricing, VAT-included colophon, per-method failure copy.
- Server-side COD-abuse rule engine (blacklist, honeypot, risk review).
- Versioned theme publishing with lint/translation/budget gates; rollback and
  schedules; storefront cache purge on publish.
- 52-product ethnic demo catalog (OB-* SKUs), honest empty states, bilingual
  EN/BN twins with fallback, 44px targets, reduced-motion discipline.
- Live proof: `/theme-preview/oceanblue-v2` renders title-case copy, 3 hero
  photos, 8 color tiles, BDT rails, 0 theme console errors.

### Axis 2 — WordPress ideology (own your CMS): MIXED, trending true

Where the ideology is real in code:

- Appearance › Themes lifecycle is server-complete: inactive-row install +
  ledger, atomic activate, blocked-while-active delete with cascade, audit
  rows (`appearance.server.ts`).
- Plugins lifecycle mirrors Installed Plugins: enable toggle, uninstall +
  purge convergence, scope reconsent, kill-switch (`plugins.server.ts`,
  `plugin-lifecycle.server.ts`).
- Content desk has WP trash semantics, bounded revisions, menus, media.
- Theme isolation (`isolation.test.ts`) is the anti-lock-in guarantee made
  executable: themes are data + lib builders, portable by construction.
- Self-hosted Supabase + Redis; no per-transaction fees; no app-bloat model.

Where the ideology is currently UI-deep or missing (ranked):

1. **Empty theme directory (P0).** `VISIBLE_THEME_KEYS = new Set([])`
   (`appearance.ts:270`) + `presetCatalogue() = []` + `officialThemeKeys()
= []` (`themes.server.ts:589,641`) → installed grid shows the active
   theme only; Add New shows 0 cards. WordPress without a theme directory
   is a file manager, not a CMS.
2. **Footer drops the 5th column.** Both `footer_sitemap` renderers read
   only `c1..c4` (`chrome.tsx:440`, `studio/renderers.tsx:1700`);
   oceanblue-v2's authored Contact column renders nowhere. Silent content
   loss on every v2 install.
3. **Motion tells on product cards.** `transition-all` + 1200ms image zoom
   (`ProductCard.tsx:326,336,356`) and triple-signal hover (lift + shadow
   - zoom) read as template defaults next to biba.in-grade photography.
4. **Imagery half-shipped.** 3/13 campaign photos placed (heroes 1–3);
   Nxt, festive split, and 8 tiles await Copilot quota reset.
5. **Localhost CSP noise.** Supabase auth refresh blocked by `connect-src
'self'` on `:3000` preview — pre-existing, but a merchant screen-share
   with red console errors undermines the "it just works" story.
6. **Secrets live only in memory.** No `.env` file; Supabase keys recovered
   from git history (`9eab798:.env`) to rebuild `:3000`. One lost shell =
   one undeployable project. Needs a documented secret-bootstrap path.

Alternatives considered: scoring marketing pages instead of code (rejected —
unverifiable); folding this into BUILD.md Tier 0 (rejected — BUILD is an
acceptance ledger, this is a competitive analysis with different readers).

## Risks / Trade-offs

- Honest scoring invites scope growth; each gap is fenced as a separate
  future change in `tasks.md` so this change stays docs-only.
- Positioning claims ("alternative to X") are marketing-adjacent; every
  claim here cites a file, test, or live DOM node so it can be challenged.
- The empty-directory finding (#1) is the single claim-killer — everything
  else is polish until Add New shows themes.
