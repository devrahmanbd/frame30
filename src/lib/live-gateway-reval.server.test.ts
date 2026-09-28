/**
 * T3 — provider revalidation for aamarPay/bKash callbacks.
 *
 * A forged POST carrying a valid intent id + exact amount must NEVER settle.
 * Every `paid` verdict from a contracted rail must be confirmed by a
 * server-to-server provider call; anything unverifiable is held `pending`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateWithProvider, type LiveAccount } from "./live-gateway.server";
import type { CallbackVerdict } from "./live-gateway";

const INTENT = "11111111-2222-3333-4444-555555555555";

const aamarpayAccount: LiveAccount = {
  provider: "aamarpay",
  mode: "sandbox",
  baseUrl: "https://sandbox.aamarpay.com",
  credentials: { storeId: "store", storePassword: "sig" },
  webhookSecret: "whsec",
};

const bkashAccount: LiveAccount = {
  provider: "bkash",
  mode: "sandbox",
  baseUrl: "https://tokenized.sandbox.bka.sh",
  credentials: {
    storeId: "key",
    storePassword: "secret",
    username: "u",
    password: "p",
  },
  webhookSecret: "whsec",
};

const sslAccount: LiveAccount = {
  provider: "sslcommerz",
  mode: "sandbox",
  baseUrl: "https://sandbox.sslcommerz.com",
  credentials: { storeId: "store", storePassword: "pass" },
  webhookSecret: "whsec",
};

function forgedPaid(providerReference: string | null): CallbackVerdict {
  return {
    intentId: INTENT,
    status: "paid",
    providerReference,
    amountMinorInt: 125_000,
  };
}

/** Stub global fetch with a URL-routed responder. */
function stubFetch(respond: (url: string, init: RequestInit) => unknown) {
  const fn = vi.fn(async (url: unknown, init: unknown) => ({
    text: async () =>
      JSON.stringify(respond(String(url), (init ?? {}) as RequestInit)),
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("T3 forged-callback revalidation", () => {
  it("holds a forged aamarPay paid callback pending when the provider denies it", async () => {
    const fetchFn = stubFetch(() => ({ pay_status: "Failed" }));
    const verdict = await validateWithProvider(
      aamarpayAccount,
      forgedPaid("pg-forged"),
    );
    expect(verdict.status).toBe("pending");
    expect(fetchFn).toHaveBeenCalled();
    const calledUrl = String(fetchFn.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("trxcheck");
    expect(calledUrl).toContain(`request_id=${INTENT}`);
  });

  it("holds a forged aamarPay paid callback pending when the provider is unreachable", async () => {
    stubFetch(() => {
      throw new Error("boom");
    });
    const verdict = await validateWithProvider(
      aamarpayAccount,
      forgedPaid("pg-forged"),
    );
    expect(verdict.status).toBe("pending");
  });

  it("settles aamarPay paid only when the provider confirms with a matching amount", async () => {
    stubFetch(() => ({ pay_status: "Successful", amount: "1250.00" }));
    const verdict = await validateWithProvider(
      aamarpayAccount,
      forgedPaid("pg-real"),
    );
    expect(verdict.status).toBe("paid");
    expect(verdict.amountMinorInt).toBe(125_000);
  });

  it("carries the provider amount so a mismatch can never settle downstream", async () => {
    stubFetch(() => ({ pay_status: "Successful", amount: "1.00" }));
    const verdict = await validateWithProvider(
      aamarpayAccount,
      forgedPaid("pg-real"),
    );
    expect(verdict.amountMinorInt).toBe(100);
  });

  it("holds a forged bKash paid callback pending when execute does not confirm", async () => {
    const fetchFn = stubFetch((url) =>
      url.includes("/token/grant")
        ? { id_token: "tok" }
        : { transactionStatus: "failure" },
    );
    const verdict = await validateWithProvider(
      bkashAccount,
      forgedPaid("pay-forged"),
    );
    expect(verdict.status).toBe("pending");
    const urls = fetchFn.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/token/grant"))).toBe(true);
    expect(urls.some((u) => u.includes("/checkout/execute"))).toBe(true);
  });

  it("holds a bKash paid callback pending when the grant fails", async () => {
    stubFetch(() => ({}));
    const verdict = await validateWithProvider(
      bkashAccount,
      forgedPaid("pay-forged"),
    );
    expect(verdict.status).toBe("pending");
  });

  it("settles bKash paid when execute confirms Completed with a matching amount", async () => {
    stubFetch((url) =>
      url.includes("/token/grant")
        ? { id_token: "tok" }
        : {
            transactionStatus: "Completed",
            amount: "1250.00",
            trxID: "trx9",
          },
    );
    const verdict = await validateWithProvider(
      bkashAccount,
      forgedPaid("pay-real"),
    );
    expect(verdict.status).toBe("paid");
    expect(verdict.amountMinorInt).toBe(125_000);
  });

  it("holds bKash paid pending without any network call when the payment reference is missing", async () => {
    const fetchFn = stubFetch(() => ({}));
    const verdict = await validateWithProvider(bkashAccount, forgedPaid(null));
    expect(verdict.status).toBe("pending");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("leaves non-paid verdicts untouched without provider calls", async () => {
    const fetchFn = stubFetch(() => ({}));
    const verdict = await validateWithProvider(aamarpayAccount, {
      intentId: INTENT,
      status: "failed",
      providerReference: "pg-x",
      amountMinorInt: null,
    });
    expect(verdict.status).toBe("failed");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("keeps SSLCommerz validation behavior identical", async () => {
    const fetchFn = stubFetch((url) => {
      expect(url).toContain("validationserverAPI.php");
      expect(url).toContain("val_id=v1");
      return { status: "VALID", tran_id: INTENT, amount: "1250.00" };
    });
    const verdict = await validateWithProvider(sslAccount, {
      intentId: INTENT,
      status: "paid",
      providerReference: "v1",
      amountMinorInt: 125_000,
    });
    expect(verdict.status).toBe("paid");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
