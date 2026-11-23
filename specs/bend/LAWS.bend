# =============================================================================
# Frame30 Human-Owned Correctness Laws (Bend 2)
# File: specs/bend/LAWS.bend
# Owner: @devrahmanbd (Human Specification Authority)
# Protected by CODEOWNERS - Coding agent modification forbidden without approval.
# Compiler: Bend 2.0.40 (Lean-backed BendTT kernel)
# =============================================================================

import Base

# Law 1: Responsive Precedence Cascade (Mobile Override is Authoritative)
# When a mobile override is set, resolving the responsive property returns the mobile value.
law law_responsive_cascade_mobile:
  for desk: U32
  for tab: U32
  for mob: U32
  {resolve_responsive(desk, Some{tab}, Some{mob}) == mob : U32}

# Law 2: Responsive Precedence Cascade (Tablet Fallback)
# When mobile override is None and tablet override is Some, resolving returns the tablet value.
law law_responsive_cascade_tablet:
  for desk: U32
  for tab: U32
  {resolve_responsive(desk, Some{tab}, None{}) == tab : U32}

# Law 3: Responsive Precedence Cascade (Desktop Baseline)
# When both mobile and tablet are None, resolving returns the desktop baseline value.
law law_responsive_cascade_desktop:
  for desk: U32
  {resolve_responsive(desk, None{}, None{}) == desk : U32}

# Law 4: Reset Inheritance Restoration
# Resetting an override on mobile deterministically restores resolution to the parent tablet override.
law law_reset_restoration_mobile:
  for desk: U32
  for tab: U32
  for mob: U32
  {resolve_responsive(desk, Some{tab}, reset_override(Some{mob})) == tab : U32}

# Law 5: Collection Self-Exclusion
# When a collection recommendation rail targets the active collection, it is redundant (1).
law law_collection_self_exclusion:
  {is_redundant_rail(True{}) == 1 : U32}

# Law 6: Intentional Cross-Sell Preservation
# When a collection recommendation rail targets a distinct collection, it is preserved (0).
law law_cross_sell_preservation:
  {is_redundant_rail(False{}) == 0 : U32}
