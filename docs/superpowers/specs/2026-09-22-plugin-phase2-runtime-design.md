# Plugin Phase 2 — Runtime + Contracts (detailed spec)

- **Date:** 2026-09-22 ~19:00 +06:00 (Asia/Dhaka)
- **Parent:** `docs/superpowers/specs/2026-09-22-plugin-system-rebuild-design.md` §3
- **Completeness decision:** full docs/12 vision, no shortcuts (user, 2026-09-22 18:58 +06:00) — sidecar host = supervised sandboxed process per tenant-plugin, which is exactly what `docs/12-marketplace/plugins.md` §3 names ("a sandboxed process/VM per tenant, launched by the platform runtime"). Container-orchestrator (k8s/nomad) is out of scope for this topology; process-level isolation IS the spec'd host.
- **Context evidence:** 3-subagent sweep 2026-09-22 18:55 +06:00 (runtime/infra, scopes/oauth, events/purge). Every claim below carries its source.

## Established truths (do not re-litigate in plan)

1. `job_queue` + `job-queue.server.ts` (enqueue/claim/complete/fail/drain/reclaimStalled/dead-letter) + `job-handlers.server.ts` registry EXIST — retry/durability reuses them, no new infra.
2. Redis (`redis.server.ts`, hand-rolled RESP2) is optional/env-gated — correctness stays Postgres; Redis only accelerates (dedupe keys, throttle windows).
3. Webhook pipeline (`webhooks.server.ts`, `webhook-signing.ts`: HMAC `t=,v1=`, 5-min tolerance, 6-attempt backoff) is the signing/delivery template — plugin hooks copy the scheme, they do NOT invent one.
4. The 4 code hooks have ZERO prod call sites — emission wiring is product work, not plumbing.
5. Scopes diverge 3 ways (8 snake widget vs 14 dotted API vs oauth.md with zero concrete strings) — oauth.md is NOT approved here; interim registry + adapter (R2-0).
6. Kill switch is REAL (`enabled` fold-in gates hooks + widgets) — suspend builds on it, never beside it.
7. `auditAction(db, merchantId, actor, action, resourceType, changed={}, resourceId=null)` — all lifecycle writes audit through it.

## R2-0 Scope registry (interim canonical + adapter)

- Freeze the 8 widget strings (`read_shop, read_products, write_products, read_orders, read_customers, write_cart, write_analytics, render_storefront`) as the canonical Phase-2 registry (`marketplace-scopes.ts`).
- Ship a static adapter map 8-snake ↔ 14-dotted (`api-scopes.ts`) with a contract test asserting every widget scope maps to ≥1 API scope and no API scope is inventable from a widget scope (fail-closed on unknown).
- oauth.md stays Planning/unapproved; retrofit path recorded: when approved, its tables/names align to live (`oauth_clients`/`oauth_tokens`) or vice versa — Phase 2 blocks nothing on it.
- Hook→scope gate map (enforced in `callOne`): `cart.calculate→{read_products,write_cart}`, `checkout.validate→{read_orders,write_cart}`, `order.created→{read_orders}`, `product.saved→{read_products,write_products}`. Missing grant ⇒ `skipped:scope` outcome + metric, never delivery.

## R2-1 Consent evidence (close the ask-as-grant hole)

- Install writes persist `granted_scopes` (actual granted subset —_subset of manifest, enforced), `manifest_version`, `consented_by` (actor or platform-attribution for builtin self-grant path, explicitly labeled, never silent).
- Fix `upsertPlugin`: store the granted subset, not `manifest.permissions`; throw `plugin_consent_required` on missing (keep) AND on superset/unknown (new).
- Marketplace install persists the same triple on the ledger insert (proof survives uninstall disputes).
- Every grant/revoke writes `activity_log` (`plugin.scopes_granted`, `plugin.scope_revoked`).

## R2-2 Sidecar host (supervised sandboxed process)

- Supervisor (new `plugin-sidecar.server.ts`): starts one worker per ACTIVE install (active = enabled AND not suspended AND not kill-switched), stops on suspend/uninstall/revoke; heartbeat per worker; crash ⇒ auto-resume with idempotent effects (replay from `job_queue`, never re-fire without idempotency key).
- Sandbox: isolated JS runtime (no Node I/O), `resourceLimits` CPU/mem caps set from manifest `sandbox_claims` (numbers fixed in plan with infra owner — enforced from day one); egress ONLY via host gateway to manifest-declared vendor endpoints + platform pipeline ingress; breach ⇒ `suspended`, never crash. No shared globals with storefront/checkout/render.
- Identity: worker carries `(merchant_id, plugin_id, granted_scopes)`; every outbound call re-checked at the gate (defense in depth with R2-0).
- Only active installs run; `changed` PII / revoke ⇒ worker stopped (see R2-5).

