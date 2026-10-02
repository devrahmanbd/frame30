# Spec Delta

## Purpose
WordPress-grade theme lifecycle: marketplace install creates an inactive
`store_themes` row plus ledger entry; merchants activate, live-preview, and
delete themes from an installed grid, with a browsable catalog for new installs.

## Requirements

### Requirement: Marketplace install creates inactive theme
Marketplace install SHALL create a new inactive `store_themes` row and never
mutate the active theme's draft, recording a `marketplace_installs` ledger row.

#### Scenario: Install from catalog
- **WHEN** a merchant installs a catalog theme
- **THEN** a new row with `is_active=false` exists, a ledger row with
  `status=installed` exists, and the live storefront is unchanged

### Requirement: Activate / Live Preview / Delete per theme
Every installed theme card SHALL offer Activate (switch `is_active`, keep the
published version coherent), Live Preview, and Delete (blocked while active,
cascading versions/drafts, ledger row to terminal status).

#### Scenario: Delete active theme refused
- **WHEN** a merchant deletes the active theme
- **THEN** the server refuses with a guidance error and no rows change

#### Scenario: Installed badge follows state
- **WHEN** the installed grid renders
- **THEN** the Installed badge reflects `is_active`/installed state, not mere
  ledger presence

### Requirement: Audit and isolation
Install, activate, and delete SHALL write append-only audit rows and obey
theme isolation (no `@/components/*` imports in theme prod files).

#### Scenario: Audit trail
- **WHEN** any lifecycle mutation succeeds
- **THEN** a `theme_audit` row exists with actor, before, and after
