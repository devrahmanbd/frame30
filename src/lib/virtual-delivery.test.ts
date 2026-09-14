import { describe, expect, it } from "vitest";
import {
  assertCodeTransition,
  canTransitionCode,
  canTransitionDelivery,
  classifyDeliveryError,
  explainDelivery,
  isDeliverableEmail,
  MAX_DELIVERY_ATTEMPTS,
  maskCode,
  nextAttemptDelayMs,
  normalizeBdMsisdn,
  normalizeCode,
  parseCodeBatch,
  shouldRetry,
  stockHealth,
} from "./virtual-delivery";

describe("code state machine", () => {
  it("allows the normal sale path", () => {
    expect(canTransitionCode("available", "reserved")).toBe(true);
    expect(canTransitionCode("reserved", "delivered")).toBe(true);
  });

  it("never lets a delivered code be sold again", () => {
    expect(canTransitionCode("delivered", "available")).toBe(false);
    expect(canTransitionCode("delivered", "reserved")).toBe(false);
    expect(() => assertCodeTransition("delivered", "available")).toThrow(/invalid_code_transition/);
  });

  it("releases a reservation when checkout is abandoned", () => {
    expect(canTransitionCode("reserved", "available")).toBe(true);
  });

  it("treats revoked as terminal", () => {
    expect(canTransitionCode("revoked", "available")).toBe(false);
    expect(canTransitionCode("revoked", "delivered")).toBe(false);
  });
});

describe("delivery state machine", () => {
  it("lets a failure re-enter the queue but never a success", () => {
    expect(canTransitionDelivery("failed", "queued")).toBe(true);
    expect(canTransitionDelivery("sent", "queued")).toBe(false);
    expect(canTransitionDelivery("cancelled", "sending")).toBe(false);
  });
});

describe("maskCode", () => {
  it("shows only the ends of a long key", () => {
    expect(maskCode("ABCD1234EFGH5678")).toBe("ABCD••••••••5678");
  });

  it("hides short codes entirely", () => {
    expect(maskCode("AB12CD")).toBe("••••••");
    expect(maskCode("AB12CD")).not.toContain("A");
  });
});

describe("parseCodeBatch", () => {
  it("accepts one code per line and the first CSV column", () => {
    const batch = parseCodeBatch("abcd-1234-efgh\nWXYZ9876QRST,note\n\n");
    expect(batch.codes).toEqual(["ABCD-1234-EFGH", "WXYZ9876QRST"]);
    expect(batch.rejected).toHaveLength(0);
  });

  it("drops duplicates inside the same upload", () => {
    const batch = parseCodeBatch("ABCD1234\nabcd1234\nABCD1234");
    expect(batch.codes).toEqual(["ABCD1234"]);
    expect(batch.duplicatesInFile).toBe(2);
  });

  it("reports bad rows with a line number and never echoes the raw value", () => {
    const batch = parseCodeBatch("OK123456\nshrt\nBAD CODE!!!!!");
    expect(batch.codes).toEqual(["OK123456"]);
    expect(batch.rejected.map((r) => [r.line, r.reason])).toEqual([
      [2, "too_short"],
      [3, "bad_characters"],
    ]);
    expect(batch.rejected[1]?.value).toContain("•");
  });

  it("stops at the import ceiling", () => {
    const raw = Array.from({ length: 20 }, (_, i) => `CODE${String(i).padStart(6, "0")}`).join("\n");
    expect(parseCodeBatch(raw, 5).codes).toHaveLength(5);
  });

  it("normalizes case and whitespace consistently", () => {
    expect(normalizeCode("  ab cd-12  ")).toBe("ABCD-12");
  });
});

describe("retry policy", () => {
  it("backs off exponentially and caps at 30 minutes", () => {
    const first = nextAttemptDelayMs(1, "delivery-1");
    const third = nextAttemptDelayMs(3, "delivery-1");
    expect(third).toBeGreaterThan(first);
    expect(nextAttemptDelayMs(99, "delivery-1")).toBeLessThanOrEqual(30 * 60_000 * 1.2);
  });

  it("jitters per delivery so retries do not stampede together", () => {
    expect(nextAttemptDelayMs(2, "aaa")).not.toBe(nextAttemptDelayMs(2, "zzz"));
  });

  it("gives up on permanent failures and on the attempt ceiling", () => {
    expect(shouldRetry(1, { retryable: false })).toBe(false);
    expect(shouldRetry(MAX_DELIVERY_ATTEMPTS, { retryable: true })).toBe(false);
    expect(shouldRetry(MAX_DELIVERY_ATTEMPTS - 1, { retryable: true })).toBe(true);
  });

  it("classifies provider failures into retryable and terminal", () => {
    expect(classifyDeliveryError(503, "bad gateway")).toMatchObject({ retryable: true });
    expect(classifyDeliveryError(429, "slow down")).toMatchObject({ retryable: true });
    expect(classifyDeliveryError(null, "fetch failed")).toMatchObject({ retryable: true });
    expect(classifyDeliveryError(403, "denied")).toMatchObject({ retryable: false, code: "provider_auth" });
    expect(classifyDeliveryError(400, "invalid recipient")).toMatchObject({ code: "bad_recipient" });
  });

  it("explains every failure in Bangla for the merchant", () => {
    expect(explainDelivery("provider_auth", "bn")).toMatch(/[\u0980-\u09FF]/);
    expect(explainDelivery("nonsense-code", "en")).toBe(explainDelivery("unknown", "en"));
  });
});

describe("recipient normalization", () => {
  it("accepts every common Bangladeshi mobile format", () => {
    expect(normalizeBdMsisdn("01712345678")).toBe("+8801712345678");
    expect(normalizeBdMsisdn("+880 1912-345678")).toBe("+8801912345678");
    expect(normalizeBdMsisdn("8801812345678")).toBe("+8801812345678");
  });

  it("rejects landlines and truncated numbers", () => {
    expect(normalizeBdMsisdn("0212345")).toBeNull();
    expect(normalizeBdMsisdn("017123")).toBeNull();
  });

  it("validates email addresses without being clever about it", () => {
    expect(isDeliverableEmail("shop@example.com")).toBe(true);
    expect(isDeliverableEmail("no-at-sign")).toBe(false);
  });
});

describe("stockHealth", () => {
  it("turns velocity into days of cover", () => {
    expect(stockHealth({ available: 70, reserved: 3, soldLast7Days: 70, lowStockThreshold: 10 })).toMatchObject(
      { daysOfCover: 7, status: "healthy" },
    );
  });

  it("flags a fast-selling product as critical before it hits zero", () => {
    expect(
      stockHealth({ available: 10, reserved: 0, soldLast7Days: 140, lowStockThreshold: 5 }).status,
    ).toBe("critical");
  });

  it("reports out of stock and unknown cover with no sales", () => {
    expect(stockHealth({ available: 0, reserved: 2, soldLast7Days: 0, lowStockThreshold: 5 }).status).toBe("out");
    expect(stockHealth({ available: 50, reserved: 0, soldLast7Days: 0, lowStockThreshold: 5 }).daysOfCover).toBeNull();
  });
});
