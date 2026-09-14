/**
 * Phase 5 Gate: Production deployment & go-live gates verification test.
 *
 * Asserts:
 * 1. .env.production contains all required production configuration keys.
 * 2. No mock, test, or sandbox tokens are active in .env.production.
 * 3. Redis persistence invariants: AOF enabled & maxmemory-policy noeviction.
 * 4. Prometheus scrape target: /api/public/metrics protected by METRICS_TOKEN.
 * 5. ACME challenge route: /.well-known/acme-challenge/$token handles TLS issuance.
 * 6. Error tracking & telemetry: Sentry / GlitchTip and Loki pipelines verified.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (relPath: string) => readFileSync(join(ROOT, relPath), "utf8");

describe("Phase 5: Production Environment (.env.production)", () => {
  it("has .env.production on disk", () => {
    expect(existsSync(join(ROOT, ".env.production"))).toBe(true);
  });

  it("contains all critical system-level infrastructure variables", () => {
    const envContent = read(".env.production");
    const requiredSystemKeys = [
      "NODE_ENV=production",
      "DEPLOY_ENV=production",
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "REDIS_URL",
      "REDIS_PASSWORD",
      "AUTH_HASH_SALT",
      "WEBHOOK_SIGNING_KEY",
      "BILLING_CRON_SECRET",
      "METRICS_TOKEN",
      "GLITCHTIP_DOMAIN",
      "SENTRY_ENVIRONMENT",
      "ERROR_ALERT_SECRET",
    ];

    for (const key of requiredSystemKeys) {
      expect(envContent, `Missing system key in .env.production: ${key}`).toContain(key);
    }
  });

  it("is trimmed to system-level information and contains NO per-tenant payment, courier, or analytics keys", () => {
    const envContent = read(".env.production");
    const forbiddenTenantKeys = [
      "BKASH_APP_KEY",
      "NAGAD_MERCHANT_ID",
      "SSLCOMMERZ_STORE_ID",
      "SHURJOPAY_MERCHANT_USERNAME",
      "STEADFAST_API_KEY",
      "PATHAO_CLIENT_ID",
      "REDX_API_TOKEN",
      "PAPERFLY_USERNAME",
      "GOOGLE_SEARCH_CONSOLE_API_KEY",
    ];

    for (const key of forbiddenTenantKeys) {
      expect(envContent, `Forbidden tenant key leaked into .env.production: ${key}`).not.toContain(key);
    }
  });

  it("has no active test, sandbox, or mock credentials", () => {
    const envContent = read(".env.production");
    expect(envContent).not.toMatch(/SSLCOMMERZ_IS_SANDBOX\s*=\s*true/i);
    expect(envContent).not.toContain("sb_mock_");
    expect(envContent).not.toContain("sandbox.sslcommerz.com");
  });
});

describe("Phase 5: Redis AOF & Eviction Invariants", () => {
  it("enforces appendonly yes, appendfsync everysec, and maxmemory-policy noeviction", () => {
    const compose = read("ops/docker-compose.platform.yml");
    expect(compose).toContain("--appendonly");
    expect(compose).toContain('"yes"');
    expect(compose).toContain("--appendfsync");
    expect(compose).toContain("everysec");
    expect(compose).toContain("--maxmemory-policy");
    expect(compose).toContain("noeviction");
  });
});

describe("Phase 5: ACME Challenge Handler Route", () => {
  it("has automated ACME challenge handler at /.well-known/acme-challenge/$token", () => {
    const route = read("src/routes/[.]well-known.acme-challenge.$token.ts");
    expect(route).toContain('Route = createFileRoute("/.well-known/acme-challenge/$token")');
    expect(route).toContain("readChallenge(host, token)");
    expect(route).toContain("enforceRateLimit");
  });
});

describe("Phase 5: Prometheus Scrape Target", () => {
  it("protects /api/public/metrics behind secret METRICS_TOKEN with Bearer check", () => {
    const metricsRoute = read("src/routes/api/public/metrics.ts");
    expect(metricsRoute).toContain('process.env["METRICS_TOKEN"]');
    expect(metricsRoute).toContain("auth !== `Bearer ${token}`");
    expect(metricsRoute).toContain("renderPrometheus()");
  });

  it("configures Prometheus to scrape /api/public/metrics with Bearer credentials", () => {
    const promConfig = read("ops/observability/prometheus.yml");
    expect(promConfig).toContain("metrics_path: /api/public/metrics");
    expect(promConfig).toContain("credentials_file: /etc/prometheus/framique_metrics_token");
  });
});

describe("Phase 5: Sentry & Loki Observability Pipelines", () => {
  it("defines error services in docker-compose.errors.yml", () => {
    const errorCompose = read("ops/docker-compose.errors.yml");
    expect(errorCompose).toContain("glitchtip-web");
    expect(errorCompose).toContain("sentry-web");
  });

  it("defines loki and promtail in docker-compose.observability.yml", () => {
    const obsCompose = read("ops/docker-compose.observability.yml");
    expect(obsCompose).toContain("loki:");
    expect(obsCompose).toContain("promtail:");
  });

  it("wires error alert bridge in src/routes/api/public/error-alert.ts", () => {
    const alertRoute = read("src/routes/api/public/error-alert.ts");
    expect(alertRoute).toContain('Route = createFileRoute("/api/public/error-alert")');
    expect(alertRoute).toContain("x-error-alert-secret");
  });
});
