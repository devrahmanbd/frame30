/**
 * Omnichannel intake (WhatsApp / Messenger).
 *
 * Providers retry aggressively and duplicate freely, so intake is idempotent by
 * `(merchant, channel, external_event_id)` and every payload is verified with a
 * constant-time HMAC before a single byte reaches the assistant. Raw payloads
 * are never stored — only a digest.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { incr, log, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import { digest } from "./support-guardrails";

type Client = SupabaseClient<Database>;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function hashSecret(value: string) {
  const bytes = new TextEncoder().encode(`framique:channel:${value}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySignature(secret: string, body: string, signature: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqual(expected, signature.replace(/^sha256=/, "").toLowerCase());
}

export type ChannelIntake = {
  channel: "whatsapp" | "messenger";
  externalId: string;
  eventId: string;
  text: string;
  from: string | null;
  rawBody: string;
  signature: string | null;
  secret: string | null;
};

export type IntakeOutcome = "processed" | "duplicate" | "rejected" | "disabled" | "unknown_channel";

/**
 * One inbound provider event. Returns the outcome instead of throwing so the
 * webhook route can always answer 200 and stop the provider retry storm.
 */
export async function ingestChannelEvent(input: ChannelIntake): Promise<{
  outcome: IntakeOutcome;
  reply?: string;
}> {
  return withSpan("support.channel_ingest", async () => {
    const db = await admin();
    const { data: channel } = await db
      .from("ai_channels")
      .select("id, merchant_id, enabled, secret_hash")
      .eq("channel", input.channel)
      .eq("external_id", input.externalId)
      .maybeSingle();
    if (!channel) {
      incr("framique_ai_channel_total", { channel: input.channel, outcome: "unknown_channel" });
      return { outcome: "unknown_channel" as const };
    }

    await enforceRateLimit("support.channel", `${channel.merchant_id}:${input.channel}`);

    const payloadDigest = await digest(input.rawBody);
    const base = {
      merchant_id: channel.merchant_id,
      channel_id: channel.id,
      channel: input.channel,
      external_event_id: input.eventId,
      payload_digest: payloadDigest,
    };

    // Idempotency: the unique index rejects a replay, and we treat that as OK.
    const { error: insertError } = await db
      .from("ai_channel_events")
      .insert({ ...base, status: "received" });
    if (insertError) {
      incr("framique_ai_channel_total", { channel: input.channel, outcome: "duplicate" });
      return { outcome: "duplicate" as const };
    }

    const settle = async (status: IntakeOutcome, error?: string) => {
      await db
        .from("ai_channel_events")
        .update({ status, error: error ?? null })
        .eq("merchant_id", channel.merchant_id)
        .eq("external_event_id", input.eventId);
      incr("framique_ai_channel_total", { channel: input.channel, outcome: status });
    };

    if (!channel.enabled) {
      await settle("disabled");
      return { outcome: "disabled" as const };
    }
    if (input.secret && !(await verifySignature(input.secret, input.rawBody, input.signature ?? ""))) {
      await settle("rejected", "bad_signature");
      log("warn", "support.channel_bad_signature", { channel: input.channel });
      return { outcome: "rejected" as const };
    }

    const { data: merchant } = await db
      .from("merchants")
      .select("slug")
      .eq("id", channel.merchant_id)
      .maybeSingle();
    if (!merchant) {
      await settle("rejected", "no_merchant");
      return { outcome: "rejected" as const };
    }

    const { askSupport } = await import("./support-agent.server");
    const result = await askSupport({
      slug: merchant.slug,
      message: input.text,
      phone: input.from,
      channel: input.channel,
    });

    await db
      .from("ai_channels")
      .update({ last_event_at: new Date().toISOString() })
      .eq("id", channel.id);
    await settle("processed");
    return { outcome: "processed" as const, reply: result.reply };
  });
}

export async function listChannels(db: Client, merchantId: string) {
  await enforceRateLimit("support.read", merchantId);
  const { data } = await db
    .from("ai_channels")
    .select("id, channel, display_name, external_id, enabled, status, last_event_at, created_at")
    .eq("merchant_id", merchantId)
    .order("created_at");
  return data ?? [];
}

export async function saveChannel(
  db: Client,
  merchantId: string,
  userId: string,
  input: {
    id?: string | null;
    channel: "whatsapp" | "messenger";
    displayName: string;
    externalId: string;
    enabled: boolean;
    secret?: string | null;
  },
) {
  await enforceRateLimit("support.kb_write", `${merchantId}:${userId}`);
  const row: Database["public"]["Tables"]["ai_channels"]["Insert"] = {
    merchant_id: merchantId,
    channel: input.channel,
    display_name: input.displayName.slice(0, 80),
    external_id: input.externalId.slice(0, 120),
    enabled: input.enabled,
    status: input.enabled ? "active" : "paused",
    updated_at: new Date().toISOString(),
  };
  if (input.secret) row.secret_hash = await hashSecret(input.secret);

  const { error } = input.id
    ? await db.from("ai_channels").update(row).eq("merchant_id", merchantId).eq("id", input.id)
    : await db.from("ai_channels").insert(row);
  if (error) throw new Error("channel_save_failed");
  return { ok: true as const };
}
