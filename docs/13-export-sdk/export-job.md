# 13 — Export & SDK: Export Job Lifecycle (sub-plan)

Status: Planning · Slice S7+ · Gate: not yet approved (paper review TBD)

Owners: Platform · Data-retention (owner of 90/day retention) · Merchant-admin (consumer)

References: `docs/13-export-sdk/README.md` (surface README — this file is its §2 sub-plan), `docs/09-analytics` (retention 90d raw → 3y aggregate), `docs/15-e2e/README.md` (loop house), `docs/00-meta/design-system.md` §10 (page-guideline template), `docs/00-meta/audit-verdict.md`

## 1. Purpose

The export job is the unit of merchant sovereignty: a merchant asks for any
subset of their own rows, and Framique either produces a verifiable,
signed, downloadable artifact or surfaces the exact reason it cannot — never
a silent failure and never a cross-tenant file. This sub-plan owns the job
lifecycle only. Webhook delivery and the Admin API/SDK live in the README's
supporting sections; this file defines the pipeline a single export run
walks so we always know which state a job is in and who owns recovery.

## 2. Scope

In scope:

- One canonical job machine for every export: `queued → generating →
signing → ready_for_download → downloaded | expired`, with a lateral
  `fail_retry` state. Supersedes the README's pre-canonical
  `requested → building → ready | failed (retryable)` line.
- Job record in `exports`; on-disk artifact recorded in `export_files`
  (per-tenant path, signed, TTL'd).
- Schema versioning via `export_schema(version)` so a downloaded file is
  always self-describing.
- Formats: CSV and JSON only in v0; row-granularity scope: orders, products,
  customers, inventory, payments — each exported through the same machine.
- PII/redaction path and the merchant explicit-selection rule.
- Re-run semantics (scheduled jobs, abort → resume) and the DLQ hand-off.

Out of scope (own files/sections): webhook endpoint + delivery retry machine
(README §4 + §7), Admin API keys + rate limiting (README), SDK codegen for
Node/Go (README), theme hook extension layer (theme-registry contract).

## 3. Job records (`exports`) and artifact records (`export_files`)

`exports` is tenant-scoped (RLS on `merchant_id`, always) and carries:

- `export_id uuid` — job id, surfaced in the job list and event payloads.
- `merchant_id uuid` — the only tenancy controller; every query filters on it.
- `requested_by uuid` — operator id; audit trail for who asked.
- `object_type` — orders | products | customers | inventory | payments | settings.
- `range` cached at request time (start/end cursor), never live at read time.
- `privacy_filter` — pii | consent-only | exhaustive (see §6).
- `format` — csv | json.
- `status` — the canonical job machine exactly as §4.
- `attempts int` — retry counter for `fail_retry` (webhook backoff is 15min, see README §7).
- `requested_at`, `started_at`, `finished_at`, `expires_at` (`expires_at = finishes + ttl_24h`, fixed TTL policy in README §7).
- `total_rows_estimate int` — the "≈ 120,000 records" number shown before download; computed once at request from source-table count, never re-derived during a job.

`export_files` is the artifact row:

- `id`, `export_id → exports` (one job may fan out to many files, e.g. split CSV parts).
- Storage handle/path is per-tenant (a `merchant_id/`-scoped key), never a shared bucket path; swap story and host in README §6.
- `signed_url` + `signature` + `expires_at` — a ready file is a signed URL with the 24h TTL; after expiry the row is queued for purge and the job re-run is required.
- `checksum` (recorded) — verifiable row-count + digest at download for the "adds up" test in §5.
- `schema_version` — which `export_schema(version)` the file was written against.

## 4. State machine (canonical job machine)

`queued → generating → signing → ready_for_download → downloaded | expired`, lateral `fail_retry`.

- `queued` — accepted, row-count estimated, cancellable, waiting on worker.
- `generating` — streaming reads (never a live query), writes parts to per-tenant storage; periodic progress checkpoint so abort → resume returns to the last flushed part.
- `signing` — the final assemble step writes produced rows then the file is checksummed + signed (HMAC over content, per README §4); signing must succeed before `ready_for_download`.
- `ready_for_download` — file is at rest, signed URL TTL'd 24h, listing shows the record before download.
- `downloaded` — at least one full download observed; terminal.
- `expired` — TTL elapsed without download; purge queued; merchant re-runs rather than reusing stale file; terminal.
- `fail_retry` — lateral, not terminal: a failure lands here, a retry re-queues the job at the last flushed part. On a hard ceiling or code, `fail_retry` → DLQ with reason, at-least-once declared in job log.

No parallel copies: the README and this file render the same machine; the machine diagram lives in README §4 as the canonical copy.

## 5. Formats & schema licensing

- CSV: UTF-8 with BOM recommended for Bangla; header includes `schema_version`.
- JSON: one array, or ndjson for >TBD rows (threshold → owner: Data) — always self-describing with `export_schema(version)`.
- Every row: `merchant_id` + tenant-scoped foreign keys, no cross-tenant ids, no cross-tenant leaks into ids or payloads.
- Money: integer BDT with documented unit, no decimals; revenue/reconciliation totals recomputed from source tables at export time, never from a cached number.
- Row-count integrity: the download endpoint returns checksum + row count so the "export of a 3-order shop matches source tables" test (README §11) is a byte-check, not a trust.

## 6. Consent & privacy path (ties into README §8)

- Default `privacy_mode = consent-only`: pre-selected columns are the two forms.
- Any export that contains "may identify" fields requires the merchant's explicit selection first (README §8).
- Redaction is applied at generation, so the artifact itself is never PII-bearing in non-consent modes; logs and DLQ records are PII-minimal.

## 7. Failure & recovery (job level)

- Fail mid-stream → at-least-once: job log records exactly which part flushed; resume at last flushed part; no duplicate rows write.
- Provider/network outage on storage → the same worker re-queues with backoff (README §7 pattern), never silently drops.
- Deliberately no time-based auto-unpublish/free-return; files expire by TTL, not by age-arbitrary.

## 8. Testing gates (see README §11 for the full contract)

- `admin_loop` (existing): export job lifecycle queued → ready → downloaded → expiry; a 3-order shop's export matches source tables (checksum); webhook HMAC verifies; dead-letter then retry delivers exactly once.
- New dedicated restore drill for exports is out of scope here — any NEW check must register a new `e2e_<area>_loop` in `docs/15-e2e` first (+ TBD + owner), per README §11.
- `store_loop` never calls the SDK live.

## 9. Residual v0 gaps

- Bandwidth-aware CSV split threshold owns the named TBD (owner: Data; value project-measured).
- Exact expiration-policy env knob `export_ttl_hours` default 24: ownership note: owner Platform.
- Real vs synthetic digests on provider runtime — sequenced with `docs/04-builder` gate "go".

---
