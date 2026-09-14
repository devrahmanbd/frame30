# Catalog runtime

Implementation contract for BUILD.md 1.4. `SYSTEM.md` stays the architecture
truth; this file records how the catalog core behaves at runtime.

## Product kinds

`products.product_kind` is an enum: `physical | digital | service | subscription`.
`product_kind_validate` (BEFORE INSERT OR UPDATE) is the only authority on
coherence:

- non-physical kinds are forced to `requires_shipping = false`, so a digital or
  service line can never reach courier or shipping-fee logic;
- `tax_category` falls back to `standard` instead of NULL;
- `tags` are lower-cased, de-duplicated and capped at 50 per product.

`src/lib/catalog.ts` mirrors the same rules for the UI (`KIND_META`,
`isShippable`) but is never the decision point.

## Kind-specific configuration

| Kind | Table | Notes |
| --- | --- | --- |
| digital | `digital_assets` | file, storage path, `max_downloads` (1–100), `expiry_hours` (1–8760) |
| digital | `digital_grants` | per-buyer entitlement; only `token_hash` is stored |
| service | `service_offerings` | duration, buffer, capacity, location kind, booking and cancel windows |
| subscription | `subscription_terms` | interval unit/count, trial days, minimum cycles, optional anchor day |

Download flow: `digital_grant_issue` hashes a caller-supplied token (min 32
chars) and is `ON CONFLICT DO NOTHING`, so re-issuing the same token is
idempotent. `digital_grant_consume` takes the row `FOR UPDATE`, rejects revoked,
expired and exhausted grants, and increments the counter in the same
transaction. Raw tokens exist only in the delivery channel; the table is
select-only for staff and never readable by `anon`.

## Metafields

`metafield_definitions` declares the contract per `(owner_type, namespace, key)`.
`metafield_validate` runs on every metafield write:

- undefined keys stay free-form (namespaces are open);
- a defined key must match its `value_type` (number/boolean/json/text) and its
  `validation` bounds (`min`, `max`, `max_length`), plus `url` and `date` shape;
- `is_required` rejects an empty string.

A unique index on `(merchant_id, owner_type, owner_id, namespace, key)` makes
upserts deterministic.

## Smart collections

`collection_resolve(collection_id)` is the single resolution path for manual and
smart collections. v2 adds: soft-delete filtering on products and variants,
`kind`, `tag` and `metafield` conditions, a 5000-row scan bound and a 1000-row
emit cap. `collection_rules_validate` rejects unknown fields, unknown match
mode, keyless metafield conditions and more than 20 conditions, so a
hand-crafted `rules` payload cannot widen what shoppers see. The admin builder
posts through `catalogSaveRulesFn`, and previews are cached for 15 seconds
behind the `catalog.search` bucket because the resolver scans the catalog.

## Bulk import

Two phases, never one:

1. `catalog_import_dry_run` — recomputes the verdict for every row in the
   database (`create`, `update`, `error` with a reason: missing title/slug,
   non-integer `price_minor`, unknown kind, SKU already used elsewhere) and
   stores the diff on `catalog_import_jobs`. Nothing is written to the catalog.
   `UNIQUE (merchant_id, source_hash)` means re-uploading the same file lands on
   the same job.
2. `catalog_import_apply` — applies only `create`/`update` rows, skips errors,
   and flips the job to `applied` under `FOR UPDATE`. A replayed apply returns
   the original summary with `replayed: true`; rows are never doubled.

Prices are always integer minor units in the CSV (`price_minor`); the importer
never parses a decimal amount. Row cap is 2000 per file, and the
`catalog.import` bucket allows 10 attempts per 10 minutes per store.

## Observability

- `framique_catalog_import_total{phase=dry_run|applied|replayed}`
- `framique_catalog_kind_config_total{kind}`
- `framique_collection_rules_saved_total{smart}`
- structured logs: `catalog.import.dry_run`, `catalog.import.applied`,
  `catalog.metafield_definition.saved`; RPC failures go through `captureError`
  (Sentry forwarder) with the merchant id and scope.

## Design guidelines

- Kind selection sits in the product form with its consequence stated in one
  line (Bangla first); the shipping toggle is never shown for non-physical kinds
  because the server owns it.
- The import desk shows the diff before any write, colour plus text for every
  verdict (never colour alone), and keeps Apply disabled when the diff has
  nothing applicable.
- Counts use `tabular-nums`; gaps use amber for "needs attention" and mint for
  clear, always with a label.

## Tests

- `src/lib/catalog.test.ts` — CSV edge cases (quotes, CRLF, blank lines),
  missing columns, rule normalisation and caps.
- `.e2e/specs/catalog_loop.spec.ts` — anonymous dry-run/apply/grant-issue are
  refused, forged download tokens resolve to `not_found`, public config exposes
  no extra columns.
- `.e2e/specs/tenant_isolation.spec.ts` — the four new tables plus `metafields`
  return zero rows anonymously.
