/**
 * Phase 13 — observability integration catalogue (pure, no I/O).
 *
 * One place describes every self-hosted service an operator connects: how to
 * probe it, which environment variable holds its credential, where its Grafana
 * or issue view lives, and what the compose profile costs to run. The dashboard
 * and the server-side prober both read this, so a new service is added once.
 */

export const INTEGRATION_SERVICES = [
  "supabase",
  "prometheus",
  "loki",
  "grafana",
  "alertmanager",
  "glitchtip",
  "sentry",
] as const;

export type IntegrationService = (typeof INTEGRATION_SERVICES)[number];

export function isIntegrationService(v: string): v is IntegrationService {
  return (INTEGRATION_SERVICES as readonly string[]).includes(v);
}

export type ProbeStatus = "up" | "degraded" | "down" | "unknown";

export type ServiceSpec = {
  key: IntegrationService;
  label: string;
  labelBn: string;
  /** What this service answers for the operator. */
  purpose: string;
  /** Health path appended to the configured base URL. */
  healthPath: string;
  /** Environment variable holding the token/password. Never rendered back. */
  credentialEnv: string | null;
  /** How the credential is presented on the wire. */
  auth: "none" | "bearer" | "basic" | "apikey";
  /** Deep link path into the service's own UI for this subsystem. */
  deepLinkPath: string;
  /** Compose profile that starts it, for the setup wizard. */
  profile: string;
  /** Rough monthly cost note: this stack is self-hosted, so it is disk and RAM. */
  runningCost: string;
  defaultUrl: string;
};

const s = (spec: ServiceSpec) => spec;

export const SERVICE_CATALOG: Record<IntegrationService, ServiceSpec> = {
  supabase: s({
    key: "supabase",
    label: "Supabase",
    labelBn: "সুপাবেস",
    purpose: "Database, auth and storage for every tenant.",
    healthPath: "/rest/v1/",
    credentialEnv: "SUPABASE_SERVICE_ROLE_KEY",
    auth: "apikey",
    deepLinkPath: "/project/default",
    profile: "supabase",
    runningCost: "2 vCPU / 4 GB plus database disk; the largest single cost.",
    defaultUrl: "http://localhost:8000",
  }),
  prometheus: s({
    key: "prometheus",
    label: "Prometheus",
    labelBn: "প্রমিথিউস",
    purpose: "Scrapes app and database metrics; drives every alert rule.",
    healthPath: "/-/healthy",
    credentialEnv: null,
    auth: "none",
    deepLinkPath: "/targets",
    profile: "observability",
    runningCost: "1 vCPU / 2 GB, ~15 GB disk at 30-day retention.",
    defaultUrl: "http://localhost:9090",
  }),
  loki: s({
    key: "loki",
    label: "Loki",
    labelBn: "লোকি",
    purpose: "Stores structured application and gateway logs.",
    healthPath: "/ready",
    credentialEnv: null,
    auth: "none",
    deepLinkPath: "/loki/api/v1/labels",
    profile: "observability",
    runningCost: "1 vCPU / 2 GB, ~20 GB disk at 14-day retention.",
    defaultUrl: "http://localhost:3100",
  }),
  grafana: s({
    key: "grafana",
    label: "Grafana",
    labelBn: "গ্রাফানা",
    purpose: "Dashboards over metrics, logs and alert history.",
    healthPath: "/api/health",
    credentialEnv: "GRAFANA_API_TOKEN",
    auth: "bearer",
    deepLinkPath: "/dashboards",
    profile: "observability",
    runningCost: "0.5 vCPU / 1 GB, negligible disk.",
    defaultUrl: "http://localhost:3000",
  }),
  alertmanager: s({
    key: "alertmanager",
    label: "Alertmanager",
    labelBn: "অ্যালার্টম্যানেজার",
    purpose: "Routes firing alerts to Slack and on-call.",
    healthPath: "/-/healthy",
    credentialEnv: null,
    auth: "none",
    deepLinkPath: "/#/alerts",
    profile: "observability",
    runningCost: "0.25 vCPU / 512 MB.",
    defaultUrl: "http://localhost:9093",
  }),
  glitchtip: s({
    key: "glitchtip",
    label: "GlitchTip",
    labelBn: "গ্লিচটিপ",
    purpose: "Default error tracker: browser, SSR and server-function crashes.",
    healthPath: "/_health/",
    credentialEnv: "GLITCHTIP_API_TOKEN",
    auth: "bearer",
    deepLinkPath: "/issues",
    profile: "glitchtip",
    runningCost: "1 vCPU / 2 GB plus its own Postgres.",
    defaultUrl: "http://localhost:8010",
  }),
  sentry: s({
    key: "sentry",
    label: "Sentry (self-hosted)",
    labelBn: "সেন্ট্রি (সেলফ-হোস্টেড)",
    purpose: "Heavy error tracker for deep traces and release health.",
    healthPath: "/_health/",
    credentialEnv: "SENTRY_API_TOKEN",
    auth: "bearer",
    deepLinkPath: "/organizations/sentry/issues/",
    profile: "sentry",
    runningCost: "4 vCPU / 8 GB minimum; only run it if you need it.",
    defaultUrl: "http://localhost:9000",
  }),
};

/** Probe result → status. Slow but answering is degraded, not down. */
export function classifyProbe(httpStatus: number | null, latencyMs: number): ProbeStatus {
  if (httpStatus === null) return "down";
  if (httpStatus >= 500) return "down";
  if (httpStatus === 401 || httpStatus === 403) return "degraded";
  if (httpStatus >= 400) return "degraded";
  return latencyMs > 2000 ? "degraded" : "up";
}

export const STATUS_TONE: Record<ProbeStatus, "ok" | "warn" | "bad"> = {
  up: "ok",
  degraded: "warn",
  down: "bad",
  unknown: "warn",
};

