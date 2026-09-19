# Night Shift — Run a Clothing Business End-to-End

Goal: merchant dashboard works, store live on microscrop.shop (custom domain),
clothing products + theme, one real purchase. No manual intervention.

## State
- [x] 429 storm fixed + pushed (415b341, live after deploy)
- [x] microscrop.shop DNS proven on both DoH resolvers (TXT + A)
- [ ] Login + dashboard audit (IN PROGRESS)
- [ ] Dashboard blockers fixed
- [ ] Domain verified via real state machine
- [ ] Custom-host storefront route implemented
- [ ] Clothing theme + products seeded
- [ ] Purchase completed on custom domain
- [ ] Full verification green

## Fortress loop state (other session — preserved verbatim below)
| Workstream | Verdict | Critical gaps |
|---|---|---|
| T Tenant identity / context (§1.2–1.3, TB-2, INV-01/13) | FAIL | T1 header-first selection, T2 no immutable TenantContext, T3 no edge strip, T4 client merchantId in public beacons |
| D Data plane (TB-3/4, INV-02–07, §29/31) | PARTIAL (customization PASS) | D1 vault/money tables lack RLS, D4 jobs lack resource_id/ownership re-verify, D6 observability docker-sock+privileged |
| A Audit/telemetry/secrets (§26/27, SLO-S03/S05/K01–K03) | PARTIAL/FAIL | A2 all 12 §27 names missing, A3 service-role ungoverned, A4 no secret inventory/rotation enforcement |
| C Capability/supply-chain (§30/31/33, SC01–03, H01/02) | PARTIAL/FAIL | C3 no SBOM/provenance, C4 tag-not-digest pins, C5 fail-open dep audit |
| R Deployment/release (§34–36, §43, D01–04, A03/04) | PARTIAL/FAIL | R2 no A/B cross-tenant gate, R3 no SBOM/provenance/digest verify, R1 no drain logic |
| V Recovery/incident (§17–25, §37–40, §45–47) | PARTIAL/FAIL | V1 WAL off (RPO unachievable), V7/V8 no quarantine/lockdown bundle, V9/V10 dashboards missing |

## DR build loop (spec: docs/superpowers/specs/2026-09-18-fortress-backup-restore-design.md)

