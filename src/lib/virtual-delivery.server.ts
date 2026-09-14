/**
 * Virtual product delivery service layer — §4.3.
 *
 * Digital codes are bearer value, so this module treats every code as cash in a
 * drawer:
 *
 *  - Codes are encrypted at rest (AES-GCM, server-only key). Nothing but this
 *    file's reveal path can turn a stored row back into a redeemable string,
 *    and RLS blocks reading `virtual_codes` through the Data API entirely.
 *  - Allocation is a compare-and-swap on the row's state, so two concurrent
 *    checkouts can never be handed the same key.
 *  - Reservations expire. A checkout abandoned at the payment page returns its
 *    key to stock instead of stranding inventory forever.
 *  - Delivery is a queue with bounded retries, per-attempt backoff, and a lock
 *    so two workers cannot send the same code twice.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { CodeState } from "./virtual-delivery";
import {
  assertCodeTransition,
  classifyDeliveryError,
  explainDelivery,
  isDeliverableEmail,
  MAX_DELIVERY_ATTEMPTS,
  maskCode,
  nextAttemptDelayMs,
  normalizeBdMsisdn,
  parseCodeBatch,
  shouldRetry,
  stockHealth,
  type DeliveryChannel,
} from "./virtual-delivery";
import { sealSecret, unsealSecret } from "./webhook-secret.server";
import { enforceRateLimit } from "./rate-limit.server";
import { incr, log, withSpan } from "./observability.server";
import { audit, GrowthError } from "./loyalty.server";

type Client = SupabaseClient<Database>;

function fail(code: string, message: string): never {
  incr("virtual.error", { code });
  throw new GrowthError(code, message);
}

const RESERVATION_MINUTES = 30;

/**
 * Fingerprint for duplicate detection only. Salted per merchant so the same
 * supplier batch uploaded by two stores does not collide, and one-way so the
 * fingerprint column can never be walked back to a code.
 */
async function fingerprint(merchantId: string, code: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`vcode:${merchantId}:${code}`),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ------------------------------------------------------------------ inventory */

export async function loadPools(db: Client, merchantId: string) {
  await enforceRateLimit("growth.read", merchantId);
  const { data: pools } = await db
    .from("virtual_code_pools")
    .select("*, products(title)")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(100);

  const ids = (pools ?? []).map((p) => p.id);
  if (ids.length === 0) return [];

  // One grouped read instead of N per-pool counts: the desk is opened often and
  // a merchant with 80 products should not fan out 80 queries.
  const { data: codes } = await db
    .from("virtual_codes")
    .select("pool_id, state, delivered_at")
    .in("pool_id", ids)
    .limit(20_000);

  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  return (pools ?? []).map((pool) => {
    const rows = (codes ?? []).filter((c) => c.pool_id === pool.id);
    const available = rows.filter((c) => c.state === "available").length;
    const reserved = rows.filter((c) => c.state === "reserved").length;
    const soldLast7Days = rows.filter((c) => c.delivered_at && c.delivered_at >= weekAgo).length;
    return {
      ...pool,
      productTitle: (pool.products as unknown as { title: string } | null)?.title ?? "Product",
      delivered: rows.filter((c) => c.state === "delivered").length,
      health: stockHealth({
        available,
        reserved,
        soldLast7Days,
        lowStockThreshold: pool.low_stock_threshold,
      }),
    };
  });
}

