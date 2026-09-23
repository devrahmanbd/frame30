# Heritage (Clothing) Theme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `clothing-heritage` blueprint with 8 new widgets, 6 templates, 50+ demo products, RPC-based import system, and live preview in marketplace.

**Architecture:** New `SectionType` members in `builder-ast.ts`, new widget components in `heritage.tsx`, blueprint in `theme-blueprints.ts`, demo catalog SQL migration, import RPCs, preview route.

**Tech Stack:** TanStack Router, TanStack Start (createServerFn), Supabase PostgREST, React, Tailwind CSS, shadcn/ui

## Global Constraints

- Bengali rule: Page builder UI is ENGLISH ONLY. Canvas previews keep locale props for EN/বাং side-by-side
- No `server-only` import — use `*.server.ts` naming instead (ESLint enforced)
- Integer minor units for money: `amount_minor_int` + `currency_code`. No floats stored, transmitted, or computed
- Secrets never leave the server boundary
- RLS on every public table plus explicit GRANTs per role
- Path alias: `@/*` maps to `./src/*`
- Test files live next to the code they test in `src/lib/`
- `[A]` features need deny cases + replay cases + audit assertions
- vitest.config.ts sets `passWithNoTests: false` — tests are required
- Bun supply-chain guard: 24h minimum release age for all npm packages

---

## Task 1: Add New SectionType Members

**Files:**
- Modify: `src/lib/builder-ast.ts`

**Interfaces:**
- Consumes: existing `SectionType` union
- Produces: 8 new members in the union

- [ ] **Step 1: Read current SectionType**

Read `src/lib/builder-ast.ts` and find the `SectionType` type union.

- [ ] **Step 2: Add 8 new members**

Add these to the `SectionType` union:
```typescript
| 'hero_carousel'
| 'department_grid'
| 'heritage_story'
| 'textile_showcase'
| 'editorial_banner'
| 'testimonial_carousel'
| 'marquee_strip'
| 'story_trunk'
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (new members are just string literals, no breaking changes)

- [ ] **Step 4: Commit**

```bash
git add src/lib/builder-ast.ts
git commit -m "feat(builder): add 8 heritage section types"
```

---

## Task 2: Build Heritage Widget Components

**Files:**
- Create: `src/components/builder/heritage.tsx`

**Interfaces:**
- Consumes: SectionType members from Task 1
- Produces: `HERITAGE_WIDGETS` export — Record mapping SectionType → component

- [ ] **Step 1: Create heritage.tsx with all 8 widgets**

Create `src/components/builder/heritage.tsx` with:
- `HeroCarousel` — full-viewport swiping hero with headline, subhead, CTA, caption. 3-5 slides auto-advance 5s.
- `DepartmentGrid` — 6-8 image cards with name + count. Tappable categories.
- `HeritageStory` — Split: large editorial image + story text + founder quote.
- `TextileShowcase` — Side-by-side product pair with "Shop the collection" CTA.
- `EditorialBanner` — Full-width photographic story banner with overlaid text.
- `TestimonialCarousel` — Quote + author + image, auto-rotating.
- `MarqueeStrip` — Infinite horizontal scroll text/icons.
- `StoryTrunk` — Collapsible FAQ accordion — answers slide open/down.

Each widget must:
- Accept props matching the types defined in the design doc
- Use Tailwind CSS for styling
- Use the theme tokens from `ThemeTokens` type
- Be a React functional component
- Support bilingual EN/বাং labels

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/builder/heritage.tsx
git commit -m "feat(builder): add 8 heritage widget components"
```

---

## Task 3: Register Heritage Widgets in WIDGET_COMPONENTS

**Files:**
- Modify: `src/components/builder/widgets.tsx`

**Interfaces:**
- Consumes: `HERITAGE_WIDGETS` from Task 2, `SectionType` from Task 1
- Produces: Updated `WIDGET_COMPONENTS` record with 8 new entries

