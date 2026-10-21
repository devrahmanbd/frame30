# Phase 3 — the remote CI: the exact limitation, stated rather than claimed

**Branch:** `frame30` · **Recorded:** 2026-10-22 · **Tip at the time of writing:** `0a794b549315`
**Plan:** `docs/superpowers/plans/2026-10-21-frame30-core-cms-upgrade.md` — **Task 10**
**The pipeline:** `.circleci/config.yml` — the `gates` workflow at `:354-384`, and the nightly whole-tree SAST sweep at `:387-397`
**The phase-3 evidence record (the local results in full):** `docs/superpowers/songoskriti-evidence/port/phase3-evidence.md`

---

## 1. The limitation, verbatim

> *"The remote CircleCI run for this branch **cannot be verified from this environment**: there is no CircleCI API token and no `~/.circleci/cli-config.yml`, so the workflow can be neither triggered nor observed here (`env | grep -i '^CIRCLECI'` → empty; `ls ~/.circleci` → no such directory; `curl -s -o /dev/null -w '%{http_code}' https://circleci.com/` → `200`, so the limitation is authentication, not connectivity). The push to `origin/frame30` **does** trigger the pipeline, and every gate CI runs was run locally with the commands and results recorded above — but *_no claim of a green remote run is made, and the brief's DoD item 10 is reported as UNVERIFIED-FROM-HERE, not as passed."_

## 2. The measurement that settles it

The three commands, run on **2026-10-22** at `0a794b549315`:

```
$ env | grep -i "^CIRCLECI" || echo "no CIRCLECI token in the environment"
no CIRCLECI token in the environment
$ ls -la ~/.circleci 2>/dev/null || echo "no ~/.circleci/cli-config.yml"
no ~/.circleci/cli-config.yml
$ curl -s -o /dev/null -w "circleci.com:%{http_code}\n" https://circleci.com/
circleci.com:200
```

**Read together, they say one thing:** the network reaches CircleCI, and this
box has no way to prove who it is to them. There is no `CIRCLECI_TOKEN`, no
`CIRCLECI_CLI_TOKEN` and no `~/.circleci/cli-config.yml` — the directory does
not exist. The CircleCI **API and CLI are therefore unusable**: a workflow
cannot be triggered from here, and a run's status, job logs and conclusion
cannot be read.

**What is true:** the remote is reachable, the repository is connected, and a
push to `origin/frame30` **does** trigger the pipeline. **What is not
observable from here:** whether that run passed, which job failed, or what it
concluded. A push is a trigger, not a receipt.

## 3. The local equivalents of every CI job

The environment has **no `bun` on `PATH`**, so each `bun run …` form below is
invoked as its `node_modules/.bin/…` or `node scripts/…` equivalent. The
statuses are the **actual** results measured on 2026-10-22 at `0a794b549315`.

