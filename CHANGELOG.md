# Changelog — Framique (frame30)

All notable changes, decisions, and policy cutovers. Mirrored as
long-term memories in mem0.ai (user `devrahmanbd`) — every entry below
has a matching memory so future sessions inherit the why, not just the what.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

> ⚠️ **WARNING — shared-server deploy collisions.** Two agents deploy to one
> server from one clone: observed interleaved origin/main, a 502 from an
> unpushed-file commit, a frankenbuild (restart landed mid-build), production
> checked out onto a stale detached HEAD (deploys silently not taking
> effect), and the cutover living only as uncommitted server edits + stash.
> Coordinate deploy windows; after every deploy verify `git rev-parse HEAD`
> AND a bundle marker before announcing; never reset shared history.

## [Unreleased] (frame30) — Extension blockers: schemas, one registry, real renderers, Level B themes

### Added — close-out (E2E journeys, CI restore, durable review store, first theme-owned widget)

- Two cold browser journeys: `.e2e/plugin-anonymous-journey.spec.ts`
  (parse → adapter → tray registry → insert → generated controls →
  validate/defaults → presentation, plus public preview render and
  hostile-inert proof; auth-gated tray-click/save/publish steps explicitly
  skipped — auth stubbing forbidden) and
  `.e2e/levelb-theme-sandbox.spec.ts` (assemble → review → publish →
  activate → pinned-URL `allow-scripts`-only frame, zero theme code on
  host, themed storefront render). Both green cold (15 pass, 3
  auth-skips, 0 fail).
- `.circleci/config.yml` restored verbatim from `1185f440^` (274 lines,
  YAML-validated, all 13 `bun run` targets + SAST flags + e2e spec refs
  audited present). Remote builds still need owner token access — no green
  claim; first post-restore build remains the verdict.
- Durable Level B review store: `dev_theme_releases` (submit idempotency)
  + `dev_theme_reviews` (approval idempotency) with RLS mirroring
  `theme_submissions`; fail-closed on store/audit faults with flag revert
  (no live-but-unaudited row); in-memory store kept as the unit-test seam.
- First native theme-owned widget: `theme:songoskriti/ornament` (heritage
  divider, existing kinds only) registered by exact id; renderer executes
  it natively under the owning theme while foreign/missing cases keep
  explicit placeholders.
- Fixed the pre-existing `extension-workflow.spec.ts` static-wiring token
  (tray now reads `buildTrayRegistry(plugins)`) and gave its cold redirect
  assertion a 90s budget.

### Verification (close-out)

- New: E2E 15 pass + 3 auth-skips cold; review-persist 9/9 (TDD red→green)
  with 357 neighbors green; ornament 20/20 with 528 neighbors green;
  `tsgo` clean; eslint clean; secret scan passed.

### Added

- Inspector resolves canonical extension nodes by `widgetKey`
  (`resolveSchemaForSection` + threaded `resolveInspectorSchema(section,
  registry?)` in `widget-presentation.ts`): `pluginKey`-first legacy order
  preserved, empty `{ fields: [] }` still means legacy-unvalidated, hostile
  shapes fall through without throwing.
- One effective registry: the builder route builds `builderRegistry` once
  from its server-authorized installs and passes the SAME instance to tray,
  canvas renderer (including nested `renderChildren`) and inspector.
  Nothing is written to the shared singleton — tenant isolation preserved.
- Real per-mode extension renderers: `official` via the trusted in-repo
  source gate, `plugin-isolated` via the sandboxed `PluginBlock` island,
  `plugin-themeable` with `themeKey` (bundle never executes when dressed).
  `theme-owned`/`owner-definition` stays an explicit recoverable placeholder
  — no approved theme-owned component source exists in-repo yet (fail-closed).
- Level B code-capable theme lane integrated: `dev-theme-widgets.ts`
  (sections → editor-resolvable `theme:{id}/{section}` defs, `renderer:
  "custom"`, editor-only), `dev-theme-activate.ts` (fingerprint-bound
  activation, least-privilege grants, pinned-URL+CSP runtime binding),
  sandbox proof (GSAP/Three bundle renders only inside the
  `allow-scripts` frame; host HTML carries zero theme code), `docs/themes/
  level-b.md` SDK contract. Data-only lane frozen and untouched; review
  store/approval snapshots still in-memory (documented follow-up).

### Verification

- New: inspector canonical 4, renderer plugin-lanes 9, tray registry 3,
  presentation-inspector 11, builder wiring 4, dev-theme widgets 9 +
  activate 15 + sandbox 5 (+6 bundle vectors); neighbors green across
  renderer/tray/presentation/registry/theme-contract/inspector/dev-theme
  batches; `tsc` 0 errors repo-wide; eslint 0 errors (pre-existing
  react-refresh warnings only); secret scan passed.
- Still missing at commit time: full-suite browser proof (the two journey
  specs below are proven cold individually; the whole `.e2e` suite has not
  run green in one pass) and CI restoration (config restored verbatim —
  remote builds still need owner token access).

## [Unreleased] (frame30) — Swarm: full checklist integration

### Added

- One authoritative widget contract + registry (items 2–3): full plugin
  widget declarations (mode/slots/data/actions/states/capabilities/theme
  floor), single `createWidgetRegistry` lineage, suspend support,
  update-invalidation, tenant-disjoint reads.
- Editor shell on the single authorized registry (item 1) with same-
  instance preview/save/publish, keyed remounts on registry switch.
- Schema inspector by owner+`widgetKey` + one saved representation across
  the full lifecycle (items 4–5): insert/drag/select/duplicate/paste/
  undo/autosave/save/migrate/theme-switch/recovery, legacy byte-identical.
- Canvas parity across all five render modes + validated instance-prop
  propagation in both trees (items 6–7); storefront binding live with
  server-revalidating `onCall`.
- Versioned theme presentations (R1–R5) with switching-safe settings
  (item 8); Level B updates/rollback/serve-time re-checks + runnable
  starter theme with genuine gsap/three (items 9–10).
- Bridge freshness/suspension/forgery gates, commerce allow-list intact,
  budgets + cleanup (item 11); install/update compat gates + audited
  rollback + no-substitution recovery (item 13).
- Proof plugin + proof theme fixtures with journey/matrix suites (items
  14–15); theme allow-list now ENFORCED in `checkThemeCompatibility`
  (scoped plugin widgets report `foreign-theme` outside their list —
  retired the tripwire, corrected one stale journey premise).
- Six harness tasks extended by the swarm coverage (item 16 partial).

### Verification

- ~500 new tests across 9 lanes; neighbors 3000+ green; `tsc` 0;
  eslint 0 errors on owned lines; secret scan passed; production E2E
  cold green; harness guards reward 1.0.
- Open: 9 auth-gated E2E steps (proven wall, no stubbing), remote CI
  tokens (owner), real-GPU proof (no GPU on server — SwiftShader stands).

## [Unreleased] (frame30) — Audit close-out: registry reaches every call site

### Fixed

- Wired the previously unwired seams the audit flagged: `SettingsPanel`
  now receives the route registry (no silent singleton); `StudioCanvas`
  receives registry + themeKey + binding; the tray derives insertable
  plugin AND uploaded-theme entries from the threaded registry when no
  explicit entries are passed (explicit entries still win); `EditorShell`
  forwards `activeThemeKey`.
- `resolveExtensionTrayEntries` was defined but never called — it is now
  the single discovery path, extended to theme-namespace defs.

### Verification

- New seam suite 8/8 (discovery incl. theme defs, call-site pins);
  neighbors 82 green; `tsc` 0; eslint 0 errors on own lines (2 prettier
  errors at StudioBuilder 765/899 are pre-existing sibling lines, left
  alone); secret scan passed.

## [Unreleased] (frame30) — Harness covers the extension program

### Added

- Six guard/e2e tasks: `editor-extension-registry`,
  `studio-schema-panel`, `studio-render-lanes`,
  `storefront-dev-theme-binding`, `extension-pipeline-matrix`,
  `levelb-production-e2e`. Harness at 18 tasks, version `0.2.0`.
- Fixed a real runner/docs mismatch found while adding tasks: the runner
  requires explicit `environment.ports` (`0` fast / `1` slow);
  `AUTHORING.md` said fast tasks omit it — corrected.

### Verification

- `run.mjs --self-test` 11/11; all six new tasks reward `1.0` in isolated
  worktrees (five fast + the slow production E2E).

## [Unreleased] (frame30) — Real editor wired end-to-end

### Added

- Real editor (`content/editor` → `EditorShell` → `StudioBuilder`) on one
  authorized tenant-aware registry (tenant plugins + active approved theme
  defs, fail-closed to plugins-only) threaded to tray, inspector, canvas,
  preview and binding; nothing touches the shared singleton.
