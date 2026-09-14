/**
 * Courier desk service.
 *
 * Ownership: create/label/pickup/advance for merchant shipments, webhook
 * intake, COD settlement and the platform sweep. Carrier specifics live in
 * `courier-adapters.server`; the durable state machine lives in SQL
 * (`courier_apply_event`), so a retry, a webhook and a manual click all take
 * the same monotonic path and never double-apply.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { withSpan, incr, log } from "./observability.server";
import { rateLimit, RateLimitError } from "./rate-limit.server";
import { persistQuote } from "./shipping-rates.server";
import {
  AdapterError,
  CARRIER_PROFILES,
  adapterFor,
  breakerState,
  verifySignature,
} from "./courier-adapters.server";

type Client = SupabaseClient<Database>;
export type ShipmentStatus = Database["public"]["Enums"]["shipment_status"];

const FLOW: Record<string, ShipmentStatus[]> = {
  created: ["pickup_scheduled", "failed_attempt"],
  pickup_scheduled: ["picked_up", "failed_attempt"],
  picked_up: ["in_transit", "failed_attempt"],
  in_transit: ["out_for_delivery", "failed_attempt"],
  out_for_delivery: ["delivered", "failed_attempt"],
  failed_attempt: ["out_for_delivery", "returned"],
  delivered: [],
  returned: [],
};

export class CourierError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "CourierError";
  }
}

export function nextStatuses(status: ShipmentStatus): ShipmentStatus[] {
  return FLOW[status] ?? [];
}

/* ------------------------------------------------------------- carriers */

export async function listCarriers(supabase: Client, merchantId: string) {
  const { data, error } = await supabase
    .from("carriers")
    .select("*")
    .eq("merchant_id", merchantId)
    .is("deleted_at", null)
    .order("sort_order");
  if (error) throw error;
  if (data && data.length > 0) {
    return data.map((c) => ({ ...c, breaker: breakerState(c.code) }));
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: seeded, error: seedError } = await supabaseAdmin
    .from("carriers")
    .insert(
      CARRIER_PROFILES.map((p) => ({
        merchant_id: merchantId,
        code: p.code,
        name: p.name,
        adapter: p.code,
        api_mode: "mock",
        supports_pickup: p.supportsPickup,
        supports_pudo: p.supportsPudo,
        cutoff_hour: p.cutoffHour,
        sort_order: p.sortOrder,
      })),
    )
    .select("*");
  if (seedError) throw seedError;
  return (seeded ?? []).map((c) => ({ ...c, breaker: breakerState(c.code) }));
}

