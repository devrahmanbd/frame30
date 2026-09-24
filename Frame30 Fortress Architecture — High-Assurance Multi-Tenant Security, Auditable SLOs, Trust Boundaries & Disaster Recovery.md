# Frame30 Fortress Architecture

## High-Assurance Multi-Tenant Security, Auditable SLOs, Trust Boundaries, Ownership, and Disaster Recovery

**Status:** Normative architecture and operating standard  
**Product:** Frame30 / QUBICKLE  
**Applies to:** Production, staging, CI/CD, application runtime, data plane, control plane, and recovery plane

---

# 0. Executive Security Objective

Frame30 is a highly dynamic pooled multi-tenant SaaS.

The system is designed around one central requirement:

> **A successful compromise of one layer must not automatically become a compromise of all tenants, all application data, the production host, the QUBICKLE control plane, and every recovery copy.**

The architecture therefore treats security as a combination of:

```text
Tenant isolation
+
Least privilege
+
Explicit trust boundaries
+
Blast-radius containment
+
Supply-chain integrity
+
Continuous verification
+
Independent recovery
```

The product must remain:

```text
fast
dynamic
highly customizable
```

without turning customer-controlled data into arbitrary privileged code.

---

# 1. Security Doctrine

## 1.1 Zero implicit trust

The following are never trusted solely because they originate from an internal or familiar source:

- network location
- internal IP
- proxy header
- tenant ID
- browser state
- container identity
- "internal" endpoint
- worker payload
- service-to-service request

Every privileged action establishes authorization explicitly.

---

## 1.2 Tenant identity is derived, not supplied

Client input is never authoritative for:

```text
merchant_id
site_id
role
platform privilege
resource ownership
```

Tenant context comes from trusted resolution.

For storefronts:

```text
Host/domain
    ↓
verified domain mapping
    ↓
site_id
    ↓
merchant_id
```

For dashboard requests:

```text
authenticated user
    ↓
merchant_members
    ↓
merchant_id
    ↓
site access
```

---

## 1.3 Tenant context is immutable per request

Every request creates exactly one authoritative:

```text
TenantContext
```

containing, as applicable:

```text
merchant_id
site_id
user_id
request_id
source
```

Once created, ordinary application code cannot replace the merchant or site context.

Any cross-tenant platform operation must use an explicitly separate privileged operation.

---

## 1.4 Every privilege has a boundary

Desired blast-radius progression:

```text
Browser compromise
    ↓
user/session

Merchant compromise
    ↓
merchant scope

Frame30 RCE
    ↓
application/container scope

Worker compromise
    ↓
worker scope

Host compromise
    ↓
host scope

Control-plane compromise
    ↓
control-plane scope

Recovery plane
    ↓
independently protected
```

---

## 1.5 Recovery is part of security

A security system is incomplete if it can detect an attack but cannot restore trustworthy state.

Frame30 must be capable of:

```text
detect
→ contain
→ revoke
→ rebuild
→ restore
→ verify
→ resume
```

without trusting a compromised production host.

---

# 2. Explicit Threat Model

## 2.1 Assets

### Tenant assets

```text
merchants
sites
products
orders
customers
payments
staff
themes
pages
content
analytics
exports
```

### Tenant secrets

```text
payment credentials
courier tokens
OAuth credentials
webhook secrets
API keys
integration secrets
```

### Platform assets

```text
Supabase database
Redis
Storage
application source
release artifacts
deployment credentials
HAProxy
OpenResty
Caddy
/root
host OS
Docker
monitoring
DNS
TLS credentials
```

### Recovery assets

```text
database backups
WAL archives
Storage backups
configuration backups
release images
audit logs
recovery credentials
```

---

# 3. Threat Actors

## T1 — Anonymous Internet attacker

Can:

```text
send HTTP requests
probe endpoints
submit malformed input
attempt XSS
attempt SSRF
upload files
flood endpoints
probe webhooks
```

Cannot be assumed authenticated.

---

## T2 — Compromised merchant user

Has legitimate access to one merchant and attempts:

```text
cross-tenant access
privilege escalation
resource IDOR
platform access
shared infrastructure abuse
```

---

## T3 — Compromised merchant integration

Possesses one merchant's:

```text
API key
OAuth token
webhook credential
integration token
```

and attempts lateral movement.

---

## T4 — Compromised dependency or build component

Targets:

```text
npm package
transitive dependency
GitHub Action
Docker image
CI tool
registry
build plugin
```

---

## T5 — Compromised Frame30 application

Attacker achieves one or more of:

