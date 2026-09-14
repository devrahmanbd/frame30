/**
 * Outbound webhook registry + delivery worker.
 *
 * Secrets: a receiver has to re-compute HMAC over the raw body, so the signing
 * material must be recoverable server-side — a plain hash would make signing
 * impossible. The secret is therefore sealed with AES-GCM under a server-only
 * master key and stored in `secret_hash` / `previous_secret_hash`; the
 * plaintext is shown to the merchant exactly once, at create and at rotate.
 *
 * Delivery: every event fans out to one row per subscribed endpoint with
 * `next_attempt_at = now`, and the cron worker claims due rows. Retries follow
 * `nextDeliveryState()` (exponential backoff, dead-letter at the ceiling), so a
 * receiver outage degrades into a queue instead of lost events.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { incr, log, observe } from "./observability.server";
import { newWebhookSecret, sealSecret, unsealSecret } from "./webhook-secret.server";
import { enforceRateLimit } from "./rate-limit.server";
import {
  computeSignature,
  isWebhookEvent,
  MAX_ATTEMPTS,
  nextDeliveryState,
  SIGNATURE_HEADER,
  signatureHeader,
  validateEndpointUrl,
  type WebhookEvent,
} from "./webhook-signing";

type Client = SupabaseClient<Database>;
type EndpointRow = Database["public"]["Tables"]["api_webhook_endpoints"]["Row"];

export const ROTATION_GRACE_HOURS = 24;
const DELIVERY_TIMEOUT_MS = 10_000;
const AUTO_PAUSE_FAILURES = 20;

export class WebhookError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
    this.name = "WebhookError";
  }
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Secrets valid right now: current, plus previous while the grace window is open. */
async function activeSecrets(endpoint: EndpointRow) {
  const out: string[] = [];
  const current = await unsealSecret(endpoint.secret_hash);
  if (current) out.push(current);
  if (
    endpoint.previous_secret_hash &&
    endpoint.previous_secret_expires_at &&
    Date.parse(endpoint.previous_secret_expires_at) > Date.now()
  ) {
    const prev = await unsealSecret(endpoint.previous_secret_hash);
    if (prev) out.push(prev);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Registry (merchant admin surface)                                    */
/* ------------------------------------------------------------------ */

async function requireAdminRole(db: Client, merchantId: string, userId: string) {
  const { data } = await db
    .from("merchant_members")
    .select("role")
    .eq("merchant_id", merchantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || (data.role !== "owner" && data.role !== "admin")) {
    throw new WebhookError("forbidden", 403);
  }
}

function sanitizeEvents(events: string[]): WebhookEvent[] {
  const picked = Array.from(new Set(events.filter(isWebhookEvent)));
  if (!picked.length) throw new WebhookError("event_required", 400);
  return picked;
}

export async function listWebhooks(db: Client, merchantId: string) {
  await enforceRateLimit("dev.read", merchantId);
  const [endpoints, deliveries] = await Promise.all([
    db
      .from("api_webhook_endpoints")
      .select(
        "id,url,description,events,status,failure_count,last_delivery_at,last_error,secret_prefix,secret_rotated_at,created_at",
      )
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("api_webhook_deliveries")
      .select(
        "id,endpoint_id,event_type,status,attempt,response_status,response_ms,error,created_at,delivered_at,next_attempt_at",
      )
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  return { endpoints: endpoints.data ?? [], deliveries: deliveries.data ?? [] };
}

export async function saveWebhook(
  db: Client,
  merchantId: string,
  userId: string,
  input: { id?: string | null; url: string; description: string; events: string[] },
) {
  await requireAdminRole(db, merchantId, userId);
  await enforceRateLimit("dev.write", `${merchantId}:${userId}`);
  const url = validateEndpointUrl(input.url.trim());
  if (!url.ok) throw new WebhookError(url.reason, 400);
  const events = sanitizeEvents(input.events);

  if (input.id) {
    const { error } = await db
      .from("api_webhook_endpoints")
      .update({
        url: url.url,
        description: input.description.slice(0, 200),
        events,
        updated_at: new Date().toISOString(),
      })
      .eq("merchant_id", merchantId)
      .eq("id", input.id);
    if (error) throw new WebhookError("save_failed", 500);
    return { id: input.id, secret: null as string | null };
  }

  const secret = newWebhookSecret();
  const { data, error } = await db
    .from("api_webhook_endpoints")
    .insert({
      merchant_id: merchantId,
      url: url.url,
      description: input.description.slice(0, 200),
      events,
      secret_hash: await sealSecret(secret),
      secret_prefix: secret.slice(0, 12),
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new WebhookError("save_failed", 500);
  incr("framique_webhook_endpoint_total", { action: "created" });
  return { id: data.id, secret };
}

/** Rotation keeps the old secret verifying for a grace window (dual-sign). */
export async function rotateWebhookSecret(
  db: Client,
  merchantId: string,
  userId: string,
  id: string,
) {
  await requireAdminRole(db, merchantId, userId);
  await enforceRateLimit("dev.write", `${merchantId}:${userId}`);
  const { data: existing } = await db
    .from("api_webhook_endpoints")
    .select("secret_hash")
    .eq("merchant_id", merchantId)
    .eq("id", id)
    .maybeSingle();
  if (!existing) throw new WebhookError("not_found", 404);
  const secret = newWebhookSecret();
  const { error } = await db
    .from("api_webhook_endpoints")
    .update({
      secret_hash: await sealSecret(secret),
      secret_prefix: secret.slice(0, 12),
      previous_secret_hash: existing.secret_hash,
      previous_secret_expires_at: new Date(
        Date.now() + ROTATION_GRACE_HOURS * 3600 * 1000,
      ).toISOString(),
      secret_rotated_at: new Date().toISOString(),
    })
    .eq("merchant_id", merchantId)
    .eq("id", id);
  if (error) throw new WebhookError("rotate_failed", 500);
  incr("framique_webhook_endpoint_total", { action: "rotated" });
  return { secret, graceHours: ROTATION_GRACE_HOURS };
}

export async function setWebhookStatus(
  db: Client,
  merchantId: string,
  userId: string,
  id: string,
  status: Database["public"]["Enums"]["webhook_endpoint_status"],
) {
  await requireAdminRole(db, merchantId, userId);
  const patch: Database["public"]["Tables"]["api_webhook_endpoints"]["Update"] = {
    status,
    updated_at: new Date().toISOString(),
  };
  // Re-enabling clears the strike counter, otherwise one old outage would
  // auto-pause the endpoint again on the very next failure.
  if (status === "active") patch.failure_count = 0;
  const { error } = await db
    .from("api_webhook_endpoints")
    .update(patch)
    .eq("merchant_id", merchantId)
    .eq("id", id);
  if (error) throw new WebhookError("status_failed", 500);
  return { ok: true as const };
}

/** Re-queues a dead/failed delivery as a fresh attempt without losing history. */
export async function replayDelivery(db: Client, merchantId: string, userId: string, id: string) {
  await requireAdminRole(db, merchantId, userId);
  await enforceRateLimit("dev.write", `${merchantId}:${userId}`);
  const { data } = await db
    .from("api_webhook_deliveries")
    .select("endpoint_id,event_type,payload")
    .eq("merchant_id", merchantId)
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new WebhookError("not_found", 404);
  const dba = await admin();
  const { error } = await dba.from("api_webhook_deliveries").insert({
    merchant_id: merchantId,
    endpoint_id: data.endpoint_id,
    event_type: data.event_type,
    payload: data.payload,
    next_attempt_at: new Date().toISOString(),
  });
  if (error) throw new WebhookError("replay_failed", 500);
  incr("framique_webhook_delivery_total", { outcome: "replayed" });
  return { ok: true as const };
}

/** One test event so a merchant can prove their receiver before going live. */
export async function sendTestEvent(db: Client, merchantId: string, userId: string, id: string) {
  await requireAdminRole(db, merchantId, userId);
  await enforceRateLimit("dev.write", `${merchantId}:${userId}`);
  const dba = await admin();
  const { data: endpoint } = await dba
    .from("api_webhook_endpoints")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("id", id)
    .maybeSingle();
  if (!endpoint) throw new WebhookError("not_found", 404);
  const { data: delivery, error } = await dba
    .from("api_webhook_deliveries")
    .insert({
      merchant_id: merchantId,
      endpoint_id: id,
      event_type: "order.created",
      payload: { test: true, sent_by: userId, at: new Date().toISOString() } as unknown as Json,
      next_attempt_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error || !delivery) throw new WebhookError("test_failed", 500);
  return attemptDelivery(endpoint, delivery);
}

/* ------------------------------------------------------------------ */
/* Emit + deliver                                                       */
/* ------------------------------------------------------------------ */

/**
 * Fan an event out to every active subscribed endpoint. Never throws into the
 * caller's transaction: a webhook problem must not fail an order.
 */
export async function emitWebhook(
  merchantId: string,
  eventType: WebhookEvent,
  payload: Record<string, unknown>,
) {
  try {
    const db = await admin();
    const { data: endpoints } = await db
      .from("api_webhook_endpoints")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("status", "active")
      .contains("events", [eventType]);
    if (!endpoints?.length) return { queued: 0 };
    const now = new Date().toISOString();
    const body = {
      type: eventType,
      created_at: now,
      merchant_id: merchantId,
      data: payload,
    } as unknown as Json;
    await db.from("api_webhook_deliveries").insert(
      endpoints.map((e) => ({
        merchant_id: merchantId,
        endpoint_id: e.id,
        event_type: eventType,
        payload: body,
        next_attempt_at: now,
      })),
    );
    incr("framique_webhook_event_total", { event: eventType }, endpoints.length);
    return { queued: endpoints.length };
  } catch (err) {
    log("error", "webhook.emit_failed", { merchant_id: merchantId, event: eventType, err: String(err) });
    return { queued: 0 };
  }
}

type DeliveryRow = Database["public"]["Tables"]["api_webhook_deliveries"]["Row"];

async function attemptDelivery(endpoint: EndpointRow, delivery: DeliveryRow) {
  const db = await admin();
  const started = Date.now();
  const body = JSON.stringify(delivery.payload);
  const ts = Math.floor(started / 1000);
  const secrets = await activeSecrets(endpoint);
  if (!secrets.length) throw new WebhookError("secret_unreadable", 500);
  const signatures = await Promise.all(secrets.map((s) => computeSignature(s, ts, body)));

  let status: number | null = null;
  let error: string | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Framique-Webhooks/1.0",
        [SIGNATURE_HEADER]: signatureHeader(ts, signatures),
        "framique-event": delivery.event_type,
        "framique-delivery": delivery.id,
        "framique-attempt": String(delivery.attempt),
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    status = res.status;
    if (!res.ok) error = (await res.text().catch(() => "")).slice(0, 500) || `HTTP ${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 500) : "network_error";
  }

  const ms = Date.now() - started;
  const outcome = nextDeliveryState({ attempt: delivery.attempt, responseStatus: status });
  observe("framique_webhook_delivery_ms", ms, { outcome: outcome.status });
  incr("framique_webhook_delivery_total", { outcome: outcome.status });

  await db
    .from("api_webhook_deliveries")
    .update({
      status: outcome.status,
      attempt: delivery.attempt + (outcome.status === "delivered" ? 0 : 1),
      response_status: status,
      response_ms: ms,
      error,
      delivered_at: outcome.status === "delivered" ? new Date().toISOString() : null,
      next_attempt_at: outcome.nextAttemptAt ?? delivery.next_attempt_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", delivery.id);

  const failures = outcome.status === "delivered" ? 0 : endpoint.failure_count + 1;
  const endpointPatch: Database["public"]["Tables"]["api_webhook_endpoints"]["Update"] = {
    failure_count: failures,
    last_delivery_at: new Date().toISOString(),
    last_error: outcome.status === "delivered" ? null : error,
    updated_at: new Date().toISOString(),
  };
  // A receiver that is down for hundreds of events is disabling itself; pause
  // it so the queue stops growing and the merchant sees why.
  if (failures >= AUTO_PAUSE_FAILURES) {
    endpointPatch.status = "paused";
    log("warn", "webhook.endpoint_auto_paused", { endpoint: endpoint.id, failures });
  }
  await db.from("api_webhook_endpoints").update(endpointPatch).eq("id", endpoint.id);

  return { status: outcome.status, responseStatus: status, ms, error };
}

/**
 * Cron worker: claim due deliveries and attempt them. Bounded batch so a
 * backlog is drained over several ticks rather than blowing the request budget.
 */
export async function dispatchDueWebhooks(limit = 25) {
  const db = await admin();
  const now = new Date().toISOString();
  const { data: due } = await db
    .from("api_webhook_deliveries")
    .select("*")
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", now)
    .lt("attempt", MAX_ATTEMPTS + 1)
    .order("next_attempt_at", { ascending: true })
    .limit(limit);
  if (!due?.length) return { processed: 0, delivered: 0, failed: 0 };

  const endpointIds = Array.from(new Set(due.map((d) => d.endpoint_id)));
  const { data: endpoints } = await db
    .from("api_webhook_endpoints")
    .select("*")
    .in("id", endpointIds);
  const byId = new Map((endpoints ?? []).map((e) => [e.id, e]));

  let delivered = 0;
  let failed = 0;
  for (const delivery of due) {
    const endpoint = byId.get(delivery.endpoint_id);
    if (!endpoint || endpoint.status !== "active") {
      // Endpoint disabled mid-flight: park the row instead of hammering it.
      await db
        .from("api_webhook_deliveries")
        .update({ status: "dead", error: "endpoint_inactive", updated_at: now })
        .eq("id", delivery.id);
      continue;
    }
    try {
      const res = await attemptDelivery(endpoint, delivery);
      if (res.status === "delivered") delivered += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
      log("error", "webhook.attempt_crashed", { delivery: delivery.id, err: String(err) });
    }
  }
  return { processed: due.length, delivered, failed };
}