export async function savePool(
  db: Client,
  merchantId: string,
  actor: string,
  input: {
    id?: string;
    productId: string;
    variantId?: string | null;
    name: string;
    instructions?: string | null;
    instructionsBn?: string | null;
    lowStockThreshold: number;
    autoDeliver: boolean;
    channels: DeliveryChannel[];
  },
) {
  await enforceRateLimit("growth.write", merchantId);
  const channels = input.channels.filter((c) => c === "email" || c === "sms");
  if (channels.length === 0) fail("no_channel", "Pick at least one way to send the code");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;

  const payload = {
    merchant_id: merchantId,
    product_id: input.productId,
    variant_id: input.variantId ?? null,
    name: input.name.trim().slice(0, 80) || "Codes",
    instructions: input.instructions?.slice(0, 2000) ?? null,
    instructions_bn: input.instructionsBn?.slice(0, 2000) ?? null,
    low_stock_threshold: Math.min(10_000, Math.max(0, Math.trunc(input.lowStockThreshold))),
    auto_deliver: input.autoDeliver,
    channels,
    updated_at: new Date().toISOString(),
  };

  const query = input.id
    ? admin.from("virtual_code_pools").update(payload).eq("id", input.id).eq("merchant_id", merchantId)
    : admin.from("virtual_code_pools").upsert(payload, { onConflict: "merchant_id,product_id,variant_id" });
  const { data, error } = await query.select("*").maybeSingle();
  if (error) fail("pool_save_failed", "Could not save this digital product");

  await audit(admin, merchantId, "virtual", actor, input.id ? "pool.update" : "pool.create", data?.id ?? null, {
    after: payload as unknown as Record<string, unknown>,
  });
  return data;
}

/**
 * Imports a supplier batch. Returns a full report — accepted, duplicates inside
 * the file, duplicates already in stock, and malformed rows with line numbers —
 * because a silent partial import is how merchants end up overselling.
 */
export async function importCodes(
  db: Client,
  merchantId: string,
  actor: string,
  args: { poolId: string; raw: string; costMinor?: number },
) {
  return withSpan("virtual.import", async () => {
    await enforceRateLimit("virtual.import", merchantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Client;

    const { data: pool } = await admin
      .from("virtual_code_pools")
      .select("id, code_ttl_days")
      .eq("id", args.poolId)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (!pool) fail("pool_not_found", "That digital product no longer exists");

    const parsed = parseCodeBatch(args.raw);
    if (parsed.codes.length === 0) {
      return { imported: 0, duplicatesInFile: parsed.duplicatesInFile, duplicatesInStock: 0, rejected: parsed.rejected };
    }

    const batchId = crypto.randomUUID();
    const expiresAt = pool.code_ttl_days
      ? new Date(Date.now() + pool.code_ttl_days * 86_400_000).toISOString()
      : null;

    const rows = await Promise.all(
      parsed.codes.map(async (code) => ({
        merchant_id: merchantId,
        pool_id: pool.id,
        code_sealed: await sealSecret(code),
        code_fingerprint: await fingerprint(merchantId, code),
        code_mask: maskCode(code),
        batch_id: batchId,
        expires_at: expiresAt,
        cost_minor: Math.max(0, Math.trunc(args.costMinor ?? 0)),
      })),
    );

    // `ignoreDuplicates` turns a re-uploaded supplier file into a no-op rather
    // than an error the merchant has to interpret.
    const { data: inserted, error } = await admin
      .from("virtual_codes")
      .upsert(rows, { onConflict: "merchant_id,code_fingerprint", ignoreDuplicates: true })
      .select("id");
    if (error) fail("import_failed", "Could not import these codes");

    const imported = inserted?.length ?? 0;
    await audit(admin, merchantId, "virtual", actor, "codes.import", pool.id, {
      after: {
        batchId,
        imported,
        duplicatesInFile: parsed.duplicatesInFile,
        duplicatesInStock: parsed.codes.length - imported,
        rejected: parsed.rejected.length,
      },
    });
    incr("virtual.codes_imported", {}, imported);
    return {
      imported,
      batchId,
      duplicatesInFile: parsed.duplicatesInFile,
      duplicatesInStock: parsed.codes.length - imported,
      rejected: parsed.rejected,
    };
  });
}

/* ----------------------------------------------------------------- allocation */

/**
 * Reserves one code for a checkout. The update is guarded on
 * `state = 'available'`, so the database — not this process — arbitrates who
 * gets the key when two shoppers check out at the same instant.
 */
export async function reserveCode(merchantId: string, poolId: string, orderId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: candidate } = await admin
      .from("virtual_codes")
      .select("id, state")
      .eq("merchant_id", merchantId)
      .eq("pool_id", poolId)
      .eq("state", "available")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!candidate) {
      incr("virtual.out_of_stock");
      fail("out_of_stock", explainDelivery("out_of_stock"));
    }

    assertCodeTransition("available", "reserved");
    const now = new Date();
    const { data: claimed } = await admin
      .from("virtual_codes")
      .update({
        state: "reserved",
        order_id: orderId,
        reserved_at: now.toISOString(),
        reserved_until: new Date(now.getTime() + RESERVATION_MINUTES * 60_000).toISOString(),
      })
      .eq("id", candidate.id)
      .eq("state", "available")
      .select("id")
      .maybeSingle();
    if (claimed) {
      incr("virtual.code_reserved");
      return { codeId: claimed.id };
    }
  }
  return fail("allocation_contention", "Too many people are buying this right now. Try again.");
}

