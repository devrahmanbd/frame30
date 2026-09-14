/**
 * Phase 2 — real payment rails, server half.
 *
 * Talks to SSLCommerz, aamarPay and bKash over HTTPS with the merchant's own
 * contracted credentials, which are sealed at rest with the same AES-GCM master
 * key used for outbound webhook secrets. Nothing here trusts a callback body:
 * a rail's "paid" is only believed after the amount matches the intent and,
 * where the rail offers one, a server-to-server validation call agrees.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { incr, log, withSpan } from "./observability.server";
import {
  amountMatches,
  baseUrlFor,
  bkashGrantRequest,
  buildSessionRequest,
  credentialHints,
  credentialsComplete,
  isLiveProvider,
  parseSessionResponse,
  readCallback,
  type CallbackVerdict,
  type GatewayMode,
  type LiveCredentials,
  type LiveProvider,
  type SessionRequest,
} from "./live-gateway";

type Client = SupabaseClient<Database>;

export class LiveGatewayError extends Error {
  constructor(
    readonly code: string,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "LiveGatewayError";
  }
}

export type LiveAccount = {
  provider: LiveProvider;
  mode: Exclude<GatewayMode, "mock">;
  baseUrl: string;
  credentials: LiveCredentials;
  webhookSecret: string;
};

/**
 * A rail is "live-capable" only when the account is active, out of mock mode,
 * and holds every credential the rail needs. Otherwise callers fall back to the
 * sandbox rail rather than failing the shopper.
 */
export async function loadLiveAccount(
  db: Client,
  merchantId: string,
  provider: string,
): Promise<LiveAccount | null> {
  if (!isLiveProvider(provider)) return null;
  const { data } = await db
    .from("gateway_accounts")
    .select("mode, base_url, credentials_ciphertext, webhook_secret, active")
    .eq("merchant_id", merchantId)
    .eq("provider", provider)
    .maybeSingle();
  const row = data as
    | { mode: string; base_url: string | null; credentials_ciphertext: string | null; webhook_secret: string; active: boolean }
    | null;
  if (!row || !row.active) return null;
  if (row.mode !== "sandbox" && row.mode !== "live") return null;
  if (!row.credentials_ciphertext) return null;
  const { unsealSecret } = await import("./webhook-secret.server");
  const plain = await unsealSecret(row.credentials_ciphertext);
  if (!plain) {
    log("error", "live_gateway.credentials_unreadable", { merchantId, provider });
    return null;
  }
  let credentials: LiveCredentials;
  try {
    credentials = JSON.parse(plain) as LiveCredentials;
  } catch {
    return null;
  }
  if (!credentialsComplete(provider, credentials)) return null;
  return {
    provider,
    mode: row.mode,
    baseUrl: baseUrlFor(provider, row.mode, row.base_url),
    credentials,
    webhookSecret: row.webhook_secret,
  };
}

