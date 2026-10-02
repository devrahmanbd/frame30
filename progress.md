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

---

# Phase 9 — Oceanblue premium rebuild (2026-10-01, branch feat/oceanblue-theme)

> Goal: /editor-compatible, fully isolated, premium ethnic-marketplace theme.
> Keep Oceanblue name + logo. Original work only — biba.in is DNA reference
> (REPORT.md Part 1), never copy branding/text/assets/layouts.
> Method: hallmark (loaded; DESIGN.md = locked system, oceanblue spec §2
> palette preserved: deep-ocean #0B3A5B + gold #C08A3E decorative-only).
> Loop protocol: /loop commands are plugin-handled (opencode-loop-local);
> enacted manually in-session — batch ≤5, this file is the state.
> OpenDesign MCP installed 2026-10-01, tools activate after opencode restart.
> copilot.com/chat needs owner Microsoft login — prompts below are for the
> user's authenticated session; drop finals into public/ph/oceanblue/.

## Batch 1 (in progress)

- [x] P9-0 Setup: OpenDesign MCP entry + smoke test; hallmark pre-flight;
      live-snapshot audit of /theme-preview/oceanblue (see punch list below).
- [x] P9-1 Dead CTAs: festive split primary CTA renders href="#" (ctaUrl
      missing; only ctaUrl2=/sale wired) + footer socials (YouTube/X/IG/FB)
      all href="#" → wire real permalinks or omit.
      DONE 2026-10-01: split_feature ctaUrl→ctaHref=/c/festive, dropped
      ctaLabel2/ctaUrl2; footer socials now omitted (socials area field
      default "", icon lookups kept private as SOCIAL_ICONS). Registry
      embed regenerated. Verified live: 0 social links, 0 hash anchors,
      SHOP FESTIVE→/c/festive, 1 CTA. Lint: chrome.tsx 4 errors→0
      (warnings +9 from react-refresh branch flip, informational only;
      siblings carry same warnings).
- [x] P9-2 Double newsletter: main §11 + footer contentinfo render identical
      "New drops, first inbox" forms → keep one.
      Shipped: removed footer newsletter section + newsletter* sitemap props
      + NEWSLETTER const (footer.ts); rewrote wiring.test footer pins to
      zero CTAs / ["footer_sitemap","payment_icons","rich_text"]; registry
      embed regenerated as post-parse live shape (68308→60494 bytes, exact
      7814 = 9 footers × newsletter block). Gates: typecheck, 4830 tests,
      258 contracts, eslint touched files 0/0. Live: heading+form+email input
      1 in <main>, 0 in contentinfo, no console errors.
- [x] P9-3 Preview rails show grocery/electronics (cookware, basmati, earbuds,
      fan) → oceanblue ethnic demo catalog (BDT minor units, marked demo).
      New `OCEANBLUE` const in demo-catalog.ts (52 products / 8 categories
      mirroring circle tiles / 8 collections, SKUs OB-*, whole-taka poisha,
      no image_url → dept-tinted monograms, registered as 8th DEMO_CATALOGS
      key). phase4 test: eight keys + oceanblue domain regex + dedicated
      describe (tiles, ≥50 products, new-in/festive backed, %100 prices, no
      grocery residue). Gates: typecheck, 4834 tests (+4), 258 contracts,
      eslint touched 0/0, repo 824→823 (splice removed stray prettier blank).
      Live local: ethnic titles, ৳ prices, /api/public/ph monograms, zero
      grocery hits, 0 console errors.
- [ ] P9-4 Banner hero skin (spec docs/superpowers/specs/2026-10-01-*.md,
      commit da18691) — biba-style full-bleed image+overlay hero.
- [ ] P9-5 Honest copy: footer helpline + care@oceanblue.example are
      fabricated → merchant-config placeholders; "A HAPPY CUSTOMER" flagged
      illustrative; trim all-caps eyebrow spam.

## Batch 2 (queued)

- [ ] P9-6 Imagery drop-in (user runs prompts in authenticated Copilot).
- [ ] P9-7 Trust-marquee motion + card hover crossfade/Quick View (Phase 1
      carryover, theme-scoped skins only).
- [ ] P9-8 /editor verify: oceanblue sections in studio palette +
      SectionRenderer render + isolation.test.ts green.
- [ ] P9-9 Mobile 320/375/414/768 + reduced-motion + a11y gates.
- [ ] P9-10 Gates per item: typecheck → test → contracts → eslint touched →
      chrome snapshot (screenshot best-effort) → commit.

# Phase 10 — oceanblue-v2 full-storefront rebuild (2026-10-02, branch feat/oceanblue-theme)

> User-approved (approach A, one pass). New `oceanblue-v2` key from zero; v1
> untouched. Spec: docs/superpowers/specs/2026-10-02-oceanblue-v2-design.md.
> Method: hallmark studied-DNA (biba.in); OpenDesign MCP/daemon absent —
> chrome-devtools verification instead. Subagent executes autonomously:
> implement → gates → :3000 preview → commit (no push/deploy without word).

- [x] P10-0 Spec written + self-reviewed + committed (this file updated).
- [x] P10-1 writing-plans implementation plan (`docs/superpowers/plans/2026-10-02-oceanblue-v2.md`, self-reviewed, committed).
- [x] P10-2 Scaffold: tokens/skins/homepage/secondary/header/footer/preset/preview
      (ef210bc, a7c510f, dfa5b91, a022de8, b8c06b0, 44c665d).
- [x] P10-3 Wiring: preview-sources, theme-chrome, catalog-meta, nav resolve,
      registry migration (44c665d) + banner skin append (cbf2581).
- [x] P10-4 Gates + :3000 rebuild + chrome verify (desktop + 390px, 0 console
      errors) + commit — see closeout below.

## Phase 10 closeout (2026-10-02, Task 8 verification)

- typecheck clean; unit 4881 passed/2 skipped (377 files, +47 vs P9-3);
  contracts 258 green.
- eslint: v2 dir + touched shared files 0 errors (23 prettier auto-fixed via
  --fix; 12 react-refresh warnings informational, same family as siblings).
  Repo-wide 846 errors/251 warnings pre-existing — net delta not claimed.
- Local :3000 rebuilt + restarted: /theme-preview/oceanblue-v2 → 200.
- Fresh-browser DOM: 50 ethnic hits / 8 families, BDT prices, grocery null,
  newsletter ×1, 156 links 0 dead, 4 banner dots + seamless-wrap clone,
  0 console errors; 390px no-overflow, hero visible.

## Out of theme scope (shared-track decisions needed)

- Mega-menu in StoreHeader (masthead owns nav; themes can't touch it).
- Transparent→solid sticky header (shared chrome behavior).

## Audit punch list (2026-10-01 live snapshot)

- critical: dead festive CTA href="#" (homepage.ts split_feature ctaUrl).
- critical: rails render non-ethnic demo products (preview wiring).
- critical: fabricated footer contact (helpline + example email).
- major: double newsletter (main §11 + footer).
- major: imageless split hero vs biba full-bleed DNA (banner spec unbuilt).
- major: all-caps eyebrow spam (8+ screaming headings).
- major: footer socials href="#" (4 dead links).
- minor: Shop-by-Color c7/c8 empty slots in config.
- minor: trust strip static (marquee motion unverified live).
- minor: single generic testimonial ("A HAPPY CUSTOMER").

# Phase 11 — oceanblue-v2 premium copy + marquee tint (2026-10-02, branch feat/oceanblue-theme)

> Hallmark redesign (in-place, IA/routes/brand preserved; studied maroon DNA).
> Pre-flight: Tailwind v4 + React 19 + gsap (motion-on); fonts via theme tokens
> (Crimson Pro + Work Sans); DESIGN.md = locked system. Inferred brief —
> audience: BD ethnic shoppers + merchants; use: catalog discovery → /c/*;
> tone: luxury-maroon editorial. Macrostructure unchanged (campaign rhythm);
> voice + symmetry + honesty only. Isolation: prod files import zero
> @/components (only render.test.tsx does — allowed, tests excluded).

- [x] P11-1 Premium honest copy (homepage.ts, footer.ts, render.test.tsx):
      headlines/CTAs/captions Title Case (Most Loved, The Festive Edit,
      Shop Festive/Wedding/Girls/Nxt, Our promise/story); Shop-by-Color
      c7/c8 filled (Maroon → /c/maroon, Gold → /c/gold — 8-tile symmetry,
      renderer already filters empties); testimonial role "Verified buyer"
      → "Illustrative review" (was fabricated); footer storyLabel likewise.
- [x] P11-2 Trust-marquee brand tint (skins.css only, token vars, no motion
      changes — core marquee + motion-reduce already live in discovery.tsx):
      blush band + brand icon chips with brand-ink glyphs.
- [x] P11-3 Gates: typecheck clean; oceanblue-v2 40/40; themes 183/183
      (isolation green); contracts 258 green; eslint touched 0 errors;
      registry migration regenerated via /tmp/gen_oceanblue_v2_row.ts
      (json 61758 bytes).
- [x] P11-4 Chrome: /theme-preview/oceanblue-v2 on :3000 (stale pre-edit
      server) — 390px mobile, footer + logo intact, 0 console errors
      (screenshot). :3001 fresh instance 404s on host-gate without Supabase
      env (known environmental, same as Phase 10 closeout); new copy verified
      via SSR render tests EN+BN instead.
- [x] P11-6 Copilot imagery batch A (2026-10-02, owner Admin session via
      chrome-devtools): 3/13 downloaded to public/ph/oceanblue-v2/ as
      JPEG q85 (~600KB each, 1024×1536, eyeballed: on-palette, no text) —
      hero-newin.jpg (maroon salwar, rooftop), hero-wedding.jpg (maroon
      lehenga, haveli), hero-girls.jpg (mustard kurta, marigold market;
      prompt auto-adapted teen→adult by safety filter). LIMIT HIT:
      Copilot daily image quota exhausted ("can't generate any more images
      today") — hero-nxt, festive split + 8 tiles queued.
- [ ] P11-7 Imagery batch B (when quota resets): hero-nxt (retry single
      adult woman, two-person comps stall the generator), festive split
      2:1, 8 category tiles 1:1 (salwar/kurta/dress/bottom/girls/
      jewellery/collections/sale flat-lays, cream bg). Then wire via
      /editor (builders stay imageless by convention — v1 precedent).
- [x] P11-8 Wire batch-A heroes into v2 homepage (2026-10-02): slides 1–3
      image → /ph/oceanblue-v2/hero-newin|wedding|girls.jpg; slide 4 (Nxt)
      stays imageless until batch B. Registry embed regenerated
      (json 61853 bytes). Gates: v2 40/40, typecheck clean, eslint clean.
      NOTE: :3000 runs a 12h-old PRODUCTION build (.output/server) — it
      still serves pre-Phase-11 copy with zero hero imgs (verified via DOM:
      H1 all-caps, no carousel img). New slides + photos go live on next
      rebuild/redeploy (needs explicit word per standing rule).

## Copilot image prompts (MeiGen structure, no text in frame)

> v2 note: art-direct every frame to deep maroon (#A72F30) + gold accents on
> warm cream — matches OCEANBLUE_V2_TOKENS brand/accent. Portrait 4:5 heroes,
> 1:1 tiles, 2:1 split. Drop finals into public/ph/oceanblue-v2/ (1:1 swap,
> zero rewiring once wired).

1. HERO new-in: "South Asian woman in everyday embroidered teal salwar kameez,
   sunlit Dhaka rooftop courtyard, soft morning light, deep-ocean teal and
   warm gold palette, full-body editorial, portrait 4:5, photorealistic."
2. HERO wedding: "Bride in deep maroon lehenga with gold zari, jasmine in
   hair, candlelit haveli interior bokeh, maroon and gold palette,
   full-body editorial, portrait 4:5, photorealistic."
3. HERO girls: "Teen girl twirling in mustard festive mini kurta set,
   marigold market street, golden hour, mustard and cream palette,
   motion joy, portrait 4:5, photorealistic."
4. FESTIVE split: "Silk festive kurtas on brass rail, cream studio wall,
   jasmine garland, side window light, cream gold and rust palette,
   landscape 2:1, photorealistic e-commerce campaign."
5. CATEGORY tiles (8): one garment flat-lay per tile — salwar, kurta, dress,
   bottom, girls suit, jewellery set, festive collection, sale rail —
   cream background, soft shadow, square 1:1, photorealistic.
