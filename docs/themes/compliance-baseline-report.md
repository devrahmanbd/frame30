# Frame30 Theme Compliance Baseline Report

**Document Version:** 1.0.0  
**Date:** 2026-11-19  
**Status:** Baseline Completed  
**Reference Target:** Songoskriti Reference Theme Implementation  

---

## 1. Executive Summary

As Frame30 expands its WordPress-grade CMS and visual page builder architecture, theme quality and contract enforcement must be verified deterministically. Themes must not simply look complete in a static mockup; they must be fully editable via the visual page builder without code modification, responsive across mobile, tablet, and desktop viewports, bound strictly to merchant dynamic data, accessible according to WCAG 2.2 AA, and structured-data complete for search engines.

This baseline audit evaluates all built-in themes in Frame30—focusing deeply on the flagship reference implementation **Songoskriti**—against the 8 Core Pillars of the Frame30 Theme Compliance Standard.

---

## 2. Theme Catalog & Architectural Inventory

Frame30 currently maintains 6 primary built-in theme presets defined across `src/lib/themes/builtin-themes.ts` and `src/lib/theme-presentations.ts`:

| Theme ID | Name | Target Vertical | Layout Style | Section Count | Blueprint Key |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `songoskriti` | **Songoskriti** | Artisan & Heritage Fashion | Editorial Luxury Grid | 21 Sections | `songoskriti` |
| `default` | **Default Clean** | General E-Commerce | Minimal Modern Commerce | 12 Sections | `default` |
| `minimal` | **Nordic Minimal** | Minimalist Apparel / Home | High-Whitespace Showcase | 10 Sections | `minimal` |
| `boutique` | **Maison Boutique** | Luxury Cosmetics / Jewels | Serif Elegance Split Grid | 14 Sections | `boutique` |
| `editorial` | **Vogue Editorial** | High Fashion Magazine | Story-Driven Full Bleed | 16 Sections | `editorial` |
| `artisan` | **Craft Artisan** | Handcrafted Goods / Pottery | Earthy Warm Masonry | 11 Sections | `artisan` |

### Songoskriti Section Inventory
Songoskriti provides 21 dedicated and shared sections defined in `src/components/builder/songoskriti.tsx` and controlled via `src/lib/studio/controls.ts`:
1. `hero` / `songoskriti_hero` — Full-width editorial hero with overlay typography
2. `announcement_bar` — Dismissible top banner for store announcements
3. `department_grid` — Interactive department / taxonomy grid with hover states
4. `featured_products` / `product_grid` — Dynamic product showcase bound to catalog
5. `heritage_story` — Brand narrative split layout with archival imagery
6. `editorial_banner` — High-impact banner with CTA
7. `textile_showcase` — Material and craft exploration cards
8. `lookbook` — Interactive editorial imagery with shoppable hotspots
9. `split_feature` — Asymmetric dual-column storytelling block
10. `collection_story` — Curated collection editorial with secondary imagery
11. `ugc_gallery` — Customer lifestyle social proof gallery
12. `reviews_slider` — Verified customer testimonial carousel
13. `newsletter` — Customer email subscription capture
14. `craft_process` — Step-by-step artisanal process timeline
15. `value_props` — Store guarantees and service highlights
16. `faq_accordion` — Accessible collapsible Q&A section
17. `brand_pillars` — Core ethos and environmental commitments
18. `press_mentions` — Logo banner and press quotes
19. `instagram_feed` — Social visual grid
20. `store_locator` — Physical showroom / stockist map and details
21. `footer` — Multi-column hierarchical navigation and compliance links

---

## 3. Evaluation Against the 8 Core Pillars

### Pillar 1: Builder Compatibility
- **Status:** PARTIAL COMPLIANCE (High Risk Gaps Identified)
- **Evaluation:**
  - Blueprints in `src/lib/themes/songoskriti/` correctly serialize to the standard AST (`PageAST` with `PageSection[]`).
  - Section keys resolve through `SectionRenderer.tsx` and registry maps.
  - **Gap:** There is no unified, versioned `ThemeContract` interface or Zod validation schema guaranteeing that all theme presets conform to standard manifest definitions and lifecycle states (`draft`, `validating`, `failed`, `passed`, `released`).

### Pillar 2: No-Code Editability & Media Binding
- **Status:** NON-COMPLIANT (Critical Defect)
- **Evaluation:**
  - In `src/lib/studio/controls.ts`, multiple image fields were configured as `type: "text"` instead of `type: "image"`.
  - Specifically:
    - `department_grid`: repeater items had `image` and `hoverImage` defined with `type: "text"`.
    - `heritage_story`: `image` defined with `type: "text"`.
    - `editorial_banner`: `image` and `mobileImage` defined with `type: "text"`.
    - `lookbook`: hotspot item images defined with `type: "text"`.
    - `textile_showcase`, `split_feature`, `collection_story`, `ugc_gallery`: image fields defined with `type: "text"`.
  - **Consequence:** `StudioControls.tsx` only renders `ImageField` (which invokes the Media Picker / Asset Library dialog, preview, and alt-text extraction) when `control.type === "image"`. When set to `type: "text"`, merchants are forced to manually paste raw CDN URLs into an `<Input>` element without access to the media library or image previews.

