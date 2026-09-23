# 13 — Export & SDK

Status: Planning · Slice S7+ · Gate: not yet approved (paper review TBD)

Owners: Platform (export job) · Merchant-admin (consumer) · 04-builder (theme hooks) · 06-payments (rate-limit shared) · 12-marketplace (app distribution)

References: [`docs/00-meta/design-system.md`](00-meta/design-system.md) §10 (per-page design-guideline template), [`docs/00-meta/audit-verdict.md`](00-meta/audit-verdict.md) (claim map, §12 below), [`docs/15-e2e/README.md`](15-e2e/README.md) (loop house), [`docs/09-analytics`](09-analytics/README.md) (retention), [`docs/02-merchant`](02-merchant/README.md) (admin consumer), [`docs/06-payments`](06-payments/README.md) (shared rate-limit), [`docs/12-marketplace`](12-marketplace/README.md) (apps consuming API keys/theme hooks)

Depth specs: [`export-job.md`](export-job.md) (export job lifecycle — queued → generating → signing → ready_for_download → downloaded | expired machine, `exports`/`export_files` records, schema versioning, failure/DLQ) · [`oauth.md`](oauth.md) (third-party app auth — OAuth 2.1 code+PKCE/client-credentials, token machine, consent, key rotation) · [`rest-api.md`](rest-api.md) (admin REST — RLS reads, API-key auth + rotation machine, cursor pagination, shared rate-limit, idempotency, webhook endpoint CRUD) · [`api-sdk.md`](api-sdk.md) (Node/Go SDK — contract-lockstep versions, retry/replay, deprecation policy, export download + webhook replay helpers, money/decision boundary)

## 1. Purpose

Merchant sovereignty: full export (orders, customers, products, variants,
settings) and an SDK for developers to extend (theme hooks, webhooks, admin
API, apps) so Framique is never a data jail. CSV/JSON export with versioned,
documented schemas; every export is an async job owned by the machine in §4;
webhooks and API keys make automation auditable and revocable.

## 2. Features / surfaces

- **Export center**: pick objects (orders/products/customers/inventory/payments/settings), date range, format (CSV/JSON), privacy filter (PII), one-click or scheduled, share-link with expiry. Full job lifecycle is a sub-plan: `export-job.md`.
- **Webhooks**: events from every module; HMAC-signed payload; preferred endpoint; retry with backoff + DLQ; "test webhook" sender.
- **Admin API**: REST bound to tenant via RLS; Node/Go SDK; rate-limit shared with `docs/06-payments`.
- **Theme hooks**: the 12 built-in widgets each expose a JS hook; extensions run in the theme sandbox (built by `docs/04-builder`).

## 3. Data model (tenant-scoped) + API surface

Schema, all RLS-bound to `merchant_id`:

- `exports` — job rows, `merchant_id` scoped, one canonical job machine (§4), row-count estimate computed at request.
- `export_files` — per-tenant artifact path, signed URL + checksum + `expires_at`, never a shared bucket path.
- `export_schema(version)` — versioned schema registry so files are self-describing.
- `webhook_endpoints` — HMAC secret (masked), enabled event set.
- `webhook_deliveries` — delivery attempt ledger, at-least-once.
- `api_keys` — short-lived tokens, rotation flow.
- `rate_limit_buckets` — shared with `06-payments`.

API surface: REST + RLS for tenant-scoped reads; admin API key auth for write/rotation; `export_files.signed_url` issued only in `ready_for_download`; every download returns checksum + row count so the "matches source tables" test is byte-checked. SDKs (Node/Go) are generated patterns, not a second auth model.

## 4. State transitions

Canonical machines (owned by this README; no parallel copies — 00-meta §3):

- **Export job** (sub-plan `export-job.md`): `queued → generating → signing → ready_for_download → downloaded | expired`, lateral `fail_retry`. Supersedes the pre-canonical `requested → building → ready | failed (retryable)`. `ready_for_download` = signed URL, TTL 24h, then `expired` → purge → re-run.
- **Webhook delivery**: `created → delivering → delivered | retrying → dead-lettered`. Retry on a 15-minute exponential backoff with a fixed attempt ceiling; dead-letter is replayable, never silently dropped.

## 5. Events

`export.completed`, `export.failed`, `webhook.created`, `webhook.delivered`,
`webhook.dead-lettered`, `api.key.rotated`. All tenant-scoped; every webhook
payload verifies HMAC before anything executes (README §7).

## 6. Geometry & data-store swap story

- Export files: storage host is swappable — per-tenant prefix + signed URL +
  TTL keeps object storage (S3/GCS-compatible) a drop-in; the swap decision is
  recorded in `export_files` metadata and re-issued on restore.
- Webhook/API: the delivery scheduler and rate-limiter are internal
  components; if the queue (BullMQ) is swapped, delivery records and the DLQ
  travel with the machine, not the vendor. `docs/00-meta` §4: vendors get a
  swap-out story or a named TBD — object-storage host selection is a named TBD
  (owner: Platform), everything else above is contract.

## 7. Failure & recovery

