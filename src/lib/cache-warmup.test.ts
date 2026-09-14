import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  warmThemePresets,
  warmFxRates,
  warmShippingDefaults,
  warmupAll,
} from "./cache-warmup.server";

describe("Phase 6.3 — Redis Cache Pre-Warming Engine", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("warms theme presets and blueprints without errors", async () => {
    const result = await warmThemePresets();
    expect(result.layer).toBe("Theme Presets & Blueprints");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(["ok", "skipped"]).toContain(result.status);
    expect(result.keysWarmed).toBeGreaterThanOrEqual(0);
  });

  it("warms standard FX currency exchange rates", async () => {
    const result = await warmFxRates();
    expect(result.layer).toBe("Foreign Exchange Rates (FX)");
    expect(["ok", "skipped"]).toContain(result.status);
  });

  it("warms default shipping rate cards", async () => {
    const result = await warmShippingDefaults();
    expect(result.layer).toBe("Shipping Rate Defaults");
    expect(["ok", "skipped"]).toContain(result.status);
  });

  it("executes complete warmup suite in dryRun mode", async () => {
    const report = await warmupAll({ dryRun: true });
    expect(report.status).toBe("success");
    expect(report.totalKeysWarmed).toBe(0);
    expect(report.layers.length).toBeGreaterThan(0);
    expect(report.timestamp).toBeDefined();
  });

  it("executes live pre-warm without throwing unhandled exceptions", async () => {
    const report = await warmupAll({ merchantLimit: 5 });
    expect(["success", "partial", "failed"]).toContain(report.status);
    expect(report.layers.length).toBe(5);
    expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);
  });
});
