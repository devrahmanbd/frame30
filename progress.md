# Progress — CI Green Program (Oct 14)

> Goal: first green CircleCI build on `frame30` (none since CI began), then
> keep it green. CHECKLIST.md absorbed: its 5/4/6.5 scores and most "not
> implemented" rows are stale — registry, propsSchema, inspector swap-in,
> extension AST, presentations, runtime mount, demo, E2E plugin all landed
> with tests since. Remaining CHECKLIST truths: authenticated-editor E2E
> (blocked, no creds), pipeline-to-install single journey, real-GPU proof.
> `.env` hygiene: root `.env` + `.circleci/.env` present locally,
> git-ignored, untracked — as required.

## CI failure inventory (verified locally, mirrors CI jobs 1:1)

- [ ] `lint-typecheck/eslint`: ~1300 errors, all but 15 auto-fixable prettier drift; 14 rules-of-hooks + 1 unknown-property across 10 files need hands
- [ ] `unit-contract/vitest`: 1 pre-existing env failure (`site.server` missing-env guard)
- [ ] `e2e-critical`: references 8 `*_loop` suites that exist only as docs → "No tests found" exit 1
- [ ] `scan`: green (secret/sast/diff+full/dep-audit all pass)
- [ ] `build`: green (`vite build` verified)
- [ ] `e2e-security` + nightly: wired and green locally

## Loops

- [ ] Format sweep: `prettier --write .` + full-suite proof of no behavior change
- [ ] Manual lint fixes (10 files, hooks/prop only)
- [ ] site.server env guard: determine impl-bug vs test-bug, fix the right side
- [ ] e2e-critical rewire to runnable specs (loop suites never built — say so in docs)
- [ ] Full local CI mirror → commit → push → GitHub Checks green

# Progress — Frame30 Extensible Builder Program (Oct 2026)

> Mission: 9/10 parity in third-party widgets, custom-theme freedom, and
> page-builder extensibility — no thin wrappers, no mocks. Score claimed only
> with implementation + acceptance tests. Historical sections below (Biba
> motion program) are untouched.

## Gap map (verified in source, Oct 13)

| Spec § | Area                     | Status       | Evidence                                                                                                                                                                                                          |
| ------ | ------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3      | Widget contract/registry | PARTIAL      | `unified-widget-registry.ts` (157 builtin + 180 studio + plugin defs, versions, rollback, no-privilege proof) exists; missing: loading/empty/error states, a11y/reduced-motion expectations, SEO metadata per def |
| 4      | propsSchema              | PARTIAL      | `widget-props.ts` validates all 22 kinds; only 11 fully render — image/media/video/product/collection pickers + typography/responsive/visibility/animation are placeholders                                       |
| 5      | Schema inspector         | UNWIRED      | `SchemaControls.tsx` built + tested; `SectionInspector`/`editor.setPropAt`/`commitVersion` still bespoke (swap-in points documented, not executed)                                                                |
| 6      | Extension AST node       | MISSING      | Only legacy `plugin_block`; no generic typed extension node, no migration path                                                                                                                                    |
| 7      | Tray auto-discovery      | PARTIAL      | Old resolver auto-discovers plugin widgets; unified-registry adoption (`StudioAppBlock`, trays) listed, not done                                                                                                  |
| 8      | Theme presentations      | PARTIAL      | Per-theme built-in overrides + fallback exist; namespaced resolution, Class B themeable rendering, theme-owned resolution missing                                                                                 |
| 9      | Custom runtime/SDK       | PARTIAL      | `ThemeRuntime` + bridge v2 mounted; reviewed-bundle lane pure-logic (no DB backing); no theme build pipeline                                                                                                      |
| 10     | Theme-owned tray widgets | MISSING      | Depends on §6–§8                                                                                                                                                                                                  |
| 11     | Builder parity           | AUDIT-NEEDED | Undo/redo, DnD, responsive rules, reusable semantics — unverified against spec list                                                                                                                               |
| 12     | Versioning/migration     | PARTIAL      | Registry rollback exists; extension update-migration rules missing                                                                                                                                                |
| 13     | Security tests           | PARTIAL      | Bridge/isolation/traversal covered; extension upgrade-migration, repeater bombs, duplicate-ID races need proof                                                                                                    |
| 14     | E2E test plugin          | MISSING      | No 2-widget editor-workflow plugin exists                                                                                                                                                                         |
| 15     | Mounted custom demo      | MISSING      | `examples/demo-theme` fixture-only, unmounted, no browser proof                                                                                                                                                   |

