#!/usr/bin/env node
/**
 * Phase 11 — end-to-end verification of the self-hosted metrics/logs stack.
 *
 * Run this against a live host (after `docker compose -f
 * ops/docker-compose.observability.yml up -d`). It answers one question per
 * check, and every check is a fact read back out of the running stack — never
 * a config file:
 *
 *   1. Prometheus is up, has loaded every rule group, and every scrape job
 *      (app, node, cadvisor, postgres, redis, blackbox, self-monitoring) has
 *      at least one healthy target.
 *   2. The app's /api/public/metrics endpoint exposes framique_* series and
 *      Prometheus has them in its TSDB (not just in the exposition text).
 *   3. Loki is ready and has received log lines from Promtail in the last
 *      window, including the database container.
 *   4. Grafana is up, both datasources answer, and every dashboard JSON in
 *      git is present in the running instance.
 *   5. Alertmanager is up and its config is loaded; with --test-alert it
 *      pushes a synthetic alert and asserts it lands in a receiver.
 *
 * Usage:
 *   node scripts/observability-verify.mjs [--test-alert] [--json]
 * Env:
 *   PROM_URL   (default http://localhost:9090)
 *   LOKI_URL   (default http://localhost:3100)
 *   GRAFANA_URL(default http://localhost:3001)
 *   ALERTMANAGER_URL (default http://localhost:9093)
 *   APP_METRICS_URL  (default http://localhost:3000/api/public/metrics)
 *   GRAFANA_USER / GRAFANA_PASSWORD for the Grafana API checks
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const withTestAlert = args.has("--test-alert");

const PROM = process.env.PROM_URL ?? "http://localhost:9090";
const LOKI = process.env.LOKI_URL ?? "http://localhost:3100";
const GRAFANA = process.env.GRAFANA_URL ?? "http://localhost:3001";
const ALERTMANAGER = process.env.ALERTMANAGER_URL ?? "http://localhost:9093";
const APP_METRICS = process.env.APP_METRICS_URL ?? "http://localhost:3000/api/public/metrics";

/** Jobs that must have a healthy target — the Phase 10 database included. */
const REQUIRED_JOBS = [
  "framique-app",
  "node",
  "containers",
  "postgres",
  "redis",
  "prometheus",
  "alertmanager",
  "loki",
  "promtail",
  "grafana",
  "blackbox-http",
];

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  if (!asJson) console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function getJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail ?? "");
  } catch (err) {
    record(name, false, err instanceof Error ? err.message : String(err));
  }
}

async function promQuery(expr) {
  const url = `${PROM}/api/v1/query?query=${encodeURIComponent(expr)}`;
  const body = await getJson(url);
  if (body.status !== "success") throw new Error(`query failed: ${expr}`);
  return body.data.result;
}

