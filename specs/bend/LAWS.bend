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

# Law 7: CMS Draft Secrecy
# For any document in draft status, public storefront visibility evaluates to 0.
law law_cms_draft_secrecy:
  {is_cms_public(Draft{}) == 0 : U32}

# Law 8: CMS Scheduled Content Secrecy
# For any scheduled document before release, public storefront visibility evaluates to 0.
law law_cms_scheduled_secrecy:
  {is_cms_public(Scheduled{}) == 0 : U32}

# Law 9: CMS Published Visibility
# For any published document, public storefront visibility evaluates to 1.
law law_cms_published_visibility:
  {is_cms_public(Published{}) == 1 : U32}

# Law 10: CMS Archived Content Secrecy
# For any archived document, public storefront visibility evaluates to 0.
law law_cms_archived_secrecy:
  {is_cms_public(Archived{}) == 0 : U32}

# Law 11: CMS Tenant Boundary Isolation
# Cross-tenant document access evaluates to 0 (denied).
law law_cms_tenant_boundary_isolation:
  {check_tenant_boundary(False{}) == 0 : U32}

# Law 12: CMS Same-Tenant Access Authorization
# Same-tenant document access evaluates to 1 (allowed).
law law_cms_same_tenant_access:
  {check_tenant_boundary(True{}) == 1 : U32}

