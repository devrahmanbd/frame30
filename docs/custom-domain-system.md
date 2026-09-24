# Custom Domain System

Framique merchants can connect their own domains (e.g. `shop.example.com`) to their storefront. The system handles the full lifecycle: DNS verification → TLS certificate issuance → serving traffic → renewal.

**Migration applied:** `migration/0002_merchant_domains.sql`  
**Active domain:** `microscorp.shop` (manually activated in DB)

---

## Architecture Overview

```
┌──────────────┐     ┌───────────────┐     ┌──────────────┐     ┌──────────────┐
│  Dashboard   │────▶│  Server Fn    │────▶│  State       │────▶│  OpenResty   │
│  (UI)        │     │  (functions)  │     │  Machine     │     │  + ACME      │
└──────────────┘     └───────────────┘     └──────────────┘     └──────────────┘
                           │                     │
                           ▼                     ▼
                    ┌──────────────┐     ┌──────────────┐
                    │  Supabase    │     │  DoH         │
                    │  (Postgres)  │     │  Resolvers   │
                    └──────────────┘     └──────────────┘
```

The system is split into four layers:

| Layer | File | Responsibility |
|-------|------|----------------|
| **Pure logic** | `src/lib/domains.ts` | State machine rules, hostname validation, DNS instructions, quota — no I/O |
| **Server engine** | `src/lib/domains.server.ts` | Database mutations, DNS-over-HTTPS, TLS edge, cron sweep |
| **RPC boundary** | `src/lib/domains.functions.ts` | TanStack Start server functions — auth middleware + input validation |
| **UI** | `src/routes/_authenticated/dashboard/settings_.domains.tsx` | Dashboard page — bilingual EN/BN |

---

## File: `src/lib/domains.ts`

### Purpose

Pure, browser-safe domain logic. No database, no network. Everything is deterministic and unit-testable.

### Key Exports

#### Constants

| Export | Description |
|--------|-------------|
| `RESERVED_SUFFIXES` | Hostnames merchants can never claim: `framique.app`, `framique.dev`, `supabase.co`, `localhost` |
| `LIVE_EDGE_CNAME` | `"framique.qubickle.com"` — single source of truth for DNS target |
| `LIVE_EDGE_IPS` | `["88.99.250.99"]` — fallback A record targets |
| `CHALLENGE_PREFIX` | `"_framique-challenge"` — TXT record prefix for ownership verification |
| `MAX_AUTO_ATTEMPTS` | `40` — auto-polling stops after this many failed checks |
| `DOMAIN_TRANSITIONS` | Allowed state machine edges |
| `DOMAIN_STAGES` | Ordered checklist for progress rendering |

#### Types

```typescript
type DomainStatus =
  | "pending_dns"   // Initial — waiting for DNS records
  | "verifying"     // Checking DNS now
  | "dns_verified"  // TXT + routing confirmed
  | "issuing_cert"  // TLS certificate requested from edge
  | "active"        // Serving HTTPS traffic
  | "failed"        // Too many failed attempts
  | "disabled";     // Paused by merchant

type CertStatus = "none" | "pending" | "issued" | "renewing" | "error";

type DnsRecord = {
  type: "TXT" | "CNAME" | "A" | "ALIAS";
  name: string;
  value: string;
  required: boolean;
  note: "ownership" | "routing" | "routing_alt";
};

type BillingPlanKey = "launch" | "growth" | "business" | "enterprise";
```

#### Functions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `normalizeHostname` | `(input: string) => string` | Strips protocol/path/port, handles punycode, validates against reserved lists |
| `isApex` | `(hostname: string) => boolean` | True if hostname is the registrable apex (handles multi-part TLDs like `.co.uk`) |
| `challengeHost` | `(hostname: string) => string` | Returns `_framique-challenge.<hostname>` |
| `dnsInstructions` | `(hostname, token, target) → DnsRecord[]` | Generates exact DNS records for registrar setup |
| `canTransition` | `(from, to) → boolean` | Validates state machine edge legality |
| `nextCheckDelaySeconds` | `(attempts) → number` | Exponential backoff: 1m → 2m → 4m … capped at 6h |
| `certHealth` | `(expiresAt, now?) → CertHealth` | Computes certificate health state + days remaining |
| `evaluateDns` | `(input) → { ownership, routing, reason }` | Compares observed DNS with expected records |
| `domainQuotaForPlan` | `(plan) → number` | Owner policy 2026-09-19: exactly 1 per store on every plan (1 store = 1 domain) |

### State Machine Transitions

