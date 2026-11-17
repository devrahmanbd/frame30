# Wave 21 / Flame Fashion BD Full Mobile Experience Remediation Walkthrough

**Date:** 2026-11-17 · **Branch:** `frame30` / `main` · **Commit SHA:** `19d3b12e`  
**Production Host:** `https://flamelancer.com` · **Theme Preview Host:** `https://framique.qubickle.com/theme-preview/songoskriti`  
**Merchant ID:** `b47532e5-9649-4ebd-93a9-06fa2917c00e` (`Flame Fashion BD`, slug `flame-fashion-bd`)  
**Production Server:** `88.99.250.99:3200` (`framique.service`, OpenResty edge, Postgres `framique-supabase-db`, Redis `deploy-redis-1`)  
**Production Deployed SHA:** `19d3b12ed5ba9bb9ef3813c949d7207eca4e561d`

---

## 1. Executive Summary & Authoritative Reconciliation

Wave 21 delivers the full responsive and mobile remediation for Flame Fashion BD and the Songoskriti theme. All 7 items on the acceptance punch list across P0, P1, and P2 have been systematically resolved, verified against both the live production storefront (`https://flamelancer.com`) and theme preview (`https://framique.qubickle.com/theme-preview/songoskriti`), committed across synchronized `main` and `frame30` branches, and deployed to production.

All 32 visual evidence artifacts are committed under [`docs/wave21-evidence/`](./docs/wave21-evidence/) using repository-relative links with an authoritative machine-readable index ([`evidence-index.json`](./docs/wave21-evidence/evidence-index.json)).

### Authoritative Release & Production Reconciliation Receipt
```
Authoritative source commit: 19d3b12ed5ba9bb9ef3813c949d7207eca4e561d
Production .output/DEPLOYED_SHA: 19d3b12ed5ba9bb9ef3813c949d7207eca4e561d
Equality: PASS
Deployment timestamp: 2026-11-17T11:45:00Z
Production service: ACTIVE
Readiness: HTTP 200
```

### Acceptance Punch List Status
| # | Priority | Requirement | Verification Status | Key Evidence |
|---|----------|-------------|:-------------------:|--------------|
| 1 | P0 | Homepage Hero Photography immediately visible | **RESOLVED & VERIFIED LIVE** | [proof_01_homepage_mobile_hero.png](./docs/wave21-evidence/proof_01_homepage_mobile_hero.png) |
| 2 | P0 | Genuine full-page mobile acceptance (32 proofs) | **VERIFIED (32 proofs)** | [evidence-index.json](./docs/wave21-evidence/evidence-index.json) |
| 3 | P1 | Mobile Flame Fashion BD wordmark truncation fixed | **RESOLVED & VERIFIED LIVE** | [proof_27_wordmark_320px.png](./docs/wave21-evidence/proof_27_wordmark_320px.png)<br>[proof_30_wordmark_430px.png](./docs/wave21-evidence/proof_30_wordmark_430px.png) |
| 4 | P1 | Remove incorrect collection heading ("New Arrivals" prefix) | **RESOLVED & VERIFIED LIVE** | [proof_04_collection_girls_mobile.png](./docs/wave21-evidence/proof_04_collection_girls_mobile.png)<br>[proof_23_collection_girls_desktop.png](./docs/wave21-evidence/proof_23_collection_girls_desktop.png) |
| 5 | P1 | Correct responsive collection grids (adaptive balanced layouts) | **RESOLVED & VERIFIED LIVE** | [proof_23_collection_girls_desktop.png](./docs/wave21-evidence/proof_23_collection_girls_desktop.png)<br>[proof_24_collection_boys_desktop.png](./docs/wave21-evidence/proof_24_collection_boys_desktop.png) |
| 6 | P1 | Full storefront responsive audit (320px–1440px across 13 routes) | **PASS (0 overflow)** | 0 horizontal overflow across 8 viewports on 13 routes |
| 7 | P2 | Release documentation cleanup (repo-relative links) | **RESOLVED** | All links relative to repository root (`./docs/wave21-evidence/...`) |

---

## 2. Visual Verification Proofs Gallery

### Proof Group 1: Homepage Mobile Hero & Navigation Drawer
- **Immediate Hero Photography**: Hero background photograph renders at 0ms with full opacity (`opacity: 1`) without waiting for staggered entrance animations. Editorial typography and CTA are fully visible.
- **Mobile Navigation Drawer**: Sliding drawer with quick account and wishlist shortcuts, bilingual language switcher, expandable accordion sections (`WOMEN`, `MEN`, `KIDS`, `FESTIVE & WEDDING`, etc.), and customer support contact.

