# Framique Reports — competitive audit + compliance audit (Sept 2026)

> Part 1 (Biba) and Part 2 (misconduct audit) are independent reports kept in
> one file for a single reading order. Methods and dates are stated per part.

# Part 1 — Biba.in Competitive Audit — What They Have (Sept 25, 2026)

> **Method**: subagent sweep of 18 live pages on `https://www.biba.in/` (ROW locale, `/row`).
> Static HTML + markdown fetch (no browser). Effects marked _(inferred)_ are strongly
> implied by library + markup; everything else was observed directly. Nothing invented.
> **Why this report exists**: our storefront reads as static HTML+CSS — no transitions,
> hover choreography, marquee, or gradients. This is the gap inventory.

## 1. Page inventory (18 visited, 0 blocked)

| #   | URL                                             | Purpose                                                                        |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | `/` → `/row`                                    | Homepage: brand hub + Einstein recommendation rails                            |
| 2   | `/row/kurtas-and-tops/kurtas/`                  | Listing: Kurtas, 670 products, filter/sort lab                                 |
| 3   | `/row/salwar-kameez/`                           | Listing: Salwar Kameez, 1,462 products, 8-tile subcategory nav                 |
| 4   | `/row/collections/saree/`                       | Listing: Sarees (pre-draped), 10 products, premium pricing                     |
| 5   | `/row/salwar-kameez/lehenga-and-skirts-sets/`   | Listing: Lehengas, 42 products, $155–$888                                      |
| 6   | `/row/sale/`                                    | Clearance, 2,579 products, deepest facet set                                   |
| 7   | `/row/new-arrival/`                             | New arrivals AW'26, 434 products                                               |
| 8   | `/row/collections/wedding/`                     | Wedding Splendor edit, 574 products                                            |
| 9   | `/row/off-white-cotton-…/IKT21579SS26OWHT.html` | PDP: kurta, $77.70 (30% off)                                                   |
| 10  | `/row/cart/`                                    | Cart (empty state observed)                                                    |
| 11  | `/row/checkout/?stage=customer`                 | 3-step checkout: Cart → Address → Payment                                      |
| 12  | `/row/login/`                                   | OTP-first auth + password + signup + reset modals                              |
| 13  | `/row/wishlist/`                                | Gated wishlist                                                                 |
| 14  | `/row/contact-us/`                              | Contact + form + corporate block                                               |
| 15  | `/row/about-us.html`                            | Editorial brand story                                                          |
| 16  | `/row/stores/?showMap=true`                     | Store locator (**map broken** — literal "obtain a google maps api key" string) |
| 17  | `/row/shipping-policy.html`                     | Per-region shipping rates + tariff disclaimers                                 |
| 18  | `/row/return-policy.html`                       | No-intl-returns, cancel-before-packed policy                                   |

Gaps in Biba's own IA: no standalone size-guide page (PDP modal only), no countdown/lookbook/video page.

## 2. What makes Biba feel alive (observed patterns)

**Product card hover system (strongest pattern, every listing).** Each tile ships 6–8
angles; hover crossfades front → back/detail, reveals a Quick View button (modal with
size/qty/ATC, no page leave), wishlist heart fills + header count updates via AJAX.
Badges: `Sale` ribbon, `Online Exclusive`, `Only Few Left`.

**Transparent → solid sticky header.** `show-fixed-transparent-header`: transparent over
hero, gains solid background + fixed position on scroll. Persistent nav without losing
hero immersion.

**Mega-menu as merchandising.** Hover opens full-width panel: Category/Collection
columns + right-side campaign photo (rotated nav promos like `nav-kurta-sept17.jpg`).
AW'26/Sale links are crimson `#a72f30` pills.

**Rails everywhere.** "Most Loved", "Recommended For You" (Salesforce Einstein),
"Recently Viewed", "SHOP BY COLOR" swatch tiles — horizontal Slick rails with arrows,
lazy-image fade-in on scroll into view.

**PDP gallery.** Left vertical thumb strip (7 thumbs) + high-priority main stage,
pinch-zoom on mobile, size pills with per-size stock (`32/S (1 Left)`), size-guide
modal, sticky duplicate ATC block on mobile, accordions (details/specs/wash-care/
delivery), trust badges (24h dispatch, free-ship threshold, WhatsApp `wa.me` chat).

**Cart micro-interactions.** AJAX minicart popover + header badge increment on every
Add to Bag (no reload); delete-confirm, address add/edit, coupon modals.

**Auth without friction.** OTP-first (4-box + resend + validation states), password
fallback, guest-checkout escape hatch, inline checkout errors, payment tabs with
per-method failure copy.

**Search that helps.** Typeahead suggestions endpoint, clear + voice buttons, color
swatch tiles as visual facet entry.

**Scarcity microcopy instead of animation.** `Only Few Left`, per-size `1 Left`,
strikethrough pricing — urgency is textual; no timers, no flashing deals.

