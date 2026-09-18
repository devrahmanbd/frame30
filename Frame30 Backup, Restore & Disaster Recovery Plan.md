# Frame30 Backup, Restore & Disaster Recovery Plan

**Status:** Normative production operating plan  
**Product:** Frame30 / QUBICKLE  
**Primary data platform:** Self-hosted Supabase/PostgreSQL  
**Primary application:** Frame30  
**Recovery objective:** Preserve customer data, isolate corruption, and rebuild the platform without trusting the compromised production environment.

---

# 1. Purpose

This document defines how Frame30 protects and recovers:

```text
PostgreSQL
Supabase Auth
Supabase Storage
Redis state
application configuration
secrets/configuration metadata
deployment state
release artifacts
DNS/domain configuration
audit/security records
```

The central principle is:

> **A production compromise must not be capable of destroying every recoverable copy of Frame30's data.**

The backup architecture therefore separates:

```text
LIVE DATA
    ↓
FAST RECOVERY
    ↓
OFF-SITE IMMUTABLE RECOVERY
    ↓
INDEPENDENT DISASTER RECOVERY
```

Self-hosted Supabase explicitly places backup and disaster-recovery responsibility on the operator; unlike the managed platform, self-hosting does not provide managed backups or PITR for the operator.

---

# 2. Recovery Objectives

These are the official Frame30 recovery targets.

| System | RPO | RTO |
|---|---:|---:|
| PostgreSQL | ≤ 5 minutes | ≤ 30 minutes |
| Supabase Auth data | ≤ 5 minutes | ≤ 30 minutes |
| Merchant Storage | ≤ 15 minutes | ≤ 60 minutes |
| Application configuration | ≤ 15 minutes | ≤ 30 minutes |
| Redis | ≤ 15 minutes or reconstructable | ≤ 15 minutes |
| Application runtime | 0 application-data RPO | ≤ 15 minutes |
| Full platform disaster | ≤ 15 minutes for critical data | ≤ 2 hours |

### Definitions

**RPO — Recovery Point Objective**

Maximum acceptable amount of data loss.

**RTO — Recovery Time Objective**

Maximum acceptable time from recovery invocation until critical service is operational.

These are measured during actual recovery drills, not inferred from backup frequency.

---

# 3. Recovery Architecture

```text
                         FRAME30
                            │
              ┌─────────────┼─────────────┐
              │             │             │
          PostgreSQL      Storage       Redis
              │             │             │
              ▼             ▼             ▼
           WAL/PITR      Object sync    Snapshot
              │             │             │
              └──────┬──────┴─────────────┘
                     │
                     ▼
              BACKUP ORCHESTRATOR
                     │
          ┌──────────┴──────────┐
          │                     │
      LOCAL FAST            OFF-SITE
      RECOVERY              RECOVERY
          │                     │
          │               IMMUTABLE/WORM
          │                     │
          └──────────┬──────────┘
                     │
                     ▼
             RECOVERY HOST
                     │
                     ▼
              VERIFIED RESTORE
                     │
                     ▼
                PRODUCTION
```

The production system is never the only copy.

---

# 4. Data Classes

Every Frame30 asset belongs to one of these classes.

## Class A — Authoritative data

Cannot be reconstructed automatically.

```text
PostgreSQL tenant data
orders
customers
products
pages
themes
merchant configuration
staff
permissions
billing records
auth records
```

Highest backup priority.

---

## Class B — Customer objects

```text
images
videos
documents
fonts
exports
uploaded media
merchant assets
```

Must have independent object backup.

---

## Class C — Reconstructable state

```text
Redis cache
temporary sessions
rate-limit counters
derived search indexes
compiled frontend artifacts
```

These may be reconstructed.

They should still have controlled recovery procedures.

---

## Class D — Infrastructure configuration

```text
Docker Compose
OpenResty configuration
HAProxy configuration
Caddy configuration
Supabase configuration
database configuration
Storage configuration
DNS configuration
monitoring configuration
deployment manifests
```

Must be version-controlled and backed up.

---

## Class E — Secrets

```text
JWT secrets
database credentials
Storage credentials
SMTP credentials
OAuth credentials
payment credentials
deployment credentials
backup credentials
```

Secrets require encrypted recovery copies, but plaintext secrets must never be included in ordinary logs or unencrypted backup archives.

---

# 5. Canonical Backup Layers

Frame30 has five recovery layers.

