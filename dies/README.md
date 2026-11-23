# Frame30 Permanent Die Registry

**Authority**: Human Specification Owner (`@devrahmanbd`)  
**Status**: Adopted Operating Registry (F30-SDLC-001)  

---

## What is a Frame30 Die?

A **Die** is not just a test file or a temporary pull request check. It is a permanent, versioned specification of an accepted product capability, backed by independent verification obligations.

Just as a physical manufacturing die stamps sheet metal into an exact shape every single time without drifting, a Frame30 Die stamps every future implementation into strict conformance with accepted behaviour.

Implementations may be refactored, optimized, or completely rewritten, but the new code must still pass through all existing dies. The product accumulates permanent, irreversible knowledge.

---

## The 8 Mandatory Components of Every Die

Every canonical die file (`dies/<die_id>/die.json`) must contain:

1. **Requirement**: What the capability accomplishes from the merchant/shopper perspective.
2. **Protected Behaviour**: Invariants that must continue working under all future refactors.
3. **Forbidden Behaviour**: Specific failure modes that are strictly prohibited (e.g., losing mobile overrides on reload, duplicate rails).
4. **Formal Laws**: Pure mathematical properties stated in Bend 2 (`LAWS.bend`) or Lean 4.
5. **Executable Model**: An independent reference implementation acting as the oracle.
6. **Conformance Obligations**: Automated test suites linking the production implementation to the model.
7. **Adversarial Checks**: Deliberate mutation tests proving that the verification suite catches defects.
8. **Regression Requirements**: Explicit dependencies on previously accepted dies that must remain unbroken.

---

## Active Dies Index

| Die ID | Version | Domain | Capability Name | Status |
|---|---|---|---|---|
| `DIE-001-responsive-precedence` | `1.0.0` | Theme Customizer / AST | Responsive Breakpoint Cascade & Reset Restoration | **PROTECTED PERMANENTLY** |
| `DIE-002-collection-composition` | `1.0.0` | Storefront Merchandising | Collection Rail Self-Exclusion & Cross-Sell Preservation | **PROTECTED PERMANENTLY** |
| `DIE-003-cms-tenant-isolation` | `1.0.0` | CMS & Tenancy | PostgreSQL Row-Level Security & Multi-Tenant CMS Isolation | **PROTECTED PERMANENTLY** |
| `DIE-004-cms-content-lifecycle` | `1.0.0` | CMS & Content | Content Lifecycle State Machine, Scheduled Publishing & Revision History | **PROTECTED PERMANENTLY** |
| `DIE-005-builder-widget-ast` | `1.0.0` | Page Builder & Themes | Builder AST Schema Validation, Responsive Prop Cascade & Studio Parity | **PROTECTED PERMANENTLY** |


---

## Registry Rules

1. **Monotonic Accumulation**: New capabilities add new dies; existing dies are **never** deleted, silently weakened, or downgraded.
2. **Amendment Policy**: A die can only be amended through an explicit, human-reviewed change contract with documented rationale and version increment.
3. **Fail-Closed Execution**: If any active die fails during verification, the release is halted immediately.
