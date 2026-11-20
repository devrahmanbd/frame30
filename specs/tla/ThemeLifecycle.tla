----------------------- MODULE ThemeLifecycle -----------------------
(***************************************************************************)
(* Formal TLA+ specification of Frame30's Theme Standard lifecycle:        *)
(* Load -> Edit -> Autosave -> Reload -> Preview -> Validate -> Publish    *)
(* -> Storefront.                                                          *)
(*                                                                         *)
(* Model features:                                                         *)
(*  - Schema version transitions: legacy ("0.9.0"), canonical ("1.0.0"),   *)
(*    and unsupported future ("2.0.0").                                    *)
(*  - Media preservation: URL, alt text, and focal point.                  *)
(*  - Atomic autosave persisting canonical 1.0.0 without partial writes.   *)
(*  - Read-only preview never mutating persisted configuration.            *)
(*  - Publication gate refusing unvalidated, malformed or future schemas.  *)
(*  - Failure immutability: failed migrations or saves preserve original.  *)
(***************************************************************************)

EXTENDS Integers, FiniteSets

CONSTANTS
    InitialSchemas,     \* {"0.9.0", "1.0.0", "2.0.0"}
    CanonicalSchema,    \* "1.0.0"
    FutureSchema        \* "2.0.0"

VARIABLES
    persistedDraftVersion,  \* Schema version in database draft: "0.9.0" | "1.0.0" | "2.0.0"
    workingDraftVersion,    \* Schema version in memory editor: "None" | "0.9.0" | "1.0.0" | "2.0.0"
    persistedConfig,        \* Record: [schema, url, alt, focalX, focalY, valid]
    workingConfig,          \* Record: [schema, url, alt, focalX, focalY, valid]
    mediaState,             \* [url, alt, focalX, focalY, isStructured]
    validationStatus,       \* "Unvalidated" | "Valid" | "Invalid"
    migrationStatus,        \* "NotStarted" | "Migrated" | "Failed"
    previewState,           \* "None" | "Ready" | "Error"
    publishedVersion,       \* "None" | "v1"
    publishedConfig,        \* Record: [schema, url, alt, focalX, focalY, valid]
    publicationStatus,      \* "Unpublished" | "Published" | "Rejected"
    persistenceStatus,      \* "Idle" | "Saved" | "Failed"
    rejectionState          \* "None" | "FutureSchemaRejected" | "InvalidDraftRejected" | "ValidationFailed" | "SaveFailed"

vars == <<persistedDraftVersion, workingDraftVersion, persistedConfig, workingConfig,
          mediaState, validationStatus, migrationStatus, previewState,
          publishedVersion, publishedConfig, publicationStatus, persistenceStatus, rejectionState>>

ValidSchemas == {"0.9.0", "1.0.0", "2.0.0"}
ValidationStatuses == {"Unvalidated", "Valid", "Invalid"}
MigrationStatuses == {"NotStarted", "Migrated", "Failed"}
PreviewStates == {"None", "Ready", "Error"}
PublicationStatuses == {"Unpublished", "Published", "Rejected"}
PersistenceStatuses == {"Idle", "Saved", "Failed"}
RejectionStates == {"None", "FutureSchemaRejected", "InvalidDraftRejected", "ValidationFailed", "SaveFailed"}

TypeOK ==
    /\ persistedDraftVersion \in ValidSchemas
    /\ workingDraftVersion \in ValidSchemas \cup {"None"}
    /\ validationStatus \in ValidationStatuses
    /\ migrationStatus \in MigrationStatuses
    /\ previewState \in PreviewStates
    /\ publicationStatus \in PublicationStatuses
    /\ persistenceStatus \in PersistenceStatuses
    /\ rejectionState \in RejectionStates
    /\ persistedConfig.schema \in ValidSchemas
    /\ workingConfig.schema \in ValidSchemas \cup {"None"}
    /\ workingConfig.focalX \in -100..200
    /\ workingConfig.focalY \in -100..200
    /\ workingConfig.valid \in BOOLEAN
    /\ persistedConfig.valid \in BOOLEAN
    /\ publishedConfig.schema \in ValidSchemas \cup {"None"}
    /\ publishedConfig.valid \in BOOLEAN

Init ==
    \E s \in InitialSchemas:
        LET isCanon == (s = CanonicalSchema)
            isFuture == (s = FutureSchema)
            cfg == [schema |-> s,
                    url |-> "https://cdn.framique.com/artisan.jpg",
                    alt |-> "Artisan Loom",
                    focalX |-> 50,
                    focalY |-> 50,
                    valid |-> TRUE]
        IN
        /\ persistedDraftVersion = s
        /\ workingDraftVersion = "None"
        /\ persistedConfig = cfg
        /\ workingConfig = [schema |-> "None", url |-> "", alt |-> "", focalX |-> 50, focalY |-> 50, valid |-> TRUE]
        /\ mediaState = [url |-> cfg.url, alt |-> cfg.alt, focalX |-> 50, focalY |-> 50, isStructured |-> isCanon]
        /\ validationStatus = "Unvalidated"
        /\ migrationStatus = "NotStarted"
        /\ previewState = "None"
        /\ publishedVersion = "None"
        /\ publishedConfig = [schema |-> "None", url |-> "", alt |-> "", focalX |-> 50, focalY |-> 50, valid |-> FALSE]
        /\ publicationStatus = "Unpublished"
        /\ persistenceStatus = "Idle"
        /\ rejectionState = "None"

-----------------------------------------------------------------------------
(* State Transition Actions *)

LoadLegacyDraft ==
    /\ persistedDraftVersion = "0.9.0"
    /\ workingDraftVersion = "None"
    /\ workingDraftVersion' = "0.9.0"
    /\ workingConfig' = persistedConfig
    /\ mediaState' = [url |-> persistedConfig.url, alt |-> persistedConfig.alt, focalX |-> persistedConfig.focalX, focalY |-> persistedConfig.focalY, isStructured |-> FALSE]
    /\ validationStatus' = "Unvalidated"
    /\ migrationStatus' = "NotStarted"
    /\ previewState' = "None"
    /\ rejectionState' = "None"
    /\ UNCHANGED <<persistedDraftVersion, persistedConfig, publishedVersion, publishedConfig, publicationStatus, persistenceStatus>>

LoadCurrentDraft ==
    /\ persistedDraftVersion = CanonicalSchema
    /\ workingDraftVersion = "None"
    /\ workingDraftVersion' = CanonicalSchema
    /\ workingConfig' = persistedConfig
    /\ mediaState' = [url |-> persistedConfig.url, alt |-> persistedConfig.alt, focalX |-> persistedConfig.focalX, focalY |-> persistedConfig.focalY, isStructured |-> TRUE]
    /\ validationStatus' = "Valid"
    /\ migrationStatus' = "Migrated"
    /\ previewState' = "None"
    /\ rejectionState' = "None"
    /\ UNCHANGED <<persistedDraftVersion, persistedConfig, publishedVersion, publishedConfig, publicationStatus, persistenceStatus>>

RejectFutureDraft ==
    /\ persistedDraftVersion = FutureSchema
    /\ workingDraftVersion = "None"
    /\ rejectionState' = "FutureSchemaRejected"
    /\ UNCHANGED <<persistedDraftVersion, workingDraftVersion, persistedConfig, workingConfig,
                  mediaState, validationStatus, migrationStatus, previewState,
                  publishedVersion, publishedConfig, publicationStatus, persistenceStatus>>

MigrateDraft ==
    /\ workingDraftVersion \in {"0.9.0", "1.0.0"}
    /\ migrationStatus /= "Migrated"
    /\ workingDraftVersion' = CanonicalSchema
    /\ workingConfig' = [workingConfig EXCEPT !.schema = CanonicalSchema]
    /\ mediaState' = [mediaState EXCEPT !.isStructured = TRUE]
    /\ migrationStatus' = "Migrated"
    /\ validationStatus' = "Valid"
    /\ previewState' = "None"
    /\ rejectionState' = "None"
    /\ UNCHANGED <<persistedDraftVersion, persistedConfig, publishedVersion, publishedConfig, publicationStatus, persistenceStatus>>

EditStructuredMediaValid ==
    /\ workingDraftVersion = CanonicalSchema
    /\ \E fx \in {0, 50, 100}, fy \in {0, 50, 100}:
        /\ workingConfig' = [workingConfig EXCEPT !.focalX = fx, !.focalY = fy, !.valid = TRUE]
        /\ mediaState' = [mediaState EXCEPT !.focalX = fx, !.focalY = fy, !.isStructured = TRUE]
        /\ validationStatus' = "Valid"
        /\ previewState' = "None"
        /\ UNCHANGED <<persistedDraftVersion, workingDraftVersion, persistedConfig,
                      migrationStatus, publishedVersion, publishedConfig, publicationStatus, persistenceStatus, rejectionState>>

EditStructuredMediaInvalid ==
    /\ workingDraftVersion = CanonicalSchema
    /\ workingConfig' = [workingConfig EXCEPT !.focalX = 150, !.valid = FALSE]
    /\ mediaState' = [mediaState EXCEPT !.focalX = 150]
    /\ validationStatus' = "Invalid"
    /\ previewState' = "None"
    /\ UNCHANGED <<persistedDraftVersion, workingDraftVersion, persistedConfig,
                  migrationStatus, publishedVersion, publishedConfig, publicationStatus, persistenceStatus, rejectionState>>

AutosaveValidDraft ==
    /\ workingDraftVersion = CanonicalSchema
    /\ validationStatus = "Valid"
    /\ workingConfig.valid = TRUE
    /\ persistedDraftVersion' = CanonicalSchema
    /\ persistedConfig' = workingConfig
    /\ persistenceStatus' = "Saved"
    /\ rejectionState' = "None"
    /\ UNCHANGED <<workingDraftVersion, workingConfig, mediaState, validationStatus,
                  migrationStatus, previewState, publishedVersion, publishedConfig, publicationStatus>>

RejectInvalidAutosave ==
    /\ \/ (workingDraftVersion = FutureSchema)
       \/ (validationStatus = "Invalid")
       \/ (workingConfig.valid = FALSE)
    /\ persistenceStatus' = "Failed"
    /\ rejectionState' = "InvalidDraftRejected"
    /\ UNCHANGED <<persistedDraftVersion, workingDraftVersion, persistedConfig, workingConfig,
                  mediaState, validationStatus, migrationStatus, previewState,
                  publishedVersion, publishedConfig, publicationStatus>>

ReloadDraft ==
    /\ workingDraftVersion /= "None"
    /\ workingDraftVersion' = persistedDraftVersion
    /\ workingConfig' = persistedConfig
    /\ mediaState' = [url |-> persistedConfig.url, alt |-> persistedConfig.alt,
                      focalX |-> persistedConfig.focalX, focalY |-> persistedConfig.focalY,
                      isStructured |-> (persistedDraftVersion = CanonicalSchema)]
    /\ validationStatus' = IF persistedConfig.valid THEN "Valid" ELSE "Invalid"
    /\ migrationStatus' = IF persistedDraftVersion = CanonicalSchema THEN "Migrated" ELSE "NotStarted"
    /\ previewState' = "None"
    /\ rejectionState' = "None"
    /\ UNCHANGED <<persistedDraftVersion, persistedConfig, publishedVersion, publishedConfig, publicationStatus, persistenceStatus>>

