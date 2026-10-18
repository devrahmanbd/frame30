# Songoskriti port — parity report (post-port vs frozen reference)

- **Date:** 2026-10-18
- **HEAD at run:** `b3258d8c6be9bebd4e5f156485c8affaf630ca88` (`b3258d8c`)
- **Freeze SHA (reference):** `9e6806329d47` — recorded in `reference-manifest.json`
- **Stack recipe:** `docs/15-e2e/loopback-auth-setup.md` §§1–3 (mode B, throwaway `e2e-supabase` loopback stack)
- **Spec:** `.e2e/songoskriti-port-parity.spec.ts` (unchanged since the freeze; captures frozen at `8e483317`)
- **Run command:**
  ```bash
  PORT_CAPTURE_OUT=after E2E_BASE_URL=http://localhost:3020 E2E_NO_WEBSERVER=1 \
    E2E_MERCHANT_EMAIL="$E2E_MERCHANT_EMAIL" E2E_MERCHANT_PASSWORD="$E2E_MERCHANT_PASSWORD" \
    npx playwright test -c .e2e/playwright.config.ts songoskriti-port-parity
  ```
  (no `--update-snapshots`; retries = config default 1 locally; no retry-only passes occurred)
- **Result:** **60 passed / 1 skipped / 0 failed / 0 flaky** — 61 tests, 8.3 min, exit 0.
  The skip is the freeze-time `manual-review` surface `chrome-mobile-drawer-375-bn.png` (spec `SKIPPED` map; §7).

Required by spec §10: one row per surface/width/locale with capture params, measured delta / manual-review, threshold, verdict, and evidence links.

## Method

- Public preview route `/theme-preview/songoskriti?template=<t>&lang=<l>` (locale via `?lang=`, client boot asserted before capture).
- Surfaces: 9 templates × 3 widths × 2 locales = 54 template stills; 2 desktop mega-menu chrome stills (1440 en/bn); 2 mobile-drawer chrome stills (375 en/bn); 2 variation-smoke stills (`?variation=minimal`, `?variation=festive` @ 1440 en); plus 1 authenticated activation helper smoke (no still).
- Every capture compares against the frozen baseline in `.e2e/songoskriti-port-parity.spec.ts-snapshots/` with `maxDiffPixelRatio: 0.02`, `threshold: 0.2`, `animations: "disabled"`, `caret: "hide"`, reduced-motion emulated, non-local requests aborted (`blockExternalRequests`).
- Playwright prints a `ratio` only for failing comparisons; a passing row is by construction within the 0.02 / 0.2 thresholds — recorded below as `within thresholds`.
- Human stills for every compared surface are under `after/` in this directory.

## Verdict table