- [x] **B1** (`99df678`): WAL archiving LIVE (segments streaming, lag ~4s) + approved db recreate; backup.sh retargeted to live stack; pooler-5436 fallback; host-bind storage tar; real Redis BGSAVE path (graceful skip, app cache is memory-only); wal-lag-probe.sh; pgbasebackup.sh; live snapshot verified (db.dump 1.8MB docker-exec).
- [x] **B2** (`1636249`): 4 systemd timers installed+enabled (nightly 02:30Z, base Sun 03:30Z, hourly lag, daily verify 04:30Z); integrity-verify.sh writes integrity.json (5/5 digests OK live); B5 sync gate reads it.
- [x] **B3** (`3ad17d9`): rehearse.sh rewritten around isolated scratch PG (unique names, --network none, trap cleanup); manifest gate + pg_restore + row assertions + storage check + honest RTO/age/lag to rehearsals.jsonl; LIVE PASS RTO=10s; weekly timer Sun 05:30Z.
- [x] **B4 proof instance DECOMMISSIONED** (user request): restoref.qubickle.com removed — app unit + /opt/restoref-app + all framique-restore-* containers/volumes + compose tree + OpenResty vhost + HAProxy ACL + LE cert + HAProxy pem all deleted; live (10 containers) + staging (16) + 6 timers verified intact. Proof scripts/reports retained in repo; re-provision any time via `setup-restore-stack.sh` + `restore-target.sh`. DNS record for restoref left for owner to remove at registrar.
- [x] **B5** (`488e0f6`): rclone-sync.sh (certified-only, --checksum --immutable, check, state) + timer (needs remotes — BLOCKED on credentials); recovery-status.sh aggregator; pg_hba replication rules; WAL prune 4.8G→1.3G.
- [ ] **Follow-up**: FTP/S3 credentials for rclone remotes (only manual input outstanding); live-container deletion incident documented (recovered in minutes, collision guard added); WAL write rate ~40MB/min — investigate writer volume.
- [x] **Guide** (`04f90aa`): `docs/14-operations/backup-restore.md` rewritten as the complete step-by-step operator guide (A–G operations) with verified/unverified ledger; same-host restore test record included.
- [x] **Rate-limit 429 incident** (`895ae88`): /root 429s were a global circuit-breaker storm — `rate_limit_hit()` referenced nonexistent `hit_count`, postgres tier always failed, no Redis, circuit opened per-bucket for all IPs. Fixed with windowed RPC (migration `20260919030000`) + `system.console` (600/60) + `system.ingress.loopback` (3000/60); smoke script 60+30 bursts zero 429s.
- [x] **Perf batch 1** (`fb31c07`): edge keepalive 64 + Connection map, /assets/ immutable 1y, gzip += woff2/rss/wasm; risk-tier RPCs parallelized; hero LCP dims/eager/fetchpriority. Measured warm: / 220ms→~60ms. risk-tier.server 1 failure proven pre-existing (netns barrier) via HEAD~1 bisect.
- [x] **Perf batch 2** (`b9ec874`): lucide namespace import replaced (obscure icons gone from bundles; also fixed widget icons silently falling back to Star); analytics tabs lazy; AAL+factors parallel; storefront 4-way parallel; liveness confirmed ~1ms. Warm / ~60ms typical (spikes to ~0.25s under investigation).
- [ ] **Perf follow-ups**: create missing get_merchant_risk_signals RPC (kills per-request failure + console.error); investigate intermittent SSR spikes; dashboard route lazy-loading; loadStorefront renderRead cache; payload limit caps; proxy_buffering split for JSON; scoped proxy_cache for feeds.
- [ ] **Follow-up**: X-Forwarded-For is trusted from clients (IP spoofing can pick buckets / dodge limits) — edge should overwrite, not append (TB-2 related).
- [ ] **B3** U5 rehearsal automation: sandbox restore + assertions + rehearsals.jsonl, fail-closed (rehearse.sh currently dangerous: stale compose, down -v, mock pass — DO NOT RUN as-is)
- [ ] **B4** U6 portable restore.sh + U7 restoref same-host stack + OpenResty vhost
- [ ] **B5** U4 rclone FTP+S3 checksum sync + U8 /root dashboards + doc sign-off + full proof

## TODO backlog (priority order)

