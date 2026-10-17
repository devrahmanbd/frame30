# Framique E2E harness (`.e2e/`)

Minimal working Playwright harness. Chromium only. Hermetic: every spec
touches `baseURL` (loopback) and asserts no request leaves it.

## Files

| File                                    | Purpose                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `playwright.config.ts`                  | baseURL/timeouts/retries/trace-on-failure + dev-server lifecycle                          |
| `helpers.ts`                            | baseURL resolution, loopback helpers, network collector                                   |
| `global-setup.ts`                       | cold-start warm-up probe (preview route) before any spec runs                             |
| `smoke.spec.ts`                         | harness proof: `/` renders, liveness probe answers                                        |
| `theme-upload-adversarial.spec.ts`      | traversal ZIP rejected unauthenticated; hostile preview renders nothing executable        |
| `theme-preview-isolation.spec.ts`       | songoskriti preview: all images 200, zero `assets/` 404s                                  |
| `theme-preview-security.spec.ts`        | foreign tenant paths never serve content unauthenticated                                  |
| `package-css-gate-differential.spec.ts` | gate-passed theme CSS renders exactly as the gate models                                  |
| `frame-cpu-recovery.spec.ts`            | frame CPU-budget recovery (srcdoc island blocks host; cross-origin does not)              |
| `real-frames.spec.ts`                   | iframe census + real-frame postMessage/same-origin walls                                  |
| `storefront-resilience.spec.ts`         | storefront degrades gracefully without a publish/backend                                  |
| `demo-theme-mounted.spec.ts`            | storytelling block through the real shell + real GSAP timeline                            |
| `demo-theme-webgl.spec.ts`              | WebGL scene renders a real frame (pixels differ from the poster still)                    |
| `levelb-theme-execution.spec.ts`        | real bundle executes ONLY inside the sandboxed frame                                      |
| `levelb-theme-switch-serve.spec.ts`     | switch → serve: post-switch binding addresses live approved bytes                         |
| `levelb-theme-lifecycle.spec.ts`        | publish lane: republish moves the live pointer; stale republish refused                   |
| `levelb-theme-sandbox.spec.ts`          | extended assemble→review→publish→activate ladder (NOT in the CI verifier set)             |
| `extension-workflow.spec.ts`            | session gate + static wiring + hostile inert + storefront degrade                         |
| `plugin-anonymous-journey.spec.ts`      | anonymous plugin journey; auth-gated steps are DECLARED skips                             |
| `plugin-registry-editor-wiring.spec.ts` | registry → editor wiring journey; same declared-skip policy                               |
| `plugin-authenticated-journey.spec.ts`  | authenticated replica: mode B (real loopback stack, 6/6 green) / mode A (no stack, skips) |

## Run

```bash
# Config starts its own dev server automatically (and kills it afterwards):
npx playwright test -c .e2e/playwright.config.ts

# Repo-script equivalents (spec sets mirror CircleCI):
npm run e2e:critical   # smoke, theme-preview-isolation, real-frames, storefront-resilience
npm run e2e:security   # theme-upload-adversarial, theme-preview-isolation, theme-preview-security,
                       # package-css-gate-differential, frame-cpu-recovery
npm run e2e            # everything, including the plugin journeys
```

The plugin journeys (`plugin-*-journey`, `extension-workflow`) are NOT in
the CI spec sets. Their authenticated steps go green against a real
loopback auth stack (mode B) — recipe and evidence expectations in
`docs/15-e2e/loopback-auth-setup.md`. Without that stack (mode A) the
credential-gated tests report as SKIPS: reported as skipped, never counted
as passes.

Chromium is already a devDependency (`@playwright/test 1.56.0`). If browsers
are missing:

```bash
bunx playwright install --with-deps chromium   # needs sudo for --with-deps
```

## Environment

| Var                | Default                             | Meaning                                                         |
| ------------------ | ----------------------------------- | --------------------------------------------------------------- |
| `E2E_BASE_URL`     | `http://localhost:<E2E_PORT\|3000>` | Server under test (repo convention, cf. `scripts/*-gate.mjs`)   |
| `E2E_PORT`         | `3000`                              | Port used when `E2E_BASE_URL` is unset (vite dev default)       |
| `E2E_NO_WEBSERVER` | unset                               | Set to `1` to disable auto-start and manage the server yourself |

CI parity (`e2e-critical`/`e2e-security`/`e2e-levelb-production`): no
`.env*` files; the boot env is the fake unreachable CircleCI set
(`SUPABASE_URL=http://127.0.0.1:9`, `…_PUBLISHABLE_KEY=ci-placeholder-…`,
`AUTH_HASH_SALT=ci-placeholder-salt`) — see `.circleci/config.yml`.

Manual server (equivalent to what the config spawns; `bun` absent → `npx`):

```bash
npx vite --port 3000 --strictPort --host localhost
# stop it: pkill -f "vite --port 3000" (kill the vite PID itself — killing
# the background subshell leaves the server running)
```

Cold starts are slow: a fresh checkout re-optimizes dependencies and
compiles SSR routes on first hit (minutes, not seconds). The config allows
300 s for webServer readiness and each spec file retries once locally
(twice on CI); a first-try timeout on a cold server that goes green on
retry is expected, not a product bug.

## Cleanup ownership

- Servers spawned by `webServer` are killed by Playwright at run end.
- A manually started server is the operator's to stop (command above).
- Specs start no processes; each file's `afterAll` disposes exactly what
  that file opened (network listeners, extra API contexts).

## Gate note (read-only)

`scripts/e2e-required.mjs` fails closed while `.e2e/playwright.config.ts`
is absent or a stub (< 200 B). This harness clears it; the script itself is
intentionally untouched. Verify with:

```bash
node scripts/e2e-required.mjs   # expect: "e2e harness check passed"
```

## If rate-limited

Dev rate limits are loopback-budgeted and this suite fires ~20 requests, so
429s are not expected. If one appears (shared box, parallel lanes), wait
~60 s and retry once; do not hammer.