```text
XSS
SSRF
RCE
authorization bypass
template injection
unsafe upload execution
```

---

## T6 — Compromised worker

Attacker obtains execution through:

```text
job payload
file
webhook
external integration
dependency
```

---

## T7 — Compromised developer

Attacker gains:

```text
GitHub
CI
release
package-publishing
```

capabilities.

---

## T8 — Compromised platform operator

Attacker gains:

```text
/root
deployment credentials
SSH
platform administration
```

---

## T9 — Compromised production host

Attacker gains:

```text
root
Docker
host filesystem
```

---

## T10 — Malicious insider

Legitimate privileged operator intentionally attempts:

```text
data extraction
tenant access
release tampering
backup deletion
credential theft
```

---

# 4. Security Assumptions

Frame30 assumes:

1. The browser is hostile.
2. Merchant HTML may be hostile.
3. Merchant JavaScript may be hostile.
4. A merchant account may be compromised.
5. An application container may eventually be RCE'd.
6. Dependencies may eventually be compromised.
7. Developer credentials may eventually be compromised.
8. A production host may eventually be compromised.
9. Individual controls may contain bugs.
10. Backups may fail unless continuously verified.
11. A privileged operator may make a mistake.
12. A deployment may contain a security regression.

The architecture must remain survivable under those conditions.

---

# 5. Trust-Boundary Model

```text
┌───────────────────────────────────────────────────────────────┐
│                       UNTRUSTED WORLD                         │
│ Browser / Internet / Merchant JS / External Integrations     │
└─────────────────────────────┬─────────────────────────────────┘
                              │
                           TB-1
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                         EDGE ZONE                             │
│ Caddy → HAProxy → OpenResty                                  │
└─────────────────────────────┬─────────────────────────────────┘
                              │
                           TB-2
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                    APPLICATION ZONE                            │
│ Frame30 web/API containers · RED/BLUE releases               │
└───────────────┬──────────────────────┬────────────────────────┘
                │                      │
             TB-3                   TB-4
                │                      │
                ▼                      ▼
┌───────────────────────────┐   ┌──────────────────────────────┐
│       DATA ZONE           │   │       WORKER ZONE            │
│ Postgres / Redis /Storage │   │ imports / exports / webhooks │
└───────────────────────────┘   └──────────────────────────────┘
                │
                │ TB-5
                ▼
┌───────────────────────────────────────────────────────────────┐
│                    CONTROL PLANE                              │
│ /root · deployment agent · release promotion                 │
└─────────────────────────────┬─────────────────────────────────┘
                              │
                           TB-6
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                       HOST ZONE                              │
│ Linux / Docker / HAProxy / OpenResty / Caddy                 │
└─────────────────────────────┬─────────────────────────────────┘
                              │
                           TB-7
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                    RECOVERY ZONE                              │
│ immutable backups / WAL / off-site storage / recovery host   │
└───────────────────────────────────────────────────────────────┘
```

---

# 6. Trust Boundary Rules

## TB-1 — Internet → Edge

Everything is untrusted.

Controls:

```text
TLS
request-size limits
header normalization
rate limiting
protocol validation
request timeouts
DDoS controls
```

---

## TB-2 — Edge → Application

Only edge-generated routing context may be trusted.

Public requests must not be able to inject:

```text
X-Tenant-Id
X-Merchant-Id
X-Site-Id
```

and make those authoritative.

The canonical tenant source is:

```text
verified host/domain
+
authenticated identity
+
resource ownership
```

---

## TB-3 — Application → Data

Every tenant data operation is tenant-scoped.

This applies to:

```text
Postgres
Redis
Storage
cache
search
analytics
```

---

## TB-4 — Application → Worker

Every job carries:

```text
job_id
merchant_id
resource_id
operation
idempotency_key
```

The worker independently verifies that the resource belongs to the job's tenant.

---

## TB-5 — Application → Control Plane

Frame30 must not directly access:

```text
Docker socket
host filesystem
host shell
HAProxy admin socket
OpenResty administration
deployment credentials
backup credentials
/root
```

---

## TB-6 — Control Plane → Host

The deployment agent accepts only structured authenticated operations.

No generic:

```text
exec(command)
```

interface exists.

---

## TB-7 — Host → Recovery

Production can create recovery artifacts where required, but it cannot permanently destroy the entire historical recovery set.

---

# 7. Security Invariants

The following are non-negotiable release and operating invariants.