/** Overall strip state: the worst connected service wins. */
export function overallIntegrationStatus(states: ProbeStatus[]): ProbeStatus {
  if (states.length === 0) return "unknown";
  if (states.includes("down")) return "down";
  if (states.includes("degraded")) return "degraded";
  if (states.every((x) => x === "up")) return "up";
  return "unknown";
}

/** Uptime over the probe history, as a percentage with one decimal. */
export function uptimePercent(probes: { status: string }[]) {
  if (probes.length === 0) return null;
  const up = probes.filter((p) => p.status === "up").length;
  return Math.round((up / probes.length) * 1000) / 10;
}

export function deepLink(baseUrl: string, service: IntegrationService) {
  const clean = baseUrl.replace(/\/+$/, "");
  return `${clean}${SERVICE_CATALOG[service].deepLinkPath}`;
}

export function healthUrl(baseUrl: string, service: IntegrationService) {
  const clean = baseUrl.replace(/\/+$/, "");
  return `${clean}${SERVICE_CATALOG[service].healthPath}`;
}

/* ------------------------------------------------------------------ */
/* Setup wizard                                                         */
/* ------------------------------------------------------------------ */

/** The `.env` block an operator pastes for the services they picked. */
export function envBlock(services: IntegrationService[], urls: Partial<Record<IntegrationService, string>> = {}) {
  const lines: string[] = ["# Framique observability integrations"];
  for (const key of services) {
    const spec = SERVICE_CATALOG[key];
    lines.push(`${key.toUpperCase()}_URL=${urls[key] ?? spec.defaultUrl}`);
    if (spec.credentialEnv) lines.push(`${spec.credentialEnv}=`);
  }
  return lines.join("\n");
}

/** The compose command that starts exactly the chosen profiles. */
export function composeCommand(services: IntegrationService[]) {
  const profiles = [...new Set(services.map((k) => SERVICE_CATALOG[k].profile))].filter((p) => p !== "supabase");
  if (profiles.length === 0) return "docker compose -f ops/docker-compose.observability.yml up -d";
  const files = new Set<string>();
  for (const p of profiles) {
    files.add(p === "observability" ? "ops/docker-compose.observability.yml" : "ops/docker-compose.errors.yml");
  }
  const fileArgs = [...files].map((f) => `-f ${f}`).join(" ");
  const profileArgs = profiles
    .filter((p) => p !== "observability")
    .map((p) => `--profile ${p}`)
    .join(" ");
  return `docker compose ${fileArgs} ${profileArgs} up -d`.replace(/\s+/g, " ").trim();
}

export function costNote(services: IntegrationService[]) {
  return services.map((k) => `${SERVICE_CATALOG[k].label}: ${SERVICE_CATALOG[k].runningCost}`);
}

/** A URL is only accepted when it is absolute and http(s). */
export function validBaseUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Phase 13 — health strip                                              */
/* ------------------------------------------------------------------ */

/**
 * The five numbers an operator checks before believing a green card: is the
 * scraper still scraping, are logs still arriving, is anything firing, how many
 * errors landed in the last hour, and how old is the newest backup.
 */
export const SIGNAL_KEYS = ["last_scrape", "last_log", "active_alerts", "errors_1h", "backup_age"] as const;

export type SignalKey = (typeof SIGNAL_KEYS)[number];

export type SignalSpec = {
  key: SignalKey;
  label: string;
  unit: "seconds" | "count";
  /** Above `warn` is amber, above `bad` is red. */
  warn: number;
  bad: number;
  source: IntegrationService;
};

export const SIGNAL_SPECS: Record<SignalKey, SignalSpec> = {
  last_scrape: { key: "last_scrape", label: "Last scrape", unit: "seconds", warn: 120, bad: 600, source: "prometheus" },
  last_log: { key: "last_log", label: "Last log line", unit: "seconds", warn: 300, bad: 1800, source: "loki" },
  active_alerts: { key: "active_alerts", label: "Active alerts", unit: "count", warn: 1, bad: 5, source: "alertmanager" },
  errors_1h: { key: "errors_1h", label: "Errors (1h)", unit: "count", warn: 10, bad: 100, source: "loki" },
  backup_age: { key: "backup_age", label: "Newest backup", unit: "seconds", warn: 26 * 3600, bad: 48 * 3600, source: "supabase" },
};

export type OpsSignal = { key: SignalKey; value: number | null; detail: string | null };

/** Tone for one signal. An unknown value is amber: silence is not health. */
export function signalTone(key: SignalKey, value: number | null): "ok" | "warn" | "bad" {
  if (value === null || !Number.isFinite(value)) return "warn";
  const spec = SIGNAL_SPECS[key];
  if (value >= spec.bad) return "bad";
  if (value >= spec.warn) return "warn";
  return "ok";
}

/** Human age: "42s", "7m", "3h", "2d". */
export function formatAge(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  if (seconds < 172_800) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}

export function formatSignal(key: SignalKey, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return SIGNAL_SPECS[key].unit === "seconds" ? formatAge(value) : String(Math.round(value));
}

/**
 * Which public status-page component a probe result speaks for, so the same
 * probe that paints this dashboard also degrades `/status`.
 */
export const STATUS_COMPONENT: Record<IntegrationService, string> = {
  supabase: "database",
  prometheus: "observability",
  loki: "observability",
  grafana: "observability",
  alertmanager: "observability",
  glitchtip: "observability",
  sentry: "observability",
};

/** Probe status → public component state. Degraded plumbing is not an outage. */
export function componentStateForProbe(status: ProbeStatus): "operational" | "degraded" | "partial_outage" {
  if (status === "down") return "partial_outage";
  if (status === "degraded") return "degraded";
  return "operational";
}
