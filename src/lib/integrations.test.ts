import { describe, expect, it } from "vitest";
import {
  classifyProbe,
  componentStateForProbe,
  formatAge,
  formatSignal,
  signalTone,
  SIGNAL_KEYS,
  STATUS_COMPONENT,
  composeCommand,
  costNote,
  deepLink,
  envBlock,
  healthUrl,
  INTEGRATION_SERVICES,
  isIntegrationService,
  overallIntegrationStatus,
  SERVICE_CATALOG,
  uptimePercent,
  validBaseUrl,
} from "./integrations";

describe("integration catalogue", () => {
  it("covers the seven services Phase 13 promises", () => {
    expect(INTEGRATION_SERVICES).toEqual([
      "supabase",
      "prometheus",
      "loki",
      "grafana",
      "alertmanager",
      "glitchtip",
      "sentry",
    ]);
    for (const key of INTEGRATION_SERVICES) {
      const spec = SERVICE_CATALOG[key];
      expect(spec.healthPath.startsWith("/")).toBe(true);
      expect(spec.deepLinkPath.startsWith("/")).toBe(true);
      expect(spec.purpose.length).toBeGreaterThan(10);
      expect(validBaseUrl(spec.defaultUrl)).toBe(true);
    }
  });

  it("only treats known keys as services", () => {
    expect(isIntegrationService("grafana")).toBe(true);
    expect(isIntegrationService("datadog")).toBe(false);
  });

  it("never names a credential value, only its env variable", () => {
    for (const spec of Object.values(SERVICE_CATALOG)) {
      if (spec.credentialEnv) expect(spec.credentialEnv).toMatch(/^[A-Z0-9_]+$/);
    }
  });
});

describe("probe classification", () => {
  it("calls a fast 200 healthy and a slow 200 degraded", () => {
    expect(classifyProbe(200, 120)).toBe("up");
    expect(classifyProbe(200, 5000)).toBe("degraded");
  });

  it("treats an auth failure as degraded, not down", () => {
    expect(classifyProbe(401, 50)).toBe("degraded");
    expect(classifyProbe(403, 50)).toBe("degraded");
  });

  it("calls a server error or no answer down", () => {
    expect(classifyProbe(500, 50)).toBe("down");
    expect(classifyProbe(null, 5000)).toBe("down");
  });

  it("lets the worst connected service decide the overall state", () => {
    expect(overallIntegrationStatus([])).toBe("unknown");
    expect(overallIntegrationStatus(["up", "up"])).toBe("up");
    expect(overallIntegrationStatus(["up", "degraded"])).toBe("degraded");
    expect(overallIntegrationStatus(["degraded", "down"])).toBe("down");
  });

  it("reports uptime from probe history", () => {
    expect(uptimePercent([])).toBeNull();
    expect(uptimePercent([{ status: "up" }, { status: "up" }, { status: "down" }, { status: "up" }])).toBe(75);
  });
});

describe("urls", () => {
  it("builds health and deep links without doubling slashes", () => {
    expect(healthUrl("http://host:3000/", "grafana")).toBe("http://host:3000/api/health");
    expect(deepLink("http://host:3000", "grafana")).toBe("http://host:3000/dashboards");
  });

  it("rejects anything that is not an absolute http url", () => {
    expect(validBaseUrl("http://localhost:9090")).toBe(true);
    expect(validBaseUrl("https://obs.example.com")).toBe(true);
    expect(validBaseUrl("localhost:9090")).toBe(false);
    expect(validBaseUrl("javascript:alert(1)")).toBe(false);
    expect(validBaseUrl("")).toBe(false);
  });
});

describe("setup wizard", () => {
  it("emits an env block with url and empty credential slots", () => {
    const block = envBlock(["grafana", "prometheus"]);
    expect(block).toContain("GRAFANA_URL=http://localhost:3000");
    expect(block).toContain("GRAFANA_API_TOKEN=");
    expect(block).toContain("PROMETHEUS_URL=http://localhost:9090");
    // Prometheus needs no credential, so no stray variable is invented.
    expect(block).not.toContain("PROMETHEUS_API_TOKEN");
  });

  it("honours a custom url in the env block", () => {
    expect(envBlock(["loki"], { loki: "https://logs.example.com" })).toContain(
      "LOKI_URL=https://logs.example.com",
    );
  });

  it("builds a compose command with the right profiles", () => {
    expect(composeCommand(["prometheus", "grafana"])).toBe(
      "docker compose -f ops/docker-compose.observability.yml up -d",
    );
    const both = composeCommand(["prometheus", "sentry", "glitchtip"]);
    expect(both).toContain("ops/docker-compose.errors.yml");
    expect(both).toContain("--profile sentry");
    expect(both).toContain("--profile glitchtip");
  });

  it("tells the operator what each service costs to run", () => {
    const notes = costNote(["sentry", "alertmanager"]);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain("Sentry");
  });
});

describe("health strip", () => {
  it("covers the five numbers an operator checks", () => {
    expect(SIGNAL_KEYS).toEqual([
      "last_scrape",
      "last_log",
      "active_alerts",
      "errors_1h",
      "backup_age",
    ]);
  });

  it("treats an unknown value as amber, never green", () => {
    expect(signalTone("last_scrape", null)).toBe("warn");
    expect(signalTone("last_scrape", 30)).toBe("ok");
    expect(signalTone("last_scrape", 300)).toBe("warn");
    expect(signalTone("last_scrape", 1200)).toBe("bad");
    expect(signalTone("active_alerts", 0)).toBe("ok");
    expect(signalTone("active_alerts", 6)).toBe("bad");
  });

  it("formats ages and counts for humans", () => {
    expect(formatAge(null)).toBe("—");
    expect(formatAge(45)).toBe("45s");
    expect(formatAge(600)).toBe("10m");
    expect(formatAge(7200)).toBe("2h");
    expect(formatAge(3 * 86_400)).toBe("3d");
    expect(formatSignal("active_alerts", 3)).toBe("3");
    expect(formatSignal("backup_age", 3600)).toBe("60m");
  });

  it("feeds the public status page from the same probe", () => {
    expect(STATUS_COMPONENT.supabase).toBe("database");
    expect(STATUS_COMPONENT.grafana).toBe("observability");
    expect(componentStateForProbe("up")).toBe("operational");
    expect(componentStateForProbe("degraded")).toBe("degraded");
    expect(componentStateForProbe("down")).toBe("partial_outage");
  });
});
