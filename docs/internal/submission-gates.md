# Submission gates runbook (staff only)

Last verified 2026-09-26.

This runbook is the only document a reviewer needs besides the gate
output itself. Follow it top to bottom for every third-party
submission: run the copy-pasteable commands for the submission type,
apply the green criteria, work the human checklist for what machines
cannot check, then approve, suspend, or send back. Normative
author-facing guides live in the
[third-party developer index](../developers/README.md); contract
semantics live in the [SDK contracts](sdk-contracts.md) note.

## 1. Theme submissions

Run both commands from the repository root. The first exercises the
shipped themes (wiring, skins, preview, widget resolution, and studio
twin parity); the second exercises the third-party scaffold that
mirrors those gates.

```bash
npx vitest run src/lib/themes/songoskriti src/lib/themes/somvabona src/lib/studio/catalog.test.ts
```

```bash
npx vitest run examples/starter-theme/starter-theme.test.ts
```

Gate entry points, one per suite:

| Suite                      | Entry point                                | Pin                                               |
| -------------------------- | ------------------------------------------ | ------------------------------------------------- |
| Songoskriti wiring         | `describe("songoskriti wiring")`           | `src/lib/themes/songoskriti/wiring.test.ts:9`     |
| Songoskriti skins          | `stays token-driven` test                  | `src/lib/themes/songoskriti/skins.test.ts:182`    |
| Songoskriti preview        | `describe("songoskritiPreviewSource")`     | `src/lib/themes/songoskriti/preview.test.ts:12`   |
| Songoskriti widget audit   | `describe("songoskriti widget gap audit")` | `src/lib/themes/songoskriti/widgets.test.ts:11`   |
| Somvabona scaffold         | `describe("somvabona scaffold")`           | `src/lib/themes/somvabona/wiring.test.ts:8`       |
| Somvabona skins            | `describe("SOMVABONA_WIDGET_DEFAULTS")`    | `src/lib/themes/somvabona/skins.test.ts:35`       |
| Somvabona skins token gate | `is token-driven` test                     | `src/lib/themes/somvabona/skins.test.ts:167`      |
| Studio twin parity         | `describe("studio twin parity")`           | `src/lib/studio/catalog.test.ts:837`              |
| Starter theme (5 gates)    | `locks brand tokens` test                  | `examples/starter-theme/starter-theme.test.ts:44` |

Expected green output at HEAD: 8 files and 491 tests pass on the
first command; 5 tests pass on the second. Any failure is a
rejection, not a judgment call: point the author at the failing
suite and the corresponding section of the
[theme authoring guide](../developers/themes.md).

Theme-specific red lines:

- A `skins.css` file containing a hex literal fails the token-driven
  gate. Theme stylesheets may read only `var(--theme-*)`.
- A widget type the theme emits that does not resolve through the
  studio catalog fails twin parity. Unresolvable types are
  uneditable in the studio.
- A preview source that returns empty arrays instead of `null` for
  unauthored templates fails the preview contract.
- Publishing is blocked below a Bengali coverage of
  `TRANSLATION_PUBLISH_FLOOR = 90`
  (`src/lib/builder-guardrails.ts:148`). Never accept English
  pasted into a Bengali field.

## 2. Plugin submissions

Run both commands from the repository root. The first exercises the
platform gates (lifecycle, acceptance, consent, bundle, emission);
the second exercises the third-party scaffold through its own
vitest project.

```bash
npx vitest run src/lib/plugin-lifecycle.test.ts src/lib/plugin-acceptance.test.ts src/lib/plugins-consent.test.ts src/lib/plugin-bundle-gate.test.ts src/lib/plugin-emission.test.ts
```

```bash
npx vitest run --config examples/starter-plugin/vitest.config.ts
```

Gate entry points, one per suite:

| Suite             | Entry point                                   | Pin                                                  |
| ----------------- | --------------------------------------------- | ---------------------------------------------------- |
| Lifecycle         | `describe("suspend machine (R2-5)")`          | `src/lib/plugin-lifecycle.test.ts:76`                |
| Acceptance        | Hook-to-scope gate matrix                     | `src/lib/plugin-acceptance.test.ts:136`              |
| Consent           | `describe("R2-1 consent evidence ...")`       | `src/lib/plugins-consent.test.ts:51`                 |
| Bundle gate       | `describe("install-path bundle gate (R2-7)")` | `src/lib/plugin-bundle-gate.test.ts:32`              |
| Emission          | `describe("R2-4 emission contract")`          | `src/lib/plugin-emission.test.ts:152`                |
| Starter manifest  | `parses clean with no errors` test            | `examples/starter-plugin/tests/manifest.test.ts:20`  |
| Starter bridge    | `allows shop.info ...` test                   | `examples/starter-plugin/tests/bridge.test.ts:21`    |
| Starter lifecycle | `install: the namespaced widget key resolves` | `examples/starter-plugin/tests/lifecycle.test.ts:38` |

Expected green output at HEAD: 5 files and 53 tests pass on the
first command; 3 files and 31 tests pass on the second. Any failure
is a rejection: point the author at the failing suite and the
corresponding section of the [plugin guide](../developers/plugins.md).

Plugin-specific red lines:

- The manifest must pass `parseManifest`
  (`src/lib/plugin-manifest.ts:191`). Unknown scopes, invented
  hooks, non-HTTPS `hooksUrl` values, and over-budget manifests
  fail there first.
- The declared builder API must satisfy the running builder:
  `BUILDER_API_VERSION` is `3.1.0`
  (`src/lib/plugin-manifest.ts:18`), so the manifest declares
  `^3.0.0` and stays on major 3.
