/**
 * Phase 13 — integration dashboard, server half.
 *
 * Every probe runs here, never in the browser: credentials live only in server
 * environment variables and are attached to the outgoing request, so nothing
 * secret is ever shipped to the operator's tab. Each connection change is
 * written to `platform_audit_log`, and every probe is kept for 30 days so the
 * dashboard can draw an honest up/down history.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { incr, log } from "./observability.server";
import { requirePlatformAdmin } from "./platform.server";
import { ownerGate } from "./owner-ops.server";
import {
  classifyProbe,
  healthUrl,
  isIntegrationService,
  SERVICE_CATALOG,
  uptimePercent,
  validBaseUrl,
  componentStateForProbe,
  SIGNAL_KEYS,
  STATUS_COMPONENT,
  type IntegrationService,
  type OpsSignal,
  type ProbeStatus,
  type SignalKey,
} from "./integrations";

type Client = SupabaseClient<Database>;

export class IntegrationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "IntegrationError";
  }
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Client;
}

type ConnectionRow = {
  service: string;
  base_url: string;
  credential_env: string | null;
  notes: string | null;
  enabled: boolean;
  last_status: string;
  last_latency_ms: number | null;
  last_error: string | null;
  last_checked_at: string | null;
};

const PROBE_TIMEOUT_MS = 5000;

function credentialHeaders(service: IntegrationService): Record<string, string> {
  const spec = SERVICE_CATALOG[service];
  if (!spec.credentialEnv) return {};
  const value = process.env[spec.credentialEnv];
  if (!value) return {};
  if (spec.auth === "bearer") return { authorization: `Bearer ${value}` };
  if (spec.auth === "apikey") return { apikey: value };
  if (spec.auth === "basic") return { authorization: `Basic ${btoa(`admin:${value}`)}` };
  return {};
}

/** Whether the credential this service needs is actually present on the host. */
export function credentialPresent(service: IntegrationService) {
  const env = SERVICE_CATALOG[service].credentialEnv;
  return env ? Boolean(process.env[env]) : true;
}

export type ProbeResult = {
  service: IntegrationService;
  status: ProbeStatus;
  latencyMs: number;
  httpStatus: number | null;
  error: string | null;
};