## Loops

- [x] Loop A — extension AST node + tray adoption via unified registry (57 tests; SectionType untouched by constraint, serializability lesson: no `unknown` in server-fn types)
- [x] Loop B — inspector swap-in + server save-path validation (38 tests, bespoke path byte-identical)
- [x] Loop C — namespaced presentations + theme-owned tray (needs A)
- [x] Loop D — E2E test plugin + 16-step workflow (needs A+B)
- [x] Loop E — mounted demo + browser proof (needs A+C) — 7/7 Chromium (GSAP animates, reduced-motion static, carousel lazy, bridge admit/deny, dispose clean)
- [x] Final wiring — presentation/tray/gate/picker/insertion swap-ins live, DoD-5 supersession documented in-test
- [x] Verification — full battery + browser + honest 3-score report
- [x] Remaining gaps closed — breakpoint gate, global-insert mode, update affordance; deterministic bundle pipeline; three@0.186.1 vendored with SwiftShader render proof (mean-abs-diff 82.78); tsgo typecheck clean tree-wide

## Scores (evidence-based, Oct 14)

- **Third-party widget parity: 9/10.** Swap-ins live (renderer, tray, activation gate, picker mounts, insertion paths); 16-step + browser workflows green. −1: authenticated-editor half unprovable hermetically (session required; substitutes proven).
- **Custom-theme developer freedom: 9/10.** Bundle pipeline (deterministic, byte-stable) → reviewed lane → isolated runtime → real render proof. −1: pipeline-to-install as one witnessed journey + real-GPU (SwiftShader stands in) proof outstanding.
- **Overall page-builder parity: 9/10.** All three deferred audit gaps closed; undo/selection pinned; picker mounted. −1: micro-edges reported-unasserted (ghost slot scope, latent dropInto, no-op history pushes).

## Scores (evidence-based, Oct 14)

- **Third-party widget parity: 9/10.** Declare (validated manifests) → register (unified registry, no core edits) → tray auto-discovery → schema-generated per-instance controls → duplicate/isolate → save/reload/publish → theme presentation or safe fallback → disable/remove with data preserved. Proven: 16-step unit workflow, 5-test browser workflow, 38/38 E2E cold. −1: authenticated-editor half of the browser workflow unprovable hermetically (routes require session; substitutes proven).
- **Custom-theme developer freedom: 9/10.** Manifest validator → reviewed-bundle lane (fingerprint-bound install, moderator workflow, revocation) → isolated ThemeRuntime + bridge v2 → GSAP/WebGL/video/carousel in mounted browser proof (7/7) with fallbacks and disposal. −1: no theme build pipeline (bundles assembled by hand) and no real-GPU rendering proof (node has no WebGL).
- **Overall page-builder parity: 9/10.** Tray/canvas/inspector/saved-page/responsive/preview/theme-switch/storefront share one coherent workflow; undo/history/persistence validated; backward compat pinned (legacy paths byte-identical, bare IDs grandfathered). −1: three small audit gaps remain open (legacy breakpoint preview-only, snapshot-only global insert, no in-builder update affordance).
- [x] Loop F — builder parity audit (read-only, parallel) — DONE: ~90% present, top-5 gaps filed
- [x] DynamicTagPicker component (34 tests) — swap-in pending Loop B landing
- [x] Undo/redo + selection-sync pins (24 tests) — no bugs confirmed, 3 judgment calls flagged
- [ ] Verification — full battery + browser + honest 3-score report

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
- F2 AI imagery drop-in — DONE 2026-09-29 (commit 43a989b): 6 fresh MAI-Image-2.6-Flash photos generated live in owner-authenticated playground session (MeiGen-structured prompts: subject+style+lighting+palette+composition, no text), same filenames = zero rewiring (hero-newin, hero-wedding, craft-loom, occ-women/men/kids, JPEG q85); SOURCES.txt provenance updated; originals backed up in /tmp/somvabona-orig/; theme suites 51/51 green post-swap.

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