- [ ] **Step 1: Read current widgets.tsx**

Read `src/components/builder/widgets.tsx` and find the `WIDGET_COMPONENTS` record.

- [ ] **Step 2: Import and register heritage widgets**

Import `HERITAGE_WIDGETS` from `./heritage` and spread into `WIDGET_COMPONENTS`:
```typescript
import { HERITAGE_WIDGETS } from './heritage';

export const WIDGET_COMPONENTS: Record<SectionType, WidgetComponent> = {
  ...HERITAGE_WIDGETS,
  // ... existing widgets
};
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/builder/widgets.tsx
git commit -m "feat(builder): register heritage widgets in WIDGET_COMPONENTS"
```

---

## Task 4: Rebuild clothing-heritage Blueprint

**Files:**
- Modify: `src/lib/theme-blueprints.ts`

**Interfaces:**
- Consumes: `SectionType` from Task 1, `ThemeTokens` type
- Produces: Updated `clothing-heritage` blueprint with 6 templates

- [ ] **Step 1: Read current clothing-heritage blueprint**

Read `src/lib/theme-blueprints.ts` and find the `clothing-heritage` blueprint entry.

- [ ] **Step 2: Update tokens**

Replace the existing tokens with:
```typescript
{
  brand: '#1A1A1A',
  accent: '#C45D3E',
  surface: '#FAF8F5',
  ink: '#2D2A26',
  radius: 2,
  container: 1320,
  density: 'airy',
  typeScale: 'expressive',
  fontDisplay: 'Playfair Display',
  fontBody: 'Inter',
  shadow: 'soft',
  motion: 'subtle',
  dark: {
    brand: '#FAF8F5',
    accent: '#D4784A',
    surface: '#1A1816',
    ink: '#F0EDE8'
  }
}
```

- [ ] **Step 3: Add 6 templates**

Add templates object with:
- `homepage`: hero_carousel → department_grid → product_rail → heritage_story → textile_showcase → editorial_banner → testimonial_carousel → marquee_strip
- `collection`: heritage_story → product_rail → textile_showcase
- `pdp`: split-feature → size-selector → textile_showcase → testimonial_carousel → support_strip
- `about`: heritage_story → editorial_banner → marquee_strip → story_trunk → testimonial_carousel
- `contact`: heritage_story → contact-form → support_strip
- `fullwidth`: hero_carousel → (any sections)

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/theme-blueprints.ts
git commit -m "feat(theme): rebuild clothing-heritage blueprint with 6 templates"
```

---

## Task 5: Write Demo Catalog SQL Migration

**Files:**
- Create: `supabase/migrations/20260920_heritage_demo_catalog.sql`

**Interfaces:**
- Consumes: existing `categories`, `products`, `product_variants`, `product_images` tables
- Produces: 50+ products, 8 departments, 15 subcategories

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/20260920_heritage_demo_catalog.sql` with:
- 8 top-level categories + 15 subcategories
- 50+ products with real Bengali names
- Product variants with BDT pricing
- Deterministic monogram image URLs

- [ ] **Step 2: Run schema:check**

Run: `bun run schema:check`
Expected: PASS (or known failure if fingerprint RPC missing)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260920_heritage_demo_catalog.sql
git commit -m "feat(catalog): add heritage demo catalog migration"
```

---

## Task 6: Write Import RPCs

**Files:**
- Create: `src/lib/theme-imports.server.ts`
- Modify: `supabase/migrations/20260920_import_rpcs.sql`

**Interfaces:**
- Consumes: existing service-layer functions
- Produces: 5 RPCs (import_theme_slides, import_theme_media, import_theme_products, import_theme_posts, import_theme_all)

- [ ] **Step 1: Create theme-imports.server.ts**

Create `src/lib/theme-imports.server.ts` with:
- `importThemeSlides(themeKey: string)` — RPC wrapper
- `importThemeMedia(themeKey: string)` — RPC wrapper
- `importThemeProducts(themeKey: string)` — RPC wrapper
- `importThemePosts(themeKey: string)` — RPC wrapper
- `importThemeAll(themeKey: string)` — runs all four in sequence

- [ ] **Step 2: Create import RPCs migration**

Create migration with 5 RPC functions that:
- Check auth + merchant ownership
- Use existing service-layer functions (no raw SQL)
- Are idempotent (check for existing items before insert)

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/theme-imports.server.ts supabase/migrations/20260920_import_rpcs.sql
git commit -m "feat(import): add theme import RPCs"
```

