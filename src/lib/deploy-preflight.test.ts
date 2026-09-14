import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  probeReadiness,
  probeSmokeJourneys,
  probeDatabaseCompatibility,
  runPreflightSuite,
  REQUIRED_PRODUCTION_TABLES,
  REQUIRED_PRODUCTION_RPCS,
} from "./deploy-preflight.server";

describe("Phase 6.2 — Automated Pre-Flight Health, Smoke & DB Probes", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("Tier 1: Readiness Probe", () => {
    it("passes when target /api/healthz returns 200 OK with healthy status", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "healthy",
            checks: { database: { status: "up" }, redis: { status: "up" } },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

      const report = await probeReadiness("http://green-pod:3000", 2, 50);
      expect(report.passed).toBe(true);
      expect(report.statusCode).toBe(200);
      expect(report.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("fails and retries when target container returns HTTP 503 Service Unavailable", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "unhealthy",
            checks: { database: { status: "down" }, redis: { status: "up" } },
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
      );

      const report = await probeReadiness("http://green-pod:3000", 2, 20);
      expect(report.passed).toBe(false);
      expect(report.statusCode).toBe(503);
      expect(report.error).toContain("HTTP 503");
    });
  });

  describe("Tier 2: Smoke Journeys", () => {
    it("passes all journeys when public endpoints and security headers are compliant", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/public/metrics")) {
          // Without token, closed by design
          return Promise.resolve(new Response("Not Found", { status: 404 }));
        }
        if (url.includes("/healthz?type=liveness")) {
          return Promise.resolve(new Response(JSON.stringify({ status: "healthy" }), { status: 200 }));
        }
        // Root landing
        return Promise.resolve(
          new Response("<!DOCTYPE html><html><body>Framique</body></html>", {
            status: 200,
            headers: {
              "content-type": "text/html",
              "x-content-type-options": "nosniff",
              "x-frame-options": "SAMEORIGIN",
            },
          }),
        );
      });

      const report = await probeSmokeJourneys("http://green-pod:3000");
      expect(report.passed).toBe(true);
      expect(report.journeys.length).toBe(4);
      expect(report.journeys.every((j) => j.passed)).toBe(true);
    });

    it("fails when candidate container root returns 500 error", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith("/")) {
          return Promise.resolve(new Response("Internal Server Error", { status: 500 }));
        }
        return Promise.resolve(new Response("OK", { status: 200 }));
      });

      const report = await probeSmokeJourneys("http://green-pod:3000");
      expect(report.passed).toBe(false);
      const rootJourney = report.journeys.find((j) => j.journey === "Public Root Landing");
      expect(rootJourney?.passed).toBe(false);
    });
  });

  describe("Tier 3: Database Compatibility Validation", () => {
    it("declares required production tables and RPC routines", () => {
      expect(REQUIRED_PRODUCTION_TABLES).toContain("merchants");
      expect(REQUIRED_PRODUCTION_TABLES).toContain("orders");
      expect(REQUIRED_PRODUCTION_TABLES).toContain("platform_dynamic_config");
      expect(REQUIRED_PRODUCTION_RPCS).toContain("has_merchant_role");
      expect(REQUIRED_PRODUCTION_RPCS).toContain("platform_get_active_config");
    });

    it("verifies compatibility without throwing unhandled exceptions", async () => {
      const report = await probeDatabaseCompatibility();
      expect(report.checkedTables.length).toBeGreaterThan(5);
      expect(report.checkedRpcs.length).toBeGreaterThan(3);
    });
  });

  describe("Pre-Flight Suite Orchestration & Blue Isolation", () => {
    it("returns PROCEED_TO_CANARY when all 3 tiers pass", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/healthz?type=readiness")) {
          return Promise.resolve(new Response(JSON.stringify({ status: "healthy" }), { status: 200 }));
        }
        if (url.includes("/api/public/metrics")) {
          return Promise.resolve(new Response("Closed", { status: 404 }));
        }
        return Promise.resolve(
          new Response("OK", {
            status: 200,
            headers: {
              "x-content-type-options": "nosniff",
              "x-frame-options": "SAMEORIGIN",
            },
          }),
        );
      });

      const report = await runPreflightSuite({
        targetUrl: "http://green-pod:3000",
        skipDbQuery: true,
        maxRetries: 1,
      });

      expect(report.passed).toBe(true);
      expect(report.verdict).toBe("PROCEED_TO_CANARY");
      expect(report.blueEnvironmentStatus).toBe("UNTOUCHED_AND_ACTIVE");
      expect(report.failureReasons).toHaveLength(0);
    });

    it("aborts promotion and guarantees BLUE remains untouched if readiness fails", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response("Service Unavailable", { status: 503 }));

      const report = await runPreflightSuite({
        targetUrl: "http://green-pod:3000",
        skipDbQuery: true,
        maxRetries: 1,
      });

      expect(report.passed).toBe(false);
      expect(report.verdict).toBe("ABORT_PROMOTION");
      expect(report.blueEnvironmentStatus).toBe("UNTOUCHED_AND_ACTIVE");
      expect(report.failureReasons.length).toBeGreaterThan(0);
      expect(report.failureReasons[0]).toContain("Readiness probe failed");
    });
  });
});