````carousel
![Homepage Mobile Hero](./docs/wave21-evidence/proof_01_homepage_mobile_hero.png)
<!-- slide -->
![Mobile Navigation Drawer Open](./docs/wave21-evidence/proof_03_mobile_drawer_open.png)
<!-- slide -->
![Homepage Mobile Full Page](./docs/wave21-evidence/proof_02_homepage_mobile_full.png)
````

---

### Proof Group 2: Wordmark Fluid Typography Matrix (320px – 430px)
The brand wordmark `FLAME FASHION BD` remains completely visible across all narrow mobile viewports without ellipses or character truncation (`isTruncated: false`).

````carousel
![Wordmark 320px Viewport](./docs/wave21-evidence/proof_27_wordmark_320px.png)
<!-- slide -->
![Wordmark 360px Viewport](./docs/wave21-evidence/proof_28_wordmark_360px.png)
<!-- slide -->
![Wordmark 390px Viewport](./docs/wave21-evidence/proof_29_wordmark_390px.png)
<!-- slide -->
![Wordmark 430px Viewport](./docs/wave21-evidence/proof_30_wordmark_430px.png)
````

---

### Proof Group 3: Clean Single H1 Collection Headers & Adaptive Balanced Assortments
- **Generic "New Arrivals" Suppressed**: Redundant `<h2>New Arrivals</h2>` prefix above collection titles is purged. Each collection renders its authored title as the primary `<h1>` (`Girls Festive Wear`, `Boys Ethnic Wear`, `Signature Sarees`, `Kids & Children`).
- **Adaptive Centered Layout**: Single-item assortments (e.g., `/c/girls`) are centered horizontally (`max-w-md mx-auto`) rather than stranded in an awkward 25% left column.

````carousel
![Girls Collection Mobile](./docs/wave21-evidence/proof_04_collection_girls_mobile.png)
<!-- slide -->
![Boys Collection Mobile](./docs/wave21-evidence/proof_05_collection_boys_mobile.png)
<!-- slide -->
![Kids Collection Mobile](./docs/wave21-evidence/proof_06_collection_kids_mobile.png)
<!-- slide -->
![Signature Sarees Mobile](./docs/wave21-evidence/proof_07_collection_sarees_mobile.png)
<!-- slide -->
![Girls Collection Desktop Centered Layout](./docs/wave21-evidence/proof_23_collection_girls_desktop.png)
````

---

### Proof Group 4: Mobile Product Detail Pages (PDP) & Customer Journey
- Full mobile PDP fidelity with authentic high-resolution photography, merchant breadcrumb (`FLAME FASHION BD / [PRODUCT]`), pricing in BDT (`৳`), variant selector, stock status, Cash on Delivery badge, and craft story.
- Populated cart experience demonstrating bag counter, product line item, quantity stepper, coupon code input, and checkout button.

````carousel
![Jamdani Saree Mobile PDP](./docs/wave21-evidence/proof_13_pdp_jamdani_saree_mobile.png)
<!-- slide -->
![Pure Silk Panjabi Mobile PDP](./docs/wave21-evidence/proof_14_pdp_royal_panjabi_mobile.png)
<!-- slide -->
![Silk Ghagra Choli Mobile PDP](./docs/wave21-evidence/proof_15_pdp_ghagra_choli_mobile.png)
<!-- slide -->
![Populated Mobile Cart](./docs/wave21-evidence/proof_20_cart_populated_mobile.png)
<!-- slide -->
![Mobile Checkout Screen](./docs/wave21-evidence/proof_19_checkout_mobile.png)
````

---

### Proof Group 5: Desktop & Theme Preview Parity
Complete parity between the live production merchant storefront and the Framique theme preview customizer.

````carousel
![Production Desktop Homepage](./docs/wave21-evidence/proof_21_homepage_desktop_hero.png)
<!-- slide -->
![Theme Preview Homepage](./docs/wave21-evidence/proof_31_preview_homepage.png)
<!-- slide -->
![Theme Preview Girls Collection](./docs/wave21-evidence/proof_32_preview_collection_girls.png)
<!-- slide -->
![Production Desktop Footer](./docs/wave21-evidence/proof_26_footer_desktop.png)
````

---

## 3. Technical Remediation Details

