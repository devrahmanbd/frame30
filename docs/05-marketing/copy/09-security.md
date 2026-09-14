# `/security`

Route: `src/routes/security.tsx` · Shell: public marketing layout, top-nav + footer · Scope: prospective and current merchants, their engineers, and procurement/security reviewers running a vendor questionnaire against Framique.

## SEO

- **Title** (58 chars): `Security at Framique — RLS tenancy, keys, incidents`
- **Description** (159 chars): `How Framique isolates merchant data with Postgres row-level security, scopes API keys, tokenises payment data, and runs incident response. No overclaims.`
- **og:title**: `Tenant isolation you can verify.`
- **og:description**: `Row-level security on every table, scoped keys, audited access, tested restores.`
- **canonical / og:url**: `/security`
- **JSON-LD**: `BreadcrumbList` (Home → Security) and `FAQPage` for the FAQ band.
- **H1 rule**: exactly one `<h1>`, rendered in the hero; every subsequent heading is `<h2>`/`<h3>`, never a second `<h1>`.
- **og:type**: `website`
- **twitter:card**: `summary_large_image` · **twitter:title** mirrors `og:title` · **twitter:description** mirrors `og:description`
- **Keywords** — the page must earn these in body copy and headings; never stuff a `<meta name="keywords">` tag, it is ignored by search engines and reads as spam to reviewers.
  - **Primary**: `ecommerce data security and tenant isolation`
  - **Secondary**:
    - `row level security multi tenant saas`
    - `scoped api keys security`
    - `pci scope ecommerce bangladesh`
    - `incident response saas`
  - **Long-tail / question intents**:
    - `how is merchant data isolated in a multi tenant ecommerce platform`
    - `is my customer data safe on a hosted store platform`
  - **Placement**: H1 (primary), tenancy band, keys band, incident-response band. Bangla equivalents belong in the `lang="bn"` variants of the same blocks — never as a hidden duplicate paragraph.
- **URL rule**: canonical and `og:url` are **relative** (`/security`) until a production domain is set, so preview, published and custom-domain traffic each canonicalise to themselves. Never bake `https://framique.com` into source.

> Integrity rule, stated once and enforced everywhere below: this page describes controls and practices we have actually built. Where we do not hold a certification, we do not claim one. Items still in progress are labelled roadmap, in the roadmap band only, and nowhere else on this page.

## Band order

1. Hero
2. Tenancy isolation — the model, twice (owner, then engineer)
3. Authentication and session handling
4. Roles and least-privilege permission matrix
5. API key scoping and rotation
6. Secret handling — what we never log
7. Payment data handling and tokenisation boundary
8. Encryption in transit and at rest
9. Backups, retention and restore testing
10. Observability and alerting contract
11. Incident response runbook
12. Vulnerability disclosure policy
13. Dependency and supply-chain scanning
14. Self-hosting and data residency options
15. Subprocessor transparency table
16. Customer-side security checklist
17. Compliance roadmap (clearly marked)
18. FAQ
19. Final CTA

---

## 1. Hero

*Lever:* specificity beats reassurance — a concrete mechanism ("row-level security on every table") is more persuasive to a technical buyer than an adjective ("bank-grade").

- **Eyebrow**: `Security`
- **H1**: **Tenant isolation you can verify.**
- **Sub**: Framique runs on self-hosted Postgres with row-level security on every tenant table, scoped and rotatable API keys, and an audit trail you can export. This page explains the mechanisms, not just the promises.
- **Primary CTA**: `Read the isolation model` (anchors to Band 2)
- **Alt CTA**: `Contact security` (mailto/`security@framique.com`, placeholder pending final domain)
- **বাংলা — Eyebrow**: `নিরাপত্তা`
- **বাংলা — H1**: **যে ডেটা-বিচ্ছিন্নতা আপনি নিজে যাচাই করতে পারবেন।**
- **বাংলা — Sub**: ফ্রেমিক চলে সেলফ-হোস্টেড পোস্টগ্রেসে, প্রতিটি টেবিলে row-level security সহ, স্কোপড ও রোটেটযোগ্য API কী এবং এক্সপোর্টযোগ্য অডিট ট্রেইল নিয়ে।

### Design note

Aurora hero, low-alpha violet/teal mesh behind headline only — no gradient text. H1 in `display-xl`, sub in `subhead` at `ink-muted`. Two pills: white primary, glass secondary. A small monospace strip beneath the sub renders the literal request path from Band 2 (`request → session → membership → policy → row`) at `caption` size, `ink-muted`, to signal "this is an engineering page" before the fold.

---

## 2. The tenancy isolation model

*Lever:* dual-audience framing — trust is won twice: the buyer needs to believe it, the buyer's engineer needs to verify it. Explaining the same fact at two altitudes prevents either reader from bouncing.

### 2.1 For a non-engineer

Every merchant's orders, customers, products and payouts live in the same physical database as every other merchant's — that is normal, efficient, and how almost every serious SaaS platform works. What matters is what stops one merchant's application code, one buggy report, or one careless staff query from ever returning a row that belongs to someone else.

We do not rely on our own code remembering to add a `WHERE store_id = ...` clause to every query, on every route, forever, across every engineer who ever touches the codebase. That approach fails eventually — not because engineers are careless, but because "remember to add a filter every time" is a rule a human will eventually forget under deadline pressure, and forgetting it once is a data breach.

Instead, the database itself refuses to return a row unless the request is provably allowed to see it. The check lives in Postgres, underneath the application, so even a route that has a bug, a report that joins tables incorrectly, or a new hire's first pull request cannot leak another merchant's data — the database says no before the row leaves storage. This is called row-level security (RLS), and it is turned on for every table that holds merchant data. A table with no isolation policy is not a table with weaker isolation; it is a table that returns nothing to anyone, which is a loud failure we notice immediately, not a silent leak we discover later.