```
                ┌──────────────┐
                │  pending_dns │
                └──────┬───────┘
                       │
                       ▼
                ┌──────────────┐
          ┌────▶│   verifying  │◀────────────────────────┐
          │     └──────┬───────┘                          │
          │            │                                  │
          │            ▼                                  │
          │     ┌──────────────┐                          │
          │     │ dns_verified │                          │
          │     └──────┬───────┘                          │
          │            │                                  │
          │            ▼                                  │
          │     ┌──────────────┐                          │
          │     │ issuing_cert │                          │
          │     └──────┬───────┘                          │
          │            │                                  │
          │            ▼                                  │
          │     ┌──────────────┐    DNS fails again      │
          └─────│    active    │─────────────────────────┘
                └──────────────┘

  Any state ──▶ failed  (max attempts reached / cert failure)
  Any state ──▶ disabled (merchant pauses)
  disabled  ──▶ pending_dns (merchant resumes)
```

**Full transition table:**

```typescript
DOMAIN_TRANSITIONS = {
  pending_dns:  ["verifying", "disabled", "failed"],
  verifying:     ["dns_verified", "pending_dns", "failed", "disabled"],
  dns_verified:  ["issuing_cert", "verifying", "failed", "disabled"],
  issuing_cert:  ["active", "failed", "dns_verified", "disabled"],
  active:        ["verifying", "failed", "disabled"],
  failed:        ["verifying", "pending_dns", "disabled"],
  disabled:      ["pending_dns"],
};
```

### DNS Evaluation Logic (`evaluateDns`)

Two conditions must both pass:

1. **Ownership** — TXT record at `_framique-challenge.<hostname>` equals `framique-verification=<token>`
2. **Routing** — CNAME points to `framique.qubickle.com` **or** A record matches one of the edge IPs

### Error Handling

All validation errors throw `DomainInputError` with stable codes the UI can translate:

| Code | Meaning |
|------|---------|
| `domain.empty` | Empty input |
| `domain.invalid` | Failed label/regex validation |
| `domain.needs_tld` | Single-label hostname (no `.com` etc.) |
| `domain.too_long` | >253 characters |
| `domain.ip_not_allowed` | Bare IP address rejected |
| `domain.reserved` | Matches a reserved suffix |
| `domain.reserved_label` | First label is `admin`, `api`, `cdn`, etc. |

### Security Considerations

- **Reserved suffixes** prevent merchants from claiming platform domains
- **Reserved labels** (`admin`, `api`, `cdn`, `dashboard`, `internal`, `mail`, `platform`, `status`) block dangerous subdomains
- **IP rejection** prevents DNS rebinding via A-record-only claims
- **Multi-part TLD handling** (`co.uk`, `com.bd`) ensures correct apex detection
- **Unicode/punycode normalization** prevents homograph attacks
- **Quota enforcement** is fail-closed: unknown plan → launch quota (1 domain)

---

## File: `src/lib/domains.server.ts`

### Purpose

Server-side lifecycle engine. Owns all I/O: database, DNS resolution, TLS edge integration, observability, and cron.

### Key Exports

#### State Machine Engine

```typescript
async function transition(
  domain: Pick<DomainRow, "id" | "merchant_id" | "status">,
  to: DomainStatus,
  patch: Partial<Update>,
  meta: { reason?: string; detail?: Record<string, unknown>; actor?: string }
): Promise<void>
```

- Refuses illegal edges via `canTransition()` — throws `DomainError(409)`
- Writes to `merchant_domains` table
- Inserts audit row into `domain_events` on every actual transition
- Emits Prometheus counter `framique_domain_transition_total`

#### DNS Resolution

```typescript
export async function resolveDns(
  name: string,
  type: "TXT" | "CNAME" | "A",
): Promise<string[]>
```

- Uses **two independent DoH resolvers**: Cloudflare (`cloudflare-dns.com`) and Google (`dns.google`)
- Queries both via `Promise.allSettled` — takes **union** of answers (any resolver seeing the record is sufficient)
- Results cached for 30 seconds via `cached()` to prevent refresh spam
- Timeout: 4 seconds per resolver
- Emits `framique_domain_dns_ms` histogram and `framique_domain_dns_total` counter

#### Read Operations

| Function | Signature | Purpose |
|----------|-----------|---------|
| `listDomains` | `(db, merchantId, userId) → ListResult` | Lists all domains for a merchant + edge config |
| `domainHistory` | `(db, merchantId, userId, domainId) → Event[]` | Returns up to 50 audit events |
| `toView` | `(row) → DomainView` | Maps DB row to API-friendly view with computed fields |

#### Mutation Operations

| Function | Rate Limit | Description |
|----------|------------|-------------|
| `addDomain` | `domains.write` | Normalizes hostname, checks plan quota, inserts row, logs event |
| `verifyDomain` | `domains.verify` | One verification pass — safe for UI button and cron |
| `requestCertificate` | — | Hands hostname to TLS edge via webhook |
| `setPrimary` | `domains.write` | Sets domain as primary (must be `active`) |
| `setRedirect` | `domains.write` | Toggles redirect-to-primary flag |
| `setDomainEnabled` | `domains.write` | Pauses/resumes a domain |
| `removeDomain` | `domains.write` | Hard-deletes domain row |