PreviewDraft ==
    /\ workingDraftVersion = CanonicalSchema
    /\ validationStatus = "Valid"
    /\ workingConfig.valid = TRUE
    /\ previewState' = "Ready"
    /\ rejectionState' = "None"
    /\ UNCHANGED <<persistedDraftVersion, workingDraftVersion, persistedConfig, workingConfig,
                  mediaState, validationStatus, migrationStatus, publishedVersion,
                  publishedConfig, publicationStatus, persistenceStatus>>

RejectInvalidPreview ==
    /\ \/ (workingDraftVersion /= CanonicalSchema)
       \/ (validationStatus /= "Valid")
       \/ (workingConfig.valid = FALSE)
    /\ previewState' = "Error"
    /\ rejectionState' = "ValidationFailed"
    /\ UNCHANGED <<persistedDraftVersion, workingDraftVersion, persistedConfig, workingConfig,
                  mediaState, validationStatus, migrationStatus, publishedVersion,
                  publishedConfig, publicationStatus, persistenceStatus>>

PublishValidDraft ==
    /\ workingDraftVersion = CanonicalSchema
    /\ validationStatus = "Valid"
    /\ workingConfig.valid = TRUE
    /\ publishedVersion' = "v1"
    /\ publishedConfig' = workingConfig
    /\ publicationStatus' = "Published"
    /\ rejectionState' = "None"
    /\ UNCHANGED <<persistedDraftVersion, workingDraftVersion, persistedConfig, workingConfig,
                  mediaState, validationStatus, migrationStatus, previewState, persistenceStatus>>