- Requested scopes must be the minimum the feature needs. A display
  widget asking for `read_customers` is rejected on sight.
- The entry bundle must stay under 512 KB with no `eval(`,
  `import(`, or `new Function` sequences.
- Hook payloads are PII-minimal by construction. Payloads carrying
  emails, phone numbers, or names fail emission tests.

## 3. API and SDK surface changes

Any submission or platform change that touches the public REST
surface must also pass the OpenAPI anti-drift gate, which asserts
that every route file maps to the machine-readable contract in
[`openapi/openapi.yaml`](../../openapi/openapi.yaml):

```bash
npx vitest run openapi/openapi.spec.test.ts
```

Gate entry points:

| Suite                | Entry point                               | Pin                                |
| -------------------- | ----------------------------------------- | ---------------------------------- |
| Spec parses          | `describe("openapi spec parses")`         | `openapi/openapi.spec.test.ts:76`  |
| Filesystem coverage  | `describe("filesystem-vs-spec coverage")` | `openapi/openapi.spec.test.ts:106` |
| Endpoint spot-checks | `describe("endpoint spot-checks")`        | `openapi/openapi.spec.test.ts:147` |

Expected green output at HEAD: 13 tests pass. A new route file with
no spec path, or an `x-source-file` marker pointing at a missing
file, is a rejection until the contract is updated.

## 4. What machines cannot check

Gates prove conformance, not quality. For every submission, work
this human checklist before approving:

1. **Design judgment.** Does the theme look intentional: spacing,
   typography, hierarchy? Does the plugin widget sit comfortably in
   its declared slots without clipped or overflowing frames?
2. **Copy quality.** Is user-facing copy free of typos, placeholder
   text, and invented metrics, ratings, or addresses? Is money
   display BDT-first with symbol and Latin digits?
3. **Bengali coverage.** The gate enforces the 90 percent floor, but
   only a human can judge whether the Bengali reads naturally or is
   machine filler.
4. **Brand safety.** No trademark violations, no impersonation of
   the platform or other sellers, no deceptive pricing or trial
   claims. Plugin listings that self-bill subscriptions must state
   the billing model, trial length, and cancel path on the listing.
5. **Scope honesty.** Does the plugin's listing copy match what the
   scopes actually unlock? Extra scopes cost conversion on the
   **Consent** screen and erode merchant trust.
6. **Secret hygiene.** No real-looking credentials in examples,
   screenshots, or sample payloads. Placeholders such as `<TOKEN>`
   only.

## 5. Approval steps

1. Confirm the gate commands in section 1, 2, or 3 are green for
   the submission type. Save or quote the output with the review.
2. Work the human checklist in section 4 and record the verdict
   per item.
3. Moderate the submitted version with `reviewVersion`
   (`src/lib/marketplace-vault.server.ts:208`). The status path is
   `draft → review → active`, with `paused` and `archived` for
   moderation. Only `active` listings install, and installs pin the
   reviewed version.
4. For theme publishes, confirm the server-side publish checks ran
   clean: `lintTemplate` per key
   (`src/lib/themes.server.ts:395`), the translation gate
   (`src/lib/themes.server.ts:401`), then `composePublishGate`
   (`src/lib/themes.server.ts:419`).

## 6. Kill-switch and suspend procedure

Use this procedure when a shipped plugin misbehaves (envelope
breach, scope abuse, review regression, operator decision).

1. **Per-merchant suspend first** when the blast radius is one
   store: `suspendPlugin`
   (`src/lib/plugin-lifecycle.server.ts:42`) with one of the
   recorded reasons (`scope_revoked`, `envelope_breach`,
   `review_regression`, `kill_switch`, `operator`). Suspend is
   idempotent and writes a `plugin.suspended` audit row.
2. **Platform kill switch** when the blast radius is every install:
   `setPluginKillSwitch`
   (`src/lib/plugins.server.ts:325`). Engaging it auto-suspends
   every merchant install with reason `kill_switch`. Releasing it
   does not auto-resume; each merchant resumes individually through
   `resumePlugin` (`src/lib/plugin-lifecycle.server.ts:90`).
3. **Resume** only after the cause is fixed and the gates in
   section 2 are green again. Resuming an active install fails
   closed, so confirm the suspended state first.
4. **Uninstall and purge** when the plugin must leave the store:
   `uninstallWidgetInstall`
   (`src/lib/marketplace-install.server.ts:455`) parks the ledger
   row on `uninstalling` and enqueues the durable `plugin.purge`
   job, which lands the ledger on terminal `purged` and writes
   exactly one `plugin.purged` audit row
   (`src/lib/plugin-lifecycle.server.ts:156`). Reruns are safe
   no-ops (`already_purged`).

## 7. Resubmission path

1. Tell the author exactly which gate or checklist item failed and
   link the failing suite file from the tables above.
2. The author bumps `version` with semver on every resubmission,
   rejections included, and never renames `key` after first
   publish. New versions are content-addressed: resubmitting
   identical bytes returns the existing row instead of creating a
   duplicate (`publishVersion`,
   `src/lib/marketplace-vault.server.ts:73`).
3. Breaking scope additions belong on a major bump. Updates that
   widen permissions need a fresh **Consent** screen
   (`reconsented: true`) or they are refused with
   `plugin_consent_required` (`src/lib/plugins.server.ts:138`).
4. Re-run the full gate commands for the submission type. Moving
   the install pin re-runs review from section 5.
