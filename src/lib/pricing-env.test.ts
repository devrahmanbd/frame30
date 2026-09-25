/**
 * pricing.server publicClient env resolution — TDD: runtime env wins over
 * build-time import.meta.env so production builds made without VITE_ vars
 * still reach Supabase (live incident: baked `createClient(void 0, void 0)`
 * threw `supabaseUrl is required` on every cart/checkout pricing call).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { publicClient } from "./pricing.server";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pricing publicClient env resolution", () => {
  it("uses runtime process.env when build-time import.meta.env is empty", () => {
    vi.stubEnv("SUPABASE_URL", "https://runtime.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "runtime-publishable-key");
    const client = publicClient();
    // @ts-expect-error probe internal url for the test only
    expect(client.supabaseUrl).toBe("https://runtime.supabase.co");
  });

  it("throws a guarded missing-env error, never the supabase-js message", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    expect(() => publicClient()).toThrow(/Missing Supabase environment/);
  });
});
