# Phase 00 — Protocol & Design Baseline

> Anchor for the `docs/` tree: owns the docs-first protocol and the stabilized
> phase numbering (00–17). Companion to `PLAN.md` (build sequencing) and
> `design-system.md` (tokens + per-page Design Guidelines template).

## Strict guardrails

### 1. Money & orders
- Not applicable at protocol level — inherit from each phase's rails (money is
  integer BDT; `fmtBDT` for display; never floats).

### 2. Data & tenancy
- **We never** present invented limits, ratios, or retention windows in docs —
  every number must trace to a phase plan, a legal year table, or a measured
  budget (e.g. `design-system.md` §8); anything else stays a named `TBD` with an
  owner.

### 3. State transitions
- Every phase ships **one** agreed state machine, owned by its phase README;
  no parallel/locked copies drift in other docs.
- "Locked" means *not yet decided*, never a commitment: the stack is
  **swappable**, and docs must say so (see `SYSTEM.md` §3).

### 4. Vendors & data-export
- Protocol rule only: no phase doc may assume a vendor is permanent; each
  phase keeps a swap-out story (adapter, contract, or export path) or a named
  `TBD`.

### 5. Consent & privacy
- Behavior/trajectory collection (AI support data pipeline) requires
  GDPR-grade consent, PII-minimal logs, and a documented retention story —
  per `docs/09-analytics` and `docs/10-ai-support`.

### 6. Accessibility & performance
- Page specs must include the "Design guidelines — <page>" section per
  `design-system.md` §10 before implementation; a page without one is not
  ready for code.

### 7. Failure & recovery
- Orphaned specs (no owner, no phase) get rewritten or deleted — they never
  stay half-canonical, and docs are fixed *before* code when they conflict.

### 8. Testing gates
- No phase README ships without at least one E2E/verification check mapping
  back to `docs/15-e2e` suites; protocol changes re-check ALL phases they touch.

## Development guidelines

- Every surface change starts by reading the phase plan; planning docs are
  canonical and README conflicts get resolved in favor of the plan first.
- New surfaces must add their Design guidelines section (§10 template) to the
  phase README **before** implementation.
- Approved decisions live in this tree (`docs/00-meta`) — never in chat alone.
- When a phase changes its stack/vendor/limits, re-verify 2: "no invented
  numbers" and "no orphaned sections" apply across the whole tree.