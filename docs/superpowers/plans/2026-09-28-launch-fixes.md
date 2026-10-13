# Launch-Blocker Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three launch conditions: (1) edge custom-cert skew made self-healing or self-reporting without SSH; (2) the 8 pre-existing test failures fixed (suite fully green); (3) CI gains a blocking build job (and E2E harness assessed).

**Architecture:** App-side resilience + observability for edge (no edge SSH available); test fixes at root cause per file; CircleCI pipeline extension.

**Tech Stack:** TypeScript ESM, Vitest, CircleCI, shell runbooks. No new deps.

**Spec:** Launch verdict 2026-09-28 + DEPLOY.md edge sections + `ops/edge/` provision flow.

## Global Constraints

- Bun ESM, no `require()`; TDD red→green (failures already reproduce — record pre-fix output); zero NEW violations vs origin/main per file.
- No `.github/` changes (CircleCI only — `.circleci/config.yml` edits EXPECTED here).
- Work in `/tmp/opencode/launch-fixes` @ `56d2a2a`; separate branches per stream (`fix/edge-cert-resilience`, `fix/red-tests`, `fix/ci-build-gate`); push branches (merge/deploy on user go-ahead only).
- Never fix a failing test by weakening its assertion — root-cause the code or prove the expectation stale with theme/lock evidence (like the songoskriti pin precedent).

## Review Focus

- Edge: every new check/alert must distinguish app faults from edge faults (cert-subject sampling, not just HTTP codes); no new outbound load that could trip LE rate limits (max 1 verification sweep per deploy, cached results).
- Tests: each of the 8 files green for the right reason (behavior fixed or stale expectation updated with lock evidence — never `skip`/`todo`).
- CI: build job actually blocks (fail the pipeline when `bun run build` fails — verify YAML semantics, don't just append a step).

---

### Stream A: Edge cert skew — resilience without SSH

- [ ] Map the provision flow end-to-end (`edge-provision.server.ts`, `ops/edge/framique-cert-issue.sh`, verify-sni, haproxy reload, DOMAIN_EDGE_* vars): where does a per-replica miss originate, what retries exist, what observability exists (metrics/logs/alerts for wrong-cert serving)?
- [ ] Implement the highest-leverage app-side fix available WITHOUT edge SSH. Candidates (investigate, pick by evidence): post-issuance multi-perspective verification (verify the domain's served cert from N vantage checks before marking `active`); wrong-cert detection + alert (Prometheus metric + runbook link); deploy-gate cert-subject assertion for the primary host (fail the gate on wrong-cert, not just curl-60 retries); cooldown/rate-limit guards so verification never trips LE limits.
- [ ] If NOTHING app-side is both safe and effective, stop after detection + alerting + runbook, and say so with line-level evidence.
- [ ] Tests for new logic; commit; push branch.

### Stream B: The 8 red tests → green

Files (verified 2026-09-28 on clean tree): `openapi/openapi.spec.test.ts` (route→spec anti-drift), `src/lib/marketplace-songoskriti.test.ts` (seed/catalog consistency), `src/lib/phase2-theme-agnostic.test.tsx` (no raw theme vars), `src/lib/widget-metadata.test.ts` (prop hints), `src/lib/widget-registry.test.ts` (no raw colours), `src/components/store/PaymentMarks.test.tsx` (unknown-mark fallback), `src/components/builder/primitives/ProductCard.test.tsx` (44px targets), `src/lib/themes/songoskriti/wiring.test.ts` (newsletter CTA count).

- [ ] Per file: reproduce, root-cause (stale expectation vs real bug — fix the CODE if the test is right), minimal fix, GREEN. Never weaken assertions.
- [ ] Full suite must show 0 failures (minus skipped) at the end. Commit; push branch.

### Stream C: CI blocking build (+ E2E assessment)

- [ ] Add a blocking `bun run build` job to `.circleci/config.yml`, wired into the workflow before e2e so build-breaks can never land green again. Validate YAML (parseable; `circleci config validate` if CLI present).
- [ ] Assess E2E auto-activation: does `.e2e/playwright.config.ts` exist? If the harness is one small step from real, activate it; if it's a project, report scope + leave inactive with a written note. Do NOT fake-activate (a green-passing no-op gate is worse than an honest skip).
- [ ] Commit; push branch.
