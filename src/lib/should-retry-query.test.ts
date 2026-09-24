import { describe, expect, it } from "vitest";
import { shouldRetryQuery } from "./should-retry-query";

describe("shouldRetryQuery", () => {
  it("never retries rate-limit errors, even on first failure", () => {
    expect(shouldRetryQuery(0, new Error("rate_limit.exceeded"))).toBe(false);
  });

  it("never retries HTTP 429 failures", () => {
    expect(
      shouldRetryQuery(0, new Error("Request failed with status 429")),
    ).toBe(false);
    expect(shouldRetryQuery(2, "429 Too Many Requests")).toBe(false);
  });

  it("keeps the default retry budget for ordinary errors", () => {
    expect(shouldRetryQuery(0, new Error("network down"))).toBe(true);
    expect(shouldRetryQuery(2, new Error("network down"))).toBe(true);
    expect(shouldRetryQuery(3, new Error("network down"))).toBe(false);
  });

  it("handles non-Error rejections without crashing", () => {
    expect(shouldRetryQuery(0, undefined)).toBe(true);
    expect(shouldRetryQuery(0, "rate_limit.exceeded")).toBe(false);
  });
});