### 2.2 For an engineer

Concretely:

- Every tenant-scoped table carries a `merchant_id` column and an `ENABLE ROW LEVEL SECURITY` policy. There is no opt-out table for "internal" data that happens to be tenant-scoped.
- Policies call **security-definer helper functions** — `is_merchant_member(merchant_id)`, `has_merchant_role(merchant_id, role)`, `staff_has(permission)`, `is_platform_admin()` — rather than inlining logic per policy. A `SECURITY DEFINER` function runs with the privileges of the function owner, not the calling role, which lets us centralise the membership/role lookup once, audit it once, and change it once, instead of re-deriving the same logic differently across dozens of policy expressions where a typo in one becomes a silent bypass.
- **Roles never live on the `profiles` row.** This is deliberate, not an oversight, for three reasons:
  1. A role column on a user's own profile is a column the user's own session can often read and — if any policy or trigger is even slightly permissive — potentially influence indirectly through an update path. A privilege that lives next to identity is one relation away from being escalated by the identity it describes.
  2. A user can belong to multiple merchants with different roles at each (an agency staffer administering three stores, a franchise owner with `owner` on one location and `viewer` on another). A single `role` column cannot express that; a separate `merchant_members(user_id, merchant_id, role)` table can, and it is the join target for every policy check.
  3. Separating identity (who you are) from entitlement (what you may do, where) means revoking access is a delete on a membership row, not a mutation of the identity record — auditable, reversible, and impossible to confuse with "the user no longer exists."
- The request path is uniform for every actor, including us: `Request → session identity (GoTrue-issued JWT) → merchant membership lookup → row-level policy evaluation → row`. Admin tooling used by our own staff walks the identical path — there is no back-door service-role connection wired into a dashboard. Where a genuinely privileged operation is required (a data export run by support, a plan change by billing), the service role is loaded **inside the handler**, after the caller's identity and permission have already been verified through the normal path, and the action is written to the audit log with actor, before-state, after-state and reason. Service role is never the default client for any request.
- Isolation is a test suite, not a design intention: `.e2e/specs/tenant_isolation.spec.ts` runs negative assertions — logged in as merchant A, every attempt to read, list, update or delete a row belonging to merchant B must fail — as a release gate, not a manual review checklist.
- `GRANT`s are explicit per role in addition to policies. A table with RLS enabled but no grants for a role is unreachable by that role at the connection layer, before policy evaluation even runs — belt and suspenders, and a table that is neither policied nor granted fails closed by default rather than open.

**Table — where each control lives:**

| Layer | Mechanism | Fails how, if misconfigured |
|---|---|---|
| Connection | Explicit `GRANT` per role, per table | No grant → connection-level denial, before RLS even evaluates |
| Row | `ENABLE ROW LEVEL SECURITY` + policy per table | No policy → zero rows returned to any role, a loud break not a leak |
| Policy logic | `SECURITY DEFINER` helper functions, not inlined per-policy SQL | Centralised, so a fix or audit touches one function, not forty policies |
| Identity vs entitlement | `merchant_members(user_id, merchant_id, role)` — never a column on `profiles` | Revocation is a row delete; escalation cannot happen through a profile update |
| Privileged operations | Service role loaded inside the handler, after caller verification, action audit-logged | Never the default client; never reachable before authorization |
| Regression protection | Negative-assertion E2E suite as a release gate | A broken policy fails CI, not a customer's trust |

### Design note

Two-column Z row echoing the hero's request-path strip: left column plain-language paragraph on `surface-1`, right column the engineer explanation on `surface-2` with the helper-function names rendered in a monospace `caption` chip row. The permission table below spans full width on a hairline `glass-card`, code identifiers (`is_merchant_member`, `merchant_members`) in monospace, everything else in Manrope body.

---

## 3. Authentication and session handling

*Lever:* mechanism transparency reduces perceived risk more than a badge does — naming the exact token type and its lifetime lets a security reviewer check a box instead of asking a follow-up.

Authentication runs through GoTrue (part of our self-hosted Supabase distribution), issuing short-lived JWTs plus a longer-lived refresh token. Practically:

- Access tokens are short-lived; a stolen access token has a narrow window before it expires and must be refreshed against a token that is itself revocable.
- Refresh tokens are rotated on use and stored in an `httpOnly`, `Secure`, `SameSite=Lax` cookie — never in `localStorage`, where any injected script on the page could read them.
- Sessions can be revoked server-side (password change, "log out everywhere," suspected compromise, staff offboarding) without waiting for natural expiry.
- Passwords are hashed with a modern adaptive hash inside GoTrue; we never see or store a plaintext password, and support staff cannot "look up" a password because there is nothing readable to look up.
- Optional two-factor authentication (TOTP) is available for merchant accounts and **required** for platform-admin accounts — the small set of internal roles with cross-merchant visibility.
- Every authenticated request re-derives merchant membership from the database on the request path; membership is not cached into the token in a way that would let a revoked member keep acting on a stale token until expiry.
- Brute-force and credential-stuffing protection sits at the edge (OpenResty rate limiting) ahead of the auth service, keyed by IP and by account, with backoff rather than a hard lock that a bad actor could use to lock out a legitimate merchant.

**বাংলা — key line**: সেশন টোকেন সংক্ষিপ্ত মেয়াদী, রিফ্রেশ টোকেন প্রতি ব্যবহারে রোটেট হয়, এবং প্ল্যাটফর্ম-অ্যাডমিন অ্যাকাউন্টে দুই-স্তর যাচাই বাধ্যতামূলক।

