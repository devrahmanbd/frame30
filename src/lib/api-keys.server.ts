import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;
export type ApiKeyEnv = Database["public"]["Enums"]["api_key_env"];
export const API_SCOPES = ["orders.read", "products.write", "analytics.read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export class ApiKeyError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashSecret(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return toHex(digest);
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

async function requireAdmin(db: Client, merchantId: string, userId: string) {
  const { data } = await db
    .from("merchant_members")
    .select("role")
    .eq("merchant_id", merchantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || (data.role !== "owner" && data.role !== "admin")) {
    throw new ApiKeyError("forbidden", "Not permitted to create or revoke keys");
  }
}

export async function listKeys(db: Client, merchantId: string) {
  const [keys, events] = await Promise.all([
    db
      .from("api_keys")
      .select("id,name,prefix,scopes,env,active,created_at,last_used_at,revoked_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false }),
    db
      .from("api_key_events")
      .select("id,api_key_id,action,payload,created_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (keys.error) throw new ApiKeyError("list_failed", keys.error.message);
  return { keys: keys.data ?? [], events: events.data ?? [] };
}

export async function createKey(
  db: Client,
  merchantId: string,
  userId: string,
  input: { name: string; scopes: ApiScope[]; env: ApiKeyEnv },
) {
  await requireAdmin(db, merchantId, userId);
  const token = randomToken();
  const secret = `sk_${input.env}_${token}`;
  const prefix = `key_${secret.slice(0, 11)}…`;
  const keyHash = await hashSecret(secret);
  const { data, error } = await db
    .from("api_keys")
    .insert({
      merchant_id: merchantId,
      name: input.name,
      prefix,
      key_hash: keyHash,
      scopes: input.scopes,
      env: input.env,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new ApiKeyError("create_failed", error.message);
  await db.from("api_key_events").insert({
    merchant_id: merchantId,
    api_key_id: data.id,
    actor: userId,
    action: "api_key.created",
    payload: { name: input.name, env: input.env, scopes: input.scopes },
  });
  return { id: data.id, secret, prefix };
}

export async function revokeKey(db: Client, merchantId: string, userId: string, keyId: string) {
  await requireAdmin(db, merchantId, userId);
  const { error } = await db
    .from("api_keys")
    .update({ active: false, revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("merchant_id", merchantId);
  if (error) throw new ApiKeyError("revoke_failed", error.message);
  await db.from("api_key_events").insert({
    merchant_id: merchantId,
    api_key_id: keyId,
    actor: userId,
    action: "api_key.revoked",
    payload: {},
  });
  return { ok: true as const };
}

/** Maps a bearer secret to a live tenant + scopes. Revoked/unknown keys resolve to null. */
export async function resolveBearer(secret: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const keyHash = await hashSecret(secret);
  const { data } = await supabaseAdmin
    .from("api_keys")
    .select("id,merchant_id,scopes,env,active")
    .eq("key_hash", keyHash)
    .maybeSingle();
  if (!data || !data.active) return null;
  await supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);
  return {
    keyId: data.id,
    merchantId: data.merchant_id,
    scopes: (data.scopes as ApiScope[]) ?? [],
    env: data.env,
  };
}
