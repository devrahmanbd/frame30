----------------------- MODULE CmsContentLifecycle -----------------------
(***************************************************************************)
(* Formal TLA+ Specification of Frame30 CMS Content Lifecycle:            *)
(* - Multi-tenant isolation boundary                                       *)
(* - Content states: Draft, Scheduled, Published, Archived                 *)
(* - Revision monotonicity and stale save conflict rejection               *)
(* - Role-based authorization for publishing                               *)
(* - Atomic publication and rollback preservation                          *)
(***************************************************************************)

EXTENDS Integers, FiniteSets

CONSTANTS
    Tenants,
    Actors,
    Docs,
    MaxRevs

VARIABLES
    docTenant,
    actorTenant,
    actorCanPublish,
    docState,
    serverRev,
    clientRev,
    isPublic,
    scheduledTime,
    currentTime,
    lastModifiedBy

vars == <<docTenant, actorTenant, actorCanPublish, docState, serverRev, clientRev, isPublic, scheduledTime, currentTime, lastModifiedBy>>

TypeOK ==
    /\ docTenant \in [Docs -> Tenants]
    /\ actorTenant \in [Actors -> Tenants]
    /\ actorCanPublish \in [Actors -> BOOLEAN]
    /\ docState \in [Docs -> {"draft", "scheduled", "published", "archived"}]
    /\ serverRev \in [Docs -> 0..MaxRevs]
    /\ clientRev \in [Docs -> 0..MaxRevs]
    /\ isPublic \in [Docs -> BOOLEAN]
    /\ scheduledTime \in [Docs -> 0..5]
    /\ currentTime \in 0..5
    /\ lastModifiedBy \in [Docs -> Actors]

Init ==
    /\ docTenant = [d \in Docs |-> IF d = 1 THEN 1 ELSE 2]
    /\ actorTenant = [a \in Actors |-> IF a = 3 THEN 2 ELSE 1]
    /\ actorCanPublish = [a \in Actors |-> IF a = 2 THEN FALSE ELSE TRUE]
    /\ docState = [d \in Docs |-> "draft"]
    /\ serverRev = [d \in Docs |-> 1]
    /\ clientRev = [d \in Docs |-> 1]
    /\ isPublic = [d \in Docs |-> FALSE]
    /\ scheduledTime = [d \in Docs |-> 0]
    /\ currentTime = 1
    /\ lastModifiedBy = [d \in Docs |-> IF d = 1 THEN 1 ELSE 3]

(***************************************************************************)
(* State Transition Actions                                                *)
(***************************************************************************)

\* Actor edits a draft doc owned by their tenant
EditDraft(a, d) ==
    /\ actorTenant[a] = docTenant[d]
    /\ docState[d] = "draft"
    /\ clientRev[d] < MaxRevs
    /\ clientRev' = [clientRev EXCEPT ![d] = clientRev[d] + 1]
    /\ lastModifiedBy' = [lastModifiedBy EXCEPT ![d] = a]
    /\ UNCHANGED <<docTenant, actorTenant, actorCanPublish, docState, serverRev, isPublic, scheduledTime, currentTime>>

\* Actor saves a valid non-stale revision
SaveValidRevision(a, d) ==
    /\ actorTenant[a] = docTenant[d]
    /\ docState[d] \in {"draft", "scheduled"}
    /\ clientRev[d] >= serverRev[d]
    /\ serverRev[d] < MaxRevs
    /\ serverRev' = [serverRev EXCEPT ![d] = clientRev[d]]
    /\ lastModifiedBy' = [lastModifiedBy EXCEPT ![d] = a]
    /\ UNCHANGED <<docTenant, actorTenant, actorCanPublish, docState, clientRev, isPublic, scheduledTime, currentTime>>

\* Stale save is detected and dropped (server revision unchanged)
DropStaleSave(a, d) ==
    /\ actorTenant[a] = docTenant[d]
    /\ clientRev[d] < serverRev[d]
    /\ clientRev' = [clientRev EXCEPT ![d] = serverRev[d]]
    /\ UNCHANGED <<docTenant, actorTenant, actorCanPublish, docState, serverRev, isPublic, scheduledTime, currentTime, lastModifiedBy>>

\* Actor with publish permission schedules content for future release
SchedulePublication(a, d, targetTime) ==
    /\ actorTenant[a] = docTenant[d]
    /\ actorCanPublish[a] = TRUE
    /\ docState[d] = "draft"
    /\ targetTime > currentTime
    /\ docState' = [docState EXCEPT ![d] = "scheduled"]
    /\ scheduledTime' = [scheduledTime EXCEPT ![d] = targetTime]
    /\ isPublic' = [isPublic EXCEPT ![d] = FALSE]
    /\ lastModifiedBy' = [lastModifiedBy EXCEPT ![d] = a]
    /\ UNCHANGED <<docTenant, actorTenant, actorCanPublish, serverRev, clientRev, currentTime>>

\* Scheduled job publishes content when scheduled time arrives
ExecutePublishJob(d) ==
    /\ docState[d] = "scheduled"
    /\ currentTime >= scheduledTime[d]
    /\ docState' = [docState EXCEPT ![d] = "published"]
    /\ isPublic' = [isPublic EXCEPT ![d] = TRUE]
    /\ UNCHANGED <<docTenant, actorTenant, actorCanPublish, serverRev, clientRev, scheduledTime, currentTime, lastModifiedBy>>