| ID     | Security invariant                    | Required result                        |
| ------ | ------------------------------------- | -------------------------------------- |
| INV-01 | Client cannot select arbitrary tenant | 0 successful bypasses                  |
| INV-02 | Cross-tenant read                     | 0 successful unauthorized cases        |
| INV-03 | Cross-tenant write                    | 0 successful unauthorized cases        |
| INV-04 | Cross-tenant storage access           | 0 successful unauthorized cases        |
| INV-05 | Cross-tenant cache leakage            | 0 successful test cases                |
| INV-06 | Cross-tenant background job           | 0 successful unauthorized cases        |
| INV-07 | Cross-tenant lock manipulation        | 0 successful unauthorized cases        |
| INV-08 | Application → host admin path         | 0 direct paths                         |
| INV-09 | Production artifact integrity         | 100% digest/provenance verification    |
| INV-10 | Sensitive action auditability         | 100%                                   |
| INV-11 | Recovery copies                       | At least 2 independent recovery layers |
| INV-12 | Recovery drill                        | 100% pass rate                         |
| INV-13 | Tenant-owned access has context       | 100%                                   |
| INV-14 | Destructive migration incompatibility | 0 production occurrences               |
| INV-15 | Unowned critical security control     | 0                                      |

---

# 8. Ownership Model

Roles are conceptually separate even when one person currently performs multiple roles.

```text
PO  = Product Owner
PL  = Platform Owner
SO  = Security Owner
AO  = Application Owner
DO  = DevOps/Infrastructure Owner
DBO = Database/Recovery Owner
IRO = Incident Response Owner
```

Every critical control has:

```text
accountable owner
operational owner
backup owner
SLO
evidence source
escalation path
```

No owner is a security defect.

---

# 9. Ownership Matrix

| Capability            | Accountable | Operational | Evidence               |
| --------------------- | ----------- | ----------- | ---------------------- |
| Tenant authorization  | AO          | AO          | CI security suite      |
| PostgreSQL RLS        | DBO         | AO + DBO    | migration/test reports |
| Storage isolation     | AO          | AO          | storage tests          |
| Redis isolation       | AO          | AO          | namespace tests        |
| Worker security       | AO          | AO          | worker tests           |
| Container hardening   | DO          | DO          | image/runtime scan     |
| CI/CD integrity       | PL          | DO          | GitHub audit           |
| Artifact provenance   | PL          | DO          | attestation            |
| Host security         | DO          | DO          | host audit             |
| `/root` security      | PL          | PL          | admin audit            |
| Backup system         | DBO         | DBO         | backup dashboard       |
| Restore testing       | DBO         | DBO         | restore report         |
| Incident response     | SO          | IRO         | incident record        |
| Secrets               | SO          | DO          | secret inventory       |
| Observability         | DO          | DO          | monitoring             |
| Production deployment | PL          | DO          | deployment history     |

---

# 10. Auditable SLO Framework

Every SLO has five properties:

```text
Metric
Target
Measurement window
Evidence
Breach action
```

The SLO system is divided into:

```text
Security
Availability
Deployment
Recovery
Identity
Operations
```

---

# 11. Security SLOs

## SLO-S01 — Cross-tenant isolation

**Objective:** No unauthorized cross-tenant access.

**Target:**

```text
0 successful unauthorized cross-tenant requests
```

**Measurement:**

- every production release
- nightly automated adversarial suite
- weekly expanded fuzz suite

**Evidence:**

```text
CI test run
security test report
```

**Owner:** AO

**Breach action:**

```text
release blocked
incident opened
affected credentials/session invalidated
security review
```

---

## SLO-S02 — Tenant-context integrity

**Objective:** Every tenant-owned request has one canonical tenant context.

**Target:**

```text
100% of tenant-owned requests
```

**Measurement:** continuous.

**Evidence:**

```text
structured request telemetry
application contract tests
```

**Owner:** AO

**Breach action:** SEV-1 review.

---

## SLO-S03 — Privileged action auditability

**Objective:** Every sensitive privileged operation is auditable.

**Target:**

```text
100%
```

**Measurement:** continuous.

**Evidence:**

```text
audit log
```

**Owner:** SO

**Breach action:** privileged action blocked if audit sink unavailable, unless explicitly classified as emergency break-glass.

---

## SLO-S04 — Admin MFA

**Target:**

```text
100% of platform/root administrators
```

**Measurement:** continuous daily compliance check.

**Owner:** PL

**Evidence:** identity provider/admin inventory.

**Breach action:** access revoked until MFA is restored.

---

## SLO-S05 — Service-role governance

**Target:**

```text
100% of service-role usage belongs to an approved service
0 unexpected service-role callers
```

**Measurement:** daily.

