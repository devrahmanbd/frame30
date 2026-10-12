# Task authoring guide

How to add a task to `harness/tasks/*.json`. Companion to `HARNESS.md`
(disclosure) — this file is procedure. The runner is `harness/run.mjs`.

## 1. Task JSON field reference

One file per task, one JSON object. Unknown fields are rejected.

| Field                  | Type                      | Required    | Meaning                                                                                                                                                  |
| ---------------------- | ------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                   | string, `^[a-z0-9-]+$`    | yes         | Stable slug. Never rename after a trace cites it.                                                                                                        |
| `title`                | string, <= 80 chars       | yes         | Human label. Not shown to the agent as instruction.                                                                                                      |
| `instruction`          | string                    | yes         | The exact prompt given to the agent. Deterministic: same text, same start state, same verdict.                                                           |
| `kind`                 | `guard` \| `fix` \| `e2e` | yes         | `guard`: existing behavior must keep passing. `fix`: a known failure must be repaired. `e2e`: Playwright spec(s) decide.                                 |
| `cost`                 | `fast` \| `slow`          | yes         | `fast`: unit/typecheck/scans only, under ~5 min. `slow`: installs a browser, starts servers, or runs Playwright. Used for scheduling, never for scoring. |
| `environment.worktree` | boolean                   | yes         | Always `true`. Every task gets a fresh `git worktree`. There is no in-place mode.                                                                        |
| `environment.ports`    | array of ints             | `slow` only | Loopback ports the task may bind. `fast` tasks omit it and bind nothing.                                                                                 |
| `verifier.command`     | string                    | yes         | Shell command the runner spawns in the task worktree. Must run under `node`/`npm`/`npx` without `bun`.                                                   |
| `verifier.timeout_sec` | int, > 0                  | yes         | Wall-clock kill after N seconds. Kill reports `0.0` with reason `timeout`.                                                                               |
| `reward.mode`          | `all-pass`                | yes         | Only mode. Every listed verifier must exit 0 for `1.0`. No partial credit.                                                                               |

A task may list multiple verifiers as an array under `verifier`. Each entry
has its own `command` and `timeout_sec`.

## 2. Rules

1. A `guard` task ships only after its verifier passes on the base branch.
   Record the passing commit in the PR. A guard that never passed is a
   broken detector, not a test.
2. A `fix` task needs failing-first proof: the verifier must fail on the
   base commit (paste exit code + failing lines in the PR) and pass after
   the reference fix. No red-then-green evidence, no ship.
3. Commands must run without `bun`. Use `node scripts/...`,
   `npm test -- ...`, `npm run typecheck`, `npx playwright ...`. CI may use
   `bun run`; the harness does not assume `bun` exists.
4. Hermetic, loopback-only. No external network, no hosted services, no
   license-gated binaries. If a verifier needs a server, the task starts it
   on an allocated port against local fixtures.
5. Kill servers you start. The verifier command must trap EXIT and stop
   background processes, or use a single foreground process the timeout can
   kill. A verifier that leaks a port fails review.
6. No secrets. Instructions, fixtures, and verifier commands must contain no
   credentials, tokens, or credential-shaped strings — `secret-scan.mjs`
   scans the worktree and will fail the task.
7. Deterministic instructions. Pin file paths, exact commands, and expected
   end state. No "improve", "consider", or "as appropriate". Two runs of the
   same task must be comparable (see `HARNESS.md` section 4).

## 3. Worked mini-example

Guard task around an existing unit file. `src/lib/account-tab.ts` is covered
by `src/lib/account-tab.test.ts` (pure asserts, no jsdom). The task pins the
behavior: the agent may refactor the helper but the contract stays green.

`harness/tasks/guard-account-tab.json`:

```json
{
  "id": "guard-account-tab",
  "title": "account-tab helper contract holds",
  "instruction": "Refactor src/lib/account-tab.ts without changing behavior. Do not edit src/lib/account-tab.test.ts. Acceptance: `npx vitest run src/lib/account-tab.test.ts` exits 0.",
  "kind": "guard",
  "cost": "fast",
  "environment": { "worktree": true },
  "verifier": [
    {
      "command": "npx vitest run src/lib/account-tab.test.ts",
      "timeout_sec": 120
    },
    { "command": "node scripts/secret-scan.mjs", "timeout_sec": 120 },
    { "command": "node scripts/sast-scan.mjs", "timeout_sec": 180 }
  ],
  "reward": { "mode": "all-pass" }
}
```

Before shipping: ran the first verifier on the base branch (exit 0),
confirmed `secret-scan`/`sast-scan` pass on the untouched worktree, and kept
`cost: fast` because nothing binds a port or launches a browser.

## 4. How to run

All commands from the repo root. The runner never touches the base checkout;
it creates and removes task worktrees.

```bash
node harness/run.mjs --list            # list registered tasks, no worktree
node harness/run.mjs guard-account-tab --verify-only   # verifiers in the current tree, no worktree
node harness/run.mjs guard-account-tab                # full run: worktree + verifiers + trace
node harness/run.mjs guard-account-tab --setup        # provision env only, print env JSON for an external agent
node harness/run.mjs guard-account-tab --score env.json  # verify a setup env, emit trace, always cleanup
node harness/run.mjs --self-test       # harness health check, expect 11/11
```

- `--verify-only` is the pre-ship check for rules 1–2: it runs the task's
  verifier in the current tree (no worktree) and prints the trace including
  per-verifier exit codes.
- A full run writes its trace to `harness/traces/` per `HARNESS.md`
  section 5. Read the trace's `reward` and `rewardNote`; do not re-derive the score.
- If `--self-test` reports anything other than 11/11, stop
  authoring and fix the harness first. A task cannot be trusted under a
  failing harness.