---

## Task 7: Build Import Demo Data UI

**Files:**
- Create: `src/components/admin/themes/import-demo-data.tsx`
- Modify: `src/components/admin/themes/ThemesScreen.tsx`

**Interfaces:**
- Consumes: import RPCs from Task 6
- Produces: Import panel with checkboxes + import button

- [ ] **Step 1: Create import-demo-data.tsx**

Create `src/components/admin/themes/import-demo-data.tsx` with:
- Checkbox group: ☐ Slides, ☐ Media, ☐ Products, ☐ Posts, ☐ All
- Import button that calls appropriate RPC
- Loading state + success/error feedback
- Confirmation dialog before import

- [ ] **Step 2: Wire import panel to ThemesScreen**

Modify `ThemesScreen.tsx` to show import panel after theme activation.

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/themes/import-demo-data.tsx src/components/admin/themes/ThemesScreen.tsx
git commit -m "feat(import): add import demo data UI"
```

---

## Task 8: Create Theme Preview Route

**Files:**
- Create: `src/routes/theme-preview.$key.tsx`
- Create: `src/components/store/ThemePreviewFrame.tsx`
- Modify: `src/components/admin/themes/ThemesScreen.tsx`

**Interfaces:**
- Consumes: blueprint tokens + demo catalog
- Produces: Preview route + Preview button in theme cards

- [ ] **Step 1: Create ThemePreviewFrame component**

Create `src/components/store/ThemePreviewFrame.tsx` with:
- Renders theme with demo data (no auth required)
- Template navigation (Homepage, Collection, PDP, About, Contact)
- Full-screen modal or new tab

- [ ] **Step 2: Create preview route**

Create `src/routes/theme-preview.$key.tsx` with:
- Loads blueprint by key
- Renders ThemePreviewFrame with demo data

- [ ] **Step 3: Add Preview button to ThemesScreen**

Modify `ThemesScreen.tsx` to add Preview button to theme cards.

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/theme-preview.$key.tsx src/components/store/ThemePreviewFrame.tsx src/components/admin/themes/ThemesScreen.tsx
git commit -m "feat(preview): add theme preview route and UI"
```

---

## Task 9: Run Tests & Fix

**Files:**
- All modified files

**Interfaces:**
- Consumes: all tasks 1-8
- Produces: Passing typecheck + tests

- [ ] **Step 1: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 2: Run tests**

Run: `bun run test`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: PASS

- [ ] **Step 4: Fix any failures**

Fix any typecheck, test, or lint failures.

- [ ] **Step 5: Commit fixes**

```bash
git add -A
git commit -m "fix: heritage theme typecheck and test fixes"
```

---

## Task 10: Deploy & Verify

**Files:**
- All modified files

**Interfaces:**
- Consumes: all tasks 1-9
- Produces: Deployed and verified Heritage theme

- [ ] **Step 1: Build for production**

Run: `bun run build`
Expected: PASS

- [ ] **Step 2: Deploy to live**

Deploy to `https://framique.qubickle.com`

- [ ] **Step 3: Verify theme activation**

Test: Activate Heritage theme in Appearance
Expected: Theme activates, templates applied

- [ ] **Step 4: Verify import**

Test: Import demo data
Expected: Products appear in store

- [ ] **Step 5: Verify preview**

Test: Preview theme in marketplace
Expected: Preview shows demo data

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: heritage clothing theme complete"
```
