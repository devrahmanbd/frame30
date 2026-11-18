# Feature SF-03: Product Detail & Recommendations

## 1. Entry Route & Parameters
- **Primary Routes**: `/p/:slug`
- **Component**: `src/components/store/ProductView.tsx`, `src/components/builder/songoskriti.tsx`

## 2. Preconditions
- Product slug exists, is published, and is active.
- Inventory variants loaded.

## 3. Supported Actions
- Select product variant (color, size).
- Change quantity stepper.
- Click "Add to Cart" -> Updates cart state, increments header badge count.
- Click Wishlist heart -> Adds/removes item from customer wishlist.

## 4. State Transitions
- `variantUnselected` -> `variantSelected(id)`
- `adding` -> `added` -> `cartCount(n + 1)`

## 5. Executable Invariants
- **Recommendation Self-Exclusion**: Currently viewed product slug is strictly absent from recommendation rails (`exclude: [activeSlug]`).
- **Single Primary H1**: Sole `<h1>` is the product title. "Product Details & Craft" rendered as `<h2>`.
- **Integer Minor Units**: Prices displayed in BDT (`৳`) formatted strictly from integer minor units (`amount_minor_int`).
- **Merchant Identity in Breadcrumbs**: Breadcrumb reflects merchant brand (`Flame Fashion BD / [Product Title]`), not internal blueprint theme name.

## 6. Verification Commands
- `bun run test:properties`
- `vitest run src/components/store/songoskriti-preview-compositions.test.tsx`