- Schema-generated studio `SettingsPanel`: generated controls from each
  selected widget's `propsSchema` (all kinds, nested/group/repeater,
  media, `bp` layers, keyed errors, reset); legacy panel byte-identical;
  third-party widgets need no core changes (proven by fixture-only def).
- Studio canvas on the extension-aware renderer (all modes, same
  outcomes as the reference branch; twin default-echo shedding fixed).
- Storefront live binding: public projection + server-revalidating
  `onCall` for the published active theme; drafts never leak publicly.
- Pipeline proofs (insert→edit→autosave→reload→duplicate→preview→publish,
  legacy byte-identical) and a test-only security matrix (isolation,
  grants, sandboxes, kill switches, revocation, hostile props).
- Authenticated E2E: real login proven impossible in this env (dummy
  Supabase host, unported local auth, no seeds — documented wall, no
  stubbing); maximum reachable path pinned with static-chain specs +
  switch→serve round-trip; prior stale tokens fixed.

### Verification

- New: settings 21, twin-parity 4, pipeline/security/storefront suites
  144+, E2E wiring/switch specs 7; repaired render twins 86 + 1067
  neighbors; `tsc` 0; eslint 0 errors; secret scan passed.
- Skipped, not passed: 9 auth-gated E2E steps (3 anonymous + 3 registry +
  3 authenticated) — a real session is the only unblocker; CI tokens
  still owner-side.

## [Unreleased] (frame30) — Genuine Level B execution, production-proven

### Added

- Theme document builder (`dev-theme-document.ts`): `index.html` synthesis
  for approved releases only — exact `/t/...` pinned asset tags, CSP meta
  equal to the contract helper, zero inline code; unapproved/unknown →
  404. Per-ref byte re-proof at serve time (drifted row 404s the document).