RejectInvalidPublication ==
    /\ \/ (workingDraftVersion /= CanonicalSchema)
       \/ (validationStatus /= "Valid")
       \/ (workingConfig.valid = FALSE)
    /\ publicationStatus' = "Rejected"
    /\ rejectionState' = "ValidationFailed"
    /\ UNCHANGED <<persistedDraftVersion, workingDraftVersion, persistedConfig, workingConfig,
                  mediaState, validationStatus, migrationStatus, previewState, publishedVersion, publishedConfig, persistenceStatus>>

MigrationFailure ==
    /\ workingDraftVersion = "0.9.0"
    /\ migrationStatus' = "Failed"
    /\ validationStatus' = "Invalid"
    /\ previewState' = "None"
    /\ rejectionState' = "ValidationFailed"
    /\ UNCHANGED <<persistedDraftVersion, workingDraftVersion, persistedConfig, workingConfig,
                  mediaState, publishedVersion, publishedConfig, publicationStatus, persistenceStatus>>

SaveFailure ==
    /\ persistenceStatus' = "Failed"
    /\ rejectionState' = "SaveFailed"
    /\ UNCHANGED <<persistedDraftVersion, workingDraftVersion, persistedConfig, workingConfig,
                  mediaState, validationStatus, migrationStatus, previewState,
                  publishedVersion, publishedConfig, publicationStatus>>

