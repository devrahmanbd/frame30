/**
 * Phase 2 — real payment rails, pure half.
 *
 * Everything here is deterministic: how a hosted-checkout session is requested
 * from a real Bangladeshi rail, how its answer is read, and how its callback is
 * verified. No fetch, no database, no secrets in memory longer than a call —
 * which is exactly what makes a live money path testable.
 *
 * The three rails wired here cover the realistic first contract for a shop:
 *  - **SSLCommerz** — the default aggregator (cards, net banking, every wallet)
 *  - **aamarPay** — the cheaper aggregator, same hosted-page shape
 *  - **bKash** (Checkout / tokenized) — the wallet merchants ask for by name
 *
 * **PipraPay** is different: it is a community plugin for a gateway the merchant
 * self-hosts (see `payment-plugins.ts`). It is unofficial, it is labelled as such
 * everywhere, and it goes through exactly the same verification as a contracted
 * rail — its callback is authenticated with the merchant's own API key, then
 * re-verified against the merchant's own server before any order is paid.
 *
 * A rail is only used when its `gateway_accounts` row is in `sandbox` or `live`
 * mode *and* carries credentials. Anything else falls back to the mock rail, so
 * a half-configured shop can never take money it cannot capture.
 */

import { communityPlugin } from "./payment-plugins";

export const LIVE_PROVIDERS = ["sslcommerz", "aamarpay", "bkash", "piprapay"] as const;
export type LiveProvider = (typeof LIVE_PROVIDERS)[number];


export type GatewayMode = "mock" | "sandbox" | "live";

export function isLiveProvider(value: string): value is LiveProvider {
  return (LIVE_PROVIDERS as readonly string[]).includes(value);
}

/** Credential shape per rail. Stored sealed; never returned to any caller. */
export type LiveCredentials = {
  /** SSLCommerz store id / aamarPay store id / bKash app key. */
  storeId?: string;
  /** SSLCommerz store password / aamarPay signature key / bKash app secret. */
  storePassword?: string;
  /** bKash only. */
  username?: string;
  password?: string;
  /** Community plugins: PipraPay's `mh-piprapay-api-key`. */
  apiKey?: string;
  /** Community plugins the merchant self-hosts: their own gateway origin. */
  baseUrl?: string;
};

export const REQUIRED_CREDENTIALS: Record<LiveProvider, (keyof LiveCredentials)[]> = {
  sslcommerz: ["storeId", "storePassword"],
  aamarpay: ["storeId", "storePassword"],
  bkash: ["storeId", "storePassword", "username", "password"],
  piprapay: ["apiKey", "baseUrl"],
};

export function credentialsComplete(provider: LiveProvider, creds: LiveCredentials) {
  const complete = REQUIRED_CREDENTIALS[provider].every((k) => {
    const v = creds[k];
    return typeof v === "string" && v.trim().length > 0;
  });
  if (!complete) return false;
  // A self-hosted plugin has no endpoint we could default to, so an origin that
  // is not plainly https is treated as "not configured" rather than guessed at.
  const plugin = communityPlugin(provider);
  if (plugin?.requiresBaseUrl && !/^https:\/\/[^\s]+$/.test((creds.baseUrl ?? "").trim())) return false;
  return true;
}


/** Hints are all that ever leaves the server: which keys exist, last 2 chars. */
export function credentialHints(creds: LiveCredentials): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds)) {
    if (typeof v !== "string" || !v) continue;
    out[k] = v.length > 4 ? `••••${v.slice(-2)}` : "••••";
  }
  return out;
}

/** Default endpoints. A merchant may override per account (`base_url`). */
export const PROVIDER_BASE_URL: Record<LiveProvider, Record<"sandbox" | "live", string>> = {
  sslcommerz: {
    sandbox: "https://sandbox.sslcommerz.com",
    live: "https://securepay.sslcommerz.com",
  },
  aamarpay: {
    sandbox: "https://sandbox.aamarpay.com",
    live: "https://secure.aamarpay.com",
  },
  bkash: {
    sandbox: "https://tokenized.sandbox.bka.sh",
    live: "https://tokenized.pay.bka.sh",
  },
  // Self-hosted community plugin: there is no shared endpoint on purpose.
  piprapay: { sandbox: "", live: "" },
};