\* Direct publication by authorized actor
PublishDirect(a, d) ==
    /\ actorTenant[a] = docTenant[d]
    /\ actorCanPublish[a] = TRUE
    /\ docState[d] \in {"draft", "scheduled"}
    /\ docState' = [docState EXCEPT ![d] = "published"]
    /\ isPublic' = [isPublic EXCEPT ![d] = TRUE]
    /\ lastModifiedBy' = [lastModifiedBy EXCEPT ![d] = a]
    /\ UNCHANGED <<docTenant, actorTenant, actorCanPublish, serverRev, clientRev, scheduledTime, currentTime>>

\* Unpublish moves content back to draft and removes public visibility
Unpublish(a, d) ==
    /\ actorTenant[a] = docTenant[d]
    /\ actorCanPublish[a] = TRUE
    /\ docState[d] = "published"
    /\ docState' = [docState EXCEPT ![d] = "draft"]
    /\ isPublic' = [isPublic EXCEPT ![d] = FALSE]
    /\ lastModifiedBy' = [lastModifiedBy EXCEPT ![d] = a]
    /\ UNCHANGED <<docTenant, actorTenant, actorCanPublish, serverRev, clientRev, scheduledTime, currentTime>>

\* Archiving soft-deletes the document
ArchiveDoc(a, d) ==
    /\ actorTenant[a] = docTenant[d]
    /\ docState[d] \in {"draft", "published"}
    /\ docState' = [docState EXCEPT ![d] = "archived"]
    /\ isPublic' = [isPublic EXCEPT ![d] = FALSE]
    /\ lastModifiedBy' = [lastModifiedBy EXCEPT ![d] = a]
    /\ UNCHANGED <<docTenant, actorTenant, actorCanPublish, serverRev, clientRev, scheduledTime, currentTime>>

\* Restoring an archived doc returns it to draft
RestoreArchived(a, d) ==
    /\ actorTenant[a] = docTenant[d]
    /\ docState[d] = "archived"
    /\ docState' = [docState EXCEPT ![d] = "draft"]
    /\ isPublic' = [isPublic EXCEPT ![d] = FALSE]
    /\ lastModifiedBy' = [lastModifiedBy EXCEPT ![d] = a]
    /\ UNCHANGED <<docTenant, actorTenant, actorCanPublish, serverRev, clientRev, scheduledTime, currentTime>>

\* Rollback to an earlier revision strictly increments serverRev forward
RollbackRevision(a, d) ==
    /\ actorTenant[a] = docTenant[d]
    /\ serverRev[d] < MaxRevs
    /\ serverRev' = [serverRev EXCEPT ![d] = serverRev[d] + 1]
    /\ clientRev' = [clientRev EXCEPT ![d] = serverRev[d] + 1]
    /\ lastModifiedBy' = [lastModifiedBy EXCEPT ![d] = a]
    /\ UNCHANGED <<docTenant, actorTenant, actorCanPublish, docState, isPublic, scheduledTime, currentTime>>

\* Advance current time up to limit
AdvanceTime ==
    /\ currentTime < 5
    /\ currentTime' = currentTime + 1
    /\ UNCHANGED <<docTenant, actorTenant, actorCanPublish, docState, serverRev, clientRev, isPublic, scheduledTime, lastModifiedBy>>

Next ==
    \/ \E a \in Actors, d \in Docs : EditDraft(a, d)
    \/ \E a \in Actors, d \in Docs : SaveValidRevision(a, d)
    \/ \E a \in Actors, d \in Docs : DropStaleSave(a, d)
    \/ \E a \in Actors, d \in Docs, t \in 1..5 : SchedulePublication(a, d, t)
    \/ \E d \in Docs : ExecutePublishJob(d)
    \/ \E a \in Actors, d \in Docs : PublishDirect(a, d)
    \/ \E a \in Actors, d \in Docs : Unpublish(a, d)
    \/ \E a \in Actors, d \in Docs : ArchiveDoc(a, d)
    \/ \E a \in Actors, d \in Docs : RestoreArchived(a, d)
    \/ \E a \in Actors, d \in Docs : RollbackRevision(a, d)
    \/ AdvanceTime

Spec == Init /\ [][Next]_vars

(***************************************************************************)
(* Safety Invariants                                                       *)
(***************************************************************************)

\* Invariant 1: No public drafts
NoPublicDraft ==
    \A d \in Docs :
        docState[d] \in {"draft", "archived"} => isPublic[d] = FALSE

\* Invariant 2: Scheduled content is never public before scheduled time
ScheduledNotPublicBeforeTime ==
    \A d \in Docs :
        docState[d] = "scheduled" => isPublic[d] = FALSE

\* Invariant 3: Published state implies public visibility
AtomicPublicationState ==
    \A d \in Docs :
        docState[d] = "published" <=> isPublic[d] = TRUE

\* Invariant 4: No cross-tenant access - every document is always modified by a member of its tenant
NoCrossTenantAccess ==
    \A d \in Docs :
        actorTenant[lastModifiedBy[d]] = docTenant[d]

\* Invariant 5: Monotonic revision bounds
RevisionBounds ==
    \A d \in Docs :
        /\ serverRev[d] <= MaxRevs
        /\ clientRev[d] <= MaxRevs

=============================================================================
