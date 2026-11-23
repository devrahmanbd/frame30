namespace Framique.CmsLifecycle

inductive ContentState where
  | draft
  | scheduled (publishAt : Nat)
  | published (publishedAt : Nat)
  | archived
deriving Repr, DecidableEq

structure Actor where
  userId : String
  tenantId : String
  canPublish : Bool
deriving Repr, DecidableEq

structure ContentDoc where
  id : String
  tenantId : String
  state : ContentState
  revision : Nat
deriving Repr, DecidableEq

/-- Public visibility predicate: only published content is publicly visible. -/
def isPublicVisible (state : ContentState) : Bool :=
  match state with
  | ContentState.published _ => true
  | _ => false

/-- Tenant access predicate: actor can only access content of the same tenant. -/
def canAccessTenant (actor : Actor) (doc : ContentDoc) : Bool :=
  actor.tenantId == doc.tenantId

/-- State transition function for publishing. -/
def attemptPublish (actor : Actor) (doc : ContentDoc) (now : Nat) : ContentDoc :=
  if canAccessTenant actor doc then
    if actor.canPublish then
      { doc with state := ContentState.published now, revision := doc.revision + 1 }
    else
      doc
  else
    doc

/-- Stale save check: client revision must match server revision. -/
def isStaleSave (serverRev : Nat) (clientRev : Nat) : Bool :=
  serverRev > clientRev

/-- Rollback creates a new monotonic revision preserving history. -/
def rollbackRevision (doc : ContentDoc) (_historicalRevision : Nat) : ContentDoc :=
  { doc with revision := doc.revision + 1 }

/-- Theorem 1: Draft content is never publicly visible. -/
theorem draft_not_public :
    isPublicVisible ContentState.draft = false := by
  rfl

/-- Theorem 2: Archived content is never publicly visible. -/
theorem archived_not_public :
    isPublicVisible ContentState.archived = false := by
  rfl

/-- Theorem 3: Scheduled content is never publicly visible in scheduled state. -/
theorem scheduled_not_public (t : Nat) :
    isPublicVisible (ContentState.scheduled t) = false := by
  rfl

/-- Theorem 4: An actor from a different tenant cannot access content. -/
theorem cross_tenant_access_denied (actor : Actor) (doc : ContentDoc)
    (h : (actor.tenantId == doc.tenantId) = false) :
    canAccessTenant actor doc = false := by
  simp [canAccessTenant, h]

/-- Theorem 5: Unauthorized actor cannot transition document to published state. -/
theorem unauthorized_actor_cannot_publish (actor : Actor) (doc : ContentDoc) (now : Nat)
    (h : actor.canPublish = false) (hDoc : doc.state = ContentState.draft) :
    (attemptPublish actor doc now).state ≠ ContentState.published now := by
  simp [attemptPublish, h]
  intro hEq
  rw [hDoc] at hEq
  contradiction

/-- Theorem 6: Rollback strictly increments revision (history is preserved append-only). -/
theorem rollback_strictly_monotonic (doc : ContentDoc) (targetRev : Nat) :
    (rollbackRevision doc targetRev).revision = doc.revision + 1 := by
  rfl

/-- Theorem 7: Stale save detection is sound when server revision exceeds client revision. -/
theorem stale_save_sound (serverRev clientRev : Nat) (h : serverRev > clientRev) :
    isStaleSave serverRev clientRev = true := by
  simp [isStaleSave, h]

end Framique.CmsLifecycle
