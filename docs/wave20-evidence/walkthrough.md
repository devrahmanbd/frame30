# Wave 20 / Flame Fashion BD & Songoskriti Production Remediation Walkthrough

**Date:** 2026-11-15 · **Branch:** `frame30` / `main` · **Commit SHA:** `c36be6bc`  
**Production Host:** `https://flamelancer.com` · **Theme Preview Host:** `https://framique.qubickle.com/theme-preview/songoskriti`  
**Merchant ID:** `b47532e5-9649-4ebd-93a9-06fa2917c00e` (`Flame Fashion BD`, slug `flame-fashion-bd`)  
**Production Server:** `88.99.250.99:3200` (`framique.service`, OpenResty edge, Postgres `framique-supabase-db`, Redis `deploy-redis-1`)  
**Production Deployed SHA:** `c36be6bc777796ae07bcdbe9be5f1e99ad8f6bb8`

---

## 1. Executive Summary & Authoritative Reconciliation

All items from the verification audit across P0, P1, and P2 have been fully resolved, verified against both the live production storefront (`https://flamelancer.com`) and theme preview (`https://framique.qubickle.com/theme-preview/songoskriti`), committed across synchronized `main` and `frame30` branches, and deployed to production.

All visual evidence artifacts are committed to the repository under [`docs/wave20-evidence/`](./docs/wave20-evidence/) for public accessibility and independent auditing.

### Authoritative Release & Production Reconciliation Receipt
```
Authoritative source commit: c36be6bc777796ae07bcdbe9be5f1e99ad8f6bb8
Production .output/DEPLOYED_SHA: c36be6bc777796ae07bcdbe9be5f1e99ad8f6bb8
Equality: PASS
Deployment timestamp: 2026-11-15T15:03:57Z
Production service: ACTIVE
Readiness: HTTP 200
```

### Acceptance Proof Inventory

