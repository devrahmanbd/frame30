import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { requirePlatformAdmin } from "./platform.server";

type Client = SupabaseClient<Database>;

export const SKEW_SECONDS = 300;

export type IngestOutcome = {
  http: number;
  status: string;
  reason?: string;
  detail?: Record<string, unknown>;
};

type Envelope = {
  v: number;
  webhookId: string;
  provider: string;
  type: string;
  attempt?: number;
  merchantId: string;
  orderId?: string;
  amountMinorInt: number;
  currencyCode?: string;
  reference?: string;
  ts: string;
};

const PII_KEYS = new Set([
  "customerName",
  "customerPhone",
  "customerEmail",
  "wallet",
  "walletNumber",
  "card",
  "cardNumber",
  "msisdn",
  "name",
  "email",
  "phone",
]);

/** Whitelist + mask: raw provider bodies never persist verbatim. */
export function stripPii(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (PII_KEYS.has(k)) {
      out[k] = "***";
      continue;
    }
    if (v && typeof v === "object") {
      out[k] = stripPii(v);
      continue;
    }
    out[k] = v;
  }
  if (typeof out["reference"] === "string") {
    const ref = out["reference"] as string;
    out["reference"] = ref.length > 6 ? `${ref.slice(0, 4)}***${ref.slice(-2)}` : "***";
  }
  return out;
}