/** One HTTP probe. Returns the exact failure text — an operator needs it. */
export async function probeService(service: IntegrationService, baseUrl: string): Promise<ProbeResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(healthUrl(baseUrl, service), {
      method: "GET",
      headers: credentialHeaders(service),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    const status = classifyProbe(res.status, latencyMs);
    return {
      service,
      status,
      latencyMs,
      httpStatus: res.status,
      error: status === "up" ? null : `HTTP ${res.status} ${res.statusText}`.trim(),
    };
  } catch (err) {
    return {
      service,
      status: "down",
      latencyMs: Date.now() - started,
      httpStatus: null,
      error: (err as Error).message.slice(0, 300),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function recordProbe(db: Client, result: ProbeResult) {
  await db.from("integration_probes").insert({
    service: result.service,
    status: result.status,
    latency_ms: result.latencyMs,
    error: result.error,
  } as never);
  await db
    .from("integration_connections")
    .update({
      last_status: result.status,
      last_latency_ms: result.latencyMs,
      last_error: result.error,
      last_checked_at: new Date().toISOString(),
    } as never)
    .eq("service", result.service);
  incr("framique_integration_probe_total", { service: result.service, outcome: result.status });
}


/* ---------------------------------- reads ---------------------------------- */

export type ServiceView = {
  service: IntegrationService;
  label: string;
  purpose: string;
  connected: boolean;
  enabled: boolean;
  baseUrl: string;
  credentialEnv: string | null;
  credentialPresent: boolean;
  notes: string | null;
  status: ProbeStatus;
  latencyMs: number | null;
  error: string | null;
  checkedAt: string | null;
  uptime30d: number | null;
  history: { status: string; checked_at: string }[];
};

export async function loadIntegrations(db: Client, userId: string) {
  await requirePlatformAdmin(db, userId);
  const service = await admin();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: rows }, { data: probes }] = await Promise.all([
    service.from("integration_connections").select("*"),
    service
      .from("integration_probes")
      .select("service, status, checked_at")
      .gte("checked_at", since)
      .order("checked_at", { ascending: false })
      .limit(2000),
  ]);
  const byService = new Map((rows ?? []).map((r) => [(r as ConnectionRow).service, r as ConnectionRow]));
  const probeRows = (probes ?? []) as { service: string; status: string; checked_at: string }[];

  const views: ServiceView[] = Object.values(SERVICE_CATALOG).map((spec) => {
    const row = byService.get(spec.key);
    const history = probeRows.filter((p) => p.service === spec.key).slice(0, 200);
    return {
      service: spec.key,
      label: spec.label,
      purpose: spec.purpose,
      connected: Boolean(row),
      enabled: row?.enabled ?? false,
      baseUrl: row?.base_url ?? spec.defaultUrl,
      credentialEnv: spec.credentialEnv,
      credentialPresent: credentialPresent(spec.key),
      notes: row?.notes ?? null,
      status: (row?.last_status as ProbeStatus | undefined) ?? "unknown",
      latencyMs: row?.last_latency_ms ?? null,
      error: row?.last_error ?? null,
      checkedAt: row?.last_checked_at ?? null,
      uptime30d: uptimePercent(history),
      history: history.slice(0, 60),
    };
  });
  return { services: views };
}

/* --------------------------------- writes ---------------------------------- */

export async function saveIntegration(
  db: Client,
  userId: string,
  input: { service: string; baseUrl: string; notes?: string | null; enabled?: boolean },
) {
  if (!isIntegrationService(input.service)) throw new IntegrationError("integration.unknown_service");
  if (!validBaseUrl(input.baseUrl)) throw new IntegrationError("integration.bad_url");
  const key = input.service;
  return ownerGate(
    db,
    userId,
    {
      action: "integration.saved",
      entity: "integration_connection",
      entityId: key,
      bucket: "platform.write",
      kind: "write",
      meta: { service: key, baseUrl: input.baseUrl, enabled: input.enabled ?? true },
    },
    async () => {
      const service = await admin();
      const spec = SERVICE_CATALOG[key];
      const { error } = await service.from("integration_connections").upsert(
        {
          service: key,
          base_url: input.baseUrl.replace(/\/+$/, ""),
          credential_env: spec.credentialEnv,
          notes: input.notes ?? null,
          enabled: input.enabled ?? true,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "service" },
      );
      if (error) throw new IntegrationError("integration.save_failed");
      log("info", "integration.saved", { service: key });
      return { ok: true };
    },
  );
}

export async function disconnectIntegration(db: Client, userId: string, serviceKey: string) {
  if (!isIntegrationService(serviceKey)) throw new IntegrationError("integration.unknown_service");
  const key = serviceKey;
  return ownerGate(
    db,
    userId,
    {
      action: "integration.disconnected",
      entity: "integration_connection",
      entityId: key,
      bucket: "platform.write",
      kind: "write",
      meta: { service: key },
    },
    async () => {
      const service = await admin();
      await service.from("integration_connections").delete().eq("service", key);
      return { ok: true };
    },
  );
}

/** "Test connection": probe now, store the result, return latency or the error. */
export async function testIntegration(db: Client, userId: string, serviceKey: string) {
  if (!isIntegrationService(serviceKey)) throw new IntegrationError("integration.unknown_service");
  const key = serviceKey;
  return ownerGate(
    db,
    userId,
    {
      action: "integration.tested",
      entity: "integration_connection",
      entityId: key,
      bucket: "platform.write",
      kind: "write",
    },
    async () => {
      const service = await admin();
      const { data } = await service
        .from("integration_connections")
        .select("base_url")
        .eq("service", key)
        .maybeSingle();
      const baseUrl = (data as { base_url: string } | null)?.base_url ?? SERVICE_CATALOG[key].defaultUrl;
      const result = await probeService(key, baseUrl);
      await recordProbe(service, result);
      return result;
    },
  );
}

/** Probe everything connected — used by the dashboard poll and by cron. */
export async function probeAllIntegrations() {
  const service = await admin();
  const { data } = await service.from("integration_connections").select("service, base_url, enabled");
  const rows = ((data ?? []) as { service: string; base_url: string; enabled: boolean }[]).filter(
    (r) => r.enabled && isIntegrationService(r.service),
  );
  const results = await Promise.all(
    rows.map((r) => probeService(r.service as IntegrationService, r.base_url)),
  );
  for (const result of results) await recordProbe(service, result);
  await publishProbeStatuses(results);
  return results;
}

/** Retention: the dashboard promises 30 days of history, not more. */
export async function sweepIntegrationProbes() {
  const service = await admin();
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { count } = await service
    .from("integration_probes")
    .delete({ count: "exact" })
    .lt("checked_at", cutoff);
  return count ?? 0;
}

/* ------------------------------------------------------------------ */
/* Phase 13 — health strip + public status publication                  */
/* ------------------------------------------------------------------ */


const SIGNAL_TIMEOUT_MS = 4000;

async function getJson(url: string, headers: Record<string, string>): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SIGNAL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function promScalar(payload: unknown): number | null {
  const result = (payload as { data?: { result?: { value?: [number, string] }[] } })?.data?.result;
  const raw = result?.[0]?.value?.[1];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function baseUrls(db: Client): Promise<Partial<Record<IntegrationService, string>>> {
  const { data } = await db.from("integration_connections").select("service, base_url, enabled");
  const out: Partial<Record<IntegrationService, string>> = {};
  for (const row of (data ?? []) as { service: string; base_url: string; enabled: boolean }[]) {
    if (row.enabled && isIntegrationService(row.service)) out[row.service] = row.base_url.replace(/\/+$/, "");
  }
  return out;
}

/**
 * The five health-strip numbers. Every credential is read from the server
 * environment here, so the browser only ever receives the numbers themselves.
 */
export async function loadOpsSignals(db: Client, userId: string): Promise<{ signals: OpsSignal[] }> {
  await requirePlatformAdmin(db, userId);
  const service = await admin();
  const urls = await baseUrls(service);
  const values = new Map<SignalKey, { value: number | null; detail: string | null }>();
  const put = (key: SignalKey, value: number | null, detail: string | null = null) =>
    values.set(key, { value, detail });

  // Prometheus: seconds since the freshest scrape of anything.
  if (urls.prometheus) {
    const payload = await getJson(
      `${urls.prometheus}/api/v1/query?query=${encodeURIComponent("time() - max(timestamp(up))")}`,
      credentialHeaders("prometheus"),
    );
    put("last_scrape", promScalar(payload), payload ? null : "Prometheus did not answer");
  } else put("last_scrape", null, "Prometheus not connected");

  // Loki: age of the newest line, and how many error lines landed in an hour.
  if (urls.loki) {
    const headers = credentialHeaders("loki");
    const tail = await getJson(
      `${urls.loki}/loki/api/v1/query_range?limit=1&direction=backward&query=${encodeURIComponent('{job="framique"}')}`,
      headers,
    );
    const streams = (tail as { data?: { result?: { values?: [string, string][] }[] } })?.data?.result ?? [];
    const newestNs = streams.flatMap((s) => s.values ?? []).map((v) => Number(v[0]))[0];
    put(
      "last_log",
      Number.isFinite(newestNs) ? Math.max(0, (Date.now() - newestNs / 1e6) / 1000) : null,
      tail ? null : "Loki did not answer",
    );

    const errors = await getJson(
      `${urls.loki}/loki/api/v1/query?query=${encodeURIComponent(
        'sum(count_over_time({job="framique"} |= "\\"level\\":\\"error\\"" [1h]))',
      )}`,
      headers,
    );
    put("errors_1h", promScalar(errors));
  } else {
    put("last_log", null, "Loki not connected");
    put("errors_1h", null, "Loki not connected");
  }

  // Alertmanager: how many alerts are firing right now.
  if (urls.alertmanager) {
    const alerts = await getJson(
      `${urls.alertmanager}/api/v2/alerts?active=true&silenced=false&inhibited=false`,
      credentialHeaders("alertmanager"),
    );
    put("active_alerts", Array.isArray(alerts) ? alerts.length : null, alerts ? null : "Alertmanager did not answer");
  } else put("active_alerts", null, "Alertmanager not connected");

  // Backup age comes from our own ledger, not from a service probe.
  try {
    const { data } = await service
      .from("ops_backup_runs")
      .select("created_at, outcome")
      .order("created_at", { ascending: false })
      .limit(20);
    const rows = (data ?? []) as { created_at: string; outcome: string | null }[];
    const newest = rows.find((r) => (r.outcome ?? "ok") !== "fail");
    put(
      "backup_age",
      newest ? Math.max(0, (Date.now() - new Date(newest.created_at).getTime()) / 1000) : null,
      newest ? null : "No successful backup recorded",
    );
  } catch {
    put("backup_age", null, "Backup ledger unavailable");
  }

  return {
    signals: SIGNAL_KEYS.map((key) => ({
      key,
      value: values.get(key)?.value ?? null,
      detail: values.get(key)?.detail ?? null,
    })),
  };
}

/**
 * Publishes probe results onto the public status page, so `/status` degrades
 * from the same evidence the operator sees. Manual maintenance always wins.
 */
export async function publishProbeStatuses(results: ProbeResult[]) {
  if (results.length === 0) return 0;
  const service = await admin();
  const worst = new Map<string, ProbeStatus>();
  const rank: Record<ProbeStatus, number> = { up: 0, unknown: 1, degraded: 2, down: 3 };
  for (const r of results) {
    const component = STATUS_COMPONENT[r.service];
    const current = worst.get(component);
    if (!current || rank[r.status] > rank[current]) worst.set(component, r.status);
  }
  let written = 0;
  for (const [component, status] of worst) {
    const { data } = await service
      .from("ops_status_components")
      .select("key, state")
      .eq("key", component)
      .maybeSingle();
    const row = data as { state: string } | null;
    if (!row || row.state === "maintenance") continue;
    const next = componentStateForProbe(status);
    if (next === row.state) continue;
    await service.from("ops_status_components").update({ state: next } as never).eq("key", component);
    log("warn", "integration.status_component_changed", { component, from: row.state, to: next });
    written += 1;
  }
  return written;
}
