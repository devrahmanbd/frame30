import { describe, expect, it } from "vitest";
import {
  amountMatches,
  baseUrlFor,
  bkashGrantRequest,
  buildSessionRequest,
  credentialHints,
  credentialsComplete,
  isLiveProvider,
  majorUnits,
  parseSessionResponse,
  readCallback,
  type SessionInput,
} from "./live-gateway";

const base: Omit<SessionInput, "provider" | "baseUrl" | "credentials"> = {
  mode: "sandbox",
  intentId: "11111111-2222-3333-4444-555555555555",
  amountMinorInt: 125_000,
  currencyCode: "BDT",
  callbackUrl: "https://shop.test/api/public/payments/live/sslcommerz",
  returnUrl: "https://shop.test/api/public/payments/live/sslcommerz?redirect=1",
  cancelUrl: "https://shop.test/store/demo/checkout?payment=cancelled",
};

describe("live rails", () => {
  it("knows its three rails", () => {
    expect(isLiveProvider("sslcommerz")).toBe(true);
    expect(isLiveProvider("stripe")).toBe(false);
  });

  it("requires every credential a rail needs before going live", () => {
    expect(credentialsComplete("sslcommerz", { storeId: "a", storePassword: "b" })).toBe(true);
    expect(credentialsComplete("sslcommerz", { storeId: "a", storePassword: " " })).toBe(false);
    expect(credentialsComplete("bkash", { storeId: "a", storePassword: "b" })).toBe(false);
    expect(
      credentialsComplete("bkash", { storeId: "a", storePassword: "b", username: "u", password: "p" }),
    ).toBe(true);
  });

  it("only ever exposes masked credential hints", () => {
    const hints = credentialHints({ storeId: "livestore123", storePassword: "xy" });
    expect(hints["storeId"]).toBe("••••23");
    expect(hints["storePassword"]).toBe("••••");
    expect(JSON.stringify(hints)).not.toContain("livestore123");
  });

  it("picks sandbox or live endpoints, and honours an https override only", () => {
    expect(baseUrlFor("sslcommerz", "sandbox")).toContain("sandbox.sslcommerz.com");
    expect(baseUrlFor("sslcommerz", "live")).toContain("securepay.sslcommerz.com");
    expect(baseUrlFor("bkash", "mock")).toContain("sandbox");
    expect(baseUrlFor("aamarpay", "live", "https://custom.test/")).toBe("https://custom.test");
    expect(baseUrlFor("aamarpay", "live", "http://insecure.test")).toContain("aamarpay.com");
  });

  it("converts minor units to the major amount rails expect", () => {
    expect(majorUnits(125_000)).toBe("1250.00");
    expect(majorUnits(99)).toBe("0.99");
  });
});

describe("session requests", () => {
  it("posts an SSLCommerz form carrying the intent as the transaction id", () => {
    const req = buildSessionRequest({
      ...base,
      provider: "sslcommerz",
      baseUrl: "https://sandbox.sslcommerz.com",
      credentials: { storeId: "store", storePassword: "pass" },
    });
    expect(req.url).toBe("https://sandbox.sslcommerz.com/gwprocess/v4/api.php");
    const form = new URLSearchParams(req.body);
    expect(form.get("tran_id")).toBe(base.intentId);
    expect(form.get("total_amount")).toBe("1250.00");
    expect(form.get("ipn_url")).toBe(base.callbackUrl);
  });

  it("posts an aamarPay form that echoes the intent back in opt_a", () => {
    const req = buildSessionRequest({
      ...base,
      provider: "aamarpay",
      baseUrl: "https://sandbox.aamarpay.com",
      credentials: { storeId: "store", storePassword: "sig" },
    });
    expect(req.url).toContain("/jsonpost.php");
    expect(new URLSearchParams(req.body).get("opt_a")).toBe(base.intentId);
  });

  it("sends bKash a JSON create call and a separate grant call", () => {
    const create = buildSessionRequest({
      ...base,
      provider: "bkash",
      baseUrl: "https://tokenized.sandbox.bka.sh",
      credentials: { storeId: "key", storePassword: "secret", username: "u", password: "p" },
    });
    expect(create.encoding).toBe("json");
    expect(JSON.parse(create.body).payerReference).toBe(base.intentId);
    const grant = bkashGrantRequest("https://tokenized.sandbox.bka.sh", {
      storeId: "key",
      storePassword: "secret",
      username: "u",
      password: "p",
    });
    expect(grant.url).toContain("/token/grant");
    expect(grant.headers["username"]).toBe("u");
  });
});