```text
L0 — Live
L1 — WAL/PITR
L2 — Full backup
L3 — Immutable off-site backup
L4 — Disaster recovery environment
```

Each layer has a separate purpose.

---

# 6. L0 — Live Data

The live production environment is not considered a backup.

It contains:

```text
PostgreSQL
Storage
Redis
application configuration
```

A second server is not a backup if it is writable from the same compromised trust domain.

---

# 7. L1 — PostgreSQL WAL/PITR

PostgreSQL WAL records changes to the database and can be archived continuously. A base backup plus a continuous WAL archive supports point-in-time recovery to a chosen recovery target. PostgreSQL also warns that logical `pg_dump` backups cannot substitute for continuous WAL archiving.

Frame30 therefore uses:

```text
PostgreSQL
    ↓
WAL archive
    ↓
off-site repository
```

WAL/PITR is the primary mechanism for achieving the ≤5-minute PostgreSQL RPO.

---

# 8. PostgreSQL Physical Backup Engine

Use a PostgreSQL physical-backup system capable of:

```text
base backups
incremental/differential backup where useful
WAL archiving
retention management
checksum/integrity verification
parallel backup/restore
encrypted repository storage
```

The production implementation should use **pgBackRest** as the backup orchestration layer.

Logical dumps remain an additional recovery tool, not the primary PITR mechanism.

---

# 9. PostgreSQL Backup Schedule

The authoritative database schedule is:

```text
WAL:
continuous

Full physical backup:
daily

Logical backup:
daily

Weekly restore:
weekly

Full DB recovery drill:
monthly
```

Logical dumps provide a second recovery format useful for schema/object-level recovery.

---

# 10. Why Keep Both Physical and Logical Backups?

Physical backup provides:

```text
fast
complete
PITR-capable
whole-cluster recovery
```

Logical backup provides:

```text
table-level extraction
schema inspection
selective recovery
migration validation
tenant-level recovery tooling
```

PostgreSQL documents SQL dumps, physical backups, and continuous archiving as distinct backup strategies with different capabilities.

Therefore Frame30 maintains both.

---

# 11. PostgreSQL Backup Contents

The recovery set must include:

```text
all application schemas
auth schema/data
merchant data
RLS policies
functions
triggers
extensions
roles
grants
database configuration required for recovery
migration state
```

The backup manifest records:

```text
database version
backup ID
timeline
LSN
backup start
backup end
WAL range
schema/migration revision
checksum
```

Supabase's own restore documentation similarly distinguishes database schema/data/roles/RLS/functions from external configuration such as JWT secrets, OAuth settings, SMTP, and Storage objects; Frame30 therefore treats these as separate recovery assets.

---

# 12. PostgreSQL Backup Encryption

Database backups must be encrypted before or at the backup repository layer.

The encryption key must not be stored only on the production host.

Architecture:

```text
Backup data
    ↓
encrypted archive
    ↓
off-site repository

Recovery key
    ↓
separate security boundary
```

Recovery key custody:

```text
normal production:
    cannot export recovery master key

break-glass:
    authorized operator
    + MFA
    + audited recovery procedure
```

---

# 13. PostgreSQL Backup Retention

Use this canonical retention:

```text
Daily:
35 copies

Weekly:
12 copies

Monthly:
24 copies

Annual:
3 copies
```

The oldest recovery point should not be automatically deletable merely because a production host is compromised.

Retention enforcement occurs at the independent backup repository.

---

# 14. PostgreSQL WAL Retention

WAL must remain continuously available for at least the oldest base backup that is still retained.

The backup system must not delete WAL required to recover any retained physical backup.

PostgreSQL explicitly requires a continuous sequence of archived WAL extending back at least to the start of the selected base backup.

---

# 15. WAL Freshness SLO

Frame30 monitors:

```text
current PostgreSQL WAL position
latest successfully archived WAL position
```

### Target

```text
99.9% of five-minute measurement windows:
archive lag ≤ 60 seconds

Hard limit:
archive lag must never remain > 5 minutes
```

Violation:

```text
SEV-1 operational incident
```

because the ≤5-minute database RPO can no longer be guaranteed.

---

# 16. PostgreSQL Full Backup SLO

### Target

```text
≥99.9% of scheduled daily physical backups
complete successfully.
```

A failed backup must automatically retry.

If the next backup window begins while the previous backup remains unresolved:

```text
SEV-1
```

because the recovery-chain integrity is uncertain.

---

# 17. Logical Database Backup

