# Fortress Dev Loop — Project State

> Loop: `dev` — batch 5, checkpoint-only, verify with tests/build per batch.
> Test/fix loop: `testfix` — `npm test`, max 3 failures per round.
> Spec: `Frame30 Fortress Architecture — High-Assurance Multi-Tenant Security, Auditable SLOs, Trust Boundaries & Disaster Recovery.md` (51 sections, repo root, normative).
> Graph: project `framique` — 124348 nodes / 313483 edges, coverage clean (0 parse_partial, 0 skipped).
> Swarm: 6 agents, 2026-09-18. Scope: `src/`, `supabase/`, `scripts/`, `ops/`, edge configs. Noise `skills/`, `.agents/` excluded.

## Scorecard (swarm verdicts)

| Workstream | Verdict | Critical gaps |
|---|---|---|
| T Tenant identity / context (§1.2–1.3, TB-2, INV-01/13) | FAIL | T1 header-first selection, T2 no immutable TenantContext, T3 no edge strip, T4 client merchantId in public beacons |
| D Data plane (TB-3/4, INV-02–07, §29/31) | PARTIAL (customization PASS) | D1 vault/money tables lack RLS, D4 jobs lack resource_id/ownership re-verify, D6 observability docker-sock+privileged |
| A Audit/telemetry/secrets (§26/27, SLO-S03/S05/K01–K03) | PARTIAL/FAIL | A2 all 12 §27 names missing, A3 service-role ungoverned, A4 no secret inventory/rotation enforcement |
| C Capability/supply-chain (§30/31/33, SC01–03, H01/02) | PARTIAL/FAIL | C3 no SBOM/provenance, C4 tag-not-digest pins, C5 fail-open dep audit |
| R Deployment/release (§34–36, §43, D01–04, A03/04) | PARTIAL/FAIL | R2 no A/B cross-tenant gate, R3 no SBOM/provenance/digest verify, R1 no drain logic |
| V Recovery/incident (§17–25, §37–40, §45–47) | PARTIAL/FAIL | V1 WAL off (RPO unachievable), V7/V8 no quarantine/lockdown bundle, V9/V10 dashboards missing |

## TODO backlog (priority order)

- [x] **ENV-1** (P0 INCIDENT — RESOLVED `da8396c`) All SSR routes hung pre-first-byte; root cause was the hand-rolled pull()-loop meta injector in `withSecurityHeaders` (server.ts) buffering without enqueueing; rewritten as TransformStream. Verify: / 200 111KB 0.5s, /auth 200 38KB, all inline scripts nonced, </html> streams.
- [ ] **T3** (High, TB-2/INV-01) Strip inbound `X-Merchant-Id`/`X-Tenant-Id`/`X-Store-Slug` at app entry + edge conf — DONE batch 1 (`986f07a`)
- [ ] **C2** (Med, §30) Remove dead `pg_catalog_exec` generic-SQL RPC call (`support-moderation.server.ts:589`) — DONE batch 1
- [ ] **A8** (Low, ops) Fix metric drift `framique_auth_event_total` → `framique_auth_events_total` per runbook — DONE batch 1
- [ ] **A5** (Med, SLO-K03) Extend `secret-scan.mjs` to built bundles (`.output/`, `dist/`) — DONE batch 1 (bundles clean; only pre-existing `.env` finding)
- [ ] **D5** (Med, INV-06) `queueIndexOps` idempotency key uses `Date.now()` — replace with content hash — DONE batch 1
- [ ] Follow-up: `.env` is git-tracked and trips `secrets:scan` (`AUTH_HASH_SALT`) — pre-existing on main; decide: untrack + `.env.example` vs documented exception (careful: systemd `EnvironmentFile=/opt/frame28/.env`)
- [ ] **T1** (Critical, INV-01/SLO-S01) Reorder `extractTenantIdentifier` to verified-host-first; update `tenant-canary.test.ts` — BATCH 2
- [ ] **T2** (High, INV-13) Introduce immutable per-request `TenantContext` (AsyncLocalStorage) + migrate middleware — BATCH 2
- [ ] **D4** (High, TB-4) Jobs: add `resource_id`/`operation`, require `merchantId` on sched path, ownership re-verify in `search.sync` — BATCH 2
- [ ] **A2** (High, SLO-telemetry) Emit canonical §27 event names at denial/sensitive points — BATCH 2
- [ ] **C3/C4** (High, SC01/03) SBOM+provenance in CI + digest pinning — BATCH 3
- [ ] **R2** (High, §36) SECURITY_TENANT_A/B cross-tenant release gate + wire into preflight — BATCH 3
- [ ] **V1** (Critical, SLO-R01/02) Enable WAL archiving (archive_mode on + archive_command) in framebase — BATCH 3 (infra)
- [ ] **A3** (High, SLO-S05) service-role approved-caller allowlist + `SERVICE_ROLE_USE` audit — BATCH 4
- [ ] **V7/V8** (High, §24/25) Atomic tenant-quarantine action + global lockdown flag — BATCH 4
- [ ] **V9/V10** (High, §39/41) `/root/recovery` + `/root/security` dashboards — BATCH 4
- [ ] **D1** (High, INV-02) RLS for vault/money/job/media tables — BATCH 5
- [ ] **A1/A6/A7** (Med) Audit record fields (`request_id`/`result`/`source`), deploy/quarantine audit rows, CODEOWNERS + exception tracker — BATCH 5
- [ ] **R1/R4/R5** (Med) Drain logic + telemetry, approval + bake/soak, rollback timing proof — BATCH 5
- [ ] **D2/D3/D6/T4/V2–V6/V11/C1/C5–C8/R6–R8** — follow-up batches per severity

## Batches completed

- [x] Batch 0: swarm analysis (6 agents) + mem0 context + this file.
- [x] Batch 1 (`986f07a`): T3 + C2 + A8 + A5 + D5. Verify: 152 targeted tests pass (6 files), tsc clean on all touched files, vite build green, fresh-bundle secret-scan clean. Live-verify BLOCKED by ENV-1 (proven environmental, not from this batch).
- [x] ENV-1 fix (`da8396c`): TransformStream injector rewrite. Next loop item: batch 2 (T1, T2, D4, A2).