| the CI job                                                                | the CI step                                                                                                                             | the local equivalent                                                                                                             | the actual status                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint-typecheck`                                                          | `bun run lint` (`.circleci/config.yml:51-52`)                                                                                           | `node_modules/.bin/eslint src scripts`                                                                                           | **green** — exit 0: 0 errors, 319 pre-existing warnings, none added by this programme. A repo-wide `eslint .` stalls on the untracked `.output-snapshots/` tree (110 MB), so the paths are linted instead.                                                                                                                                         |
| `lint-typecheck`                                                          | `bun run typecheck` (`:54-55`)                                                                                                          | `node_modules/.bin/tsgo --noEmit`                                                                                                | **green** — no output, exit 0                                                                                                                                                                                                                                                                                                                      |
| `unit-contract`                                                           | `bun run test` (`:72-73`)                                                                                                               | `node_modules/.bin/vitest run`                                                                                                   | **red on three pre-existing, environment-bound failures** — 619 files: 616 passed, 1 skipped, 2 failed; 8 769 tests: 8 763 passed, 3 skipped, 3 failed. The three are `src/lib/analytics-live-shape.test.ts` (2) and `src/lib/site.server.test.ts` (1); they need a warehouse/`.env` shape CI does not have, and they fail at the base commit too. |
| `unit-contract`                                                           | `bun run test:contracts` (`:75-76`)                                                                                                     | `node scripts/contract-gate.mjs`                                                                                                 | **EXPECTED RED**, exit 2 — `contract-gate: could not start vitest — spawnSync bunx ENOENT`. The script hardcodes `spawnSync("bunx", …)` and `bun` is not on `PATH` here. Pre-existing; not fixed, not hidden.                                                                                                                                      |
| `unit-contract`                                                           | `bun run doc:gate` (`:78-79`)                                                                                                           | `node scripts/doc-gate.mjs`                                                                                                      | **green** — `0 findings`, exit 0                                                                                                                                                                                                                                                                                                                   |
| `scan`                                                                    | `bun run secrets:scan` (`:93-94`)                                                                                                       | `node scripts/secret-scan.mjs`                                                                                                   | **not runnable here** — the script sweeps the whole tree, and the untracked `.output-snapshots/` directory holds 110 MB of build output; the prior record's local findings inside that tree are a local artefact of the untracked directory, not a finding in the source. CI runs it on a clean checkout.                                          |
| `scan`                                                                    | `bun run sast:scan` (`:96-…`)                                                                                                           | `node scripts/sast-scan.mjs`                                                                                                     | **not runnable here** — the same whole-tree sweep, with the same `.output-snapshots/` caveat. Its CI form is a **diff** scan whose base is resolved fail-closed: `SAST_BASE`, else the PR destination, else `origin/main` on `frame30` (`.circleci/config.yml:110-150`).                                                                           |
| `scan`                                                                    | `bun run scan:deps` (`:186-187`)                                                                                                        | `node scripts/dep-audit.mjs`                                                                                                     | **not runnable here** — it needs the audit endpoint this box cannot reach.                                                                                                                                                                                                                                                                         |
| `build`                                                                   | `bun run build` (`:209-210`)                                                                                                            | `node_modules/.bin/vite build`                                                                                                   | **not run here** — the build writes into the same untracked `.output-snapshots/` tree. The compile-level proof is `tsgo --noEmit`, which is green.                                                                                                                                                                                                 |
| `e2e-critical`                                                            | `bun run e2e:critical` (`:235-236`)                                                                                                     | `node_modules/.bin/playwright test -c .e2e/playwright.config.ts smoke theme-preview-isolation real-frames storefront-resilience` | **partially run here** — this programme's own lanes (the seven-template editor journey, the storefront-surface assertions, the self-critique capture) ran on the repo's throwaway stack and are recorded in the phase-3 evidence record §2.2; the platform-wide suites were not re-run in this batch.                                              |
| `e2e-security`                                                            | `bun run e2e:security` (`:280-281`)                                                                                                     | the same Playwright config, the adversarial specs                                                                                | **not run here** — not part of this programme's scope, and it needs the CI environment's own harness.                                                                                                                                                                                                                                              |
| `e2e-levelb-production`                                                   | `npx playwright test -c .e2e/playwright.config.ts levelb-theme-execution levelb-theme-switch-serve levelb-theme-lifecycle` (`:344-345`) | the same                                                                                                                         | **not run here** — not part of this programme's scope.                                                                                                                                                                                                                                                                                             |
| `plugin-storefront-gate`                                                  | the tripwire step (`:251-…`)                                                                                                            | —                                                                                                                                | **not run here** — a CI job over the plugin storefront; it needs the CI environment.                                                                                                                                                                                                                                                               |
| asset gate (the `gates:release` chain, owner-run — **not** a CI job)      | `bun run assets:songoskriti`                                                                                                            | `node scripts/songoskriti-assets-check.mjs`                                                                                      | **green** — `0 findings`, 11 advisory notes                                                                                                                                                                                                                                                                                                        |
| asset generator (the `gates:release` chain, owner-run — **not** a CI job) | `bun run assets:songoskriti:gen`                                                                                                        | `node scripts/gen-songoskriti-assets.mjs --check`                                                                                | **green** — 21 planned assets match the frozen expectation                                                                                                                                                                                                                                                                                         |
| schema fingerprint (CI's `Release gates (headless)` step, `:322-327`)     | `bun run schema:check`                                                                                                                  | `node scripts/schema-fingerprint.mjs --check`                                                                                    | **EXPECTED RED**, exit 1 — `schema-fingerprint: rpc failed (400)`. It needs a live Supabase RPC. Pre-existing; not fixed, not hidden.                                                                                                                                                                                                              |

**The two expected reds are the two the plan named**, and neither was fixed,
neither was hidden, and neither is counted as a pass. The third red — the
three environment-bound unit failures — is **pre-existing**: the same two
files fail at the base commit in this same environment, and the side-by-side
baseline is in the escalation record
(`docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md:4139-4148`).

## 4. What the remote pipeline will run

The `gates` workflow (`.circleci/config.yml:354-384`), in order and with
its edges:

```
lint-typecheck  →  unit-contract  →  scan  →  build
                                                   ├─ e2e-critical          (requires: build)
                                                   ├─ e2e-security          (requires: build)
                                                   ├─ e2e-levelb-production  (requires: build)
                                                   └─ plugin-storefront-gate
```

plus the nightly whole-tree SAST sweep on `main` and `frame30`
(`:387-397`).

**`build` is a hard gate.** A failed build fails the workflow with the three
E2E jobs left `blocked` — never run. That is why the E2E jobs carry
`requires: build` and why a broken build cannot burn the browsers executor.

## 5. The push, and what it does and does not do

The plan's Task 10 step 10.4 is the **only** push in the plan. Its command:

```
git push origin frame30
git log --oneline -1
```

**It was executed**, and it succeeded:

```
$ git push origin frame30
To https://github.com/devrahmanbd/frame30.git
   182c37b5..a7b210cd  frame30 -> frame30
$ git rev-parse origin/frame30
a7b210cd09f3b561047b1202bda0bcb35cd31387
```

It was a **fast-forward** — `origin/frame30` was at `182c37b5` and moved to
`a7b210cd`, the tip of this branch. Nothing was force-pushed and no other
branch was touched.

**What the push does:** it moves `origin/frame30` to this branch's tip, and
it **triggers** the pipeline above — the repository is connected to
CircleCI, so a push to `frame30` starts the `gates` workflow (and, on the
nightly schedule, the whole-tree SAST sweep).

**What the push does not do, and what is therefore not claimed here:** it
does not produce a receipt. Without an API token there is no way to read the
run's status, its job logs or its conclusion from this box. **The run URL is
the owner's to open.**

## 6. The DoD item, stated as it is

| the DoD item                                                               | its status                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the brief's DoD item 10 — _"CI passes on the actual target branch commit"_ | **UNVERIFIED-FROM-HERE — NOT PASSED.** The remote run cannot be observed from this environment (authentication, not connectivity). The gates it runs were run locally and their results are in §3, including the two expected reds and the three pre-existing environment-bound failures. |
| every local gate                                                           | **green**, except the two expected reds and the three pre-existing environment-bound failures, each stated with its reason in §3                                                                                                                                                          |
| the parity re-freeze                                                       | **the owner's action** on the throwaway stack — recorded in the phase-3 evidence record §4.2, with the exact command and the preconditions                                                                                                                                                |

Nothing in this record is a claim that a remote run passed. It is a
statement of what was run here, what it returned, and what could not be
run or seen from here.