export async function releaseReservation(codeId: string, reason: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;
  const { data } = await admin
    .from("virtual_codes")
    .update({ state: "available", order_id: null, reserved_at: null, reserved_until: null })
    .eq("id", codeId)
    .eq("state", "reserved")
    .select("id")
    .maybeSingle();
  if (data) {
    incr("virtual.reservation_released", { reason });
  }
  return { released: Boolean(data) };
}

/** Returns keys stranded by abandoned checkouts to stock. */
export async function sweepExpiredReservations(admin: Client, limit = 500) {
  const { data } = await admin
    .from("virtual_codes")
    .update({ state: "available", order_id: null, reserved_at: null, reserved_until: null })
    .eq("state", "reserved")
    .lt("reserved_until", new Date().toISOString())
    .select("id")
    .limit(limit);
  incr("virtual.reservations_expired", {}, data?.length ?? 0);
  return { released: data?.length ?? 0 };
}

/**
 * Marks a reserved code as sold and queues delivery. Paying twice for the same
 * order returns the existing delivery instead of allocating a second key.
 */
export async function fulfilOrderItem(
  db: Client,
  merchantId: string,
  args: {
    poolId: string;
    orderId: string;
    orderItemId?: string | null;
    customerId?: string | null;
    email?: string | null;
    phone?: string | null;
  },
) {
  return withSpan("virtual.fulfil", async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Client;

    const { data: existing } = await admin
      .from("virtual_codes")
      .select("id, state")
      .eq("merchant_id", merchantId)
      .eq("pool_id", args.poolId)
      .eq("order_id", args.orderId)
      .in("state", ["reserved", "delivered"])
      .maybeSingle();

    const codeId = existing?.id ?? (await reserveCode(merchantId, args.poolId, args.orderId)).codeId;

    const { data: pool } = await admin
      .from("virtual_code_pools")
      .select("channels, auto_deliver")
      .eq("id", args.poolId)
      .maybeSingle();

    if (existing?.state !== "delivered") {
      assertCodeTransition("reserved", "delivered");
      await admin
        .from("virtual_codes")
        .update({
          state: "delivered",
          delivered_at: new Date().toISOString(),
          customer_id: args.customerId ?? null,
          order_item_id: args.orderItemId ?? null,
          reserved_until: null,
        })
        .eq("id", codeId)
        .eq("state", "reserved");
    }

    if (!pool?.auto_deliver) return { codeId, queued: 0 };

    const queued: string[] = [];
    for (const channel of (pool.channels ?? []) as DeliveryChannel[]) {
      const recipient =
        channel === "email"
          ? args.email && isDeliverableEmail(args.email)
            ? args.email.trim()
            : null
          : args.phone
            ? normalizeBdMsisdn(args.phone)
            : null;
      if (!recipient) continue;

      // One delivery per (code, channel): a retried fulfilment webhook must not
      // enqueue a second email for the same key.
      const { data: dup } = await admin
        .from("virtual_deliveries")
        .select("id")
        .eq("code_id", codeId)
        .eq("channel", channel)
        .maybeSingle();
      if (dup) continue;

      const { data } = await admin
        .from("virtual_deliveries")
        .insert({
          merchant_id: merchantId,
          code_id: codeId,
          order_id: args.orderId,
          channel,
          recipient,
        })
        .select("id")
        .maybeSingle();
      if (data) queued.push(data.id);
    }

    incr("virtual.fulfilled");
    return { codeId, queued: queued.length };
  });
}

/* -------------------------------------------------------------------- reveal */

/**
 * Decrypts a code for the person entitled to it. Entitlement is checked against
 * the order, the reveal is rate limited twice (per caller and per code) and
 * always audited, because this is the one call that turns stored ciphertext
 * back into spendable value.
 */
