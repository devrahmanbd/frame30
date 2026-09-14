/**
 * Isomorphic operations logic (§2.9). Pure functions only: PII scrubbing,
 * dead-letter triage, incident state machine, status roll-up and retention
 * policy. Server modules and UI both import from here so the rules that a
 * responder sees on screen are the same rules the sweep enforces.
 */

export const PII_MASK = "[redacted]";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Bangladeshi mobiles (+8801XXXXXXXXX / 01XXXXXXXXX) plus generic long digit runs.
const PHONE_RE = /(?:\+?88)?0?1[3-9]\d{8}\b/g;
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;
const TOKEN_RE = /\b(?:sb_[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_.-]{8,})/g;

const SENSITIVE_KEYS =
  /^(email|phone|msisdn|mobile|name|full_name|address|address_line|street|customer_name|token|access_token|refresh_token|secret|password|authorization|apikey|api_key|card|pan|cvv)$/i;

/** Mask direct identifiers inside a free-text string. Never throws. */
export function scrubText(input: string): string {
  return input
    .replace(TOKEN_RE, PII_MASK)
    .replace(EMAIL_RE, PII_MASK)
    .replace(CARD_RE, (m) => (m.replace(/\D/g, "").length >= 13 ? PII_MASK : m))
    .replace(PHONE_RE, PII_MASK);
}

/**
 * Recursively scrub a log/error payload. Sensitive keys are dropped entirely,
 * strings are masked, and depth/breadth are capped so a hostile payload cannot
 * blow up the logger.
 */
export function scrubPayload(value: unknown, depth = 0): unknown {
  if (depth > 6) return PII_MASK;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrubPayload(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 60)) {
      out[k] = SENSITIVE_KEYS.test(k) ? PII_MASK : scrubPayload(v, depth + 1);
    }
    return out;
  }
  return PII_MASK;
}

// ------------------------------------------------------------ dead letters

export type DlqSource = "payments" | "courier";

export type DeadLetter = {
  id: string;
  source: DlqSource;
  provider: string;
  merchantId: string | null;
  merchantName: string | null;
  reason: string | null;
  status: string;
  attempts: number;
  receivedAt: string;
};

export type DlqSeverity = "fresh" | "aging" | "stale" | "critical";

/** Age-based triage: responders act on the oldest, most retried items first. */
export function dlqSeverity(receivedAt: string, attempts: number, now = Date.now()): DlqSeverity {
  const ageMinutes = Math.max(0, (now - new Date(receivedAt).getTime()) / 60000);
  if (ageMinutes > 24 * 60 || attempts >= 5) return "critical";
  if (ageMinutes > 4 * 60) return "stale";
  if (ageMinutes > 30) return "aging";
  return "fresh";
}

export function dlqSummary(items: DeadLetter[], now = Date.now()) {
  const bySeverity: Record<DlqSeverity, number> = { fresh: 0, aging: 0, stale: 0, critical: 0 };
  const bySource: Record<string, number> = {};
  let oldest: string | null = null;
  for (const item of items) {
    bySeverity[dlqSeverity(item.receivedAt, item.attempts, now)] += 1;
    bySource[item.source] = (bySource[item.source] ?? 0) + 1;
    if (!oldest || item.receivedAt < oldest) oldest = item.receivedAt;
  }
  return { total: items.length, bySeverity, bySource, oldest };
}

// ------------------------------------------------------------ incidents

export const INCIDENT_STATUSES = ["investigating", "identified", "monitoring", "resolved"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

const TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  investigating: ["identified", "monitoring", "resolved"],
  identified: ["monitoring", "resolved"],
  monitoring: ["identified", "resolved"],
  resolved: [],
};

/** Forward-only lifecycle; a resolved incident is closed for good. */
export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export const COMPONENT_STATES = [
  "operational",
  "degraded",
  "partial_outage",
  "major_outage",
  "maintenance",
] as const;
export type ComponentState = (typeof COMPONENT_STATES)[number];

const STATE_RANK: Record<ComponentState, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4,
};

/** Worst component wins, so the banner never understates an outage. */
export function overallStatus(states: ComponentState[]): ComponentState {
  return states.reduce<ComponentState>(
    (worst, s) => (STATE_RANK[s] > STATE_RANK[worst] ? s : worst),
    "operational",
  );
}

export function statusHeadline(state: ComponentState): string {
  switch (state) {
    case "operational":
      return "All systems operational";
    case "maintenance":
      return "Planned maintenance in progress";
    case "degraded":
      return "Degraded performance";
    case "partial_outage":
      return "Partial outage";
    default:
      return "Major outage";
  }
}

// ------------------------------------------------------------ retention & backups

export type RetentionRule = { table: string; days: number; note: string };

/** Mirrors `public.ops_retention_sweep`; ledgers and money rows are excluded. */
export const RETENTION_POLICY: RetentionRule[] = [
  { table: "auth_events", days: 90, note: "Raw sign-in telemetry" },
  { table: "api_key_events", days: 180, note: "API key usage trail" },
  { table: "courier_webhook_events", days: 90, note: "Processed courier callbacks" },
  { table: "webhook_events", days: 90, note: "Processed gateway callbacks" },
  { table: "activity_log", days: 365, note: "Merchant activity feed" },
];

export type BackupRun = {
  id: string;
  kind: "backup" | "restore_drill";
  status: "running" | "passed" | "failed";
  startedAt: string;
  finishedAt: string | null;
  rowsVerified: number;
};

/**
 * Backup health: a backup within 24h and a restore drill within 30 days.
 * Anything older is an ops finding, not a green tick.
 */
export function backupHealth(runs: BackupRun[], now = Date.now()) {
  const latest = (kind: BackupRun["kind"]) =>
    runs.filter((r) => r.kind === kind && r.status === "passed").sort((a, b) => (a.startedAt > b.startedAt ? -1 : 1))[0] ?? null;
  const backup = latest("backup");
  const drill = latest("restore_drill");
  const hours = (iso: string | undefined) =>
    iso ? (now - new Date(iso).getTime()) / 3600000 : Number.POSITIVE_INFINITY;
  const backupAgeHours = hours(backup?.startedAt);
  const drillAgeHours = hours(drill?.startedAt);
  return {
    backup,
    drill,
    backupAgeHours,
    drillAgeHours,
    backupOk: backupAgeHours <= 24,
    drillOk: drillAgeHours <= 24 * 30,
  };
}
