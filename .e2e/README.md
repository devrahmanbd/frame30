# Framique E2E harness (`.e2e/`)

Minimal working Playwright harness. Chromium only. Hermetic: every spec
touches `baseURL` (loopback) and asserts no request leaves it.

## Files

| File                               | Purpose                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `playwright.config.ts`             | baseURL/timeouts/retries/trace-on-failure + dev-server lifecycle                       |
| `helpers.ts`                       | baseURL resolution, loopback helpers, network collector                                |
| `smoke.spec.ts`                    | harness proof: `/` renders, liveness probe answers                                     |
| `theme-upload-adversarial.spec.ts` | (a) traversal ZIP rejected unauthenticated; hostile preview renders nothing executable |
| `theme-preview-isolation.spec.ts`  | (b) songoskriti preview: all images 200, zero `assets/` 404s                           |

## Run

```bash
# Config starts its own dev server automatically (and kills it afterwards):
npx playwright test -c .e2e/playwright.config.ts

# Repo-script equivalents:
npm run e2e            # all suites
npm run e2e:critical   # critical suites only (these three files are NOT
                       # in the critical list, so e2e:critical skips them)
```

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
