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

/* ------------------------------------------------------------------ */
/* Provider-capture receipts (bKash crash-between-execute-and-settle)  */
/* ------------------------------------------------------------------ */

export type ProviderCaptureReceipt = {
  intentId: string;
  merchantId: string;
  provider: LiveProvider;
  providerReference: string;
  amountMinorInt: number | null;
};

export type ValidateOptions = {
  /**
   * Durable capture recorder. When present, a provider-confirmed capture is
   * written to the database in the same unit that handled the execute
   * success — before any settlement runs — so a crash in between stays
   * recoverable. Absent, validation stays pure (no I/O).
   */
  capture?: { db: Client; merchantId: string };
};

/**
 * Record a durable provider-captured receipt: the intent row carries the
 * provider reference and a `charge_intent_events` row pins the capture facts
 * (`to_status: "pending"` — captured at the rail, not yet settled here).
 *
 * Idempotent: re-recording the same reference replays without a second
 * event row. A *different* reference for the same intent is a conflict and
 * throws — two providers must never claim one intent.
 */
export async function recordProviderCapture(
  db: Client,
  receipt: ProviderCaptureReceipt,
): Promise<{ intentId: string; providerReference: string; replayed: boolean }> {
  const { data: intent } = await db
    .from("charge_intents")
    .select("id, merchant_id, status, provider_reference")
    .eq("id", receipt.intentId)
    .eq("merchant_id", receipt.merchantId)
    .maybeSingle();
  const row = intent as {
    id: string;
    merchant_id: string;
    status: string;
    provider_reference: string | null;
  } | null;
  if (!row)
    throw new LiveGatewayError("live_gateway.intent_missing", receipt.intentId);
  if (
    row.provider_reference &&
    row.provider_reference !== receipt.providerReference
  ) {
    log("error", "live_gateway.capture_conflict", {
      intentId: receipt.intentId,
      provider: receipt.provider,
    });
    throw new LiveGatewayError(
      "live_gateway.capture_conflict",
      receipt.intentId,
    );
  }
  if (row.provider_reference === receipt.providerReference) {
    incr("framique_live_capture_receipt_total", {
      provider: receipt.provider,
      outcome: "replayed",
    });
    return {
      intentId: receipt.intentId,
      providerReference: receipt.providerReference,
      replayed: true,
    };
  }
  const { error: refError } = await db
    .from("charge_intents")
    .update({ provider_reference: receipt.providerReference })
    .eq("id", receipt.intentId)
    .eq("merchant_id", receipt.merchantId);
  if (refError)
    throw new LiveGatewayError(
      "live_gateway.capture_receipt_failed",
      refError.message,
    );
  const { error: eventError } = await db.from("charge_intent_events").insert({
    intent_id: receipt.intentId,
    merchant_id: receipt.merchantId,
    from_status: String(row.status),
    to_status: "pending",
    detail: {
      capture_receipt: true,
      provider: receipt.provider,
      provider_reference: receipt.providerReference,
      amount_minor_int: receipt.amountMinorInt,
    },
  });
  if (eventError)
    throw new LiveGatewayError(
      "live_gateway.capture_receipt_failed",
      eventError.message,
    );
  incr("framique_live_capture_receipt_total", {
    provider: receipt.provider,
    outcome: "recorded",
  });
  return {
    intentId: receipt.intentId,
    providerReference: receipt.providerReference,
    replayed: false,
  };
}

export type StuckCapture = {
  id: string;
  merchant_id: string;
  order_id: string;
  method: string;
  amount_minor_int: number;
  provider_reference: string;
  status: string;
  expires_at: string;
};

/**
 * Find intents captured at the provider but never settled here, past the
 * intent's own TTL. Exported cron-wireable (NOT wired): the caller passes a
 * service-role client on whatever cadence ops chooses.
 *
 * Report-only by design: the sweep never settles or voids money itself. Each
 * surfaced intent is for completion (re-validate with a fresh grant, then
 * settle) or voiding (provider-side cancel + expire) by the operator or the
 * callback retry path — the durable receipt above is what makes either
 * possible after a crash.
 */
