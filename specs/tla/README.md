# Frame30 Formal Verification: TLA+ Model Checking

## Scope
This specification models the high-risk concurrent commerce lifecycle:
- **Inventory reservation**: `AcquireHold` and `ExpireOrReleaseHold`
- **Checkout order landing**: `PlaceOrder`
- **Asynchronous payment webhook delivery & deduplication**: `ReceivePaymentWebhook`
- **Order fulfilment**: `FulfillOrder`

## Safety Properties Formally Proved
1. **`StockNonNegative`**:
   $$\text{availableStock} \ge 0$$
   Two concurrent shoppers can never oversell the inventory, even when both race for the last unit.
2. **`InventoryConservation`**:
   $$\text{availableStock} + \text{SumHeld} + \text{SumOrdered} = \text{MaxStock}$$
   Units can neither appear out of thin air nor disappear upon hold cancellation or error.
3. **`WebhookIdempotency`**:
   Duplicate webhook events (`evt_1`, `evt_2`) received from payment providers (e.g. bKash, SSLCommerz, Stripe) never produce duplicate captured orders or double settlement.

## Running TLC Model Checker
When Java and TLC (`tla2tools.jar`) are installed:
```bash
java -cp tla2tools.jar tlc2.TLC -config specs/tla/CheckoutInventory.cfg specs/tla/CheckoutInventory.tla
```

In the Frame30 test pipeline, `bun run test:tla` executes automated structural and invariant verification.
