namespace Framique.Responsive

inductive Device where
  | desktop
  | tablet
  | mobile
deriving Repr, DecidableEq

structure BreakpointProps (α : Type) where
  desktop : α
  tablet : Option α := none
  mobile : Option α := none
deriving Repr, DecidableEq

def resolveResponsiveProp {α : Type} (cfg : BreakpointProps α) : Device → α
  | Device.desktop => cfg.desktop
  | Device.tablet => match cfg.tablet with
    | some v => v
    | none => cfg.desktop
  | Device.mobile => match cfg.mobile with
    | some v => v
    | none => match cfg.tablet with
      | some v => v
      | none => cfg.desktop

def setOverride {α : Type} (cfg : BreakpointProps α) : Device → α → BreakpointProps α
  | Device.desktop, v => { cfg with desktop := v }
  | Device.tablet,  v => { cfg with tablet := some v }
  | Device.mobile,  v => { cfg with mobile := some v }

def clearOverride {α : Type} (cfg : BreakpointProps α) : Device → BreakpointProps α
  | Device.desktop => cfg
  | Device.tablet  => { cfg with tablet := none }
  | Device.mobile  => { cfg with mobile := none }

/-- Theorem 1: Mobile override takes authoritative precedence when present. -/
theorem responsive_precedence_mobile {α : Type} (cfg : BreakpointProps α) (v : α) :
    resolveResponsiveProp { cfg with mobile := some v } Device.mobile = v := by
  simp [resolveResponsiveProp]

/-- Theorem 2: Mobile falls back to tablet override when mobile override is absent. -/
theorem responsive_precedence_tablet {α : Type} (cfg : BreakpointProps α) (v : α) :
    resolveResponsiveProp { cfg with tablet := some v, mobile := none } Device.mobile = v := by
  simp [resolveResponsiveProp]

/-- Theorem 3: Mobile falls back to desktop baseline when both tablet and mobile are absent. -/
theorem responsive_precedence_desktop {α : Type} (cfg : BreakpointProps α) :
    resolveResponsiveProp { cfg with tablet := none, mobile := none } Device.mobile = cfg.desktop := by
  simp [resolveResponsiveProp]

/-- Theorem 4: Clearing a mobile override deterministically restores resolution to the tablet value. -/
theorem reset_restores_inheritance {α : Type} (cfg : BreakpointProps α) :
    resolveResponsiveProp (clearOverride cfg Device.mobile) Device.mobile =
    resolveResponsiveProp cfg Device.tablet := by
  simp [clearOverride, resolveResponsiveProp]

/-- Theorem 5: Mutating mobile override preserves desktop baseline configuration. -/
theorem device_isolation_desktop {α : Type} (cfg : BreakpointProps α) (v : α) :
    (setOverride cfg Device.mobile v).desktop = cfg.desktop := by
  simp [setOverride]

/-- Theorem 6: Mutating mobile override preserves tablet override configuration. -/
theorem device_isolation_tablet {α : Type} (cfg : BreakpointProps α) (v : α) :
    (setOverride cfg Device.mobile v).tablet = cfg.tablet := by
  simp [setOverride]

/-- Theorem 7: Override clearing is strictly idempotent across all devices. -/
theorem reset_idempotent {α : Type} (cfg : BreakpointProps α) (d : Device) :
    clearOverride (clearOverride cfg d) d = clearOverride cfg d := by
  cases d <;> simp [clearOverride]

end Framique.Responsive