Daily logical backup produces:

```text
roles.sql
schema.sql
data.sql
grants.sql
rls.sql
functions.sql
```

or equivalent structured dumps.

These are retained separately from physical backups.

Purpose:

```text
tenant recovery
schema inspection
manual record recovery
migration recovery
```

Logical backup is not treated as the PITR mechanism.

---

# 18. Supabase Storage

Supabase Storage is not included as file content in a normal PostgreSQL database backup; the database contains Storage metadata while the actual objects live separately. Supabase explicitly documents this separation.

Therefore:

> **Storage has its own backup pipeline.**

Never assume:

```text
DB restored
=
merchant files restored
```

---

# 19. Primary Storage Architecture

For production Frame30, Supabase Storage should use an S3-compatible backend rather than relying on the application host's local filesystem as the durability boundary.

Self-hosted Supabase supports an S3-compatible Storage backend and an S3 protocol endpoint; its documentation identifies S3-compatible backends as an option for durability and scalability.

Target:

```text
Supabase Storage
      ↓
S3-compatible object storage
      ↓
versioning enabled
```

---

# 20. Storage Backup Architecture

```text
Primary Storage
      │
      ├── object versioning
      │
      ▼
Backup replication
      │
      ▼
Independent S3 repository
      │
      └── immutable retention
```

The backup repository must be outside the production host's administrative trust boundary.

---

# 21. Storage Retention

Primary object versions:

```text
retain according to operational lifecycle
```

Backup repository:

```text
35 daily-equivalent recovery windows
12 weekly
24 monthly
3 annual
```

Objects referenced by a retained database recovery point must remain recoverable for at least as long as that database recovery point.

---

# 22. Storage Deletion Safety

When a merchant deletes:

```text
image
document
font
asset
```

production storage may create a deletion marker/version rather than permanently destroying the only recoverable copy.

The immutable recovery repository retains the old version during the retention period.

This protects against:

```text
accidental deletion
malicious deletion
ransomware
compromised admin
```

---

# 23. Storage Integrity

Each object record should track, where practical:

```text
object ID
merchant ID
site ID
object key
size
content hash/checksum
creation time
update time
storage version ID
```

The recovery system can then compare:

```text
Postgres metadata
        ↔
object-store inventory
```

and detect:

```text
missing object
unexpected object
checksum mismatch
orphaned object
```

---

# 24. Object Restore Consistency

Database and Storage are separate systems.

Frame30 therefore maintains a logical storage ledger.

Conceptually:

```text
storage_objects

object_id
merchant_id
site_id
storage_key
storage_version
content_hash
created_at
deleted_at
state
```

Object mutation follows:

```text
upload
  ↓
temporary object
  ↓
content verification
  ↓
DB metadata transaction
  ↓
committed object
```

This prevents the application from treating an unverified upload as authoritative.

---

# 25. Storage Restore Algorithm

For a recovery timestamp `T`:

```text
restore PostgreSQL → T
        ↓
read storage_objects as of T
        ↓
identify required object versions
        ↓
restore matching object versions
        ↓
verify checksums
        ↓
remove/ignore objects not valid at T
        ↓
run application integrity checks
```

This makes Storage recovery follow the database's authoritative state rather than simply restoring the newest object bucket.

---

# 26. Redis Backup Strategy

Redis is divided into two classes.

## Reconstructable

```text
cache
rate-limit counters
temporary sessions
derived state
```

These are not primary backup data.

## Durable

Anything whose loss changes business correctness:

```text
queued jobs
workflow state
irreplaceable processing state
```

must not exist only in Redis.

Required rule:

> **Business-critical state must have PostgreSQL or another durable source of truth.**

Redis can accelerate it.

Redis should not be the only copy of an order, payment action, inventory reservation, or irreplaceable job.

---

# 27. Redis Recovery

Normal recovery:

```text
restore PostgreSQL
        ↓
start Redis empty
        ↓
rebuild cache
        ↓
rebuild derived state
        ↓
resume workers
```

Optional Redis snapshots are retained:

```text
daily
```

for operational acceleration only.

Redis loss does not count as database data loss if all authoritative data is durable elsewhere.

---

# 28. Configuration Backup

Back up:

```text
Docker Compose
deployment manifests
OpenResty configs
HAProxy configs
Caddy configs
Supabase deployment configuration
database configuration
Storage configuration
monitoring configuration
DNS configuration
release registry metadata
feature flags
```

