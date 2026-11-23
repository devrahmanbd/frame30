---
name: frame30-formal-verification
description: Project-local skill for formal verification, TLA+ state-space model checking, Bend 2 correctness laws, and Lean 4 mathematical proofs on Frame30.
---

# Frame30 Formal Verification Skill

This skill guides coding agents through executing, maintaining, and reconciling formal models with production source code.

## 1. Target Property
- Responsive breakpoint precedence cascade (`desktop` -> `tablet` -> `mobile`).
- Override reset semantics (clearing device override deterministically restores parent inheritance).
- Device isolation (mutating mobile override never alters desktop baseline or tablet configuration).
- Collection merchandising self-exclusion (`active_slug == rail_slug` -> rail omitted).
- Intentional cross-sell preservation (`active_slug != rail_slug` -> rail preserved).
- Integer minor-unit arithmetic and pricing non-negativity.
- Autosave concurrency and revision order.

## 2. Production Source Coverage
- `src/lib/responsive.ts` (resolveResponsiveProp, cleanEmptyBreakpoints)
- `src/lib/collection-composition.ts` (isRedundantCollectionRail, reconcileStorefrontCollectionSections)
- `src/lib/builder-ast.ts` (BreakpointProps, AST schema)
- `src/components/store/CollectionView.tsx`
- `src/components/store/ThemePreviewFrame.tsx`

## 3. Model/Proof Relationship
- **Bend 2 (`specs/bend/`)**:
  - `LAWS.bend`: Human-owned correctness laws.
  - `PROOF.bend`: Agent-owned proof implementation.
- **TLA+ (`specs/tla/`)**:
  - `ResponsiveAutosave.tla`: Concurrency and state machine verification.
  - `ThemeLifecycle.tla`: Schema migration and publication gates.
  - `CheckoutInventory.tla`: Concurrency and inventory reservations.
- **Lean 4 (`specs/lean/`)**:
  - `Pricing.lean`: Minor-unit arithmetic bounds.
  - `ThemeLifecycle.lean`: Idempotence and schema preservation.

## 4. Exact Commands
```bash
# Scope verification
bun run gate:scope

# Verification drift check
bun run gate:drift

# Bend 2 formal verification
bun run test:bend

# TLA+ TLC model checker
bun run test:tla

# Lean 4 formal refinement
bun run test:lean

# fast-check property suites
bun run test:properties

# Adversarial mutation sensitivity
bun run test:mutation
```

## 5. Toolchain Versions
- **Bend 2**: `bend-lang 0.2.38` with `hvm 2.0.22`
- **TLA+**: TLC2 Version 2026.11.15.002146 with OpenJDK 21
- **Lean 4**: `leanprover/lean4:v4.15.0` via `elan` and Lake 5.0.0

## 6. Bounds and Assumptions
- TLA+ model checks with `MaxRevisions = 3`, `PropDomain = {1, 2, 3, 4}` across all reachable states (~34,273 distinct states for autosave; ~3.2M states for checkout).
- Bend 2 execution uses Rust HVM interpreter (`run-rs`).
- Fast-check properties run with minimum 100 iterations per property.

## 7. Known Counterexamples
- Allowing string `"None"` in TLA+ with integer domain causes heterogeneous type error in TLC. Integer sentinel `NoneVal == 0` is required.
- Removing `isRedundantCollectionRail` causes duplicate product cards on `/c/sarees` and `/c/festive`.

## 8. Mutation Demonstration
Run the automated mutation sensitivity harness:
```bash
bun run test:mutation
```
Confirms fail-closed detection of 4 defect classes.

## 9. Last Synchronized Commit
- Synchronized Baseline: `7e8b3db1f00f3e53a8d4a318f373704a8896f7e4`
- Tracked in: `features/contracts/verification-manifest.json`