**Evidence:**

```text
credential inventory
service configuration
audit logs
```

**Owner:** SO + DBO

**Breach action:** revoke credential, investigate caller.

---

## SLO-S06 — Security vulnerabilities

| Severity                    |           Triage | Remediation |
| --------------------------- | ---------------: | ----------: |
| Critical actively exploited |          ≤15 min |       ≤4 hr |
| Critical                    |          ≤30 min |      ≤24 hr |
| High                        |            ≤4 hr |     ≤7 days |
| Medium                      | ≤2 business days |    ≤30 days |
| Low                         |          ≤7 days |    ≤90 days |

**Evidence:**

```text
security tracker
dependency scan
SAST/DAST reports
```

**Owner:** SO

**Breach action:** exception requires documented expiry and owner; Critical/actively exploited issues block release.

---

# 12. Secret SLOs

## SLO-K01 — Secret ownership

**Target:**

```text
100% of production secrets have an owner
```

Measured daily.

---

## SLO-K02 — Secret rotation

**Target:**

```text
0 overdue critical secrets
```

Recommended maximum lifetime:

```text
temporary credentials       ≤24 hours
high-risk platform secrets  ≤90 days
```

Measured daily.

---

## SLO-K03 — Secret exposure

**Target:**

```text
0 secrets committed to protected repositories
0 secrets in client bundles
0 secrets in unapproved logs
```

Measured continuously through CI/push protection and periodic scans.

---

# 13. Supply-Chain SLOs

## SLO-SC01 — Artifact integrity

**Target:**

```text
100% of production artifacts
```

must have:

```text
source commit
immutable digest
build identity
provenance
SBOM
```

Measured per release.

---

## SLO-SC02 — Dependency lock integrity

**Target:**

```text
100% production builds use committed dependency lockfiles
```

Measured per CI build.

---

## SLO-SC03 — Unauthorized production artifact

**Target:**

```text
0 production deployments of unapproved digest
```

Measured continuously through deployment history.

---

# 14. Container/Host SLOs

## SLO-H01 — Application-to-host privilege

**Target:**

```text
0 Docker-socket accesses
0 privileged containers
0 host filesystem mounts
0 host-network application containers
```

unless an explicitly approved exception exists.

Measured on every deployment and daily runtime inspection.

---

## SLO-H02 — Container identity

**Target:**

```text
100% application containers run non-root
```

unless specifically justified and approved.

Measured per deployment.

---

## SLO-H03 — Host rebuildability

**Target:**

```text
100% of production host configuration reproducible
```

Evidence:

```text
version-controlled infrastructure/configuration
successful clean-host rebuild test
```

Measured quarterly.

---

# 15. Availability SLOs

## SLO-A01 — Critical application availability

For the critical Frame30 production path:

```text
monthly availability target: 99.95%
```

Measurement excludes pre-announced maintenance only when the service remains available through an approved deployment path.

---

## SLO-A02 — Critical API availability

```text
99.95% monthly
```

Measured from synthetic probes and production telemetry.

---

## SLO-A03 — Deployment downtime

**Target:**

```text
0 planned application downtime
```

Every normal release uses:

```text
BLUE/GREEN
health gate
promotion
graceful drain
```

---

## SLO-A04 — Graceful draining

**Target:**

```text
100% of production deployments
```

must remove the old slot from new traffic before termination.

Evidence:

```text
HAProxy/OpenResty deployment events
request drain telemetry
```

---

# 16. Deployment SLOs

## SLO-D01 — Candidate readiness

**Target:**

```text
95% of normal releases
candidate healthy within 5 minutes
```

No release may proceed while the candidate is unhealthy.

---

## SLO-D02 — Rollback initiation

**Target:**

```text
≤60 seconds
```

from authorized rollback command to rollback routing action.

---

## SLO-D03 — Candidate isolation

Before promotion:

```text
0 production traffic
```

unless the release is explicitly in a controlled canary phase.

---

## SLO-D04 — Security gate compliance

```text
100% releases
```

must pass:

```text
tests
cross-tenant tests
dependency scan
secret scan
artifact verification
migration compatibility
```

before promotion.

---

# 17. Recovery SLOs

These values become the canonical Frame30 recovery targets.

| System                  |                        RPO |     RTO |
| ----------------------- | -------------------------: | ------: |
| PostgreSQL              |                     ≤5 min | ≤30 min |
| Merchant Storage        |                    ≤15 min | ≤60 min |
| Redis                   | ≤15 min or reconstructable | ≤15 min |
| Application code/config |                0 data loss | ≤15 min |
| Critical configuration  |                    ≤15 min | ≤30 min |
| Full platform disaster  |      ≤15 min critical data |   ≤2 hr |

