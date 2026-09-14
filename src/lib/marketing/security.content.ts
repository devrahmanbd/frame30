/**
 * Content contract for `/security`, transcribed from
 * `docs/05-marketing/copy/09-security.md`.
 *
 * Pure data module — no React, no JSX. The route renders this; nothing here
 * decides layout. Every claim on this page is checkable against the deck: we
 * do not add a certification, metric or testimonial the deck does not state,
 * and roadmap items are kept in their own `complianceRoadmap` list so the
 * route can never accidentally render them as "held" rather than "in
 * progress" — see the integrity rule at the top of the deck.
 */

export type Bilingual = { en: string; bn?: string };

/* -------------------------------------------------------------------------- */
/* Hero (Band 1)                                                              */
/* -------------------------------------------------------------------------- */

export const hero = {
  eyebrow: { en: "Security", bn: "নিরাপত্তা" } satisfies Bilingual,
  title: "Tenant isolation you can verify.",
  titleBn: "যে ডেটা-বিচ্ছিন্নতা আপনি নিজে যাচাই করতে পারবেন।",
  sub: "Framique runs on self-hosted Postgres with row-level security on every tenant table, scoped and rotatable API keys, and an audit trail you can export. This page explains the mechanisms, not just the promises.",
  subBn:
    "ফ্রেমিক চলে সেলফ-হোস্টেড পোস্টগ্রেসে, প্রতিটি টেবিলে row-level security সহ, স্কোপড ও রোটেটযোগ্য API কী এবং এক্সপোর্টযোগ্য অডিট ট্রেইল নিয়ে।",
  primaryCta: "Read the isolation model",
  altCta: "Contact security",
  altCtaHref: "mailto:security@framique.com",
  /** Monospace request-path strip echoed under the hero sub. */
  requestPath: "request → session → membership → policy → row",
};

/* -------------------------------------------------------------------------- */
/* Band 2 — tenancy isolation model                                          */
/* -------------------------------------------------------------------------- */