### P0 — 1. Immediate Homepage Hero Art Rendering
- **Root Cause:** GSAP timeline initialization in `src/components/builder/songoskriti-motion.ts` applied `autoAlpha: 0` to `[data-hero-art]` at setup, delaying hero photography until scroll triggers or staggered animation cues fired.
- **Resolution:** Removed initial hidden state `autoAlpha: 0` for `[data-hero-art]`. Explicitly registered labels `hero-start`, `hero-art` (time 0), and `hero-copy` (time 0.15). Added null element guards (`scope.querySelector(...)`) in `buildArt` and `buildCopyTimeline` to prevent runtime console warnings.
- **Measurement:** In headless Chrome on production `https://flamelancer.com/`:
  - 100ms: `opacity: 1`, `visibility: visible`
  - 500ms: `opacity: 1`, `visibility: visible`
  - 1500ms: `opacity: 1`, `visibility: visible`

### P1 — 3. Fluid Brand Wordmark Typography
- **Root Cause:** Strict pixel clamp `max-w-[150px] min-[360px]:max-w-[200px]` in `header-presentation.tsx` caused `FLAME FASHION BD` to truncate on mobile viewports.
- **Resolution:** Replaced fixed clamping with responsive fluid sizing:
  `text-[14.5px] min-[360px]:text-[16.5px] min-[390px]:text-lg sm:text-2xl font-light tracking-[0.05em] min-[360px]:tracking-[0.08em] sm:tracking-[0.15em] uppercase text-[var(--theme-ink)] block whitespace-nowrap`.
- **Measurement:** Verified `isTruncated: false` across 320px, 360px, 390px, 430px.

### P1 — 4. Collection Single H1 Header & Suppression of Redundant "New Arrivals"
- **Root Cause:** In `SongoskritiProductGrid`, the component unconditionally rendered a `heading` prop inside `<h2>` above the collection content, defaulting to `New Arrivals`.
- **Resolution:** Updated `SongoskritiProductGrid` to check `{template !== "collection" && heading && ...}`. In `CollectionView.tsx`, sanitized `cleanAst` to clear default headings on `product_grid` sections.
- **Verification:** Live `/c/girls`, `/c/boys`, `/c/kids`, `/c/sarees` confirmed to have exactly one `<h1>` containing the authored collection title, with 0 extraneous `New Arrivals` headings.

### P1 — 5. Adaptive Balanced Collection Grids
- **Root Cause:** Single or dual product assortments occupied the first cell of a 4-column desktop grid, leaving 75% of the viewport empty.
- **Resolution:** Added adaptive responsive container classes in `CollectionView.tsx` and `SongoskritiProductGrid`:
  - 1 product: `max-w-sm sm:max-w-md mx-auto` (mathematically centered)
  - 2 products: `sm:grid-cols-2 max-w-3xl mx-auto`
  - 3 products: `sm:grid-cols-3 max-w-5xl mx-auto`
  - 4+ products: standard responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`)
- **Measurement:** On `/c/girls` (1440px desktop), the single product card is centered at `x: 496px`, `width: 448px`, `right: 944px` (`(1440 - 448) / 2 = 496`).

### P1 — 6. Comprehensive 8-Viewport Responsive Audit
- Audited across 8 viewports: 320px, 360px, 390px, 430px, 768px, 1024px, 1280px, 1440px.
- Tested across 13 core storefront routes (`/`, `/c/girls`, `/c/boys`, `/c/kids`, `/c/sarees`, `/c/women`, `/c/men`, `/c/new-in`, `/c/festive`, `/c/wedding`, `/p/...`, `/cart`, `/checkout`).
- **Result:** `scrollWidth > clientWidth` evaluated to `false` (0 horizontal overflow) across all combinations.

---

## 4. Verification & Deployment Record

- **Authoritative Commit SHA:** `19d3b12ed5ba9bb9ef3813c949d7207eca4e561d`
- **Server Bundle Marker:** `19d3b12ed5ba9bb9ef3813c949d7207eca4e561d`
- **Readiness Check:** `http://127.0.0.1:3200/api/healthz?type=readiness` -> `HTTP 200 OK`
- **Production Storefront:** `https://flamelancer.com/` -> `HTTP/2 200 OK`
- **Theme Preview Storefront:** `https://framique.qubickle.com/theme-preview/songoskriti` -> `HTTP/2 200 OK`
- **Synchronized Tracking Branches:** `main` and `frame30`
- **Quality Gates Passed:**
  - `bun run typecheck` — **PASS** (0 errors)
  - `bun run test:contracts` — **PASS** (258/258 contract cases)
  - `vitest run` — **PASS** (642/642 test files, 9085 tests passed, 0 failures)
  - Targeted suites — **PASS** (151/151 tests passed)