These are the official operating targets.

---

# 18. Canonical Recovery Cadence

This section is authoritative. No other section changes recovery frequency.

| Activity                                | Cadence                                                         | Purpose                         | Owner          |
| --------------------------------------- | --------------------------------------------------------------- | ------------------------------- | -------------- |
| PostgreSQL WAL/PITR                     | Continuous                                                      | ≤5 min DB RPO                   | DBO            |
| Full PostgreSQL backup                  | Daily                                                           | independent restore point       | DBO            |
| Storage backup                          | Daily/continuous replication as supported                       | ≤15 min Storage RPO             | DBO            |
| Configuration backup                    | On every production configuration change + daily reconciliation | rebuildability                  | DO             |
| Release artifact retention              | Every release                                                   | application recovery            | DO             |
| Automated backup integrity verification | Daily                                                           | verify backup completeness      | DBO            |
| Automated restore smoke test            | Weekly                                                          | prove recoverability            | DBO            |
| Full database restore drill             | Monthly                                                         | measure real DB RTO/RPO         | DBO            |
| Full disaster simulation                | Quarterly                                                       | test complete platform recovery | PL + DBO + IRO |
| Recovery runbook review                 | Quarterly                                                       | keep procedures current         | PL             |
| Recovery credential review              | Quarterly                                                       | validate recovery access        | SO             |

This is the **single source of truth for recovery cadence**.

---

# 19. Backup SLOs

## SLO-R01 — Backup success

**Target:**

```text
≥99.9% scheduled backup jobs succeed
```

Measurement:

```text rolling 30 days

```

A failed backup retries automatically.

---

## SLO-R02 — Backup freshness

**PostgreSQL:**

```text maximum WAL archive lag ≤5 minutes

```

**Storage:**

```text maximum acceptable backup lag ≤15 minutes

```

Measured continuously.

---

## SLO-R03 — Backup independence

At least:

```text
1 production copy
1 off-site immutable copy
```

must exist.

Target:

```text
0 days without an independent recovery copy
```

---

## SLO-R04 — Backup deletion protection

**Target:**

```text
0 ordinary production identities
with permission to destroy all recovery generations
```

Measured quarterly.

---

# 20. Recovery Verification SLOs

## SLO-R05 — Weekly restore smoke test

Every week:

```text
restore latest eligible backup
verify checksum
verify database opens
verify schema
verify critical tables
verify tenant integrity
```

Target:

```text
100% weekly runs successful
```

Failure:

```text
SEV-2
recovery owner notified
new production release freeze if restore confidence is materially affected
```

---

## SLO-R06 — Monthly full database recovery

Once per month:

```text
restore database
apply WAL/PITR
run application against recovered database
run cross-tenant tests
measure RPO
measure RTO
```

Target:

```text
100% monthly drills successful

RPO ≤5 minutes
RTO ≤30 minutes
```

Failure:

```text
SEV-1 operational incident
remediation plan within 24 hours
repeat drill within 7 days
```

---

## SLO-R07 — Quarterly full disaster recovery

Once per quarter, simulate:

```text
production host unavailable
```

and rebuild on the recovery environment.

Required:

```text
database
storage
configuration
application
authentication
network routing
tenant authorization
```

Target:

```text
RPO ≤15 minutes
RTO ≤2 hours
```

Failure requires an executive/platform risk review and corrective action before the next quarterly drill.

---

# 21. Recovery Measurement

Every drill records:

```text
T0 incident declared
T1 recovery environment available
T2 database restored
T3 storage restored
T4 application healthy
T5 tenant isolation verified
T6 critical traffic restored
```

Calculate:

```text
RTO = T6 - T0
```

and:

```text
RPO = latest production data point
      -
      restored data boundary
```

Every drill produces a report.

---

# 22. Incident Response SLOs

| Event                                    |  Target |
| ---------------------------------------- | ------: |
| Critical alert acknowledged              | ≤15 min |
| Incident commander assigned              | ≤15 min |
| Critical tenant quarantined              | ≤15 min |
| Critical credential revoked              | ≤30 min |
| Production deployment frozen             | ≤15 min |
| Critical cross-tenant incident contained | ≤30 min |
| Recovery decision made                   | ≤30 min |

Measurement begins when the monitoring/incident system creates the incident.

---

# 23. Incident Severity

## SEV-0

Evidence of:

```text
cross-tenant data exposure
control-plane compromise
production host compromise with persistence
destruction of recovery data
```

