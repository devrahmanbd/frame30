# Proposal: custom theme components + adversarial package security program

## Why

Custom themes and plugins are merchant-uploaded ZIPs from arbitrary
publishers, including trusted-looking ones. The current posture is strong
at the archive boundary (parser, layout, manifest, quotas, broken-ref
refusal) and at render time (neutralizers, null-origin sandbox, CSP), but
gaps cluster in five places: no repository SAST gate, advisory-only
dependency audit, regex-only JS checks, no CSS semantic gate in the ZIP
validator, no runtime resource budgets, and no platform-level actor
attribution. Separately, custom packages cannot ship arbitrary
React/TypeScript components today — they are constrained to declarative
contracts — and any flexibility expansion must not reopen server-side
execution.

This proposal supersedes
`openspec/changes/official-packages-builtin-model` (which describes the
replaced architecture where official themes installed through
`installPackage`; Frame30 moved official themes to source-init installs).
That change is archived, not deleted, for history.

## Definition of complete

1. Custom packages stay declarative-only: no arbitrary uploaded
   server-side execution, no React/TS/JS components outside the
   documented widget/presentation contracts.
2. Two detection systems run green and blocking: repository SAST +
   suspicious-diff checks in CircleCI, and quarantine scanning of every
   custom package version before activation.
3. The P0/P1 table below is either implemented (with tests + pins) or
   explicitly recorded as accepted risk with an owner and review date.
4. The official-plugin question (§5) is decided one way and the code
   matches the decision.

## What changes

### A. Custom component contract (declarative boundary)

- Custom themes declare: closed widget vocabulary (`WIDGET_TYPES`,
  `src/lib/widget-registry.ts:951`), closed read-only theme
  capabilities (`src/lib/theme-package.ts:27-36`, `render_storefront`
  required), templates/locales/styles/assets only. No component code.
- Custom plugins declare: manifest + inline widget `entry` JS (already
  gated), hooks, settings, slots. Executable content stays inside the
  null-origin island + scoped bridge only.
- Greater flexibility comes from a richer declarative API, phased:
  (1) more section/widget types through the existing registry process,
  (2) expanded settings schema kinds, (3) theme↔widget presentation
  contracts (`plugin-theme-contract.ts`), (4) layout composition
  primitives. Never uploaded components; each phase ships with
  validator + render support together so the two cannot drift.

### B. P0 findings → corrections

| #    | Finding (verified)                                                                                                 | Correction                                                                                                                                                                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0-1 | No repository SAST gate; secret scan cannot catch backdoors/unsafe auth changes                                    | New blocking CircleCI job: SAST over changed code + full repo, plus suspicious-diff checks (eval/dynamic execution, unsafe HTML sinks, network calls, shell/process, secret access, CSP/sandbox edits, permission/tenant-scope/RLS changes, removed checks, skipped tests, new deps, new external endpoints). Fail-closed list in §D.                  |
| P0-2 | `scan:deps` runs `bun run scan:deps \|\| true` (`.circleci/config.yml:77`) — high/critical findings leave CI green | Make high/critical blocking; reviewed expiring exceptions file (owner + expiry per exception, CI fails on expired). First run triages current findings.                                                                                                                                                                                                |
| P0-3 | Package scanner covers secrets + scriptable SVG only; external URLs informational                                  | Language-aware scanning for package text (JS/JSON/CSS/HTML/SVG): dangerous sinks, obfuscation signals, unexpected endpoints, credential patterns; semantic manifest validation. Scanner version recorded per scan; clean ≠ safe stays documented.                                                                                                      |
| P0-4 | No CSS semantic gate in ZIP validator                                                                              | Parse CSS at install (AST, not regex): restrict to allowlisted properties/at-rules, namespace selectors to the package, block unauthorized external `@import`/`url()` (fonts/images from an explicit allowlist only), keep the existing `scopeCss` contract as the floor.                                                                              |
| P0-5 | Scriptable SVG flagged, merchant-approvable                                                                        | Policy decision required (§E): either categorical SVG sanitization-or-reject in custom packages, or flagged-with-approval retained with the rule that only a platform security reviewer (not the uploading merchant) clears a confirmed high-risk finding.                                                                                             |
| P0-6 | Entry JS gates are regex (`parseManifest`, `validateBundle`)                                                       | AST-based checks as defense in depth (parse entry to AST, deny dynamic-code node types: `eval`, `Function`, static+dynamic `import`, `setTimeout(string)`, `innerHTML` assignment, `document.write`); keep regexes as the cheap first pass; runtime isolation unchanged.                                                                               |
| P0-7 | Budgets are manifest-declared; iframe ≠ CPU protection                                                             | Enforce runtime/execution-time/lifecycle limits: bridge message budgets already exist (`bridge-flood-guard`); add frame CPU watchdog (long-task/infinite-loop detection with isolate-and-disable), message-rate tests, resource-exhaustion adversarial cases.                                                                                          |
| P0-8 | No actor attribution                                                                                               | Code: CODEOWNERS exists at repo root (human layer); add required CircleCI security checks as merge requirements + security-sensitive reviewer rules; attribution = GitHub authenticated actor + review + audit records (never bare git author, spoofable). Report "PR introduced high-risk change", never auto-accuse. Signed commits where practical. |

### C. P1 findings → corrections