The canonical source is Git where appropriate.

A secondary encrypted snapshot is stored in the recovery repository.

---

# 29. Configuration Versioning

Every production configuration state receives:

```text
config_version
commit SHA
created_at
operator
checksum
```

Example:

```text
frame30-prod-config-2026-09-18T18:30Z
```

A disaster restore must recreate the configuration from a known version rather than reconstructing settings manually from memory.

---

# 30. Secrets Backup

Secrets must not be dumped casually into configuration backups.

Back up only:

```text
encrypted secret material
key metadata
secret identifiers
rotation metadata
recovery instructions
```

The recovery set must allow authorized recovery personnel to reconstruct the production environment without storing plaintext credentials beside the backups.

---

# 31. Secret-Recovery Procedure

```text
restore application
      ↓
restore secret metadata
      ↓
authorized operator retrieves recovery key
      ↓
decrypt required secrets
      ↓
inject into recovery environment
      ↓
start services
```

All secret recovery actions are audited.

---

# 32. Release Artifact Backup

Every production release records:

```text
release number
Git SHA
Docker image digest
SBOM
artifact provenance
deployment manifest
migration revision
```

The production registry should retain all releases required by the retention policy.

Critical releases are additionally mirrored to the independent recovery repository or a separate registry.

---

# 33. Release Recovery

Application recovery does not require rebuilding from source if an approved image exists.

Preferred:

```text
immutable image digest
        ↓
pull
        ↓
start
```

Source rebuild is the secondary recovery path.

This protects against:

```text
GitHub outage
CI outage
dependency disappearance
registry outage
```

---

# 34. Git Repository Recovery

The repository is source-of-truth for:

```text
application
database migrations
infrastructure configuration
deployment code
backup automation
restore automation
security tests
```

Production depends on immutable Git releases and artifacts rather than mutable branches.

---

# 35. DNS Recovery

Back up:

```text
domain
record type
value
TTL
provider
verification records
custom-domain mappings
```

Do not rely on the production server as the DNS source of truth.

---

# 36. TLS/Certificate Recovery

Certificates should not be the primary disaster-recovery dependency.

Recovery procedure:

```text
rebuild edge
      ↓
restore DNS
      ↓
restore ACME configuration
      ↓
reissue certificates
```

Encrypted certificate backup may be retained as an additional emergency measure, but the platform must be capable of recovering through ACME issuance.

---

# 37. Backup Manifest

Every backup execution creates a signed/hashed manifest.

Example:

```json
{
  "backup_id": "2026-09-18T020000Z",
  "created_at": "...",
  "postgres": {
    "base_backup": "...",
    "wal_start": "...",
    "wal_end": "...",
    "timeline": 4,
    "lsn": "..."
  },
  "storage": {
    "inventory_hash": "...",
    "snapshot": "..."
  },
  "redis": {
    "snapshot": "..."
  },
  "config": {
    "version": "..."
  },
  "release": {
    "version": "2.8",
    "image_digest": "sha256:..."
  }
}
```

The manifest is stored outside the production database.

---

# 38. Backup Catalog

Maintain a recovery catalog containing:

```text
backup ID
type
creation time
coverage start
coverage end
Postgres LSN
WAL range
Storage snapshot
config revision
release version
checksums
verification status
retention expiry
```

`/root/recovery` reads from this catalog.

---

# 39. Backup Integrity Verification

Every completed backup is verified.

Verification includes:

```text
archive readable
checksums valid
manifest valid
expected files present
WAL chain valid
Storage inventory valid
encryption metadata valid
```

Target:

```text
100% of backup sets receive a verification result.
```

---

# 40. Daily Backup Job

Canonical daily flow:

```text
01. Create PostgreSQL base backup
02. Confirm WAL archiving
03. Snapshot/replicate Storage
04. Export logical DB backup
05. Snapshot configuration
06. Record release/config state
07. Verify all checksums
08. Produce recovery manifest
09. Encrypt manifest
10. Upload manifest to independent storage
11. Apply retention
12. Emit success/failure event
```

A daily backup is not considered successful until every required component has a corresponding verified state.

---

# 41. Backup Job SLO

```text
≥99.9% successful scheduled backup cycles
```

A backup cycle is successful only if:

```text
Postgres = PASS
Storage = PASS
logical dump = PASS
config = PASS
manifest = PASS
off-site upload = PASS
verification = PASS
```

A partial backup is recorded as failed, not successful.

---

