/**
 * TODO-7 — widget ticket / callback rate-abuse proof.
 *
 * The public widget endpoints are unauthenticated, so abuse resistance rests
 * on three layers, each locked here: (1) tight rate-limit bucket budgets,
 * (2) denial propagation (a blocked verdict rejects the request), and
 * (3) idempotent collapse of duplicate callback requests inside the
 * documented 30-minute window.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  BUCKETS,
  RateLimitError,
  resetRateLimitCircuitBreaker,
  type BucketName,
} from "./rate-limit.server";
import {
  CALLBACK_DUPLICATE_WINDOW_MS,
  clearInMemoryCallbacks,
  createCallback,
  getInMemoryCallbacks,
} from "./support-callbacks.server";
import { createTicket } from "./support-tickets.server";

// Controllable limiter: allow everywhere except the denial test, which flips
// the switch to prove a blocked verdict rejects the request.
const limiter = vi.hoisted(() => ({ deny: false }));
vi.mock("./rate-limit.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./rate-limit.server")>();
  return {
    ...actual,
    enforceRateLimit: async (bucket: BucketName, subject: string) => {
      if (limiter.deny)
        throw new actual.RateLimitError(bucket, new Date().toISOString());
      return actual.enforceRateLimit(bucket, subject);
    },
  };
});

const MERCHANT = "11111111-1111-4111-8111-111111111111";
const PHONE = "01712345678";

beforeEach(() => {
  clearInMemoryCallbacks();
  limiter.deny = false;
  resetRateLimitCircuitBreaker();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rate-limit budgets — abuse economics", () => {
  it("widget tickets are tightly capped", () => {
    expect(BUCKETS["support.ticket_widget"].limit).toBeLessThanOrEqual(10);
    expect(
      BUCKETS["support.ticket_widget"].windowSeconds,
    ).toBeGreaterThanOrEqual(300);
  });

  it("callbacks are tightly capped", () => {
    expect(BUCKETS["support.callback"].limit).toBeLessThanOrEqual(5);
    expect(BUCKETS["support.callback"].windowSeconds).toBeGreaterThanOrEqual(
      1800,
    );
  });

  it("the duplicate window is the documented 30 minutes", () => {
    expect(CALLBACK_DUPLICATE_WINDOW_MS).toBe(30 * 60_000);
  });
});

describe("createCallback — duplicate collapse (abuse sink)", () => {
  const req = (overrides: Record<string, unknown> = {}) => ({
    merchantId: MERCHANT,
    customerName: "Rahim",
    phone: PHONE,
    preferredWindow: "morning" as const,
    ...overrides,
  });

  it("collapses an immediate repeat onto the original request", async () => {
    const first = await createCallback(req());
    const second = await createCallback(req());
    expect(second.id).toBe(first.id);
    expect(second.duplicate).toBe(true);
    expect(first.duplicate).toBe(false);
    expect(getInMemoryCallbacks(MERCHANT)).toHaveLength(1);
  });

  it("keeps distinct phones as distinct requests", async () => {
    const a = await createCallback(req());
    const b = await createCallback(req({ phone: "01812345678" }));
    expect(b.id).not.toBe(a.id);
    expect(getInMemoryCallbacks(MERCHANT)).toHaveLength(2);
  });

  it("allows a fresh request after the 30-minute window expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T10:00:00Z"));
    const first = await createCallback(req());
    vi.setSystemTime(new Date("2026-09-01T10:31:00Z"));
    const second = await createCallback(req());
    expect(second.id).not.toBe(first.id);
    expect(second.duplicate).toBe(false);
    expect(getInMemoryCallbacks(MERCHANT)).toHaveLength(2);
  });

  it("allows a fresh request once the earlier one is no longer pending", async () => {
    const { updateCallbackStatus } = await import("./support-callbacks.server");
    const first = await createCallback(req());
    await updateCallbackStatus(MERCHANT, first.id, "contacted");
    const second = await createCallback(req());
    expect(second.id).not.toBe(first.id);
    expect(second.duplicate).toBe(false);
  });

  it("still rejects invalid phones (validation before storage)", async () => {
    await expect(createCallback(req({ phone: "01012345678" }))).rejects.toThrow(
      /invalid_(phone_format|bd_mobile)/,
    );
    expect(getInMemoryCallbacks(MERCHANT)).toHaveLength(0);
  });

  it("propagates rate-limit denial instead of queueing (spam sink closed)", async () => {
    limiter.deny = true;
    await expect(
      createCallback({
        merchantId: MERCHANT,
        customerName: "Rahim",
        phone: PHONE,
        preferredWindow: "morning",
      }),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(getInMemoryCallbacks(MERCHANT)).toHaveLength(0);
  });
});

describe("createTicket — payload caps (abuse sink)", () => {
  it("truncates oversized subject / body", async () => {
    const t = await createTicket({
      merchantId: MERCHANT,
      subject: "s".repeat(500),
      body: "b".repeat(9000),
    });
    expect(t.subject.length).toBeLessThanOrEqual(180);
    expect(t.status).toBe("open");
  });
});
