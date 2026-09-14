# Options & Variants — depth spec (S2)

Status: Planning · Slice S2 (core store) · Reference: `plan.md` §3.1, `docs/02-merchant/README.md`
Design baseline: `00-meta/design-system.md`
Scope: merchant-side options/variants surface — option groups, per-variant SKU/price/stock, per-variant publish, bulk CSV import/export (four-eyes gated), stock movements via RPC. Variant rows feed the catalog PDP (all variants, price+stock per variant).
Out of scope (own specs): price rules/VAT → `06-payments` + `07-commerce`; collections → `03-storefront/catalog.md`; customer accounts → `03-storefront/accounts.md` (S3); POS routing → `08-pos-shipping`.

---

## 1. Purpose

High-volume merchants sell multi-option products (color, size, flavor). Every variant is a **separate sellable row**: own SKU, own BDT price (integer minor units), own stock per location, own publish state. The admin must support creating/naming option groups, generating variant rows, bulk CSV import/export, and stock movement without ever bypassing RLS or RPC invariants.

## 2. Design decisions

- **DD-1 — Options are per-product groups.** `product_option_groups` (name, sort) belong to one product; values live in `product_option_values`; variants link values via `product_variant_options`. Deleting a value archive, never hard-delete while an order line references it.
- **DD-2 — Sparse variants.** A product may have zero variants (single sellable row) or many. Each `product_variants` row has `sku` (unique per merchant), `price_minor` (BDT integer), `compare_at_minor` (nullable), `stock` per location via `inventory_lots`/`inventory_movements`, `published` boolean, `active` boolean.
- **DD-3 — Sellable = product published AND variant published AND stock > 0 (per catalog)**. Catalog RPCs filter `active = true`; draft variants are invisible to anon reads.
- **DD-4 — All writes via RPC.** No direct UPDATE to `product_variants`/`inventory_*`; `adjust_stock` RPC enforces movement invariants (e.g. negative stock only when allowed via `allow_negative` flag set at tenant level).

## 3. Data model & RLS

| Table | Notes |
|---|---|
| `product_option_groups` | `merchant_id`, `name`, `sort` |
| `product_option_values` | `option_group_id`, `value`, `sort` |
| `product_variant_options` | join `variant_id` ↔ `option_value_id` |
| `product_variants` | `merchant_id`, `product_id`, `sku`, `price_minor`, `active`, `published` |
| `inventory_lots` | stock per location: `variant_id`, `warehouse_id`, `qty` |
| `inventory_movements` | ledger of every stock change (order allocations, manual adj) |

RLS: every row `merchant_id = current setting from JWT`; staff RPC-only writes.
RLS on `product_variants` scope: `merchant_id` from tenant claim; reads via RPC or view; anon never touches these tables directly.

## 4. RPC surface

- `create_option_group` / `update_option_group` / `delete_option_group` (archive).
- `create_product_variant` / `update_product_variant` (price, sku, active).
- `set_variant_publish(variant_id, published)`.
- `create_stock_movement(variant_id, warehouse_id, delta, reason)` → writes `inventory_movements` + updates `inventory_lots` atomically.
- `import_variants_csv(merchant_id, file)` → four-eyes queue item (`staff-approval.md`); applies as a single transaction or fails whole-file.
- `list_variants(merchant_id, product_id, page)` → for admin grid.
- `get_stock_levels(variant_id)`.

## 5. Failure / recovery

- CSV import: full-row validation before any write; a file with any invalid row fails wholesale (report row numbers); successful apply is a single transaction.
- Stock movement: same-row `inventory_lots` update + movement append in one transaction; on middle failure the whole movement rolls back.
- Concurrency: UPDATing `inventory_lots` via `SELECT ... FOR UPDATE` so two staff can't oversell a location.

## 6. E2E coverage (feeds `docs/15-e2e` suite)

- Create option groups + values, create variants, confirm catalog PDP shows all variants with prices/stock (store_loop).
- Publish off → variant invisible to anon catalog.
- Bulk CSV 100-row import; a bad row blocks whole file; approval flow visible in admin_loop.
- Stock movement reflects in cart quantity check at checkout.

## 7. Open items

- Cost/price rounding policy per unit (needs costing module, owner: `07-commerce`); margin tracked as `TBD`.

---

### Design guidelines — product editor

- **Intent**: dense backend surface; primary task: find product, see variants, adjust price/stock in &lt;10s.
- **Key surfaces**: product detail with variant list; per-variant row = SKU / price (input w/ BDT prefix, integer) / stock pill per location / publish toggle / edit row menu.
- **Palette emphasis**: teal = actionable; amber = `allow_negative` stock; red = archived/OOS; mint only for success toast.
- **Typography**: Noto Sans Bengali; `font-variant-numeric: tabular-nums` for all price/Qty columns.
- **Density**: row height 44px, zebra off; variant table horizontal scroll on mobile.
- **Motion**: only drawer/panel slide + opacity; reduced-motion → instant swap.
- **A11y**: AA (non-checkout); publish toggle is a `<switch>` w/ text label, never color-only; sortable column heads with `aria-sort`.
- **Performance**: virtualized variant list beyond 100 rows; CSV upload progress; client bundle unchanged by bulk import (server job).
- **Anti-slop check**: no invented shadows/gradients; tokens `--bd-*` only; money always `fmtBDT`.