export const isolation = {
  id: "isolation",
  eyebrow: "The tenancy isolation model",
  title: "The database says no before the row leaves storage.",
  ownerParagraphs: [
    "Every merchant's orders, customers, products and payouts live in the same physical database as every other merchant's — that is normal, efficient, and how almost every serious SaaS platform works. What matters is what stops one merchant's application code, one buggy report, or one careless staff query from ever returning a row that belongs to someone else.",
    "We do not rely on our own code remembering to add a filter to every query, on every route, forever, across every engineer who ever touches the codebase. That approach fails eventually — not because engineers are careless, but because \u201cremember to add a filter every time\u201d is a rule a human will eventually forget under deadline pressure, and forgetting it once is a data breach.",
    "Instead, the database itself refuses to return a row unless the request is provably allowed to see it. The check lives in Postgres, underneath the application, so even a route that has a bug, a report that joins tables incorrectly, or a new hire's first pull request cannot leak another merchant's data. This is called row-level security (RLS), and it is turned on for every table that holds merchant data. A table with no isolation policy returns nothing to anyone — a loud failure we notice immediately, not a silent leak we discover later.",
  ],
  engineerBullets: [
    "Every tenant-scoped table carries a merchant_id column and an ENABLE ROW LEVEL SECURITY policy. There is no opt-out table for tenant-scoped \u201cinternal\u201d data.",
    "Policies call security-definer helper functions — is_merchant_member(), has_merchant_role(), staff_has(), is_platform_admin() — rather than inlining logic per policy, so a fix or audit touches one function, not forty policies.",
    "Roles never live on the profiles row. Entitlement lives in a separate merchant_members(user_id, merchant_id, role) table, so revoking access is a delete on a membership row — auditable, reversible, and impossible to confuse with \u201cthe user no longer exists.\u201d",
    "The request path is uniform for every actor, including our own staff: request → session identity (GoTrue JWT) → merchant membership lookup → row-level policy evaluation → row. There is no back-door service-role connection wired into a dashboard.",
    "Isolation is a test suite, not a design intention: a negative-assertion end-to-end spec runs on every release — logged in as merchant A, every attempt to read, list, update or delete a row belonging to merchant B must fail.",
    "GRANTs are explicit per role in addition to policies. A table with RLS enabled but no grant for a role is unreachable by that role at the connection layer, before policy evaluation even runs.",
  ],
  helperFunctions: ["is_merchant_member()", "has_merchant_role()", "staff_has()", "is_platform_admin()"],
  controlTable: {
    caption: "Where each isolation control lives",
    columns: [
      { id: "mechanism", label: "Mechanism" },
      { id: "fails", label: "Fails how, if misconfigured" },
    ],
    rows: [
      {
        id: "connection",
        label: "Connection",
        mechanism: "Explicit GRANT per role, per table",
        fails: "No grant → connection-level denial, before RLS even evaluates",
      },
      {
        id: "row",
        label: "Row",
        mechanism: "ENABLE ROW LEVEL SECURITY + policy per table",
        fails: "No policy → zero rows returned to any role, a loud break not a leak",
      },
      {
        id: "policy",
        label: "Policy logic",
        mechanism: "SECURITY DEFINER helper functions, not inlined per-policy SQL",
        fails: "Centralised, so a fix or audit touches one function, not forty policies",
      },
      {
        id: "identity",
        label: "Identity vs entitlement",
        mechanism: "merchant_members(user_id, merchant_id, role) — never a column on profiles",
        fails: "Revocation is a row delete; escalation cannot happen through a profile update",
      },
      {
        id: "privileged",
        label: "Privileged operations",
        mechanism: "Service role loaded inside the handler, after caller verification, audit-logged",
        fails: "Never the default client; never reachable before authorization",
      },
      {
        id: "regression",
        label: "Regression protection",
        mechanism: "Negative-assertion E2E suite as a release gate",
        fails: "A broken policy fails CI, not a customer's trust",
      },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* Band 3 — authentication and session handling                             */
/* -------------------------------------------------------------------------- */

export const authentication = {
  title: "Authentication and session handling",
  bn: "সেশন টোকেন সংক্ষিপ্ত মেয়াদী, রিফ্রেশ টোকেন প্রতি ব্যবহারে রোটেট হয়, এবং প্ল্যাটফর্ম-অ্যাডমিন অ্যাকাউন্টে দুই-স্তর যাচাই বাধ্যতামূলক।",
  rows: [
    {
      id: "tokens",
      title: "Short-lived access, revocable refresh",
      body: "Access tokens are short-lived; a stolen one has a narrow window before it expires and must be refreshed against a token that is itself revocable. Refresh tokens are rotated on use and stored in an httpOnly, Secure, SameSite=Lax cookie — never in localStorage.",
    },
    {
      id: "revocation",
      title: "Server-side session revocation",
      body: "Sessions can be revoked server-side — password change, \u201clog out everywhere,\u201d suspected compromise, staff offboarding — without waiting for natural expiry.",
    },
    {
      id: "passwords",
      title: "No readable passwords",
      body: "Passwords are hashed with a modern adaptive hash inside GoTrue; we never see or store a plaintext password, and support staff cannot look one up because there is nothing readable to look up.",
    },
    {
      id: "2fa",
      title: "Two-factor authentication",
      body: "Optional TOTP is available for merchant accounts and required for platform-admin accounts — the small set of internal roles with cross-merchant visibility.",
    },
    {
      id: "membership",
      title: "Membership re-derived, not cached",
      body: "Every authenticated request re-derives merchant membership from the database on the request path, so a revoked member cannot keep acting on a stale token until it expires.",
    },
    {
      id: "bruteforce",
      title: "Edge rate limiting",
      body: "Brute-force and credential-stuffing protection sits at the edge ahead of the auth service, keyed by IP and by account, with backoff rather than a hard lock a bad actor could use to lock out a legitimate merchant.",
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Band 4 — roles and least-privilege permission matrix                     */
/* -------------------------------------------------------------------------- */

export const permissions = {
  title: "Roles and least-privilege permission matrix",
  intro:
    "Every staff member operating inside a merchant's account holds exactly one role per merchant, and every route/serverFn checks a specific permission via staff_has(permission) rather than a role name directly — so a permission can be re-assigned across roles without touching call sites.",
  bnRowLabels:
    "অর্ডার ও গ্রাহক দেখুন · পণ্য ও ইনভেন্টরি সম্পাদনা · রিফান্ড ইস্যু করুন · স্টাফ ও ভূমিকা পরিচালনা · পেআউট অ্যাকাউন্ট বিবরণ",
  columns: [
    { id: "owner", label: "Owner" },
    { id: "manager", label: "Manager" },
    { id: "staff", label: "Staff" },
    { id: "support", label: "Support (viewer)" },
    { id: "admin", label: "Platform admin" },
  ],
  rows: [
    {
      id: "view",
      label: "View orders & customers",
      cells: { owner: "granted", manager: "granted", staff: "granted", support: "read-only, audited", admin: "audited, break-glass" },
    },
    {
      id: "edit-products",
      label: "Edit products & inventory",
      cells: { owner: "granted", manager: "granted", staff: "granted", support: "not granted", admin: "not granted" },
    },
    {
      id: "refunds",
      label: "Issue refunds",
      cells: { owner: "granted", manager: "granted", staff: "limit-capped", support: "not granted", admin: "not granted" },
    },
    {
      id: "manage-staff",
      label: "Manage staff & roles",
      cells: { owner: "granted", manager: "not granted", staff: "not granted", support: "not granted", admin: "not granted" },
    },
    {
      id: "payout",
      label: "View payout account details",
      cells: { owner: "granted", manager: "masked", staff: "not granted", support: "not granted", admin: "masked" },
    },
    {
      id: "keys",
      label: "Rotate / revoke API keys",
      cells: { owner: "granted", manager: "granted", staff: "not granted", support: "not granted", admin: "not granted" },
    },
    {
      id: "export",
      label: "Export customer data",
      cells: { owner: "granted", manager: "granted", staff: "not granted", support: "not granted", admin: "audited, on request only" },
    },
    {
      id: "delete-store",
      label: "Delete store / close account",
      cells: { owner: "granted", manager: "not granted", staff: "not granted", support: "not granted", admin: "not granted" },
    },
    {
      id: "billing",
      label: "Access billing & plan",
      cells: { owner: "granted", manager: "not granted", staff: "not granted", support: "not granted", admin: "not granted" },
    },
    {
      id: "cross-merchant",
      label: "Cross-merchant visibility",
      cells: { owner: "not granted", manager: "not granted", staff: "not granted", support: "not granted", admin: "audited, scoped, time-boxed" },
    },
  ],
  notes: [
    "Masked payout details: a manager can confirm a payout method is on file and its last four digits, never the full account number.",
    "Refunds, limit-capped: staff can issue refunds up to a merchant-configured ceiling; anything above it requires a manager or owner.",
    "Platform-admin cross-merchant visibility is not a standing permission — it is granted per-incident, time-boxed, and every access is written to the audit log with the justifying ticket ID. There is no always-on \u201cview any store\u201d toggle.",
  ],
};

/* -------------------------------------------------------------------------- */
/* Band 5 — API key scoping and rotation                                    */
/* -------------------------------------------------------------------------- */

export const apiKeys = {
  title: "API key scoping and rotation",
  intro:
    "API keys authenticate server-to-server integrations — custom apps, couriers, accounting exports — not end users. Each key is scoped to a single merchant; there is no platform-wide key that reaches across tenants.",
  cards: [
    {
      id: "scope",
      title: "Scope it",
      body: "Explicit scopes at creation (orders:read, inventory:write, webhooks:manage). A key minted for a shipping integration cannot read payout details because the scope was never granted.",
      proof: "orders:read · inventory:write · webhooks:manage",
    },
    {
      id: "watch",
      title: "Watch it",
      body: "A last-used timestamp and calling IP range show in the dashboard, so an owner can spot a key being used somewhere unexpected before it becomes an incident.",
      proof: "last-used timestamp + IP range, visible per key",
    },
    {
      id: "rotate",
      title: "Rotate it",
      body: "Rotate without downtime: a new key issues alongside the old one, the old one revokes once traffic has moved. Revocation is instant — no propagation delay measured in hours.",
      proof: "recommended cadence: 90 days, or immediately on suspicion",
    },
  ],
  storageNote:
    "Keys are stored hashed, not in reversible form, so a database compromise does not hand over usable keys — the same principle applied to passwords.",
};

/* -------------------------------------------------------------------------- */
/* Band 6 — secret handling                                                  */
/* -------------------------------------------------------------------------- */

export const secretHandling = {
  title: "Secret handling — what we never log",
  bn: "টোকেন, কার্ড নম্বর ও অথরাইজেশন হেডারের মতো তথ্য কখনো লগে, এরর বার্তায় বা মেট্রিক লেবেলে প্রকাশ পায় না — লগ লেখা হওয়ার আগেই তা স্ক্রাব করা হয়।",
  rule:
    "Secrets — API keys, session tokens, payment credentials, service-role keys, webhook signing secrets — follow one rule: read inside the handler that needs them, never at module scope, never passed further than necessary.",
  never: [
    "Never: a secret survives into a log line — scrubPayload / scrubText redact known secret-shaped values before a line leaves the process.",
    "Never: a secret appears in an error message returned to a browser, a Sentry error body, or a metric label.",
    "Never: a secret sits in a URL query string that could end up in access logs or browser history.",
    "Never: a secret is committed to the repository — environment secrets are read at runtime, and a pre-commit / CI secret-scan step exists to catch the case where someone tries anyway.",
    "Never: a client bundle ships a secret — bundles are scanned for accidental inclusion before release.",
    "Never: a merchant is asked for their password \u201cto help debug.\u201d Support access goes through the audited, time-boxed platform-admin path, not credential sharing.",
  ],
};

/* -------------------------------------------------------------------------- */
/* Band 7 — payment data handling and tokenisation boundary                 */
/* -------------------------------------------------------------------------- */

export const paymentBoundary = {
  title: "Payment data handling and tokenisation boundary",
  intro:
    "Framique supports cash on delivery, mobile financial services (bKash, Nagad, Rocket), bank transfer and BNPL, routed through an in-house payments aggregator with provider adapters behind one idempotent charge / refund / payout contract.",
  boundaryDiagram: ["Buyer", "Processor-hosted flow", "Token", "Framique"],
  bullets: [
    "Card and MFS credentials are handled by the payment processor's own hosted flow, not typed into a Framique-controlled form field — the sensitive credential never transits our application servers.",
    "What we store is a reference token, masked details (last four digits, method type) and transaction state — never enough to replay a charge or reconstruct the original credential.",
    "Idempotency is structural, not best-effort: charges, refunds and payouts are keyed through Redis/DB idempotency keys, so a network retry or a doubled webhook resolves to the original result rather than a second charge.",
    "Money is stored as currency_code plus integer minor units (paisa), never a float.",
    "Webhook deliveries are HMAC-signature verified before any privileged read or write happens on their contents.",
    "Refund authority is capped per role so a single compromised low-privilege account cannot issue unlimited refunds.",
  ],
  roadmapNote:
    "A formal PCI attestation is not something we hold today and this page does not claim one; our architecture keeps raw card data off our servers precisely so that scope stays as small as an eventual assessment would need it to be.",
};

/* -------------------------------------------------------------------------- */
/* Band 8 — encryption in transit and at rest                               */
/* -------------------------------------------------------------------------- */

export const encryption = {
  title: "Encryption in transit and at rest",
  rows: [
    { id: "transit", title: "In transit", body: "TLS terminates at the OpenResty edge with ACME-managed certificates auto-renewed ahead of expiry; internal service-to-service traffic runs inside a private network boundary, not exposed to the public internet." },
    { id: "rest", title: "At rest", body: "Postgres volumes and storage buckets are encrypted at the disk layer; recoverable secrets and credentials use envelope encryption rather than a single static key baked into configuration." },
    { id: "backups", title: "Backups", body: "Backups inherit the same at-rest encryption as the primary store — a stolen backup is not a shortcut around the controls on the live database." },
    { id: "headers", title: "Security headers and CSP", body: "Enforced on every response: a strict Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, and a locked-down frame-ancestors to prevent clickjacking of merchant admin surfaces." },
    { id: "ratelimit", title: "Rate limiting", body: "Applied on all public, unauthenticated endpoints (webhooks, storefront checkout, auth) to shed abusive traffic at the edge before it reaches application logic." },
  ],
};

/* -------------------------------------------------------------------------- */
/* Band 9 — backups, retention and restore testing                          */
/* -------------------------------------------------------------------------- */

export const backups = {
  title: "Backups, retention and restore testing",
  intro:
    "A backup that has never been restored is a hope, not a control. Backups run hourly, retained on a rolling window sized for point-in-time recovery, with restore drills rehearsed into an isolated environment and verified against expected row counts before a drill is called successful.",
  timeline: ["Backup", "Encrypt", "Store", "Scheduled restore drill", "Verify"],
  table: {
    caption: "Retention by data class",
    columns: [
      { id: "frequency", label: "Backup frequency" },
      { id: "drill", label: "Restore drill cadence" },
      { id: "deletion", label: "Deletion on request" },
    ],
    rows: [
      {
        id: "transactional",
        label: "Transactional (orders, payments)",
        frequency: "Hourly",
        drill: "Scheduled, documented",
        deletion: "Retained per legal tax record requirement, then purged",
      },
      {
        id: "operational",
        label: "Operational (products, inventory, staff)",
        frequency: "Hourly",
        drill: "Scheduled, documented",
        deletion: "Deleted on confirmed request",
      },
      {
        id: "observability",
        label: "Observability (metrics/logs/traces)",
        frequency: "N/A — bounded retention",
        drill: "N/A",
        deletion: "Aged out automatically",
      },
      {
        id: "pii",
        label: "Customer PII (profile, address)",
        frequency: "Hourly",
        drill: "Scheduled, documented",
        deletion: "Deleted on confirmed request, subject to legal hold if applicable",
      },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* Band 10 — observability and alerting contract                            */
/* -------------------------------------------------------------------------- */

export const observability = {
  title: "Observability and alerting contract",
  intro:
    "Our observability stack is entirely self-hosted — Prometheus, Grafana, Loki/Promtail, Sentry, Alertmanager — for the same reason our data layer is self-hosted: no vendor can throttle our visibility into our own platform, and retention is a decision we make, not a plan tier we buy.",
  table: {
    caption: "Observability signals",
    columns: [
      { id: "captures", label: "What it captures" },
      { id: "path", label: "Path" },
      { id: "retention", label: "Retention" },
    ],
    rows: [
      { id: "metrics", label: "Metrics", captures: "Request rates, error rates, latency, queue depth", path: "App → Prometheus scrape (30s)", retention: "30 days / 20GB" },
      { id: "logs", label: "Logs", captures: "Structured JSON, PII-scrubbed, carrying trace_id/span_id", path: "App stdout → Promtail → Loki", retention: "30 days" },
      { id: "errors", label: "Errors & traces", captures: "Exceptions and distributed traces", path: "App → self-hosted Sentry", retention: "Per configured Sentry quota" },
      { id: "alerts", label: "Alerts", captures: "Burn-rate and threshold rules", path: "Prometheus → Alertmanager → PagerDuty / Slack", retention: "—" },
    ],
  },
  correlationChain: ["Grafana", "Loki", "Sentry"],
  bullets: [
    "severity=page is reserved for user-visible loss or imminent data risk. Everything else opens a ticket, not a page.",
    "Every alerting rule carries a runbook annotation — the person paged at 3am gets a link to the exact steps, not a bare metric name.",
    "Pages are driven by burn-rate, not raw error counts, so a brief self-healing blip does not wake anyone.",
    "The stack watches itself: an exporter down or ingestion stalled is its own alert — the monitoring system failing silently is treated as seriously as the product failing.",
  ],
  slos: [
    "Storefront availability 99.9%",
    "P95 checkout settle under 2.5 seconds",
    "Ingest-to-visible analytics lag under 5 minutes",
  ],
};

/* -------------------------------------------------------------------------- */
/* Band 11 — incident response runbook                                      */
/* -------------------------------------------------------------------------- */

export const incidentResponse = {
  title: "Incident response runbook",
  bn: "গুরুতর ঘটনায় (SEV-1/SEV-2) প্রভাবিত মার্চেন্টদের সরাসরি জানানো হয় — ইমেইল ও ড্যাশবোর্ড নোটিশে — নির্ধারিত সময়সীমার মধ্যে।",
  sequence: [
    "Detect",
    "Triage & assign severity",
    "Contain",
    "Notify affected merchants",
    "Eradicate & fix",
    "Recover",
    "Public/customer write-up",
    "Post-mortem",
  ],
  body:
    "On-call classifies severity within minutes of acknowledgement, not after full root-cause is known. The fastest safe action that stops ongoing harm — revoke a key, disable a route, roll back a deploy — happens before root cause is fully understood. Affected merchants are notified directly for anything SEV-1 or SEV-2 with merchant impact: what we know, what we don't yet know, and what we're doing next.",
  commitments: [
    "Affected merchants are notified directly — email plus in-dashboard notice — not left to discover impact themselves.",
    "Timelines in the severity table are commitments, not aspirations; if we miss one, the post-mortem says so.",
    "We disclose what we know when we know it, and follow up as the picture completes.",
    "A material incident gets a public-facing write-up; we do not go quiet after the immediate fire is out.",
  ],
  severityTable: {
    caption: "Incident severity classification",
    columns: [
      { id: "definition", label: "Definition" },
      { id: "example", label: "Example" },
      { id: "page", label: "Paged?" },
      { id: "update", label: "First merchant update" },
    ],
    rows: [
      {
        id: "sev1",
        label: "SEV-1",
        definition: "Data breach, cross-tenant data exposure, or platform-wide outage",
        example: "RLS bypass discovered; checkout down platform-wide",
        page: "Immediate page, on-call + security lead",
        update: "Within 1 hour of confirmation",
      },
      {
        id: "sev2",
        label: "SEV-2",
        definition: "Significant degraded service or a contained security issue affecting a subset of merchants",
        example: "Elevated checkout error rate; one integration's key leaked",
        page: "Immediate page, on-call",
        update: "Within 4 hours",
      },
      {
        id: "sev3",
        label: "SEV-3",
        definition: "Limited-impact bug or a vulnerability with no evidence of exploitation",
        example: "A dependency CVE with no known exploit path in our usage",
        page: "Ticket, next business day",
        update: "Included in routine disclosure if applicable",
      },
      {
        id: "sev4",
        label: "SEV-4",
        definition: "Cosmetic or non-security operational issue",
        example: "A dashboard chart mislabels a unit",
        page: "Ticket",
        update: "Not applicable",
      },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* Band 12 — vulnerability disclosure policy                                */
/* -------------------------------------------------------------------------- */

export const disclosure = {
  title: "Vulnerability disclosure policy",
  intro: "We welcome good-faith security research and would rather hear from you first.",
  steps: [
    "Email security@framique.com (placeholder pending final domain configuration) with a description, reproduction steps and impact assessment.",
    "Do not test against live merchant stores you do not own or operate; use a test account or ask us to provision one.",
    "Give us a reasonable window to investigate and remediate before any public disclosure — we aim to acknowledge within 2 business days and provide a remediation timeline within 10 business days for confirmed issues.",
    "We will not pursue legal action against good-faith research conducted under this policy.",
  ],
  contactEmail: "security@framique.com",
  scope: {
    inScope: "The production application and API surfaces at *.framique.com and merchant subdomains.",
    outOfScope: "Third-party subprocessor infrastructure (report to them directly), denial-of-service testing, and social engineering of staff or merchants.",
  },
  bountyNote:
    "Out of scope for now: a paid bug bounty program is not yet running (see the roadmap band); we still want the report, and we will credit researchers publicly on request.",
};

/* -------------------------------------------------------------------------- */
/* Band 13 — dependency and supply-chain scanning                           */
/* -------------------------------------------------------------------------- */

export const supplyChain = {
  title: "Dependency and supply-chain scanning",
  rows: [
    { id: "scan", body: "Automated dependency scanning runs against every change, flagging known-vulnerable packages before merge.", tag: "blocks release" },
    { id: "gate", body: "A confirmed high or critical severity finding with a known exploit path blocks release until patched or explicitly risk-accepted by a named engineer, in writing, with a remediation deadline.", tag: "blocks release" },
    { id: "lockfile", body: "Lockfiles are committed and CI verifies the resolved dependency tree matches the lockfile.", tag: "verified in CI" },
    { id: "bundle-scan", body: "Client bundles are scanned before release for accidental inclusion of server-only code or secrets.", tag: "blocks release" },
    { id: "pinned", body: "Base images and infrastructure containers are pinned to specific versions rather than tracking latest.", tag: "pinned, not latest" },
    { id: "review", body: "Internal code review requires at least one other engineer's approval before merge to main.", tag: "reviewed change" },
  ],
};

/* -------------------------------------------------------------------------- */
/* Band 14 — self-hosting and data residency options                        */
/* -------------------------------------------------------------------------- */

export const selfHosting = {
  title: "Self-hosting and data residency options",
  bn: "ফ্রেমিক শুরু থেকেই সেলফ-হোস্ট-প্রথম — পোস্টগ্রেস, রেডিস, অথ ও পর্যবেক্ষণ স্ট্যাক আমাদের নিয়ন্ত্রণাধীন অবকাঠামোয় চলে, এবং প্রয়োজনে নির্দিষ্ট আঞ্চলিক বা সম্পূর্ণ সেলফ-হোস্টেড স্থাপনার বিকল্পও আলোচনাসাপেক্ষ।",
  intro:
    "Framique is built self-hosted-first: Postgres, Redis, auth, storage and the entire observability stack run on infrastructure we control, and the application only ever talks to them through swappable, provider-agnostic connection strings — nothing in the application code names a specific hosting provider.",
  options: [
    {
      id: "standard",
      title: "Standard hosting",
      body: "Your data runs on our managed self-hosted infrastructure, located and operated to support Bangladesh-first residency expectations.",
    },
    {
      id: "regional",
      title: "Dedicated / regional hosting",
      body: "For merchants with a specific residency requirement, infrastructure can be provisioned in a specific region on a case-by-case basis — contact us to scope this before committing to a contract.",
      featured: true,
    },
    {
      id: "self-hosted",
      title: "Fully self-hosted (enterprise)",
      body: "A merchant with the operational capacity to run their own Postgres, Redis and observability stack can deploy Framique on infrastructure they own and control entirely. Discussed directly with our team, not a self-serve toggle.",
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Band 15 — subprocessor transparency table                                */
/* -------------------------------------------------------------------------- */

export const subprocessors = {
  title: "Subprocessor transparency table",
  intro:
    "We minimise third parties in the data path by design — most of the stack is self-hosted precisely to avoid an ever-growing subprocessor list. Full, current subprocessor names and jurisdictions are listed in our data processing agreement, kept current as agreements change; this page describes the categories and boundaries.",
  table: {
    caption: "Subprocessor categories",
    columns: [
      { id: "purpose", label: "Purpose" },
      { id: "data", label: "Data involved" },
      { id: "location", label: "Location commitment" },
    ],
    rows: [
      {
        id: "payments",
        label: "Payment processing (MFS/bank/BNPL partners)",
        purpose: "Processing charges, refunds and payouts initiated by the merchant",
        data: "Transaction reference, amount, masked payment details",
        location: "Per processor's own regulatory jurisdiction; raw credentials never transit our servers",
      },
      {
        id: "courier",
        label: "Courier partners",
        purpose: "Fulfilling shipments the merchant creates",
        data: "Recipient name, address, phone, order reference",
        location: "Bangladesh-based courier operations",
      },
      {
        id: "hosting",
        label: "Infrastructure hosting",
        purpose: "Running self-hosted Postgres, Redis, and the application",
        data: "All merchant data, self-hosted",
        location: "Per hosting/residency option selected",
      },
      {
        id: "delivery",
        label: "Email/SMS delivery (transactional)",
        purpose: "Order confirmations, OTPs, account notifications",
        data: "Recipient contact detail, message content",
        location: "Disclosed in the data processing agreement on request",
      },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* Band 16 — customer-side security checklist                               */
/* -------------------------------------------------------------------------- */

export const checklist = {
  title: "Your side of the security checklist",
  titleBn: "আপনার পক্ষের নিরাপত্তা চেকলিস্ট",
  intro: "Security is shared: we harden the platform, and these ten habits close the gaps only the merchant controls.",
  items: [
    "Turn on two-factor authentication for every staff account with owner or manager access.",
    "Use the least-privileged role for each staff member.",
    "Rotate API keys on a schedule (90 days) and immediately after any staff departure who had access to one.",
    "Scope every API key narrowly — a courier integration needs order and shipping scopes, not payout access.",
    "Review the audit log periodically, especially after a staff change, for actions you don't recognise.",
    "Never share login credentials over chat, email or phone — including with anyone claiming to be Framique support.",
    "Set a refund cap appropriate to staff trust level rather than leaving it unlimited by default.",
    "Verify webhook endpoints you configure are HTTPS and validate the signature we send.",
    "Keep a designated security contact on file with us so incident notifications reach a real person.",
    "Test your own restore/export process at least once — know how to get your data out before you ever need to.",
  ],
};

/* -------------------------------------------------------------------------- */
/* Band 17 — compliance roadmap, clearly marked                             */
/* -------------------------------------------------------------------------- */

export const complianceRoadmap = {
  title: "Compliance roadmap — clearly marked",
  warning:
    "This band lists work in progress. Nothing here is a current certification or audit status. Items move out of this band only once genuinely completed, and this page is updated at that point — not before.",
  table: {
    caption: "Compliance initiatives in progress",
    columns: [
      { id: "status", label: "Status" },
      { id: "meaning", label: "What it means when complete" },
    ],
    rows: [
      {
        id: "pentest",
        label: "Formal penetration test by an independent third party",
        meaning: "External validation of the isolation model and API surface, with findings remediated and summarised publicly",
      },
      {
        id: "bounty",
        label: "Bug bounty program",
        meaning: "A standing paid incentive for external researchers, replacing the current goodwill disclosure process",
      },
      {
        id: "soc2",
        label: "SOC 2 Type II readiness review",
        meaning: "Not a claim of certification today; a scoped effort to align controls with SOC 2 Type II criteria ahead of a future audit",
      },
      {
        id: "pci",
        label: "PCI DSS scope reduction review",
        meaning: "Formal confirmation of the tokenisation boundary, ahead of any assessment",
      },
      {
        id: "iso27001",
        label: "ISO 27001 gap assessment",
        meaning: "Structured comparison of current practices against the standard, as a precursor to a certification decision",
      },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* Band 18 — FAQ                                                            */
/* -------------------------------------------------------------------------- */

export const faq: Array<{ id: string; question: string; answer: string }> = [
  {
    id: "certification",
    question: "Do you hold SOC 2 or ISO 27001 certification today?",
    answer:
      "No. We describe our controls and practices on this page; formal third-party certification work is listed as roadmap and we do not claim a status we have not achieved.",
  },
  {
    id: "data-location",
    question: "Where does merchant data physically live?",
    answer:
      "On self-hosted infrastructure we operate, with regional and fully self-hosted options available for merchants with specific residency requirements.",
  },
  {
    id: "cross-tenant",
    question: "Can one merchant ever see another merchant's data through a bug in your app?",
    answer:
      "Isolation is enforced by Postgres row-level security, underneath our application code, and verified by a negative-assertion test suite that runs on every release. No system is provably bug-free, which is exactly why isolation is enforced at the database layer rather than trusted to application logic alone.",
  },
  {
    id: "card-numbers",
    question: "Do you ever see our customers' full card numbers?",
    answer:
      "No. Card and MFS credentials are handled through the processor's own hosted flow; we store a reference token and masked details, never the underlying credential.",
  },
  {
    id: "breach",
    question: "What happens if there's a data breach?",
    answer:
      "It is classified SEV-1, contained immediately, and affected merchants are notified directly within the severity table's timelines, followed by a public post-mortem for material incidents.",
  },
  {
    id: "self-host",
    question: "Can we run Framique entirely on our own infrastructure?",
    answer:
      "Yes, as an enterprise option — the platform has no hard-coded dependency on our specific hosting, by design. Contact us to scope it.",
  },
  {
    id: "report",
    question: "How do we report a security vulnerability we found?",
    answer:
      "Email security@framique.com with details; see the disclosure policy above for scope, response-time commitments, and safe-harbour terms.",
  },
  {
    id: "logging",
    question: "What do you log, and could our secrets end up in a log file?",
    answer:
      "We log structured, PII-scrubbed request data; known secret-shaped values are redacted before a log line is written, and secrets are never used in metric labels or error bodies.",
  },
  {
    id: "backup-testing",
    question: "How often are backups tested, not just taken?",
    answer:
      "On a scheduled cadence, restoring into an isolated environment and verifying integrity — a backup that has never been restored is not treated as a working backup.",
  },
  {
    id: "staff-access",
    question: "Who can access our store's data on your side, and is it logged?",
    answer:
      "Only staff with a permission granted for a specific reason, mostly none at all — platform-admin cross-merchant access is granted per-incident, time-boxed, and every access is written to the audit log with the justifying ticket ID.",
  },
];

/* -------------------------------------------------------------------------- */
/* Band 19 — final CTA                                                      */
/* -------------------------------------------------------------------------- */

export const finalCta = {
  title: "Send us your security questionnaire.",
  titleBn: "আপনার সিকিউরিটি প্রশ্নপত্র আমাদের পাঠান।",
  body: "Most vendor security reviews map directly onto the bands above. Send us yours and we'll respond with citations back to this page and our data processing agreement, not a generic template.",
  primaryCta: "Contact security",
  primaryHref: "mailto:security@framique.com",
  altCta: "Read the legal docs",
};