function signatureMatches(secret: string, webhookId: string, body: string, given: string) {
  const expected = createHmac("sha256", secret).update(`${webhookId}.${body}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(given.trim().replace(/^sha256=/, ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseEnvelope(body: string): Envelope | null {
  try {
    const raw = JSON.parse(body) as Partial<Envelope>;
    if (
      typeof raw.webhookId !== "string" ||
      typeof raw.type !== "string" ||
      typeof raw.merchantId !== "string" ||
      typeof raw.ts !== "string" ||
      typeof raw.amountMinorInt !== "number" ||
      !Number.isInteger(raw.amountMinorInt)
    ) {
      return null;
    }
    return raw as Envelope;
  } catch {
    return null;
  }
}

async function deadLetter(
  admin: Client,
  provider: string,
  webhookId: string,
  reason: string,
  payload: Record<string, unknown>,
  merchantId?: string | null,
) {
  // Never overwrite an already-ingested event: an unsigned replay of a known
  // webhookId must not flip a processed row into a dead letter.
  await admin.from("webhook_events").upsert(
    {
      provider,
      webhook_id: webhookId,
      merchant_id: merchantId ?? null,
      event_type: (payload["type"] as string) ?? "unknown",
      status: "dead_letter",
      reason,
      payload: payload as Json,
    },
    { onConflict: "provider,webhook_id", ignoreDuplicates: true },
  );
}

/**
 * Single verified ingest path. Used by the public webhook route and by the
 * owner-console retry action, so a replay re-runs verification.
 */
export async function ingestWebhook(
  admin: Client,
  provider: string,
  rawBody: string,
  signature: string | null,
): Promise<IngestOutcome> {
  const envelope = parseEnvelope(rawBody);
  if (!envelope) {
    const id = `parse_${Date.now()}`;
    await deadLetter(admin, provider, id, "parse_error", {});
    return { http: 400, status: "dead_letter", reason: "parse_error" };
  }

  const safePayload = stripPii(envelope);

  if (!signature) {
    await deadLetter(admin, provider, envelope.webhookId, "hmac_invalid", safePayload);
    return { http: 401, status: "dead_letter", reason: "hmac_invalid" };
  }

  const { data: account } = await admin
    .from("gateway_accounts")
    .select("webhook_secret, active")
    .eq("merchant_id", envelope.merchantId)
    .eq("provider", provider)
    .maybeSingle();

  if (!account || !account.active) {
    await deadLetter(admin, provider, envelope.webhookId, "unknown_gateway_account", safePayload);
    return { http: 401, status: "dead_letter", reason: "unknown_gateway_account" };
  }

  if (!signatureMatches(account.webhook_secret, envelope.webhookId, rawBody, signature)) {
    await deadLetter(
      admin,
      provider,
      envelope.webhookId,
      "hmac_invalid",
      safePayload,
      envelope.merchantId,
    );
    return { http: 401, status: "dead_letter", reason: "hmac_invalid" };
  }

  const skew = Math.abs(Date.now() - new Date(envelope.ts).getTime());
  if (!Number.isFinite(skew) || skew > SKEW_SECONDS * 1000) {
    await deadLetter(
      admin,
      provider,
      envelope.webhookId,
      "ts_out_of_window",
      safePayload,
      envelope.merchantId,
    );
    return { http: 400, status: "dead_letter", reason: "ts_out_of_window" };
  }

  const { data, error } = await admin.rpc("gateway_apply_webhook", {
    _provider: provider,
    _webhook_id: envelope.webhookId,
    _merchant_id: envelope.merchantId,
    _order_id: (envelope.orderId ?? null) as string,
    _event_type: envelope.type,
    _amount_minor_int: envelope.amountMinorInt,
    _currency_code: envelope.currencyCode ?? "BDT",
    _attempt: envelope.attempt ?? 1,
    _payload: safePayload as Json,
  });

  if (error) {
    await deadLetter(
      admin,
      provider,
      envelope.webhookId,
      "processing_error",
      safePayload,
      envelope.merchantId,
    );
    return { http: 500, status: "dead_letter", reason: "processing_error" };
  }

  const result = (data ?? {}) as Record<string, unknown>;
  const status = String(result["status"] ?? "processed");
  return {
    http: status === "dead_letter" ? 202 : 200,
    status,
    ...(result["reason"] ? { reason: String(result["reason"]) } : {}),
    detail: result,
  };
}

export async function loadGatewayEvents(db: Client, userId: string) {
  await requirePlatformAdmin(db, userId);
  const [events, merchants] = await Promise.all([
    db
      .from("webhook_events")
      .select(
        "id, provider, webhook_id, merchant_id, order_id, event_type, status, reason, amount_minor_int, currency_code, redelivery_count, payload, received_at, processed_at",
      )
      .order("received_at", { ascending: false })
      .limit(100),
    db.from("merchants").select("id, name"),
  ]);
  const names = new Map((merchants.data ?? []).map((m) => [m.id, m.name]));
  return {
    events: (events.data ?? []).map((e) => ({
      ...e,
      merchantName: e.merchant_id ? (names.get(e.merchant_id) ?? null) : null,
    })),
  };
}

/** Owner-console retry: re-signs the stored (PII-stripped) body and re-verifies. */
export async function retryGatewayEvent(db: Client, userId: string, eventId: string) {
  await requirePlatformAdmin(db, userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;

  const { data: event } = await admin
    .from("webhook_events")
    .select("id, provider, webhook_id, merchant_id, payload")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return { ok: false, status: "dead_letter", reason: "not_found" };

  const { data: account } = await admin
    .from("gateway_accounts")
    .select("webhook_secret")
    .eq("merchant_id", event.merchant_id ?? "")
    .eq("provider", event.provider)
    .maybeSingle();
  if (!account) return { ok: false, status: "dead_letter", reason: "unknown_gateway_account" };

  await admin.from("webhook_events").delete().eq("id", event.id);

  const body = JSON.stringify({
    ...(event.payload as Record<string, unknown>),
    ts: new Date().toISOString(),
  });
  const signature = createHmac("sha256", account.webhook_secret)
    .update(`${event.webhook_id}.${body}`)
    .digest("hex");
  const outcome = await ingestWebhook(admin, event.provider, body, signature);
  return {
    ok: outcome.status === "processed",
    status: outcome.status,
    reason: outcome.reason ?? null,
  };
}