#### Edge Integration

| Function | Purpose |
|----------|---------|
| `storeChallenge` | ACME http-01: stores token + keyAuthorization in `domain_challenges` (1h TTL) |
| `readChallenge` | Serves challenge to ACME validator (plain HTTP) |
| `applyCertResult` | Callback from edge after ACME order — transitions to `active` or `failed` |

#### Cron

```typescript
export async function sweepDomains(subject?: string): Promise<DomainSweepResult>
```

Runs periodically and:
1. Finds all domains with `next_check_at ≤ now` in active states
2. Runs `verifyDomain` on each (up to 50)
3. Flags certificates expiring within 30 days → requests renewal
4. Cleans expired challenges from `domain_challenges`
5. Returns `{ checked, verified, failed, renewals, expired_challenges }`

### Notification System

When a domain goes active or fails cert issuance, `notifyMerchant()` inserts a bilingual (EN/BN) notification into the `notifications` table. Notification failures are silently swallowed — they must never break the state machine.

### Security Considerations

- **Rate limiting**: All mutations enforce per-user rate limits via `enforceRateLimit()`
- **Tenancy**: `loadOwned()` always filters by `merchant_id` — cross-tenant access returns 404
- **Unique index**: Global hostname uniqueness enforced at DB level — duplicate insert returns `23505` → `"domain.taken"`
- **Edge webhook auth**: `DOMAIN_EDGE_TOKEN` Bearer header sent to TLS edge
- **No private keys held**: TLS issuance delegated to edge (`lua-resty-acme`), server never sees private key material
- **Challenge expiry**: http-01 challenges auto-expire after 1 hour
- **Auto-attempts cap**: After 40 failed checks, domain transitions to `failed` and stops being polled

### Error Handling

| Error Code | HTTP Status | When |
|------------|-------------|------|
| `domain.illegal_transition` | 409 | Invalid state machine edge |
| `domain.dns_unavailable` | 503 | Both DoH resolvers failed |
| `domain.not_found` | 404 | Domain doesn't exist or wrong tenant |
| `domain.disabled` | 409 | Trying to verify a disabled domain |
| `domain.limit_reached` | 409 | Plan quota exceeded |
| `domain.taken` | 409 | Hostname already claimed (unique index) |
| `domain.not_active` | 409 | Trying to set primary on inactive domain |
| `domain.primary_cannot_redirect` | 409 | Primary domain can't redirect to itself |

### Observability

- **Prometheus counters**: `framique_domain_added_total`, `framique_domain_verify_total`, `framique_domain_transition_total`, `framique_domain_cert_request_total`, `framique_domain_cert_total`, `framique_domain_sweep_total`, `framique_domain_dns_total`
- **Histogram**: `framique_domain_dns_ms` (DNS resolution latency)
- **Structured logging**: All transitions logged with domain ID, from/to status, reason
- **Tracing**: `withSpan()` wraps key operations (`domains.list`, `domains.add`, `domains.verify`, `domains.sweep`)

---

## File: `src/lib/domains.functions.ts`

### Purpose

Thin RPC boundary using TanStack Start's `createServerFn`. Each function:
1. Authenticates via `requireSupabaseAuth` middleware
2. Resolves merchant ID via `scope()` (prevents cross-tenant access)
3. Delegates to `domains.server.ts`

### Exports

| Function | Method | Input | Delegates To |
|----------|--------|-------|-------------|
| `domainsListFn` | GET | — | `listDomains` |
| `domainAddFn` | POST | `{ hostname: string }` | `addDomain` → `listDomains` |
| `domainVerifyFn` | POST | `{ id: UUID }` | `verifyDomain` → `listDomains` |
| `domainPrimaryFn` | POST | `{ id: UUID }` | `setPrimary` |
| `domainRedirectFn` | POST | `{ id: UUID, redirect: boolean }` | `setRedirect` |
| `domainEnabledFn` | POST | `{ id: UUID, enabled: boolean }` | `setDomainEnabled` |
| `domainRemoveFn` | POST | `{ id: UUID }` | `removeDomain` |
| `domainHistoryFn` | POST | `{ id: UUID }` | `domainHistory` |

### Security

- All functions require authentication (`requireSupabaseAuth` middleware)
- Input validation via Zod schemas
- Merchant ID resolved server-side from session — never trusts client-supplied tenant IDs
- `add` and `verify` return the full domain list after mutation (optimistic UI refresh)

---

## File: `src/routes/_authenticated/dashboard/settings_.domains.tsx`

### Purpose

Dashboard page for merchants to manage custom domains. Bilingual (English / Bengali).

### Route