# 42. Backup Freshness SLO

PostgreSQL:

```text
99.9% of measurement windows:
WAL archive lag ≤60 seconds
```

Storage:

```text
99.9%:
backup replication lag ≤15 minutes
```

Configuration:

```text
100%:
every production change appears in recovery storage
within 15 minutes
```

---

# 43. Weekly Restore Smoke Test

Every week, automatically:

```text
1. Select latest backup
2. Create isolated recovery environment
3. Restore PostgreSQL
4. Restore critical Storage sample
5. Start application
6. Validate schema
7. Validate RLS
8. Run tenant A/B tests
9. Run critical application smoke tests
10. Destroy recovery environment
11. Record result
```

Target:

```text
100% scheduled weekly tests complete successfully.
```

---

# 44. Monthly Full Database Restore

Once per month:

```text
1. Select a production recovery point
2. Restore complete PostgreSQL cluster
3. Apply WAL to exact recovery target
4. Restore required Storage
5. Start Frame30
6. Run authentication tests
7. Run tenant-isolation tests
8. Run core business workflows
9. Measure RPO
10. Measure RTO
```

Target:

```text
RPO ≤5 minutes
RTO ≤30 minutes
```

---

# 45. Quarterly Full Disaster Recovery

Once per quarter, simulate:

```text
production host destroyed
```

The recovery team starts from:

```text
clean host
trusted infrastructure code
immutable release
off-site backup
recovery credentials
```

No production filesystem is reused.

Recovery:

```text
clean OS
 ↓
Docker/runtime
 ↓
Caddy
 ↓
HAProxy
 ↓
OpenResty
 ↓
Supabase
 ↓
PostgreSQL restore
 ↓
Storage restore
 ↓
Frame30
 ↓
verification
 ↓
traffic
```

Target:

```text
RPO ≤15 minutes
RTO ≤2 hours
```

---

# 46. Recovery Point Selection

Never restore directly to "latest backup" during suspected corruption.

Use:

```text
incident timeline
      ↓
identify corruption window
      ↓
choose pre-corruption recovery point
      ↓
restore to isolated environment
      ↓
validate
      ↓
promote
```

If a compromised administrator deleted data at:

```text
14:42:17
```

restore to:

```text
14:42:00
```

or an appropriately earlier verified point rather than blindly restoring the newest backup.

PostgreSQL PITR supports recovery targets by date/time and named restore points.

---

# 47. Named Recovery Points

For dangerous operations, create an application/DB restore marker before execution.

Examples:

```text
before-migration-2.9
before-bulk-import-984
before-merchant-delete
before-schema-contract
before-major-release-3.0
```

The marker is recorded in the recovery catalog and PostgreSQL recovery metadata.

This gives operators a known rollback target.

---

# 48. Application Rollback vs Data Recovery

These must remain separate.

## Bad application release

```text
2.8
 ↓
rollback
 ↓
2.7
```

No database restore.

## Corrupted database

```text
restore PostgreSQL
 ↓
PITR
```

## Destroyed host

```text
rebuild host
 ↓
restore PostgreSQL + Storage + config
```

Do not use a full database restore to solve an ordinary application deployment problem.

---

# 49. Tenant-Level Recovery

The default pooled database cannot simply be restored wholesale when one merchant accidentally deletes something.

Use three layers.

### Fast recovery

Application-level recycle bin / soft-delete for reversible resources.

Target:

```text
≤15 minutes
```

for common accidental deletion recovery.

### Selective database recovery

```text
restore historical DB to isolated environment
        ↓
extract required tenant/resource data
        ↓
validate relationships
        ↓
merge through application-aware restore tooling
```

### Full recovery

Used when corruption is broad.

```text
PITR entire cluster
```

---

# 50. Tenant Recovery Safety Rule

Never perform selective tenant extraction by blindly copying rows.

The restore engine must understand:

```text
merchant
site
staff
products
variants
orders
customers
media metadata
relations
foreign keys
audit records
```

and restore in dependency order.

Before merge:

```text
tenant ID must match
foreign keys must resolve
RLS tests must pass
```

---

# 51. Storage Tenant Recovery

For a tenant-level restore:

```text
restore DB state
      ↓
calculate required object set
      ↓
locate object versions in immutable storage
      ↓
restore only matching merchant objects
      ↓
verify checksums
      ↓
reconcile metadata
```

No global bucket replacement should be required for an ordinary single-merchant restore.

---