export async function revealCode(
  db: Client,
  args: { codeId: string; merchantId: string; actor: string; customerId?: string | null; staff: boolean },
) {
  await enforceRateLimit("virtual.reveal", `${args.merchantId}:${args.actor}`);
  await enforceRateLimit("virtual.reveal_code", args.codeId);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;

  const { data: code } = await admin
    .from("virtual_codes")
    .select("id, merchant_id, customer_id, state, code_sealed, code_mask")
    .eq("id", args.codeId)
    .maybeSingle();
  if (!code || code.merchant_id !== args.merchantId) fail("not_found", "That code was not found");
  if (code.state === "revoked") fail("revoked", "This code has been cancelled");
  if (!args.staff && code.customer_id !== args.customerId) {
    log("warn", "virtual.reveal_denied", { codeId: args.codeId });
    fail("forbidden", "This code belongs to another customer");
  }

  const plain = await unsealSecret(code.code_sealed);
  if (!plain) fail("unseal_failed", "This code could not be unlocked. Contact support.");

  await admin.from("virtual_codes").update({ revealed_at: new Date().toISOString() }).eq("id", code.id);
  await audit(admin, args.merchantId, "virtual", args.actor, "code.reveal", code.id, {
    after: { mask: code.code_mask, staff: args.staff },
  });
  incr("virtual.code_revealed", { staff: String(args.staff) });
  return { code: plain, mask: code.code_mask };
}

/** Cancels a code — supplier recall, chargeback, or a key that never worked. */
export async function revokeCode(
  db: Client,
  merchantId: string,
  actor: string,
  args: { codeId: string; reason: string },
) {
  await enforceRateLimit("growth.write", merchantId);
  if (args.reason.trim().length < 3) fail("reason_required", "Give a reason for cancelling this code");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;
  const { data: before } = await admin
    .from("virtual_codes")
    .select("id, state")
    .eq("id", args.codeId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!before) fail("not_found", "That code was not found");
  assertCodeTransition(before.state as CodeState, "revoked");

  await admin
    .from("virtual_codes")
    .update({ state: "revoked", revoked_at: new Date().toISOString(), revoked_reason: args.reason.slice(0, 200) })
    .eq("id", args.codeId);
  await admin
    .from("virtual_deliveries")
    .update({ state: "cancelled" })
    .eq("code_id", args.codeId)
    .in("state", ["queued", "failed"]);

  await audit(admin, merchantId, "virtual", actor, "code.revoke", args.codeId, {
    before: { state: before.state },
    after: { state: "revoked" },
    reason: args.reason.slice(0, 200),
  });
  incr("virtual.code_revoked");
  return { revoked: true };
}

/* ------------------------------------------------------------------- delivery */

type SendResult = { ok: boolean; status: number | null; message: string; providerId?: string };

/**
 * Hands the message to the configured provider. Kept as one seam so the queue,
 * retry and audit behaviour is identical no matter which provider a merchant
 * uses, and so tests can exercise the queue without network access.
 */
async function sendMessage(channel: DeliveryChannel, recipient: string, body: string): Promise<SendResult> {
  const endpoint = process.env[channel === "email" ? "EMAIL_SEND_URL" : "SMS_SEND_URL"];
  const token = process.env[channel === "email" ? "EMAIL_SEND_TOKEN" : "SMS_SEND_TOKEN"];
  if (!endpoint || !token) {
    return { ok: false, status: 401, message: "provider not configured" };
  }
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: recipient, body }),
    });
    if (!res.ok) return { ok: false, status: res.status, message: (await res.text()).slice(0, 200) };
    return { ok: true, status: res.status, message: "sent" };
  } catch (err) {
    return { ok: false, status: null, message: String(err).slice(0, 200) };
  }
}

/**
 * Drains the delivery queue. Each row is locked by a compare-and-swap into
 * `sending`, so two concurrent workers never send the same key twice.
 */
