# 15-e2e — AI support loop (E2E spec)

Status: Planning · Slice S8 · Reference: `docs/15-e2e/README.md:17` (registered loops), `docs/15-e2e/admin_loop.md` (frameset/harness §2), `docs/10-ai-support/README.md` §1–§2 (advisory-only + surfaces), `docs/02-merchant` (agent inbox), `docs/07-commerce` (orders/stock authority), `docs/06-payments/README.md` §4 (money authority) · `SYSTEM.md` §Conventions

Owner (eventual): QA · fixtures: ai support ops

## 1. Scope

The e2e contract the AI-support slice ships against: storefront chat answers carry provenance chips; money/order/stock answers match real table values via `docs/06` `fmtBDT` (never client-computed); provider-down → static FAQ + "Caution" copy with no dead chat; escalation rows carry order ids and land in the `docs/02-merchant` inbox. Playwright is deferred until the S1 scaffold exists (README §17); this spec defines scenarios + acceptance, not the runner.

## 2. Harness

Reuses `docs/15-e2e/admin_loop.md` frame: seeded AI fixtures (`ai.features` rows incl. the FAQ intent set), seeded storefront with a live order + stock rows, seeded gateway env `mock` (in-process), seeded provenance pins for the chips, seeded escalation/`docs/02-merchant` inbox with one handler. Money/service values come from the same seeded tables the storefront reads (`docs/07-commerce`, `docs/06`); the chat channel is a named TBD per `docs/10-ai-support/README.md` §13 (no literals until sign-off). The suite calls the edge layer as a logged-in buyer — `service_role` is never used; a dedicated failure test asserts `service_role`-keyed calls are denied.

## 3. Corpus anchor (README §17)

> **AI support loop** (spec: `ai_support_loop.md`): provenance chips on sales answers; money/order/stock answers match real table values via `fmtBDT`; provider-down → static FAQ + "Caution" copy, no dead chat; escalation rows carry order ids.

## 4. Scenarios (canonical)

**Golden A — provenance chips.** A buyer asks about an order; the answer renders a provenance chip (source doc / pinned tool result) per §1 — every claim is traceable to a cited row or pinned lookup, mirrored in the admin Q&A log with the same tag. Asserts: chip label matches the `provenance.row_id`, log row tags the same source.

**Golden B — money/order/stock answers match tables.** Service questions (amount, status, stock) answer only from server-pinned lookups seeded in the harness; the rendered money uses `fmtBDT` (tabular-nums) equal to the fixture's integer `amount_minor_int` — no float in the output. Asserts: rendered string equals fixture `fmtBDT` value; a client-sent guess is never echoed.

**Golden C — provider-down → static FAQ + Caution.** AI gateway times out (mock failure); chat stays reachable, serves the static FAQ + "Caution" copy (README §17), no dead chat; no `ai.answer` row for unanswered turns.

**Golden D — escalation carries order ids.** "Talk to an agent" auto-fills the order id into the `docs/02-merchant` inbox ticket; the escalation row `order_id` matches the request and is idempotent on retry (same row, no duplicate ticket).

## 5. Failure suite (README §19)

- Provider-down → static FAQ + "Caution" copy; no `ai.answer` row written.
- No server-pinned source → refuses to answer and offers "Contact us" with a ticket (`docs/10` §2), never a hallucinated value.
- `service_role` probe: storefront + admin AI calls reject `service_role` (auth-only per `docs/17-owner-console` §10).
- Escalation idempotency: repeated "Talk to an agent" → one inbox ticket, one escalation row.
- No PII: AI answer rows and logs carry no buyer PII (fixtures only, `docs/02-merchant` §privacy).

## 6. Evaluation

Run after the AI-support slice merge; the critical golden `provider-down → static FAQ + Caution, no dead chat` must pass before the storefront widget ships. This spec's owner registers the suite in `docs/15-e2e` §Suites (`ai_support_loop`) — the README §17 name redirects here.