| Surface (outfile) | Capture params | Measured delta | Verdict | Evidence |
|---|---|---|---|---|
| `account-1440-bn.png` | account / 1440px / bn | within thresholds | pass | `after/account-1440-bn.png` |
| `account-1440-en.png` | account / 1440px / en | within thresholds | pass | `after/account-1440-en.png` |
| `account-375-bn.png` | account / 375px / bn | within thresholds | pass | `after/account-375-bn.png` |
| `account-375-en.png` | account / 375px / en | within thresholds | pass | `after/account-375-en.png` |
| `account-768-bn.png` | account / 768px / bn | within thresholds | pass | `after/account-768-bn.png` |
| `account-768-en.png` | account / 768px / en | within thresholds | pass | `after/account-768-en.png` |
| `blog-1440-bn.png` | blog / 1440px / bn | within thresholds | pass | `after/blog-1440-bn.png` |
| `blog-1440-en.png` | blog / 1440px / en | within thresholds | pass | `after/blog-1440-en.png` |
| `blog-375-bn.png` | blog / 375px / bn | within thresholds | pass | `after/blog-375-bn.png` |
| `blog-375-en.png` | blog / 375px / en | within thresholds | pass | `after/blog-375-en.png` |
| `blog-768-bn.png` | blog / 768px / bn | within thresholds | pass | `after/blog-768-bn.png` |
| `blog-768-en.png` | blog / 768px / en | within thresholds | pass | `after/blog-768-en.png` |
| `cart-1440-bn.png` | cart / 1440px / bn | within thresholds | pass | `after/cart-1440-bn.png` |
| `cart-1440-en.png` | cart / 1440px / en | within thresholds | pass | `after/cart-1440-en.png` |
| `cart-375-bn.png` | cart / 375px / bn | within thresholds | pass | `after/cart-375-bn.png` |
| `cart-375-en.png` | cart / 375px / en | within thresholds | pass | `after/cart-375-en.png` |
| `cart-768-bn.png` | cart / 768px / bn | within thresholds | pass | `after/cart-768-bn.png` |
| `cart-768-en.png` | cart / 768px / en | within thresholds | pass | `after/cart-768-en.png` |
| `checkout-1440-bn.png` | checkout / 1440px / bn | within thresholds | pass | `after/checkout-1440-bn.png` |
| `checkout-1440-en.png` | checkout / 1440px / en | within thresholds | pass | `after/checkout-1440-en.png` |
| `checkout-375-bn.png` | checkout / 375px / bn | within thresholds | pass | `after/checkout-375-bn.png` |
| `checkout-375-en.png` | checkout / 375px / en | within thresholds | pass | `after/checkout-375-en.png` |
| `checkout-768-bn.png` | checkout / 768px / bn | within thresholds | pass | `after/checkout-768-bn.png` |
| `checkout-768-en.png` | checkout / 768px / en | within thresholds | pass | `after/checkout-768-en.png` |
| `chrome-mega-menu-1440-bn.png` | chrome-mega-menu / 1440px / bn | within thresholds | pass | `after/chrome-mega-menu-1440-bn.png` |
| `chrome-mega-menu-1440-en.png` | chrome-mega-menu / 1440px / en | within thresholds | pass | `after/chrome-mega-menu-1440-en.png` |
| `chrome-mobile-drawer-375-en.png` | chrome-mobile-drawer / 375px / en | within thresholds | pass | `after/chrome-mobile-drawer-375-en.png` |
| `chrome-mobile-drawer-375-bn.png` | chrome-mobile-drawer / 375px / bn | manual review (no baseline) | manual-review | §7 (no still captured) |
| `collection-1440-bn.png` | collection / 1440px / bn | within thresholds | pass | `after/collection-1440-bn.png` |
| `collection-1440-en.png` | collection / 1440px / en | within thresholds | pass | `after/collection-1440-en.png` |
| `collection-375-bn.png` | collection / 375px / bn | within thresholds | pass | `after/collection-375-bn.png` |
| `collection-375-en.png` | collection / 375px / en | within thresholds | pass | `after/collection-375-en.png` |
| `collection-768-bn.png` | collection / 768px / bn | within thresholds | pass | `after/collection-768-bn.png` |
| `collection-768-en.png` | collection / 768px / en | within thresholds | pass | `after/collection-768-en.png` |
| `index-1440-bn.png` | index / 1440px / bn | within thresholds | pass | `after/index-1440-bn.png` |
| `index-1440-en.png` | index / 1440px / en | within thresholds | pass | `after/index-1440-en.png` |
| `index-375-bn.png` | index / 375px / bn | within thresholds | pass | `after/index-375-bn.png` |
| `index-375-en.png` | index / 375px / en | within thresholds | pass | `after/index-375-en.png` |
| `index-768-bn.png` | index / 768px / bn | within thresholds | pass | `after/index-768-bn.png` |
| `index-768-en.png` | index / 768px / en | within thresholds | pass | `after/index-768-en.png` |
| `index-festive-1440-en.png` | index-festive / 1440px / en | within thresholds | pass | `after/index-festive-1440-en.png` |
| `index-minimal-1440-en.png` | index-minimal / 1440px / en | within thresholds | pass | `after/index-minimal-1440-en.png` |
| `page-1440-bn.png` | page / 1440px / bn | within thresholds | pass | `after/page-1440-bn.png` |
| `page-1440-en.png` | page / 1440px / en | within thresholds | pass | `after/page-1440-en.png` |
| `page-375-bn.png` | page / 375px / bn | within thresholds | pass | `after/page-375-bn.png` |
| `page-375-en.png` | page / 375px / en | within thresholds | pass | `after/page-375-en.png` |
| `page-768-bn.png` | page / 768px / bn | within thresholds | pass | `after/page-768-bn.png` |
| `page-768-en.png` | page / 768px / en | within thresholds | pass | `after/page-768-en.png` |
| `product-1440-bn.png` | product / 1440px / bn | within thresholds | pass | `after/product-1440-bn.png` |
| `product-1440-en.png` | product / 1440px / en | within thresholds | pass | `after/product-1440-en.png` |
| `product-375-bn.png` | product / 375px / bn | within thresholds | pass | `after/product-375-bn.png` |
| `product-375-en.png` | product / 375px / en | within thresholds | pass | `after/product-375-en.png` |
| `product-768-bn.png` | product / 768px / bn | within thresholds | pass | `after/product-768-bn.png` |
| `product-768-en.png` | product / 768px / en | within thresholds | pass | `after/product-768-en.png` |
| `search-1440-bn.png` | search / 1440px / bn | within thresholds | pass | `after/search-1440-bn.png` |
| `search-1440-en.png` | search / 1440px / en | within thresholds | pass | `after/search-1440-en.png` |
| `search-375-bn.png` | search / 375px / bn | within thresholds | pass | `after/search-375-bn.png` |
| `search-375-en.png` | search / 375px / en | within thresholds | pass | `after/search-375-en.png` |
| `search-768-bn.png` | search / 768px / bn | within thresholds | pass | `after/search-768-bn.png` |
| `search-768-en.png` | search / 768px / en | within thresholds | pass | `after/search-768-en.png` |