### Pillar 3: Responsive Viewport Fidelity
- **Status:** COMPLIANT
- **Evaluation:**
  - CSS uses mobile-first Tailwind v4 classes with grid and flexbox wrappers (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`).
  - Tested viewports (320px, 360px, 390px, 430px, 768px, 1024px, 1280px, 1440px) show no horizontal overflow (`scrollWidth <= clientWidth`).
  - Fluid typography and responsive spacing scale gracefully without clipping or text overlap.

### Pillar 4: Dynamic Data Isolation & Anti-Fabrication
- **Status:** PARTIAL COMPLIANCE (Remediation Needed)
- **Evaluation:**
  - Dynamic products correctly pull from catalog query hooks and server RPCs.
  - Price values are rendered from integer minor units (`amount_minor_int`).
  - **Gaps:** Default blueprint data contained placeholder claims and dummy contact numbers that must be cleanly partitioned into editable settings with sensible fallback defaults, ensuring no unverified merchant promises appear when merchant profile fields are empty.

### Pillar 5: Centralized SEO & Structured Data Parity
- **Status:** NON-COMPLIANT (Architectural Defect)
- **Evaluation:**
  - `src/lib/theme-seo.ts` provided `buildStoreHead`, `buildProductHead`, `buildPageHead`, and `buildSearchHead`, but completely omitted `buildCollectionHead`.
  - Consequently, `src/routes/store.$slug.c.$collectionSlug.tsx` implemented an ad-hoc inline `head` function:
    - Omitted OpenGraph image tags (`og:image`).
    - Omitted Twitter summary card tags (`twitter:card`, `twitter:image`).
    - Omitted `CollectionPage` and `ItemList` JSON-LD schema definitions.
    - Omitted canonical alternate links.
  - Private transactional routes (`store.$slug.checkout.tsx` and `store.$slug.track.tsx`) were missing explicit `{ name: "robots", content: "noindex, nofollow" }` directives, risking indexing of checkout sessions.

### Pillar 6: Accessibility (WCAG 2.2 AA) & Performance
- **Status:** PARTIAL COMPLIANCE
- **Evaluation:**
  - Contrast ratios for Songoskriti satisfy 4.5:1 for body copy and 3:1 for large headers.
  - Keyboard navigation functions across buttons and accordion toggles.
  - **Gaps:** Department cards and editorial image elements lacked explicit fallback alt text attributes (`alt={item.alt || item.title || ""}`), resulting in empty or missing `alt` attributes on several rendered images.

### Pillar 7: Saved Configuration Backward Compatibility
- **Status:** COMPLIANT (Design Constraint to Uphold)
- **Evaluation:**
  - Existing merchant stores have saved AST configurations stored in Postgres with plain string image URLs.
  - When upgrading control schemas from `type: "text"` to `type: "image"`, the schema and renderer must accept both plain strings and rich image objects (`{ url, alt, width, height }`) without crashing or requiring database migrations.

### Pillar 8: Automated Testability & CI Gating
- **Status:** NON-COMPLIANT
- **Evaluation:**
  - No automated Theme Compliance Test Suite existed in `src/lib/themes/`.
  - CircleCI did not include a theme compliance gate in the `unit-contract` pipeline.

---

## 4. Remediation Plan

| ID | Area | Action Required | Target File |
| :--- | :--- | :--- | :--- |
| **REM-01** | Manifest | Establish `ThemeContract` v1.0.0 schema with validation | `src/lib/theme-contract.ts` |
| **REM-02** | Studio Controls | Convert all image controls from `text` to `image` type | `src/lib/studio/controls.ts` |
| **REM-03** | Songoskriti | Add robust alt fallbacks and responsive image attributes | `src/components/builder/songoskriti.tsx` |
| **REM-04** | SEO Engine | Implement `buildCollectionHead` with JSON-LD `CollectionPage` + `ItemList` | `src/lib/theme-seo.ts` |
| **REM-05** | Routes | Route collection head through `buildCollectionHead` | `src/routes/store.$slug.c.$collectionSlug.tsx` |
| **REM-06** | Privacy / SEO | Add `robots: "noindex, nofollow"` to checkout & tracking routes | `src/routes/store.$slug.checkout.tsx`, `store.$slug.track.tsx` |
| **REM-07** | Compliance Suite | Create reusable Theme Compliance Test Suite | `src/lib/themes/theme-compliance.test.ts` |
| **REM-08** | CI Integration | Wire `test:theme-compliance` into `package.json` & CircleCI | `package.json`, `.circleci/config.yml` |
| **REM-09** | Authoring Guide | Publish Theme Authoring Standard & New-Theme PR Checklist | `docs/themes/theme-authoring-standard.md`, `new-theme-pr-checklist.md` |
| **REM-10** | Certification | Generate Songoskriti Reference Implementation Certification Report | `docs/themes/songoskriti-compliance-report.md` |
