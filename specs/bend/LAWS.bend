# =============================================================================
# Frame30 Human-Owned Correctness Laws (Bend 2)
# File: specs/bend/LAWS.bend
# Owner: @devrahmanbd (Human Specification Authority)
# Protected by CODEOWNERS - Coding agent modification forbidden without approval.
# =============================================================================

# Option type for responsive overrides (Some val | None)
type Option:
  None
  Some { val }

# Law 1: Responsive Precedence Cascade
# Resolving a responsive property on a device obeys the exact precedence:
# mobile override -> tablet override -> desktop baseline.
def law_responsive_cascade(desktop_val, tablet_opt, mobile_opt, resolved_val):
  match mobile_opt:
    case Option/Some:
      if resolved_val == mobile_opt.val:
        return 1
      else:
        return 0
    case Option/None:
      match tablet_opt:
        case Option/Some:
          if resolved_val == tablet_opt.val:
            return 1
          else:
            return 0
        case Option/None:
          if resolved_val == desktop_val:
            return 1
          else:
            return 0

# Law 2: Reset Inheritance Restoration
# Resetting an override (clearing to None) deterministically restores
# inheritance from the parent device (tablet if present, else desktop).
def law_reset_restoration(desktop_val, tablet_opt, before_reset_val, after_reset_val, post_reset_resolved):
  # After reset, the mobile override must be None
  match after_reset_val:
    case Option/Some:
      return 0
    case Option/None:
      # And resolved value must match parent cascade
      match tablet_opt:
        case Option/Some:
          if post_reset_resolved == tablet_opt.val:
            return 1
          else:
            return 0
        case Option/None:
          if post_reset_resolved == desktop_val:
            return 1
          else:
            return 0

# Law 3: Device Isolation
# Creating or updating a mobile override leaves desktop and tablet values strictly intact.
def law_device_isolation(orig_desktop, orig_tablet, new_mobile, res_desktop, res_tablet):
  if orig_desktop != res_desktop:
    return 0
  else:
    match orig_tablet:
      case Option/Some:
        match res_tablet:
          case Option/Some:
            if orig_tablet.val == res_tablet.val:
              return 1
            else:
              return 0
          case Option/None:
            return 0
      case Option/None:
        match res_tablet:
          case Option/Some:
            return 0
          case Option/None:
            return 1

# Law 4: Collection Merchandising Self-Exclusion
# When a collection rail targets the active collection, it is redundant and must be omitted.
def law_collection_self_exclusion(active_slug, rail_slug, is_redundant_verdict):
  if active_slug == rail_slug:
    if is_redundant_verdict == 1:
      return 1
    else:
      return 0
  else:
    return 1

# Law 5: Intentional Cross-Sell Preservation
# When a collection rail targets an intentionally different collection, it MUST be preserved.
def law_cross_sell_preservation(active_slug, rail_slug, is_redundant_verdict):
  if active_slug != rail_slug:
    if is_redundant_verdict == 0:
      return 1
    else:
      return 0
  else:
    return 1
