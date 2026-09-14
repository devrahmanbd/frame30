# 10 — AI Support

Status: Planning · Slice S8 · Reference: `/plan.md` §3.12 (AI support), `01-architecture` (LLM service)
Design: `design-system.md` (accessible, human voice)

---

## 1. Purpose

AI support assistant for merchants + buyers across surfaces: in-admin, storefront widget, WhatsApp/MFB(?) integration. Grounded answers (RAG over docs, knowledge base), escalate-to-human, Bangla-first. No hallucinated specifics on money/stock without live lookup.

The assistant is **advisory only**: it answers from known sources, drafts replies, and suggests actions — it never mutates order, payment, refund, or stock state directly. Every state-changing action it suggests is executed by the merchant (or buyer, where allowed) through the same order/payment machines in `docs/06-payments` and `docs/07-commerce`, opening the normal confirmation flow. On-storefront chat widgets and the merchant support panel consume the same chart API data as the analytics dashboards (`docs/09-analytics`) so dashboard-adjacent answers never mint their own numbers. Every AI draft and every decision the assistant surfaces carries a human-visible source (provenance tag, cited doc, or pinned tool result).

## 2. Features / pages

Surfaces (same assistant, different channels):

- **Storefront chat widget** — buyer support: order status, refund/return help, product questions. Answers money/order/stock only from server-pinned tool lookups; otherwise falls back to "Contact us" with a ticket.
- **Admin AI panel (merchant support)** — merchant Q&A log with ratings, suggested replies, provenance-tagged answers, and a "Talk to an agent" handoff that auto-fills the order id into the agent inbox (`docs/02-merchant`).
- **WhatsApp/MFB(?) channel** — via a gateway adapter; channel pick is a named TBD (see §13).
- **Escalation workshop** — human handoff, ticket + agent inbox in `02`, SLA alerts; canned replies and trust copy templates.

Services:

- **RAG** — embeddings (Bengali-capable ONNX / dim TBD), docs + FAQ index; retrieval on merchant/buyer question; corpora are merchant-scoped.
- **Agent** — tool calls pin to a pattern where policy allows (pricing, order status, refund, stock); only answer from a known source; if unknown → "Contact us" with a ticket.
- **Human handoff** — ticket, agent inbox in `02`, SLA alerts; two consecutive unsure turns or an explicit user request escalate.
- **Channels** — chat widget storefront, WhatsApp (via gateway), admin "help" panel.

## 3. Data model (+ RLS statement)

| Table              | Notes                                                                              |
| ------------------ | ---------------------------------------------------------------------------------- |
| `kb_docs`          | merchant-scoped knowledge-base documents + docs index; source of provenance tags   |
| `faq_chunks`       | chunked, embedded FAQ corpus; embeddings in the `ai.vector_index` TBD (see §13)    |
| `ai_conversations` | session log per tenant; PII-minimal; kept only within the session log window       |
| `ai_tool_calls`    | every pinned tool invocation + result, for audit and "matches source table" checks |
| `escalations`      | handoff rows linking to the ticket and the auto-filled order id                    |
| `ratings`          | "Answer OK?" thumbs feedback, per conversation                                     |

RLS is enforced on **every** tenant query — including every AI tool call and every RAG retrieval — so the assistant never sees another tenant's data:

```sql
alter table kb_docs            enable row level security;
alter table faq_chunks         enable row level security;
alter table ai_conversations   enable row level security;
alter table ai_tool_calls      enable row level security;
alter table escalations        enable row level security;
alter table ratings            enable row level security;

create policy "merchant_reads_own_ai_conversations"
  on ai_conversations for select
  using (merchant_id = current_setting('app.merchant_id')::uuid);

create policy "merchant_reads_own_escalations"
  on escalations for select
  using (merchant_id = current_setting('app.merchant_id')::uuid);
```

The API layer sets `app.merchant_id` from the bearer session via a security-barrier-definer RPC (the same guard pattern as `analytics.as_merchant` in `docs/09-analytics/event-pipeline.md`); no AI query relies on application-layer filtering alone. Chat context is fetched tenant-scoped through the same RLS paths as the storefront; RAG corpora are merchant-scoped; the assistant never sees another tenant's orders.

## 4. API