| #    | Finding                                                                                     | Correction                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1-1 | Hook/webhook egress: initial-URL validation only; redirects/DNS-rebinding unconstrained     | `redirect: "manual"` + revalidate every `Location` against the egress guard; resolve-and-pin or connect-time IP check; converge merchant webhooks onto `isAllowedHooksUrl` with delivery-time recheck. |
| P1-2 | Review policy C6 rules are human-only by explicit design                                    | Convert the convertible subset (payments-logic markers, tracking-pixel patterns, auth-form widgets, SEO-meta writes) into install/publish gates; keep genuinely judgmental calls human with SLA.       |
| P1-3 | Official-plugin distribution vs agreed model (§E decision)                                  | Decide explicitly; implement the decision; update `docs/packages/contract.md` §3.3 and this proposal.                                                                                                  |
| E2E  | `e2e-critical` passes when the Playwright harness is absent (`.circleci/config.yml:96-105`) | A missing harness must fail the security/marketplace acceptance gate (or the gate must be marked skipped-not-passed). Never count absent-harness green as verification.                                |

### D. Detection system 1 — repository SAST + suspicious diff (CircleCI)

1. New blocking job (after `scan`, before `build`): SAST over changed files (PR diff) + full-repo baseline; suspicious-diff rules per P0-1 list.
2. Findings report per item: severity, file, line, commit SHA, PR, repo account, reviewer, exact hunk.
3. Security-sensitive paths requiring independent review: `package-zip.ts`, `package-scan.ts`, `WidgetSandbox.tsx`, `marketplace-scopes.ts`, `tenant-scope.ts`, authN/Z, RLS policies/migrations. CODEOWNERS already names collision files; extend to these.
4. Findings never auto-accuse authors; identity evidence = GitHub actor + approvals + audit trail.

### E. Detection system 2 — package quarantine (per version, immutable)

1. Quarantine every upload; scan exact immutable bytes (SHA-256 pinned) before activation: JSON contracts, CSS AST, URLs, SVG (sanitize-or-reject per P0-5 decision), JS AST, manifest + permissions.
2. Reject executable themes and unsafe assets; never try to make arbitrary code safe.
3. Adversarial tests run against the production-equivalent iframe + bridge (already established pattern: `bridge-flood-guard`, `WidgetSandbox.bridge`).
4. **Decision required — official plugins:** (a, recommended) keep source-built internal install through the shared pipeline as the _security contract_ (sandbox, capabilities, lifecycle, versioned assets all live there; bypassing it weakens guarantees) while documenting that distribution is source-internal with no downloadable artifact; or (b) build a source-direct plugin install duplicating ledger/version/asset/projection behavior. (a) preserves all guarantees with zero new machinery; (b) costs a parallel lifecycle. Either way, no merchant-visible change.
5. Block confirmed high-risk packages; only a platform security reviewer resolves documented false positives — uploading merchants cannot override confirmed findings (requires an approval-role distinct from merchant; wire into the existing `theme.approved`/`plugin.approved` audit with reviewer identity).
6. Immutable audit per version: uploader identity, merchant ID, package ID/version, SHA-256, scan result, scanner version, reviewer identity. Updates re-scan fully; bytes under an approved version never change silently (checksum compare at every touchpoint).

### F. Attribution and containment

- GitHub-side (no Actions workflows per repo rule — CircleCI only): protected branches, required PR reviews, required CircleCI security checks, CODEOWNERS reviewer rules for §D.3 paths, signed commits where practical.
- Emergency: existing kill switch + suspend + uninstall + rollback stay the containment path; every disable/revoke records package/version identity + reason code, never credentials or payloads.

## What does not change

Archive parser and layout gates, tenant isolation model, Class A/B plugin contracts, null-origin sandbox island + scoped bridge, official source-theme architecture (Frame30), legitimate custom-theme export/import, the marketplace moderation queue, RLS policies (unless a finding requires it — then as its own reviewed change).

## Status inputs (verified 2026-10-11, branch `frame30`)

- `scan` job: secret scan blocking, dep audit `|| true` (`.circleci/config.yml:67-77`).
- E2E skip-when-harness-missing (`.circleci/config.yml:96-105`).
- Review policy C6 human-only rules (`docs/developers/review-policy.md:18-58`); moderation queue exists (`marketplace-vault.server.ts:197-236`).
- Scanner coverage: secrets + svg-script (`src/lib/package-scan.ts`); entry regex gates (`plugin-manifest.ts:559`, `marketplace-scopes.ts:219-233`).
- Official plugin install builds internal bytes + `installPackage` (`official-plugins.server.ts:182-204`) — the P1-3 decision point.
- CODEOWNERS at repo root (human layer); no `.github/` dir (repo rule).

## Acceptance

- [ ] SAST + suspicious-diff job blocking in CircleCI with a first-green baseline.
- [ ] Dep audit blocking high/critical with a reviewed exceptions file.
- [ ] CSS AST gate + SVG policy decision implemented, tested, documented.
- [ ] AST-based JS entry checks with adversarial cases (obfuscation, aliases, static imports).
- [ ] Runtime budgets + exhaustion tests; bridge budgets retained.
- [ ] P1-1 egress verification (redirect + DNS) tested.
- [ ] P1-2 converted gates with the human remainder explicitly listed.
- [ ] P1-3/E decided, implemented, documented.
- [ ] E2E gate fails (or explicitly skips, never passes) without a harness.
- [ ] Attribution: protected branches + required checks + reviewer rules verified live.
- [ ] Declarative API phase 1 shipped with validator + render support (no uploaded components).
