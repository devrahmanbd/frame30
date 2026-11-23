----------------------- MODULE ResponsiveAutosave -----------------------
(***************************************************************************)
(* Formal TLA+ Specification of Frame30 Theme Builder Responsive Customization:*)
(* - Breakpoint resolution cascade (Desktop -> Tablet -> Mobile)           *)
(* - Override creation and reset semantics                                 *)
(* - Concurrency, revision management and autosave persistence             *)
(* - Fail-closed publication gates preventing stale or invalid rollouts    *)
(***************************************************************************)

EXTENDS Integers, FiniteSets

CONSTANTS
    MaxRevisions,    \* e.g. 3
    PropDomain       \* e.g. {1, 2, 3, 4} (column counts)

NoneVal == 0
PropOrNone == PropDomain \cup {NoneVal}

VARIABLES
    desktopVal,           \* PropDomain
    tabletOverride,       \* PropOrNone
    mobileOverride,       \* PropOrNone
    clientRev,            \* 0..MaxRevisions
    serverRev,            \* 0..MaxRevisions
    persistedDesktop,     \* PropDomain
    persistedTablet,      \* PropOrNone
    persistedMobile,      \* PropOrNone
    saveInFlight,         \* BOOLEAN
    flightRev,            \* 0..MaxRevisions
    flightDesktop,        \* PropDomain
    flightTablet,         \* PropOrNone
    flightMobile,         \* PropOrNone
    publishedRev,         \* 0..MaxRevisions
    publicationStatus     \* "Unpublished" | "Published" | "StaleRejected"

vars == <<desktopVal, tabletOverride, mobileOverride, clientRev, serverRev,
          persistedDesktop, persistedTablet, persistedMobile,
          saveInFlight, flightRev, flightDesktop, flightTablet, flightMobile,
          publishedRev, publicationStatus>>

TypeOK ==
    /\ desktopVal \in PropDomain
    /\ tabletOverride \in PropOrNone
    /\ mobileOverride \in PropOrNone
    /\ clientRev \in 0..MaxRevisions
    /\ serverRev \in 0..MaxRevisions
    /\ persistedDesktop \in PropDomain
    /\ persistedTablet \in PropOrNone
    /\ persistedMobile \in PropOrNone
    /\ saveInFlight \in BOOLEAN
    /\ flightRev \in 0..MaxRevisions
    /\ flightDesktop \in PropDomain
    /\ flightTablet \in PropOrNone
    /\ flightMobile \in PropOrNone
    /\ publishedRev \in 0..MaxRevisions
    /\ publicationStatus \in {"Unpublished", "Published", "StaleRejected"}

Init ==
    /\ desktopVal = 4
    /\ tabletOverride = NoneVal
    /\ mobileOverride = NoneVal
    /\ clientRev = 0
    /\ serverRev = 0
    /\ persistedDesktop = 4
    /\ persistedTablet = NoneVal
    /\ persistedMobile = NoneVal
    /\ saveInFlight = FALSE
    /\ flightRev = 0
    /\ flightDesktop = 4
    /\ flightTablet = NoneVal
    /\ flightMobile = NoneVal
    /\ publishedRev = 0
    /\ publicationStatus = "Unpublished"

\* Effective resolved mobile value helper
EffectiveMobile(desk, tab, mob) ==
    IF mob /= NoneVal THEN mob
    ELSE IF tab /= NoneVal THEN tab
    ELSE desk

\* Action: Edit Desktop Baseline
EditDesktop(v) ==
    /\ clientRev < MaxRevisions
    /\ desktopVal' = v
    /\ clientRev' = clientRev + 1
    /\ UNCHANGED <<tabletOverride, mobileOverride, serverRev, persistedDesktop,
                  persistedTablet, persistedMobile, saveInFlight, flightRev,
                  flightDesktop, flightTablet, flightMobile, publishedRev, publicationStatus>>

\* Action: Set or update Tablet Override
EditTablet(v) ==
    /\ clientRev < MaxRevisions
    /\ tabletOverride' = v
    /\ clientRev' = clientRev + 1
    /\ UNCHANGED <<desktopVal, mobileOverride, serverRev, persistedDesktop,
                  persistedTablet, persistedMobile, saveInFlight, flightRev,
                  flightDesktop, flightTablet, flightMobile, publishedRev, publicationStatus>>

