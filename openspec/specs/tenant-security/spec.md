# Spec Delta

## Purpose
Multi-tenant isolation and platform security: `merchant_id` tenancy with RLS,
capability-gated console nav, self-hosted Supabase/Redis, secret hygiene,
and owner-console controls — verified by the tenant_isolation suite.

## Requirements

### Requirement: Tenant predicate on every write
Every server mutation SHALL scope reads and writes by `merchant_id` with RLS
policies plus explicit GRANTs, and fail closed without a tenant.

#### Scenario: Cross-merchant read denied
- **WHEN** a caller requests another merchant's drafts, versions, or plugin
  state
- **THEN** the request is denied and logged, with no data returned

### Requirement: Capability-gated nav with server enforcement
Console nav SHALL be permission-filtered for display while every server
function independently enforces `requirePermission`.

#### Scenario: Hidden route still guarded
- **WHEN** an actor without `themes.update` calls the activate function
  directly
- **THEN** the call is refused regardless of nav visibility

### Requirement: Secret hygiene
Live secrets SHALL live in server env only, never in the repo, logs, error
bodies, or metric labels; leaked keys are rotated and history is cleaned.

#### Scenario: Secret scan gate
- **WHEN** `secrets:scan` runs in CI
- **THEN** it blocks on any committed secret pattern