export async function processDeliveryQueue(limit = 25) {
  await enforceRateLimit("virtual.deliver", "global");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;
  const workerId = crypto.randomUUID();

  const { data: due } = await admin
    .from("virtual_deliveries")
    .select("*")
    .in("state", ["queued", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(limit);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of due ?? []) {
    const { data: locked } = await admin
      .from("virtual_deliveries")
      .update({ state: "sending", locked_at: new Date().toISOString(), locked_by: workerId })
      .eq("id", row.id)
      .in("state", ["queued", "failed"])
      .select("id")
      .maybeSingle();
    if (!locked) {
      skipped += 1;
      continue;
    }

    const { data: code } = await admin
      .from("virtual_codes")
      .select("code_sealed, state, pool_id")
      .eq("id", row.code_id)
      .maybeSingle();

    // A code revoked between queueing and sending must never go out.
    if (!code || code.state === "revoked") {
      await admin.from("virtual_deliveries").update({ state: "cancelled" }).eq("id", row.id);
      skipped += 1;
      continue;
    }

    const plain = await unsealSecret(code.code_sealed);
    if (!plain) {
      await admin
        .from("virtual_deliveries")
        .update({ state: "failed", last_error_code: "unseal_failed", attempts: row.attempts + 1 })
        .eq("id", row.id);
      failed += 1;
      continue;
    }

    const { data: pool } = await admin
      .from("virtual_code_pools")
      .select("name, instructions")
      .eq("id", code.pool_id)
      .maybeSingle();
    const body = `${pool?.name ?? "Your code"}: ${plain}${pool?.instructions ? `\n\n${pool.instructions}` : ""}`;

    const attempt = row.attempts + 1;
    const result = await sendMessage(row.channel as DeliveryChannel, row.recipient, body);

    if (result.ok) {
      await admin
        .from("virtual_deliveries")
        .update({
          state: "sent",
          attempts: attempt,
          sent_at: new Date().toISOString(),
          provider_message_id: result.providerId ?? null,
          last_error_code: null,
          last_error_message: null,
          locked_by: null,
        })
        .eq("id", row.id);
      sent += 1;
      incr("virtual.delivery_sent", { channel: row.channel });
      continue;
    }

    const error = classifyDeliveryError(result.status, result.message);
    const retry = shouldRetry(attempt, error);
    await admin
      .from("virtual_deliveries")
      .update({
        state: retry ? "queued" : "failed",
        attempts: attempt,
        next_attempt_at: new Date(Date.now() + nextAttemptDelayMs(attempt, row.id)).toISOString(),
        last_error_code: error.code,
        last_error_message: explainDelivery(error.code),
        locked_by: null,
      })
      .eq("id", row.id);
    failed += 1;
    incr("virtual.delivery_failed", { channel: row.channel, code: error.code });
    if (!retry) {
      log("error", "virtual.delivery_dead", { deliveryId: row.id, code: error.code, attempts: attempt });
    }
  }

  return { sent, failed, skipped, considered: due?.length ?? 0, maxAttempts: MAX_DELIVERY_ATTEMPTS };
}

/** Puts a dead delivery back in the queue after the merchant fixes the cause. */
export async function retryDelivery(db: Client, merchantId: string, actor: string, deliveryId: string) {
  await enforceRateLimit("growth.write", merchantId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;
  const { data } = await admin
    .from("virtual_deliveries")
    .update({ state: "queued", attempts: 0, next_attempt_at: new Date().toISOString(), last_error_code: null })
    .eq("id", deliveryId)
    .eq("merchant_id", merchantId)
    .eq("state", "failed")
    .select("id")
    .maybeSingle();
  if (!data) fail("not_retryable", "That delivery cannot be retried");
  await audit(admin, merchantId, "virtual", actor, "delivery.retry", deliveryId, {});
  return { queued: true };
}

export async function loadDeliveries(db: Client, merchantId: string) {
  await enforceRateLimit("growth.read", merchantId);
  const { data } = await db
    .from("virtual_deliveries")
    .select("*, virtual_codes(code_mask, state)")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((row) => ({
    ...row,
    mask: (row.virtual_codes as unknown as { code_mask: string } | null)?.code_mask ?? "••••",
    explanation: row.last_error_code ? explainDelivery(row.last_error_code) : null,
  }));
}

export async function runVirtualSweep() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;
  const released = await sweepExpiredReservations(admin);
  const delivered = await processDeliveryQueue(50);
  log("info", "virtual.sweep", { ...released, ...delivered });
  return { ...released, ...delivered };
}