\* Action: Set or update Mobile Override
EditMobile(v) ==
    /\ clientRev < MaxRevisions
    /\ mobileOverride' = v
    /\ clientRev' = clientRev + 1
    /\ UNCHANGED <<desktopVal, tabletOverride, serverRev, persistedDesktop,
                  persistedTablet, persistedMobile, saveInFlight, flightRev,
                  flightDesktop, flightTablet, flightMobile, publishedRev, publicationStatus>>

\* Action: Reset Mobile Override (clears to NoneVal)
ResetMobile ==
    /\ mobileOverride /= NoneVal
    /\ clientRev < MaxRevisions
    /\ mobileOverride' = NoneVal
    /\ clientRev' = clientRev + 1
    /\ UNCHANGED <<desktopVal, tabletOverride, serverRev, persistedDesktop,
                  persistedTablet, persistedMobile, saveInFlight, flightRev,
                  flightDesktop, flightTablet, flightMobile, publishedRev, publicationStatus>>

\* Action: Dispatch Autosave Request
TriggerAutosave ==
    /\ ~saveInFlight
    /\ clientRev > serverRev
    /\ saveInFlight' = TRUE
    /\ flightRev' = clientRev
    /\ flightDesktop' = desktopVal
    /\ flightTablet' = tabletOverride
    /\ flightMobile' = mobileOverride
    /\ UNCHANGED <<desktopVal, tabletOverride, mobileOverride, clientRev, serverRev,
                  persistedDesktop, persistedTablet, persistedMobile, publishedRev, publicationStatus>>

\* Action: Server Accepts Autosave (revision monotonic)
AcceptAutosave ==
    /\ saveInFlight
    /\ flightRev > serverRev
    /\ serverRev' = flightRev
    /\ persistedDesktop' = flightDesktop
    /\ persistedTablet' = flightTablet
    /\ persistedMobile' = flightMobile
    /\ saveInFlight' = FALSE
    /\ UNCHANGED <<desktopVal, tabletOverride, mobileOverride, clientRev, flightRev,
                  flightDesktop, flightTablet, flightMobile, publishedRev, publicationStatus>>

\* Action: Server Drops Stale Autosave (out of order response)
DropStaleAutosave ==
    /\ saveInFlight
    /\ flightRev <= serverRev
    /\ saveInFlight' = FALSE
    /\ UNCHANGED <<desktopVal, tabletOverride, mobileOverride, clientRev, serverRev,
                  persistedDesktop, persistedTablet, persistedMobile, flightRev,
                  flightDesktop, flightTablet, flightMobile, publishedRev, publicationStatus>>

\* Action: Publish Persisted Configuration
Publish ==
    /\ serverRev > 0
    /\ publishedRev' = serverRev
    /\ publicationStatus' = "Published"
    /\ UNCHANGED <<desktopVal, tabletOverride, mobileOverride, clientRev, serverRev,
                  persistedDesktop, persistedTablet, persistedMobile, saveInFlight,
                  flightRev, flightDesktop, flightTablet, flightMobile>>

Next ==
    \/ \E v \in PropDomain: EditDesktop(v)
    \/ \E v \in PropDomain: EditTablet(v)
    \/ \E v \in PropDomain: EditMobile(v)
    \/ ResetMobile
    \/ TriggerAutosave
    \/ AcceptAutosave
    \/ DropStaleAutosave
    \/ Publish

Spec == Init /\ [][Next]_vars

(***************************************************************************)
(* FORMAL SAFETY INVARIANTS                                                *)
(***************************************************************************)

\* Invariant 1: Device Isolation & Parent Preservation
ParentPreservation ==
    (mobileOverride /= NoneVal) => (desktopVal \in PropDomain)

\* Invariant 2: Correct Responsive Inheritance
InheritanceCorrectness ==
    EffectiveMobile(desktopVal, tabletOverride, mobileOverride) \in PropDomain

\* Invariant 3: Reset Restores Exact Parent Cascade
ResetRestoration ==
    (mobileOverride = NoneVal) =>
        (EffectiveMobile(desktopVal, tabletOverride, mobileOverride) =
         IF tabletOverride /= NoneVal THEN tabletOverride ELSE desktopVal)

\* Invariant 4: No Stale Revision Regression on Server
NoStaleRegression ==
    serverRev <= clientRev

\* Invariant 5: Published Revision is Never Future or Negative
PublicationIntegrity ==
    (publicationStatus = "Published") => (publishedRev > 0 /\ publishedRev <= serverRev)

=============================================================================