### Design note

Hairline list band, four rows, icon-left (key, clock, shield, refresh), on canvas. No card treatment here — this is a factual list, not a persuasion moment, so it should read like documentation, not marketing.

---

## 4. Roles and least-privilege permission matrix

*Lever:* the concreteness effect — a matrix with real permission names is unfalsifiable in a way "role-based access" is not; it invites the reader to test it, which itself builds trust.

Every staff member operating inside a merchant's account holds exactly one role per merchant, and every route/serverFn checks a specific permission via `staff_has(permission)` rather than checking a role name directly — so a permission can be re-assigned across roles without touching call sites.

| Permission | Owner | Manager | Staff | Support (viewer) | Platform admin |
|---|---|---|---|---|---|
| View orders & customers | ✓ | ✓ | ✓ | ✓ (read-only, audited) | ✓ (audited, break-glass) |
| Edit products & inventory | ✓ | ✓ | ✓ | — | — |
| Issue refunds | ✓ | ✓ | Limit-capped | — | — |
| Manage staff & roles | ✓ | — | — | — | — |
| View payout account details | ✓ | Masked | — | — | Masked |
| Rotate / revoke API keys | ✓ | ✓ | — | — | — |
| Export customer data | ✓ | ✓ | — | — | Audited, on request only |
| Delete store / close account | ✓ | — | — | — | — |
| Access billing & plan | ✓ | — | — | — | — |
| Cross-merchant visibility | — | — | — | — | ✓ (audited, scoped, time-boxed) |

Notes on the interesting rows:

- **Masked payout details**: a manager can confirm a payout method is on file and its last four digits, never the full account number, which is only ever decrypted for the owner's own view and for the payment processor at charge time.
- **Refunds, limit-capped**: staff can issue refunds up to a merchant-configured ceiling; anything above it requires a manager or owner, so a compromised low-privilege staff account cannot drain a store through refunds.
- **Platform-admin cross-merchant visibility** is not a standing permission — it is granted per-incident, time-boxed, and every access is written to the audit log with the support ticket or incident ID that justified it. There is no always-on "view any store" toggle in the codebase; this is a design constraint, not a policy we merely promise to follow.

**বাংলা — row label examples**: অর্ডার ও গ্রাহক দেখুন · পণ্য ও ইনভেন্টরি সম্পাদনা · রিফান্ড ইস্যু করুন · স্টাফ ও ভূমিকা পরিচালনা · পেআউট অ্যাকাউন্ট বিবরণ

### Design note

Comparison-table treatment, sticky first column, checkmarks in `accent-teal`, em-dashes in `ink-muted`, "masked"/"limit-capped"/"audited" annotations as small `caption` pills so the table reads honestly rather than binary.

---

## 5. API key scoping and rotation

*Lever:* granting the reader control (rotation, visible last-used) lowers anxiety more than promising the key is "safe," because control is verifiable and safety is a claim.

API keys authenticate server-to-server integrations — custom apps, couriers, accounting exports — not end users. Each key:

- Carries **explicit scopes** at creation (`orders:read`, `inventory:write`, `webhooks:manage`, etc.) — a key minted for a shipping integration cannot read payout details, because the scope was never granted, not because a policy is trusted to catch it at request time.
- Shows a **last-used timestamp and calling IP range** in the dashboard, so an owner can spot a key that is being used somewhere unexpected before it becomes an incident.
- Can be **rotated without downtime**: a new key is issued alongside the old one, the old one is revoked once traffic has moved, and nothing needs to be "regenerated and immediately swapped everywhere at once" under pressure.
- Can be **revoked instantly**, which invalidates it at the next request — there is no propagation delay measured in hours.
- Is stored **hashed**, not in reversible form, so a database compromise does not hand over usable keys — the same principle we apply to passwords.
- Is scoped to a single merchant. There is no such thing as a platform-wide API key that reaches across tenants; a key is only ever as powerful as the merchant that issued it.

**Recommended rotation cadence**: 90 days for standing integrations, immediately on staff offboarding if the key was known to that person, and immediately on any suspicion of exposure (committed to a public repo, pasted into a support ticket, shared over an unencrypted channel).

### Design note

Glass card grid, 3-up: "Scope it," "Watch it," "Rotate it" — each with a one-line proof string in monospace `caption`, consistent with the flip-row proof pattern used elsewhere on the site.

---

## 6. Secret handling — what we never log

*Lever:* a negative list ("we never log X") is more credible than a positive claim ("we protect your data") because it commits us to a falsifiable, checkable behaviour.

Secrets — API keys, session tokens, payment credentials, service-role keys, webhook signing secrets — follow one rule: **read inside the handler that needs them, never at module scope, never passed further than necessary.** Concretely:

- `scrubPayload` / `scrubText` run on every log line before it leaves the process. Known secret-shaped values (tokens, keys, card numbers, authorization headers) are redacted even if a future code change accidentally tries to log them.
- Secrets never appear in: error messages returned to a browser, Sentry error bodies, metric labels (label cardinality is bounded to route/outcome/status class specifically so an identifier or secret can never become a label), or URL query strings that could end up in access logs or a browser history.
- Environment secrets are read at runtime from the environment, never committed to the repository; a pre-commit and CI secret-scan step exists to catch the case where someone tries anyway.
- Client bundles are scanned for accidental secret inclusion before release — a secret that reaches the browser is treated as an incident, not a warning.
- We never ask a merchant for their password to "help debug." Support access, when needed, goes through the audited, time-boxed platform-admin path described in Band 4, not through credential sharing.

