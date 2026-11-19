# New Theme Pull Request Checklist

**Document Version:** 1.0.0  
**Target:** Theme Authors, Reviewers, and Release Engineers  

---

Every pull request introducing or modifying a Frame30 theme must pass every item on this checklist before merging into `main` or `frame30`.

---

## 1. Theme Manifest & Metadata Verification

- [ ] **SemVer Versioning**: Theme manifest specifies a valid SemVer string (e.g. `1.0.0`).
- [ ] **Bilingual Naming**: `name` and `summary` include both English (`en`) and Bengali (`bn`) fields.
- [ ] **Author Metadata**: Author name and support contact/email are declared.
- [ ] **Compatible Builder Engine**: `builderVersion` specifies compatible builder engine (e.g. `^2.0.0`).
- [ ] **Certification State**: Theme manifests start in `draft` or `validating`, moving to `released` only upon passing all release gates.
- [ ] **Template Map**: Templates (`index`, `collection`, `product`, `page`, etc.) are mapped to default section lists.
- [ ] **Registered Viewports**: Includes all 8 mandatory viewports (`320`, `360`, `390`, `430`, `768`, `1024`, `1280`, `1440`).

---

## 2. Studio Editor Controls & Media Binding

- [ ] **Zero Raw Text Image Controls**: Every image, hero background, banner, and logo is configured with `type: "image"` — **never** `type: "text"`.
- [ ] **Nested Repeaters Audited**: All repeater rows containing media (e.g. department cards, slides, lookbook tiles) use `type: "image"` for image fields.
- [ ] **Alternative Text Controls**: Repeaters and editorial sections provide an `alt` or `imageAlt` field for merchant-authored descriptions.
- [ ] **Tab Organization**: Controls are grouped logically into `General` (`content`), `Style`, and `Advanced` tabs.
- [ ] **Safe Default Settings**: Section default settings supply valid fallback values matching the control schemas.

---

## 3. Responsive Viewport Fidelity

- [ ] **Tested Viewports (8/8 Pass)**:
  - `320px` (iPhone SE): No horizontal overflow (`scrollWidth <= clientWidth`).
  - `360px` (Small Android): Elements wrap gracefully.
  - `390px` (Standard iPhone): Navigation and grid fit cleanly.
  - `430px` (Large iPhone): Typography scales smoothly.
  - `768px` (Tablet Portrait): Multicolumn layouts adjust (2 or 3 columns).
  - `1024px` (Laptop / Tablet Landscape): Header and grids adapt.
  - `1280px` (Desktop): Full container margins intact.
  - `1440px` (Wide Desktop): Max-width containers prevent over-stretching.
- [ ] **Touch Targets**: All mobile buttons, links, and accordion toggles meet minimum 40×40px tap area.

---

## 4. Dynamic Data Isolation & Anti-Fabrication

- [ ] **No Hardcoded Promises**: Zero unverified merchant promises ("100% Cotton", "Free Returns", "Govt Approved") baked into markup.
- [ ] **No Third-Party Handles**: Zero hardcoded social handles, WhatsApp numbers, or personal phone numbers.
- [ ] **Context-Driven Currency**: Currency displays use store-provided `currency_code` and integer minor units (`amount_minor_int`).
- [ ] **Honest Fallbacks**: Missing merchant profile fields fall back to neutral generic chrome, never third-party brand data.

---

## 5. Centralized SEO & Structured Data

- [ ] **Shared Pipeline**: All public storefront routes use `src/lib/theme-seo.ts` (`buildCollectionHead`, `buildProductHead`, `buildStoreHead`).
- [ ] **No Inline `<head>` Scripts**: Themes do not inject bespoke `<head>` tags or ad-hoc JSON-LD scripts.
- [ ] **Structured Data Verification**:
  - Home: `Organization`, `WebSite`, `ItemList`.
  - Collections: `CollectionPage`, `ItemList`, `BreadcrumbList`.
  - Products: `Product`, `Offer`, `BreadcrumbList`.
- [ ] **Private Route Protection**: Checkout (`store.$slug.checkout.tsx`) and Parcel Tracking (`store.$slug.track.tsx`) enforce `{ name: "robots", content: "noindex, nofollow" }`.

---

## 6. Accessibility (WCAG 2.2 AA)

- [ ] **Meaningful Alt Text**: All content images render `alt={item.alt || item.title || ""}`.
- [ ] **Decorative Image Marking**: Decorative or hover overlay images have `alt=""` and `aria-hidden="true"`.
- [ ] **Asynchronous Decoding**: Images include `loading="lazy"` and `decoding="async"`.
- [ ] **Keyboard Focus**: Focus visible states styled with distinct outline/ring (`focus-visible:ring-2`).
- [ ] **Color Contrast**: Text maintains at least 4.5:1 contrast against backgrounds.

---

## 7. Backward Compatibility

- [ ] **Legacy AST Compatibility**: Theme cleanly renders saved merchant configurations where images are stored as plain string URLs.
- [ ] **Structured Media Compatibility**: Theme cleanly renders structured `MediaValue` objects (`{ url, alt, width, height }`).
- [ ] **Zero Database Mutations**: Upgrading editor control schemas requires zero database migrations or table alters.

---

## 8. Verification & Gate Execution

Run the following commands locally and confirm 100% pass:

```bash
# Typecheck
bun run typecheck

# Theme Compliance Suite
bun run test:theme-compliance

# Feature map check
bun run test:features

# Contract suites
bun run test:contracts

# Full unit test suite
bun run test
```

Attach the test receipts and evidence summary to the PR description.