- [x] **ENV-1** (P0 INCIDENT — RESOLVED `da8396c`) All SSR routes hung pre-first-byte; root cause was the hand-rolled pull()-loop meta injector in `withSecurityHeaders` (server.ts) buffering without enqueueing; rewritten as TransformStream. Verify: / 200 111KB 0.5s, /auth 200 38KB, all inline scripts nonced, </html> streams.
- [x] **AUTH-STREAM** (P0 FIX — RESOLVED `1236c0b`) Eliminated duplicate body buffer emission in `withSecurityHeaders` transform flush; fixed repeating navbar/logo and verified 100% responsive desktop/mobile auth layout.
- [x] **TH-1** Theme catalogue metadata & lifecycle bridge (`catalog-meta.ts`, `ThemesScreen.tsx`) — COMPLETED
- [x] **TH-2** Aarong-grade `clothing-heritage` preset & templates (`theme-presets.ts`, `theme-blueprints.ts`) — COMPLETED
- [x] **TH-3** Apparel & heritage widget suite (`category_showcase`, `artisan_story`, `lookbook`, `size_guide`) & demo catalog (`demo-catalog.ts`) — COMPLETED
- [x] **TH-4** 100% Bilingual parity dictionary (`theme-blueprints.bn.ts`) — COMPLETED
- [x] **TH-5** Storefront ThemeChrome layout, responsive & contrast polish (`ThemeChrome.tsx`, `builder-ast.ts`) — COMPLETED
- [x] **TH-6** Release verification: unit & contract test suite, typecheck, build & live deploy verification — COMPLETED
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
- [x] Auth redesign (`2c29fbc`): hallmark + frontend-design + ui-ux-pro-max; home/pricing vibe (GradientMesh, fq-glass, Space Grotesk); fabricated testimonial removed; Lucide glyphs; tablist a11y; 44px targets; overflow-x-clip responsive hardening. Logic untouched.
- [x] Auth stream duplicate fix (`1236c0b`): Fixed TransformStream buffer reset bug causing duplicate body HTML, repeating navbar/sidebar on scroll down, and verified live on production.
- [x] Theme System & Aarong-grade Clothing Storefront (`clothing-heritage`):
  - Added `clothing-heritage` to catalogue metadata (`catalog-meta.ts`) with rich features, subjects, layouts and tags.
  - Implemented `clothingHeritage()` in `src/lib/theme-blueprints.ts` with all 7 templates (`index`, `product`, `collection`, `page`, `blog`, `cart`, `checkout`), exported in `BLUEPRINT_PRESETS` and `SHIPPED_BLUEPRINT_KEYS`.
  - Registered `HERITAGE_APPAREL` demo catalogue in `src/lib/demo-catalog.ts` featuring Tangail Taant Sarees, Jamdani Sarees, Pure Silk Panjabis, Nakshi Kantha Quilts and Filigree Jewelry.
  - Added 100% Bengali translation twins in `src/lib/theme-blueprints.bn.ts` keeping translation coverage above publish gate.
  - Wired SEO profile in `src/lib/theme-seo.ts` and updated theme count in `src/lib/theme-presets.test.ts`.
  - Extracted isomorphic mailer renderer `transactional-mailer-renderer.ts` to maintain client/server import protection.
  - Hardened theme lifecycle persistence in `src/lib/themes/appearance.server.ts`: sets published version on install, guarantees coherent published version on activate, cascades version/draft deletion, and triggers tenant storefront cache purge.
  - Fixed `src/lib/widget-registry.test.ts` to include `menu` in FieldKind test set.
  - Removed `motion` dependency to strictly satisfy single animation engine (`gsap`) contract gate (`motion.contract.test.ts`).
  - Ran `bun run test:contracts` — all 13 suites, 258 tests passed with 100% success.
  - Ran `bun run build` — Nitro client/server build succeeded in 1.38s.
  - Deployed to live production host (`root@88.99.250.99`), verified active `framique.service` on port 3200.
  - Verified live storefront on `https://framique.qubickle.com/store/flame-fashion-bd` rendering full Aarong-grade `clothing-heritage` theme in English and Bengali with full responsive and visual capture verification.
## Night-shift decisions (preserved)
- Store URL model is path-based: https://framique.qubickle.com/store/<slug>.
  Custom domain optional via Settings > Domains (user instruction).
- Custom-host storefront route: deferred earlier, NOW required by user
  ("open a store on the custom domain"). Implementing host-gated route.
- Test account: flamedev7 (password used in-browser only, never stored).

## Log
- 09:30 UTC: starting. Pushed 415b341. Opening live site in Chrome.
- 09:35 UTC: logged in (session persisted). Dashboard renders, no console errors.
- 09:40 UTC: domains page renders. microscorp.shop row Live/Primary/HTTPS (manual).
- 09:45 UTC: products page: 5 active clothing products BUT all out-of-stock, 0 variants.
- 09:50 UTC: Panjabi priced 2850.00 + stock 50 via UI (autosave works). SQL API back.
- 09:52 UTC: seeded Default variants for other 4 (Jamdani 12500/20, Earrings 1850/100,
  Kantha 6200/15, Taant 3450/30). All 5 shoppable.
- 09:55 UTC: custom-host storefront route implemented by swarm (32/32 tests, tsc clean).
- 10:05 UTC: providers page crashes with provider.read_failed — provider_credentials
  table exists NEITHER live NOR in repo. COD path independent; proceeding with COD.
- 10:10 UTC: settings Save failed with 409 x2 — merchant_settings has UNIQUE but no PK,
  client upsert lacked onConflict. Enabled COD via direct write (true) + patched
  settings.tsx with { onConflict: "merchant_id" }. No sibling upserts in routes.
