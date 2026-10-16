# framique-harness

Disclosure for every run under `harness/`. Results are comparable only when
they declare the same harness, sandbox, verifiers, and reward contract below.
Anything not recorded in the trace did not happen.

## 1. Identity

- **Name:** `framique-harness`
- **Version:** `0.2.0`
- **Covers:** commerce gates (12 tasks) plus the frame30 extension program
  (6 tasks: real-editor registry, schema panel, render lanes, storefront
  binding, pipeline/security matrix, Level B production E2E).
- **What it is:** task runner + isolated environment + deterministic verifiers
  - trace recorder for this repo (Framique commerce platform).
- **Division of responsibility:** the agent owns the loop (read, edit, iterate).
  The harness owns the environment, verification, and scoring. The harness
  never edits task code, never retries on the agent's behalf, and never
  interprets a non-zero exit as a pass.

## 2. Sandbox

Each task runs in its own `git worktree` branched from the recorded base
commit. `node_modules` is symlinked from the base checkout, not reinstalled
per task. Only loopback network is permitted. Each task gets its own port
allocation from `environment.ports`; tasks must not bind outside it.

What isolation covers:

- Source edits are confined to the task worktree; the base checkout and
  sibling task worktrees are not on the task's git path.
- Port collisions between concurrent tasks are avoided by allocation.
- Verifier commands execute inside the task worktree.

What isolation does NOT cover:

- **There is no container boundary.** Task processes run as the same OS user
  with the same filesystem and process visibility as the operator. A buggy or
  hostile task can read, write, or delete files outside its worktree and can
  observe sibling processes. Do not run untrusted code under this harness.
  Treat every task as fully trusted local code.
- **Task envs see repo secrets.** `node_modules` and `.env` are symlinked
  (not copied) into each worktree so verifiers behave identically to the
  base checkout; pruning the worktree revokes access, but while it lives
  the task can read every secret in `.env`. A future untrusted-agent mode
  needs a redacted env set instead — that mode does not exist yet.

## 3. Verifiers

The harness invokes only the repo's existing gates. It does not invent
checks. Gate vocabulary follows `docs/security/ci-gates.md`:

- Vitest suites: `npm test` (`vitest run`), including scoped file runs such
  as `npx vitest run <file>`.
- Typecheck: `npm run typecheck` (`tsgo --noEmit`, tsc-family).
- Secret scan: `node scripts/secret-scan.mjs` — blocking, fails on
  credential-shaped strings.
- SAST suspicious-diff: `node scripts/sast-scan.mjs` — blocking, fails on
  findings, prints `file:line`. Fail-closed on unresolvable base.
- Dependency audit: `node scripts/dep-audit.mjs` — blocking, fails on
  uncovered high/critical and on malformed/expired exceptions. Fails closed
  if the audit itself cannot run.
- Playwright specs: `npx playwright test -c .e2e/playwright.config.ts
<spec...>` — includes critical and security suites. A missing or stub
  `.e2e/playwright.config.ts` is a failure (`e2e-required.mjs` semantics),
  never a pass.
- Verifier commands must run under `node`/`npm`/`npx` without `bun`.

Dependency versions are pinned by the repo lockfiles (`package-lock.json`
for npm-resolved verifiers such as `dep-audit`; `bun.lock` for bun
installs). The Node version is not
assumed — it is recorded in every trace (`nodeVersion`).

## 4. Reward contract

One task, one number, one reason. No other score exists.

- `1.0` — every verifier in the task's `verifier` list exited 0 within its
  timeout. Why: the task's contract is "all stated checks pass".
- `0.0` — any verifier ran and failed. Timeout kills count as failures.
  Why: a stuck loop is a failed loop; wall-clock is part of the contract.
- `null` with a `reason` string — the verifier never ran: setup failure
  (worktree creation failed, dependency link failed), missing executable, or
  harness error before first spawn. Why: a dead sandbox is not a wrong
  answer. Recording `0.0` would claim the agent's output failed checks that
  never executed.

Rules:

- No combined or weighted scores. A task with three verifiers reports one
  number under the contract above, not a fraction.
- No completion bonuses. Submission bonuses train immediate-submit policies
  while held-out accuracy collapses; this harness pays only for verifier
  outcomes, never for finishing, formatting, or speed.
- Timeouts kill stuck loops. A killed process reports `0.0` with reason
  `timeout`, never `null`.
- Output is capped (`stdout`/`stderr` truncated per trace, full log to disk
  only). A verifier that floods the log does not extend its timeout.

## 5. Trace contents

Every run writes one JSON trace to `harness/traces/<task-id>-<timestamp>.json`
(dashes, not dots — this is the exact filename pattern the runner writes):

- `taskId`: the task id.
- `harness`: `{ "name": "framique-harness", "version": "0.1.0" }`.
- `startedAt`: ISO timestamp.
- `env`: `{ "worktree": <path|null>, "ports": <n|null> }` (`worktree` is
  null under `--verify-only`, which runs in the current tree).
- `verifierResults`: one entry per verifier command —
  `{ command, exit, durationMs, timedOut, tail, started }` (`tail` is the
  capped tail of combined output; `started` is false only when the process
  never spawned, in which case `tail` carries the reason).
- `reward`: `1.0`, `0.0`, or `null`.
- `rewardNote`: human-readable reason, always present. A `null` reward
  without a reason is a harness bug.

Not yet recorded (documented follow-ups, not silent gaps): `nodeVersion`,
lockfile digest, and `model` (model identifier when a model drove the run,
else `null`) — comparability fields a future runner version should add
without renaming the fields above.

Traces are append-only and git-ignored. The runner never rewrites a written
trace; a rerun writes a new file.

## 6. Non-goals

- Not a trainer. No gradients, no preference data, no policy updates.
- Not RL infrastructure. No rollouts, no advantage estimation, no replay.
- No model API. The harness spawns local commands only; it never calls a
  model provider.
- No network exfiltration. Loopback only; verifiers that require external
  network fail closed rather than dialing out.