**বাংলা**: টোকেন, কার্ড নম্বর ও অথরাইজেশন হেডারের মতো তথ্য কখনো লগে, এরর বার্তায় বা মেট্রিক লেবেলে প্রকাশ পায় না — লগ লেখা হওয়ার আগেই তা স্ক্রাব করা হয়।

### Design note

Hairline list, monospace prefix "Never:" repeated per row for rhythm, on canvas, no card — deliberately plain to read as a technical commitment rather than a marketing beat.

---

## 7. Payment data handling and tokenisation boundary

*Lever:* boundary drawing — explicitly stating what we do *not* touch is more reassuring to a payments-literate buyer than a vague "secure payments" claim, because it shows we understand where the real risk sits.

Framique supports cash on delivery, mobile financial services (bKash, Nagad, Rocket), bank transfer and BNPL, routed through an in-house payments aggregator with provider adapters behind one idempotent `charge`/`refund`/`payout` contract. The boundary that matters:

- **Card and MFS credentials are handled by the payment processor's own hosted flow, not typed into a Framique-controlled form field.** Where a redirect or hosted widget is used, the sensitive credential never transits our application servers — we receive a token or a status callback, not the underlying credential.
- What we store is a **reference token, masked details (e.g. last four digits, method type) and transaction state** — enough to show an order history and reconcile a payout, never enough to replay a charge or reconstruct the original credential.
- **Idempotency is structural, not best-effort.** Charges, refunds and payouts are keyed through Redis/DB idempotency keys, so a network retry, a doubled webhook delivery, or a user double-tapping "pay" resolves to the original result rather than a second charge. This is also why Redis runs `maxmemory-policy noeviction`: evicting an idempotency key under memory pressure would silently turn a safe retry into a double charge, so we page on memory pressure instead of letting that happen quietly.
- Money is stored as `currency_code` + integer minor units (paisa), never a float — a float-rounding bug is a real class of payment defect we design out at the schema level, not a risk we accept and monitor.
- Webhook deliveries from processors and couriers are **HMAC-signature verified before any privileged read or write** happens on their contents; an unsigned or badly-signed payload is rejected before it reaches business logic.
- Refund authority is capped per role (Band 4) so a single compromised low-privilege account cannot issue unlimited refunds.

**Roadmap note** (see Band 17): a formal PCI attestation is not something we hold today and this page does not claim one; our architecture is built to keep raw card data off our servers precisely so that scope stays as small as an eventual assessment would need it to be.

### Design note

Flip row, left text / right diagram: a simple boundary diagram — `Buyer → processor-hosted flow → token → Framique` — with the "processor-hosted flow" segment rendered inside a dashed outline to visually signal "not our surface." Aurora orange spotlight card for the idempotency callout only.

---

## 8. Encryption in transit and at rest

*Lever:* specificity over adjective — naming TLS termination point and at-rest scope is checkable; "encrypted everywhere" is not.

- **In transit**: TLS terminates at the OpenResty edge with ACME-managed certificates auto-renewed ahead of expiry; internal service-to-service traffic (app → Supabase, app → Redis, app → Go payment services) runs inside a private network boundary, not exposed to the public internet.
- **At rest**: the underlying Postgres volumes and Storage buckets are encrypted at the disk layer; secrets and credentials that must be recoverable (not just verifiable, unlike passwords) are stored using envelope encryption rather than a single static key baked into configuration.
- **Backups** inherit the same at-rest encryption as the primary store — a stolen backup is not a shortcut around the controls on the live database.
- **Security headers and CSP** are enforced on every response: a strict Content-Security-Policy, `Strict-Transport-Security`, `X-Content-Type-Options`, and a locked-down `frame-ancestors` to prevent clickjacking of merchant admin surfaces.
- **Rate limiting** on all public, unauthenticated endpoints (webhooks, storefront checkout, auth) sheds abusive traffic at the edge before it reaches application logic.

### Design note

Two-column hairline rows under a small padlock/lock-open icon pairing (transit vs rest), consistent caption-size annotations, no gradient — this band is reference material, kept visually quiet so it doesn't compete with the isolation model band for attention.

---

## 9. Backups, retention and restore testing

