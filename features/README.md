# Frame30 Machine-Readable Feature Map

This directory provides the authoritative feature specifications for Frame30. Every feature maps the actual running application to its routes, preconditions, supported actions, expected state transitions, domain invariants, and verification commands.

## Architecture & Verification Index

| Feature ID | Feature Name | Primary Route | Spec File | Verification Command |
|---|---|---|---|---|
| `SF-01` | Storefront Navigation & Header | `/` | [`storefront/navigation.md`](./storefront/navigation.md) | `bun run test:bombadil --smoke` |
| `SF-02` | Collection Assortments & Taxonomy | `/c/:slug` | [`storefront/collections.md`](./storefront/collections.md) | `bun run test:properties` |
| `SF-03` | Product Detail & Recommendations | `/p/:slug` | [`storefront/product-detail.md`](./storefront/product-detail.md) | `bun run test:properties` |
| `CM-01` | Shopping Cart & Discounts | `/cart` | [`commerce/cart.md`](./commerce/cart.md) | `bun run test:properties` |
| `CM-02` | Checkout & Inventory Concurrency | `/checkout` | [`commerce/checkout-inventory.md`](./commerce/checkout-inventory.md) | `bun run test:tla` |

## Feature Contract Schema
Every feature file must define:
1. **Entry Route & Parameters**
2. **Preconditions**
3. **Supported User Actions**
4. **State Transitions**
5. **Executable Invariants**
6. **Automated Verification Commands**
