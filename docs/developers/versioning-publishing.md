# Versioning, validation, and publishing

Last verified: 2026-10-06.

Audience: third-party developers shipping and updating themes and
plugins. Version numbers are promises the platform enforces: move
forward only, stay inside your declared range, and degrade to
placeholders and fallbacks — never crashes.

## One semver rule for everything

Versions are strict `major.minor.patch` digits
(`src/lib/marketplace-scopes.ts:155-159`):

- A new submission must move strictly forward from the latest known
  version (`isForwardVersion`,
  `src/lib/marketplace-scopes.ts:168-173`). Non-forward marketplace
  versions throw `market_version_not_forward`, while resubmitting
  identical bytes returns the existing row instead of a duplicate
  (see [review policy](review-policy.md#resubmission-and-semver)).
- Breaking scope additions belong on a major bump
  (`src/lib/marketplace-scopes.ts:175-181`).
- Theme resubmissions bump `version` with semver every time,
  rejections included, and never rename `key` after first publish
  (see [Theme guide](themes.md#submit-updates-without-breaking-stores)).

## Declare compatibility, stay on major 3

- The running builder API is `BUILDER_API_VERSION = "3.1.0"`
  (`src/lib/plugin-manifest.ts:18-29`). Declare `api: "^3.0.0"` (or
  `>=3.0.0 <4.0.0`); anything else (`latest`, `*`) is rejected, and
  only `^x.y.z` / `>=a.b.c <d.e.f` shapes validate
  (`src/lib/plugin-manifest.ts:311-330`).
- Incompatible installs resolve as `incompatible` and render the
  labeled placeholder (`src/lib/plugin-manifest.ts:664-683`).
- Keep `api` inside `^3.0.0` until the platform announces otherwise.

## Validation runs the same gate everywhere

`parseManifest` is the single gate the review pipeline, the install
flow, and the host all share
(`src/lib/plugin-manifest.ts:393-543`): passing it locally means
passing it everywhere. Validate settings the same way —
`validateSettings` coerces merchant input to the declared schema and
drops unknown keys, so a setting the merchant never saved arrives as
its default (`src/lib/plugin-manifest.ts:582-635`); `defaultSettings`
supplies those defaults
(`src/lib/plugin-manifest.ts:567-579`). Permission widening is
detected by `permissionDiff`, and any added permission requires a
fresh consent screen (`src/lib/plugin-manifest.ts:554-561`). The same
rule holds on the package install lane, where widening is
`diffCapabilities` (`src/lib/package-review.ts:168`), coverage is
`coversWidening` (`src/lib/package-review.ts:90`), and an uncovered
update fails with `package.consent_required`
(`src/lib/package-install.server.ts:730-738` for themes,
`:1092-1100` for plugins). Flagged content additionally needs a
recorded approval before it goes live (`theme.approved` /
`plugin.approved`; see [the package contract](../packages/contract.md)).

## Failure behavior: placeholders and fallbacks, never crashes

| Failure                                                        | Shopper sees                                                                                                            |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Bad key, missing/disabled/incompatible install, unknown widget | Labeled placeholder for exactly that reason (`src/lib/plugin-manifest.ts:650-683`)                                      |
| Unregistered theme presentation pair                           | Existing fallback resolution (`src/components/builder/SectionRenderer.tsx:272-275`)                                     |
| Undressed Class B widget                                       | Generic sandboxed island (`src/lib/plugin-theme-contract.ts:266-297`)                                                   |
| Unapproved / scope-denied / throwing menu swap                 | Theme default navigation (fail-open; `src/lib/plugin-manifest.ts:102-160`)                                              |
| Blocked publish gate                                           | Refused publish with the first five blocking messages (see [review policy](review-policy.md#per-gate-checklist-output)) |

## Last-good and backwards compatibility

- Theme publish moves `store_themes.published_version_id` via
  `theme_publish`, and rollback restores through `theme_rollback`
  (`src/lib/themes.server.ts:477`, `src/lib/themes.server.ts:509`):
  the published pointer is last-good by construction — a failed
  publish never moves it.
- Plugin installs pin the reviewed version; moving the pin re-runs
  review, and only `active` listings install (see
  [review policy](review-policy.md#human-scope)).
- The platform kill switch auto-suspends every merchant install with
  reason `kill_switch`; releasing it never auto-resumes, so recovery
  is explicit (see [Plugin guide](plugins.md#walk-the-install-consent-and-disable-lifecycle)).
- Backwards compatibility rule: additive changes only within a
  major. New scopes, hooks, slots, or contract versions arrive as
  new names with fallbacks for the old ones — never as silent
  reinterpretations. `satisfiesApiRange` keeps caret compatibles
  resolving while majors diverge
  (`src/lib/plugin-manifest.ts:311-330`).

Next: [Examples](examples.md).
