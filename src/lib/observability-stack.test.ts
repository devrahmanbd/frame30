/**
 * Phase 11 — self-hosted metrics/logs stack gate.
 *
 * `scripts/observability-verify.mjs` proves the stack works on a live host.
 * This test proves the repo can never drift into a state where that script
 * would have nothing to verify: exporters present, jobs wired to real
 * services, self-monitoring alerts with runbooks, retention pinned, Grafana
 * locked down, and tenant labels bounded.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { incr, metricsSnapshot, tenantLabel } from "./observability.server";

const ROOT = process.cwd();
const OPS = join(ROOT, "ops", "observability");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const compose = read("ops/docker-compose.observability.yml");
const prometheus = read("ops/observability/prometheus.yml");
const loki = read("ops/observability/loki-config.yml");
const promtail = read("ops/observability/promtail-config.yml");
const alertmanager = read("ops/observability/alertmanager.yml");
const infraRules = read("ops/observability/infra.rules.yml");
const ruleFiles = readdirSync(OPS).filter((f) => f.endsWith(".rules.yml"));
const allRules = ruleFiles.map((f) => readFileSync(join(OPS, f), "utf8")).join("\n");
const doc = read("docs/14-operations/observability.md");
const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };

describe("stack composition", () => {
  it("runs every collector and exporter the verifier expects", () => {
    for (const service of [
      "prometheus:",
      "alertmanager:",
      "loki:",
      "promtail:",
      "grafana:",
      "node-exporter:",
      "cadvisor:",
      "redis-exporter:",
      "postgres-exporter:",
      "blackbox-exporter:",
    ]) {
      expect(compose).toContain(service);
    }
  });

  it("pins every image to a version, never :latest", () => {
    const images = [...compose.matchAll(/image:\s*(\S+)/g)].map((m) => m[1]);
    expect(images.length).toBeGreaterThan(8);
    for (const image of images) {
      expect(image).toMatch(/:[\w.\-]+$/);
      expect(image.endsWith(":latest")).toBe(false);
    }
  });

  it("binds every UI to loopback so nothing is exposed straight to the internet", () => {
    const ports = [...compose.matchAll(/ports:\s*\[?"?([\d.]+:\d+:\d+)/g)].map((m) => m[1]);
    expect(ports.length).toBeGreaterThan(3);
    for (const port of ports) expect(port.startsWith("127.0.0.1:")).toBe(true);
  });

  it("scrapes the database, cache and host, not just the app", () => {
    for (const job of ["framique-app", "node", "containers", "postgres", "redis", "blackbox-http"]) {
      expect(prometheus).toContain(`job_name: ${job}`);
    }
  });

  it("self-monitors the observability stack", () => {
    for (const job of ["prometheus", "alertmanager", "loki", "promtail", "grafana"]) {
      expect(prometheus).toContain(`job_name: ${job}`);
    }
  });
});

describe("retention and sizing", () => {
  it("caps prometheus retention by both time and size", () => {
    expect(prometheus.length).toBeGreaterThan(0);
    expect(compose).toMatch(/--storage\.tsdb\.retention\.time=\d+d/);
    expect(compose).toMatch(/--storage\.tsdb\.retention\.size=\d+GB/);
  });

  it("enables loki retention and compaction", () => {
    expect(loki).toMatch(/retention_period:\s*\d+h/);
    expect(loki).toMatch(/retention_enabled:\s*true/);
    expect(loki).toMatch(/compaction_interval:/);
  });

  it("documents retention, disk sizing and compaction for a single node", () => {
    expect(doc).toMatch(/## Retention, disk sizing and compaction/);
    expect(doc).toMatch(/compaction/i);
    expect(doc).toMatch(/GB/);
  });
});

describe("alerting", () => {
  it("alerts on the stack itself: scrape down, log ingest, disk pressure", () => {
    for (const alert of [
      "MetricsEndpointDown",
      "ExporterDown",
      "LokiIngestionStalled",
      "PromtailDroppingLines",
      "AlertmanagerNotificationFailures",
      "HostDiskFillingUp",
      "PostgresDown",
      "RedisDown",
    ]) {
      expect(infraRules).toContain(`alert: ${alert}`);
    }
  });

  it("gives every alert a runbook link", () => {
    const blocks = allRules.split(/- alert:\s*/).slice(1);
    const missing = blocks
      .filter((b) => !/runbook:\s*\S/.test(b.split(/\n\s*- alert:/)[0]))
      .map((b) => b.split("\n")[0].trim());
    expect(missing).toEqual([]);
  });

  it("routes to a merchant-ops channel and can be silenced", () => {
    expect(alertmanager).toMatch(/receiver:/);
    expect(alertmanager).toMatch(/slack|pagerduty/i);
    expect(doc).toMatch(/silence/i);
  });
});

describe("grafana", () => {
  it("disables anonymous view and signup", () => {
    expect(compose).toMatch(/GF_AUTH_ANONYMOUS_ENABLED:\s*"false"/);
    expect(compose).toMatch(/GF_USERS_ALLOW_SIGN_UP:\s*"false"/);
    expect(compose).toMatch(/GF_SECURITY_ADMIN_PASSWORD__FILE/);
  });

  it("provisions datasources and dashboards from git only", () => {
    const provisioning = read("ops/observability/grafana/provisioning-dashboards.yml");
    expect(provisioning).toMatch(/path:/);
    expect(read("ops/observability/grafana/provisioning-datasources.yml")).toMatch(/loki/i);
    const dashboards = readdirSync(join(OPS, "grafana")).filter((f) => f.endsWith(".json"));
    expect(dashboards.length).toBeGreaterThanOrEqual(9);
  });
});

describe("tenant labels", () => {
  it("labels business metrics with a stable opaque bucket, never the raw id", () => {
    const id = "3f6a2b18-1111-4c1d-9a55-abcdefabcdef";
    const label = tenantLabel(id);
    expect(label).toMatch(/^t_[0-9a-z]+$/);
    expect(label).not.toContain(id);
    expect(tenantLabel(id)).toBe(label);
  });

  it("falls back to a single bucket for unknown merchants", () => {
    expect(tenantLabel(null)).toBe("unknown");
    expect(tenantLabel(undefined)).toBe("unknown");
  });

  it("keeps the tenant label out of prometheus rule expressions", () => {
    expect(allRules).not.toMatch(/merchant_id=/);
  });

  it("emits the tenant label on the exposition endpoint", () => {
    incr("framique_orders_total", { outcome: "created", tenant: tenantLabel("stack-test-merchant") });
    const snapshot = JSON.stringify(metricsSnapshot());
    expect(snapshot).toContain("framique_orders_total");
    expect(snapshot).toMatch(/t_[0-9a-z]+/);
  });
});

describe("verification tooling", () => {
  it("ships the end-to-end verifier and wires it into package scripts", () => {
    const script = read("scripts/observability-verify.mjs");
    for (const probe of [
      "/api/v1/targets",
      "/api/v1/rules",
      "loki/api/v1/query_range",
      "/api/datasources",
      "/api/v2/alerts",
      "pg_up",
    ]) {
      expect(script).toContain(probe);
    }
    expect(pkg.scripts["obs:verify"]).toContain("observability-verify.mjs");
    expect(pkg.scripts["obs:verify:alert"]).toContain("--test-alert");
  });

  it("keeps log labels bounded — ids ride as structured metadata", () => {
    expect(promtail).toContain("structured_metadata:");
    expect(promtail).not.toMatch(/labels:\s*\n\s*merchant_id:/);
  });
});
