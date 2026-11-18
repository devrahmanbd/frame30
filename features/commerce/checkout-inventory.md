# Feature CM-02: Checkout & Inventory Concurrency

## 1. Entry Route & Parameters
- **Primary Routes**: `/checkout`
- **Component**: `src/routes/checkout.tsx`, `src/lib/checkout.server.ts`, `src/lib/inventory.server.ts`

## 2. Preconditions
- Non-empty cart with active products.
- Checkout session token created.

## 3. Supported Actions
- Reserve inventory stock hold (`stock_hold_acquire`).
- Provide delivery shipping address.
- Select payment method (Cash on Delivery, Gateway).
- Place Order -> Authorize payment -> Capture payment webhook.

## 4. State Transitions
- `StockAvailable(n)` -> `HoldAcquired(h)` -> `OrderPending(o)` -> `OrderPaid(o)` -> `OrderFulfilled(o)`
- `HoldAcquired(h)` -> (Timeout/Cancel) -> `StockAvailable(n)`

## 5. Executable Invariants
- **Non-Negative Inventory**: `availableStock >= 0` under concurrent contention.
- **Stock Conservation**: `availableStock + Sum(holds) + Sum(orders) == MaxStock`.
- **Webhook Idempotency**: Duplicate payment provider webhook events replay as no-ops without double-fulfillment.
- **No Client-Trusted Pricing**: Totals recomputed server-side from live DB records.

## 6. Verification Commands
- `bun run test:tla`
- `vitest run src/lib/checkout-reserve-atomic.test.ts`
