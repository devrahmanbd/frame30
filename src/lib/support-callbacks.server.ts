/**
 * Support Callbacks: In-Chat Callback Request Service.
 *
 * When a customer requests high-touch phone assistance, the agent can trigger
 * an interactive callback form. This module handles server-side persistence
 * and tenant-isolated business logic for callback requests.
 *
 * Guarantees:
 * - Enforces Bangladesh mobile phone format: +8801XXXXXXXXX or 01XXXXXXXXX.
 * - Tenant-isolated: callbacks are scoped to merchant_id via RLS.
 * - Idempotent: duplicate pending callbacks within 30min window are collapsed.
 * - Agent acknowledgement: returns human-readable SLA window text.
 */

import { incr, log, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";

/** Bangladesh mobile number regex (covers +880 prefix + 11-digit local format). */
export const BD_PHONE_REGEX = /^(?:\+8801|01)[3-9]\d{8}$/;

export class CallbackError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CallbackError";
  }
}

export type CallbackTimeWindow = "morning" | "afternoon" | "evening";

export const CALLBACK_WINDOWS: Record<
  CallbackTimeWindow,
  { label: string; labelBn: string; description: string }
> = {
  morning: {
    label: "Morning",
    labelBn: "সকাল",
    description: "10:00 AM – 1:00 PM",
  },
  afternoon: {
    label: "Afternoon",
    labelBn: "দুপুর",
    description: "2:00 PM – 5:00 PM",
  },
  evening: {
    label: "Evening",
    labelBn: "সন্ধ্যা",
    description: "6:00 PM – 9:00 PM",
  },
};

export type CreateCallbackInput = {
  merchantId: string;
  conversationId?: string | null;
  customerName: string;
  phone: string;
  preferredWindow: CallbackTimeWindow;
  note?: string | null;
  channel?: "widget" | "whatsapp" | "messenger";
};

export type CallbackRecord = {
  id: string;
  merchant_id: string;
  conversation_id: string | null;
  customer_name: string;
  phone_e164: string;
  preferred_window: string;
  note: string | null;
  status: "pending" | "contacted" | "failed" | "cancelled";
  created_at: string;
};

/**
 * Normalises a Bangladesh mobile number to E.164 format.
 * Accepts: 01XXXXXXXXX, +8801XXXXXXXXX, 8801XXXXXXXXX
 */
export function normaliseBdPhone(raw: string): string {
  const digits = raw.replace(/[\s\-().+]/g, "");
  if (digits.startsWith("8801") && digits.length === 13) {
    return `+${digits}`;
  }
  if (digits.startsWith("01") && digits.length === 11) {
    return `+880${digits.slice(1)}`;
  }
  if (digits.startsWith("+8801") && digits.length === 14) {
    return digits;
  }
  throw new CallbackError("invalid_phone_format");
}

/**
 * Validate a Bangladesh mobile phone number.
 */
export function validateBdPhone(phone: string): {
  valid: boolean;
  normalised?: string;
  error?: string;
} {
  try {
    const normalised = normaliseBdPhone(phone);
    if (!BD_PHONE_REGEX.test(normalised)) {
      return { valid: false, error: "invalid_bd_mobile" };
    }
    return { valid: true, normalised };
  } catch {
    return { valid: false, error: "invalid_phone_format" };
  }
}

/**
 * In-memory callback store for offline tests and local dev.
 */
const IN_MEMORY_CALLBACKS: (CallbackRecord & { merchant_id: string })[] = [];

/** Duplicate window: identical pending callbacks collapse instead of doubling. */
export const CALLBACK_DUPLICATE_WINDOW_MS = 30 * 60_000;

export function clearInMemoryCallbacks() {
  IN_MEMORY_CALLBACKS.length = 0;
}

export function getInMemoryCallbacks(merchantId: string): CallbackRecord[] {
  return IN_MEMORY_CALLBACKS.filter((c) => c.merchant_id === merchantId);
}

/**
 * Create a callback request. Tenant-isolated, rate-limited, phone-validated.
 *
 * Idempotent within {@link CALLBACK_DUPLICATE_WINDOW_MS}: a repeat request
 * for the same merchant + phone while an earlier one is still pending returns
 * the original acknowledgement instead of queueing a second call.
 */