## R2-3 Hook delivery hardening

- Sign EVERY callback with the webhook scheme (`t=,v1=` HMAC, 5-min tolerance) — `callOne` imports from `webhook-signing.ts`, no parallel implementation.
- Keep the 800ms sync fast-path; on timeout/error/breaker-open ⇒ enqueue to `job_queue` (`plugin-hook` handler) with idempotency key per delivery, exponential backoff, dead-letter after exhaust; breaker stays (3 fails/60s) and now ALSO gates dequeue.
- Outcome taxonomy extended: `delivered | skipped | skipped:scope | timeout | queued | failed | dead_letter` — all metered on the existing `framique_plugin_hook_total/ms` series.
- Redis (if configured): delivery-dedupe keys + per-plugin throttle windows; never on the correctness path.

## R2-4 Event emission wiring (the 4 hooks fire for real)

- `cart.calculate` at cart mutation commit; `checkout.validate` at checkout validation gate (advisory — caller keeps own result, per existing never-throw contract); `order.created` at order commit (alongside existing `log("order.created")`, NOT replacing it); `product.saved` at product write commit.
- Each site: `runHook(installedFor(merchant), hook, payload)` + structured log; each covered by a fakeDb/contract test asserting fire-on-commit and no-throw on subscriber failure.
- Subscribe-list ⊆ `SERVER_HOOKS` enforced at install AND review (Phase 4 consumes this).

## R2-5 Suspend machine

- Triggers: scope revoke, envelope breach, review regression, kill-switch. Effect: worker stopped, hooks skipped, widgets hidden (via existing `enabled` fold-in — suspend sets the same gate, one mechanism), data retained, `suspended_reason` + `suspended_at` surfaced in the desk.
- Resume: explicit re-approval (scope re-grant) or breach cleared + operator resume; resume writes audit, restarts worker, replays missed durable deliveries from `job_queue` by idempotency key.
- New `plugin_state` columns: `suspended boolean NOT NULL DEFAULT false`, `suspended_reason text`, `suspended_at timestamptz`, `version_pin text NOT NULL DEFAULT ''`, `consented_by uuid`, `manifest_version text NOT NULL DEFAULT ''`. (`scopes` column keeps meaning = granted set, fixed by R2-1.)

## R2-6 Purge machine (docs/12 §9, minimal-real)

- Uninstall path becomes `uninstalling → enqueue purge job → purge_running → purge_complete | purge_failed(+retry)`; ledger terminal `purged` (enum value already exists from Phase 1).
- `plugin-purge` job handler (registered in `job-handlers.server.ts`): deletes `plugin_state` row, scoped workspace rows, related undelivered queue rows; writes `plugin.purged` audit + purge report (counts only, key-only logs — PII-minimal); failure ⇒ `purge_failed` with item retained, idempotent retry.
- `uninstalling` is a real transitional state (desk shows progress, no new deliveries); `removed` stays the ledger state for non-purge uninstalls only where purge is inapplicable (themes) — plugin uninstalls ALWAYS purge.

## R2-7 validateBundle in the install path

- Call existing `validateBundle` (512KB cap, `dynamic_code` refuse) inside `upsertPlugin` AND `installListing` before any write; failure ⇒ `plugin.bundle_rejected` with `blocked_reason` persisted, zero rows written.
- Seller-publish call stays; client-preview call stays.

## R2-8 Acceptance + repo rules

- TDD throughout; deny (cross-merchant, revoked-scope delivery refused, unsigned callback refused) + replay (idempotency-key double-delivery ⇒ one effect) + audit (every machine transition writes `activity_log`) per `[A]`.
- Contract tests: adapter map completeness, hook→scope gate matrix, suspend/resume transitions, purge handler idempotency, emission fire/no-throw.
- Live: migrations applied as `supabase_admin` BEFORE deploy (Phase-1 lesson, now law); production browser verification of suspend/resume + purge on a seeded test install (never a live merchant's plugin); CHANGELOG + mem0 per task; push per task.
- Typecheck/schema:check close in CI (local runners infra-blocked — standing position).

## Decisions log

| Time (+06:00) | Decision |
|---|---|
| 18:55 | Research: queue/Redis/signing exist; hooks never fire; scopes diverge 3 ways; no purge; kill switch real |
| 18:57 | Complete solution required (user) — full host + contracts, process-level sidecar per docs/12 §3 |
| 19:00 | oauth.md NOT approved; interim 8-string registry + dotted adapter; ask-as-grant fixed; suspend folds into enabled gate; uninstall always purges for plugins; spec written |