*Lever:* the "untested backup" framing (a backup you haven't restored is not a backup) is a well-known operational-maturity signal to technical buyers — stating it plainly does more work than any adjective.

- Backups run **hourly**, retained on a rolling window sized to support point-in-time recovery within the retention period, with older backups aged out on a documented schedule rather than kept indefinitely by default (which would itself be a data-minimisation problem).
- **Restore drills are scheduled, not aspirational.** A backup that has never been restored is a hope, not a control; we rehearse restoring into an isolated environment and verify data integrity and row counts against expectations before calling a drill successful.
- Migrations are **forward and rollback tested in CI** and are never auto-rolled-back in production — a failed migration in production is handled by a human decision with full context, not an automated rollback that could itself corrupt state mid-flight.
- Merchant-level data export and deletion requests are supported on request, consistent with our privacy commitments (`/legal/privacy`, `/legal/dpa`); deletion follows a defined retention tail for legally required records (e.g. transaction records for tax purposes) rather than either "delete everything instantly" (which would break legal recordkeeping) or "never delete" (which is a data-minimisation failure).

**Table — retention at a glance:**

| Data class | Backup frequency | Restore drill cadence | Deletion on request |
|---|---|---|---|
| Transactional (orders, payments) | Hourly | Scheduled, documented | Retained per legal tax record requirement, then purged |
| Operational (products, inventory, staff) | Hourly | Scheduled, documented | Deleted on confirmed request |
| Observability (metrics/logs/traces) | N/A — bounded retention, see Band 10 | N/A | Aged out automatically |
| Customer PII (profile, address) | Hourly | Scheduled, documented | Deleted on confirmed request, subject to legal hold if applicable |

### Design note

Table on a `surface-1` card; a small horizontal timeline graphic above it — `Backup → Encrypt → Store → Scheduled restore drill → Verify` — echoing the request-path visual language from Band 2 for consistency.

---

## 10. Observability and alerting contract

*Lever:* transparency about how we'd know something is wrong is a stronger trust signal than a claim of "24/7 monitoring," because it shows the actual instrumentation rather than asserting an outcome.

Our observability stack is entirely self-hosted — Prometheus, Grafana, Loki/Promtail, Sentry, Alertmanager — for the same reason our data layer is self-hosted: no vendor can throttle our visibility into our own platform, and retention is a decision we make, not a plan tier we buy.

| Signal | What it captures | Path | Retention |
|---|---|---|---|
| Metrics | Counters, gauges, histograms — request rates, error rates, latency, queue depth | App → Prometheus scrape (30s) | 30 days / 20GB |
| Logs | Structured JSON, PII-scrubbed, carrying `trace_id`/`span_id` | App stdout → Promtail → Loki | 30 days |
| Errors & traces | Exceptions and distributed traces via `withSpan`/`withRequestTrace` | App → self-hosted Sentry | Per configured Sentry quota |
| Alerts | Burn-rate and threshold rules (`alerts.rules.yml`, `slo.rules.yml`, `infra.rules.yml`) | Prometheus → Alertmanager → PagerDuty / Slack | — |

Paging discipline, because an alert that pages for the wrong thing trains people to ignore alerts:

- `severity=page` is reserved for **user-visible loss or imminent data risk** — checkout failures, authentication outages, a burn-rate trajectory that will exhaust an SLO error budget. Everything else opens a ticket, not a page.
- Every alerting rule carries a `runbook` annotation — the person paged at 3am gets a link to the exact steps, not a bare metric name.
- Pages are driven by **burn-rate**, not raw error counts, so a brief blip that self-heals does not wake anyone, while a slow, sustained degradation that would otherwise hide below a naive threshold does.
- The stack **watches itself**: exporter down, Loki ingestion stalled, Promtail dropping lines, or Alertmanager failing to deliver are each their own alert — the monitoring system failing silently is treated as seriously as the product failing.
- Correlation is a design goal, not an afterthought: a Grafana panel links to the matching Loki log lines, which carry the `trace_id` that opens the exact Sentry trace — three clicks, no vendor switch, no manual timestamp correlation.
- SLOs we hold ourselves to: **storefront availability 99.9%**, **P95 checkout settle under 2.5 seconds**, **ingest-to-visible analytics lag under 5 minutes.**

### Design note

Table plus a small three-node "correlation" diagram (Grafana → Loki → Sentry) rendered as glass chips connected by thin signal-blue lines — the one place on this page blue is used as a connective element rather than a text link, which is acceptable per design tokens since it remains a signal, not a fill.

---

## 11. Incident response runbook

*Lever:* pre-committing to a communication timeline (rather than "we'll let you know") removes the ambiguity that makes incidents feel scarier than the technical impact alone.

### 11.1 Severity table

| Severity | Definition | Example | Page? | First merchant update |
|---|---|---|---|---|
| SEV-1 | Data breach, cross-tenant data exposure, or platform-wide outage | RLS bypass discovered; checkout down platform-wide | Immediate page, on-call + security lead | Within 1 hour of confirmation |
| SEV-2 | Significant degraded service or a contained security issue affecting a subset of merchants | Elevated checkout error rate; one integration's key leaked | Immediate page, on-call | Within 4 hours |
| SEV-3 | Limited-impact bug or a vulnerability with no evidence of exploitation | A dependency CVE with no known exploit path in our usage | Ticket, next business day | Included in routine disclosure if applicable |
| SEV-4 | Cosmetic or non-security operational issue | A dashboard chart mislabels a unit | Ticket | Not applicable |

### 11.2 Runbook sequence

`Detect → Triage & assign severity → Contain → Notify affected merchants → Eradicate & fix → Recover → Public/customer write-up → Post-mortem`

- **Detect**: via paging alert, merchant report, or proactive discovery (dependency scan, internal review, disclosure report).
- **Triage & assign severity**: on-call classifies against the table above within minutes of acknowledgement, not after full root-cause is known — severity can be revised upward as more is learned, never delayed while we wait for certainty.
- **Contain**: the fastest safe action that stops ongoing harm — revoke a key, disable a route, roll back a deploy — even before root cause is fully understood.
- **Notify affected merchants**: **directly**, not via a generic status page alone, for anything SEV-1 or SEV-2 with merchant impact. We tell you what we know, what we don't yet know, and what we're doing next — we do not wait for a complete picture before saying anything.
- **Eradicate & fix**: root cause addressed, not just the symptom papered over; a regression test is added where the failure class allows one.
- **Recover**: confirm the fix in production, confirm affected merchants are unblocked.
- **Public/customer write-up**: material incidents (SEV-1, and SEV-2 where merchant data or money was at risk) receive a written post-mortem — what happened, impact window, root cause, remediation, and what changed to prevent recurrence.
- **Post-mortem**: internal blameless review; action items tracked to closure, not just written down.

**Communication commitments, stated plainly:**

1. Affected merchants are notified directly — email plus in-dashboard notice — not left to discover impact themselves.
2. Timelines in the severity table are commitments, not aspirations; if we miss one, the post-mortem says so.
3. We disclose what we know when we know it, and follow up as the picture completes, rather than delaying the first message until everything is certain.
4. A material incident gets a public-facing write-up; we do not go quiet after the immediate fire is out.

**বাংলা**: গুরুতর ঘটনায় (SEV-1/SEV-2) প্রভাবিত মার্চেন্টদের সরাসরি জানানো হয় — ইমেইল ও ড্যাশবোর্ড নোটিশে — নির্ধারিত সময়সীমার মধ্যে।

### Design note

Timeline band, horizontal on desktop, vertical accordion on mobile, each node a glass chip; severity table styled like the comparison table in Band 4 for visual consistency across the two tables on this page.

---

## 12. Vulnerability disclosure policy

*Lever:* an explicit, friendly path for researchers converts adversarial discovery into cooperative discovery — ambiguity here is what pushes a researcher toward public disclosure instead of a private report.

We welcome good-faith security research and would rather hear from you first.

**How to report:**

1. Email `security@framique.com` (placeholder pending final domain configuration) with a description, reproduction steps, and impact assessment. Encrypt if you wish; a PGP key will be published alongside the final contact address.
2. Do not test against live merchant stores you do not own or operate; use a test account or ask us to provision one.
3. Give us a reasonable window to investigate and remediate before any public disclosure — we aim to acknowledge reports within **2 business days** and to provide a remediation timeline within **10 business days** for confirmed issues.
4. We will not pursue legal action against good-faith research conducted under this policy.

**Out of scope for now**: a paid bug bounty program is not yet running (see roadmap, Band 17); we still want the report, and we will credit researchers publicly on request.

**In scope**: the production application and API surfaces at `*.framique.com` and merchant subdomains. **Out of scope**: third-party subprocessor infrastructure listed in Band 15 (report to them directly), denial-of-service testing, and social engineering of staff or merchants.

### Design note

Simple two-column band: left "How to report" numbered list, right a glass card with the contact line, PGP note, and response-time commitments as a short definition list — no gradient, this is a utility band a researcher will scan quickly.

---

## 13. Dependency and supply-chain scanning

*Lever:* naming the actual gate ("blocks the release," not "we monitor for issues") converts a soft claim into a checkable process fact.

- Automated dependency scanning runs against every change, flagging known-vulnerable packages before merge, not on a periodic sweep that could leave a window open for weeks.
- A confirmed high or critical severity finding with a known exploit path **blocks release** until patched or explicitly risk-accepted by a named engineer, in writing, with a remediation deadline.
- Lockfiles are committed and CI verifies the resolved dependency tree matches the lockfile, closing the class of attack where a transitive dependency is silently swapped between a developer's machine and the build.
- Client bundles are scanned before release for accidental inclusion of server-only code or secrets (Band 6).
- Base images and infrastructure containers (Postgres, Redis, the observability stack) are pinned to specific versions rather than tracking `latest`, so an upstream compromise cannot silently ride into our production environment on the next deploy; version bumps are deliberate, reviewed changes.
- Internal code review requires at least one other engineer's approval before merge to `main`; there is no path for a single person to introduce and ship a change unreviewed.

### Design note

Hairline list, six rows, each with a small outcome tag ("blocks release," "reviewed change," "pinned, not latest") right-aligned in `caption` — a compact way to make the process feel procedural rather than promotional.

---

## 14. Self-hosting and data residency options

*Lever:* offering the reader an escape valve from "trust us" to "control it yourself" is the strongest possible trust signal for a merchant with strict residency requirements — it proves the claim of no-lock-in is real rather than rhetorical.

Framique is built self-hosted-first: Postgres, Redis, auth, storage and the entire observability stack run on infrastructure we control, and the application only ever talks to them through swappable, provider-agnostic connection strings (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`) — nothing in the application code names a specific hosting provider.

Practically, this gives merchants with data-residency or regulatory requirements real options, not just a promise:

- **Standard hosting**: your data runs on our managed self-hosted infrastructure, located and operated to support Bangladesh-first residency expectations.
- **Dedicated/regional hosting**: for merchants with a specific residency requirement, infrastructure can be provisioned in a specific region on a case-by-case basis — contact us to scope this before committing to a contract.
- **Fully self-hosted (enterprise)**: because the platform has no vendor lock-in by construction, a merchant with the operational capacity to run their own Postgres, Redis and observability stack can deploy Framique on infrastructure they own and control entirely. This is a larger operational commitment and is discussed directly with our team, not a self-serve toggle.

We describe this as an option we support architecturally today, not a roadmap promise — the same code path that runs our managed environment is the code path that would run in a merchant-operated one, because the app never assumes a specific host.

**বাংলা**: ফ্রেমিক শুরু থেকেই সেলফ-হোস্ট-প্রথম — পোস্টগ্রেস, রেডিস, অথ ও পর্যবেক্ষণ স্ট্যাক আমাদের নিয়ন্ত্রণাধীন অবকাঠামোয় চলে, এবং প্রয়োজনে নির্দিষ্ট আঞ্চলিক বা সম্পূর্ণ সেলফ-হোস্টেড স্থাপনার বিকল্পও আলোচনাসাপেক্ষ।

### Design note

Three-card glass grid (Standard / Regional / Fully self-hosted), middle card on `surface-2` as the "most flexible" visual weight without a "featured" badge (this isn't a pricing upsell, so avoid pricing-card styling cues that would misread as an upgrade path).

---

## 15. Subprocessor transparency table

*Lever:* naming exactly who touches data, and for what narrow purpose, is more convincing than a blanket "we use trusted partners" line — specificity here is the entire point of a subprocessor table.

We minimise third parties in the data path by design — most of the stack is self-hosted precisely to avoid an ever-growing subprocessor list. The template below reflects categories named in our own architecture; merchants should confirm current entries via the DPA before relying on this table contractually.

| Category | Purpose | Data involved | Location commitment |
|---|---|---|---|
| Payment processing (MFS/bank/BNPL partners) | Processing charges, refunds and payouts initiated by the merchant | Transaction reference, amount, masked payment details | Per processor's own regulatory jurisdiction; raw credentials never transit our servers |
| Courier partners | Fulfilling shipments the merchant creates | Recipient name, address, phone, order reference | Bangladesh-based courier operations |
| Infrastructure hosting | Running self-hosted Postgres, Redis, and the application | All merchant data, self-hosted per Band 14 | Per hosting/residency option selected |
| Email/SMS delivery (transactional) | Order confirmations, OTPs, account notifications | Recipient contact detail, message content | Disclosed in the DPA on request |

Full, current subprocessor names and jurisdictions are listed in `/legal/dpa`, kept current as agreements change; this page describes the categories and boundaries, the DPA is the contractual source of truth.

### Design note

Plain table on canvas, no card — deliberately unglamorous, consistent with treating this as documentation. A footnote line links to `/legal/dpa` in `accent-blue`.

---

## 16. Customer-side security checklist

*Lever:* the "shared responsibility" framing — handing the merchant concrete actions — converts security from something done *to* them into something they participate in, which is both more accurate and more trust-building than implying we handle 100% of it.

Security is shared: we harden the platform, and these ten habits close the gaps only the merchant controls.

1. **Turn on two-factor authentication** for every staff account with owner or manager access.
2. **Use the least-privileged role** for each staff member — most day-to-day staff do not need manager access, and fewer standing privileges means less damage if one account is compromised.
3. **Rotate API keys on a schedule** (90 days) and immediately after any staff departure who had access to one.
4. **Scope every API key narrowly** — a courier integration needs order and shipping scopes, not payout access.
5. **Review the audit log** periodically, especially after a staff change, for actions you don't recognise.
6. **Never share login credentials over chat, email or phone** — including with anyone claiming to be Framique support; we will never ask for a password.
7. **Set a refund cap** appropriate to staff trust level rather than leaving it unlimited by default.
8. **Verify webhook endpoints** you configure are HTTPS and validate the signature we send, not just the payload.
9. **Keep a designated security contact** on file with us so incident notifications reach a real person, not a shared inbox nobody monitors.
10. **Test your own restore/export process** at least once — know how to get your data out before you ever need to.

**বাংলা — চেকলিস্ট শিরোনাম**: `আপনার পক্ষের নিরাপত্তা চেকলিস্ট`

### Design note

Numbered hairline list on `surface-1`, checkbox glyph left of each item (static, not interactive — this is a reading checklist, not a settings form), consistent with the "practices list" pattern from the previous copy deck.

---

## 17. Compliance roadmap — clearly marked

*Lever:* explicitly separating "have" from "building toward" prevents the single most damaging trust failure on a security page — a reader later discovering a claimed certification was aspirational.

> **This band lists work in progress. Nothing here is a current certification or audit status. Items move out of this band only once genuinely completed, and this page is updated at that point — not before.**

| Initiative | Status | What it means when complete |
|---|---|---|
| Formal penetration test by an independent third party | Roadmap | External validation of the isolation model and API surface, with findings remediated and summarised publicly |
| Bug bounty program | Roadmap | A standing paid incentive for external researchers, replacing the current goodwill disclosure process in Band 12 |
| SOC 2 Type II readiness review | Roadmap | Not a claim of certification today; a scoped effort to align controls with SOC 2 Type II criteria ahead of a future audit |
| PCI DSS scope reduction review | Roadmap | Formal confirmation of the tokenisation boundary described in Band 7, ahead of any assessment |
| ISO 27001 gap assessment | Roadmap | Structured comparison of current practices against the standard, as a precursor to a certification decision |

### Design note

Distinct visual treatment from every other band on the page: dashed hairline border instead of solid, a small "Roadmap" caption chip on every row in `ink-muted`, no gradient, no checkmarks — the styling itself should communicate "not yet," independent of the copy.

---

## 18. FAQ

*Lever:* pre-empting the exact questions a procurement reviewer would otherwise email us removes friction from the sales cycle and reads as confidence rather than evasion.

1. **Do you hold SOC 2 or ISO 27001 certification today?**
   No. We describe our controls and practices on this page; formal third-party certification work is listed as roadmap in Band 17 and we do not claim a status we have not achieved.

2. **Where does merchant data physically live?**
   On self-hosted infrastructure we operate, with regional and fully self-hosted options available for merchants with specific residency requirements — see Band 14.

3. **Can one merchant ever see another merchant's data through a bug in your app?**
   Isolation is enforced by Postgres row-level security, underneath our application code, and verified by a negative-assertion test suite that runs on every release — see Band 2. No system is provably bug-free, which is exactly why isolation is enforced at the database layer rather than trusted to application logic alone.

4. **Do you ever see our customers' full card numbers?**
   No. Card and MFS credentials are handled through the processor's own hosted flow; we store a reference token and masked details, never the underlying credential — see Band 7.

5. **What happens if there's a data breach?**
   It is classified SEV-1, contained immediately, and affected merchants are notified directly within the timelines in Band 11's severity table, followed by a public post-mortem for material incidents.

6. **Can we run Framique entirely on our own infrastructure?**
   Yes, as an enterprise option — the platform has no hard-coded dependency on our specific hosting, by design. Contact us to scope it — see Band 14.

7. **How do we report a security vulnerability we found?**
   Email `security@framique.com` with details; see Band 12 for scope, response-time commitments, and safe-harbour terms.

8. **What do you log, and could our secrets end up in a log file?**
   We log structured, PII-scrubbed request data; known secret-shaped values are redacted before a log line is written, and secrets are never used in metric labels or error bodies — see Band 6.

9. **How often are backups tested, not just taken?**
   On a scheduled cadence, restoring into an isolated environment and verifying integrity — a backup that has never been restored is not treated as a working backup. See Band 9.

10. **Who can access our store's data on your side, and is it logged?**
    Only staff with a permission granted for a specific reason, mostly none at all — platform-admin cross-merchant access is granted per-incident, time-boxed, and every access is written to the audit log with the justifying ticket ID. See Band 4.

### Design note

Standard FAQ accordion band on canvas, one open at a time, `FAQPage` JSON-LD mirrors these ten Q/As verbatim so search snippets match on-page copy exactly.

---

## 19. Final CTA

*Lever:* lowering the commitment for the specific reader most likely to be here (a security reviewer with a questionnaire) converts a page visit into a qualified lead without requiring a sales call.

**H2**: Send us your security questionnaire.
**Sub**: Most vendor security reviews map directly onto the bands above. Send us yours and we'll respond with citations back to this page and our DPA, not a generic template.
**Primary CTA**: `Contact security`
**Alt CTA**: `Read the DPA`

**বাংলা — H2**: `আপনার সিকিউরিটি প্রশ্নপত্র আমাদের পাঠান।`

### Design note

Gradient-spotlight final CTA card, teal/violet aurora, white pill primary + glass secondary, consistent with the site's closing-band pattern; no new visual language introduced here.

---

## Internal linking plan

- Band 2 → `/architecture` (or equivalent technical deep-dive route, if present) for readers who want the full schema-level detail.
- Band 7 → `/payments` for the commercial view of payment methods supported.
- Band 9 & 15 → `/legal/dpa` for contractual retention and subprocessor terms.
- Band 11 → `/status` for live incident and uptime history.
- Band 12 → `mailto:security@framique.com` (placeholder) and a future `/security/.well-known/security.txt`.
- Band 14 → `/pricing` or `/enterprise` for merchants scoping a self-hosted deployment commercially.
- Footer: `/legal/privacy`, `/legal/terms`, `/legal/dpa`, `/status`, security contact.

## Image brief

- Hero: abstract low-alpha aurora mesh only, no literal padlock/shield iconography (avoid stock-security clichés).
- Band 2: custom request-path diagram (four labelled nodes, one connecting line, policy node highlighted) — must be rebuildable as SVG/CSS, not a raster illustration, so it stays crisp at all densities and adapts to `prefers-reduced-motion`.
- Band 9: horizontal five-step timeline graphic, same visual system as Band 11's incident timeline for consistency.
- Band 10: three-node correlation diagram (Grafana/Loki/Sentry) as glass chips with signal-blue connecting lines.
- No photography, no generic "hacker in hoodie" or "digital lock" stock imagery anywhere on this page.

## Icon list

Key (auth), shield-check (isolation), rotate/refresh (key rotation), eye-off (masking), lock (encryption), database-backup (backups), activity (observability), siren (incident), bug (disclosure), package-check (dependency scanning), server (self-hosting), list-checks (checklist), map (roadmap), circle-help (FAQ).

## Motion spec

Opacity + transform reveal-on-enter only, 320–480ms, `cubic-bezier(0.22, 1, 0.36, 1)`, once per element per session. The request-path diagram (Band 2) and incident timeline (Band 11) animate their connecting line drawing on first viewport entry only, capped at 600ms, and render fully static (no draw animation) under `prefers-reduced-motion`. No looping motion anywhere on this page except the standard hero aurora drift (24–38s loop) inherited from the design system — a security page should feel calm, not kinetic.

## Accessibility notes

- All tables (Bands 4, 9, 10, 11, 15) use proper `<th scope="col">`/`<th scope="row">` markup, not styled divs, so screen readers announce row/column context correctly on data as consequential as a permission matrix.
- Checkmarks and em-dashes in the permission matrix (Band 4) are accompanied by visually-hidden text ("granted"/"not granted"/"masked") — colour and glyph alone must not carry the meaning.
- The roadmap band's dashed border and "Roadmap" chip are reinforced with the literal word "Roadmap" in text, not conveyed by border style alone, for users with low vision or screen readers.
- FAQ accordion is fully keyboard operable (Enter/Space to toggle, arrow-key navigation between questions), with `aria-expanded` state kept in sync.
- Bangla strings throughout use `lang="bn"` on their containing element so screen readers switch pronunciation correctly and the design system's tracking override applies.
- Colour contrast: body copy at `ink-muted` on `canvas` holds 7:1 per design-system floor; the "masked"/"limit-capped" caption pills in Band 4 are tested independently since they sit inside table cells rather than on raw canvas.
- Focus rings use the standard `accent-blue` ring token everywhere, including inside the correlation diagram's clickable chips (Band 10) and the FAQ accordion triggers.

## Measurement plan

- **Scroll depth per band**, specifically whether readers reach Band 11 (incident runbook) and Band 15 (subprocessors) — the two bands a serious procurement review will look for; low reach suggests moving them higher.
- **CTA click-through** on `Contact security` (hero) vs `Contact security` (final CTA) — if the hero click-through is low relative to page dwell time, the page is being read but not converting into contact, suggesting a content or CTA-placement issue rather than an interest problem.
- **Outbound clicks** to `/legal/dpa` and `/status` from this page, as a proxy for how many visitors are doing real vendor-review diligence versus a casual read.
- **FAQ expand rate** per question — low expand rate on Q1 (certifications) would be surprising and worth investigating; high expand rate there confirms it is the single most-asked question and should stay first.
- **Time-to-first-scroll-past-hero**: a security page read quickly and bounced suggests the hero isn't establishing enough credibility to hold a skeptical technical reader past the fold.
- **Questionnaire-CTA conversion to actual questionnaire received**, tracked in the sales/security inbox, as the true bottom-of-funnel metric this page exists to serve.
