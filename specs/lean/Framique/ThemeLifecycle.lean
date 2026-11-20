namespace Framique.ThemeLifecycle

inductive SchemaVersion where
  | legacy : SchemaVersion        -- "0.9.0"
  | canonical : SchemaVersion     -- "1.0.0"
  | future : SchemaVersion        -- "2.0.0" or any unsupported future version
deriving Repr, DecidableEq

inductive MediaValue where
  | legacyUrl (url : String)
  | structured (url : String) (alt : String) (focalX : Nat) (focalY : Nat)
deriving Repr, DecidableEq

def mediaUrl : MediaValue → String
  | MediaValue.legacyUrl u => u
  | MediaValue.structured u _ _ _ => u

def isStructuredMedia : MediaValue → Bool
  | MediaValue.legacyUrl _ => false
  | MediaValue.structured _ _ _ _ => true

def migrateMedia : MediaValue → MediaValue
  | MediaValue.legacyUrl u => MediaValue.structured u "" 0 0
  | MediaValue.structured u a x y => MediaValue.structured u a x y

structure ThemeDoc where
  schema : SchemaVersion
  media : MediaValue
  valid : Bool
deriving Repr, DecidableEq

inductive MigrationResult where
  | ok (doc : ThemeDoc)
  | rejected (doc : ThemeDoc)
deriving Repr, DecidableEq

def migrateDoc (doc : ThemeDoc) : MigrationResult :=
  match doc.schema with
  | SchemaVersion.future => MigrationResult.rejected doc
  | _ =>
    if doc.valid then
      MigrationResult.ok { schema := SchemaVersion.canonical, media := migrateMedia doc.media, valid := true }
    else
      MigrationResult.rejected doc

def isPublishEligible (doc : ThemeDoc) : Bool :=
  (doc.schema == SchemaVersion.canonical) && doc.valid

/-- Theorem 1: Migration is idempotent. Migrating an already-migrated document produces identical output. -/
theorem migration_idempotent (doc : ThemeDoc) (migrated : ThemeDoc)
    (h : migrateDoc doc = MigrationResult.ok migrated) :
    migrateDoc migrated = MigrationResult.ok migrated := by
  cases doc with | mk s m v =>
  cases s with
  | future =>
    simp [migrateDoc] at h
  | legacy =>
    cases v with
    | false => simp [migrateDoc] at h
    | true =>
      simp [migrateDoc] at h
      cases h
      simp [migrateDoc, migrateMedia]
      cases m <;> simp [migrateMedia]
  | canonical =>
    cases v with
    | false => simp [migrateDoc] at h
    | true =>
      simp [migrateDoc] at h
      cases h
      simp [migrateDoc, migrateMedia]
      cases m <;> simp [migrateMedia]

/-- Theorem 2: Version monotonicity: successful migration always results in canonical schema version. -/
theorem version_monotonic (doc : ThemeDoc) (migrated : ThemeDoc)
    (h : migrateDoc doc = MigrationResult.ok migrated) :
    migrated.schema = SchemaVersion.canonical := by
  cases doc with | mk s m v =>
  cases s with
  | future => simp [migrateDoc] at h
  | legacy =>
    cases v with
    | false => simp [migrateDoc] at h
    | true =>
      simp [migrateDoc] at h
      cases h; rfl
  | canonical =>
    cases v with
    | false => simp [migrateDoc] at h
    | true =>
      simp [migrateDoc] at h
      cases h; rfl

/-- Theorem 3: Future schema version documents are never downgraded; original is preserved on rejection. -/
theorem future_version_preserved (doc : ThemeDoc) (h : doc.schema = SchemaVersion.future) :
    migrateDoc doc = MigrationResult.rejected doc := by
  cases doc with | mk s m v =>
  simp at h
  subst h
  simp [migrateDoc]

/-- Theorem 4: A successfully migrated document is always eligible for publication. -/
theorem canonical_publication_eligible (doc : ThemeDoc) (migrated : ThemeDoc)
    (h : migrateDoc doc = MigrationResult.ok migrated) :
    isPublishEligible migrated = true := by
  cases doc with | mk s m v =>
  cases s with
  | future => simp [migrateDoc] at h
  | legacy =>
    cases v with
    | false => simp [migrateDoc] at h
    | true =>
      simp [migrateDoc] at h
      cases h
      simp [isPublishEligible]
  | canonical =>
    cases v with
    | false => simp [migrateDoc] at h
    | true =>
      simp [migrateDoc] at h
      cases h
      simp [isPublishEligible]

/-- Theorem 5: Media URL is preserved invariant under migration. -/
theorem media_preserved (m : MediaValue) :
    mediaUrl (migrateMedia m) = mediaUrl m := by
  cases m with
  | legacyUrl u => simp [migrateMedia, mediaUrl]
  | structured u a x y => simp [migrateMedia, mediaUrl]

/-- Theorem 6: Invalid document data is rejected and preserved untouched. -/
theorem invalid_data_rejected (doc : ThemeDoc) (h : doc.valid = false) :
    migrateDoc doc = MigrationResult.rejected doc := by
  cases doc with | mk s m v =>
  simp at h
  subst h
  cases s <;> simp [migrateDoc]

/-- Theorem 7: Migration result safety: any migration attempt either yields a valid canonical document or preserves the original document untouched. -/
theorem migration_result_safe (doc : ThemeDoc) :
    (∃ out : ThemeDoc, migrateDoc doc = MigrationResult.ok out ∧ out.schema = SchemaVersion.canonical ∧ out.valid = true) ∨
    (migrateDoc doc = MigrationResult.rejected doc) := by
  cases doc with | mk s m v =>
  cases s with
  | future =>
    right
    simp [migrateDoc]
  | legacy =>
    cases v with
    | false =>
      right
      simp [migrateDoc]
    | true =>
      left
      simp [migrateDoc]
  | canonical =>
    cases v with
    | false =>
      right
      simp [migrateDoc]
    | true =>
      left
      simp [migrateDoc]

end Framique.ThemeLifecycle