export function baseUrlFor(
  provider: LiveProvider,
  mode: GatewayMode,
  override?: string | null,
  creds?: LiveCredentials,
) {
  if (override && /^https:\/\//.test(override)) return override.replace(/\/+$/, "");
  const own = creds?.baseUrl?.trim();
  if (own && /^https:\/\//.test(own)) return own.replace(/\/+$/, "");
  return PROVIDER_BASE_URL[provider][mode === "live" ? "live" : "sandbox"];
}


/* ------------------------------------------------------------------ */
/* Session requests                                                     */
/* ------------------------------------------------------------------ */

export type SessionInput = {
  provider: LiveProvider;
  mode: GatewayMode;
  baseUrl: string;
  credentials: LiveCredentials;
  intentId: string;
  /** Minor units everywhere else in the codebase; rails want major units. */
  amountMinorInt: number;
  currencyCode: string;
  /** Our own callback, already absolute. */
  callbackUrl: string;
  returnUrl: string;
  cancelUrl: string;
};

export type SessionRequest = {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
  /** `form` bodies are urlencoded, `json` bodies are JSON. */
  encoding: "form" | "json";
};

export function majorUnits(amountMinorInt: number) {
  return (amountMinorInt / 100).toFixed(2);
}

/** Build the provider call that creates a hosted checkout session. */
export function buildSessionRequest(input: SessionInput): SessionRequest {
  const amount = majorUnits(input.amountMinorInt);
  const c = input.credentials;
  if (input.provider === "sslcommerz") {
    const form = new URLSearchParams({
      store_id: c.storeId ?? "",
      store_passwd: c.storePassword ?? "",
      total_amount: amount,
      currency: input.currencyCode,
      tran_id: input.intentId,
      success_url: input.returnUrl,
      fail_url: input.cancelUrl,
      cancel_url: input.cancelUrl,
      ipn_url: input.callbackUrl,
      shipping_method: "NO",
      product_name: "Order",
      product_category: "general",
      product_profile: "general",
    });
    return {
      url: `${input.baseUrl}/gwprocess/v4/api.php`,
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      encoding: "form",
    };
  }
  if (input.provider === "aamarpay") {
    const form = new URLSearchParams({
      store_id: c.storeId ?? "",
      signature_key: c.storePassword ?? "",
      tran_id: input.intentId,
      amount,
      currency: input.currencyCode,
      desc: "Order",
      success_url: input.returnUrl,
      fail_url: input.cancelUrl,
      cancel_url: input.cancelUrl,
      opt_a: input.intentId,
      type: "json",
    });
    return {
      url: `${input.baseUrl}/jsonpost.php`,
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      encoding: "form",
    };
  }
  if (input.provider === "piprapay") {

    // Community plugin: PipraPay's own create-charge endpoint on the merchant's
    // server. The intent id travels in metadata so the callback can be matched
    // back to a charge we opened, never to one the caller names.
    return {
      url: `${input.baseUrl}/api/create-charge`,
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "mh-piprapay-api-key": c.apiKey ?? "",
      },
      body: JSON.stringify({
        full_name: "Customer",
        email_mobile: "customer@example.com",
        amount,
        currency: input.currencyCode,
        metadata: { intent_id: input.intentId },
        redirect_url: input.returnUrl,
        return_type: "GET",
        cancel_url: input.cancelUrl,
        webhook_url: input.callbackUrl,
      }),
      encoding: "json",
    };
  }

  // bKash tokenized checkout: create is a JSON call carrying the grant token,
  // which the server half fetches immediately before this request.
  return {
    url: `${input.baseUrl}/v1.2.0-beta/tokenized/checkout/create`,
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      mode: "0011",
      payerReference: input.intentId,
      callbackURL: input.returnUrl,
      amount,
      currency: input.currencyCode,
      intent: "sale",
      merchantInvoiceNumber: input.intentId.slice(0, 24),
    }),
    encoding: "json",
  };
}

export function bkashGrantRequest(baseUrl: string, c: LiveCredentials): SessionRequest {
  return {
    url: `${baseUrl}/v1.2.0-beta/tokenized/checkout/token/grant`,
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      username: c.username ?? "",
      password: c.password ?? "",
    },
    body: JSON.stringify({ app_key: c.storeId, app_secret: c.storePassword }),
    encoding: "json",
  };
}

export type SessionAnswer =
  | { ok: true; redirectUrl: string; providerReference: string | null }
  | { ok: false; reason: string };

