# CI Security Gates (CircleCI-only)

CircleCI is the only CI system (never `.github/`). All security gates live in
`.circleci/config.yml`, enforced by scripts in `scripts/`, with CODEOWNERS as
the human review layer. Nothing here passes silently.

## What runs, what blocks

| Job / step | Command | Blocking? |
|---|---|---|
| `scan` — secret scan | `bun run secrets:scan` (`scripts/secret-scan.mjs`) | Yes — fails on credential-shaped strings |
| `scan` — SAST suspicious-diff | `bun run sast:scan` (`scripts/sast-scan.mjs`) | Yes — fails on findings, prints `file:line` |
| `scan` — dependency audit | `bun run scan:deps` (`scripts/dep-audit.mjs`) | Yes — fails on uncovered high/critical |
| `e2e-critical` — harness gate | `bun run e2e:required` (`scripts/e2e-required.mjs`) | Yes — missing harness FAILS, never passes |
| `e2e-critical` — critical suites | `bun run e2e:critical` | Yes (runs only after the harness gate) |
| `plugin-storefront-gate` | plugin + storefront tripwire suites | Yes |

## SAST suspicious-diff (`scripts/sast-scan.mjs`)

Scans **added lines** in the working tree plus the committed range vs a
PR-aware base (override with `--base <ref>` or `SAST_BASE`; `--full` scans the
whole tree; `-- <paths>` scopes to files). CI resolves the base fail-closed:
the fetch is fatal (no `|| true`), fork-PR destinations resolve via the
GitHub API when a token exists, otherwise the branch default applies
(`frame30` diffs vs `origin/main`; other branches vs `origin/frame30` when it
exists). The scanner runs with `SAST_REQUIRE_BASE=1`, so an unresolvable base
is a hard error (exit 2) — a clean checkout can never pass vacuously; base
established + zero changed lines stays a genuine pass. A nightly
`nightly-full-sast` workflow sweeps the whole tree (`--full`) on `main` and
`frame30`; its backlog triages via `sast-allow -- reason` like any finding.

Rules: `dynamic-exec` (`eval(`, `new Function`), `dynamic-import`
(non-literal `import()` specifier only — static code-splitting is fine),
`html-sink`, `network-egress` (fetch/XHR/WebSocket to non-allowlisted hosts;
allowlist lives in the script — extend with a reason), `shell-exec`
(subprocess use in app code; `scripts/` + `ops/` tooling is out of scope),
`secret-access` (privileged service keys outside `*.server.ts`),
`csp-sandbox` (`allow-same-origin`, `unsafe-inline`).

`*.test.*` / fixtures are out of scope for attacker-string rules: validator
suites must contain attack strings as *data*. An intentional use gets a
trailing suppression with a mandatory reason, visible in the diff:

```ts
spawnSync("git", args); // sast-allow: shell-exec -- one-shot probe, no user input
```

Taint rules (`tainted-egress`, `tainted-redirect`, `tainted-fs`,
`tainted-auth`, `tainted-url-attr`) close the variable-destination gap the
literal rules cannot see: intra-file tracking (no deps) of request-derived
data (`req.query/body/params`, route params, `FormData`/`URLSearchParams`
reads, untyped `input|payload|body|query|params` params — typed params are
declared contracts, not taint) and merchant/DB-controlled data (`db.` /
`supabase` reads) into URL hosts, redirect targets, fs-write paths, auth
decisions (request-provenance only), and `src=`/`href=` (request-only).
Findings stay diff-scoped: taint is mapped whole-file, but only sinks on
added lines report. Transparent forwarding (`fetch(input)` in a wrapper),
same-origin relative URLs, and literal allowlisted hosts stay silent.

## Dependency audit (`scripts/dep-audit.mjs`)

Runs `npm audit --omit=dev --json`, fails on high/critical without a reviewed
exception in `scripts/dep-exceptions.json`. Each entry needs `module`,
`reason` (why non-exploitable *here*), `owner`, `expires` (`YYYY-MM-DD`).
CI fails on **expired entries, missing owners, malformed entries**, and
uncovered findings. Stale entries (no live advisory) warn — remove them.
One entry per advisory; never blanket-except. Fails closed if the audit
itself cannot run.

## E2E fail-closed (`scripts/e2e-required.mjs`)

Missing (or stub) `.e2e/playwright.config.ts` writes
`.artifacts/e2e/HARNESS-MISSING-NOT-VERIFIED.marker` and exits non-zero.
It must never be read as a pass. This intentionally supersedes the old
pass-by-design skip. Land the harness to clear the gate.

## Human layer (CODEOWNERS, repo root)

`src/lib/package-zip.ts`, `src/lib/package-scan.ts`,
`src/components/marketplace/WidgetSandbox.tsx`,
`src/lib/marketplace-scopes.ts`, `src/lib/tenant-scope.ts`, and auth/RLS
migrations need **independent review** — author must not be sole approver.

## Owner actions (cannot be done in code — do these in GitHub)

- [ ] Protect `main` (and `frame30` while it lives): no direct pushes.
- [ ] Require PR reviews before merge; require CODEOWNERS review on the
      security-sensitive paths above; disallow self-approval there.
- [ ] Require the CircleCI checks (`scan`, `e2e-critical`,
      `plugin-storefront-gate`, `build`) as required status checks.
- [ ] Require branches be up to date before merging.
- [ ] Re-triage `scripts/dep-exceptions.json` on/before each expiry
      (current: `source-map-js` GHSA, expires 2027-01-09 — upgrade past the
      fixed release or renew with fresh justification).

## Verify locally

```bash
node scripts/sast-scan.mjs          # changed code (what CI runs)
node scripts/dep-audit.mjs          # deps + exceptions
node scripts/e2e-required.mjs       # expect FAIL until harness lands
node scripts/secret-scan.mjs        # secrets (unchanged, still blocking)
python3 -c "import yaml; yaml.safe_load(open('.circleci/config.yml'))"
```