## 3. What Biba does NOT have (our opening)

No marquee/ticker (single-message dismissible promo bar only). No gradients or
glassmorphism (flat white/black/crimson `#a72f30`). No cart fly-to animation, no
toast system, no skeleton loaders (1px-gif lazy placeholders), no countdown timers,
no PDP video/360/spin (8 stills max even at $888), no shoppable hotspots or lookbook
storytelling, broken store-locator map.

## 4. Stack + style tokens (observed)

Salesforce Commerce Cloud (SFRA); jQuery 3.3.1 + Slick 1.8.1 + lazysizes;
Einstein/CQuotient recommendations; pinch-zoom 2.3.5 (PDP). Fonts: WorkSans (UI),
CrimsonPro (editorial serif), Montserrat (headings/promo), thin-line icomoon commerce
icons + FontAwesome utilities. Imagery: 100% on-model photography, portrait 2:3
(`sw=650&sh=975` tiles, `sw=900&sh=1350` PDP), 6–8 angles per product, studio +
occasional outdoor backdrops. No flat-lay, no ghost-mannequin.

## 5. Top 10 to steal, ranked by wow-factor

1. Card hover image-swap (6–8 angles, crossfade) — biggest alive-signal, zero video cost.
2. Hover Quick View modal — shop without leaving the grid.
3. Personalized rails (Most Loved / Recommended / Recently Viewed).
4. Transparent-to-solid sticky header.
5. Mega-menu with editorial promo image per menu.
6. PDP thumb-rail + pinch-zoom gallery with sticky mobile ATC.
7. Scarcity microcopy system (Only Few Left, per-size counts, badges).
8. OTP-first login + guest-checkout escape hatch.
9. Minicart popover + badge (AJAX, no reload).
10. SHOP BY COLOR swatch tiles as playful facet entry.

---

# Part 2 — Misconduct Audit v2 — measured against AGENTS.md + SYSTEM.md

Date: 2026-09-26. Scope: `c26f30e` (Phase 1b, 8 files), `1dc51f8` (docs-only),
theme static/broken check, known system weaknesses. Method: full-diff read,
rule-by-rule compliance sweep, gate re-run, fresh deploy + live smoke.
No code changed in this audit.

Rulebooks: `AGENTS.md` (WordPress-parity program; architecture rules §92-99;
testing; CircleCI-only) and `SYSTEM.md` §7 (tokens-only, palette, typography,
money helpers, WCAG 2.2 AA, mobile-first).

## Verdict

**No malicious misconduct, no security/design-system sabotage.** What exists is
ordinary rule drift: **1 SYSTEM.md violation, 1 real UX defect, and pre-existing
violations the commit copied rather than created.** Themes are **dynamic, not
static**; the system has **known weaknesses, no hidden breaks**. Details below.

## Deploy state (verified live)

Pulled `1dc51f8`, deployed via `ops/deploy-from-git.sh main`: **DEPLOY OK, all
gates green** (incl. `flamelancer.com` first try). Smoke: `account?tab=wishlist`
200, `cart` 200, Somvabona BN 200.

## A. Agent faults in `c26f30e`, graded by rule

### A1. FAULT — Tokens-only violation (SYSTEM.md §7, exact-match breach)

`StoreHeader.tsx` badge, ×2 (custom + slug branches):
`bg-[#1a1a1a]` + `text-white`. The rule names these patterns verbatim
("No `text-white`, no `bg-[#...]`, no hardcoded hex in components").
Visually consistent (songoskriti brand token is `#1a1a1a`) but breaks dark
mode and per-merchant theming. Fix: token classes.

### A2. FAULT — tab state ignores URL after mount (UX defect)

Both `routes/account.tsx` and `routes/store.$slug.account.tsx`:
`useState(initialAccountTab(search.tab))` reads `?tab=` on first paint only.
Back/forward or in-app navigation to another `?tab=` does nothing until
remount — the same bug class as the preview-frame sync fix. Fix: `useEffect`
syncing state from `search.tab`.

### A3. Minor — duplicated badge JSX

Custom-host vs slug branches duplicate the full Link + Heart + badge block;
only `to`/`params` differ. Copy-paste that will diverge (and already did —
it duplicated the A1 violation twice).

### Clean (explicitly checked, no fault)

- **No client-trusted decisions** (AGENTS.md §92.1): count is display-only;
  wishlist read/toggle go through `customerWishlistFn` / server fns. Session
  probe is client-side `getSession()` gating fetch only — server enforces auth.
- **Money / secrets / RLS / audit**: untouched. No PII beyond a count.
- **`validateSearch` allow-lists tabs**, invalid → `undefined` → `orders`
  default; arrays rejected. Safe.
- **No `server-only` import** (§92.5); ESM; `@/*` alias respected.
- **No dead buttons** (WP-parity rule §27): the commit *removes* a dead
  `<button>` and wires a working Link. Compliant improvement.