```
/_authenticated/dashboard/settings_/domains
```

### Components Used

| Component | Source | Purpose |
|-----------|--------|---------|
| `DomainStatusPill` | `DomainManager` | Color-coded status badge |
| `CertBadge` | `DomainManager` | Certificate health indicator |
| `DomainProgress` | `DomainManager` | Setup progress checklist |
| `DnsRecordTable` | `DomainManager` | Copyable DNS records for registrar |
| `ObservedRecords` | `DomainManager` | What the system currently sees in DNS |
| `InlineNote` | `DomainManager` | Status/error/warning messages |
| `SectionCard` | `DeveloperUi` | Card wrapper with title + hints |

### Features

- **Add domain**: Input field → `domainAddFn` → shows DNS records to configure
- **Check now**: Manual verification trigger → `domainVerifyFn`
- **Make primary**: Sets active domain as primary → `domainPrimaryFn`
- **Redirect toggle**: Points non-primary domains to primary → `domainRedirectFn`
- **Pause/Resume**: Disables/enables domain → `domainEnabledFn`
- **Remove**: Deletes domain (with confirmation) → `domainRemoveFn`
- **Event history**: Expandable timeline of state transitions → `domainHistoryFn`
- **Edge warning**: Shows when `DOMAIN_EDGE_HOOK_URL` is not configured

### Error Translation

All server error codes are mapped to bilingual user-facing messages via a `message()` memoized function. Unknown codes pass through as-is.

### Bilingual Support

All strings use `t(english, bangla)` from `useLang()`. Labels, hints, status names, error messages, and confirmation dialogs are all translated.

---

## DNS Record Setup

When a merchant adds a domain, they receive these records to configure at their registrar:

### For apex domains (`example.com`):

| Type | Name | Value | Required |
|------|------|-------|----------|
| TXT | `_framique-challenge.example.com` | `framique-verification=<token>` | Yes |
| A | `example.com` | `88.99.250.99` | Yes |
| ALIAS | `example.com` | `framique.qubickle.com` | No (fallback) |

### For subdomains (`shop.example.com`):

| Type | Name | Value | Required |
|------|------|-------|----------|
| TXT | `_framique-challenge.shop.example.com` | `framique-verification=<token>` | Yes |
| CNAME | `shop.example.com` | `framique.qubickle.com` | Yes |

---

## Certificate Lifecycle

1. DNS passes → `dns_verified`
2. `requestCertificate()` called → `issuing_cert`, `cert_status: "pending"`
3. Edge webhook (`DOMAIN_EDGE_HOOK_URL`) triggers ACME order via `lua-resty-acme`
4. Edge calls back `/api/public/domains/callback` → `applyCertResult()`
5. Success → `active`, `cert_status: "issued"`; Failure → `failed`, `cert_status: "error"`
6. Certificates expiring within 30 days → cron re-requests via `requestCertificate()`

**No edge configured?** The domain stays `dns_verified` with the cert marked
`cert.awaiting_edge` (rechecked hourly) — no order is placed, so nothing is
"issuing" and nothing strands in `issuing_cert`. UI shows: "TLS edge is not
configured on this environment." Renewals are likewise skipped (live domains
stay `active` and keep serving). Legacy rows already parked in `issuing_cert`
self-heal back through `verifying` on the next sweep.

---

## Plan-Based Quotas

| Plan | Custom Domains |
|------|----------------|
| Launch | 1 |
| Growth | 1 |
| Business | 1 |
| Enterprise | 1 |

Owner policy 2026-09-19: 1 store = 1 domain on every plan. Single source is
`domainQuotaForPlan()` (`src/lib/domains.ts`); `PLAN_DOMAIN_QUOTA`
(`src/lib/domains.server.ts`) is derived from it. Quota protects Let's
Encrypt rate limits. Unknown/missing subscription → launch quota (fail-closed).

---

## Monitoring & Observability

### Prometheus Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `framique_domain_added_total` | counter | — |
| `framique_domain_verify_total` | counter | `outcome: verified \| pending \| failed` |
| `framique_domain_transition_total` | counter | `from, to` |
| `framique_domain_cert_request_total` | counter | `outcome: ok \| error` |
| `framique_domain_cert_total` | counter | `outcome: issued \| error` |
| `framique_domain_sweep_total` | counter | `bucket: checked \| verified \| failed \| renewals \| expired_challenges` |
| `framique_domain_dns_total` | counter | `type, outcome: ok \| error` |
| `framique_domain_dns_ms` | histogram | `type` |

### Structured Logging

Every state transition logs: `domain.transition` with `{ domain, from, to, reason }`.  
Sweep results log: `domains.sweep` with all counters.

### Tracing

Key operations wrapped in `withSpan()`: `domains.list`, `domains.add`, `domains.verify`, `domains.sweep`.
