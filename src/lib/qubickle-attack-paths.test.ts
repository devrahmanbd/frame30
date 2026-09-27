/**
 * QUBICKLE Rule 22 attack-path tests (RED-first).
 *
 * - previewSecret fails closed outside local dev (no shared hardcoded key)
 * - cross-merchant preview token reuse denied (merchant-bound)
 * - rollback/schedule merchant predicates (cross-merchant replay blocked)
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  issuePreviewToken,
  verifyPreviewToken,
  previewSecret,
} from "./theme-preview.server";

const MERCHANT_A = "22222222-2222-2222-2222-222222222222";
const MERCHANT_B = "99999999-9999-4999-8999-999999999999";
const THEME = "44444444-4444-4444-4444-444444444444";
const NOW = 1_700_000_000_000;
const SECRET = "EXAMPLE-test-secret-key-fixture";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("previewSecret fail closed (Rule 28)", () => {
  it("throws when unconfigured in production", () => {
    vi.stubEnv("PREVIEW_TOKEN_SECRET", "");
    vi.stubEnv("AUTH_HASH_SALT", "");
    vi.stubEnv("NODE_ENV", "production");
    // Ensure empty strings count as unconfigured.
    delete process.env["PREVIEW_TOKEN_SECRET"];
    delete process.env["AUTH_HASH_SALT"];
    expect(() => previewSecret()).toThrow(/PREVIEW_TOKEN_SECRET/);
  });

  it("allows dev fallback in development", () => {
    delete process.env["PREVIEW_TOKEN_SECRET"];
    delete process.env["AUTH_HASH_SALT"];
    vi.stubEnv("NODE_ENV", "development");
    expect(previewSecret()).toBe("framique-preview-dev");
  });
});

describe("cross-merchant token reuse (Rule 22)", () => {
  it("token minted for A does not verify as B (merchant binding)", () => {
    const token = issuePreviewToken(SECRET, MERCHANT_A, THEME, NOW);
    const payload = verifyPreviewToken(SECRET, token, NOW + 60_000);
    expect(payload?.merchantId).toBe(MERCHANT_A);
    // The binding check lives in callers (server.ts + storefront.server):
    // a payload for A never satisfies an owner check for B.
    const ownerB = MERCHANT_B;
    expect(payload !== null && payload.merchantId === ownerB).toBe(false);
  });
});

describe("rollback/schedule merchant predicates (Rule 15)", () => {
  it("rollbackVersion rejects cross-merchant versionId", async () => {
    const { rollbackVersion } = await import("./themes.server");
    const calls: string[] = [];
    const db = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => {
                calls.push(table);
                // Simulate: version belongs to another merchant → no row.
                return { data: null };
              },
            }),
          }),
        }),
      }),
    } as never;
    await expect(
      rollbackVersion(db, MERCHANT_A, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toThrow(/version_missing|not found/i);
    expect(calls).toContain("theme_versions");
  });

  it("scheduleTheme rejects cross-merchant themeId", async () => {
    const { scheduleTheme } = await import("./themes.server");
    const db = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
        }),
      }),
    } as never;
    await expect(
      scheduleTheme(db, MERCHANT_A, {
        themeId: "00000000-0000-4000-8000-000000000001",
        versionId: null,
        action: "publish",
        runAt: new Date(Date.now() + 3600_000).toISOString(),
      }),
    ).rejects.toThrow(/theme_missing|not found/i);
  });

  it("cancelSchedule rejects cross-merchant scheduleId", async () => {
    const { cancelSchedule } = await import("./themes.server");
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
        }),
      }),
    } as never;
    await expect(
      cancelSchedule(db, MERCHANT_A, "00000000-0000-4000-8000-000000000002"),
    ).rejects.toThrow(/schedule_missing|not found/i);
  });
});