- **No fabricated counts** (§27): badge renders live server count, `>0` gated.
- **Tests required**: colocated suites added (9 new tests, all green here;
  commit's 66/66 claim stands). Note: `StoreHeader.test.tsx` leans on
  source-assert style (openly documented) — weak but honest, not gaming.
- **CircleCI task-finish rule**: no `.circleci` change, but `unit-contract`
  runs `bun run test` (full auto-discovery), so the new suites are exercised
  with nothing to wire. Compliant in effect.

## B. Pre-existing faults found while auditing (not this commit's doing)

- **B1. Shared header already violates Tokens-only**: `StoreHeader.tsx:186`
  `text-[#1a1a1a]`, `:196-198` `bg-[#FAF9F7]` / `border-[#eaeaea]`, announcement
  bar `text-[#1a1a1a]` variants. A1 copied the file's own idiom — the file,
  not just the commit, needs tokenizing.
- **B2. Theme-gating inside a shared component (design smell)**:
  `StoreHeader.tsx:150` `slug === "songoskriti"` forks logo, menus, toggle
  placement and child-menu rendering. Themes should plug in via tokens +
  builders, not per-slug conditionals in shared chrome — every new theme
  multiplies these branches. (Checked: songoskriti DOES get a toggle, in its
  announcement bar `:210` — no missing-toggle bug.)
- **B3. `skins.css` raw hex + `!important`** (`songoskriti/skins.css:388-404`):
  borderline vs Tokens-only; theme skin sheets are the gray zone — decide once
  whether skins may carry raw brand hex or must reference tokens.

## C. Are the themes static or broken? Neither.

Spot-verified against the "fully dynamic" claim: token-driven palettes
(`tokens.ts` hex is the legitimate definition site), builder + catalog +
renderer + studio twins resolve, EN/BN renders single-locale live on both
themes after the locale fixes. **Known weaknesses, not breaks**: one EN
eyebrow twin gap in new 7f419d4 content ("OUR STORES"); payment marks are
EN-only brand literals (documented choice); menus are the weakest axis
(songoskriti hard-overrides navigation, no widget consumes dashboard menus —
see REPORT-THEMES.md); no per-theme blog templates (generic fallback).

## D. System-design weaknesses (confirmed, out of this audit's fix scope)

1. Edge per-replica cert store → custom-domain SNI flapping (runbook in
   DEPLOY.md; needs edge SSH to execute the sync).
2. `parseSection` drops `items` for 7 repeater types (needs catalog
   array-field declarations).
3. No shared tab-URL-sync pattern (A2 is the second instance).
4. WP-parity P0: Activate/Delete/Live Preview all present in `ThemesScreen`
   (UI level); server-path depth not audited here.

## Follow-ups (non-blocking)

1. Tokenize badge colors (A1) + shared header hex (B1).
2. Sync account tab state from URL (A2).
3. Deduplicate badge JSX (A3).
4. Decide B3 (skin raw-hex policy) + B2 (theme-plug-in pattern for header).

## Post-audit gate + redeploy (same day)

Pre-deploy checks caught **2 stale test expectations** in
`src/lib/theme-preview-nav.test.ts`: the `7f419d4` songoskriti redesign
changed brand `#8A3B1F` → `#1a1a1a` and reordered the homepage
(hero-first, 20 sections) without updating the pins. Updated to the locked
theme values → **100/100 green**, committed, pushed, deployed as `0b7d4eb`:
**DEPLOY OK, all gates green first try**. No prod-code change needed — the
theme values are deliberate; only the tests lagged. Lesson: theme redesigns
must update preview pins in the same commit.
- Live BN smoke of the redesigned songoskriti homepage: locale machinery
  holds (BN where twins exist), but the new content ships many EN-only
  strings (menu labels, badges, promises, testimonials, journal links).
  Theme-content twin debt — same class as fixed before, owned by theme author.

## Post-audit incident: main did not build (fixed same day)

During the pull/push/deploy cycle, `origin/main` (`4039d51`) failed `bun run
build`: `fb042b2` had `RevisionReviewUi.tsx` (client) statically importing
`support-revision-fns.server.ts`, which the TanStack import-protection plugin
denies — a direct breach of AGENTS.md §92.5 (`*.functions.ts` is the RPC
boundary; `*.server.ts` naming *instead* of `server-only` imports).
Fix (`6ef5305`, deployed, DEPLOY OK all gates): moved the four
`createServerFn` handles into new `support-revision.functions.ts` with
dynamic in-handler imports (repo convention), deleted the orphan server
module, UI imports the boundary. Re-export alone does NOT satisfy the plugin
(it follows the chain) — verified by a second failed build before the move.
Tests 46/46, typecheck/lint clean on touched files; support-desk route 200 live.
Lesson: the `unit-contract` job doesn't build; a build-breaking merge can land
green. Consider a blocking `bun run build` job on every PR.