| # | Acceptance Requirement | Evidence Artifact | Verification Status |
|---|------------------------|-------------------|:-------------------:|
| 1 | Kids menu leading to distinct destinations (`/c/girls`, `/c/boys`, `/c/kids`) | [proof_1_kids_menu_destinations.png](./docs/wave20-evidence/proof_1_kids_menu_destinations.png)<br>[proof_kids_girls.png](./docs/wave20-evidence/proof_kids_girls.png)<br>[proof_kids_girls_cross_sell.png](./docs/wave20-evidence/proof_kids_girls_cross_sell.png)<br>[proof_kids_boys.png](./docs/wave20-evidence/proof_kids_boys.png)<br>[proof_kids_kids.png](./docs/wave20-evidence/proof_kids_kids.png) | **VERIFIED** — 3 distinct collections, non-overlapping primary views, and intentional "More Children's Wear" cross-sell |
| 2 | `/c/sarees` with no irrelevant products in "More to explore" | [proof_2_sarees_more_to_explore.png](./docs/wave20-evidence/proof_2_sarees_more_to_explore.png) | **VERIFIED** — Strictly authentic sarees & handloom drapes; Taaga tunic eliminated |
| 3 | Jamdani PDP showing genuinely related category recommendations without self-recommendations, with single H1 | [proof_3_jamdani_pdp_recs.png](./docs/wave20-evidence/proof_3_jamdani_pdp_recs.png)<br>[proof_preview_jamdani_pdp.png](./docs/wave20-evidence/proof_preview_jamdani_pdp.png) | **VERIFIED** — Self-exclusion strictly enforced; single H1 validated; "Product Details & Craft" rendered as H2 |
| 4 | New Arrivals with verified catalog membership (Taaga items purged) | [proof_4_new_arrivals_assortment.png](./docs/wave20-evidence/proof_4_new_arrivals_assortment.png) | **VERIFIED** — Pure festive handloom curation; Taaga confined to everyday/bestsellers |
| 5 | Customer-facing PDP displaying Flame Fashion BD (not Songoskriti) | [proof_5_pdp_merchant_identity.png](./docs/wave20-evidence/proof_5_pdp_merchant_identity.png) | **VERIFIED** — Brand header and breadcrumb reflect merchant identity |
| 6 | Production desktop and mobile homepages | [proof_6_production_desktop.png](./docs/wave20-evidence/proof_6_production_desktop.png)<br>[proof_6_production_mobile.png](./docs/wave20-evidence/proof_6_production_mobile.png) | **VERIFIED** — Responsive, high-fidelity production rendering |
| 7 | Production route visual parity (`/c/girls`, `/c/boys`, `/c/kids`, `/c/sarees`, `/p/...`) | [proof_production_girls.png](./docs/wave20-evidence/proof_production_girls.png)<br>[proof_production_boys.png](./docs/wave20-evidence/proof_production_boys.png)<br>[proof_production_kids.png](./docs/wave20-evidence/proof_production_kids.png)<br>[proof_production_sarees.png](./docs/wave20-evidence/proof_production_sarees.png)<br>[proof_production_jamdani_pdp.png](./docs/wave20-evidence/proof_production_jamdani_pdp.png) | **VERIFIED** — Complete visual & merchandising parity confirmed live on production |
| 8 | Source SHA matching production `.output/DEPLOYED_SHA` | `c36be6bc777796ae07bcdbe9be5f1e99ad8f6bb8` | **VERIFIED** — Live bundle marker identical to commit |
| 9 | Authoritative release record and Section 20 | [report.md:L1-L60](./report.md#L1-L60) and [report.md:L1920-L2050](./report.md#L1920-L2050) | **VERIFIED** — Synchronized across `main` and `frame30` |

---

## 2. Visual Verification Proofs

### Proof 1: Kids Menu Navigation, Distinct Destinations & Intentional Cross-Selling

The Kids navigation now provides three dedicated destinations:
- **Girls Festive Wear** (`/c/girls`): Displays `girls-silk-festive-ghagra-choli` (and aliased `girls-embroidered-silk-ghagra-choli`). Zero sarees, zero adult clothes.
- **Boys Ethnic Wear** (`/c/boys`): Displays `boys-silk-panjabi-pajama-set` with authentic panjabi photography.
- **All Children's Wear** (`/c/kids`): Displays the full children's collection containing both kids items.
- **Intentional Cross-Sell**: On `/c/girls` and `/c/boys`, the secondary collection rail is explicitly titled **"More Children's Wear"** (`heading_bn: "আরও শিশুদের পোশাক"`) with `collection: "kids"`, providing transparent family wardrobe discovery.

![Kids Menu Destinations](./docs/wave20-evidence/proof_1_kids_menu_destinations.png)

````carousel
![Girls Festive Wear Destination](./docs/wave20-evidence/proof_kids_girls.png)
<!-- slide -->
![Intentional Kids Cross-Sell Rail](./docs/wave20-evidence/proof_kids_girls_cross_sell.png)
<!-- slide -->
![Boys Ethnic Wear Destination](./docs/wave20-evidence/proof_kids_boys.png)
<!-- slide -->
![All Children's Wear Destination](./docs/wave20-evidence/proof_kids_kids.png)
````

---

### Proof 2: Saree Collection Recommendation Relevance ("More to explore")

On `/c/sarees`, "More to explore" renders strictly authentic sarees and handloom drapes (`dhakai-jamdani-heritage-saree`, `muslin-floral-festive-saree`, `tangail-handloom-cotton-saree`). In `applyDemoFocus`, saree collections map secondary rail `collection` strictly to `"sarees"` (previously `"womens"`), eliminating `taaga-contemporary-linen-tunic`. Men's panjabis, kurtas, and quilts are also completely excluded.

![Sarees More to Explore](./docs/wave20-evidence/proof_2_sarees_more_to_explore.png)

---

### Proof 3: Jamdani PDP Category-Affinity Recommendations, Self-Exclusion & Single H1

On the Jamdani PDP (`/p/dhakai-jamdani-silk-saree` / `dhakai-jamdani-heritage-saree`):
- **Self-Exclusion**: The recommendation rail strictly excludes the currently viewed product. The "Complete the look" rail displays related handloom drapes (`muslin-floral-festive-saree` and `tangail-handloom-cotton-saree`), completely omitting `dhakai-jamdani-heritage-saree`.
- **Single DOM H1 Heading**: `ProductInfo` authors the single `<h1>` for the product title. Guarding `primaryId = baseTemplate === "product" ? null : primarySectionId(...)` in `ThemePreviewFrame.tsx` ensures "Product Details & Craft" renders with its authored `level: "h2"` (`<h2>`). Validated via Playwright and Vitest: `document.querySelectorAll("h1").length === 1`.

![Jamdani PDP Recommendations](./docs/wave20-evidence/proof_3_jamdani_pdp_recs.png)

---

### Proof 4: New Arrivals Catalog Assortment (Taaga Exclusion)

Under "New arrivals" (`new-in`), casual and fusion garments (`taaga-contemporary-linen-tunic` and `taaga-man-relaxed-khadi-shirt`) have been purged. The section features exclusively authentic handloom festive garments:
1. `rajshahi-silk-festive-panjabi`
2. `dhakai-jamdani-heritage-saree`
3. `muslin-floral-festive-saree`
4. `tangail-handloom-cotton-saree`

The Taaga pieces are retained strictly in `everyday` and `bestsellers` under `women` and `men`.

![New Arrivals Assortment](./docs/wave20-evidence/proof_4_new_arrivals_assortment.png)

---

### Proof 5: Customer-Facing PDP Merchant Identity

The customer-facing PDP renders the true merchant identity `Flame Fashion BD` in the brand header and breadcrumbs (`FLAME FASHION BD / DHAKAI JAMDANI HERITAGE SAREE`), completely eliminating internal theme blueprint names.

![PDP Merchant Identity](./docs/wave20-evidence/proof_5_pdp_merchant_identity.png)

---

### Proof 6: Production Desktop & Mobile Homepages

The live production storefront (`https://flamelancer.com`) renders cleanly across desktop and mobile viewports with authentic typography, photography, and navigation.

````carousel
![Production Desktop Homepage](./docs/wave20-evidence/proof_6_production_desktop.png)
<!-- slide -->
![Production Mobile Homepage](./docs/wave20-evidence/proof_6_production_mobile.png)
````

---

### Proof 7: Live Production Route Visual Parity (`flamelancer.com`)

Captured directly from live production `https://flamelancer.com` demonstrating 100% visual and merchandising parity across all primary collection and product routes:

````carousel
![Production Girls Collection](./docs/wave20-evidence/proof_production_girls.png)
<!-- slide -->
![Production Boys Collection](./docs/wave20-evidence/proof_production_boys.png)
<!-- slide -->
![Production Kids Collection](./docs/wave20-evidence/proof_production_kids.png)
<!-- slide -->
![Production Sarees Collection](./docs/wave20-evidence/proof_production_sarees.png)
<!-- slide -->
![Production Jamdani PDP](./docs/wave20-evidence/proof_production_jamdani_pdp.png)
````

---

## 3. Detailed Audit Findings & Resolution

### P0: Release and Production State Reconciliation
- **Authoritative SHA Receipt:** Verified live deployed SHA `c36be6bc777796ae07bcdbe9be5f1e99ad8f6bb8` in `/opt/frame28/.output/DEPLOYED_SHA` on `88.99.250.99`.
- **System Readiness:** `framique.service` active; readiness probe returns `HTTP 200 OK`.
- **Authoritative Records:** Updated [report.md](./report.md) header lines 1–60 and Section 20 with exact SHA receipts and repository-relative artifact links.

### P1: Kids Navigation Destinations & Intentional Cross-Selling
- **Root Cause:** In `src/lib/demo-catalog.ts`, `SONGOSKRITI.collections` lacked `girls` and `boys`. Requests to `/c/girls` fell back to `collection: "new-in"`, causing sarees and Taaga shirts to appear.
- **Resolution:** Added `girls`, `boys`, and `kids` to `SONGOSKRITI.collections` and `resolveDemoFocus`. Reconciled `girls-silk-festive-ghagra-choli` with `girls-embroidered-silk-ghagra-choli`. Strictly isolated categories in `previewDemoMap`.
- **Cross-Selling Clarified:** Renamed secondary rail in `/c/girls` and `/c/boys` to "More Children's Wear" (`heading_bn: "আরও শিশুদের পোশাক"`) with `collection: "kids"`.

### P1: Recommendation Relevance, Saree Isolation & Self-Exclusion
- **Root Cause:** Saree collections (`/c/sarees`) mapped secondary rail `collection` to `"womens"`, allowing `taaga-contemporary-linen-tunic` into recommendations.
- **Resolution:** In `src/lib/theme-preview-nav.ts`, mapped `collection: "sarees"` for all saree focuses (`sarees`, `jamdani`, `tangail`). Excluded the active product slug and its aliases from all PDP recommendation rails.
- **Regression Tests:** Added assertions in `src/components/store/songoskriti-preview-compositions.test.tsx` verifying allowed sarees and strictly rejecting the Taaga tunic, panjabi, kurta, quilt, jewellery, and kids items.

### P1: Collection Merchandising Cleaned
- **Root Cause:** `taaga-contemporary-linen-tunic` and `taaga-man-relaxed-khadi-shirt` had `"new-in"` listed in their demo catalog collections.
- **Resolution:** Purged `"new-in"` from both Taaga products. Retained them in `everyday` and `bestsellers` under `women` and `men`. Added `"new-in"` exclusively to authentic handloom pieces.

### P1: Customer-Facing PDP Brand Identity
- **Resolution:** Customer-facing PDP breadcrumb and header project `Flame Fashion BD` via `merchantBrand` in `ThemePreviewFrame.tsx`. Internal theme blueprint name `Songoskriti` is never exposed.

### P2: Trust Information, Craft Claims & Provenance Boundary
- **Database Receipts:** Verified directly against production Postgres `framique-supabase-db`:
  - `merchant_settings`: `support_email = 'support@flamelancer.com'`, `support_phone = '+880 1540 203662'`, `cod_enabled = true`, `cod_surcharge_minor_int = 0`.
  - `products`: Verified regional provenance records for Rajshahi silk, Sonargaon Jamdani, Mirpur Benarasi Katan, Jessore Nakshi Kantha, and Tangail Delduar pit looms.
- **Provenance Boundary:** Documented that while database records confirm storefront configuration and schema integrity, external third-party physical supply chain audits are distinct operations outside the software platform boundary.

### P2: Product-Page Content Cleanup & DOM Single H1 Check
- **Resolution:** Guarded `primaryId = baseTemplate === "product" ? null : primarySectionId(...)` in `ThemePreviewFrame.tsx`. Ensured `document.querySelectorAll("h1").length === 1` with `{product.title}` as the sole `<h1>` and "Product Details & Craft" as `<h2>`.

### Production Direct Access & Network Scope Note
- **Apex Domain Requirement:** The live merchant storefront is reachable via `https://flamelancer.com/` (resolving to `88.99.250.99`). The `www.` subdomain (`www.flamelancer.com`) is not mapped in DNS.
- **Auditing in Egress-Restricted Environments:** In sandboxed runtime environments without direct outbound web access, all visual proofs of production and preview parity are preserved as high-resolution images in [`docs/wave20-evidence/`](./docs/wave20-evidence/).

---

## 4. Verification & Deployment Record

- **Authoritative Commit SHA:** `c36be6bc777796ae07bcdbe9be5f1e99ad8f6bb8`
- **Server Bundle Marker:** `c36be6bc777796ae07bcdbe9be5f1e99ad8f6bb8`
- **Readiness Check:** `http://127.0.0.1:3200/api/healthz?type=readiness` -> `HTTP 200 OK`
- **Synchronized Tracking Branches:** `main` and `frame30`
- **Production Storefront:** `https://flamelancer.com/` -> `HTTP/2 200 OK`
- **Theme Preview Storefront:** `https://framique.qubickle.com/theme-preview/songoskriti` -> `HTTP/2 200 OK`
- **Automated Verification:**
  - `bun run typecheck` — **PASS** (0 errors)
  - `bun test src/lib/preview-demo-data.test.ts src/lib/themes/songoskriti/preview.test.ts` — **PASS** (9/9 tests passed)
  - `bunx vitest run src/components/store/songoskriti-preview-compositions.test.tsx` — **PASS** (11/11 tests passed)
  - `bun run test:contracts` — **PASS** (13 contract suites, 258 tests passed)