# 52. Recovery Integrity Checks

After any recovery:

```text
row counts
foreign-key integrity
RLS policies
tenant isolation
storage-object checksums
orphaned object scan
missing object scan
critical indexes
extensions
database roles
application health
```

Then execute:

```text
TENANT_A → TENANT_A
TENANT_A → TENANT_B = DENY

TENANT_B → TENANT_B
TENANT_B → TENANT_A = DENY
```

Recovery is not complete until these pass.

---

# 53. Post-Recovery Security Reset

After a hostile compromise, restoration is followed by credential reset.

Depending on incident scope:

```text
database credentials
JWT secrets
API keys
webhook secrets
Storage credentials
SMTP credentials
OAuth credentials
deployment credentials
backup credentials
admin sessions
```

Invalidate old sessions where necessary.

Do not restore compromised credentials merely because they existed at the recovery timestamp.

---

# 54. Recovery Environment Isolation

The recovery environment must initially be:

```text
not publicly reachable
```

until:

```text
database verified
storage verified
application verified
auth verified
tenant isolation verified
security telemetry verified
```

Only then is production traffic enabled.

---

# 55. Recovery Traffic Cutover

```text
recovery environment
       │
       ▼
health
       │
       ▼
security tests
       │
       ▼
limited traffic
       │
       ▼
monitor
       │
       ▼
full traffic
```

The compromised production host is not automatically reintroduced.

---

# 56. Disaster Recovery Host

The 16 GB server is designated as the emergency recovery/staging host.

It must be capable of:

```text
PostgreSQL recovery target
Supabase services
Frame30 application
Storage client
Caddy
HAProxy
OpenResty
monitoring
```

However:

> **It is not itself the backup.**

Backups remain off-host and independently protected.

---

# 57. Backup Storage Trust Model

Production has:

```text
write/backup capability
```

but the ordinary application has:

```text
no backup-administration capability
```

The recovery repository has:

```text
immutable retention
separate credentials
separate audit
separate administrative boundary
```

A compromised application must not be able to:

```text
list every backup credential
delete backup history
change retention
disable object lock
```

---

# 58. Immutability

The independent backup repository should use WORM/object-lock semantics where available.

For example, S3 Object Lock supports retention periods that prevent an object version from being deleted or overwritten during the retention period.

Frame30 recovery data should use immutable retention for:

```text
daily backups
weekly backups
monthly backups
annual recovery copies
```

---

# 59. Encryption

Backup encryption has two layers:

```text
Transport:
TLS

Storage:
encryption at rest

Archive:
application/backup-level encryption where appropriate
```

Encryption keys are stored separately from backup payloads.

A production host compromise should not expose the complete recovery key hierarchy.

---

# 60. Backup Repository Separation

Use this topology:

```text
PRODUCTION
   │
   └── backup writer
          │
          ▼
INDEPENDENT BACKUP ACCOUNT
          │
          ├── immutable repository
          │
          └── encrypted manifests
```

The backup account is not the same security identity used to administer Frame30.

---

# 61. Recovery Manifest Integrity

Every backup manifest should be cryptographically hashed.

The recovery catalog records:

```text
manifest hash
backup hash/checksum
creation time
operator/automation identity
```

When restoring:

```text
download manifest
 ↓
verify hash/signature
 ↓
verify backup matches manifest
 ↓
restore
```

A modified recovery artifact must fail validation.

---

# 62. Monitoring

The existing observability stack monitors:

```text
backup lag
backup success
backup size
WAL archive lag
storage replication lag
restore-test result
RPO
RTO
backup retention
repository health
encryption failures
```

Alert examples:

```text
WAL lag >60 seconds
Storage backup lag >15 minutes
backup failed
backup repository unavailable
immutable retention failure
restore test failed
RPO target exceeded
RTO target exceeded
backup size sudden anomaly
```

---

# 63. Backup Anomaly Detection

The backup system should detect unexpected changes in:

```text
database size
backup size
WAL volume
Storage object count
Storage byte count
number of deletions
number of modified objects
```

Example:

```text
normal:
100–200 GB/day

sudden:
12 TB/day
```

should alert.

This can indicate:

```text
ransomware
accidental bulk operation
application loop
abuse
backup misconfiguration
```

---

# 64. Recovery SLO Dashboard

`/root/recovery` displays:

```text
FRAME30 RECOVERY

PostgreSQL
────────────────────────
WAL lag:                 21 sec
RPO target:              ≤5 min
Last full backup:        PASS
Last logical backup:     PASS
Last restore test:       PASS
Measured RTO:            18m
Measured RPO:            2m

Storage
────────────────────────
Replication lag:         4m
RPO target:              ≤15 min
Object integrity:        PASS

Recovery plane
────────────────────────
Immutable copies:        HEALTHY
Backup repository:       HEALTHY
Retention:               HEALTHY

Disaster Recovery
────────────────────────
Last monthly drill:      PASS
Last quarterly drill:    PASS
Last full RTO:           1h 24m
Target:                  ≤2h
```

---

# 65. Backup SLO Scorecard

Target state:

```text
Daily backup completion                 ≥99.9%
WAL archive lag                         ≤60 sec normally
Hard WAL RPO                            ≤5 min
Storage backup lag                      ≤15 min
Verified backup sets                    100%
Weekly restore tests                    100% pass
Monthly DB recovery drills              100% pass
Quarterly DR exercises                  100% pass
Recovery-point integrity                100%
Immutable recovery availability         100%
Overdue recovery exercise                0
Unknown backup age                      0
```

---

# 66. Canonical Recovery Cadence

This is the only authoritative recovery schedule.

| Frequency | Operation | Owner |
|---|---|---|
| Continuous | PostgreSQL WAL/PITR | DBO |
| Continuous/near-continuous | Storage version/replication | DBO |
| Daily | Full PostgreSQL backup | DBO |
| Daily | Logical PostgreSQL backup | DBO |
| Daily | Storage reconciliation/backup verification | DBO |
| Daily | Configuration snapshot/reconciliation | DO |
| Daily | Backup integrity verification | DBO |
| Weekly | Automated restore smoke test | DBO |
| Monthly | Full PostgreSQL recovery drill | DBO |
| Quarterly | Full platform disaster recovery exercise | PL + DBO + DO |
| Quarterly | Recovery credentials/runbook review | SO + PL |
| Annually | Full disaster architecture review | PL + SO + DBO |

No duplicate cadence definitions elsewhere in this plan override this table.

---

# 67. Ownership Matrix

| Asset/process | Accountable owner | Operational owner |
|---|---|---|
| PostgreSQL PITR | DBO | DBO |
| PostgreSQL full backup | DBO | DBO |
| Logical DB backup | DBO | DBO |
| Storage backup | DBO | DBO |
| Redis recovery | AO | AO |
| Configuration recovery | DO | DO |
| Release artifact recovery | PL | DO |
| Backup repository | DBO | DO |
| Recovery credentials | SO | SO |
| Recovery host | DO | DO |
| Restore automation | DBO | DO |
| Recovery drills | DBO | DBO |
| Disaster exercises | PL | DBO + DO |
| Recovery incident | IRO | IRO |

---

# 68. Backup Failure Algorithm

```text
backup job
    ↓
FAIL
    ↓
retry
    ↓
FAIL
    ↓
alert DBO
    ↓
verify previous valid recovery point
    ↓
if RPO still satisfied:
      continue with incident

if RPO threatened:
      SEV-1
      stop nonessential risky operations
      restore backup pipeline
```

A failed backup is not silently ignored.

---

# 69. Restore Failure Algorithm

```text
restore
   ↓
FAIL
   ↓
capture evidence
   ↓
try alternate valid recovery point
   ↓
FAIL
   ↓
try second recovery repository
   ↓
FAIL
   ↓
SEV-1
   ↓
recovery incident commander
```

Never modify the only copy of a backup during an experimental restore.

Always restore into a disposable target.

---

# 70. Do Not Destroy the Source During Recovery

The original recovery artifacts are immutable.

Never:

```text
download backup
 ↓
modify it
 ↓
overwrite backup
```

Instead:

```text
immutable backup
       ↓
read-only source
       ↓
restore workspace
       ↓
experimental recovery
```

Every recovery attempt gets a fresh workspace.

---

# 71. Recovery Evidence Package

Every restore generates:

```text
recovery_id
backup_id
target_time
target_LSN
source repository
source checksum
restore start
restore finish
database version
application release
storage version
RPO measured
RTO measured
tenant isolation result
application test result
operator
result
```

This becomes the permanent proof that recovery actually worked.

---

# 72. Post-Incident Recovery

After a compromise:

