# Theme updates, versioning, and rollback

Last verified: 2026-10-03 @ d95316b6

This guide answers the merchant question "what happens to my edits when the
theme updates": how versions work, what rollback promises, and which
overwrite rules protect merchant edits. For the authoring side read
[the third-party theme guide](themes.md); for the package contract read
[the theme package spec](../themes/packages.md); for the review rules that
gate new versions read [the review policy](review-policy.md).

## 1. Versioning (C9)

Every builder write lands in one of two places. `loadWorkspace` in
`src/lib/themes.server.ts:183-187` boots the editor from the newest autosave
draft when one exists, else the newest committed version
(`src/lib/themes.server.ts:221-225`). Drafts are mutable working state;
`theme_versions` rows are immutable snapshots shaped as `VersionRow`,
including the `rollbackOf` link that marks rollback-created versions
(`src/lib/themes.server.ts:149-158`). The workspace reads the newest 30
versions (`src/lib/themes.server.ts:191-204`).

Commits and publishes append, never rewrite: `commitVersion` snapshots the
draft, reusing the version when consecutive drafts are identical
(`src/lib/themes.server.ts:373-380`), and `publishVersion` lints, gates,
commits, snapshots custom code, then moves the publish pointer
(`src/lib/themes.server.ts:418-477`).

Marketplace listing versions use strict semver instead of integers:
`parseSemver` in `src/lib/marketplace-scopes.ts:155-159` accepts
`major.minor.patch` digits only, and `isForwardVersion` in
`src/lib/marketplace-scopes.ts:168-173` requires every submission to move
forward. The update preview compares the installed version against the
registry package and reports whether an update is available plus a
section-level diff (`src/lib/themes.server.ts:895-927`).

## 2. Rollback promise (C9)

Rollback restores any retained version as a new version — history is never
rewritten. `builderRollbackFn` in `src/lib/themes.functions.ts:78-89`
requires the `themes.publish` permission
(`src/lib/themes.functions.ts:81`), so update-only roles cannot restore
versions; the builder UI imports it through the workspace module
(`src/lib/builder-workspace.functions.ts:16`, re-exported with the other
workspace functions in `src/lib/builder-workspace.functions.ts:11-18`).

`rollbackVersion` in `src/lib/themes.server.ts:486-492` first checks the
version belongs to the calling merchant and fails closed otherwise
(`src/lib/themes.server.ts:498-508`), then calls the `theme_rollback` RPC
(`src/lib/themes.server.ts:509-511`). The RPC inserts the target's content
as a new `theme_versions` row stamped `rollback of v<n>`
(`migration/0019_phase2e_theme_engine.sql:146-156`) and refreshes the draft
to the rolled-back content so the workspace reopens on it
(`migration/0019_phase2e_theme_engine.sql:158-163`; intent documented in
`migration/0019_phase2e_theme_engine.sql:125-127`).

What survives a rollback:

- Store content survives. The RPC touches only `theme_versions` and
  `theme_drafts` (`migration/0019_phase2e_theme_engine.sql:146-163`);
  products, collections, posts, pages, and media are never in its write set.
- Customizations ship with the version. Publish snapshots merchant CSS/JS
  onto the version (`src/lib/themes.server.ts:475-476`; snapshot logic in
  `src/lib/custom-code.server.ts:178-183`, and secret-scan or XSS findings
  block the publish in `src/lib/custom-code.server.ts:193-204`), and
  rollback restores that snapshot into the draft
  (`src/lib/themes.server.ts:520-524`; restore logic in
  `src/lib/custom-code.server.ts:233-252`).
- Uncommitted draft edits do not survive. The draft is deleted and reseeded
  from the rollback target (`migration/0019_phase2e_theme_engine.sql:158-163`),
  so anything autosaved after the target version is replaced. Commit first
  if the draft matters.
- Cache follows immediately. Publish and rollback are the only paths that
  purge the storefront cache (`src/lib/themes.server.ts:397-406`), and
  rollback purges after restoring (`src/lib/themes.server.ts:525-531`).

TBD: no time-boxed one-click window exists in code — any owned version can
be restored regardless of age, and no retention or eviction policy for old
versions is pinned. Do not promise "within N days" until a window is
implemented.

## 3. Override story (C10)

Three layers of `overwrite = false` defaults protect merchant edits, and
each one is opt-in to destroy:

- Installing a theme never mutates the active theme's draft. Installs
  create a new inactive theme row with its own version, draft, ledger, and
  audit entries, and the `overwriteDraft` input on `builderInstallFn` is
  accepted for compatibility but ignored — re-installs replay instead of
  throwing (`src/lib/themes.functions.ts:140-144`). The registry path
  likewise defaults to `overwriteDraft = false`
  (`src/lib/themes.server.ts:710-714`), passes it to the install RPC as
  `_overwrite_draft` (`src/lib/themes.server.ts:739`), and only replaces an
  existing draft when the merchant confirms
  (`src/lib/themes.server.ts:704-708`).
- Demo-content imports default to `overwrite = false` and skip what already
  exists: media (`src/lib/theme-imports.server.ts:366-377`), products
  (`src/lib/theme-imports.server.ts:421-434`), posts and pages
  (`src/lib/theme-imports.server.ts:514-525`), and the combined import
  (`src/lib/theme-imports.server.ts:567-581`). Passing `overwrite = true`
  first removes exactly the conflicting rows so the re-import replaces
  instead of nooping (`src/lib/theme-imports.server.ts:369-377`).
- Registry updates merge, never clobber. `builderUpdateApplyFn` takes a
  `mode` of `adopt` or `keep_mine` (`src/lib/themes.functions.ts:179-188`).
  `adopt` takes the new package as the base and keeps merchant-only
  sections; `keep_mine` keeps the merchant tree and appends only genuinely
  new sections (`src/lib/themes.server.ts:838-892`). Tokens follow the same
  split: `adopt` takes the package tokens, `keep_mine` keeps the merchant's
  (`src/lib/themes.server.ts:961`).

Two guardrails cover the update itself. Autosave is last-writer-wins behind
a monotonic client revision (`src/lib/themes.server.ts:346-357`), so the
preview diff is computed against live state — and `applyThemeUpdate`
carries the preview's `expectedRevision` through to the RPC, so a
concurrent editor cannot have their work silently merged away
(`src/lib/themes.server.ts:929-933`, enforced as `_expected_revision` in
`src/lib/themes.server.ts:962-974`). Merged templates are re-linted and a
failing merge is rejected before anything is written
(`src/lib/themes.server.ts:948-960`).

TBD: the **Restore** click path in the builder UI (which version-picker row
maps to `builderRollbackFn`) is UI behavior not pinned here; the server
contract above is what the button must call.
