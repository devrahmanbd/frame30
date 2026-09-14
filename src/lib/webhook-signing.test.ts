import { describe, expect, it } from "vitest";
import {
  backoffSeconds,
  computeSignature,
  MAX_ATTEMPTS,
  nextDeliveryState,
  parseSignatureHeader,
  signatureHeader,
  validateEndpointUrl,
  verifySignature,
} from "./webhook-signing";

const SECRET = "whsec_EXAMPLE_test_vector";
const BODY = JSON.stringify({ event: "order.paid", id: "1" });

describe("signing", () => {
  it("verifies a freshly signed body", async () => {
    const ts = 1_800_000_000;
    const sig = await computeSignature(SECRET, ts, BODY);
    const header = signatureHeader(ts, [sig]);
    expect(parseSignatureHeader(header).timestamp).toBe(ts);
    await expect(
      verifySignature({ header, body: BODY, secrets: [SECRET], nowSeconds: ts + 10 }),
    ).resolves.toBe(true);
  });

  it("rejects a replayed timestamp outside tolerance", async () => {
    const ts = 1_800_000_000;
    const header = signatureHeader(ts, [await computeSignature(SECRET, ts, BODY)]);
    await expect(
      verifySignature({ header, body: BODY, secrets: [SECRET], nowSeconds: ts + 4000 }),
    ).resolves.toBe(false);
  });

  it("rejects a tampered body and an unknown secret", async () => {
    const ts = 1_800_000_000;
    const header = signatureHeader(ts, [await computeSignature(SECRET, ts, BODY)]);
    await expect(
      verifySignature({ header, body: `${BODY} `, secrets: [SECRET], nowSeconds: ts }),
    ).resolves.toBe(false);
    await expect(
      verifySignature({ header, body: BODY, secrets: ["other"], nowSeconds: ts }),
    ).resolves.toBe(false);
  });

  it("accepts either key during a rotation window", async () => {
    const ts = 1_800_000_000;
    const header = signatureHeader(ts, [
      await computeSignature("new", ts, BODY),
      await computeSignature("old", ts, BODY),
    ]);
    await expect(
      verifySignature({ header, body: BODY, secrets: ["old"], nowSeconds: ts }),
    ).resolves.toBe(true);
  });
});

describe("delivery policy", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");

  it("marks 2xx delivered", () => {
    expect(nextDeliveryState({ attempt: 1, responseStatus: 204, now })).toEqual({
      status: "delivered",
      nextAttemptAt: null,
    });
  });

  it("retries 5xx with growing backoff and dead-letters at the ceiling", () => {
    const first = nextDeliveryState({ attempt: 1, responseStatus: 500, now });
    expect(first.status).toBe("failed");
    expect(first.nextAttemptAt).toBe(new Date(now.getTime() + backoffSeconds(1) * 1000).toISOString());
    expect(backoffSeconds(2)).toBeGreaterThan(backoffSeconds(1));
    expect(nextDeliveryState({ attempt: MAX_ATTEMPTS, responseStatus: 500, now }).status).toBe("dead");
  });

  it("treats 410 Gone as terminal immediately", () => {
    expect(nextDeliveryState({ attempt: 1, responseStatus: 410, now }).status).toBe("dead");
  });

  it("retries a network failure (no status)", () => {
    expect(nextDeliveryState({ attempt: 1, responseStatus: null, now }).status).toBe("failed");
  });
});

describe("endpoint validation", () => {
  it("only allows public https targets", () => {
    expect(validateEndpointUrl("https://hooks.example.com/f").ok).toBe(true);
    expect(validateEndpointUrl("http://hooks.example.com/f")).toMatchObject({ reason: "https_required" });
    expect(validateEndpointUrl("https://127.0.0.1/f")).toMatchObject({ reason: "private_host" });
    expect(validateEndpointUrl("https://192.168.1.4/f")).toMatchObject({ reason: "private_host" });
    expect(validateEndpointUrl("not a url")).toMatchObject({ reason: "invalid_url" });
  });
});