```text
1. isolate compromised infrastructure
2. preserve evidence
3. revoke credentials
4. determine compromise window
5. identify trusted recovery point
6. restore to isolated environment
7. validate data
8. validate tenant isolation
9. validate application
10. rebuild infrastructure
11. rotate secrets
12. cut traffic
13. monitor
14. preserve compromised environment for investigation
```

Do not overwrite forensic evidence with a rushed reinstall unless life/safety or business continuity requires it.

---

# 73. Data Corruption Recovery

When corruption is detected:

```text
current production
       │
       ├── remains available if safe
       │
       ▼
restore candidate at T-1
       │
       ▼
compare against production
       │
       ▼
identify corruption window
       │
       ▼
select recovery target
       │
       ▼
restore
```

Do not automatically restore the latest full backup.

The correct target is the latest **known-good** state.

---

# 74. Ransomware / Destructive Attack

If production is suspected compromised:

```text
STOP
do not trust production
do not delete evidence
do not restore over compromised host
do not modify immutable backup
```

Then:

```text
isolate host
      ↓
revoke credentials
      ↓
verify recovery repository
      ↓
select known-good point
      ↓
build clean environment
      ↓
restore DB
      ↓
restore Storage
      ↓
restore config
      ↓
deploy trusted release
      ↓
validate
      ↓
cut traffic
```

---

# 75. Recovery Readiness Test

Frame30 is considered recovery-ready only if all are true:

```text
✓ latest WAL is within RPO
✓ valid full backup exists
✓ off-site immutable copy exists
✓ Storage recovery exists
✓ release artifact exists
✓ configuration is recoverable
✓ recovery credentials work
✓ recovery host can be provisioned
✓ weekly restore passed
✓ monthly DB restore passed
✓ quarterly DR passed
```

Any failed requirement is visible in `/root/recovery`.

---

# 76. Final Recovery Architecture

```text
                              FRAME30
                                 │
             ┌───────────────────┼───────────────────┐
             │                   │                   │
         PostgreSQL           Storage              Redis
             │                   │                   │
          WAL/PITR          Object versions       snapshot
             │                   │                   │
             ▼                   ▼                   ▼
      ┌─────────────────────────────────────────────────┐
      │              BACKUP ORCHESTRATOR                │
      └────────────────────────┬────────────────────────┘
                               │
                  ┌────────────┴────────────┐
                  │                         │
              FAST LOCAL               OFF-SITE
              RECOVERY                 IMMUTABLE
                  │                         │
                  │                    Object Lock
                  │                    encryption
                  │                    independent IAM
                  │                         │
                  └────────────┬────────────┘
                               │
                        RECOVERY HOST
                               │
                       restore + verify
                               │
                  ┌────────────┴────────────┐
                  │                         │
             Tenant A/B                  critical
             isolation                   workflows
                  │                         │
                  └────────────┬────────────┘
                               │
                         PRODUCTION
```

---

# 77. Final Backup/Restore Contract

Frame30's backup system is considered healthy when:

```text
PostgreSQL RPO              ≤5 minutes
Storage RPO                 ≤15 minutes
Full disaster RPO           ≤15 minutes
PostgreSQL RTO              ≤30 minutes
Full disaster RTO           ≤2 hours

Scheduled backup success    ≥99.9%
Backup verification         100%
Weekly restore success      100%
Monthly recovery success    100%
Quarterly DR success        100%

Independent recovery copy   always available
Immutable recovery copy    always available

Unauthorized backup deletion
                              0

Recovery tests overdue       0

Unknown recovery state       0
```

---

# 78. Final Principle

The backup strategy is not:

> **"We take a database backup every night."**

It is:

> **"At any moment, Frame30 can identify its latest valid recovery point, prove that the recovery artifacts are intact, restore the database and customer objects into a clean environment, verify tenant isolation and application correctness, and resume service within the documented recovery objectives."**

The architecture therefore separates:

```text
Backup
    =
copy data safely

Verification
    =
prove the copy is usable

Recovery
    =
restore into a clean environment

Validation
    =
prove the restored environment is correct

Disaster recovery
    =
operate without trusting the failed environment
```

For self-hosted Supabase, this separation is essential because backups, PITR, Storage objects, configuration, and disaster recovery are operator responsibilities rather than a single managed backup feature. Supabase's documentation also explicitly separates database backup from Storage objects and notes that self-hosting places backup/DR responsibility on the operator.

The result should be measurable in one statement:

> **Frame30 must never have only one copy of important data, must never depend on the production host for recovery, and must never claim recoverability without a successful restore test.**