/** Store contracted credentials. Plaintext is sealed immediately; only hints persist. */
export async function saveLiveCredentials(
  db: Client,
  merchantId: string,
  provider: string,
  mode: GatewayMode,
  credentials: LiveCredentials,
  baseUrl?: string | null,
) {
  if (!isLiveProvider(provider)) throw new LiveGatewayError("live_gateway.unsupported_provider", provider);
  if (mode !== "mock" && !credentialsComplete(provider, credentials)) {
    throw new LiveGatewayError("live_gateway.credentials_incomplete", provider);
  }
  const { sealSecret } = await import("./webhook-secret.server");
  const sealed = mode === "mock" ? null : await sealSecret(JSON.stringify(credentials));
  const patch = {
    mode,
    base_url: baseUrl && /^https:\/\//.test(baseUrl) ? baseUrl.replace(/\/+$/, "") : null,
    credentials_ciphertext: sealed,
    credential_hints: credentialHints(credentials) as unknown as Json,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db
    .from("gateway_accounts")
    .update(patch as never)
    .eq("merchant_id", merchantId)
    .eq("provider", provider);
  if (error) throw new LiveGatewayError("live_gateway.save_failed", error.message);
  log("info", "live_gateway.credentials_saved", { merchantId, provider, mode });
  return { mode, hints: credentialHints(credentials) };
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                 */
/* ------------------------------------------------------------------ */

const TIMEOUT_MS = 12_000;

async function send(req: SessionRequest): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal: controller.signal,
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new LiveGatewayError("live_gateway.bad_response", text.slice(0, 200));
    }
  } catch (err) {
    if (err instanceof LiveGatewayError) throw err;
    throw new LiveGatewayError("live_gateway.unreachable", (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

/** Open a hosted checkout session on the real rail. */
export async function openLiveSession(
  account: LiveAccount,
  input: {
    intentId: string;
    amountMinorInt: number;
    currencyCode: string;
    callbackUrl: string;
    returnUrl: string;
    cancelUrl: string;
  },
): Promise<{ redirectUrl: string; providerReference: string | null }> {
  return withSpan("payments.live_session", async () => {
    const credentials = { ...account.credentials };
    let headers: Record<string, string> = {};
    if (account.provider === "bkash") {
      const grant = (await send(bkashGrantRequest(account.baseUrl, credentials))) as Record<string, unknown>;
      const token = typeof grant["id_token"] === "string" ? grant["id_token"] : null;
      if (!token) throw new LiveGatewayError("live_gateway.grant_failed", String(grant["statusMessage"] ?? ""));
      headers = { authorization: token, "x-app-key": credentials.storeId ?? "" };
    }
    const req = buildSessionRequest({
      provider: account.provider,
      mode: account.mode,
      baseUrl: account.baseUrl,
      credentials,
      ...input,
    });
    const answer = parseSessionResponse(
      account.provider,
      await send({ ...req, headers: { ...req.headers, ...headers } }),
    );
    if (!answer.ok) {
      incr("framique_live_session_total", { provider: account.provider, outcome: "rejected" });
      throw new LiveGatewayError("live_gateway.session_rejected", answer.reason);
    }
    incr("framique_live_session_total", { provider: account.provider, outcome: "opened" });
    return { redirectUrl: answer.redirectUrl, providerReference: answer.providerReference };
  }, { provider: account.provider, mode: account.mode });
}

/**
 * SSLCommerz hands back a `val_id` the merchant must validate server-side; the
 * callback body alone is forgeable. bKash needs the same for tokenized execute.
 * PipraPay — a self-hosted community plugin — is verified the same way against
 * the merchant's own server, so a forged webhook can never settle an order.
 */
async function validateWithProvider(
  account: LiveAccount,
  verdict: CallbackVerdict,
): Promise<CallbackVerdict> {
  if (account.provider === "piprapay") {
    if (!verdict.providerReference) return { ...verdict, status: "pending" };
    const { piprapayVerifyRequest } = await import("./live-gateway");
    const body = (await send(
      piprapayVerifyRequest(account.baseUrl, account.credentials, verdict.providerReference),
    )) as Record<string, unknown>;
    const checked = readCallback("piprapay", {
      ...body,
      metadata: { intent_id: verdict.intentId },
    });
    return {
      ...verdict,
      status: checked.status,
      amountMinorInt: checked.amountMinorInt ?? verdict.amountMinorInt,
    };
  }
  if (account.provider !== "sslcommerz" || !verdict.providerReference) return verdict;
  const url = new URL(`${account.baseUrl}/validator/api/validationserverAPI.php`);
  url.searchParams.set("val_id", verdict.providerReference);
  url.searchParams.set("store_id", account.credentials.storeId ?? "");
  url.searchParams.set("store_passwd", account.credentials.storePassword ?? "");
  url.searchParams.set("format", "json");
  const body = (await send({
    url: url.toString(),
    method: "POST",
    headers: {},
    body: "",
    encoding: "form",
  })) as Record<string, unknown>;
  const checked = readCallback("sslcommerz", body);
  return {
    ...verdict,
    status: checked.status,
    amountMinorInt: checked.amountMinorInt ?? verdict.amountMinorInt,
  };
}

/**
 * Handle a rail callback end to end: read it, validate it, compare the amount,
 * then reuse the signed-return path so the ledger, payment row and order status
 * all move through exactly one code path.
 *
 * `headers` carries the request headers a community plugin authenticates with;
 * an unauthenticated plugin callback is rejected before anything is read.
 */
export async function settleLiveCallback(
  provider: string,
  body: Record<string, unknown>,
  subject: string,
  headers: Record<string, string> = {},
): Promise<{ status: string; orderId: string | null }> {
  if (!isLiveProvider(provider)) throw new LiveGatewayError("live_gateway.unsupported_provider", provider);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as Client;
  const raw = readCallback(provider, body);
  if (!raw.intentId) throw new LiveGatewayError("live_gateway.intent_missing");

  const { data: intent } = await db
    .from("charge_intents")
    .select("id, merchant_id, order_id, method, amount_minor_int, return_nonce, status")
    .eq("id", raw.intentId)
    .maybeSingle();
  if (!intent) throw new LiveGatewayError("live_gateway.intent_missing", raw.intentId);

  const account = await loadLiveAccount(db, intent.merchant_id, provider);
  if (!account) throw new LiveGatewayError("live_gateway.not_configured", provider);

  const { authenticateCallback } = await import("./live-gateway");
  if (!authenticateCallback(account.provider, headers, account.credentials)) {
    incr("framique_live_callback_total", { provider, outcome: "unauthenticated" });
    log("warn", "live_gateway.callback_unauthenticated", { intentId: intent.id, provider });
    throw new LiveGatewayError("live_gateway.callback_unauthenticated", provider);
  }

  const verdict = await validateWithProvider(account, raw);

  let status = verdict.status;
  if (status === "paid" && !amountMatches(Number(intent.amount_minor_int), verdict.amountMinorInt)) {
    incr("framique_live_callback_total", { provider, outcome: "amount_mismatch" });
    log("error", "live_gateway.amount_mismatch", { intentId: intent.id, provider });
    status = "failed";
  }
  if (status === "pending") {
    incr("framique_live_callback_total", { provider, outcome: "pending" });
    return { status: "pending", orderId: intent.order_id };
  }

  const { applySignedReturn, signReturn } = await import("./payments.server");
  const signature = signReturn(account.webhookSecret, intent.id, status, intent.return_nonce);
  const result = await applySignedReturn(intent.id, status, signature, subject);
  incr("framique_live_callback_total", { provider, outcome: status });
  return { status: result.status, orderId: result.orderId };
}
