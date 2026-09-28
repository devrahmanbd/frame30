/**
 * T7 quick-wins — site.server publicClient must throw an explicit missing-env
 * error (pricing.server pattern) instead of constructing a client against
 * https://placeholder.supabase.co / placeholder-key.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { publicClient, publicPlans } from "./site.server";

function stubNoEnv() {
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
  vi.stubEnv("VITE_SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("site publicClient env resolution", () => {
  it("throws a guarded missing-env error, never a placeholder client", () => {
    stubNoEnv();
    expect(() => publicClient()).toThrow(/Missing Supabase environment/);
  });

  it("uses runtime process.env when present", () => {
    vi.stubEnv("SUPABASE_URL", "https://runtime.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "runtime-publishable-key");
    const client = publicClient();
    // @ts-expect-error probe internal url for the test only
    expect(client.supabaseUrl).toBe("https://runtime.supabase.co");
  });

  it("publicPlans still fails soft to default plans when env is missing", async () => {
    stubNoEnv();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const plans = await publicPlans();
    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0]).toHaveProperty("plan");
  });
});
