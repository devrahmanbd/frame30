# Feature CM-01: Shopping Cart & Discounts

## 1. Entry Route & Parameters
- **Primary Routes**: `/cart`
- **Component**: `src/routes/cart.tsx`, `src/lib/cart.ts`, `src/lib/coupons.server.ts`

## 2. Preconditions
- Client or server cart state initialized.
- Merchant coupon rules configured in `coupons` table.

## 3. Supported Actions
- Update line item quantity (`[+]`, `[-]`).
- Remove line item.
- Enter coupon code and click Apply.
- Click "Checkout Now" -> Navigate to `/checkout`.

## 4. State Transitions
- `cart(items)` -> (Apply Coupon) -> `cart(items, discount)`
- `cart(empty)` -> (Continue Shopping) -> `/`

## 5. Executable Invariants
- **Discount Bounds**: `0 <= discountMinor <= subtotalMinor`.
- **Final Total Non-Negative**: `subtotalMinor - discountMinor >= 0`.
- **Minor Units Additivity**: `subtotal === sum(line.unitPrice * line.quantity)`.
- **Zero Floating-Point Representation**: All monetary values computed in integer minor units.

## 6. Verification Commands
- `bun run test:properties`
- `vitest run src/lib/commerce-properties.test.ts`
