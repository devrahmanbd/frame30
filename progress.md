# Progress — Biba-Parity Motion Program (Sept 25, 2026)

> Source: `REPORT.md` (18-page Biba.in audit). Goal: kill the "static HTML+CSS"
> impression. Every item below is observable motion or interaction, verified in
> browser before marked done. Asset policy: **images via ChatGPT, icons via
> https://opensvg.dev/icons** (thin-line commerce set to match Biba's icomoon feel).
> Motion respects `prefers-reduced-motion`; BDT/en-BN rules from AGENTS.md still apply.

## Phase 1 — Product card aliveness (highest wow per cost)

- [ ] Card hover crossfade across 4+ angles (front → back/detail), CSS-only, 250ms.
- [ ] Quick View button reveal on hover/tap → modal with size/qty/ATC, no page leave.
- [ ] Wishlist heart fill + header count update (optimistic, no reload).
- [ ] Badges: Sale ribbon, Online Exclusive, Only Few Left (real stock thresholds only).

## Phase 2 — Header, nav, hero

- [ ] Transparent → solid sticky header on scroll past hero.
- [ ] Mega-menu: full-width panel, category columns + rotating campaign photo per menu.
- [ ] Hero carousel: autoplay 6s, swipe, dots, Ken Burns on active slide (no video yet).
- [ ] Dismissible single-message promo bar (slide-up entrance, like Biba's campaign banner).
- F2 AI imagery drop-in — DONE 2026-09-29 (commit 43a989b): 6 fresh MAI-Image-2.6-Flash photos generated live in owner-authenticated playground session (MeiGen-structured prompts: subject+style+lighting+palette+composition, no text), same filenames = zero rewiring (hero-newin, hero-wedding, craft-loom, occ-women/men/kids, JPEG q85); SOURCES.txt provenance updated; originals backed up in /tmp/retired-theme-orig/; theme suites 51/51 green post-swap.

## Phase 3 — Rails, PDP, cart

- [ ] Rails: Most Loved / Recommended / Recently Viewed + SHOP BY COLOR swatch tiles.
- [ ] PDP: vertical thumb rail, pinch-zoom on mobile, per-size stock pills, size-guide
      modal, sticky mobile ATC bar, trust badges (24h dispatch, free-ship threshold).
- [ ] Minicart popover + badge increment on Add to Bag (AJAX, no reload).
- [ ] Lazy-image blur-up reveal on scroll into view (replace blank placeholders).

## Phase 4 — Beats Biba (gaps they left open)

- [ ] Scrolling marquee strip (festive ticker — Biba has none).
- [ ] Terracotta/cream gradient system + glassmorphism on promo surfaces (Biba is flat).
- [ ] PDP occasion video / 360-spin for wedding-tier products (Biba: stills only).
- [ ] Toast notification system for cart/wishlist/coupon feedback (Biba: none).
- [ ] Skeleton loaders for rails and grids (Biba: 1px-gif placeholders).
- [ ] Shoppable lookbook with hotspots for wedding/festive edits.
- [ ] Working store locator map (theirs renders an API-key error string).

## Phase 5 — Friction killers (copy Biba's flow wins)

- [ ] OTP-first login modal (4-box + resend + password fallback) + guest checkout.
- [ ] Search typeahead with suggestions, clear + voice affordances.
- [ ] Scarcity microcopy pass: per-size `1 Left`, strikethrough pricing, real thresholds.
- [ ] Checkout: stepped progress header, inline validation, per-method failure copy.

## Phase 6 — Nakhrali layout mapping (28 homepage sections inventoried Sept 25)

> Source: subagent inventory of nakhrali.com homepage (trust strip → footer).
> Rhythm to copy: USP strip → 5-slide hero → category split → product rail →
> interstitial banner → product rail … → UGC wall → everyday rails → impulse
> jewellery → blog → testimonial marquee → SEO block → footer. Map onto theme
> sections; ChatGPT images for banners/tiles, opensvg.dev thin-line icons.

- [ ] USP auto-slider strip (shipping threshold + fit guidance + client count — real
      numbers only, no invented counts).
- [ ] 5-slide full-bleed hero, one revenue category per slide + Prev/Next + autoplay.
- [ ] Intent-splitter 2-tile grid (Nakhrali: handloom vs party; ours: cotton vs festive).
- [ ] Editorial product rails with storytelling headings ("Signature Sarees: Handloom
      Edition" pattern) + badge stacking (Best Seller / New / Restocked / Haldi Pick).
- [ ] Card microcopy line: ship-time promise under every price ("Ships in 4 Days" →
      ours: "Dispatched in 24h" / "COD available" — from real fulfilment config).
- [ ] 11-tile cross-sell mosaic (lateral jumps without search) + tag-driven style grid
      (silhouette shopping: corset/anarkali/cape equivalents).
- [ ] Static interstitial banners between rails (palate cleanser, one CTA each).
- [ ] High-AOV bridal rail with lead-time framing (45-day made-to-order honesty).
- [ ] Jewellery attach rail ($3–15 impulse range) + fit-solver tiles (blouse/find-your-fit).
- [ ] UGC mosaic wall ("She Wore …") + testimonial marquee (~50-quote risk-reversal wall).
- [ ] Blog 4-card grid (styling education: office/wedding/fit guides) + SEO long-form
      block with Read-more expander.
- [ ] Footer: newsletter + app badges + WhatsApp stylist float + full policy stack +
      cart drawer + Track Order modal.

## Gates per phase

`bun run typecheck` → `bun run test` → eslint on touched files → Chrome MCP verify
(snapshot + screenshot + no console errors) → commit + push + deploy → verify live on
flamelancer.com. No phase marked done without screenshot evidence.

---

# Phase 7 — v2 rebuild in isolated worktree (2026-09-30, branch theme-v2 @ ~/frame30-v2)

Reason: main tree is a battleground (concurrent lane reverting/deleting mid-work, origin/main rewound to a015ea7). Rebuilt off origin/main in an isolated worktree. Commits: 9e3bf17 (full v2) + 28d13ec (contract-test alignment).
Scope: tokens/homepage/chrome/preview/skins/skins.css/index/types + mega.tsx + locator.tsx + 5 test files + theme-widgets override + nav test blocks. Gates: tsgo 0, full suite 4841 green, contracts 258, eslint clean, 17/17 composition render. :3001 HTTP preview 404 is environmental (old-base dev server lacks Supabase env; untouched songoskriti + root fail identically) — NOT a theme defect. NOT PUSHED (standing rule).

---

# Phase 8 — v2 rebuild complete in isolated worktree (2026-09-30)

Branch theme-v2 @ ~/frame30-v2 (NOT /tmp — /tmp worktree was wiped with
uncommitted work inside; never keep uncommitted work there). Commits 9e3bf17
+ 28d13ec + 534f1ee. Main tree untouched (theme stays deleted there).
Gates on final state: tsgo 0, full suite 4841 passed / 0 failed (372 files),
contracts 258, eslint clean, 18/18 sections render via production
SectionRenderer. :3001 HTTP preview 404 is environmental (old-base dev
server lacks Supabase env; untouched songoskriti + root fail identically).
NOT PUSHED (standing rule) — needs explicit push permission, then deploy +
live eyeball (desktop + 390px mobile) + mobile viewport pass.