Immediate:

```text
deployment freeze
credential containment
tenant isolation
incident commander
recovery assessment
```

---

## SEV-1

Examples:

```text
confirmed RCE
active credential compromise
critical authorization bypass
supply-chain compromise
```

---

## SEV-2

Examples:

```text
isolated tenant security issue
high-risk vulnerability
suspicious activity without confirmed compromise
```

---

## SEV-3

Routine security defects.

---

# 24. Tenant Quarantine SLO

For a credible tenant compromise:

```text
detect
→ quarantine
```

Target:

```text
≤15 minutes
```

Quarantine actions:

```text
invalidate sessions
disable API keys
pause tenant workers
disable integrations
disable publishing
invalidate caches
preserve evidence
```

Do not automatically delete the tenant.

---

# 25. Global Lockdown SLO

For credible platform-wide compromise:

```text
LOCKDOWN
```

Target activation:

```text
≤10 minutes
```

Possible controls:

```text
freeze deployments
disable privileged operations
pause exports
pause high-risk workers
force platform-admin reauthentication
```

---

# 26. Audit SLOs

The following must have 100% audit coverage:

```text
platform admin changes
tenant role changes
MFA changes
service-role access
secret changes
API-key creation/revocation
production deployments
promotion
rollback
backup changes
restore operations
tenant quarantine
global lockdown
```

Audit records contain:

```text
actor
timestamp
request_id
tenant
resource
action
result
source
```

Target:

```text
100% successfully recorded
```

---

# 27. Security Telemetry SLO

Security events must reach the central observability system.

Target:

```text
≥99.9% telemetry delivery
```

Events include:

```text
TENANT_CONTEXT_MISMATCH
CROSS_TENANT_DENIAL
RLS_DENIAL
PRIVILEGE_ESCALATION
STORAGE_SCOPE_VIOLATION
SERVICE_ROLE_USE
ADMIN_LOGIN
ADMIN_MFA_CHANGE
DEPLOYMENT_PROMOTION
ROLLBACK
SECRET_ROTATION
BACKUP_DELETE_ATTEMPT
```

---

# 28. Dashboard Architecture

Frame30's dashboard remains optimized for speed.

Architecture:

```text
SSR shell
 ↓
stream critical UI
 ↓
lazy feature modules
 ↓
parallel APIs
 ↓
optimistic state
 ↓
realtime
```

Feature modules:

```text
core
products
orders
customers
editor
analytics
settings
```

Only required modules load.

---

# 29. Dynamic Customization Model

Merchant customization is data.

Pipeline:

```text
Visual Editor
      ↓
AST / JSON
      ↓
schema validation
      ↓
normalization
      ↓
safe compiler/renderer
      ↓
storefront
```

Allowed:

```text
layouts
components
styles
theme tokens
data bindings
collections
conditions
animations
responsive rules
content
```

Not allowed:

```text
arbitrary server code
shell commands
SQL
dynamic module execution
```

---

# 30. Capability-Based Dashboard

Actions are explicitly registered:

```text
publishSite
createProduct
updateProduct
inviteStaff
configureShipping
createDiscount
refundOrder
```

Each capability specifies:

```text
tenant scope
site scope
required role
input schema
rate limit
audit requirement
```

No generic:

```text
execute()
eval()
shell()
sql()
```

capability is exposed to normal tenant requests.

---

# 31. RCE Containment

Assume the Frame30 process is compromised.

The target maximum blast radius is:

```text
Frame30 application container
```

not:

```text
host
Docker
/root
backup plane
deployment credentials
all tenant secrets
```

Application containers run:

```text
non-root
no Docker socket
no host mounts
minimal capabilities
no privileged mode
read-only filesystem where practical
resource limits
restricted network access
```

---

# 32. Application-to-Host SLO

Target:

```text
0 direct application paths to:
    Docker administration
    host shell
    HAProxy administration
    OpenResty administration
    recovery administration
```

Verified:

```text
per release
+
daily runtime inspection
```

---

# 33. Supply-Chain Security SLOs

Every production artifact must contain:

```text
source commit
build identity
immutable digest
SBOM
provenance
```

Target:

```text
100% production artifacts
```

Production may deploy only an approved digest.

---

# 34. Deployment Algorithm

```text
Developer
    ↓
protected branch
    ↓
CI
    ↓
security gates
    ↓
SBOM
    ↓
artifact provenance
    ↓
immutable Docker image
    ↓
release registry
    ↓
/root approval
    ↓
start inactive slot
    ↓
health test
    ↓
tenant-isolation test
    ↓
controlled cohort
    ↓
metrics
    ↓
promote
    ↓
drain previous slot
    ↓
bake
    ↓
retire previous slot
```

