/**
 * Courier adapter layer.
 *
 * One `CourierAdapter` contract behind every carrier (Steadfast, RedX, Pathao,
 * Paperfly, eCourier, Sundarban). Domain code never learns a carrier's name
 * beyond its code, so a swap or an outage never reaches the order machine.
 *
 * Every outbound call is wrapped in a timeout, bounded retry with jittered
 * backoff, and a per-carrier circuit breaker. Every inbound webhook is HMAC
 * verified with a constant-time compare before a single row is written.
 */
import { incr, log } from "./observability.server";

export type NormalizedStatus =
  | "pickup_scheduled"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed_attempt"
  | "returned";

export type QuoteRequest = {
  city: string | null;
  weightGrams: number;
  isCod: boolean;
  codAmountMinorInt: number;
};

export type ShipmentRequest = QuoteRequest & {
  reference: string;
  addressLine: string | null;
};

export type ShipmentResult = { awb: string; trackingUrl: string };

export type NormalizedEvent = {
  eventId: string;
  awb: string;
  status: NormalizedStatus;
  occurredAt: string;
  raw: Record<string, unknown>;
};

export type CarrierProfile = {
  code: string;
  name: string;
  nameBn: string;
  supportsPickup: boolean;
  supportsPudo: boolean;
  cutoffHour: number;
  sortOrder: number;
};

export const CARRIER_PROFILES: CarrierProfile[] = [
  {
    code: "steadfast",
    name: "Steadfast",
    nameBn: "স্টেডফাস্ট",
    supportsPickup: true,
    supportsPudo: false,
    cutoffHour: 17,
    sortOrder: 10,
  },
  {
    code: "redx",
    name: "RedX",
    nameBn: "রেডএক্স",
    supportsPickup: true,
    supportsPudo: true,
    cutoffHour: 16,
    sortOrder: 20,
  },
  {
    code: "pathao",
    name: "Pathao Courier",
    nameBn: "পাঠাও কুরিয়ার",
    supportsPickup: true,
    supportsPudo: true,
    cutoffHour: 18,
    sortOrder: 30,
  },
  {
    code: "paperfly",
    name: "Paperfly",
    nameBn: "পেপারফ্লাই",
    supportsPickup: true,
    supportsPudo: false,
    cutoffHour: 15,
    sortOrder: 40,
  },
  {
    code: "ecourier",
    name: "eCourier",
    nameBn: "ইকুরিয়ার",
    supportsPickup: true,
    supportsPudo: true,
    cutoffHour: 16,
    sortOrder: 50,
  },
  {
    code: "sundarban",
    name: "Sundarban Courier",
    nameBn: "সুন্দরবন কুরিয়ার",
    supportsPickup: false,
    supportsPudo: true,
    cutoffHour: 14,
    sortOrder: 60,
  },
];

/** Carrier vocabulary → platform vocabulary. Unknown words are never guessed. */
const STATUS_WORDS: Record<string, NormalizedStatus> = {
  pickup_scheduled: "pickup_scheduled",
  pickup_requested: "pickup_scheduled",
  pickup_assigned: "pickup_scheduled",
  picked_up: "picked_up",
  pickup_done: "picked_up",
  collected: "picked_up",
  in_transit: "in_transit",
  intransit: "in_transit",
  on_the_way: "in_transit",
  at_hub: "in_transit",
  out_for_delivery: "out_for_delivery",
  ofd: "out_for_delivery",
  delivery_started: "out_for_delivery",
  delivered: "delivered",
  delivery_done: "delivered",
  cod_collected: "delivered",
  failed_attempt: "failed_attempt",
  delivery_failed: "failed_attempt",
  hold: "failed_attempt",
  returned: "returned",
  return_completed: "returned",
  rto: "returned",
};

export function normalizeStatusWord(word: unknown): NormalizedStatus | null {
  if (typeof word !== "string") return null;
  const key = word.toLowerCase().trim().replace(/[\s-]+/g, "_");
  return STATUS_WORDS[key] ?? null;
}

export class AdapterError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

/* ------------------------------------------------------------ resilience */

type Breaker = { failures: number; openedAt: number; lastFailure: number };
const breakers = new Map<string, Breaker>();
const OPEN_MS = 30_000;
const FAILURE_WINDOW_MS = 60_000;
const FAILURE_THRESHOLD = 3;

export function breakerState(code: string): "closed" | "open" | "half_open" {
  const b = breakers.get(code);
  if (!b || b.failures < FAILURE_THRESHOLD) return "closed";
  const since = Date.now() - b.openedAt;
  if (since < OPEN_MS) return "open";
  return "half_open";
}

function recordFailure(code: string) {
  const now = Date.now();
  const b = breakers.get(code) ?? { failures: 0, openedAt: now, lastFailure: now };
  if (now - b.lastFailure > FAILURE_WINDOW_MS) b.failures = 0;
  b.failures += 1;
  b.lastFailure = now;
  if (b.failures >= FAILURE_THRESHOLD) b.openedAt = now;
  breakers.set(code, b);
  incr("framique_courier_breaker_total", { carrier: code, state: breakerState(code) });
}

function recordSuccess(code: string) {
  breakers.delete(code);
}

/** Test hook — the breaker is per-isolate state, so suites must reset it. */
export function resetBreakers() {
  breakers.clear();
}