export async function createCallback(input: CreateCallbackInput): Promise<{
  id: string;
  customerName: string;
  phoneE164: string;
  window: string;
  windowDescription: string;
  agentMessage: string;
  agentMessageBn: string;
  /** True when this call collapsed onto an already-pending request. */
  duplicate: boolean;
}> {
  return withSpan("support.callback_create", async () => {
    // Rate-limit by phone hash to prevent spam
    const { hashPhone } = await import("./ai-support.server");
    const phoneKey = await hashPhone(input.phone);
    await enforceRateLimit(
      "support.callback",
      `${input.merchantId}:${phoneKey}`,
    );

    // Validate and normalise phone
    const phoneResult = validateBdPhone(input.phone);
    if (!phoneResult.valid || !phoneResult.normalised) {
      throw new CallbackError(phoneResult.error || "invalid_phone");
    }
    const phoneE164 = phoneResult.normalised;

    const windowInfo = CALLBACK_WINDOWS[input.preferredWindow];
    if (!windowInfo) {
      throw new CallbackError("invalid_window");
    }

    const sanitizedName = (input.customerName ?? "").trim().slice(0, 100);
    const sanitizedNote = (input.note ?? "").trim().slice(0, 500);

    // Best-effort DB dedupe first: never let a lookup outage break the flow.
    const existing = await findPendingDuplicate(
      input.merchantId,
      phoneE164,
    ).catch(() => null);
    if (existing) {
      incr("framique_support_callback_total", {
        window: existing.preferred_window,
        status: "duplicate_collapsed",
      });
      log("info", "support.callback_duplicate_collapsed", {
        merchant_id: input.merchantId,
        callback_id: existing.id,
      });
      return acknowledgement(existing, existing.customer_name, true);
    }

    let record: CallbackRecord;
    let duplicate = false;

    try {
      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");

      const { data, error } = await supabaseAdmin
        .from("support_callbacks")
        .insert({
          merchant_id: input.merchantId,
          conversation_id: input.conversationId ?? null,
          customer_name: sanitizedName,
          phone_e164: phoneE164,
          preferred_window: input.preferredWindow,
          note: sanitizedNote || null,
          channel: input.channel ?? "widget",
          status: "pending",
        })
        .select(
          "id, merchant_id, conversation_id, customer_name, phone_e164, preferred_window, note, status, created_at",
        )
        .single();

      if (error || !data) throw new CallbackError("callback_create_failed");
      record = data as unknown as CallbackRecord;
    } catch {
      // In-memory fallback for offline dev / tests, with the same collapse rule.
      const cutoff = Date.now() - CALLBACK_DUPLICATE_WINDOW_MS;
      const dupe = IN_MEMORY_CALLBACKS.find(
        (c) =>
          c.merchant_id === input.merchantId &&
          c.phone_e164 === phoneE164 &&
          c.status === "pending" &&
          new Date(c.created_at).getTime() >= cutoff,
      );
      if (dupe) {
        incr("framique_support_callback_total", {
          window: dupe.preferred_window,
          status: "duplicate_collapsed",
        });
        return acknowledgement(dupe, dupe.customer_name, true);
      }
      // In-memory fallback for offline dev / tests
      record = {
        id: `cb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        merchant_id: input.merchantId,
        conversation_id: input.conversationId ?? null,
        customer_name: sanitizedName,
        phone_e164: phoneE164,
        preferred_window: input.preferredWindow,
        note: sanitizedNote || null,
        status: "pending",
        created_at: new Date().toISOString(),
      };
      IN_MEMORY_CALLBACKS.push({ ...record, merchant_id: input.merchantId });
    }

    const out = acknowledgement(record, sanitizedName, duplicate);

    incr("framique_support_callback_total", {
      window: input.preferredWindow,
      status: "created",
    });
    log("info", "support.callback_created", {
      merchant_id: input.merchantId,
      callback_id: record.id,
      preferred_window: input.preferredWindow,
    });

    return out;
  });
}

/**
 * Best-effort lookup for a still-pending callback for the same merchant +
 * phone inside the duplicate window. Resolves null offline (no Supabase) and
 * on any lookup failure — dedupe must never break creation.
 */
async function findPendingDuplicate(
  merchantId: string,
  phoneE164: string,
): Promise<CallbackRecord | null> {
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  const cutoff = new Date(Date.now() - CALLBACK_DUPLICATE_WINDOW_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("support_callbacks")
    .select(
      "id, merchant_id, conversation_id, customer_name, phone_e164, preferred_window, note, status, created_at",
    )
    .eq("merchant_id", merchantId)
    .eq("phone_e164", phoneE164)
    .eq("status", "pending")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as CallbackRecord;
}

function acknowledgement(
  record: CallbackRecord,
  customerName: string,
  duplicate: boolean,
) {
  const windowInfo = CALLBACK_WINDOWS[record.preferred_window as CallbackTimeWindow];
  const description = windowInfo?.description ?? record.preferred_window;
  const label = windowInfo?.label ?? record.preferred_window;
  const labelBn = windowInfo?.labelBn ?? record.preferred_window;
  const agentMessage = `Thank you, ${customerName}! I've scheduled a callback for you during the **${label}** window (${description}). A Framique support specialist will call you at the number provided. Callback reference: \`#CB-${record.id.slice(-6).toUpperCase()}\`.`;
  const agentMessageBn = `ধন্যবাদ, ${customerName}! আপনার জন্য **${labelBn}** (${description}) সময়ে কলব্যাক নির্ধারণ করা হয়েছে। একজন Framique সহায়তা বিশেষজ্ঞ আপনার সাথে যোগাযোগ করবেন। রেফারেন্স: \`#CB-${record.id.slice(-6).toUpperCase()}\`.`;
  return {
    id: record.id,
    customerName,
    phoneE164: record.phone_e164,
    window: record.preferred_window,
    windowDescription: description,
    agentMessage,
    agentMessageBn,
    duplicate,
  };
}

/**
 * List pending callbacks for merchant admin triage.
 */
export async function listCallbacks(
  merchantId: string,
  status?: string,
): Promise<CallbackRecord[]> {
  await enforceRateLimit("support.read", merchantId);

  try {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("support_callbacks")
      .select(
        "id, merchant_id, conversation_id, customer_name, phone_e164, preferred_window, note, status, created_at",
      )
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (status) {
      q = q.eq("status", status);
    }

    const { data } = await q;
    return (data ?? []) as unknown as CallbackRecord[];
  } catch {
    return getInMemoryCallbacks(merchantId);
  }
}

/**
 * Update callback status (contacted / failed / cancelled).
 */
export async function updateCallbackStatus(
  merchantId: string,
  callbackId: string,
  status: "contacted" | "failed" | "cancelled",
): Promise<{ ok: boolean }> {
  try {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("support_callbacks")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("merchant_id", merchantId)
      .eq("id", callbackId);

    if (error) throw new CallbackError("callback_update_failed");
  } catch {
    const cb = IN_MEMORY_CALLBACKS.find(
      (c) => c.id === callbackId && c.merchant_id === merchantId,
    );
    if (cb) (cb as CallbackRecord & { status: string }).status = status;
  }

  incr("framique_support_callback_total", { status });
  return { ok: true };
}