export async function sweepStuckCaptures(
  db: Client,
  opts?: { now?: Date | string; limit?: number },
): Promise<StuckCapture[]> {
  const nowIso =
    opts?.now instanceof Date
      ? opts.now.toISOString()
      : (opts?.now ?? new Date().toISOString());
  const { data, error } = await db
    .from("charge_intents")
    .select(
      "id, merchant_id, order_id, method, amount_minor_int, provider_reference, status, expires_at",
    )
    .in("status", ["initiated", "pending"])
    .not("provider_reference", "is", null)
    .lte("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .limit(opts?.limit ?? 100);
  if (error)
    throw new LiveGatewayError("live_gateway.sweep_failed", error.message);
  // `.not(..., "is", null)` is the server-side predicate; the JS filter keeps
  // test doubles (which record but do not evaluate `not`) honest too.
  const stuck = ((data ?? []) as StuckCapture[]).filter(
    (r) => r.provider_reference,
  );
  for (const row of stuck) {
    log("warn", "live_gateway.stuck_capture", {
      intentId: row.id,
      orderId: row.order_id,
      providerReference: row.provider_reference,
    });
  }
  if (stuck.length > 0)
    incr("framique_live_stuck_capture_total", {}, stuck.length);
  return stuck;
}

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
  const row = data as {
    mode: string;
    base_url: string | null;
    credentials_ciphertext: string | null;
    webhook_secret: string;
    active: boolean;
  } | null;
  if (!row || !row.active) return null;
  if (row.mode !== "sandbox" && row.mode !== "live") return null;
  if (!row.credentials_ciphertext) return null;
  const { unsealSecret } = await import("./webhook-secret.server");
  const plain = await unsealSecret(row.credentials_ciphertext);
  if (!plain) {
    log("error", "live_gateway.credentials_unreadable", {
      merchantId,
      provider,
    });
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
  if (!isLiveProvider(provider))
    throw new LiveGatewayError("live_gateway.unsupported_provider", provider);
  if (mode !== "mock" && !credentialsComplete(provider, credentials)) {
    throw new LiveGatewayError("live_gateway.credentials_incomplete", provider);
  }
  const { sealSecret } = await import("./webhook-secret.server");
  const sealed =
    mode === "mock" ? null : await sealSecret(JSON.stringify(credentials));
  const patch = {
    mode,
    base_url:
      baseUrl && /^https:\/\//.test(baseUrl)
        ? baseUrl.replace(/\/+$/, "")
        : null,
    credentials_ciphertext: sealed,
    credential_hints: credentialHints(credentials) as unknown as Json,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db
    .from("gateway_accounts")
    .update(patch as never)
    .eq("merchant_id", merchantId)
    .eq("provider", provider);
  if (error)
    throw new LiveGatewayError("live_gateway.save_failed", error.message);
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
      // GET verification calls carry everything in the query string; fetch
      // rejects a body on GET, so only POST carries one.
      ...(req.method === "GET" ? {} : { body: req.body }),
      signal: controller.signal,
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new LiveGatewayError(
        "live_gateway.bad_response",
        text.slice(0, 200),
      );
    }
  } catch (err) {
    if (err instanceof LiveGatewayError) throw err;
    throw new LiveGatewayError(
      "live_gateway.unreachable",
      (err as Error).message,
    );
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
  return withSpan(
    "payments.live_session",
    async () => {
      const credentials = { ...account.credentials };
      let headers: Record<string, string> = {};
      if (account.provider === "bkash") {
        const grant = (await send(
          bkashGrantRequest(account.baseUrl, credentials),
        )) as Record<string, unknown>;
        const token =
          typeof grant["id_token"] === "string" ? grant["id_token"] : null;
        if (!token)
          throw new LiveGatewayError(
            "live_gateway.grant_failed",
            String(grant["statusMessage"] ?? ""),
          );
        headers = {
          authorization: token,
          "x-app-key": credentials.storeId ?? "",
        };
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
        incr("framique_live_session_total", {
          provider: account.provider,
          outcome: "rejected",
        });
        throw new LiveGatewayError(
          "live_gateway.session_rejected",
          answer.reason,
        );
      }
      incr("framique_live_session_total", {
        provider: account.provider,
        outcome: "opened",
      });
      return {
        redirectUrl: answer.redirectUrl,
        providerReference: answer.providerReference,
      };
    },
    { provider: account.provider, mode: account.mode },
  );
}

/** An unverifiable `paid` claim: hold for ops review + provider retry, never settle. */
function holdPending(
  account: LiveAccount,
  verdict: CallbackVerdict,
): CallbackVerdict {
  incr("framique_live_callback_total", {
    provider: account.provider,
    outcome: "unverified",
  });
  log("warn", "live_gateway.callback_unverified", {
    intentId: verdict.intentId,
    provider: account.provider,
  });
  return { ...verdict, status: "pending", reason: "provider_unverified" };
}

/**
 * SSLCommerz hands back a `val_id` the merchant must validate server-side; the
 * callback body alone is forgeable. aamarPay offers the same via its
 * transaction-check API, and bKash needs an execute call to confirm (and
 * capture) a tokenized payment. PipraPay — a self-hosted community plugin —
 * is verified the same way against the merchant's own server, so a forged
 * webhook can never settle an order.
 *
 * A `paid` verdict is only ever returned after the provider confirms it. Any
 * verification failure — missing reference, provider denial, unreachable rail,
 * malformed answer — holds the callback at `pending` for ops review and
 * provider retry. Non-paid verdicts pass through untouched.
 */
export async function validateWithProvider(
  account: LiveAccount,
  verdict: CallbackVerdict,
  opts?: ValidateOptions,
): Promise<CallbackVerdict> {
  if (account.provider === "aamarpay") {
    if (verdict.status !== "paid") return verdict;
    if (!verdict.intentId) return { ...verdict, status: "pending" };
    const { aamarpayVerifyRequest } = await import("./live-gateway");
    try {
      const body = (await send(
        aamarpayVerifyRequest(
          account.baseUrl,
          account.credentials,
          verdict.intentId,
        ),
      )) as Record<string, unknown>;
      const checked = readCallback("aamarpay", {
        ...body,
        opt_a: verdict.intentId,
      });
      if (checked.status !== "paid") return holdPending(account, verdict);
      return {
        ...verdict,
        status: "paid",
        amountMinorInt: checked.amountMinorInt ?? verdict.amountMinorInt,
      };
    } catch {
      return holdPending(account, verdict);
    }
  }
  if (account.provider === "bkash") {
    if (verdict.status !== "paid") return verdict;
    if (!verdict.intentId || !verdict.providerReference)
      return { ...verdict, status: "pending" };
    const { bkashExecuteRequest } = await import("./live-gateway");
    try {
      const grant = (await send(
        bkashGrantRequest(account.baseUrl, account.credentials),
      )) as Record<string, unknown>;
      const token =
        typeof grant["id_token"] === "string" ? grant["id_token"] : null;
      if (!token) return holdPending(account, verdict);
      const body = (await send(
        bkashExecuteRequest(
          account.baseUrl,
          token,
          account.credentials,
          verdict.providerReference,
        ),
      )) as Record<string, unknown>;
      const checked = readCallback("bkash", {
        ...body,
        payerReference: verdict.intentId,
      });
      if (checked.status !== "paid") return holdPending(account, verdict);
      const intentId = verdict.intentId;
      const paid = {
        ...verdict,
        status: "paid" as const,
        providerReference:
          checked.providerReference ?? verdict.providerReference,
        amountMinorInt: checked.amountMinorInt ?? verdict.amountMinorInt,
      };
      // The execute call CAPTURED at the provider. Record the receipt in this
      // same unit, before any settlement runs: a crash after this point must
      // leave durable evidence, not a silent charge. A receipt-leg failure
      // never blocks the verdict — settlement itself is the authoritative
      // durable write when this process survives.
      if (opts?.capture && paid.providerReference) {
        try {
          await recordProviderCapture(opts.capture.db, {
            intentId,
            merchantId: opts.capture.merchantId,
            provider: account.provider,
            providerReference: paid.providerReference,
            amountMinorInt: paid.amountMinorInt,
          });
        } catch (err) {
          incr("framique_live_capture_receipt_total", {
            provider: account.provider,
            outcome: "error",
          });
          log("error", "live_gateway.capture_failed", {
            intentId,
            provider: account.provider,
            reason: (err as Error).message.slice(0, 160),
          });
        }
      }
      return paid;
    } catch {
      return holdPending(account, verdict);
    }
  }
  if (account.provider === "piprapay") {
    if (!verdict.providerReference) return { ...verdict, status: "pending" };
    const { piprapayVerifyRequest } = await import("./live-gateway");
    const body = (await send(
      piprapayVerifyRequest(
        account.baseUrl,
        account.credentials,
        verdict.providerReference,
      ),
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
  if (account.provider !== "sslcommerz" || !verdict.providerReference)
    return verdict;
  const url = new URL(
    `${account.baseUrl}/validator/api/validationserverAPI.php`,
  );
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
  if (!isLiveProvider(provider))
    throw new LiveGatewayError("live_gateway.unsupported_provider", provider);

  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as Client;
  const raw = readCallback(provider, body);
  if (!raw.intentId) throw new LiveGatewayError("live_gateway.intent_missing");

  const { data: intent } = await db
    .from("charge_intents")
    .select(
      "id, merchant_id, order_id, method, amount_minor_int, return_nonce, status",
    )
    .eq("id", raw.intentId)
    .maybeSingle();
  if (!intent)
    throw new LiveGatewayError("live_gateway.intent_missing", raw.intentId);

  const account = await loadLiveAccount(db, intent.merchant_id, provider);
  if (!account)
    throw new LiveGatewayError("live_gateway.not_configured", provider);

  const { authenticateCallback } = await import("./live-gateway");
  if (!authenticateCallback(account.provider, headers, account.credentials)) {
    incr("framique_live_callback_total", {
      provider,
      outcome: "unauthenticated",
    });
    log("warn", "live_gateway.callback_unauthenticated", {
      intentId: intent.id,
      provider,
    });
    throw new LiveGatewayError(
      "live_gateway.callback_unauthenticated",
      provider,
    );
  }

  const verdict = await validateWithProvider(account, raw, {
    capture: { db, merchantId: intent.merchant_id },
  });

  let status = verdict.status;
  if (
    status === "paid" &&
    !amountMatches(Number(intent.amount_minor_int), verdict.amountMinorInt)
  ) {
    incr("framique_live_callback_total", {
      provider,
      outcome: "amount_mismatch",
    });
    log("error", "live_gateway.amount_mismatch", {
      intentId: intent.id,
      provider,
    });
    status = "failed";
  }
  if (status === "pending") {
    incr("framique_live_callback_total", { provider, outcome: "pending" });
    return { status: "pending", orderId: intent.order_id };
  }

  const { applySignedReturn, signReturn } = await import("./payments.server");
  const signature = signReturn(
    account.webhookSecret,
    intent.id,
    status,
    intent.return_nonce,
  );
  const result = await applySignedReturn(intent.id, status, signature, subject);
  incr("framique_live_callback_total", { provider, outcome: status });
  return { status: result.status, orderId: result.orderId };
}