- **Conversation endpoints** — create / reply / rate / escalate, bound to the tenant session. The API layer sets `app.merchant_id` from the bearer session; all reads ride the RLS policies in §3.
- **Pinned tool surface** — order lookup, price lookup, stock, refund/status eligibility. Money/order/stock answers come **only** through these structured APIs via tool calls, never freeform generation; every tool call is scoped by the tenant's `merchant_id` and recorded in `ai_tool_calls`. Every money figure renders via `fmtBDT` (integer BDT, tabular numerals); money answers re-derive from source tables at answer time.
- **Chart API** — the storefront widget and admin panel consume the same precomputed chart API as the analytics dashboards (`docs/09-analytics`) for any dashboard-adjacent answer; no client-minted numbers.
- **Rate limit per tenant; abuse guard** — per-tenant rate limiting with an abuse guard.
- **Prompt-injection guard** — user text is scanned for unsafe/prompt-injection content before it reaches the model (`ai.unsafe.blocked` on reject).
- **Failure** — tool call malformed → retry once, then a bounded fallback that never fabricates; provider down → static FAQ lookup with a "Caution" notice (no dead chat).

## 5. State transitions

One state machine, owned here: the **conversation** machine. Escalation after 2 unsure turns or explicit user.

```text
                    +----------------------+
                    |         open         |
                    +----------+-----------+
                               | user message
                               v
                    +----------------------+
                    |     answering (tool) |  tool calls pinned to server
                    |  (money/order/stock  |  APIs; every lookup RLS-scoped
                    |   only via lookups)  |  by merchant_id
                    +----+-----------+-----+
                         |           |
          answered in ≤2 |           | 2 unsure turns
          tool turns     |           | OR explicit user
                         v           v
                    +---------+   +----------------------+
                    | answered|   |      escalate        |
                    +----+----+   +-----------+----------+
                         |                    | support.ticket_created
          user closes /  |                    v
          rating         |              +----------------------+
                         |              |  ticket in 02 inbox  |
                         v              |   (order id filled)  |
                    +---------+          +----------+-----------+
                    | closed  |                     |
                    +---------+                     | agent resolves
                                                     v
                                              +----------------------+
                                              |        closed        |
                                              +----------------------+
```

Rules the machine owns:

- `open → answering`: the assistant may only draft/answer from a known source (pinned tool result or cited KB doc); unknown → the "Contact us" path with a ticket.
- `answering → escalate`: 2 consecutive unsure turns, or an explicit user request. Escalation auto-fills the order id into the admin queue.
- The assistant **suggests** actions only; cancel, reorder, refund, status changes are executed by the merchant or through the same order/payment machines in `docs/06` and `docs/07` — the assistant never mutates state directly; a suggested action opens the merchant's normal confirmation flow.

## 6. Events

| Event                     | When                                                   |
| ------------------------- | ------------------------------------------------------ |
| `support.ticket_created`  | an escalation becomes a ticket in the `02` agent inbox |
| `ai.reply_drafted`        | a draft reply is produced (provenance tag attached)    |
| `ai.conversation.created` | a conversation session opens                           |
| `ai.rating.negative`      | a thumbs-down rating is submitted                      |
| `ai.escalated`            | a conversation hands off to a human                    |
| `ai.unsafe.blocked`       | prompt-injection / abuse scan rejects user text        |

All events are tenant-scoped and PII-minimal.

## 7. Vendors / swap-out

- **LLM provider is swappable behind an interface** (`LLMService` contract). A mock provider ships in dev per the repo pattern (same as the mock MFS sandbox); the production vendor pick is a named TBD (`ai.model_picker`, §13). No phase doc may assume the vendor is permanent.
- **Embedding model + vector store**: Bengali-capable ONNX embeddings; vector store host is a drop-in behind the retrieval interface; the concrete model/dimension/host is a named TBD (`ai.vector_index`, §13).
- **WhatsApp/MFB(?) channel**: gateway adapter behind the channel interface; pick is a named TBD (`ai.whatsapp_channel`, §13).
- **Data export**: escalation logs and transcripts export via the shared exporter (`docs/13-export-sdk`) with consent filters; no third party receives raw support transcripts with PII.

## 8. Consent & privacy

- GDPR-grade; the chat respects all consent flags from `docs/05-marketing`; behavior/trajectory collection requires consent per `00-meta/README.md` §5.
- No PII is retained in training corpora; chat logs are PII-minimal and kept only within the session log window; raw analytics retention is the 90d window from `docs/09-analytics` — never extended by AI-side collection.
- A user can request the transcript be deleted and it is honored everywhere (see `docs/03-storefront/accounts`).
- "Apologies if wrong" fallback and anonymity guarantee are built into the trust copy; the assistant never exposes PII across tenants (RLS per org).