export async function setCarrierMode(
  supabase: Client,
  merchantId: string,
  carrierId: string,
  patch: { enabled?: boolean; apiMode?: "mock" | "sandbox" | "live" },
) {
  const { data, error } = await supabase
    .from("carriers")
    .update({
      ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
      ...(patch.apiMode === undefined ? {} : { api_mode: patch.apiMode }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", carrierId)
    .eq("merchant_id", merchantId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Store per-merchant encrypted carrier credentials (e.g. SteadFast API key, Pathao client secret). */
export async function saveCarrierCredentials(
  supabase: Client,
  merchantId: string,
  carrierId: string,
  credentials: Record<string, unknown>,
  baseUrl?: string | null,
) {
  const { sealSecret } = await import("./webhook-secret.server");
  const sealed = await sealSecret(JSON.stringify(credentials));

  // Mask hints so plaintext is never saved in cleartext
  const hints: Record<string, string> = {};
  for (const [k, v] of Object.entries(credentials)) {
    if (typeof v === "string" && v.length > 4) {
      hints[k] = `…${v.slice(-4)}`;
    }
  }

  const { data, error } = await supabase
    .from("carriers")
    .update({
      config: {
        credentialsCiphertext: sealed,
        credentialHints: hints,
        baseUrl: baseUrl ?? null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", carrierId)
    .eq("merchant_id", merchantId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** Unseal encrypted carrier credentials from carrier config. */
export async function loadCarrierCredentials(
  config: unknown,
): Promise<Record<string, unknown> | null> {
  if (!config || typeof config !== "object") return null;
  const c = config as Record<string, unknown>;
  const sealed = c["credentialsCiphertext"];
  if (typeof sealed !== "string" || !sealed) return null;

  try {
    const { unsealSecret } = await import("./webhook-secret.server");
    const plain = await unsealSecret(sealed);
    if (!plain) return null;
    return JSON.parse(plain) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- events */

async function logEvent(
  merchantId: string,
  shipmentId: string,
  eventType: string,
  payload: Record<string, string | number | boolean | null> = {},
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("delivery_events")
    .insert({ merchant_id: merchantId, shipment_id: shipmentId, event_type: eventType, payload });
}

/** Every status change — manual or carrier-driven — funnels through here. */
async function applyEvent(args: {
  shipmentId: string;
  status: ShipmentStatus;
  source: string;
  eventId: string;
  occurredAt?: string;
  payload?: Record<string, unknown>;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("courier_apply_event", {
    _shipment_id: args.shipmentId,
    _status: args.status,
    _source: args.source,
    _event_id: args.eventId,
    _occurred_at: args.occurredAt ?? new Date().toISOString(),
    _payload: (args.payload ?? {}) as never,
  });
  if (error) throw error;
  const result = (data ?? {}) as { applied?: boolean; reason?: string; status?: ShipmentStatus };
  incr("framique_courier_event_total", {
    source: args.source,
    outcome: result.applied ? "applied" : (result.reason ?? "skipped"),
  });
  return result;
}

/* ----------------------------------------------------------- shipments */

export type ShipmentInput = {
  orderId?: string | null;
  posOrderId?: string | null;
  carrierCode: string;
  weightGrams: number;
  isCod: boolean;
  codAmountMinorInt: number;
  addressLine?: string | null;
  city?: string | null;
};

export async function createShipment(supabase: Client, merchantId: string, input: ShipmentInput) {
  return withSpan("courier.create_shipment", async () => {
    const verdict = await rateLimit("shipping.create", merchantId);
    if (!verdict.allowed) throw new RateLimitError("shipping.create", verdict.reset_at);

    const key = input.orderId ? "order_id" : "pos_order_id";
    const value = input.orderId ?? input.posOrderId;
    if (!value) throw new CourierError("shipment_no_order", "Please select an order");

    // Idempotent: one shipment per order, retries return the existing row.
    const { data: existing } = await supabase
      .from("carrier_shipments")
      .select("*")
      .eq("merchant_id", merchantId)
      .eq(key, value)
      .maybeSingle();
    if (existing) return { shipment: existing, adapterDown: false, quoted: null };

    const carriers = await listCarriers(supabase, merchantId);
    const carrier = carriers.find((c) => c.code === input.carrierCode && c.enabled !== false);
    if (!carrier) throw new CourierError("carrier_unknown", "Courier not found or disabled");

    const { quoteId, breakdown } = await persistQuote(supabase, merchantId, input.orderId ?? null, {
      carrierCode: carrier.code,
      city: input.city ?? null,
      weightGrams: input.weightGrams,
      isCod: input.isCod,
      codAmountMinorInt: input.isCod ? input.codAmountMinorInt : 0,
      orderTotalMinorInt: input.codAmountMinorInt,
    });

    let awb: string | null = null;
    let trackingUrl: string | null = null;
    let adapterDown = false;
    try {
      const credentials = await loadCarrierCredentials(carrier.config);
      const booked = await adapterFor(carrier.code, credentials).createShipment({
        reference: value,
        addressLine: input.addressLine ?? null,
        city: input.city ?? null,
        weightGrams: input.weightGrams,
        isCod: input.isCod,
        codAmountMinorInt: input.codAmountMinorInt,
      });
      awb = booked.awb;
      trackingUrl = booked.trackingUrl;
    } catch (err) {
      // Degrade, never drop: the parcel is recorded and the AWB is retryable.
      adapterDown = true;
      log("warn", "courier.book_failed", {
        carrier: carrier.code,
        code: err instanceof AdapterError ? err.code : "unknown",
      });
    }

    const { data, error } = await supabase
      .from("carrier_shipments")
      .insert({
        merchant_id: merchantId,
        order_id: input.orderId ?? null,
        pos_order_id: input.posOrderId ?? null,
        carrier_id: carrier.id,
        carrier_code: carrier.code,
        awb,
        tracking_url: trackingUrl,
        rate_minor_int: breakdown.totalMinorInt,
        quote_id: quoteId,
        quote_stale: breakdown.fallback,
        zone_id: breakdown.zoneId,
        is_cod: input.isCod,
        cod_amount_minor_int: input.isCod ? input.codAmountMinorInt : 0,
        weight_grams: input.weightGrams,
        address_line: input.addressLine ?? null,
        city: input.city ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    await logEvent(merchantId, data.id, "shipment.created", {
      carrier: carrier.code,
      ok: !adapterDown,
      zone: breakdown.zoneCode,
    });
    return { shipment: data, adapterDown, quoted: breakdown };
  });
}

async function requireShipment(supabase: Client, merchantId: string, shipmentId: string) {
  const { data, error } = await supabase
    .from("carrier_shipments")
    .select("*")
    .eq("id", shipmentId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new CourierError("shipment_missing", "Shipment not found");
  return data;
}

/** Re-books an AWB after a carrier outage. Safe to press repeatedly. */
export async function retryRate(supabase: Client, merchantId: string, shipmentId: string) {
  const shipment = await requireShipment(supabase, merchantId, shipmentId);
  if (shipment.awb) return shipment;
  const booked = await adapterFor(shipment.carrier_code).createShipment({
    reference: shipment.order_id ?? shipment.pos_order_id ?? shipment.id,
    addressLine: shipment.address_line,
    city: shipment.city,
    weightGrams: shipment.weight_grams,
    isCod: shipment.is_cod,
    codAmountMinorInt: shipment.cod_amount_minor_int,
  });
  const { data, error } = await supabase
    .from("carrier_shipments")
    .update({ awb: booked.awb, tracking_url: booked.trackingUrl })
    .eq("id", shipmentId)
    .eq("merchant_id", merchantId)
    .select("*")
    .single();
  if (error) throw error;
  await logEvent(merchantId, shipmentId, "shipment.rate_retried", { carrier: shipment.carrier_code });
  return data;
}

export async function schedulePickup(
  supabase: Client,
  merchantId: string,
  shipmentId: string,
  slotStartIso: string,
) {
  const verdict = await rateLimit("shipping.pickup", merchantId);
  if (!verdict.allowed) throw new RateLimitError("shipping.pickup", verdict.reset_at);
  const shipment = await requireShipment(supabase, merchantId, shipmentId);
  if (!shipment.awb) throw new CourierError("pickup_no_awb", "Book the AWB before requesting pickup");
  const start = new Date(slotStartIso);
  if (Number.isNaN(start.getTime())) {
    throw new CourierError("pickup_slot_invalid", "Choose a valid pickup time");
  }
  await adapterFor(shipment.carrier_code).schedulePickup(shipment.awb, start.toISOString());
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const { error } = await supabase
    .from("carrier_shipments")
    .update({ pickup_slot_start: start.toISOString(), pickup_slot_end: end.toISOString() })
    .eq("id", shipmentId)
    .eq("merchant_id", merchantId);
  if (error) throw error;
  await applyEvent({
    shipmentId,
    status: "pickup_scheduled",
    source: "merchant",
    eventId: `pickup:${shipmentId}:${start.toISOString()}`,
  });
  return requireShipment(supabase, merchantId, shipmentId);
}

export async function advanceShipment(
  supabase: Client,
  merchantId: string,
  shipmentId: string,
  target: ShipmentStatus,
  signatureText?: string | null,
) {
  const verdict = await rateLimit("shipping.advance", merchantId);
  if (!verdict.allowed) throw new RateLimitError("shipping.advance", verdict.reset_at);
  const shipment = await requireShipment(supabase, merchantId, shipmentId);
  if (!FLOW[shipment.status]?.includes(target)) {
    throw new CourierError("shipment_bad_transition", "Cannot transition to this status");
  }
  if (target === "delivered" && shipment.is_cod && !signatureText?.trim()) {
    throw new CourierError("signature_required", "Signature required for COD delivery");
  }
  if (signatureText?.trim()) {
    await supabase
      .from("carrier_shipments")
      .update({ signature_text: signatureText.trim().slice(0, 120) })
      .eq("id", shipmentId)
      .eq("merchant_id", merchantId);
  }
  const result = await applyEvent({
    shipmentId,
    status: target,
    source: "merchant",
    eventId: `manual:${shipmentId}:${target}:${shipment.status}`,
  });
  if (result.applied === false && result.reason === "regression") {
    throw new CourierError("shipment_bad_transition", "The courier already moved this parcel on");
  }
  if (target === "delivered" && shipment.is_cod) {
    await logEvent(merchantId, shipmentId, "cod.signature_captured", {});
  }
  return requireShipment(supabase, merchantId, shipmentId);
}

export async function cancelShipment(supabase: Client, merchantId: string, shipmentId: string) {
  const shipment = await requireShipment(supabase, merchantId, shipmentId);
  if (["delivered", "returned"].includes(shipment.status)) {
    throw new CourierError("shipment_final", "This parcel is already closed");
  }
  const { data, error } = await supabase
    .from("carrier_shipments")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", shipmentId)
    .eq("merchant_id", merchantId)
    .select("*")
    .single();
  if (error) throw error;
  await logEvent(merchantId, shipmentId, "shipment.cancelled", {});
  return data;
}

export async function generateLabel(supabase: Client, merchantId: string, shipmentId: string) {
  const verdict = await rateLimit("shipping.label", merchantId);
  if (!verdict.allowed) throw new RateLimitError("shipping.label", verdict.reset_at);
  const shipment = await requireShipment(supabase, merchantId, shipmentId);
  if (!shipment.awb) throw new CourierError("label_no_awb", "Cannot generate label without an AWB");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const labelUrl = adapterFor(shipment.carrier_code).labelUrl(shipment.awb);
  const { data, error } = await supabaseAdmin
    .from("courier_labels")
    .insert({ merchant_id: merchantId, shipment_id: shipmentId, label_url: labelUrl })
    .select("*")
    .single();
  if (error) throw error;
  await logEvent(merchantId, shipmentId, "shipment.label_printed", {});
  return data;
}

export async function listShipments(supabase: Client, merchantId: string) {
  const { data, error } = await supabase
    .from("carrier_shipments")
    .select("*, delivery_events(id, event_type, created_at)")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

/* ------------------------------------------------------------ COD desk */

export async function listCodSettlements(supabase: Client, merchantId: string) {
  const { data, error } = await supabase
    .from("cod_settlements")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

/** Reconciles carrier remittance; a mismatch is never auto-cleared. */
export async function reconcileCod(
  supabase: Client,
  merchantId: string,
  shipmentId: string,
  reportedMinorInt: number,
  reference: string | null,
) {
  const verdict = await rateLimit("shipping.cod", merchantId);
  if (!verdict.allowed) throw new RateLimitError("shipping.cod", verdict.reset_at);
  if (!Number.isInteger(reportedMinorInt) || reportedMinorInt < 0) {
    throw new CourierError("cod_amount_invalid", "Remitted amount must be a whole number");
  }
  await requireShipment(supabase, merchantId, shipmentId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("cod_reconcile", {
    _shipment_id: shipmentId,
    _reported_minor_int: reportedMinorInt,
    _reference: reference ?? undefined,
  });
  if (error) throw error;
  const result = (data ?? {}) as { state?: string; variance_minor_int?: number };
  incr("framique_cod_reconcile_total", { state: result.state ?? "unknown" });
  return result;
}

/* --------------------------------------------------------- webhook DLQ */

export async function listWebhookEvents(supabase: Client, merchantId: string) {
  const { data, error } = await supabase
    .from("courier_webhook_events")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("received_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export type IngestResult = { accepted: boolean; reason: string; status?: number };

/** Stable id for a rejected body so a carrier retry dedupes instead of piling up. */
function rejectId(carrierCode: string, rawBody: string): string {
  let hash = 2166136261;
  for (let i = 0; i < rawBody.length; i += 1) {
    hash ^= rawBody.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `reject_${carrierCode}_${(hash >>> 0).toString(16)}`;
}

/**
 * Parity with the payments gateway: a callback we refuse is still recorded,
 * never silently dropped, so the DLQ shows why and the merchant can replay.
 */
async function deadLetter(
  carrierCode: string,
  rawBody: string,
  reason: string,
  payload: Record<string, unknown>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("courier_dead_letter", {
    _carrier_code: carrierCode,
    _event_id: rejectId(carrierCode, rawBody),
    _reason: reason,
    _payload: payload as never,
  });
  if (error) log("error", "courier.dead_letter_failed", { carrier: carrierCode, reason });
  incr("framique_courier_webhook_total", { carrier: carrierCode, outcome: reason });
}

/**
 * Webhook intake. Signature first, then idempotent hand-off to SQL; an
 * unmatched AWB parks in the DLQ instead of 500-ing the carrier.
 */
export async function ingestWebhook(
  carrierCode: string,
  rawBody: string,
  signature: string | null,
): Promise<IngestResult> {
  return withSpan("courier.webhook", async () => {
    const verdict = await rateLimit("courier.webhook", `courier:${carrierCode}`);
    if (!verdict.allowed) return { accepted: false, reason: "rate_limited", status: 429 };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: carriers } = await supabaseAdmin
      .from("carriers")
      .select("id, merchant_id, code, webhook_secret")
      .eq("code", carrierCode)
      .limit(50);
    if (!carriers || carriers.length === 0) {
      await deadLetter(carrierCode, rawBody, "unknown_carrier", {});
      return { accepted: false, reason: "unknown_carrier", status: 404 };
    }

    const match = await (async () => {
      for (const c of carriers) {
        if (await verifySignature(c.webhook_secret, rawBody, signature)) return c;
      }
      return null;
    })();
    if (!match) {
      await deadLetter(carrierCode, rawBody, "bad_signature", {});
      return { accepted: false, reason: "invalid_signature", status: 401 };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      await deadLetter(carrierCode, rawBody, "invalid_json", {});
      return { accepted: false, reason: "invalid_json", status: 400 };
    }
    const event = adapterFor(carrierCode).parseEvent(payload);
    if (!event) {
      await deadLetter(carrierCode, rawBody, "unparsed", payload as Record<string, unknown>);
      return { accepted: false, reason: "unsupported_event", status: 202 };
    }

    const { data, error } = await supabaseAdmin.rpc("courier_ingest_event", {
      _carrier_code: carrierCode,
      _awb: event.awb,
      _event_id: event.eventId,
      _status: event.status,
      _occurred_at: event.occurredAt,
      _payload: event.raw as never,
    });
    if (error) {
      log("error", "courier.ingest_failed", { carrier: carrierCode, code: error.code });
      await deadLetter(carrierCode, rawBody, "ingest_failed", event.raw as Record<string, unknown>);
      return { accepted: false, reason: "ingest_failed", status: 500 };
    }
    const result = (data ?? {}) as { status?: string };
    incr("framique_courier_webhook_total", {
      carrier: carrierCode,
      outcome: result.status ?? "accepted",
    });
    return { accepted: true, reason: result.status ?? "accepted", status: 200 };
  });
}

/**
 * Merchant-triggered replay of a parked callback. Tenant scope is enforced in
 * SQL as well as here; rows that never matched a parcel of this merchant come
 * back as `unknown_awb` instead of touching another tenant's shipment.
 */
export async function replayWebhookEvent(
  supabase: Client,
  merchantId: string,
  eventId: string,
): Promise<{ outcome: string; reason: string | null }> {
  return withSpan("courier.webhook_replay", async () => {
    const verdict = await rateLimit("courier.replay", merchantId);
    if (!verdict.allowed) throw new RateLimitError("courier.replay", verdict.reset_at);

    const { data: row } = await supabase
      .from("courier_webhook_events")
      .select("id")
      .eq("id", eventId)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (!row) throw new CourierError("event_not_found", "Webhook event not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("courier_replay_event", {
      _id: eventId,
      _merchant_id: merchantId,
    });
    if (error) throw error;
    const result = (data ?? {}) as { outcome?: string; reason?: string };
    incr("framique_courier_replay_total", { outcome: result.outcome ?? "unknown" });
    log("info", "courier.webhook_replayed", {
      merchantId,
      eventId,
      outcome: result.outcome ?? "unknown",
    });
    return { outcome: result.outcome ?? "unknown", reason: result.reason ?? null };
  });
}

