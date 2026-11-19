# Frame30 Theme Authoring Standard

**Specification Version:** 1.0.0  
**Effective Date:** 2026-11-19  
**Status:** Mandatory Architecture Standard  

---

## 1. Overview

This standard defines the architectural requirements, schema constraints, and quality standards for all official and third-party themes in Frame30. Every theme must be editable without modifying source code, fully compatible with the visual page builder, responsive across all standard device viewports, accessible to WCAG 2.2 AA, and backed by automated compliance tests.

Themes in Frame30 are **architectural extensions**, not arbitrary HTML bundles. They plug directly into the visual page builder AST, the centralized SEO and structured data engine, and the minor-unit commerce system.

---

## 2. The 8 Core Pillars of Theme Compliance

```
[Pillar 1: Manifest & Contracts]   → Versioned SemVer manifest + typed section definitions
[Pillar 2: No-Code Editability]    → Media controls (type: "image"), repeaters, style tabs
[Pillar 3: Viewport Fidelity]      → 8 standard viewports (320px–1440px), zero overflow
[Pillar 4: Dynamic Data Isolation] → Zero hardcoded vendor claims, phone numbers, or currencies
[Pillar 5: Centralized SEO Engine] → Shared build*Head pipeline, JSON-LD, canonicals, robots
[Pillar 6: WCAG 2.2 AA A11y]       → Image alt fallbacks, contrast >= 4.5:1, focus states
[Pillar 7: Backward Compatibility] → Plain URL strings and MediaValue objects both resolve cleanly
[Pillar 8: Automated Verification] → Enforced in CI via test:theme-compliance gate
```

---

## 3. Theme Manifest Specification (`ThemeManifest` v1.0.0)

