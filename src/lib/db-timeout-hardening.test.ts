/**
 * Permanent regression pins for the timeout sweep (the implementing run
 * proved these with temp suites, then removed them): bounded DB waits fail
 * closed with DbTimeoutError, inner rejections pass through unmasked, and
 * the default budget stays far under platform killers. Email-cap and
 * courier-abort behaviors are covered by their lanes' suites, not re-pinned
 * here.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DB_TIMEOUT_MS,
  DbTimeoutError,
  isDbTimeout,
  withDbTimeout,
} from "./db-timeout.server";

describe("withDbTimeout", () => {
  it("resolves the inner value on the fast path", async () => {
    await expect(withDbTimeout(async () => 42, { op: "pin" })).resolves.toBe(
      42,
    );
    await expect(
      withDbTimeout(Promise.resolve("raw"), { op: "pin" }),
    ).resolves.toBe("raw");
  });

  it("rejects with DbTimeoutError after the budget", async () => {
    const err = await withDbTimeout(() => new Promise<string>(() => {}), {
      timeoutMs: 20,
      op: "pin-stall",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(DbTimeoutError);
    expect((err as DbTimeoutError).code).toBe("db_timeout");
    expect((err as DbTimeoutError).op).toBe("pin-stall");
    expect(isDbTimeout(err)).toBe(true);
    expect(isDbTimeout(new Error("x"))).toBe(false);
  });

  it("does not mask inner rejections", async () => {
    const boom = new Error("inner-boom");
    const err = await withDbTimeout(() => Promise.reject(boom), {
      timeoutMs: 500,
      op: "pin",
    }).catch((e) => e);
    expect(err).toBe(boom);
  });

  it("default budget is bounded well under platform killers", () => {
    expect(DEFAULT_DB_TIMEOUT_MS).toBeGreaterThanOrEqual(1000);
    expect(DEFAULT_DB_TIMEOUT_MS).toBeLessThanOrEqual(15000);
  });
});