## 9. A11y & performance

- WCAG 2.2 AA minimum (AAA inherited on checkout/refund/auth flows the assistant links into, per `00-meta`); status never color-only — always icon + text + color; Noto Sans Bengali variable for Bangla rendering, `lang="bn"` and `dir="ltr"` on the widget.
- Widget fully keyboard-operable; chat messages appear in an `aria-live` region; auto-suggest has visible `focus-visible`; no auto-scroll forced; typing dots become static text under `prefers-reduced-motion`.
- AI panel lazy-loads JS and streams answers — never blocks the storefront; storefront LCP budget per `design-system.md` §8; admin list surfaces (Q&A log) virtualize above 200 rows.

## 10. Design guidelines

Per-page, per `design-system.md` §10 template. Tokens only: Teal `--bd-teal` primary, Rickshaw Red `--bd-red` alert, Bondhu Amber `--bd-amber` warn, Mint `--bd-mint` success, `--bd-*` scale, `font-variant-numeric: tabular-nums` for money, `prefers-reduced-motion` collapses motion to opacity.

### Design guidelines — storefront chat widget

- Intent: assist within 2 seconds or escalate with grace; never presents opinion as fact about money.
- Key surfaces: chat bubble, suggestion chips, typing indicator, "Talk to an agent" handoff, provenance tag chips under answers.
- Palette emphasis: Teal `--bd-teal` accents; Mint `--bd-mint` "Estimated answer" provenance tag; Bondhu Amber `--bd-amber` escalation.
- Typography: chat plain (Noto Sans Bengali variable); sources listed as chips; Bangla + English toggle; money in tabular-nums via `fmtBDT`.
- Density: widget minimal, airy; single column on mobile with bottom-anchored input.
- Motion: bubble entrance 160ms; typing-dots pulse (`--bd-dur-*` tokens); reduced-motion → static text.
- A11y: fully keyboard; auto-suggest focus-visible; messages in an `aria-live` region; no auto-scroll forced.
- Performance: widget lazy-loads JS; answers streamed, not blocking.
- Anti-slop check: a Bangla "Answer OK?" thumbs-on message card; escalation includes the order id auto-filled; "Apologies if wrong" fallback built into copy.

### Design guidelines — admin AI panel

- Intent: the merchant can see every AI answer, its source, and the handoff trail at a glance.
- Key surfaces: Q&A log with ratings, provenance tag chips, escalation rows with status chips, suggested-action cards.
- Palette emphasis: Mint `--bd-mint` for sourced/"Estimated" answers; Bondhu Amber `--bd-amber` for pending escalation; Rickshaw Red `--bd-red` for blocked/unsafe.
- Typography: dense 0.875rem default; tabular numerals for order ids and money; Bangla-first labels.
- Density: admin-dense table; expandable rows for tool-call audit.
- Motion: subtle status chip pulse only while a reply is streaming; reduced-motion → static.
- A11y: table with `th scope`, keyboard row nav, status not color-only (icon + text + color).
- Performance: virtualized list > 200 rows; route-level code splitting per `design-system.md` §8.
- Anti-slop check: every AI row shows its source chip and a link to the exact tool result — no "trust me" AI.

### Design guidelines — escalation workshop / trust copy

- Intent: handoff feels human, immediate, and honest about limits.
- Key surfaces: handoff card (order id pre-filled), SLA notice, "Contact us" copy variants, canned reply editor.
- Palette emphasis: Bondhu Amber `--bd-amber` for pending; Teal `--bd-teal` for the handoff CTA.
- Typography: Bangla-first; tabular order id; no all-caps Bangla (weight + size for hierarchy).
- Density: form-like, generous spacing; mobile-first.
- Motion: entrance fade + 8px rise 200ms; reduced-motion → opacity only.
- A11y: labels always visible (no placeholder-as-label); inline errors + `aria-describedby`.
- Performance: static copy, no runtime payload.
- Anti-slop check: escalation auto-fills the order id and a human name, never an anonymous "bot queue".

## 11. Testing gates → loops

Restricted to EXISTING loops in `docs/15-e2e`, contract-first (P4 — suites are contracts today, nothing ships):

- `store_loop`: pins money/order/stock questions to the server lookups (answer matches the real table value, `fmtBDT`-rendered); the handoff carries the correct order id; the provider-down simulation shows graceful fallback (static FAQ + "Caution", no dead chat); no test asserts hallucinated totals.
- `admin_loop`: re-runs the AI panel assertions — provenance chips present, escalation rows carry order ids, ratings recorded.