async function withTimeout<T>(ms: number, work: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new AdapterError("adapter_timeout", "Courier timed out")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function callCarrier<T>(
  code: string,
  op: string,
  work: () => Promise<T>,
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<T> {
  if (breakerState(code) === "open") {
    incr("framique_courier_call_total", { carrier: code, op, outcome: "breaker_open" });
    throw new AdapterError("adapter_unavailable", "Courier service is temporarily unavailable");
  }
  const retries = opts.retries ?? 2;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const value = await withTimeout(opts.timeoutMs ?? 4000, work);
      recordSuccess(code);
      incr("framique_courier_call_total", { carrier: code, op, outcome: "ok" });
      return value;
    } catch (err) {
      lastError = err;
      recordFailure(code);
      incr("framique_courier_call_total", { carrier: code, op, outcome: "error" });
      if (attempt === retries) break;
      const backoff = 120 * 2 ** attempt + Math.floor(Math.random() * 80);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  log("warn", "courier.call_failed", { carrier: code, op });
  if (lastError instanceof AdapterError) throw lastError;
  throw new AdapterError("adapter_unavailable", "Courier service is temporarily unavailable");
}

/* --------------------------------------------------------------- crypto */

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySignature(
  secret: string,
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  if (!signature) return false;
  const provided = signature.replace(/^sha256=/i, "").trim().toLowerCase();
  return constantTimeEqual(await hmacHex(secret, rawBody), provided);
}

/* -------------------------------------------------------------- adapter */

export interface CourierAdapter {
  readonly code: string;
  createShipment(req: ShipmentRequest): Promise<ShipmentResult>;
  schedulePickup(awb: string, slotStart: string): Promise<{ scheduled: true }>;
  labelUrl(awb: string): string;
  parseEvent(payload: unknown): NormalizedEvent | null;
}

/**
 * Sandbox transport. Deterministic AWBs, a documented failure code and a
 * carrier-shaped payload parser — the live transports replace `transport`
 * only, never the contract.
 */
function makeAdapter(profile: CarrierProfile, credentials?: Record<string, unknown> | null): CourierAdapter {
  return {
    code: profile.code,
    async createShipment(req) {
      return callCarrier(profile.code, "create_shipment", async () => {
        if (profile.code === "down") throw new AdapterError("adapter_down", "carrier down");
        const seed = credentials && Object.keys(credentials).length > 0
          ? `${profile.code}:${JSON.stringify(credentials)}:${req.reference}`
          : `${profile.code}:${req.reference}`;
        const digest = await hmacHex("framique-sandbox", seed);
        const awb = `${profile.code.slice(0, 3).toUpperCase()}${digest.slice(0, 10).toUpperCase()}`;
        return { awb, trackingUrl: `https://track.${profile.code}.example/${awb}` };
      });
    },
    async schedulePickup(awb, slotStart) {
      return callCarrier(profile.code, "schedule_pickup", async () => {
        if (!profile.supportsPickup) {
          throw new AdapterError("pickup_unsupported", "This courier does not do doorstep pickup");
        }
        if (!awb || !slotStart) throw new AdapterError("pickup_invalid", "Pickup slot is required");
        return { scheduled: true as const };
      });
    },
    labelUrl(awb) {
      return `https://labels.${profile.code}.example/${awb}.pdf`;
    },
    parseEvent(payload) {
      if (!payload || typeof payload !== "object") return null;
      const p = payload as Record<string, unknown>;
      const eventId = String(p["event_id"] ?? p["id"] ?? "").trim();
      const awb = String(p["awb"] ?? p["consignment_id"] ?? p["tracking_code"] ?? "").trim();
      const status = normalizeStatusWord(p["status"] ?? p["event"] ?? p["delivery_status"]);
      if (!eventId || !awb || !status) return null;
      const occurredRaw = p["occurred_at"] ?? p["updated_at"] ?? p["timestamp"];
      const occurredAt =
        typeof occurredRaw === "string" && !Number.isNaN(Date.parse(occurredRaw))
          ? new Date(occurredRaw).toISOString()
          : new Date().toISOString();
      return { eventId, awb, status, occurredAt, raw: p };
    },
  };
}

const ADAPTERS = new Map<string, CourierAdapter>(
  CARRIER_PROFILES.map((p) => [p.code, makeAdapter(p)]),
);

/** Unknown carrier codes still resolve, so legacy rows never crash the desk. */
export function adapterFor(code: string, credentials?: Record<string, unknown> | null): CourierAdapter {
  if (credentials && Object.keys(credentials).length > 0) {
    const profile = CARRIER_PROFILES.find((p) => p.code === code) ?? {
      code,
      name: code,
      nameBn: code,
      supportsPickup: true,
      supportsPudo: false,
      cutoffHour: 16,
      sortOrder: 900,
    };
    return makeAdapter(profile, credentials);
  }

  const known = ADAPTERS.get(code);
  if (known) return known;
  const fallbackProfile: CarrierProfile = {
    code,
    name: code,
    nameBn: code,
    supportsPickup: true,
    supportsPudo: false,
    cutoffHour: 16,
    sortOrder: 900,
  };
  const made = makeAdapter(fallbackProfile);
  ADAPTERS.set(code, made);
  return made;
}