---

# 35. Deployment SLOs

## Candidate readiness

```text
≥95% of normal releases
ready within 5 minutes
```

## Rollback

```text
rollback routing action ≤60 seconds
```

## Production artifact integrity

```text
100% digest verification
```

## Downtime

```text
0 planned application downtime
```

## Drain

```text
100% deployments
remove old slot from new traffic before termination
```

---

# 36. Cross-Tenant Release Gate

Every release uses permanent test tenants:

```text
SECURITY_TENANT_A
SECURITY_TENANT_B
```

Required:

```text
A → A = ALLOW
A → B = DENY
B → B = ALLOW
B → A = DENY
```

Test across:

```text
API
RPC
storage
cache
search
exports
workers
webhooks
admin
background jobs
```

Target:

```text
0 unauthorized successes
```

One successful cross-tenant access blocks promotion.

---

# 37. Recovery Plane

The recovery plane is independent from normal application trust.

```text
Production
    ↓
WAL/PITR
    ↓
off-site immutable backup
    ↓
recovery environment
```

Production application credentials do not have permission to destroy all historical recovery points.

---

# 38. Canonical Recovery Schedule

This is the authoritative cadence.

### Continuous

```text
PostgreSQL WAL/PITR
```

### Daily

```text
full DB backup
Storage backup/reconciliation
backup integrity verification
configuration reconciliation
```

### Weekly

```text
automated restore smoke test
```

### Monthly

```text
full DB recovery drill
```

### Quarterly

```text
full disaster-recovery exercise
recovery-runbook review
recovery-credential review
```

This schedule supersedes all other recovery cadence references.

---

# 39. Recovery SLO Dashboard

`/root/recovery` must show:

```text
Postgres RPO target       ≤5 min
Current measured RPO      X min

Postgres RTO target       ≤30 min
Last measured RTO         X min

Storage RPO target        ≤15 min
Current measured RPO      X min

Full DR RTO target        ≤2 hr
Last measured RTO         X hr

Last backup               timestamp
Last backup verification  PASS/FAIL
Last weekly restore       PASS/FAIL
Last monthly restore      PASS/FAIL
Last quarterly DR         PASS/FAIL
```

---

# 40. Recovery Compliance SLO

Target:

```text
100% scheduled recovery activities completed
```

with:

```text
0 missed weekly restore tests
0 missed monthly recovery drills
0 missed quarterly disaster exercises
```

A missed exercise creates an operational incident and requires rescheduling within:

```text
7 days
```

---

# 41. Security Scorecard

`/root/security` exposes:

```text
SECURITY
────────────────────────
Cross-tenant failures        0
Critical vulnerabilities     0
High vulnerabilities         target compliant
Admin MFA                    100%
Privileged audit coverage    100%
Secret overdue count         0

SUPPLY CHAIN
────────────────────────
Production artifacts signed  100%
Provenance verified          100%
SBOM coverage                100%

RECOVERY
────────────────────────
Latest DB backup             PASS
Backup freshness             X min
Latest restore test          PASS
Latest RTO                   X min
Latest RPO                   X min
Quarterly DR                 PASS

OPERATIONS
────────────────────────
Open SEV-0                   0
Open SEV-1                   0
Deployment failures          tracked
Unowned controls             0
```

---

# 42. Security Program Review

## Daily automated

```text
vulnerability state
backup status
tenant isolation regressions
admin MFA
secret expiration
security alerts
backup freshness
production artifact integrity
```

## Weekly

```text
restore smoke test
expanded security suite
privileged access review
```

## Monthly

```text
full recovery drill
security scorecard review
service-role audit
dependency review
```

## Quarterly

```text
full disaster exercise
recovery credential review
runbook review
architecture threat-model review
```

---

# 43. Release Blocking Rules

A production release is blocked if any of the following occur:

```text
cross-tenant test succeeds unexpectedly
critical vulnerability unresolved
artifact provenance invalid
artifact digest mismatch
tenant-context invariant violated
database compatibility failure
candidate health failure
backup freshness exceeds target without exception
required security gate unavailable
unowned privileged capability introduced
```

---

# 44. Risk Exception Policy

A security exception must contain:

```text
risk
owner
affected systems
mitigation
expiry date
approval
```

Exceptions cannot become indefinite.

Target:

```text
0 expired exceptions remaining open
```

Measured daily.

---

# 45. Recovery Host