Every theme must declare a manifest conforming to `ThemeManifestSchema` defined in [`src/lib/theme-contract.ts`](file:///Users/rahman/Documents/frame30/src/lib/theme-contract.ts).

### Manifest Fields
- **`id`** (`string`): Lowercase alphanumeric identifier with hyphens/underscores (e.g., `"songoskriti"`).
- **`version`** (`string`): Valid SemVer string (e.g., `"1.1.0"`).
- **`name`** (`{ en: string; bn?: string }`): Bilingual brand title.
- **`summary`** (`{ en: string; bn?: string }`): Bilingual descriptive summary.
- **`author`** (`{ name: string; url?: string; supportEmail?: string }`): Author metadata.
- **`builderVersion`** (`string`): Compatible builder engine version (default `^2.0.0`).
- **`certificationState`** (`ThemeCertificationState`): One of `"draft" | "validating" | "failed" | "passed" | "released"`.
- **`templates`** (`Record<string, string[]>`): Default section arrangements per template (`index`, `collection`, `product`, `page`, etc.).
- **`responsiveViewports`** (`string[]`): Must include at minimum `["320", "360", "390", "430", "768", "1024", "1280", "1440"]`.

---

## 4. Studio Editor Controls & Media Binding

### Rule: Strict Media Typing
**NEVER declare an image or photo control with `type: "text"`.**

When a control is typed as `"text"`, the visual page builder renders a plain string input. Merchants are blocked from opening the Media Library, browsing assets, uploading images, or inspecting previews.

Image controls must ALWAYS be declared as `type: "image"`:

```ts
// ❌ INCORRECT: Forces merchant to type/paste raw image URLs manually
c({
  key: "image",
  label: "Image URL",
  type: "text",
  tab: "content",
  section: "Grid",
})

// ✅ CORRECT: Enables Media Library picker, asset preview, and alt extraction
c({
  key: "image",
  label: "Image",
  type: "image",
  tab: "content",
  section: "Grid",
}),
c({
  key: "alt",
  label: "Alternative text",
  type: "text",
  tab: "content",
  section: "Grid",
})
```

### Media Value Backward Compatibility
Themes must handle both legacy plain URL strings and structured `MediaValue` objects:
```ts
export type StructuredMediaValue = {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  focalPoint?: { x: number; y: number };
};
```
Always use `resolveMediaUrl(value)` and `resolveMediaAlt(value, fallback)` from `src/lib/theme-contract.ts` or ensure string extractors accept objects safely.

---

## 5. Responsive Viewport Fidelity

Themes must be mobile-first and fluidly responsive across all 8 verified viewports:
1. `mobile-320` (320 × 568) — iPhone SE
2. `mobile-360` (360 × 640) — Small Android
3. `mobile-390` (390 × 844) — Standard iPhone
4. `mobile-430` (430 × 932) — Large iPhone Plus/Max
5. `tablet-768` (768 × 1024) — iPad portrait
6. `laptop-1024` (1024 × 768) — Small laptop / tablet landscape
7. `desktop-1280` (1280 × 800) — Standard desktop
8. `desktop-1440` (1440 × 900) — Wide desktop

### Responsive Invariants
- `scrollWidth <= clientWidth` on all viewport widths (zero horizontal overflow).
- Fluid typography and responsive spacing (e.g. `text-[28px] sm:text-[36px]`, `py-16 sm:py-20`).
- Responsive grid containers (e.g. `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6`).
- Touch targets on interactive elements must meet minimum 44×44px or 40×40px with margin.

---

## 6. Dynamic Data Isolation & Anti-Fabrication

Frame30 strictly prohibits hardcoding merchant claims, fake trust guarantees, or external third-party links:
1. **No Hardcoded Promises**: Never bake static claims like "100% Cotton Guarantee", "10-Day Free Return", or "Govt Certified" into section code. All claims must be editable via section settings with honest neutral defaults.
2. **No Third-Party Handles**: Never hardcode external social handles (e.g. `https://instagram.com/flamefashionbd`). Social handles must resolve from merchant settings. If unset or invalid, omit or disable the link.
3. **Currency & Money Integrity**: All money values must be represented in integer minor units (`amount_minor_int` and `currency_code`). Never format money using floating-point math or hardcode "$" or "৳" in template markup.

---

## 7. Centralized SEO & Structured Data Integration

All public storefront routes must resolve SEO metadata through `src/lib/theme-seo.ts`:
- **Storefront Home**: `buildStoreHead(input)` (`Organization`, `WebSite`, `ItemList`).
- **Product Details**: `buildProductHead(input)` (`Product`, `Offer`, `BreadcrumbList`).
- **Collections**: `buildCollectionHead(input)` (`CollectionPage`, `ItemList`, `BreadcrumbList`).
- **Content Pages**: `buildPageHead(input)` (`Article`, `BreadcrumbList`, optional `FAQPage`).
- **Search**: `buildSearchHead(input)` (`website`, dynamic search action).
- **Private Routes**: Transactional routes (`checkout.tsx` and `track.tsx`) MUST emit `{ name: "robots", content: "noindex, nofollow" }`.

---

## 8. Accessibility Requirements (WCAG 2.2 AA)

1. **Alternative Text**:
   - Every `<img>` element must have a meaningful `alt` attribute.
   - For repeater cards, use `alt={item.alt || item.title || ""}`.
   - For decorative overlay images or background hover textures, explicitly mark `alt=""` and `aria-hidden="true"`.
   - Always specify `loading="lazy"` (except for above-the-fold hero images) and `decoding="async"`.
2. **Keyboard Navigation & Focus**:
   - Interactive elements (`<a>`, `<button>`) must have clear focus rings: `focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]`.
   - Collapsible accordions must reflect `aria-expanded` states.
3. **Color Contrast**:
   - Body copy must maintain at least 4.5:1 contrast against surface backgrounds.
   - Large headings must maintain at least 3:1 contrast.

---

## 9. Verification & Gate Enforcement

Before any theme PR can be merged:
```bash
# 1. Typecheck
bun run typecheck

# 2. Automated Theme Compliance Suite
bun run test:theme-compliance

# 3. Unit and Contract Suites
bun run test
bun run test:contracts

# 4. Feature map integrity
bun run test:features
```
CircleCI enforces `test:theme-compliance` in the `unit-contract` job on all branches and pull requests.