/** Read a rail's answer without trusting its shape. */
export function parseSessionResponse(provider: LiveProvider, payload: unknown): SessionAnswer {
  const p = (payload ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  if (provider === "sslcommerz") {
    const url = str(p["GatewayPageURL"]) ?? str(p["redirectGatewayURL"]);
    if (str(p["status"]) === "SUCCESS" && url) {
      return { ok: true, redirectUrl: url, providerReference: str(p["sessionkey"]) };
    }
    return { ok: false, reason: str(p["failedreason"]) ?? "sslcommerz_session_rejected" };
  }
  if (provider === "aamarpay") {
    const url = str(p["payment_url"]);
    if (url) return { ok: true, redirectUrl: url, providerReference: str(p["tran_id"]) };
    return { ok: false, reason: str(p["result"]) ?? "aamarpay_session_rejected" };
  }
  if (provider === "piprapay") {
    const url = str(p["pp_url"]);
    if (p["status"] === true && url) return { ok: true, redirectUrl: url, providerReference: str(p["pp_id"]) };
    return { ok: false, reason: str(p["message"]) ?? "piprapay_session_rejected" };
  }

  const url = str(p["bkashURL"]);
  if (url && str(p["statusCode"]) !== "0009") {
    return { ok: true, redirectUrl: url, providerReference: str(p["paymentID"]) };
  }
  return { ok: false, reason: str(p["statusMessage"]) ?? "bkash_session_rejected" };
}

/* ------------------------------------------------------------------ */
/* Callbacks                                                            */
/* ------------------------------------------------------------------ */

export type CallbackVerdict = {
  intentId: string | null;
  /** `paid` only ever comes from a validated, amount-matched callback. */
  status: "paid" | "failed" | "cancelled" | "pending";
  providerReference: string | null;
  amountMinorInt: number | null;
  reason?: string;
};

function minor(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/**
 * Read a provider callback body into a verdict. This never decides `paid` on a
 * rail's word alone for SSLCommerz/bKash — the server half re-validates against
 * the provider API and compares the amount before any order is marked paid.
 */
export function readCallback(provider: LiveProvider, body: Record<string, unknown>): CallbackVerdict {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  if (provider === "sslcommerz") {
    const status = str(body["status"]);
    return {
      intentId: str(body["tran_id"]),
      status:
        status === "VALID" || status === "VALIDATED"
          ? "paid"
          : status === "CANCELLED"
            ? "cancelled"
            : status === "FAILED"
              ? "failed"
              : "pending",
      providerReference: str(body["val_id"]) ?? str(body["bank_tran_id"]),
      amountMinorInt: minor(body["amount"] ?? body["store_amount"]),
    };
  }
  if (provider === "aamarpay") {
    const result = str(body["pay_status"]) ?? str(body["status_code"]);
    return {
      intentId: str(body["opt_a"]) ?? str(body["mer_txnid"]),
      status: result === "Successful" || result === "2" ? "paid" : result === "Canceled" ? "cancelled" : "failed",
      providerReference: str(body["pg_txnid"]),
      amountMinorInt: minor(body["amount"]),
    };
  }
  if (provider === "piprapay") {
    const meta = (body["metadata"] ?? {}) as Record<string, unknown>;
    const status = str(body["status"]);
    return {
      intentId: str(meta["intent_id"]),
      status:
        status === "completed" || status === "Completed" || status === "success"
          ? "paid"
          : status === "cancelled" || status === "canceled"
            ? "cancelled"
            : status === "failed" || status === "error"
              ? "failed"
              : "pending",
      providerReference: str(body["pp_id"]) ?? str(body["transaction_id"]),
      amountMinorInt: minor(body["amount"]),
    };
  }

  const status = str(body["transactionStatus"]) ?? str(body["status"]);
  return {
    intentId: str(body["payerReference"]) ?? str(body["merchantInvoiceNumber"]),
    status:
      status === "Completed"
        ? "paid"
        : status === "cancel" || status === "Cancelled"
          ? "cancelled"
          : status === "failure" || status === "Failed"
            ? "failed"
            : "pending",
    providerReference: str(body["trxID"]) ?? str(body["paymentID"]),
    amountMinorInt: minor(body["amount"]),
  };
}

/** The rail's own answer must match the intent to the paisa, or it is not paid. */
export function amountMatches(expectedMinorInt: number, seenMinorInt: number | null) {
  return seenMinorInt !== null && seenMinorInt === expectedMinorInt;
}

/* ------------------------------------------------------------------ */
/* Community plugin callback authentication                             */
/* ------------------------------------------------------------------ */

/** Constant-time string compare so a wrong key leaks no timing information. */
function sameSecret(a: string, b: string) {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * A community plugin authenticates its own callback before the verdict is even
 * read. PipraPay signs nothing, so it echoes the merchant's API key in
 * `mh-piprapay-api-key`; an unauthenticated hit is dropped, never settled.
 *
 * Contracted rails return `true` here — they are authenticated by re-validating
 * with the provider API instead, which the server half already does.
 */
export function authenticateCallback(
  provider: LiveProvider,
  headers: Record<string, string>,
  creds: LiveCredentials,
) {
  if (provider !== "piprapay") return true;
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  const given = (lower["mh-piprapay-api-key"] ?? "").trim();
  return sameSecret(given, (creds.apiKey ?? "").trim());
}

/** PipraPay's own verify call: the only answer we trust about a charge. */
export function piprapayVerifyRequest(
  baseUrl: string,
  creds: LiveCredentials,
  providerReference: string,
): SessionRequest {
  return {
    url: `${baseUrl}/api/verify-payments`,
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "mh-piprapay-api-key": creds.apiKey ?? "",
    },
    body: JSON.stringify({ transaction_id: providerReference }),
    encoding: "json",
  };
}