The 16 GB server is designated as a recovery/staging capability.

It must be able to:

```text
restore application
restore database
restore storage
restore configuration
run health checks
run tenant-isolation tests
serve emergency traffic
```

It is not itself the authoritative backup.

---

# 46. Full Disaster Recovery Algorithm

```text
PRODUCTION FAILURE
        ↓
Incident Commander
        ↓
isolate compromised infrastructure
        ↓
revoke affected credentials
        ↓
validate recovery point
        ↓
prepare recovery host
        ↓
restore PostgreSQL
        ↓
apply PITR/WAL
        ↓
restore Storage
        ↓
restore configuration
        ↓
deploy trusted immutable release
        ↓
validate authentication
        ↓
validate tenant A/B isolation
        ↓
validate critical workflows
        ↓
validate monitoring
        ↓
route traffic
        ↓
monitor
        ↓
incident closure
```

---

# 47. Recovery Verification Requirements

Recovery is successful only when:

```text
database restored
storage restored
application starts
authentication works
Tenant A cannot access B
Tenant B cannot access A
critical business paths work
audit works
monitoring works
deployment control works
```

A database restore alone is not considered recovery.

---

# 48. The Security Operating Contract

Frame30's operating contract is:

```text
1. Tenant identity is derived.
2. Tenant context is immutable.
3. Authorization is explicit.
4. RLS is a database backstop.
5. Storage, Redis, cache, queues and workers have independent boundaries.
6. Service-role access is exceptional and audited.
7. Application RCE does not equal host root.
8. Host compromise does not equal backup destruction.
9. Production artifacts are immutable and verifiable.
10. Releases are tested through BLUE/GREEN.
11. Cross-tenant security is continuously tested.
12. Backup restoration is regularly demonstrated.
13. Every critical control has an owner.
14. Every critical target has measurable evidence.
15. Security exceptions expire.
```

---

# 49. Final Measurable Definition of "Safe Enough"

Frame30 is operating within the security contract only when:

```text
Cross-tenant unauthorized access       = 0
Critical active vulnerabilities       = 0
Overdue critical secrets              = 0
Unowned critical controls             = 0
Production unsigned artifacts         = 0
Unauthorized privileged actions       = 0
Backup verification failures          = 0 unresolved
Missed weekly restore tests            = 0
Missed monthly recovery drills         = 0
Missed quarterly DR exercises         = 0
Recovery RPO                           ≤ targets
Recovery RTO                           ≤ targets
Planned release downtime               = 0
Tenant-isolation release failures     = 0
```

The remaining risk is then visible, owned, measured, and recoverable rather than hidden behind a general claim that Frame30 is "secure."

---

# 50. Final Architecture

```text
                            INTERNET
                               │
                             CADDY
                         stable fallback
                               │
                            HAProxy
                               │
                           OpenResty
                       production truth
                               │
                    ┌──────────┴──────────┐
                    │                     │
                 BLUE                    GREEN
                 release                 release
                    │                     │
                    └──────────┬──────────┘
                               │
                         TenantContext
                               │
             ┌─────────────────┼─────────────────┐
             │                 │                 │
           Auth              Site             Role
             │                 │                 │
             └─────────────────┼─────────────────┘
                               │
                          Frame30 app
                               │
       ┌───────────────────────┼───────────────────────┐
       │                       │                       │
    Postgres                 Redis                  Storage
       │                       │                       │
      RLS                tenant namespaces        Storage RLS
       │                       │                       │
       └───────────────────────┼───────────────────────┘
                               │
                            Workers
                               │
                        scoped capabilities


                  ───── APPLICATION BOUNDARY ─────


                              /root
                         CONTROL PLANE
                              │
                       deployment agent
                              │
                     Docker / HAProxy
                     OpenResty / host


                    ───── HOST BOUNDARY ─────


                       RECOVERY PLANE
                              │
                   WAL / immutable backup
                              │
                       recovery host
                              │
                      verified restoration
```

# 51. Final Operating Principle

The goal is not:

> **"Frame30 can never be hacked."**

The goal is:

> **"A compromise is bounded, detected, attributable, containable, and recoverable."**

The final security equation is:

```text
Strong tenant isolation
+
least privilege
+
explicit trust boundaries
+
immutable releases
+
controlled customization
+
continuous adversarial testing
+
independent backups
+
measured recovery
+
clear ownership
=
survivable multi-tenant SaaS
```

The customer-facing product remains fast and highly dynamic.

The complexity lives in the **security architecture, control plane, verification system, and recovery plane**, where complexity actually provides protection.