Additionally (no still): `songoskriti activation helper smoke › ensureSongoskritiActive and setActiveTheme are idempotent` — **pass** (real GoTrue session; real theme server functions; re-run is a no-op).

## Regressions

**None.** No surface failed, no row passed only on retry (no `flaky` markers in the run output), and no unreviewed difference exists: every capture either compared within thresholds or is the single documented `manual-review` row below. No threshold or spec change was made.

## Theme-switch + mobile/tablet matrix rows (plan Step 4)

| Matrix row | Evidence | Verdict |
|---|---|---|
| Theme switch → Songoskriti active (editor/builder graph) | Task 6 suite `presentation-claims-activation.test.ts` + Task 7 suites `ornament-def.test.ts`, `ornament-reachability.test.ts`, `ornament-recovery.test.ts` (all green at HEAD) | pass (component level) |
| Theme switch → Songoskriti active (storefront/preview graph) | Task 5 neutrality suites (`hero-carousel-neutrality.test.ts`, `recently-viewed-neutrality.test.ts`, `circle-categories-neutrality.test.ts`, `footer-copy-neutrality.test.ts`) + `preview.test.ts` | pass (component level) |
| Theme switch idempotence (real session, real server fns) | this run: activation helper smoke (above) | pass |
| Mobile 375px en/bn | this run: all 18 template stills @375 + `chrome-mobile-drawer-375-en` green; bn drawer = `manual-review` (§7) | pass / manual-review |
| Tablet 768px en/bn | this run: all 18 template stills @768 green | pass |
| Desktop 1440px en/bn | this run: all 18 template stills @1440 + 2 mega-menu + 2 variation stills green | pass |

Legacy removal is **out of scope** for this cycle.

## 7. Manual-review surface — `chrome-mobile-drawer-375-bn.png`

### Background

- At freeze calibration (`9e680632`) the bn drawer capture failed on original **and** retry: the hamburger button was visible and the click fired, but `[data-nav="songoskriti-drawer"]` never became visible within 10s. The surface was recorded `manual-review` in the spec's `SKIPPED` map (reason string preserved verbatim) and **no reference baseline was written**; the en drawer passed and has a baseline (`reference/chrome-mobile-drawer-375-en.png`).
- In this parity run the surface is skipped by the same map, so the interaction was not re-attempted by the run; the after-run manifest re-records the historic reason under `freezeSha b3258d8c6be9`. With no reference still, there is nothing to diff against by eye.

### Live reproduction attempt at HEAD (this task's investigation)