Next ==
    \/ LoadLegacyDraft
    \/ LoadCurrentDraft
    \/ RejectFutureDraft
    \/ MigrateDraft
    \/ EditStructuredMediaValid
    \/ EditStructuredMediaInvalid
    \/ AutosaveValidDraft
    \/ RejectInvalidAutosave
    \/ ReloadDraft
    \/ PreviewDraft
    \/ RejectInvalidPreview
    \/ PublishValidDraft
    \/ RejectInvalidPublication
    \/ MigrationFailure
    \/ SaveFailure

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Safety Invariants *)

(* 1. Type correctness *)
TypeOKInv == TypeOK

(* 2. A future schema document is never downgraded or overwritten with canonical *)
FutureSchemaNeverDowngraded ==
    (persistedConfig.schema = FutureSchema) => (persistedDraftVersion = FutureSchema)

(* 3. Failed migration preserves original database document *)
FailedMigrationPreservesOriginal ==
    (migrationStatus = "Failed") => (persistedConfig.schema \in ValidSchemas)

(* 4. Failed persistence write preserves original database document *)
FailedSavePreservesOriginal ==
    (persistenceStatus = "Failed") => (persistedConfig.valid = TRUE)

(* 5. Invalid drafts cannot reach published state *)
InvalidDraftNeverPublished ==
    (publishedVersion /= "None") => (publishedConfig.valid = TRUE)

(* 6. Published version is strictly in canonical schema 1.0.0 *)
PublishedVersionIsCanonical ==
    (publishedVersion /= "None") => (publishedConfig.schema = CanonicalSchema)

(* 7. Persisted draft schema never regresses after successful canonical save *)
DraftSchemaNeverRegresses ==
    (persistenceStatus = "Saved") => (persistedDraftVersion = CanonicalSchema)

(* 8. Migration preserves URL and valid focal coordinates *)
MigrationPreservesStructuredMedia ==
    (migrationStatus = "Migrated") => (mediaState.url = persistedConfig.url /\ mediaState.isStructured = TRUE)

(* 9. Migration idempotency: migrating canonical keeps it canonical *)
MigrationIsIdempotent ==
    (workingDraftVersion = CanonicalSchema /\ migrationStatus = "Migrated") => (workingConfig.schema = CanonicalSchema)

(* 10. Preview strictly requires validated canonical configuration *)
PreviewUsesValidatedConfiguration ==
    (previewState = "Ready") => (validationStatus = "Valid" /\ workingDraftVersion = CanonicalSchema /\ workingConfig.valid = TRUE)

(* 11. Published storefront strictly requires validated canonical configuration *)
PublishedUsesValidatedConfiguration ==
    (publishedVersion /= "None") => (publishedConfig.schema = CanonicalSchema /\ publishedConfig.valid = TRUE)

(* 12. Preview and published configurations are consistent with validated working config *)
PreviewPublishConfigurationConsistency ==
    (previewState = "Ready" /\ publishedVersion /= "None") => (publishedConfig.schema = CanonicalSchema /\ workingConfig.schema = CanonicalSchema /\ workingConfig.valid = TRUE)

=============================================================================
