# Spec Delta

## Purpose
WordPress-style plugin lifecycle: tabular installed-plugins list with
Activate/Deactivate/Delete backed by working server paths, plus a searchable
add-new catalog with one-click install and instant activation.

## Requirements

### Requirement: Activate / Deactivate / Delete
Installed plugins SHALL support Activate, Deactivate (via
`plugin_state.enabled` toggle), and Delete (row removal + ledger status),
with scopes reconsent on widen and kill-switch suspension support.

#### Scenario: Deactivate keeps data
- **WHEN** a merchant deactivates a plugin
- **THEN** its row and settings persist with `enabled=false` and its
  storefront effects stop

### Requirement: No dead buttons
Every plugin action button SHALL have a working server path; suspend/resume
and purge convergence SHALL be pollable, not RPC-only.

#### Scenario: Purge converges
- **WHEN** a merchant uninstalls a plugin with queued jobs
- **THEN** plugin state plus undelivered queue rows are removed, the ledger
  reaches `purged`, and a `plugin.purged` audit row exists

### Requirement: Manifest consent
Installing or widening plugin scopes SHALL require merchant consent recorded
with actor and manifest version.

#### Scenario: Scope widen reconsent
- **WHEN** an update widens granted scopes
- **THEN** the plugin stays at prior scopes until the merchant reconsents
