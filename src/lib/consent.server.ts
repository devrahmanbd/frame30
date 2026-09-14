/**
 * Consent runtime (BUILD 2.6, `[A]`).
 *
 * Every marketing channel decision goes through here. Consent is stored twice
 * on purpose: `consent_events` is the append-only ledger (who, when, source,
 * reason) and `customer_consents` is the current state the send path reads.
 * Both are written by the `consent_record` routine in one transaction, so a
 * state row can never exist without the event that produced it.
 *
 * Opt-out is honoured on every channel: `channelAudience` filters a recipient
 * list against withdrawn consent before a single message is queued.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { incr, log, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";

type Client = SupabaseClient<Database>;
export type ConsentChannel = Database["public"]["Enums"]["consent_channel"];
export type ConsentPurpose = Database["public"]["Enums"]["consent_purpose"];

export class ConsentError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ConsentError";
  }
}

/**
 * Stable, non-reversible subject key. The ledger can be joined on a contact
 * without storing that contact a second time next to the audit trail.
 */
export async function subjectHash(merchantId: string, contact: string): Promise<string> {
  const value = `${merchantId}:${contact.trim().toLowerCase()}`;
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type ConsentInput = {
  merchantId: string;
  channel: ConsentChannel;
  purpose: ConsentPurpose;
  granted: boolean;
  source: string;
  subscriberId?: string | null;
  customerId?: string | null;
  sessionToken?: string | null;
  contact?: string | null;
  actor?: string | null;
  reason?: string | null;
};

/** Appends the ledger row and moves the state row. Never partial. */
export async function recordConsent(input: ConsentInput) {
  return withSpan("consent.record", async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hash = input.contact ? await subjectHash(input.merchantId, input.contact) : null;
    const { error } = await (
      supabaseAdmin as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
      }
    ).rpc("consent_record", {
      _merchant_id: input.merchantId,
      _channel: input.channel,
      _purpose: input.purpose,
      _granted: input.granted,
      _source: input.source,
      _subscriber_id: input.subscriberId ?? null,
      _customer_id: input.customerId ?? null,
      _session_token: input.sessionToken ?? null,
      _subject_hash: hash,
      _actor: input.actor ?? null,
      _reason: input.reason ?? null,
    });
    if (error) {
      incr("framique_consent_total", { channel: input.channel, outcome: "error" });
      throw new ConsentError("consent_write_failed", (error as { message?: string }).message ?? "Consent write failed");
    }
    incr("framique_consent_total", {
      channel: input.channel,
      purpose: input.purpose,
      outcome: input.granted ? "granted" : "withdrawn",
    });
    log("info", "consent.recorded", {
      merchantId: input.merchantId,
      channel: input.channel,
      purpose: input.purpose,
      granted: input.granted,
      source: input.source,
    });
    return { ok: true };
  });
}

export type Recipient = { id: string; email?: string | null; phone?: string | null };

export type AudienceVerdict<T extends Recipient> = {
  allowed: T[];
  suppressed: { id: string; reason: "consent_withdrawn" | "no_contact" }[];
};

/**
 * Filters a recipient list by stored consent for one channel + purpose.
 * Withdrawal always wins: an explicit `granted = false` row suppresses the
 * recipient even when a legacy subscriber flag still says otherwise.
 */
export async function channelAudience<T extends Recipient>(
  db: Client,
  merchantId: string,
  channel: ConsentChannel,
  purpose: ConsentPurpose,
  recipients: T[],
): Promise<AudienceVerdict<T>> {
  const { data } = await db
    .from("customer_consents")
    .select("subscriber_id, subject_hash, granted")
    .eq("merchant_id", merchantId)
    .eq("channel", channel)
    .eq("purpose", purpose)
    .eq("granted", false);

  const withdrawnIds = new Set((data ?? []).map((r) => r.subscriber_id).filter(Boolean) as string[]);
  const withdrawnHashes = new Set((data ?? []).map((r) => r.subject_hash).filter(Boolean) as string[]);

  const allowed: T[] = [];
  const suppressed: AudienceVerdict<T>["suppressed"] = [];
  for (const r of recipients) {
    const contact = channel === "sms" ? r.phone : r.email;
    if (!contact) {
      suppressed.push({ id: r.id, reason: "no_contact" });
      continue;
    }
    if (withdrawnIds.has(r.id)) {
      suppressed.push({ id: r.id, reason: "consent_withdrawn" });
      continue;
    }
    if (withdrawnHashes.size > 0) {
      const hash = await subjectHash(merchantId, contact);
      if (withdrawnHashes.has(hash)) {
        suppressed.push({ id: r.id, reason: "consent_withdrawn" });
        continue;
      }
    }
    allowed.push(r);
  }
  incr("framique_consent_audience_total", { channel, purpose, outcome: "allowed" }, allowed.length);
  incr("framique_consent_audience_total", { channel, purpose, outcome: "suppressed" }, suppressed.length);
  return { allowed, suppressed };
}

export async function consentLedger(db: Client, merchantId: string, limit = 100) {
  await enforceRateLimit("consent.read", merchantId);
  const { data, error } = await db
    .from("consent_events")
    .select("id, channel, purpose, granted, source, reason, created_at, subscriber_id")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new ConsentError("consent_read_failed", error.message);
  return data ?? [];
}

/** Opt-out from a public surface (unsubscribe link, preference centre). */
export async function withdrawAllChannels(
  merchantId: string,
  subscriberId: string,
  contact: string | null,
  source: string,
) {
  const channels: ConsentChannel[] = ["email", "sms"];
  const purposes: ConsentPurpose[] = ["marketing", "cart_recovery", "stock_alerts"];
  for (const channel of channels) {
    for (const purpose of purposes) {
      await recordConsent({
        merchantId,
        channel,
        purpose,
        granted: false,
        source,
        subscriberId,
        contact,
        reason: "shopper_opt_out",
      });
    }
  }
  return { ok: true };
}
