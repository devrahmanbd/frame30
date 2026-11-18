# Feature SF-01: Storefront Navigation & Header

## 1. Entry Route & Parameters
- **Primary Routes**: `/`, `/store/:slug`
- **Component**: `src/components/store/StoreHeader.tsx`, `src/lib/themes/songoskriti/header-presentation.tsx`

## 2. Preconditions
- Active theme published for merchant.
- Navigation items loaded from database `nav_menu_items` or demo catalog.

## 3. Supported Actions
- Click brand wordmark -> Navigate to store home `/`.
- Click navigation link (e.g. Women, Men, Kids, Sarees) -> Navigate to `/c/:slug`.
- Click mobile hamburger button -> Toggle mobile menu drawer open (`aria-expanded: true`).
- Click language switcher (EN / বাং) -> Toggle storefront locale.

## 4. State Transitions
- `drawerClosed` -> (Click Hamburger) -> `drawerOpen`
- `drawerOpen` -> (Click Close / 'X') -> `drawerClosed`
- `locale(en)` -> (Click বাং) -> `locale(bn)`

## 5. Executable Invariants
- **No Wordmark Truncation**: Brand wordmark text does not overflow or truncate (`isTruncated === false`) across 320px–430px viewports.
- **No Horizontal Overflow**: `document.documentElement.scrollWidth <= window.innerWidth` across all viewports.
- **Accessible Controls**: Hamburger toggle has valid `aria-controls="store-mobile-menu"` and dynamic `aria-expanded`.

## 6. Verification Commands
- `bun run test:bombadil --smoke`
- `vitest run src/components/store/StoreHeader.test.tsx`
