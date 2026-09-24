# Heritage (Clothing) Theme — Full Rebuild Design

**Date:** 2026-09-20
**Status:** Approved — Ready for implementation
**Scope:** Full rebuild of `clothing-heritage` blueprint, 8 new widgets, demo catalog, import system, live preview

---

## 1. Theme Identity & Tokens

**Name:** Heritage (Clothing)
**Key:** `clothing-heritage` (reuses existing key for backward compat)
**Category:** Fashion
**Genre:** Editorial — Aarong-inspired handcrafted, story-driven aesthetic

### Tokens

| Token         | Value                                                               | Reasoning                                      |
| ------------- | ------------------------------------------------------------------- | ---------------------------------------------- |
| `brand`       | `#1A1A1A`                                                           | Near-black, like Aarong's nav                  |
| `accent`      | `#C45D3E`                                                           | Terracotta-heritage (Aarong's warm earth tone) |
| `surface`     | `#FAF8F5`                                                           | Warm ivory, like handmade paper                |
| `ink`         | `#2D2A26`                                                           | Warm charcoal                                  |
| `radius`      | `2px`                                                               | Sharp, editorial — not rounded                 |
| `container`   | `1320px`                                                            | Wide editorial                                 |
| `density`     | `airy`                                                              | Heritage breathing room                        |
| `typeScale`   | `expressive`                                                        | Big headings, confident                        |
| `fontDisplay` | `Playfair Display`                                                  | High-contrast serif (Aarong's editorial feel)  |
| `fontBody`    | `Inter`                                                             | Clean readability                              |
| `shadow`      | `soft`                                                              | Subtle elevation                               |
| `motion`      | `subtle`                                                            | Elegant, not flashy                            |
| `dark`        | brand `#FAF8F5`, accent `#D4784A`, surface `#1A1816`, ink `#F0EDE8` |

### Editorial Font Pairing

```json
{
  "fontDisplay": "Playfair Display",
  "fontBody": "Inter",
  "fontMono": "IBM Plex Mono",
  "typeScale": "expressive",
  "density": "airy"
}
```

---

## 2. New Widgets (8)

| #   | Widget                   | SectionType            | Description                                                                                  |
| --- | ------------------------ | ---------------------- | -------------------------------------------------------------------------------------------- |
| 1   | **Hero Carousel**        | `hero_carousel`        | Full-viewport swiping hero with headline, subhead, CTA, caption. 3-5 slides auto-advance 5s. |
| 2   | **Department Grid**      | `department_grid`      | 6-8 image cards with name + count. Tappable categories.                                      |
| 3   | **Heritage Story**       | `heritage_story`       | Split: large editorial image + story text + founder quote.                                   |
| 4   | **Textile Showcase**     | `textile_showcase`     | Side-by-side product pair with "Shop the collection" CTA.                                    |
| 5   | **Editorial Banner**     | `editorial_banner`     | Full-width photographic story banner with overlaid text.                                     |
| 6   | **Testimonial Carousel** | `testimonial_carousel` | Quote + author + image, auto-rotating.                                                       |
| 7   | **Marquee Strip**        | `marquee_strip`        | Infinite horizontal scroll text/icons.                                                       |
| 8   | **Story Trunk**          | `story_trunk`          | Collapsible FAQ accordion — answers slide open/down.                                         |

### Inherited Widgets (unchanged)

sub-brand-bar, editorial-hero (used as hero-carousel internally), circle-categories (used as department-grid internally), product-rail, split-feature, cta-banner, lookbook, shoppable-image, contact-form, size-selector, sustain-badge, support-strip, footer-sitemap, live-coordinates, shop-local, instagram-cta.

### Props Types (new)

```typescript
// hero_carousel
interface HeroCarouselProps {
  slides: Array<{
    image: string;
    headline: string;
    subhead: string;
    cta_label: string;
    cta_url: string;
    caption: string;
  }>;
  autoAdvanceMs: number; // default 5000
}

// department_grid
interface DepartmentGridProps {
  departments: Array<{
    image: string;
    name: string;
    name_bn: string;
    count: number;
    href: string;
  }>;
  columns: number; // default 4
}

// heritage_story
interface HeritageStoryProps {
  image: string;
  headline: string;
  body: string;
  founder_quote: string;
  founder_name: string;
  layout: "left" | "right"; // default 'left'
}

// textile_showcase
interface TextileShowcaseProps {
  products: Array<{
    image: string;
    name: string;
    name_bn: string;
    price: number;
    href: string;
  }>;
  headline: string;
  cta_label: string;
}

// editorial_banner
interface EditorialBannerProps {
  image: string;
  headline: string;
  subhead: string;
  cta_label: string;
  cta_url: string;
  overlay: "dark" | "light"; // default 'dark'
}

// testimonial_carousel
interface TestimonialCarouselProps {
  testimonials: Array<{
    quote: string;
    author: string;
    image: string;
  }>;
  autoAdvanceMs: number; // default 4000
}

// marquee_strip
interface MarqueeStripProps {
  items: Array<{
    text: string;
    icon: string;
  }>;
  speed: "slow" | "normal" | "fast"; // default 'normal'
  direction: "left" | "right"; // default 'left'
}

// story_trunk
interface StoryTrunkProps {
  items: Array<{
    question: string;
    answer: string;
  }>;
  allowMultiple: boolean; // default false
}
```

---

## 3. Templates (6 Pages)

| #   | Template           | Sections (top → bottom)                                                                                                                                    | Purpose                               |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1   | **Homepage**       | hero_carousel → department_grid → product_rail (newArrivals) → heritage_story → textile_showcase → editorial_banner → testimonial_carousel → marquee_strip | Aarong-style landing                  |
| 2   | **Collection**     | heritage_story → product_rail (filtered) → textile_showcase                                                                                                | Category landing                      |
| 3   | **Product Detail** | split-feature → size-selector → textile_showcase → testimonials → support_strip                                                                            | PDP with cross-sell                   |
| 4   | **About**          | heritage_story → editorial_banner → artisan_grid → marquee_strip → story_trunk → testimonials                                                              | Brand story page                      |
| 5   | **Contact**        | heritage_story (text only) → contact-form → live-coordinates → support_strip                                                                               | Contact page                          |
| 6   | **Full Width**     | hero_carousel (single slide) → any sections                                                                                                                | Blank canvas — page-builder exclusive |

### Blueprint JSON Structure

```json
{
  "key": "clothing-heritage",
  "name": "Heritage (Clothing)",
  "name_bn": "হেরিটেজ (পোশাক)",
  "category": "Fashion",
  "genre": "editorial",
  "description": "Aarong-inspired editorial theme with handcrafted heritage aesthetic",
  "tokens": { "... tokens from section 1 ..." },
  "templates": {
    "homepage": [ "... sections ..." ],
    "collection": [ "... sections ..." ],
    "pdp": [ "... sections ..." ],
    "about": [ "... sections ..." ],
    "contact": [ "... sections ..." ],
    "fullwidth": [ "... sections ..." ]
  }
}
```

---

## 4. Demo Catalog

50+ products across 8 departments with real Bengali product names and BDT pricing.

| Department       | Product Count | Example Products                |
| ---------------- | ------------- | ------------------------------- |
| Women's Sarees   | 8             | Jamdani, Silk, Muslin           |
| Men's Panjabis   | 6             | Cotton, Silk, Traditional       |
| Men's Kurtas     | 5             | casual, formal, embroidered     |
| Women's Kurtas   | 6             | A-line, straight, Anarkali      |
| Jewelry          | 5             | necklace, earrings, bangles     |
| Home Decor       | 5             | Cushion, Table Runner, Wall Art |
| Scarves & Stoles | 5             | Silk, Cotton, Embroidered       |
| Shoes            | 5             | Kolhapuri, Mojaris, Sandals     |

### Each Product Includes

- Name (English + Bengali)
- Original price + sale price (BDT)
- SKU, barcode
- Category assignment
- Images (deterministic monogram tiles — no external URLs)

### Categories

Pre-created with hierarchy (8 top-level + 15 subcategories):

```
Women's
├── Sarees
├── Kurtas
├── Jewelry
└── Scarves & Stoles
Men's
├── Panjabis
├── Kurtas
└── Shoes
Home
└── Decor
```

---

## 5. Import Demo Data System

**Security:** No single monolithic SQL migration. Controlled step-by-step via dedicated RPCs.

### UX Flow

When a merchant activates the Heritage theme, an **Import Demo Data** panel appears in the Appearance sidebar:

```
Import Demo Data
─────────────────
Choose what to import to your store:
☐ Homepage slides (hero images, captions, CTAs)
☐ Media library (sample product photos, banners)
☐ Products with images (50+ demo products)
☐ Blog posts (sample content)
☑ All of the above (recommended)

[Import Selected Data]
```

### Architecture

| Import Type | RPC                                | What it does                                             |
| ----------- | ---------------------------------- | -------------------------------------------------------- |
| Slides      | `import_theme_slides(theme_key)`   | Creates `theme_slides` rows for the activated theme      |
| Media       | `import_theme_media(theme_key)`    | Creates sample `media_assets` entries with monogram URLs |
| Products    | `import_theme_products(theme_key)` | Creates products + variants + category assignments       |
| Posts       | `import_theme_posts(theme_key)`    | Creates sample blog posts                                |
| All         | `import_theme_all(theme_key)`      | Runs all four in sequence                                |

### Security Rules

- Each RPC checks auth + merchant ownership
- No raw SQL — all mutations via existing service-layer functions
- Import is idempotent — running twice doesn't duplicate data
- Merchant gets a confirmation dialog before import

### File Changes

| File                                               | Change                                        |
| -------------------------------------------------- | --------------------------------------------- |
| `src/components/admin/themes/ThemesScreen.tsx`     | Add Import Demo Data panel after activation   |
| `src/components/admin/themes/import-demo-data.tsx` | New component — checkbox UI + import logic    |
| `src/lib/theme-imports.server.ts`                  | New file — RPC wrappers for import operations |
| `supabase/migrations/`                             | New migration for import RPCs                 |

---

## 6. Live Preview in Marketplace

When a merchant browses themes in Appearance, they see a **Preview** button that shows the theme with demo data loaded.

### Architecture

| Layer                | Implementation                                                                       |
| -------------------- | ------------------------------------------------------------------------------------ |
| **Preview route**    | `src/routes/theme-preview.$key.tsx` — renders theme with demo data, no auth required |
| **Demo data source** | Blueprint tokens + demo catalog (deterministic — no live DB needed for preview)      |
| **Preview iframe**   | ThemesScreen opens preview in a full-screen modal or new tab                         |
| **Demo products**    | Generated from blueprint metadata (no DB query for preview)                          |

### UX Flow

1. Merchant browses themes in Appearance
2. Clicks **Preview** on Heritage (Clothing)
3. Opens full-screen preview showing Homepage template with demo products
4. Can navigate between templates (Homepage, Collection, PDP, About, Contact)
5. Clicks **Activate** to apply theme to their store

### File Changes

| File                                           | Change                                     |
| ---------------------------------------------- | ------------------------------------------ |
| `src/routes/theme-preview.$key.tsx`            | New route — theme preview with demo data   |
| `src/components/admin/themes/ThemesScreen.tsx` | Add Preview button to theme cards          |
| `src/components/store/ThemePreviewFrame.tsx`   | New component — iframe wrapper for preview |

---

## 7. Implementation Plan

### Phase 1: Tokens & Blueprint (1 session)

1. Refine `clothing-heritage` tokens in `theme-blueprints.ts`
2. Create 6 templates as blueprint sections
3. Register new `SectionType` members in `builder-ast.ts`
4. Build 8 new widget components
5. Register widgets in `WIDGET_COMPONENTS`

### Phase 2: Demo Catalog (1 session)

1. Write demo catalog SQL migration (50+ products, 8 departments)
2. Write import RPCs (`import_theme_slides`, `import_theme_media`, `import_theme_products`, `import_theme_posts`, `import_theme_all`)
3. Build Import Demo Data UI component
4. Wire import panel to ThemesScreen

### Phase 3: Live Preview (1 session)

1. Create `theme-preview.$key.tsx` route
2. Build ThemePreviewFrame component
3. Add Preview button to theme cards
4. Test preview with demo data

### Phase 4: Verify & Ship (1 session)

1. Run `typecheck` + `test`
2. Deploy to live
3. Test full flow: activate → import → preview → publish

**Estimated effort:** 4 sessions

---

## 8. Files to Modify

| File                                               | Change                                           |
| -------------------------------------------------- | ------------------------------------------------ |
| `src/lib/theme-blueprints.ts`                      | Refine tokens, add 6 templates                   |
| `src/lib/builder-ast.ts`                           | Add 8 new SectionType members                    |
| `src/components/builder/widgets.tsx`               | Register 8 new widgets in WIDGET_COMPONENTS      |
| `src/components/builder/heritage.tsx`              | New file — 8 Heritage-specific widget components |
| `src/components/admin/themes/ThemesScreen.tsx`     | Add Preview button + Import panel                |
| `src/components/admin/themes/import-demo-data.tsx` | New file — Import UI                             |
| `src/lib/theme-imports.server.ts`                  | New file — RPC wrappers                          |
| `src/routes/theme-preview.$key.tsx`                | New route — theme preview                        |
| `src/components/store/ThemePreviewFrame.tsx`       | New file — preview iframe                        |
| `supabase/migrations/`                             | New migration for import RPCs + demo catalog     |

---

## 9. Resolved Questions

| Question           | Decision                                                        | Reasoning                                                           |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| Preview images     | **Hybrid** — monogram fallback + real photo URLs when available | Best of both worlds: works offline, looks premium when photos exist |
| Import idempotency | **Hybrid** — SKU check + `theme_imports` audit table            | SKU check prevents duplicates, audit table provides full trail      |
| Template switching | **All at once** — all 6 templates applied on activation         | Merchant can customize later via builder; simpler UX                |
