# Product Reviews — depth spec (S2/S3)

Status: Planning · Slices S2/S3 (catalog display + accounts submission) · Reference: `plan.md` §3.3, `docs/03-storefront/README.md`, `docs/02-merchant/staff-approval.md`, `docs/07-commerce/README.md`
Design baseline: `00-meta/design-system.md` (semantic+component; themes layer only)
Scope: PDP star ratings + written reviews; verified-purchase gate; moderation queue; merchant reply; aggregate computation server-side. Submission requires a signed-in customer (`03-storefront/accounts.md`, S3); visible/render layer ships with S2 catalog.
Out of scope: rating on product cards in collections (`catalog.md`, aggregate only), review images/video, seller-to-seller Q&A, analytics → `09-analytics`, review incentive/AI-support pipelines → `10-ai-support`.

---

## 1. Purpose

Reviews are the trust layer of the storefront PDP: honest aggregate (mean, 1–5, count, per-star histogram) plus merchant replies, rendered by any theme, computed server-side, protected by verification and moderation. Aggregates must never be client-computed; a customer can review only a product they actually ordered once per order.

## 2. Design decisions

- **DD-1 — Verification is server-side.** `verified_purchase` = true when the reviewer's `customers` row holds ≥1 `order_item` of this product with `payment_status IN ('paid','refunded')` in the customer's own merchant scope; no client-asserted flag.
- **DD-2 — Moderation before publish.** `review.pending` → `published` | `rejected` in the staff queue (`staff-approval.md` four-eyes not required for reviews; a single moderator action is valid). Rejection is reversible within TBD (owner: `02-merchant`), non-destructive (draft kept).
- **DD-3 — Aggregation is server-side & cached.** `product_review_agg(product_id)` RPC computes mean (rounded to 1 decimal, tabular-nums), count, 1–5 histogram from `published` reviews only, cached at the compositing layer (60s edge consistent w/ `catalog.md` cache).
- **DD-4 — Once per published order per customer.** Unique index on `(customer_id, product_id)` among `published` rows; a review re-opened or re-submitted for the same product is rejected by the same index unless the prior row was anonymized or deleted.

## 3. Data model & RLS

| Table | Notes |
|---|---|
| `product_reviews` | `merchant_id, customer_id FK (nullable), product_id, rating smallint (1–5), title, body, verified_purchase, status (draft|pending|published|rejected), created_at, published_at, moderation_note` |
| `review_replies` | `review_id, staff_user_id, body, published_at` (single thread) |

RLS: published rows readable by `anon` (like catalog read surface, RPC-only); pending/draft/rejected rows only to staff via `get_my_review` for the author + staff RPCs.

## 4. RPC surface

- `list_published_reviews(product_id, cursor, limit)` — anon; published only; ordered newest→oldest; no PII.
- `get_review_agg(product_id)` — anon.
- `submit_review(product_id, rating, title, body)` — customer MUST be `verified_purchase`; idempotency key from order_id; upserts.
- `staff_list_review_queue(merchant_id, status)` / `staff_moderate_review(review_id, status, note)` — staff roles only.
- `my_reviews(customer_id)` — self-service; edit/delete own draft.

## 5. Failure / recovery

- Aggregation staleness: cache dirty on `review.published` domain event; retry-safe.
- Moderation queue dedupe: second moderation of same review is `no-op` (idempotent status set).
- Review submit failure mid-write: partial row rolled back; retry with same idempotency returns original.

## 6. E2E coverage

- `store_loop`: PDP shows published reviews + correct aggregate; unpublished hidden from anon.
- Verified purchase: unpaid or guest → cannot submit; paid → can; duplicate → 409 handled.
- `admin_loop`: moderation queue → publish → appears; reject → hidden w/ reason logged.
- cross-tenant: customer from merchant A cannot review merchant B's product.

## 7. Open items

- Review images/video (file mgmt, Storage+imgproxy per 02 `products` page) — not in this slice; owner: `02-merchant`.
- Spam/abuse heuristics → `12-fraud`; placeholder rate map: TBD (owner: fraud).

---

### Design guidelines — product review section

- **Intent**: trust signal; score front, evidence behind.
- **Key surfaces**: stars (ARIA-live, `aria-label="4 of 5 stars"`), aggregate row (score, count, histogram bars w/ labels), review list (name, date, verified badge with tooltip, "উত্তর দিন" reply), modal for own write.
- **Palette emphasis**: teal = verified badge, red = rejected flag (admin), neutral grays for the rest; no inventing a rating color.
- **Typography**: tabular-nums for counts; Bangla body; name in Latin script as typed.
- **Density**: compact cards, 12px min between; mobile single column.
- **Motion**: none beyond fade-in on modal; reduced-motion collapse.
- **A11y**: AA on non-checkout; stars focusable; histogram with actual values, not color-only.
- **Performance**: iframe-off; reviews lazy-loaded below 1800px (within PDP budget).
- **Anti-slop**: never fabricate review counts or averages; "Verified purchase" badge uses no emoji.