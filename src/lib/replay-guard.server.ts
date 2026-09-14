/**
 * Durable replay / idempotency guard for public beacons and webhooks.
 *
 * Backed by the `api_idempotency_keys` unique index, so the claim is atomic at
 * the database level: two concurrent isolates racing the same nonce cannot
 * both win. Callers get one of three verdicts — `fresh` (proceed), `replay`
 * (return the stored response) or `conflict` (same key, different body, which
 * is always a client bug or an attack).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { incr, log } from "./observability.server";

type Client = SupabaseClient<Database>;

export type ClaimVerdict =
  | { status: "fresh" }
  | { status: "replay"; response: unknown; httpStatus: number }
  | { status: "conflict" };

export async function hashRequest(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Atomically claim a key. The insert is the lock — we never read-then-write,
 * which would be a race under concurrency.
 */
export async function claimIdempotency(
  admin: Client,
  input: { merchantId: string; route: string; key: string; requestHash: string },
): Promise<ClaimVerdict> {
  const { error } = await admin.from("api_idempotency_keys").insert({
    merchant_id: input.merchantId,
    route: input.route,
    idem_key: input.key,
    request_hash: input.requestHash,
    status: 0,
  });

  if (!error) {
    incr("framique_idempotency_total", { route: input.route, outcome: "fresh" });
    return { status: "fresh" };
  }

  // 23505 = unique_violation: someone already claimed this key.
  if (error.code !== "23505") {
    log("error", "idempotency.claim_failed", { route: input.route, code: error.code });
    throw new Error("idempotency_unavailable");
  }

  const { data: existing } = await admin
    .from("api_idempotency_keys")
    .select("request_hash, response, status")
    .eq("merchant_id", input.merchantId)
    .eq("route", input.route)
    .eq("idem_key", input.key)
    .maybeSingle();

  if (existing && existing.request_hash !== input.requestHash) {
    incr("framique_idempotency_total", { route: input.route, outcome: "conflict" });
    return { status: "conflict" };
  }

  incr("framique_idempotency_total", { route: input.route, outcome: "replay" });
  return {
    status: "replay",
    response: existing?.response ?? null,
    httpStatus: existing?.status && existing.status > 0 ? existing.status : 200,
  };
}

/** Store the outcome so a replay returns exactly what the first call returned. */
export async function completeIdempotency(
  admin: Client,
  input: { merchantId: string; route: string; key: string; response: unknown; httpStatus: number },
) {
  await admin
    .from("api_idempotency_keys")
    .update({ response: input.response as never, status: input.httpStatus })
    .eq("merchant_id", input.merchantId)
    .eq("route", input.route)
    .eq("idem_key", input.key);
}

/** Release a claim when the handler failed, so a retry is not swallowed. */
export async function releaseIdempotency(
  admin: Client,
  input: { merchantId: string; route: string; key: string },
) {
  await admin
    .from("api_idempotency_keys")
    .delete()
    .eq("merchant_id", input.merchantId)
    .eq("route", input.route)
    .eq("idem_key", input.key);
}

/** Housekeeping: keys older than the replay window carry no value. */
export async function pruneIdempotency(admin: Client, olderThanHours = 24, route?: string) {
  const cutoff = new Date(Date.now() - olderThanHours * 3600_000).toISOString();
  let query = admin.from("api_idempotency_keys").delete().lt("created_at", cutoff);
  if (route) query = query.eq("route", route);
  const { data } = await query.select("id");
  return data?.length ?? 0;
}
