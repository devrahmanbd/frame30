namespace Framique.CollectionComposition

structure Section where
  type : String
  targetSlug : Option String := none
deriving Repr, DecidableEq

def isRedundantCollectionRail (activeSlug : String) (s : Section) : Bool :=
  if s.type == "product_rail" then
    match s.targetSlug with
    | some slug => slug == activeSlug
    | none => true
  else
    false

def filterCollectionSections (activeSlug : String) (sections : List Section) : List Section :=
  sections.filter (fun s => !isRedundantCollectionRail activeSlug s)

/-- Theorem 1: A product rail targeting the active collection is always marked redundant. -/
theorem matching_rail_is_redundant (slug : String) :
    isRedundantCollectionRail slug { type := "product_rail", targetSlug := some slug } = true := by
  simp [isRedundantCollectionRail]

/-- Theorem 2: A product rail targeting a distinct collection is never marked redundant. -/
theorem distinct_cross_sell_is_preserved (active other : String) (h : (other == active) = false) :
    isRedundantCollectionRail active { type := "product_rail", targetSlug := some other } = false := by
  simp [isRedundantCollectionRail, h]

/-- Theorem 3: The primary product grid is never marked redundant regardless of slug. -/
theorem product_grid_is_never_redundant (active : String) (target : Option String) :
    isRedundantCollectionRail active { type := "product_grid", targetSlug := target } = false := by
  simp [isRedundantCollectionRail]

/-- Theorem 4: Blanket removal of all product rails is mathematically refuted. -/
theorem blanket_removal_refuted :
    ∃ (active : String) (s : Section), s.type = "product_rail" ∧ isRedundantCollectionRail active s = false :=
  ⟨"girls", { type := "product_rail", targetSlug := some "kids" }, by rfl, by decide⟩

end Framique.CollectionComposition
