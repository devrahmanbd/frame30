# 13 — Export & SDK: Client SDKs (Node/Go) (sub-plan)

Status: Planning · Slice S7+ · Gate: not yet approved (paper review TBD)

Owners: Platform (SDK + codegen) · Merchant-admin (consumer) · 12-marketplace (app distribution)

References: `docs/13-export-sdk/README.md` (surface README — this file is its §2 sub-plan), `docs/13-export-sdk/rest-api.md` (the REST surface this SDK wraps; version/deprecation + idempotency contract here), `docs/13-export-sdk/oauth.md` (third-party token flow for marketplace apps), `docs/00-meta/design-system.md` §10 (page-guideline template), `docs/15-e2e/README.md` (loop house)

## 1. Purpose

The Node and Go SDKs are generated patterns, not a second auth model: they
wrap the `rest-api.md` contract, keep versions locked to the OpenAPI
contract, and never recompute a server-authoritative value client-side. They
also own the two offline conveniences a merchant actually needs: replay-safe
retry and the export-download/webhook-replay helpers.

## 2. Scope

In scope:

- One codegen pipeline: contract → (Node, Go) → registry, with a single
  version lockstep rule.
- Retry, backoff, and idempotency-key handling for write paths.
- Money/decision boundaries: no client-side math, integer BDT types.
- Interop with `export_files` (download helper, checksum check) and webhook
  replay (HMAC verify helper, DLQ re-delivery).
- Deprecation policy and its notification surface.

Out of scope (own files): HMAC/DLQ admin API tooling (`rest-api.md` §8),
token grant machines (`oauth.md`), theme-hook extension layer (04-builder).

## 3. Generated patterns + version lockstep

- Sources of truth: the OpenAPI contract and `export_schema(version)`; no
  hand-maintained endpoint models in these files.
- Version lockstep: SDK major = contract major; a contract breaking change
  is a major version of the SDK, released with the API version bump.
- Generated code is committed but marked generated — no hand-edits; the proxy
  is the consumer (06-payments) and 12-marketplace only.
- Two SDKs (Node, Go). Each keeps a `README` surfaced in the SDK docs page
  (README §10) and never auto-includes a live key.

## 4. Retry & offline behavior

- Retry: on 5xx/429 the SDK honors `Retry-After`; it re-queues, never
  auto-backs-off into the gateway (rest-api §8).
- Idempotency: the caller supplies `Idempotency-Key`; the SDK re-uses the
  same key only for the same logical operation, and never reuses across
  merchants.
- Offline: exports keep the merchant's library for at least one TTL window;
  downloads resume from the last flushed part (job log).
- Key handling: keys never leave the merchant host; no engineering-detected
  keys ring anywhere.

## 5. Money & decisions

- Money types: fixed integer BDT — Go SDK `taka int64` (`i64`); JS `number`
  exists only for rendering via the platform-side `fmtBDT`, never floats,
  rounding always to the nearest paisa and only server-side.
- Decision boundary: no price/discount/coupon/stock/fraud math in the SDK;
  these stay in `07-commerce` and the server. SDK carries identity only.

## 6. Export + webhook interop

- `export_files` helper: given job id + row-count, returns the signed URL
  only when the machine reads `ready_for_download`; verifies checksum after
  download (export-job §4, signing step) and raises a mismatch before returning.
- Webhook playback: verify HMAC from `webhook_endpoints` metadata; a retry
  from the DLQ arrives with idempotency key, and the SDK deduplicates by
  `webhook_deliveries` row.

## 7. Deprecation policy

- Minor deprecation: one contract version of the SDK stays fully supported
  while vN+1 ships (broken on every safe boundary).
- Removal: a client that uses a deprecated surface gets a real `410` and a
  migration note — never a silent success.

## 8. Design guidelines — SDK docs page

- Key surfaces: quick snippet (copy-safe, no fake keys), version badge,
  export-download helper, deprecation callouts.
- Palette: code-tint (dark mono panels) on white only; teal for a healthy
  version, amber for an untested sample, red for deprecated-callout text;
  visuals matched to the README §10 SDK page.
- Typography: mono consistent JetBrains Mono; Bangla option
  (Noto Sans Bengali variable) for prose on the docs page.
- Motion: nothing moving on the SDK page but the copy button; reduced-motion
  → opacity only.
- A11y: snippets keyboard-scrollable; no color-only version state; both
  languages (bangla option) on callouts; code lines AA contrast.

## 9. Testing gates (see README §11 for the full contract)

- `admin_loop` (existing): SDK export-download verifies checksum; webhook
  HMAC verify then replay dedupes; rotation works through the SDK.
- A NEW dedicated SDK/export-download drill is out of scope here — any new
  check registers a new `e2e_<area>_loop` in `docs/15-e2e` first (TBD + owner), per README §11.
- `store_loop` never calls the SDK live.
- Both SDKs run the same generated contract tests in CI.

## 10. Residual v0 gaps

- Retry schedule constants (max attempts, window) are named TBD (owner:
  Platform; measured from first production workload).
- SDK publish pipeline lift (Docker builds per Node/Go; hub + npm + Go module
  registry) timed with `rest-api.md` — no number invented here.
- Go SDK ships the same TTL/window semantics as Node, verified by the same
  contract tests, not by a parallel design.

---