Any NEW check beyond these must register a new loop: `e2e_ai_support_loop` — registered in `docs/15-e2e` §Suites (spec: `ai_support_loop.md`); ops owner TBD (see §13). PR gate: critical `store_loop` must pass; Lighthouse a11y ≥ 90 on release.

## 12. Audit checklist

Mapping against `docs/00-meta/audit-verdict.md`: AI support is not a summary-table row in the audit; the corpus cites `docs/10-ai-support` via `00-meta/README.md` §5 (consent + retention for behavior collection). Claims below were verified against the planning tree, not memory.

- [x] Money/order/stock answers only from pinned server tools, `fmtBDT`, re-derived at answer time — no invented totals.
- [x] RLS on every tenant query including AI tool calls and RAG retrieval (`merchant_id` via `current_setting('app.merchant_id')`).
- [x] One state machine (conversation) owned by this phase README — no parallel copies elsewhere; assistant never mutates order/payment state.
- [x] `support.ticket_created`, `ai.reply_drafted`, `ai.conversation.created`, `ai.rating.negative`, `ai.escalated`, `ai.unsafe.blocked` — verbatim event keys.
- [x] LLM provider swappable behind an interface; mock provider in dev; vector store drop-in — per `00-meta` §4.
- [x] Every number in this README traces to a phase plan or is a named TBD (owners in §13).
- [x] E2E mapping back to `docs/15-e2e` suites (`store_loop`, `admin_loop`); new checks gated on `e2e_ai_support_loop` (suite registered in `docs/15-e2e`).

## 13. Residual gaps

| Item                                                                                           | Owner   |
| ---------------------------------------------------------------------------------------------- | ------- |
| `ai.vector_index` — embedding model + dimension (Bengali-capable ONNX) + vector store host     | **TBD** |
| `ai.model_picker` — production LLM vendor behind the `LLMService` interface (mock in dev)      | **TBD** |
| `ai.whatsapp_channel` — WhatsApp/MFB(?) gateway adapter and channel enablement                 | **TBD** |
| `ai.escalation_sla` — human-handoff SLA threshold for the escalation alerts                    | **TBD** |
| `e2e_ai_support_loop` — suite registered in `docs/15-e2e`; ops owner + release gate | **TBD** |

---

### Strict guardrails — AI support

1. **Money & orders** — Any answer touching money, stock, or order state must call the pinned server tools (order lookup, price lookup) with the tenant's `merchant_id`; the model never invents totals or availability; every money figure renders via `fmtBDT`; answers to money questions re-derive from source tables at answer time.

2. **Data & tenancy** — Chat context is fetched tenant-scoped through the same RLS paths as the storefront; the assistant never sees another tenant's orders; no personal data from the chat is retained beyond the session log window; RAG corpora are merchant-scoped.

3. **State transitions** — The assistant can only suggest actions; actions (cancel, reorder, refund, status change) are executed by the merchant or through the same order/payment machines in docs/06 and docs/07; the assistant never mutates state directly — a suggested action opens the merchant's normal confirmation flow.

4. **Vendors & data-export** — Escalation to a human support member includes the order id auto-filled into the admin queue; the log exports via the shared exporter (docs/13) with consent filters; no third party receives raw support transcripts with PII.

5. **Consent & privacy** — The chat respects all consent flags from docs/05; no PII is retained in training corpora; the "Apologies if wrong" fallback and anonymity guarantee; a user can request the transcript be deleted and it is honored everywhere (see docs/03 accounts).

6. **Accessibility & performance** — Widget is fully keyboard-operable, chat messages appear in an `aria-live` region, typing dots are static text under reduced motion; the AI panel lazy-loads and streams answers — never blocks the storefront.

7. **Failure & recovery** — Provider or RAG down → the "Talk to an agent" handoff is always available; answers show provenance tags ("Estimated answer") and never present opinion as fact about money; two consecutive uncertain answers trigger human handoff with the order id.

8. **Testing gates** — `store_loop` pins money/order/stock questions to the server lookups (answer matches the real table value), the handoff carries the correct order id, and the provider-down simulation shows graceful fallback; no test asserts hallucinated totals.

---

### Failure/recovery

- LLM down → fallback static FAQ lookup + "Caution" notice; no dead chat.
- Tool call malformed → retry once then bounded fallback, never fabricate.
- Provider or RAG down → the "Talk to an agent" handoff is always available.