- Genuine fixture theme through the REAL assemble → review → publish →
  install → activate lanes, importing the repo's own `gsap`/ScrollTrigger
  and `three` ESM sources (two genuine toolchain findings fixed: UMD
  dists don't load as ESM; `three.core.js` has no `WebGLRenderer`).
- Production E2E (`levelb-theme-execution.spec.ts`): real bundle over real
  loopback HTTP into the real `ThemeRuntime` frame — GSAP timeline end
  state + ScrollTrigger progress + real WebGL box draw asserted in-frame;
  sandbox exactly `allow-scripts`, opaque origin, contract CSP, zero theme
  code on host. No `page.route()` interception, no mocked documents. The
  old mocked sandbox spec is superseded (removed).
- Production ACAO `*` on `/t/...` 200s (opaque-origin module scripts
  require it; public-by-design bytes) and same-origin `/harness` shell
  (PNA-blocked `about:blank`+`setContent` replaced, same isolation).

### Verification

- New unit vectors 14/14; neighbors 89 green; E2E execution spec green
  cold on lane + integrator runs; adjacent specs unregressed; `tsc` 0;
  eslint clean; secret scan passed.
- Proof-limited (documented in-code): install lane runs install-equivalent
  `fakeDb` rows in the E2E worker (real-row serving pinned by
  `t.$.test.ts`); loopback re-verifies a fixed snapshot per request.

## [Unreleased] (frame30) — Instance props reach renderers; uploaded themes render in sandbox

### Added

- Validated per-instance props thread extension node → presentation →
  `PluginBlock` → `WidgetSandbox` frame (`window.framique.props`, inert
  JSON) and the Class B `instanceProps` contract, with global
  `plugin.settings` kept separate. Two instances never cross-contaminate;
  hostile props (scripts, handlers, proto-pollution, oversize, deep,
  non-JSON) neutralized at each boundary; legacy paths byte-identical
  (25 new tests).
- Level B per-widget schemas (`text`/`richtext`/`image`/`color`/
  `spacing`/`product`+repeater/`animation` on existing kinds), active-theme
  defs adapted into `builderRegistry`, `themeKey` passed to the tray, and
  the preview envelope actually consumed through the documented bridge
  (40 new tests).
- Storefront/editor renderer for uploaded theme widgets: `theme:<id>/...`
  defs with `renderer: "custom"` plus a server-projected binding (pinned
  identity AND version) render through the sandboxed `ThemeWidgetPreview`;
  unbound/skewed/foreign stays placeholder. Registry contract gains inert
  `themeId`/`themeComponent` name tokens (malformed dropped at
  registration); shared code still never branches on theme names
  (theme-independence pin green).

### Verification

- New: instance-props 25/25, theme-sandbox 7/7; lane neighbors 357 + 797
  green; `tsc` 0; eslint 0 errors; secret scan passed.
- Still open: server projection of the approved manifest onto the workspace
  (route has no binding yet — branch stays fail-closed) and the real-bundle
  production E2E.

## [Unreleased] (frame30) — Per-widget plugin props schemas

### Added

- Optional `propsSchema` (value-layer `PropField` verbatim — same closed
  22-kind set, never extended in the manifest) + `defaultProps` on
  `PluginWidgetDef`. Absent keys keep the legacy path byte-identical
  (`defaults: {}` + `propsSchema: { fields: [] }`, no migration).
  Gate (`parseManifest`) rejects the whole manifest on a bad per-widget
  schema; the adapter (`fromPluginManifest`) skips only that widget while
  siblings still adapt. `defaultProps` without a schema carries nothing.
- Serializability fix: schema-carried `default`/`showWhen.equals` are now
  `JsonValue` (not `unknown`), and the registry's duplicate
  `PropField`/`PropSchema`/`PROP_KINDS` are aliases of the value-layer
  single source — an `unknown` in the schema type collapsed TanStack
  loader inference tree-wide (214 errors from 4 added lines). Fail-closed
  JSON clones on both gates (unserializable `showWhen.equals` rejects;
  unserializable `default` drops the default, keeps the field).

### Verification

- New `plugin-widget-schema.test.ts` 18/18 (gate, adapter granularity,
  reviews-carousel fixture end-to-end through `validateProps`/
  `defaultsFor`); neighbors green (manifest/registry/props/tray/approval
  + bundle/emit/locale/install/conflicts/bridge/presentation/theme-contract
  batches); `tsc` 0 errors repo-wide; eslint clean on touched files;
  secret scan passed.

## [Unreleased] (frame30) — Fault acceptance and disaster recovery

> 2026-10-14: CircleCI config removed temporarily (`1185f440`) — both
> provided API tokens lack access to the project (it lives under a different
> identity). Restore with `git revert 1185f440` after Oct 21; treat the first
> post-restore build as the verdict on the last run's unit-contract/scan-1/e2e
> failures, which were unreproducible locally.

System-wide resilience program (three read-only audits → 7 build lanes).
Nothing here deploys itself: all verified on `frame30` locally unless noted.

### Added — deploy recovery (`ops/deploy-from-git.sh`, `DEPLOY.md`)

- Retained rollback snapshots: live `.output/` snapshotted (keeps newest 2)
  before rsync; verify-fail or restart-fail rsyncs back + restarts +
  re-polls readiness, always exiting nonzero with `ROLLBACK RESTORED` /
  `ROLLBACK UNRESTORED`.
- Health-gated restart: bounded readiness poll replaces blind `sleep 8`.
- Lock expiry/steal: lock records owner+pid+epoch; fresh+alive refuses,
  stale steals with audit line; explicit `--steal`.
- Bundle-marker assertion before lock release + printed post-deploy lines
  (`git rev-parse HEAD` + live marker), per the shared-server warning above.
- Proven with 49/49 sandboxed failure-mode simulations (stubbed
  systemctl/curl/real rsync).

### Added — server fault containment

- Gateway webhooks: DB fault on account lookup returns 503 (keeps provider
  retries alive) instead of 401; dead-letter write failures get their own
  metric (8 regression tests, incl. route-level canary fail-closed).
- `/api/canary-alert` fails closed (404) with no secret; constant-time
  compare; alertname allowlist before breaker trips.
- Boot policy: `assertBootEnv()` (Supabase URL/keys required, Redis/Resend
  warn-only) + `unhandledRejection`/`uncaughtException` controlled shutdown.
- `withDbTimeout()` bounds money-path DB waits (fail-closed 503-style);
  `AbortSignal.timeout` on outbound fetches; healthz probe-race loser
  aborted + Redis-absent reads `skipped`; courier work abortable with
  one-sample-per-call breakers; order emails bounded (2s cap, metric on
  timeout); metrics/error-alert rate-limited with constant-time secrets.

### Added — commerce recovery

- bKash capture receipts recorded durably before settlement + exported
  (unwired) stuck-capture sweep; `refundOrder`/`refundOrderLines` route
  through `advanceRefund` ledger debits (transition blocked on ledger
  failure); hold-aware cancel (no double-restore); atomic conditional
  reserve UPDATE (safe with or without Redis) + `sweepStockHolds`
  throw-on-RPC-error for cron alerting.
- Settlement watchdog (heals paid-row/unpaid-order via idempotent replay),
  `postSettlement` poison-item quarantine (`variance_hold`), full-length
  provider references, `payInvoice` payment evidence, courier DLQ-depth
  alert + null-AWB auto-retry on the couriers cron.
- `fraud-shield` 4th official plugin (free, source-backed, read-only
  permissions, allow/review-only scorer); post-order fake-order guard
  (velocity/COD/value/address signals → fraud scores → existing rules,
  commerce continuity beats detection — evaluation can never fail an order);
  per-tenant Meta pixel snippet + noscript fallback; COD Purchase
  conversion via idempotent CAPI queue.

### Added — storefront resilience

- Shared `StorefrontError` boundary (localized + loader-invalidating retry)
  on every `store.$slug.*` route + root; infrastructure-vs-not-found loader
  mapping; localized `notFoundComponent` on all store routes (checkout,
  search, pages, account, track were bare defaults); checkout pending-order
  rescue via sessionStorage + order-page key retirement; order thumbnails
  via the `StoreImage` degrade path. E2E 26/26 cold (incl. 3 resilience
  specs proving retry boundaries + rescue).

### Added — ops hygiene

- `rehearse.sh` asserts manifest counts, non-empty money tables, and
  orders→payments→ledger joins (zero-row restores now fail); nightly
  `--skip-rehearse` removed with measured evidence; docker `log-opts` caps
  on 24 services; logrotate config; `certified-age-gate.sh` +
  `BackupCertifiedStale` paging (fails until live encryption + off-site
  exist — intended).

### Verification (this program)

- Unit: lane suites green (money 26+19, server 8+4, storefront 47+10,
  pixel 43, fraud 28+17); neighbors 1300+ assertions green; `tsc`,
  eslint (own lines), secret scan, SAST diff+full green; `vite build`
  green; full E2E 26/26 cold.
- Live (production, read-only): homepage 200 with zero console errors
  attributable to this work; pre-existing live asset 500 noted below.

### Known gaps / not done

- Payment-freeze TOCTOU needs a live-DB routine change (`charge_intent_open`
  bodies are not in-repo) — reported, not fixed.
- `refundOrderLines` edge cases + `voidHalfWrittenOrder` per-line crash
  window: reported, loop untouched by design scope.
- Online-rail (non-COD) Purchase wiring deferred to settlement paths.
- Backup encryption + off-site remotes unverified from here (gate pages
  until configured); bare-metal restore unproven end-to-end.
- Single-box topology retained (documented accepted risk; RPO/RTO targets
  still owner decisions); blue/green compose remains unwired to the live
  path (docs labeled accordingly by audit).
- Pre-existing failures left alone: tree-wide prettier drift (338 files),
  one env-dependent `site.server` test, Supabase-dependent schema checks.

### Live observation (2026-10-13, pre-existing, not caused by this work)

- `GET https://framique.qubickle.com/assets/styles-D20lWL3s.css` → **500**
  while `/` → 200: the live homepage's hashed stylesheet fails, so the
  production homepage renders unstyled/degraded. Nothing in this program
  deployed (no production changes made); the new rollback + bundle-marker
  machinery exists precisely so the next deploy either lands verified or
  restores last-good automatically.

## [Unreleased] (frame30) — Official source themes without ZIP distribution

### Removed

- Official-only ZIP/export machinery: `theme-export.ts`, `official-artifacts.ts`, `official-artifacts-seed.server.ts`, `official-artifact-bundle.{ts,json}`, `scripts/build-official-artifact-bundle.ts` and their tests. `vite build` no longer generates a bundle first. Supersedes the c65ed3f6 "ZIP path unchanged" state: there is no official ZIP path anymore.

### Changed

- Official Songoskriti/Somvabona install, catalogue, anonymous/merchant preview, update-check and trial-claim seeding resolve from the built-in source registry (`builtin-themes.ts`) and initialize tenant rows directly — no `buildExportZip()`, no `installPackage()` on official paths (pinned by a suite that blocks the pipeline module and still installs).
- `docs/packages/contract.md` §0/§3.3 corrected to the two-model boundary; `developers/themes.md` + `developers/plugins.md` describe official-source vs custom-ZIP.

### Preserved

- Custom merchant ZIP pipeline untouched: `package-zip.ts`, `package-install.server.ts`, `package-store.server.ts`, `plugin-package.ts`, upload lane (now also rejects dangling `assets/` refs), all archive-security suites green.

## [Unreleased] (frame30) — Socket-level DNS pinning for server egress

### Fixed

- DNS-rebinding TOCTOU between resolve and connect is eliminated, not merely narrowed: `fetchWithEgressGuard` now opens sockets through `pinnedTransport` (`node:http(s)` with a custom `lookup` bound to the validated answer set), so a mid-flight DNS flip cannot steer request bytes. Double-resolution dance and post-connect re-verification removed as redundant — each hop resolves once, binds, and per-hop redirect revalidation is unchanged. TLS SNI/cert verification explicitly targets the original hostname; `rejectUnauthorized` untouched.
- Hook emitters (`captureCart`, `reserveStock`, `createOrder`, `applyImport`, `saveKindConfig`) and `runHook`/`deliverQueuedHook` accept an optional trailing `transport` (plus file-level `node:dns` mocks in suites) so hook tests are hermetic — parallel-load DNS stalls no longer trip the 800 ms chain deadline spuriously.

### Verification

- New pinning tests (socket lands on pinned IP despite hostile DNS, injected-transport isolation); migrated hook suites to transport injection; egress + hook + emission + breaker suites green twice consecutively, `tsc` clean.

## [2026-10-10 16:07 UTC] (v0.5-beta — c65ed3f6) — Bundle URL form fix

### Fixed

- Deploy bundle stores servable source-form image URLs (was package-form, 404ing in browsers); ZIP path unchanged. exportOfficialTheme gains urlForm option; source-leak gate honors it.

### Verification

- 257 tests green, tsc clean.

## [2026-10-10 01:44 UTC] (v0.5-beta — c3811e9d) — Hallmark songoskriti voice pass

### Changed

- Section voices (editorial statements vs quiet utility heads), rail card-variant rhythm, promise single-sourced to trust zone, advMotion on 3 sections, 3-step type scale, quiet eyebrow, roman-only, bn-safe leadings.

### Verification

- Theme suites green, tsc clean, snapshots regenerated (class strings only).

## [2026-10-07 21:14 UTC] (v0.5-beta — c40528f9) — Footer snapshot refresh

### Changed

- Snapshot/debrand suites re-pinned to the slim footer; snapshots regenerated.

### Verification

- Full theme gate green, tsc clean.

## [2026-10-07 20:50 UTC] (v0.5-beta — f09963b6) — Official artifact bundle + source fallback removal

### Added

- Deploy-built official artifact bundle (checksummed, version-pinned) serving anonymous preview + catalogue; source fallback removed (fail-closed); official ZIP install parity proven.

### Verification

- Bundle/proof/parity suites green, tsc clean.

## [2026-10-07 19:39 UTC] (v0.5-beta — dccb9463) — 48h sweep: PDP gallery fallback

### Fixed

- PDP gallery hides broken images to the tinted aspect box (rails already had MediaFrame fallback). No new missing-image bugs from recent lanes; hex/uppercase gates green.

### Verification

- 186 tests green, tsc clean.

## [2026-10-07 19:30 UTC] (v0.5-beta — 046cadfb) — Footer legal bar restructure

### Changed

- ZONE 4 is now brand | payments | legal grid (stacked centered on mobile); small text raised to 70pct ink; legal links have 44px targets, nav landmark, hover underline.

### Verification

- 372 tests green, tsc clean.

## [2026-10-07 18:57 UTC] (v0.5-beta — 5fef1e07) — Footer single newsletter, dedup payments

### Fixed

- Newsletter form back as exactly one in-sitemap zone (was duplicated, then removed entirely); standalone payment_icons section dropped (sitemap payment zone already covers it).

### Verification

- 140 theme tests green, tsc clean.

## [2026-10-07 17:27 UTC] (v0.5-beta — 0f9aedf8) — Slim songoskriti footer

### Removed

- Footer statement + image, newsletter section, story link. Footer is link columns + payments + colophon only.

### Verification

- 584 theme tests green, tsc clean.

## [2026-10-07 16:08 UTC] (v0.5-beta — cb3827e7) — Anonymous preview regression fix

### Fixed

- Anonymous visitors (no merchant context) resolve built-in previews via the legacy source floor again; only authenticated merchants with an installed set get fail-closed behavior.

### Verification

- Preview suites green (43), tsc clean.

## [2026-10-07 14:34 UTC] (v0.5-beta — 230f03f2) — Zero-gap sweep

### Fixed

- scope-adapter red resolved (menus.read/write vocabulary + honest mapping); footer draft verified gone (backup retained); KB backfill 114 live vectors (204 await quota reset).

### Verification

- Full suite 5754/5756 → scope lane green; tsc clean.

### Known gaps

- OpenRouter quota exhausted again (429, 0 remaining) — 204 fallback rows await next reset; $10 credits recommended (shared with revision cron). Key rotation still pending (key verified working).

## [2026-10-07 09:36 UTC] (v0.5-beta — aee6e442) — Consent binding, idempotency parity, onCall contract

### Fixed

- Widening updates require fresh covering grant (stored-grant diff, timestamped record); direct pipeline idempotency bound to key/kind/slug; host delegates pinned data-free.

### Verification

- Consent/idempotency/onCall suites green, tsc clean.

## [2026-10-07 05:36 UTC] (v0.5-beta — 24d1120e) — Package hardening round

### Fixed

- Asset serving route with tenant/traversal/CSP guards; theme upload unified onto pipeline (archive templates installed); lifecycle fixtures strict.

### Verification

- Spot suites green, tsc clean.

## [2026-10-07 01:04 UTC] (v0.5-beta — 013bdb0c) — Package completion rivalry

### Added

- Official plugin catalogue via normal pipeline; source fallback removed (installed authoritative, fail-closed); plugin rollback equivalence + atomicity proof; conflict detection + dependency ranges; lifecycle contract proof; canonical package docs; upload wiring (theme) + plugin upload fn/surface.

### Verification

- Lane suites green across all batches, tsc clean.

## [2026-10-07 00:04 UTC] (v0.5-beta — d0f57cc3) — Songoskriti ported to package model

### Added

- Trial-claim seeds songoskriti 1.0.0 via normal installer (best-effort, never blocks); live proof: installed artifact serves index/product identical to source render.

### Verification

- 18 spot green, tsc clean. Assets stay namespaced (`themes/<versionId>/assets/`, `?v=` URLs) — nothing copied to global public/.

## [2026-10-06 23:55 UTC] (v0.5-beta — a31d8121) — Official seed via normal installer

### Fixed

- Official seeder routes through installPackage (one installer for official + uploads); seed tests assert pipeline semantics (install never publishes).

### Verification

- 186 package tests green, tsc clean.

## [2026-10-06 21:36 UTC] (v0.5-beta — 313be8b9) — Gallery + publish artifact payload

### Added

- Theme gallery lists installed keys alongside source keys; publishVersion consumes installed artifacts with source fallback. Joint lane (shared tree, verified together).

### Verification

- 69 spot green, tsc clean.

## [2026-10-06 20:16 UTC] (v0.5-beta — 74b22584) — Switchover to installed artifacts

### Changed

- Strict manifest validators are the pipeline default; marketplace distributes exact-ZIP artifacts; builder discovers installed packages; preview resolves installed artifacts; packages.md gates honestly split (enforced/elsewhere/aspirational).

### Verification

- Spot suites green, tsc clean, prettier clean.

### Follow-ups

- DB migration for artifact columns; asset GC for marketplace installs; gallery listing of installed keys; live publishVersion in-chain.

## [2026-10-06 19:26 UTC] (v0.5-beta — 654b9d7c) — Package pipeline gaps closed

### Fixed

- Version-row tokens passthrough (official tokens reach theme_versions); 32MB archive cap (Songoskriti installs under defaults); parity tests assert fixed behavior.
- Committed the full package program (manifest validators, exporters, acceptance suites) that was green-but-uncommitted.

### Verification

- 189 package tests green, tsc clean.

## [2026-10-06 17:32 UTC] (v0.5-beta — 0300b017) — Docs follow-up completion

### Changed

- app-blocks per-bullet planned qualifiers; blueprint files verified bannered-historical (bodies untouched); internal guides re-pinned (~70 pins, headers bumped).

### Verification

- Prettier clean; pin spot-checks pass. Blueprint 117-widget count left stale by design (banner covers it).

## [2026-10-06 02:22 UTC] (v0.5-beta — 0218c4d6) — Final docs synchronization

### Changed

- Internal docs synced to final architecture (registry model, chrome surfaces, no-branches rule); superseded docs explicitly bannered; 10-guide public developer path built; sdk/packages/plugins pins corrected to HEAD; footer pins repointed to canonical proof modules.

### Verification

- 329 pins verified (135 + 55 + 139 + spot fixes); prettier clean; examples compile against source.

### Known gaps

- app-blocks planned-markers need per-bullet qualifiers; theme-plan blueprints out of scope; internal/superpowers digit drift untouched.

## [2026-10-06 02:20 UTC] (v0.5-beta — 8b8b015a) — Final verification sweep

### Fixed

- DoD PluginBlock exemption (opaque themeKey forward documented + asserted); localization compact-state test updated to theme-owned announcement heights.

### Verification

- Full suite 5403/5405 (scope-adapter sibling-owned; see below), tsc repo-wide clean.

### Known gaps

- scope-adapter.test.ts red — sibling session's uncommitted work, not ours.

## [2026-10-05 23:19 UTC] (v0.5-beta — 711b03cb) — Presentation runtime finish

### Added

- Header shells delegate via registry (songoskriti mega/accordion vs somvabona dropdown/disclosure); announcement theme presentations with hook-owned behavior; footer canonical path; plugin menu replacement end to end (cross-slot fix, fail-open boundary); repeater round-trip suite (20 widgets); two-theme acceptance (12 tests, all surfaces).

### Verification

- Acceptance green with zero implementation edits; tsc repo-wide clean.

### Follow-ups

- menu_dropdown presentation replacement (by design, engine rows only); mixed-template dual drivers; drawer-failure SSR limit; R5 repeater tsc cast owned and fixed here.

## [2026-10-05 20:15 UTC] (v0.5-beta — d3bc2aa5) — Presentation runtime v2

### Added

- Theme-owned header nav markup per theme (structurally distinct, shared keeps data+behavior); Class A/B community widget contract (plugin declares, theme dresses, island fallback, sandbox untouched); menu renderer replacement end to end (fail-open to theme default); announcement + footer per-theme proof tests.

### Verification

- Spot suites green (143 incl. new proofs), tsc clean except sibling-owned footer-presentation.tsx error (parked, not ours).

### Follow-ups

- Prod registration wiring for proof modules; footer module winner (proof vs sibling draft); CollectionView archetypes edge; TokenEditor variation map move.

## [2026-10-05 18:41 UTC] (v0.5-beta — 390aa330) — True independence residuals

### Added

- Prod registration wiring (theme preview entries re-export header presentations); header-fallback consolidated to neutral `header-copy.ts` re-export shim; CollectionView on the neutral path; TokenEditor variation map moved to the studio host (`variations[]` prop, themeKey preview-link-only).

### Verification

- Spot suites green (DoD 11, variations 37, CollectionView incl. new pins), tsc clean.

### Follow-ups

- Residual shared→theme edge: `CollectionView.tsx` archetypes import (archetype lane's property); `header-fallback.ts` shim removable once importers migrate.

## [2026-10-05 18:32 UTC] (v0.5-beta — 6f6f2ea2) — Theme presentation registry + header de-theming + DoD green

### Added

- Per-widget theme presentation registry (`theme-presentations.ts`, first-wins, never throws) composed over component resolution; header de-themed (neutral `header-copy.ts`, both themes registered, canonical modes wired); docs reframed (tokens/skins one layer); DoD 11/11 via documented TokenEditor exemption.

### Verification

- Spot suites green, tsc clean.

### Follow-ups

- Prod registration wiring, header-fallback consolidation, CollectionView archetypes edge, TokenEditor variation map move.

## [2026-10-05 17:33 UTC] (v0.5-beta — a85d2f2b) — Gate repairs

### Fixed

- OpenAPI spec covers the renewal cron route (18/18); `global_ref` graduated to the palette now its twin exists (157 entries); stale graduation comments updated.

### Verification

- 642 spot green, tsc clean. Remaining reds (`definition-of-done` theme identity, `scope-adapter`) are pre-existing/sibling-owned, proven by stashed-tree runs.

## [2026-10-05 13:57 UTC] (v0.5-beta — c219cab8) — Lane 4 menu+capability+contracts

### Added

- Canonical menu type (bitext, children, badge, promo) + dropdown/drawer modes (additive, unwired); builder capability API (`capabilitiesFor`); presentation-primitives doc; 32 contract tests (lifecycle, themes, chrome).

### Verification

- 550 spot green, tsc clean. Follow-ups: dashboard menu columns need migration; mode plumbing; live publishVersion in-chain.

## [2026-10-05 13:48 UTC] (v0.5-beta — 0ca8b815) — Lane 3 chrome splits

### Added

- Header 3-layer split (identical output); standalone announcement surface (dismiss persisted, bn, reduced-motion); footer split + global-block control; 24 structural localization tests.

### Verification

- 103 spot green, tsc clean.

## [2026-10-05 13:39 UTC] (v0.5-beta — 00b58b8c) — Lane 2 recovery+acceptance

### Added

- Last-good auto-serve (prior pin else $fallback, audited); DemoProductWidget two-theme proof (via product_rail); 7-link chained plugin acceptance.

### Verification

- Spot suites green, tsc clean.

## [2026-10-05 13:29 UTC] (v0.5-beta — 5aa546f3) — Lane 1 tokens+proof+tiers

### Added

- StoreHeader tokenized (31 swaps, parity pinned); hero 5-item repeater proof; core/community tier vocabulary.

### Verification

- 87 spot green, tsc clean.

## [2026-10-03 16:20 UTC] (v0.5-beta — 5b14a892) — Phase 5 trust docs

### Added

- `review-policy.md` (no-plugin-territory rule with 5 locked rejection reasons + review process with semver resubmission and appeal path); `theme-updates.md` (versioning + rollback promise + override story).

### Verification

- 73/73 pins resolve; prettier clean. Open TBDs marked in-doc (reviewer SLA, appeal queue, rollback retention, Restore click-path).

## [2026-10-03 16:16 UTC] (v0.5-beta — d95316b6) — Phase 4 picker bindings

### Added

- Picked-rows bindings (menu/product/article/page/search) with `parsePickedHandles` normaliser; renderers prefer picks, degrade to empty states.

### Verification

- 4465 lib tests green (2 pre-existing reds proven via stashed-tree check), tsc clean.

## [2026-10-03 15:57 UTC] (v0.5-beta — 827065a2) — Phase 3 motion ceiling

### Added

- `count-up` + `scroll-scrub` JS executors (lazy, IO-gated, reduced-motion static); per-theme motion budgets blocking in publish gate; slide/zoom reveal vocab mapping.

### Verification

- 254 tests green, `tsgo` clean.

## [2026-10-03 15:50 UTC] (v0.5-beta — 6f47a9ef) — Phase 2b Globals

### Added

- `global_ref` studio twin + renderer branch; merchant Globals editor bound to `var(--fq-g-*)`.

### Verification

- 591 tests green, tsc clean.

## [2026-10-03 15:37 UTC] (v0.5-beta — a58fcb48) — Phase 2a templates+zones

### Added

- Template suffix + fallback chain; named zones as data; `global_ref` section type; widget prop hints for lane fields.

### Verification

- 29 new + 873 adjacent tests green, tsc clean.

## [2026-10-03 15:11 UTC] (v0.5-beta — 149dec58) — Phase 1 trust gates

### Added

- Blocking a11y gates + reduced-motion gate wiring; Theme Security page + `advCss`/html lint (caught real sanitizer residuals); 10 responsive flags (17→27 catalog); openspec/ extracted from the oceanblue branch (scratch left behind).

### Verification

- Phase suites green, `tsgo`/`tsc` clean.

### Corrections

- No dep-deny module or SRI rule exist; gsap is the required single engine (policy sentence only). Responsive rail-limit mirrors added post-lane.

## [2026-10-03 12:29 UTC] (v0.5-beta — d3fc715d) — Variation server persistence + live render + picker

### Added

- `parseUntrusted` preserves well-formed variation keys; workspace round-trips through autosave/commit/publish; `setVariation` picker seam; live published-version resolution (requested > persisted > base); builder theme-panel picker with `?variation=` preview links.

### Verification

- 305 wide + 67 spot tests green, `tsgo` clean.

## [2026-10-03 10:06 UTC] (v0.5-beta — f809f70d) — Variations system + preview + starters

### Added

- `ThemeVariation` registry (tokens + skin defaults only), base < variation < authored precedence, `?variation=` preview, per-store persistence helpers, 2 starters per theme.

### Known gaps

- Server persistence wiring and onboarding picker landed separately (`d3fc715d`); live storefronts rendered base until then.

## [2026-10-03 09:56 UTC] (v0.5-beta — 7e2cc57a) — Menu replacement API

### Added

- `menu_bar` / `menu_dropdown` / `menu_drawer` plugin slots (rows in, markup out), full renderer swap behind review with fail-open fallback, menu permission scope.

### Verification

- 128 tests green, tsc clean.

## [2026-10-03 09:43 UTC] (v0.5-beta — ce127903) — PDP variant pipeline fix

### Fixed

- Picker publishes on the variant channel; buy box consumes with default fallback; cart lines stamped with variant + options string (dashboard `variant_name` reads correctly); sold-out selection blocked bilingually. Root cause: themed buy box had no submit wiring and the picker never published.

### Verification

- 163 tests green, tsc clean.

## [2026-10-03 08:31 UTC] (v0.5-beta — 1c0f3d61) — Creation.md prettier

### Fixed

- Prettier clean.

## [2026-10-03 08:31 UTC] (v0.5-beta — eda123bf) — Creation.md pin pass

### Fixed

- PropValue / FieldKind / CatalogEntry / layout pins corrected to HEAD lines; prettier clean.

## [2026-10-03 08:15 UTC] (v0.5-beta — a54b0b09) — Revert currency switcher

### Removed

- `CurrencySwitcher.tsx`, its test, and the ThemeChrome mount. BD-only platform decision; fx snapshot stack stays dormant underneath.

### Verification

- ThemeChrome + StoreHeader suites green, tsc clean.

## [2026-10-03 06:41 UTC] (v0.5-beta — b0b2369f) — Follow-ups round

### Added

- Trial-claim KB seeding + `convertTrialToPaid` with `renews_at`; `rail_behavior_scores` RPC with inline fallback; 33 semantic pin fixes; listing term prices; display-only currency switcher (later reverted in `a54b0b09`); zod validators threaded; renewal cron wired (18 jobs).

### Changed

- Live DB: 6 migrations applied; 96 KB docs seeded (16 × 6 merchants).

### Known gaps

- OpenRouter free-tier quota exhausted at seed time (61 live vectors, 257 fallback); backfill rerun pending quota. Pre-existing trials: zero rows, no backfill needed.

## [2026-10-03 03:05 UTC] (v0.5-beta — d219a70b) — Lanes F–I

### Added

- Docs re-pin + motion-semantics page + retirement note; install billing + renewal cron; behavior-ranked `recommended`; voice mic + suggestion ranking.

## [2026-10-02 22:10 UTC] (v0.5-beta — 1bb2cef6) — Motion manifest

### Added

- Closed `MOTION_EFFECTS` vocab, SectionRenderer `fq-fx` hook, CSS executors with reduced-motion + `motion:none` collapse, resolver + persist + engine tests.

## [2026-10-02 22:07 UTC] (v0.5-beta — ab416bcf) — Lane D themes

### Added

- Recently-viewed rails + mobile `bp` references on both homepages (21/12 pins); per-theme blog skins; Somvabona dark reference set; rail `limit`/`collection` fields (themed limits were silently dropping).

## [2026-10-02 22:01 UTC] (v0.5-beta — 8e846c50) — Lane C studio

### Added

- Skin selects on 5 skinnable widgets; new-field controls (promo, countdown, aspect, voice); responsive column flags; twin skin defaults.

## [2026-10-02 21:53 UTC] (v0.5-beta — 3fb7c609) — Lane A catalog+parse core, Lane B promo/countdown/tile renderers

### Added

- Lane A catalog+parse core; lane B promo/countdown/tile renderers; menu promo panels; urgency countdown (shared `Countdown` primitive); image-first tiles.

## [2026-10-02 21:38 UTC] (v0.5-beta — 664a8064) — Builder ADV persist passthrough + promo/countdown/tile fields

### Added

- `adv*` persist through parse (round-trip tested); mega promo fields; urgency `endsAt`; tile aspect variant; `emptyText` BN twins; voice flag.

- Page builder is the content editor URL (`/dashboard/content/editor`):
  full-window Elementor-style takeover (Elements/SEO tabs, flush canvas,
  compact title, sidebar starts closed, single device switcher).
- `/dashboard/builder` stays the theme studio; page/theme engines merge by
  porting, retirement of `/builder` only after editor testing.
- Path storefronts removed: `/store/*` on platform hosts answers bare 404
  (custom-domain-only cutover); custom hosts serve at `/` via internal
  rewrite. Draft previews, token-gated order flows and loopback dev exempt.
- Dashboard "View store" resolves to the merchant's primary custom domain
  when one exists (`currentMerchantPrimaryHostFn`).

### Changed

### Security

- Theme preview is system-domain-only: `/theme-preview/*` on merchant/custom
  hosts now answers bare 404 (edge gate in `server.ts` + route-loader gate
  for client-side SPA navigation). Previously the route SSR'd publicly on
  mapped merchant hosts (proven live: identical 200/160243B on
  flamelancer.com and framique.qubickle.com). Builder `?preview_theme_id=`
  and signed split previews unaffected. Pinned by `theme-preview-gate` unit
  - contract tests (17 tests).

### Changed

- **CI moved GitHub Actions → CircleCI** (`.circleci/config.yml` owns
  build/test/lint/e2e; no new Actions workflows). Recorded in AGENTS.md.
- **Deploy convention**: separate worktrees (`/opt/frame28` main,
  `/opt/frame28-heritage` branch), deploys only via
  `ops/deploy-from-git.sh <branch>` (pushed branch → ephemeral worktree
  build → rsync `.output` → restart → live verify). Never build in the
  live tree, never `git stash` a shared clone.

### Fixed

- **Theme-independence violation (our mistake, indexed so it never repeats):**
  Songoskriti's renderers overrode generic widget keys globally
  (`SONGOSKRITI_WIDGETS` spread after `CHROME_WIDGETS` in
  `WIDGET_COMPONENTS`), and `SongoskritiFooterSitemap` rendered hardcoded
  Songoskriti brand content (`STATEMENT`, `© 2026 Songoskriti`) on every
  theme's sections — Somvabona's live page showed Songoskriti's footer.
  Rule cut in `docs/themes/creation.md` §13 (the Elementor rule): one
  renderer per key, brand copy in builders/props only, no cross-theme
  imports, own demo catalog per theme. Tracked for remediation; guard tests
  - lint layer to enforce.

### Verification (live, https://framique.qubickle.com)

- `/store/<slug>` (+ deep paths, fake slugs, case variants) → 404.
- `/` → 200 landing; `microscrop.shop/` + `/cart` → 200 storefront.
- Preview Cart tab: 0 skeletons, priced demo products with images.
- Login as merchant: dashboard renders, no page errors.
- Targeted suites green (cutover 8, placeholder 5, preview-data 3,
  heritage 7, registry 8, metadata 9, builder 167).

### Known gaps / follow-ups

- Full `bun run test`: 3392 pass / 27 fail — remaining failures are
  pre-existing (authz, nav, CSP, support-agent, time-machine…), untouched
  by this batch.
- `microscrop.shop` serves the Flame Fashion BD **beauty draft**; the
  Aarong look needs clothing-heritage published on that merchant (or a
  custom domain on Akira, which already has it active).
- `microscrop.shop` domain row is now `active` + primary — View-store anchor
  resolves to the custom domain; `useStoreUrl` covers dashboard surfaces.
- Custom-host `/sitemap.xml`/`robots.txt` still open; analytics beacon now
  degrades to 202 on missing warehouse schema (owner migration pending);
  hydration nonce mismatch fixed (empty-coerce + csp-nonce meta read).

## [2026-09-22 20:07 UTC] (v0.5-beta — ffead66b) — Plugin Phase 2 runtime + contracts CLOSED (R2-0…R2-8)

- Scope: `docs/superpowers/specs/2026-09-22-plugin-phase2-runtime-design.md`
  R2-0…R2-8 + plan `docs/superpowers/plans/2026-09-22-plugin-phase2-runtime.md`
  Tasks 1–10. TDD per task, deny/replay/audit on every `[A]` mutation, push
  to main per task, mem0 per shipped task (quota-exhausted at close — see below).
- Shipped (`git log --oneline`, oldest first): `31b278a` plan, `502a1b7`
  T1 scope adapter (+ unrelated domain/UI changes in the same commit),
  `d83fe10` T2 bundle gate, `91d96bc` T3 consent, `8f08dfc` T4 phase2l,
  `cac6914` T4-fix phase2m, `cbaba01` T5 hook hardening, `e86bc75` T6
  emissions, `22cb2c4` T7 sidecar, `38bdf65` T8 suspend, `1c52f2f` T9
  purge, `0936262` T9-fix status guard. Task 10: acceptance matrix +
  `x-framique-delivery` + this entry.
- R2-0 scope adapter (`src/lib/scope-adapter.ts`): 8 snake widget scopes ⇔
  14 dotted API scopes, fail-closed on unknown; `HOOK_SCOPE` gate map for
  the 4 hooks (T1 `502a1b7`).
- R2-7 bundle gate: `validateBundle` on `upsertPlugin` +
  `installListing`, `plugin.bundle_rejected` / `market_bundle_rejected`
  with zero rows written (T2 `d83fe10`).
- R2-1 consent evidence: granted subset stored (superset/unknown refused
  `plugin_consent_required`), `plugin_state.consented_by` /
  `manifest_version` (phase2l), `marketplace_installs.granted_scopes` /
  `consented_by` (phase2m `cac6914`), `plugin.scopes_granted` audit
  (T3 `91d96bc`).
- R2-3 hook hardening (`src/lib/plugin-hooks.server.ts`, T5 `cbaba01`):
  `HOOK_SCOPE` deny (`skipped:scope`, zero fetch), HMAC
  `framique-signature t=,v1=` on every callback, `plugins` queue fallback
  (`plugin.hook.deliver`, idempotency `hook:<plugin>:<hook>:<hash>`),
  extended outcome taxonomy. R2-8 addition (Task 10): stable vendor
  dedupe identity — `deliveryId` = idempotency key in the queued payload
  - `x-framique-delivery` header on live AND retry POSTs (at-least-once
    transport; the header is the dedupe key, not a mutex).
- R2-4 emissions (T6 `e86bc75`): `cart.calculate` (captureCart),
  `checkout.validate` advisory (reserveStock), `order.created`
  (createOrder), `product.saved` (applyImport + saveKindConfig). `await`
  inside try/catch — bounded 800ms × parallel subscribers, never throws
  into the commit.
- R2-2 sidecar (`src/lib/plugin-sidecar.server.ts`, T7 `22cb2c4`):
  in-process supervised runner, one logical worker per ACTIVE install,
  heartbeat, stop-on-suspend/uninstall; `plugins.supervise` handler
  registered. OS `child_process` sandbox deliberately deferred (below).
- R2-5 suspend machine (T8 `38bdf65`): one gate (`suspended` folds into
  `enabled`), idempotent suspend, kill-switch auto-suspend, resume drains
  queued rows naturally. R2-6 purge machine (T9 `1c52f2f` + guard
  `0936262`): widget uninstall → `uninstalling` + queued `plugin.purge`
  → terminal `purged`; handler idempotent, audit-once, status-allowlisted.
  Migrations: phase2l suspend/consent columns, phase2m install consent
  columns, phase2n `uninstalling` enum value.
- R2-8 acceptance matrix (Task 10, `src/lib/plugin-acceptance.test.ts`,
  19 tests): 4-hook × full/missing scope matrix; signed-egress-always +
  verify rejects missing/stale; deliveryId replay suite; cross-merchant
  deny (suspend/resume → `plugin_not_installed`, purge → no-op);
  five-action audit flow (exactly one row each); transition table.
  Steps 1/8/9 covered by their own suites (adapter 3, purge 6, emission
  15+). Task 10 also fixed the stale Phase-1 `marketplace-bulk` delete
  expectation (`removed` → two-phase `uninstalling` → `purged`).
- Gates at close: `test:contracts` 258/258 OK; phase suites 100/100
  (acceptance 19 + 11 phase files 81); `bun run test` 4031 pass /
  45 fail — all 45 pre-existing in non-plugin files (themes, builder,
  a11y, CSP, deepwiki, smtp…; migration-linter flags
  `20260919090000_careful_additive_a.sql`, Sept-19, untouched by this
  phase). `bun run typecheck` infra-blocked locally (`tsgo: command not
found`); via `bunx tsgo`: 218 errors, all pre-existing, ZERO in phase
  files. `bun run schema:check` env-blocked (`rpc failed (400)`, no live
  DB here) — phase2l/m/n still need live apply as `supabase_admin`
  - live drift proof. Lint: touched files clean except 7 pre-existing
    `no-explicit-any` in `marketplace-bulk.test.ts` (zero added).
- PROD GATE (Task 5 review finding, pinned by test): callbacks go
  silently UNSIGNED when `PLUGIN_HOOK_SECRET` is unset
  (`plugin-hooks.server.ts` — no secret ⇒ no header). `PLUGIN_HOOK_SECRET`
  MUST be set in production. Follow-up DECISION (not silently dropped):
  add a loud-missing-secret guard (warn + metric, throw in non-test env
  when unset) — open, unassigned.
- OPS CHECKLIST: `plugins.supervise` never fires until ops inserts the
  schedule row — `job_schedules` INSERT (`on conflict do nothing`) is
  required before it runs on schedule (no migration ships the row).
- PERF NOTE: hook emission `await`s inside `reserveStock`'s
  `withTenantLock`, holding the tenant lock up to ~800ms of subscriber
  I/O per checkout. `await` is plan-mandated (ordered logs); if checkout
  p99 regresses, fire-and-forget is the approved future perf-gate option.
- DEFERRED (honest, not silent): OS `child_process` sandbox (needs
  ops/security sign-off on resourceLimits + egress firewall — interface
  is swap-ready); `ProductForm` client-write → server-fn emission bridge
  (admin UI writes `products` direct from the client; only server commits
  emit `product.saved`); vendor→platform ingress HMAC verify — Phase 2
  signs EGRESS only, ingress verify is Phase 4; Supabase `Database`
  TS-types regen (casts narrow after); live `schema:check` + migration
  apply (needs live DB + `supabase_admin` for phase2n);
  `marketplace_widgets.install_count` semantics + purged-row re-uninstall
  guard (Task 9 minors); DDL-test hardening nits (per-column idempotency
  asserts, globSync portability). oauth.md still unapproved (unchanged).
- mem0: phase record `add_memory` (`user_id="rahman"`,
  `app_id="devrahmanbd-frame30"`) attempted once at close — async event left
  `RUNNING`/unconfirmed at commit time (prior quota-exhaustion history:
  1000/1000 until 2026-10-01); not retried per task budget. This CHANGELOG
  section is the durable record.
- Concerns: anon role GRANTs noted in Phase 1 stand; `/dashboard/plugins`
  production pass still needs an authenticated session (UNPROVEN, never
  fabricated); `ops/routing/*.conf` working-tree edits seen during Task 10
  belong to another session — left untouched, NOT in this phase's commits.

## [2026-09-22 12:30 UTC] (v0.5-beta — ae2bfbae) — Plugin Phase 1 core rebuild CLOSED (P1-0…P1-5)

- Scope: `docs/superpowers/specs/2026-09-22-plugin-system-rebuild-design.md`
  §2 + §7 gates (TDD, deny/replay/audit on every `[A]` mutation, prod
  verification, push + mem0 + CHANGELOG per task).
- Task 1 probes (`6ad92b2`, empty): `plugin_state` (3 rows) +
  `plugin_kill_switch` (0 rows) exist live with RLS; browser round-trip
  UNPROVEN (isolated probe redirected to /auth, no credentials).
- Task 2 DDL capture (`232009f` + review fix `eb10f3a`): phase2j migration
  mirrors live columns verbatim (incl. kill-switch `public_read USING
(true)`), RLS + GRANTs, `market_install_status` += `purged` (`removed`
  untouched). Applied live 2026-09-22 as `supabase_admin` (postgres role
  is not superuser/owner — plain `-u postgres` psql fails with
  must-be-owner; local-trust `-U supabase_admin` works).
- Task 2b backfill (`b4f92a1`): phase2k `ADD COLUMN IF NOT EXISTS
auto_updates` — phase2j's `CREATE TABLE IF NOT EXISTS` never adds the
  column on live. Live `\d` proves `auto_updates boolean NOT NULL DEFAULT
false`, enum gains `purged`, 3 policies intact, RLS on.
- Task 3 authz (`b8b3573`): `requirePermission("plugins.*")` on all plugin
  fns; Plugins routes/nav on `plugins.read`; `PERMISSIONS` +=
  `plugins.read/update`.
- Task 4 schema v1.5 (`20539a4`): textarea/color/media/url/date in
  `validateSettings` + `PluginSettingsForm` (unknown keys dropped, numbers
  clamped, strict selects preserved).
- Task 5 parity (`0f17105`): plugin search, auto-updates toggle column
  (`setPluginAutoUpdates` + `pluginAutoUpdatesFn`), bottom bulk bar,
  Add-New unified on `tab: "plugin"`, `install_count` decrement on
  uninstall; presets gain `plugins.read`, matrix trimmed to read/update.
- Task 6 gate (`4deeb74`): `savePluginSettings(db, m, p, values, actorId?)`
  writes `plugin.settings_saved` audit; `pluginSettingsSaveFn` passes
  `context.userId`. Deny (cross-merchant refused + untouched) + replay
  (double save, one row, last wins) + audit (settings + auto-updates rows).
- Tests: plugin suite 51/51 (7 files), contracts 258/258 gate OK.
  `bun run typecheck` infra-blocked (`tsgo: command not found`, exit 127)
  — CI lint-typecheck owns the loop-closing. `bun run schema:check`
  infra-blocked (fingerprint RPC 400) — live `\d` + policy list is the
  drift proof.
- Concerns: anon role holds table GRANTs (RLS still denies — no anon
  policy); `/dashboard/plugins` production pass still needs an
  authenticated session (UNPROVEN, never fabricated).

## [2026-09-22 10:10 UTC] (v0.5-beta — 2aeb88e) — auth tab bounce fix (deployed)

- Bug: on `/auth?mode=signup`, clicking the Sign In tab focused but the
  form bounced back to Create Account. Root cause: tab handlers set local
  `mode` state only (never the URL); the `search.mode` sync effect saw
  divergence and stomped local state back to `search.mode`.
- Fix: single source of truth — `mode` derives from `search.mode`;
  `switchMode()` navigates with `nextAuthSearch()` (preserves `redirect`).
  Sync effect replaced by clear-notices-on-mode-change; all 7 mode-switch
  call sites (tabs, MFA, forgot-password, footer links) go through it.
- New `src/lib/auth-mode.ts` (`parseAuthMode`, `nextAuthSearch`) +
  `auth-mode.test.ts` with architecture guard asserting no local mode
  state remains. 6/6 pass; typecheck + lint clean on touched files.
- Verified on production: signin↔signup tabs, forgot-password→reset, all
  URL updates confirmed, no console errors.

## [2026-09-22 07:26 UTC] (v0.5-beta — adb49e5) — WordPress Theme Handbook index

- `docs/themes/wordpress-handbook-index.md`: 137 pages, 11 chapters
  (Getting Started, Core Concepts, Templates, Patterns, theme.json,
  Features, Classic Themes, Advanced Topics, Releasing, Credits).
- Parity mapping noted: template hierarchy / theme.json / patterns /
  customizer / review guidelines map to our unified theme system as
  separate WP chapters.

## [2026-09-21] — main (other loop: page-builder Elementor parity)

- Ported theme widgets as native studio widgets (faq, marquee, countdown,
  banner, trust_bar, announcement_bar; then 11 heritage/hero widgets).
- Layers parity + save-as-global-block port; anti-wipeout autosave guard.
- Operator decrees recorded in progress.md: verify on production only,
  push to GitHub, path storefronts removed, shared-clone hazard noted.

## [2026-09-21 10:03 UTC] (v0.5-beta — 4153d77) — 84-widget port batch

- Slices A/B/C/D: 20 layout chrome + 20 trust/commerce + 20 guides/advisors
  - 24 data-backed placeholders → catalog + controls + renderers.
- Contract gate: 304/304 pass (registration, category, controls-match,
  instantiate, per-widget parity expects for all 101 widgets).
- tsc clean on touched files; pre-existing errors in PageBuilder.tsx /
  ThemesScreen.tsx untouched. tsgo binary unavailable locally; CircleCI
  lint-typecheck is the gate.
- Rebased onto `c6caaf9` (heritage-cutover merge); progress.md rewritten as
  compact loop state, other session's placeholder-pipeline note preserved.

## [2026-09-21 10:22 UTC] (v0.5-beta — 476da4b) — final-4 port + audits

- add_to_cart, rewards_club, wedding_shop, gift_finder → catalog +
  controls + canvas renderers + parity expects. Contract 316/316.
- Completed bundle_offer (i1–i4 variant IDs) + product_media (images,
  thumbnails, zoom) scalar control coverage.
- 4-agent swarm: slice-E porter + 3 read-only audits. Findings: 24 more
  theme widgets verified missing (next set); all 24 slice-D widgets LIVE
  on storefront; repeater conversion plan ranked (faq first, 8 total).
- tsc clean on touched files; model.ts/PageBuilder errors pre-existing.

## [2026-09-21 10:51 UTC] (v0.5-beta — 02ef60d) — parity-3 port

- 24 widgets (2 porter agents × 12): all theme defaults verified verbatim
  against builder-ast.ts; newsletter canvas uses static mock (no live
  form elements in the editing surface); icons deduped to resolvable
  lucide names.
- columns container support: model + sanitise + nodeHtml + canvas CSS
  mapping; storefront already resolves via theme Container.
- Contract 388/388 (new MEDIA/LAYOUT category sets); tsc clean on all
  touched ranges (upgradeWidget/widgetHtml/Section drifts pre-existing).

## [2026-09-21 11:09 UTC] (v0.5-beta — 4925edd) — faq repeater conversion

- TDD: failing contract + migration tests first, then minimal GREEN.
- faq defaults gain `items: []`; panel uses one repeater (q1-a3 controls
  removed, scalar defaults kept for pass-through); load migration seeds
  items from non-empty scalars without overwriting author edits.
- Canvas, theme renderer, and FAQPage JSON-LD all read items-first with
  scalar fallback — storefront and SEO cannot diverge.
- tsc caught a real bug pre-commit: block `const rows` shadowed the
  `rows()` helper (TDZ) — renamed to `list`.
- Icon registry gains CircleHelp. Known gap: repeater rows lack `_bn`
  bilingual siblings (scalars keep theirs).

## [2026-09-21 11:46 UTC] (v0.5-beta — 5d4d96d) — product_qna repeater conversion

- TDD + swarm: porter agent's pdp diff verified line-exact, applied as
  specified; consumer audit replaced direct greps after agent infra
  failure (icon orphan, askHref gap, SEO DATA_BACKED no-op confirmed).
- Precedence items > live Q&A rows > scalars keeps scalar-only pages
  byte-identical; loadQnaSource still stubbed so scalars stay live path.
- Contract 400/400, studio suite 414/414, tsc clean on touched ranges.

## [2026-09-21 12:11 UTC] (v0.5-beta — 04684d4) — trust_bar repeater conversion

- TDD + swarm: porter diff applied line-exact; audit via direct greps
  (second agent hit provider overload twice running).
- Icon values are TRUST_ICON keys — repeater icon field stays text-kind;
  canvas STUDIO_TRUST_ICON table unchanged, unknown keys still "•".
- Contract 402/402, studio 416/416, chrome+seo adjacent 26/26.

## [2026-09-21 12:28 UTC] (v0.5-beta — 8c0ddd8) — announcement_bar repeater conversion

- TDD + swarm: both recon agents landed (theme spec + 9-area audit).
- Row shape is {text} objects, not strings: PropValue admits PropRow[]
  only, matching every repeater precedent; porter's String(row) adapted.
- No SEO/export touch: zero announcement consumers there; m1/m2/m3
  export invisibility pre-exists and is unchanged.
- Contract 404/404, studio+chrome 426/426, tsc clean on touched ranges.

## [2026-09-21 12:37 UTC] (v0.5-beta — 4195642) — lookbook repeater conversion

- TDD + swarm: both recon agents landed with exact line refs.
- Ratio alternation is index-based in both paths, so items rows paint
  identically to scalar order (landscape first).
- Scope holds: legacy builder-ast fields, blueprints seeds, BITEXT,
  widgetHtml/export untouched (zero consumers; fallback covers).
- Contract 406/406, studio+atelier 433/433, tsc clean on touched ranges.

## [2026-09-21 12:46 UTC] (v0.5-beta — cd2b57b) — hero repeater conversion

- TDD + swarm: theme spec (with seed rule + leftover disposition) and
  9-area audit both landed; spec applied line-exact after verification.
- Hardest conversion so far: implicit slide 1 folded into row schema,
  global CTA copied per scalar row, subheading first-slide-only.
- Seeding mirrors the scalar keep-first filter exactly (slide 1 kept
  when any slide has content).
- Contract 408/408, studio+hero-adjacent 464/464, tsc clean on ranges.

## [2026-09-21 13:03 UTC] (v0.5-beta — f512bc1) — footer_sitemap + spec_table repeaters

- TDD + swarm: one spec+audit agent per widget, both landed.
- footer: {title, links:textarea} rows (nested repeater unproven in all
  20 existing blocks); tolerant parser fixes newline blueprint seeds.
- spec: resolved > items > scalars preserves the resolved-wins
  contract; tsc caught missing SpecPair.unit on item rows.
- Icon registry gains FolderTree + Table. Repeaters 8/8 complete.
- Contract 412/412, 463 incl. adjacent suites, tsc clean on ranges.

## [2026-09-21 15:09 UTC] (v0.5-beta — 075c550a) — Clothing Heritage activated on microscrop.shop

- Operator-ordered: Flame Fashion BD (owner nahid52flame@gmail.com, not
  flamedev7's Akira) switched Rupaboti → Clothing Heritage via
  app-faithful activation (published pointer verified live first, flag
  flip, coherence kept, theme.activated audit row, actor flamedev7).
- Browser-verified: heritage homepage renders with zero console errors;
  cart/quiz/announcement interactions proven earlier same day.
- Server state: HEAD 933c059, fresh 16:02 CEST build+start, no errors;
  disk 94% flagged. Registry draft refresh skipped (rendering-safe).

## [2026-09-21 15:50 UTC] (v0.5-beta — 53e1896) — onboarding trap + dead-link fixes (deployed)

- fix(auth): post-login always lands /dashboard; dual-gate membership
  race bounced store owners to /onboarding (row proven returned).
- fix(settings): no custom domain → connect-domain CTA, never a path
  URL (bare 404 since cutover). Verified live.
- Deploy contract green (path 404s hold, custom domain 200s).
- RLS audit (live): writes clean; public reads uneven (products +
  store_themes world-readable incl. drafts; variants properly gated).

## [2026-09-21 16:28 UTC] (v0.5-beta — f5f0a36) — curated two-theme offer (deployed)

- Appearance grids show Supershop + Clothing Heritage only; active
  theme exempt so the live storefront stays manageable. Reversible.
- Contract: 23/23 appearance suite (2 new). tsc: only pre-existing
  drift. Deploy contract green.

## [2026-09-21 17:31 UTC] (v0.5-beta — 1c28cca) — merchant AI control removed (deployed)

- Gateway config, copilot, AI triage inbox: hidden from nav, routes
  redirect, RPCs denied server-side. askAssistantFn (public widget)
  and /dashboard/support intentionally untouched.
- Contract: 4 new gate tests green. Deploy contract green.

## [2026-09-21 17:43 UTC] (v0.5-beta — 2b07c60) — marketplace curated offer + infra incident

- listCatalog filters themes server-side (same allowlist); widgets and
  installs untouched. Bridge tests updated (10/10).
- Disk-full outage: WAL 60G + shared usage → postgres crash loop.
  Journal vacuum freed 3.4G, DB recovered, app green. WAL pruning left
  for DR owner (PITR chain intact).
- Deploy gap found: silent fetch failure built stale bundle; re-deploy
  - live catalogue check ("2 Themes") closed it.

## [2026-09-21 19:03 UTC] (v0.5-beta — e5e0b06) — cross-tenant path guard (deployed)

- Root cause: host-resolution miss (DB outage + cached nulls) funneled
  /cart into featured-store redirect, and custom hosts never checked
  path slug against host merchant — CloudMan rendered on Flame domain.
- Fix: isForeignStorePath pure decision + server.ts gate (fail closed,
  token/loopback/platform semantics preserved).
- Contract 36/36 (5 new). Live verified: foreign 404, own 200s.

## [2026-09-21 19:54 UTC] (v0.5-beta — b8e5b53) — API tenant audit fixes (deployed)

- market_review_submit: ownership enforced (was open + broken column);
  verified live forbidden/requires_install/success paths.
- grantStepUp: membership check at mint. openCharge: slug==order
  binding (COD advance included). Order route: slug check.
- Swarm audits: console mostly CLEAN; storefront CLEAN except oracles
  and global blog namespace (logged as follow-ups).

## [2026-09-21 22:44 UTC] (v0.5-beta — f02278a7) — Studio pages render on storefront + activation fix

- Builder-authored pages served starter/empty (read path stub-only,
  export fallback empty for heritage). getStorePageFn now passes
  Studio nodes; StoreHomepage + pages twin render canvas components.
  Proven live via preview token (real headings, no starter markers).
- Supershop activation: draft-only rows hit undead-end unpublished
  error; Activate now materializes. Live on Flame + Akira.
- Contract: 3 new static-render tests green.

## [2026-09-18/19] — spectacular scope (from git history)

- CI migrated to CircleCI (`aa744e8`); Supabase JWT/keys rotated (Sept 18).
- Clothing-heritage theme + Aarong-grade storefront + demo catalogs.
- 429 storm fixed (windowed RPC + console/loopback buckets).
- CMS homepage designation + route code-splitting; auth redesign.