describe("session answers", () => {
  it("accepts a successful SSLCommerz session and rejects a failure", () => {
    expect(
      parseSessionResponse("sslcommerz", {
        status: "SUCCESS",
        GatewayPageURL: "https://pay.test/x",
        sessionkey: "sk1",
      }),
    ).toEqual({ ok: true, redirectUrl: "https://pay.test/x", providerReference: "sk1" });
    expect(parseSessionResponse("sslcommerz", { status: "FAILED", failedreason: "bad store" })).toEqual({
      ok: false,
      reason: "bad store",
    });
  });

  it("reads an aamarPay payment url and a bKash checkout url", () => {
    expect(parseSessionResponse("aamarpay", { payment_url: "https://pay.test/a" }).ok).toBe(true);
    expect(parseSessionResponse("aamarpay", { result: "false" }).ok).toBe(false);
    expect(parseSessionResponse("bkash", { bkashURL: "https://pay.test/b", paymentID: "p1" }).ok).toBe(true);
    expect(parseSessionResponse("bkash", { statusCode: "0009", statusMessage: "invalid" }).ok).toBe(false);
  });

  it("never treats a missing or malformed answer as success", () => {
    expect(parseSessionResponse("sslcommerz", null).ok).toBe(false);
    expect(parseSessionResponse("bkash", {}).ok).toBe(false);
  });
});

describe("callbacks", () => {
  it("reads an SSLCommerz valid callback with its amount", () => {
    const v = readCallback("sslcommerz", { tran_id: "i1", status: "VALID", amount: "1250.00", val_id: "v1" });
    expect(v).toMatchObject({ intentId: "i1", status: "paid", providerReference: "v1", amountMinorInt: 125_000 });
  });

  it("distinguishes cancelled from failed", () => {
    expect(readCallback("sslcommerz", { status: "CANCELLED" }).status).toBe("cancelled");
    expect(readCallback("sslcommerz", { status: "FAILED" }).status).toBe("failed");
    expect(readCallback("aamarpay", { pay_status: "Canceled" }).status).toBe("cancelled");
    expect(readCallback("bkash", { transactionStatus: "failure" }).status).toBe("failed");
  });

  it("reads a successful aamarPay and bKash callback", () => {
    expect(readCallback("aamarpay", { opt_a: "i2", pay_status: "Successful", amount: "10.50" })).toMatchObject({
      intentId: "i2",
      status: "paid",
      amountMinorInt: 1050,
    });
    expect(
      readCallback("bkash", { payerReference: "i3", transactionStatus: "Completed", amount: "5", trxID: "t9" }),
    ).toMatchObject({ intentId: "i3", status: "paid", providerReference: "t9", amountMinorInt: 500 });
  });

  it("holds an unknown status at pending rather than guessing", () => {
    expect(readCallback("sslcommerz", { tran_id: "i1" }).status).toBe("pending");
    expect(readCallback("bkash", {}).status).toBe("pending");
  });

  it("refuses to call an order paid unless the amount matches to the paisa", () => {
    expect(amountMatches(125_000, 125_000)).toBe(true);
    expect(amountMatches(125_000, 124_999)).toBe(false);
    expect(amountMatches(125_000, null)).toBe(false);
  });
});
