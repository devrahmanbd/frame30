# Feature SF-02: Collection Assortments & Taxonomy

## 1. Entry Route & Parameters
- **Primary Routes**: `/c/:slug` (e.g. `/c/girls`, `/c/boys`, `/c/kids`, `/c/sarees`, `/c/women`, `/c/men`, `/c/new-in`)
- **Component**: `src/components/store/CollectionView.tsx`, `src/components/builder/songoskriti.tsx`

## 2. Preconditions
- Collection slug exists in merchant catalog.
- Products associated with collection taxonomy.

## 3. Supported Actions
- View product grid.
- Click product card -> Navigate to `/p/:slug`.
- Switch category or filter tabs.

## 4. State Transitions
- `loading` -> `rendered(products)` | `rendered(empty)`
- `filter(all)` -> `filter(category)`

## 5. Executable Invariants
- **Single Primary H1**: Exactly one `<h1>` element exists in the DOM, rendering the authored collection title. Generic `<h2>New Arrivals</h2>` prefix is suppressed.
- **Strict Taxonomy Isolation**:
  - `/c/sarees` contains only authentic sarees/drapes; never kurtas, tunics, or panjabis.
  - `/c/girls` contains only girls festive wear; zero sarees or adult apparel.
  - `/c/boys` contains only boys ethnic wear.
- **Adaptive Balanced Layout**:
  - 1 product: `max-w-md mx-auto` (centered horizontally).
  - 2 products: 2-column centered grid.
  - 3 products: 3-column centered grid.
  - 4+ products: standard 4-column responsive grid.

## 6. Verification Commands
- `bun run test:properties`
- `vitest run src/components/store/CollectionView.test.tsx`