Spec-faithful harness — same viewport (375×900), locale, and waits (lang applied → bn copy present → `fonts.ready` → reduced-motion), non-local requests aborted exactly like `blockExternalRequests`, one real click on `button[aria-controls="store-mobile-menu"]`, then visibility of `[data-nav="songoskriti-drawer"]`:

- Script `/tmp/opencode/task8/drawer-probe4.cjs` (repo Playwright 1.56.0); raw output `/tmp/opencode/task8/drawer-probe4-output.json`; stills `drawer4-{bn,en}.png` (not committed; `/tmp` evidence).
- **Both locales open the drawer:** `aria-expanded` `false` → `true` after a single click; container `#store-mobile-menu` present; `[data-nav="songoskriti-drawer"]` present **and visible**. No click errors. The only console messages are the 3 expected blocked-external `net::ERR_FAILED`s per page. Drawer container HTML length: bn 2712 / en 2719 (locale copy only); `dir` empty (no RTL); the click point lands on the button's inner `svg` (normal).
- Negative control without request-blocking (`drawer-probe3.cjs`): the click was a no-op for **both** locales (aria stayed `false`, no container) — a bare harness under-waits hydration; only the blocking harness (the spec's actual mode) is representative.

### Code path / ownership

- All three elements are theme-owned, in `src/lib/themes/songoskriti/header-presentation.tsx`: hamburger button ~565-583 (`onClick={() => setMobileOpen((o) => !o)}`, gated on `mobileMenu.length > 0`), drawer container `#store-mobile-menu` ~739-764, drawer nav `data-nav="songoskriti-drawer"` ~293-295. `src/components/store/StoreHeader.tsx` carries the parallel shared chrome.
- `git diff 9e680632..HEAD` — the drawer machinery files are **unchanged since the freeze** (`header-presentation.tsx`, `StoreHeader.tsx`, `widget-presentation.ts`); the only post-freeze change anywhere near this path is `songoskriti.tsx` +16 lines (Task 7 side-effect import, unrelated to the drawer).

### Classification

- **Not an app defect at HEAD and not locale-specific.** With the frozen drawer source unchanged, the bn drawer opens deterministically in the spec's blocking harness; the freeze-time failure is a capture-time flake at the hydrate/click boundary — the same timing sensitivity the spec's own calibration comment records for this surface.
- The parity row therefore stays `manual-review`: there is no baseline to compare, and unfreezing it with a fresh bn baseline is a follow-up, not parity evidence.
- **Banked follow-up (out of scope this cycle; no fix, no escalation):** make `openMobileDrawer` hydration-robust (retry the click until `aria-expanded` flips, or gate on a post-hydration signal) and re-baseline the bn drawer still afterwards. `.e2e/songoskriti-port-parity.spec.ts` is a Task 4 freeze artifact — editing it requires an approved fix round.

## Environment / caveats

- **Stack rebuilt from scratch** (Task 4's teardown removed the volumes): `bringup2/bringup.sh` (compose up → roles → relay → schema → GoTrue merchant `1d23d2c0-…` → seed, 0 error lines) plus `bringup2/repair.sh` for the known late-policy files of a fresh bring-up (15 policies re-verified). Vite on `:3020` with loopback overrides (`VITE_SUPABASE_URL=http://127.0.0.1:58000`, `DISABLE_HMR=true`); catalogue "demo seed".
- **Frozen manifest preserved:** the spec unconditionally rewrites `reference-manifest.json` in any mode; after the run the file was restored byte-identical (`freezeSha: 9e6806329d47`). The raw after-run copy is kept outside the repo (`/tmp/opencode/task8/after-run-manifest.json`: 60 entries — 59 `pass`, 1 `manual-review`).
- Secrets (`.e2e.env`, `creds.env`) stayed in `/tmp`, were never printed and never committed.
- Teardown per `docs/15-e2e/loopback-auth-setup.md` §5: vite + socat relay stopped; `docker compose -f docker-compose.e2e.yml --env-file /tmp/opencode/e2e-auth/.e2e.env down -v`; no `e2e-supabase` containers remain; ports 3020/58000 free.
- Parity stills are human evidence; the machine baselines remain the frozen `.e2e/…-snapshots/` PNGs. Legacy theme removal is out of scope for this cycle.
