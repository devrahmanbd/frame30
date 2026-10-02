# Spec Delta

## Purpose
Visual drag-and-drop page builder over a versioned theme AST, integrated with
Appearance › Customize and the Pages table, with drafts, publish gates,
rollback, and schedules exposed consistently (never RPC-only).

## Requirements

### Requirement: Draft → publish pipeline
Builder edits SHALL autosave to `theme_drafts`, commit immutable
`theme_versions`, and publish only through lint, translation (≥90% bn), font
licence, and budget gates.

#### Scenario: Publish blocked by lint
- **WHEN** a merchant publishes a template with lint errors
- **THEN** publish is refused listing the errors and the live version is
  unchanged

### Requirement: Rollback and schedules
Merchants SHALL roll back to any published version and schedule
publish/unpublish actions, all from builder UI surfaces.

#### Scenario: Rollback restores
- **WHEN** a merchant rolls back to version N
- **THEN** version N becomes live, custom code is restored, and the
  storefront cache is purged

### Requirement: Skin vocabulary per theme
Skinnable widgets SHALL resolve through the theme's closed skin sets with
unknown values falling back to the documented default, never crashing.

#### Scenario: Unknown skin falls back
- **WHEN** a section carries an unregistered skin string
- **THEN** it renders with the theme default skin
