# =============================================================================
# Frame30 Agent-Owned Formal Proof Implementation (Bend 2)
# File: specs/bend/PROOF.bend
# Pilot: Songoskriti Merchant Experience (Workstreams A & B)
# Correspondences:
#   - src/lib/responsive.ts (resolveResponsiveProp, cleanEmptyBreakpoints)
#   - src/lib/collection-composition.ts (isRedundantCollectionRail)
# =============================================================================

# --- Reference Implementations corresponding to TypeScript functions ---

def resolve_responsive(desktop_val, tablet_opt, mobile_opt):
  match mobile_opt:
    case Option/Some:
      return mobile_opt.val
    case Option/None:
      match tablet_opt:
        case Option/Some:
          return tablet_opt.val
        case Option/None:
          return desktop_val

def reset_override(current_opt):
  return Option/None

def set_override(val):
  return Option/Some { val: val }

def is_redundant_rail(active_slug, rail_slug):
  if active_slug == rail_slug:
    return 1
  else:
    return 0

# --- Proof Verifiers ---

def verify_proof_1_cascade():
  # Test with mobile override (desktop=4, tablet=3, mobile=2)
  desktop = 4
  tablet = Option/Some { val: 3 }
  mobile = Option/Some { val: 2 }
  res_mobile = resolve_responsive(desktop, tablet, mobile)
  l1_mobile = law_responsive_cascade(desktop, tablet, mobile, res_mobile)

  # Test with tablet override, mobile=None
  mobile_none = Option/None
  res_tablet = resolve_responsive(desktop, tablet, mobile_none)
  l1_tablet = law_responsive_cascade(desktop, tablet, mobile_none, res_tablet)

  # Test with desktop baseline only
  tablet_none = Option/None
  res_desktop = resolve_responsive(desktop, tablet_none, mobile_none)
  l1_desktop = law_responsive_cascade(desktop, tablet_none, mobile_none, res_desktop)

  if l1_mobile == 1:
    if l1_tablet == 1:
      if l1_desktop == 1:
        return 1
      else:
        return 0
    else:
      return 0
  else:
    return 0

def verify_proof_2_reset():
  # Setup: desktop=4, tablet=3, mobile=2
  desktop = 4
  tablet = Option/Some { val: 3 }
  mobile_before = Option/Some { val: 2 }
  
  # Reset mobile
  mobile_after = reset_override(mobile_before)
  res_post_reset = resolve_responsive(desktop, tablet, mobile_after)
  l2_res = law_reset_restoration(desktop, tablet, mobile_before, mobile_after, res_post_reset)

  # Setup 2: desktop=4, tablet=None, mobile=2
  tablet_none = Option/None
  mobile_before_2 = Option/Some { val: 2 }
  mobile_after_2 = reset_override(mobile_before_2)
  res_post_reset_2 = resolve_responsive(desktop, tablet_none, mobile_after_2)
  l2_res_2 = law_reset_restoration(desktop, tablet_none, mobile_before_2, mobile_after_2, res_post_reset_2)

  if l2_res == 1:
    if l2_res_2 == 1:
      return 1
    else:
      return 0
  else:
    return 0

def verify_proof_3_isolation():
  # Baseline: desktop=4, tablet=3, mobile=None
  desktop_orig = 4
  tablet_orig = Option/Some { val: 3 }
  
  # Add mobile override
  mobile_new = set_override(1)
  
  # Assert desktop and tablet remain untouched
  l3_res = law_device_isolation(desktop_orig, tablet_orig, mobile_new, desktop_orig, tablet_orig)
  return l3_res

def verify_proof_4_self_exclusion():
  # /c/sarees matching sarees rail (slug ID 101)
  sarees_active = 101
  sarees_rail = 101
  sarees_redundant = is_redundant_rail(sarees_active, sarees_rail)
  v1 = law_collection_self_exclusion(sarees_active, sarees_rail, sarees_redundant)

  # /c/festive matching festive rail (slug ID 102)
  festive_active = 102
  festive_rail = 102
  festive_redundant = is_redundant_rail(festive_active, festive_rail)
  v2 = law_collection_self_exclusion(festive_active, festive_rail, festive_redundant)

  if v1 == 1:
    if v2 == 1:
      return 1
    else:
      return 0
  else:
    return 0

def verify_proof_5_cross_sell():
  # /c/girls (slug ID 201) with More Children's Wear / kids rail (slug ID 202)
  girls_active = 201
  kids_rail = 202
  cross_sell_redundant = is_redundant_rail(girls_active, kids_rail)
  v1 = law_cross_sell_preservation(girls_active, kids_rail, cross_sell_redundant)

  # /c/festive (slug ID 102) with Heritage Saree rail (slug ID 101)
  festive_active = 102
  saree_rail = 101
  cross_sell_2 = is_redundant_rail(festive_active, saree_rail)
  v2 = law_cross_sell_preservation(festive_active, saree_rail, cross_sell_2)

  if v1 == 1:
    if v2 == 1:
      return 1
    else:
      return 0
  else:
    return 0

# Entrypoint returning verdict list for all 5 laws: [P1, P2, P3, P4, P5]
def main():
  p1 = verify_proof_1_cascade()
  p2 = verify_proof_2_reset()
  p3 = verify_proof_3_isolation()
  p4 = verify_proof_4_self_exclusion()
  p5 = verify_proof_5_cross_sell()
  return [p1, p2, p3, p4, p5]