async function main() {
  await check("prometheus is healthy", async () => {
    const res = await fetch(`${PROM}/-/healthy`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return PROM;
  });

  await check("prometheus loaded the alert and SLO rule groups", async () => {
    const body = await getJson(`${PROM}/api/v1/rules`);
    const groups = body.data.groups ?? [];
    const rules = groups.flatMap((g) => g.rules ?? []);
    const broken = groups.filter((g) => g.rules?.some((r) => r.health === "err"));
    if (!rules.length) throw new Error("no rules loaded");
    if (broken.length) throw new Error(`rule groups in error: ${broken.map((g) => g.name).join(", ")}`);
    return `${groups.length} groups, ${rules.length} rules`;
  });

  await check("every scrape job has a healthy target", async () => {
    const body = await getJson(`${PROM}/api/v1/targets?state=active`);
    const active = body.data.activeTargets ?? [];
    const healthyJobs = new Set(active.filter((t) => t.health === "up").map((t) => t.labels.job));
    const missing = REQUIRED_JOBS.filter((j) => !healthyJobs.has(j));
    if (missing.length) throw new Error(`jobs with no healthy target: ${missing.join(", ")}`);
    return `${active.filter((t) => t.health === "up").length}/${active.length} targets up`;
  });

  await check("app exposes framique_* metrics", async () => {
    const res = await fetch(APP_METRICS, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${APP_METRICS}`);
    const text = await res.text();
    const names = new Set([...text.matchAll(/^([a-z_]+)\{|^([a-z_]+) /gm)].map((m) => m[1] ?? m[2]));
    const framique = [...names].filter((n) => n?.startsWith("framique_"));
    if (framique.length < 10) throw new Error(`only ${framique.length} framique_* series exposed`);
    return `${framique.length} framique_* series`;
  });

  await check("prometheus stored the app metrics", async () => {
    const rows = await promQuery('count({__name__=~"framique_.+"})');
    const value = Number(rows[0]?.value?.[1] ?? 0);
    if (!value) throw new Error("no framique_* series in the TSDB — scrape is not landing");
    return `${value} series in TSDB`;
  });

  await check("postgres exporter reports the database up", async () => {
    const rows = await promQuery("pg_up");
    if (!rows.length) throw new Error("pg_up absent — postgres exporter not scraped");
    if (rows.every((r) => Number(r.value[1]) !== 1)) throw new Error("pg_up == 0");
    return `${rows.length} database target(s) up`;
  });

  await check("loki is ready", async () => {
    const res = await fetch(`${LOKI}/ready`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return LOKI;
  });

  await check("promtail is shipping app logs to loki", async () => {
    const end = Date.now() * 1e6;
    const start = end - 15 * 60 * 1e9;
    const url = `${LOKI}/loki/api/v1/query_range?query=${encodeURIComponent(
      'sum(count_over_time({service=~"app|worker|payments"}[15m]))',
    )}&start=${start}&end=${end}&step=60`;
    const body = await getJson(url);
    const total = (body.data?.result ?? []).flatMap((r) => r.values ?? []).reduce((a, [, v]) => a + Number(v), 0);
    if (!total) throw new Error("no app log lines in the last 15 minutes");
    return `${total} lines/15m`;
  });

  await check("loki has database container logs", async () => {
    const body = await getJson(`${LOKI}/loki/api/v1/label/service/values`);
    const values = body.data ?? [];
    if (!values.some((v) => /db|postgres/.test(v))) {
      throw new Error(`no database stream; services seen: ${values.join(", ") || "none"}`);
    }
    return values.join(", ");
  });

  await check("grafana is up with both datasources answering", async () => {
    const auth = grafanaAuth();
    const health = await getJson(`${GRAFANA}/api/health`);
    if (health.database !== "ok") throw new Error(`grafana database ${health.database}`);
    const sources = await getJson(`${GRAFANA}/api/datasources`, { headers: auth });
    const types = sources.map((s) => s.type);
    for (const want of ["prometheus", "loki"]) {
      if (!types.includes(want)) throw new Error(`missing ${want} datasource`);
    }
    for (const source of sources) {
      const probe = await fetch(`${GRAFANA}/api/datasources/${source.id}/health`, { headers: auth });
      if (!probe.ok) throw new Error(`datasource ${source.name} health HTTP ${probe.status}`);
    }
    return types.join(", ");
  });

  await check("every dashboard in git is provisioned", async () => {
    const dir = join(process.cwd(), "ops", "observability", "grafana");
    const titles = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")).title);
    const search = await getJson(`${GRAFANA}/api/search?type=dash-db&limit=500`, { headers: grafanaAuth() });
    const live = new Set(search.map((d) => d.title));
    const missing = titles.filter((t) => !live.has(t));
    if (missing.length) throw new Error(`not loaded: ${missing.join(", ")}`);
    return `${titles.length} dashboards`;
  });

  await check("grafana anonymous access is disabled", async () => {
    const res = await fetch(`${GRAFANA}/api/datasources`, { signal: AbortSignal.timeout(10_000) });
    if (res.status !== 401 && res.status !== 403) {
      throw new Error(`unauthenticated API call returned HTTP ${res.status} — anonymous access is open`);
    }
    return `unauthenticated read rejected (${res.status})`;
  });

  await check("alertmanager config is loaded", async () => {
    const body = await getJson(`${ALERTMANAGER}/api/v2/status`);
    if (!body.config?.original) throw new Error("no config loaded");
    return `uptime since ${body.uptime ?? "?"}`;
  });

  if (withTestAlert) {
    await check("test alert reaches a receiver", async () => {
      const fingerprint = `verify-${Date.now()}`;
      const payload = [
        {
          labels: {
            alertname: "ObservabilityVerification",
            severity: "info",
            team: "merchant-ops",
            instance: fingerprint,
          },
          annotations: {
            summary: "Synthetic alert from scripts/observability-verify.mjs",
            runbook: "docs/14-operations/runbooks.md#observability-verification",
          },
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 120_000).toISOString(),
        },
      ];
      const post = await fetch(`${ALERTMANAGER}/api/v2/alerts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (!post.ok) throw new Error(`POST alerts HTTP ${post.status}`);
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise((r) => setTimeout(r, 2000));
        const groups = await getJson(`${ALERTMANAGER}/api/v2/alerts/groups?active=true`);
        const hit = groups
          .flatMap((g) => (g.alerts ?? []).map((a) => ({ receiver: g.receiver?.name, a })))
          .find((x) => x.a.labels?.instance === fingerprint);
        if (hit) return `routed to ${hit.receiver ?? "unknown receiver"}`;
      }
      throw new Error("alert never appeared in an alertmanager group");
    });
  }

  const failed = results.filter((r) => !r.ok);
  if (asJson) console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));
  else console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

function grafanaAuth() {
  const user = process.env.GRAFANA_USER ?? "admin";
  const pass = process.env.GRAFANA_PASSWORD ?? "";
  if (!pass) return {};
  return { authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