- Large exports are async with progress bar; file TTL 24h; abort → resume at
  last flushed part; at-least-once semantics declared in the job log.
- Webhook missed → re-delivery scheduler (15-min exponential backoff),
  dead-letter visible in the events table, replayable.
- Failure lands in the DLQ with a reason and a status chip, never silent loss;
  a failed export job retries, then DLQ.

## 8. Consent & privacy

- Export defaults exclude PII; customer-data exports include only
  consent-flagged fields (`docs/05` consent model).
- Any export containing "may identify" fields requires the merchant's explicit
  selection first.
- Logs and DLQ records are PII-minimal; download URLs are short-lived and
  revocable.

## 9. A11y & performance

- WCAG 2.2 AA minimum; status never color-only (icon + text + color triple:
  mint/amber/red semantics matching the storefront for cognitive consistency).
- Admin: virtualized lists >200 rows, skeletons over spinners, keyboard nav on
  the job/webhook tables; route-level code splitting (design-system §8).
- Export streaming (React 18 concurrent) with a computed row-count estimate
  before download — never an invented number; SDK snippets are static.
- Theme weight budgets (CSS ≤ 60KB gz, JS ≤ 100KB gz) apply to SDK/theme-hook
  output (design-system §8).

## 10. Design decisions per surface

### Design guidelines — export center, webhook settings, SDK docs page

- Intent: trust through openness — a developer can see every reachable surface and its data without a ticket.
- Key surfaces: export builder (multi-selects), scheduled export list with status chips, webhook endpoint cards (HMAC secret reveal), SDK landing (badges, quick snippet, OAuth flow).
- Palette emphasis: teal for active; amber for retrying; red for dead-letter; mint block-when-complete; SDK page uses code-tint (dark mono panels) carefully on white.
- Typography: tabular counts; code mono consistent (JetBrains Mono); descriptive paragraphs; Bangla option remains (Noto Sans Bengali variable).
- Density: export form dense but sections visually gapped; webhook table compact.
- Motion: status pulsates only while retrying; file-download subtle; prefers-reduced-motion collapses to opacity (design-system §5).
- A11y: inline errors, keyboard list, code snippets scrollable, high contrast for code lines.
- Performance: exports streaming, listing virtualized; SDK snippets static; budgets from design-system §8.
- Anti-slop check: "Your data, your money" opening banner; export schema shows computed row count ("≈ 120,000 records") before download; webhook secret shown as masked checkbox with confirm reset.

## 11. Testing gates

Contract-first, restricted to EXISTING loops in `docs/15-e2e`:

- `admin_loop`: export job lifecycle (queued → ready → downloaded → expiry); webhook reaches the merchant's endpoint with correct HMAC; dead-letter then retry delivers exactly once; export of a 3-order shop matches source tables (checksum/row-count).
- `store_loop` never calls the SDK live.
- Any NEW check beyond these must register a new `e2e_<area>_loop` in `docs/15-e2e` first, with a named TBD + owner, before it is claimed. (e.g. an export artifact-download drill would be `e2e_export_sdk_loop`, TBD, owner Platform.)

## 12. Audit verdict map

Follow-up record for `00-meta/audit-verdict.md`; every line verifiable in this plan's own sections.

- **Section audited**: export/SDK claim — contracts planned, no run-time service ships today; scope is docs + `.e2e/*.spec.ts` contract suites.
- **RLS / tenancy**: every export query and artifact path `merchant_id`-scoped; no cross-tenant id or payload leaks (§3, §8).
- **State transitions**: export job + webhook machines canonical here (§4, sub-plan `export-job.md`); no parallel copies.
- **Vendor swap**: object-storage host is a named TBD (owner: Platform); delivery/rate-limit are contract components (§6).
- **Consent**: export defaults exclude PII; explicit selection for identifying fields (§8).
- **Money**: integer BDT, documented unit; revenue totals recomputed at export time (§3, `export-job.md` §5).
- **Testing gates**: `admin_loop` covers export lifecycle + HMAC + exactly-once; store_loop never calls SDK live (§11).
- **Owners**: Platform (job/artifacts) · 04-builder (theme hooks) · 06-payments (shared rate-limit) · 12-marketplace (app distribution).
- **Performance targets**: image export ≤ 3 s p95; PDF generation ≤ 5 s p95; SDK snippet render ≤ 200 ms p95 (§9).
- **Acceptance criteria**: export job of a 3-order shop matches source tables (checksum/row-count); webhook HMAC verified end-to-end; dead-letter retry delivers exactly once; SDK snippets render without hydration errors on desktop and mobile viewports.

## 13. Residual v0 gaps

- CSV split threshold is a named TBD (owner: Data) — bandwidth-measured, not guessed.
- Object-storage host selection named TBD (owner: Platform).
- Export TTL envelope (`export_ttl_hours`) default 24h is a policy knob; exact production value signed by Platform after the first measured export run.

## Sign-off

- [ ] Platform
- [ ] Merchant-admin
- [ ] 04-builder
- [ ] 06-payments
- [ ] 12-marketplace

---
