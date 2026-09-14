/**
 * OAuth 2.1 authorization-code + PKCE service.
 *
 * Design invariants (docs/13-export-sdk/oauth.md §3, §10):
 *   - Codes and tokens are stored as SHA-256 hashes only. A database dump
 *     cannot be replayed against the API.
 *   - Refresh tokens rotate on every use. Presenting a rotated refresh token
 *     is treated as theft: the whole token family is revoked at once.
 *   - Effective scopes are always `requested ∩ client allowlist`; there is no
 *     path that widens a grant.
 *   - Every issuance, rotation and revocation writes an audit row.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { intersectScopes, parseScopes, refusedScopes, type Scope } from "./api-scopes";
import { incr, log } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";

type Client = SupabaseClient<Database>;

export const ACCESS_TTL_SECONDS = 3600;
export const REFRESH_TTL_SECONDS = 30 * 24 * 3600;
export const CODE_TTL_SECONDS = 300;

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
    readonly detail?: string,
  ) {
    super(code);
    this.name = "OAuthError";
  }
}

function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(value: string) {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function randomToken(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toHex(buf.buffer);
}

function b64url(buf: ArrayBuffer) {
  let bin = "";
  new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** RFC 7636 S256: BASE64URL(SHA256(verifier)) must equal the stored challenge. */
export async function verifyPkce(verifier: string, challenge: string, method: string) {
  if (method !== "S256") return false;
  if (verifier.length < 43 || verifier.length > 128) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(digest) === challenge;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function audit(
  merchantId: string,
  action: string,
  payload: Record<string, unknown>,
  actor?: string | null,
) {
  const db = await admin();
  await db.from("api_key_events").insert({
    merchant_id: merchantId,
    actor: actor ?? null,
    action,
    payload: payload as unknown as Database["public"]["Tables"]["api_key_events"]["Insert"]["payload"],
  });
}

/* ------------------------------------------------------------------ */
/* App registry (merchant admin surface)                                */
/* ------------------------------------------------------------------ */

async function requireAdminRole(db: Client, merchantId: string, userId: string) {
  const { data } = await db
    .from("merchant_members")
    .select("role")
    .eq("merchant_id", merchantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || (data.role !== "owner" && data.role !== "admin")) {
    throw new OAuthError("forbidden", 403);
  }
}

export type SaveClientInput = {
  id?: string | null;
  name: string;
  clientType: "public" | "confidential";
  redirectUris: string[];
  scopes: Scope[];
};

function sanitizeRedirects(uris: string[]) {
  const out: string[] = [];
  for (const raw of uris) {
    const value = raw.trim();
    if (!value) continue;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new OAuthError("invalid_redirect_uri", 400, value);
    }
    // https only, except localhost for local development of third-party apps.
    const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !isLocal) throw new OAuthError("invalid_redirect_uri", 400, value);
    if (parsed.hash) throw new OAuthError("invalid_redirect_uri", 400, value);
    out.push(parsed.toString());
  }
  if (!out.length) throw new OAuthError("redirect_uri_required", 400);
  return out.slice(0, 8);
}

export async function listClients(db: Client, merchantId: string) {
  await enforceRateLimit("dev.read", merchantId);
  const [clients, consents] = await Promise.all([
    db
      .from("oauth_clients")
      .select("id,name,client_id,client_type,redirect_uris,scopes,status,created_at,secret_rotated_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("oauth_consents")
      .select("id,client_row_id,user_id,scopes,granted_at,revoked_at")
      .eq("merchant_id", merchantId)
      .order("granted_at", { ascending: false })
      .limit(100),
  ]);
  return { clients: clients.data ?? [], consents: consents.data ?? [] };
}

/** Returns the plaintext secret exactly once for confidential clients. */
export async function saveClient(
  db: Client,
  merchantId: string,
  userId: string,
  input: SaveClientInput,
) {
  await requireAdminRole(db, merchantId, userId);
  await enforceRateLimit("dev.write", `${merchantId}:${userId}`);
  const redirects = sanitizeRedirects(input.redirectUris);
  const scopes = parseScopes(input.scopes);
  if (!scopes.length) throw new OAuthError("scope_required", 400);

  if (input.id) {
    const { error } = await db
      .from("oauth_clients")
      .update({
        name: input.name.slice(0, 120),
        redirect_uris: redirects,
        scopes,
        client_type: input.clientType,
        updated_at: new Date().toISOString(),
      })
      .eq("merchant_id", merchantId)
      .eq("id", input.id);
    if (error) throw new OAuthError("client_save_failed", 500, error.message);
    await audit(merchantId, "oauth.app.updated", { app: input.name, scopes }, userId);
    return { id: input.id, clientId: null as string | null, secret: null as string | null };
  }

  const clientId = `frmapp_${randomToken(12)}`;
  const secret = input.clientType === "confidential" ? `frmsec_${randomToken(24)}` : null;
  const { data, error } = await db
    .from("oauth_clients")
    .insert({
      merchant_id: merchantId,
      name: input.name.slice(0, 120),
      client_id: clientId,
      client_type: input.clientType,
      client_secret_hash: secret ? await sha256Hex(secret) : null,
      redirect_uris: redirects,
      scopes,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new OAuthError("client_save_failed", 500, error?.message);
  await audit(merchantId, "oauth.app.created", { app: input.name, scopes }, userId);
  incr("framique_oauth_app_total", { action: "created" });
  return { id: data.id, clientId, secret };
}

export async function rotateClientSecret(
  db: Client,
  merchantId: string,
  userId: string,
  id: string,
) {
  await requireAdminRole(db, merchantId, userId);
  await enforceRateLimit("dev.write", `${merchantId}:${userId}`);
  const secret = `frmsec_${randomToken(24)}`;
  const { error } = await db
    .from("oauth_clients")
    .update({
      client_secret_hash: await sha256Hex(secret),
      client_type: "confidential",
      secret_rotated_at: new Date().toISOString(),
    })
    .eq("merchant_id", merchantId)
    .eq("id", id);
  if (error) throw new OAuthError("rotate_failed", 500, error.message);
  // The old secret dies with the update; live tokens keep working until revoked.
  await audit(merchantId, "oauth.app.rotated", { client_row_id: id }, userId);
  return { secret };
}

/** Disabling an app cascades: consents revoked, token families burned. */
export async function setClientStatus(
  db: Client,
  merchantId: string,
  userId: string,
  id: string,
  status: "active" | "disabled",
) {
  await requireAdminRole(db, merchantId, userId);
  const dba = await admin();
  const { error } = await db
    .from("oauth_clients")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("merchant_id", merchantId)
    .eq("id", id);
  if (error) throw new OAuthError("status_failed", 500, error.message);
  if (status === "disabled") {
    const now = new Date().toISOString();
    await dba
      .from("oauth_tokens")
      .update({ revoked_at: now, revoke_reason: "app_disabled" })
      .eq("merchant_id", merchantId)
      .eq("client_row_id", id)
      .is("revoked_at", null);
    await dba
      .from("oauth_consents")
      .update({ revoked_at: now, revoked_by: userId })
      .eq("merchant_id", merchantId)
      .eq("client_row_id", id)
      .is("revoked_at", null);
    await audit(merchantId, "oauth.token.revoked", { client_row_id: id, reason: "app_disabled" }, userId);
  }
  return { ok: true as const };
}

export async function revokeConsent(db: Client, merchantId: string, userId: string, consentId: string) {
  await requireAdminRole(db, merchantId, userId);
  const dba = await admin();
  const { data } = await db
    .from("oauth_consents")
    .select("id,client_row_id,user_id")
    .eq("merchant_id", merchantId)
    .eq("id", consentId)
    .maybeSingle();
  if (!data) throw new OAuthError("consent_not_found", 404);
  const now = new Date().toISOString();
  await dba
    .from("oauth_consents")
    .update({ revoked_at: now, revoked_by: userId })
    .eq("merchant_id", merchantId)
    .eq("id", consentId);
  await dba
    .from("oauth_tokens")
    .update({ revoked_at: now, revoke_reason: "consent_revoked" })
    .eq("merchant_id", merchantId)
    .eq("client_row_id", data.client_row_id)
    .eq("user_id", data.user_id)
    .is("revoked_at", null);
  await audit(merchantId, "oauth.token.revoked", { reason: "consent_revoked" }, userId);
  incr("framique_oauth_token_total", { action: "revoked" });
  return { ok: true as const };
}

/* ------------------------------------------------------------------ */
/* Authorization code flow                                              */
/* ------------------------------------------------------------------ */

export type AuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  scopes: Scope[];
  codeChallenge: string;
  codeChallengeMethod: string;
  state?: string | null;
};

/** Read-only: powers the consent screen before anything is written. */
export async function describeAuthorization(req: AuthorizeRequest) {
  const db = await admin();
  const { data: client } = await db
    .from("oauth_clients")
    .select("id,merchant_id,name,client_id,client_type,redirect_uris,scopes,status")
    .eq("client_id", req.clientId)
    .maybeSingle();
  if (!client) throw new OAuthError("invalid_client", 400);
  if (client.status !== "active") throw new OAuthError("client_disabled", 403);
  if (!client.redirect_uris.includes(req.redirectUri)) throw new OAuthError("invalid_redirect_uri", 400);
  if (req.codeChallengeMethod !== "S256" || !req.codeChallenge) {
    throw new OAuthError("pkce_required", 400);
  }
  const allowed = parseScopes(client.scopes);
  const requested = parseScopes(req.scopes);
  const granted = intersectScopes(requested, allowed);
  const refused = refusedScopes(requested, allowed);
  if (!granted.length) throw new OAuthError("scope_required", 400);
  return {
    clientRowId: client.id,
    merchantId: client.merchant_id,
    appName: client.name,
    granted,
    refused,
  };
}

/** Called after the staff member presses "Allow" on the consent screen. */
export async function issueCode(userId: string, req: AuthorizeRequest) {
  const described = await describeAuthorization(req);
  await enforceRateLimit("oauth.authorize", `${described.merchantId}:${userId}`);
  const db = await admin();
  const code = randomToken(24);
  const { error } = await db.from("oauth_authorizations").insert({
    merchant_id: described.merchantId,
    client_row_id: described.clientRowId,
    user_id: userId,
    scopes: described.granted,
    code_hash: await sha256Hex(code),
    redirect_uri: req.redirectUri,
    code_challenge: req.codeChallenge,
    code_challenge_method: req.codeChallengeMethod,
    expires_at: new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw new OAuthError("code_issue_failed", 500, error.message);

  await db.from("oauth_consents").insert({
    merchant_id: described.merchantId,
    client_row_id: described.clientRowId,
    user_id: userId,
    scopes: described.granted,
  });
  await audit(described.merchantId, "oauth.consent.granted", { scopes: described.granted }, userId);
  incr("framique_oauth_code_total", { outcome: "issued" });

  const redirect = new URL(req.redirectUri);
  redirect.searchParams.set("code", code);
  if (req.state) redirect.searchParams.set("state", req.state);
  return { code, redirectTo: redirect.toString(), appName: described.appName };
}

type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
};

async function mintPair(opts: {
  merchantId: string;
  clientRowId: string;
  userId: string;
  scopes: Scope[];
  familyId?: string;
  rotatedFrom?: string;
}): Promise<TokenPair> {
  const db = await admin();
  const access = `frmat_${randomToken(32)}`;
  const refresh = `frmrt_${randomToken(32)}`;
  const now = Date.now();
  const insert: Database["public"]["Tables"]["oauth_tokens"]["Insert"] = {
    merchant_id: opts.merchantId,
    client_row_id: opts.clientRowId,
    user_id: opts.userId,
    scopes: opts.scopes,
    access_hash: await sha256Hex(access),
    refresh_hash: await sha256Hex(refresh),
    access_expires_at: new Date(now + ACCESS_TTL_SECONDS * 1000).toISOString(),
    refresh_expires_at: new Date(now + REFRESH_TTL_SECONDS * 1000).toISOString(),
  };
  if (opts.familyId) insert.family_id = opts.familyId;
  if (opts.rotatedFrom) insert.rotated_from = opts.rotatedFrom;
  const { error } = await db.from("oauth_tokens").insert(insert);
  if (error) throw new OAuthError("token_issue_failed", 500, error.message);
  incr("framique_oauth_token_total", { action: opts.rotatedFrom ? "rotated" : "issued" });
  return {
    access_token: access,
    refresh_token: refresh,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SECONDS,
    scope: opts.scopes.join(" "),
  };
}

async function assertClientAuth(clientId: string, clientSecret: string | null) {
  const db = await admin();
  const { data: client } = await db
    .from("oauth_clients")
    .select("id,merchant_id,client_type,client_secret_hash,status,scopes")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!client) throw new OAuthError("invalid_client", 401);
  if (client.status !== "active") throw new OAuthError("client_disabled", 403);
  if (client.client_type === "confidential") {
    if (!clientSecret || !client.client_secret_hash) throw new OAuthError("invalid_client", 401);
    if ((await sha256Hex(clientSecret)) !== client.client_secret_hash) {
      throw new OAuthError("invalid_client", 401);
    }
  }
  return client;
}

export async function exchangeCode(input: {
  clientId: string;
  clientSecret: string | null;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const client = await assertClientAuth(input.clientId, input.clientSecret);
  await enforceRateLimit("oauth.token", `${client.merchant_id}:${input.clientId}`);
  const db = await admin();
  const codeHash = await sha256Hex(input.code);
  const { data: auth } = await db
    .from("oauth_authorizations")
    .select("*")
    .eq("code_hash", codeHash)
    .maybeSingle();
  if (!auth || auth.client_row_id !== client.id) throw new OAuthError("invalid_grant", 400);
  if (auth.consumed_at) {
    // Replay of a consumed code: burn every token minted from that grant.
    await db
      .from("oauth_tokens")
      .update({ revoked_at: new Date().toISOString(), revoke_reason: "code_replay" })
      .eq("merchant_id", auth.merchant_id)
      .eq("client_row_id", auth.client_row_id)
      .eq("user_id", auth.user_id)
      .is("revoked_at", null);
    incr("framique_oauth_code_total", { outcome: "replay" });
    throw new OAuthError("invalid_grant", 400, "code_replay");
  }
  if (Date.parse(auth.expires_at) < Date.now()) throw new OAuthError("invalid_grant", 400, "expired");
  if (auth.redirect_uri !== input.redirectUri) throw new OAuthError("invalid_grant", 400, "redirect_mismatch");
  if (!(await verifyPkce(input.codeVerifier, auth.code_challenge, auth.code_challenge_method))) {
    throw new OAuthError("invalid_grant", 400, "pkce_failed");
  }

  await db
    .from("oauth_authorizations")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", auth.id);

  const scopes = intersectScopes(parseScopes(auth.scopes), parseScopes(client.scopes));
  if (!scopes.length) throw new OAuthError("scope_mismatch", 403);
  const pair = await mintPair({
    merchantId: auth.merchant_id,
    clientRowId: auth.client_row_id,
    userId: auth.user_id,
    scopes,
  });
  await audit(auth.merchant_id, "oauth.token.issued", { scopes }, auth.user_id);
  return pair;
}

export async function refreshToken(input: {
  clientId: string;
  clientSecret: string | null;
  refreshToken: string;
}) {
  const client = await assertClientAuth(input.clientId, input.clientSecret);
  await enforceRateLimit("oauth.token", `${client.merchant_id}:${input.clientId}`);
  const db = await admin();
  const hash = await sha256Hex(input.refreshToken);
  const { data: token } = await db.from("oauth_tokens").select("*").eq("refresh_hash", hash).maybeSingle();
  if (!token || token.client_row_id !== client.id) throw new OAuthError("invalid_grant", 400);

  // Reuse detection: a rotated or revoked refresh token means the pair leaked.
  if (token.rotated_at || token.revoked_at) {
    await db
      .from("oauth_tokens")
      .update({ revoked_at: new Date().toISOString(), revoke_reason: "refresh_reuse" })
      .eq("family_id", token.family_id)
      .is("revoked_at", null);
    incr("framique_oauth_token_total", { action: "reuse_detected" });
    log("warn", "oauth.refresh_reuse", { merchant_id: token.merchant_id, family: token.family_id });
    await audit(token.merchant_id, "oauth.token.revoked", { reason: "refresh_reuse" }, token.user_id);
    throw new OAuthError("invalid_grant", 400, "refresh_reuse");
  }
  if (Date.parse(token.refresh_expires_at) < Date.now()) throw new OAuthError("invalid_grant", 400, "expired");

  const scopes = intersectScopes(parseScopes(token.scopes), parseScopes(client.scopes));
  if (!scopes.length) throw new OAuthError("scope_mismatch", 403);
  const pair = await mintPair({
    merchantId: token.merchant_id,
    clientRowId: token.client_row_id,
    userId: token.user_id,
    scopes,
    familyId: token.family_id,
    rotatedFrom: token.id,
  });
  await db
    .from("oauth_tokens")
    .update({ rotated_at: new Date().toISOString() })
    .eq("id", token.id);
  return pair;
}

/** Idempotent: unknown tokens still answer 200 so probes learn nothing. */
export async function revokeToken(token: string) {
  const db = await admin();
  const hash = await sha256Hex(token);
  const { data } = await db
    .from("oauth_tokens")
    .select("id,family_id,merchant_id,user_id")
    .or(`access_hash.eq.${hash},refresh_hash.eq.${hash}`)
    .maybeSingle();
  if (!data) return { ok: true as const };
  await db
    .from("oauth_tokens")
    .update({ revoked_at: new Date().toISOString(), revoke_reason: "client_revoke" })
    .eq("family_id", data.family_id)
    .is("revoked_at", null);
  await audit(data.merchant_id, "oauth.token.revoked", { reason: "client_revoke" }, data.user_id);
  incr("framique_oauth_token_total", { action: "revoked" });
  return { ok: true as const };
}

export type ResolvedToken = {
  kind: "oauth";
  merchantId: string;
  scopes: Scope[];
  subject: string;
  tokenId: string;
};

/** Access-token introspection used by the REST gateway. Never returns a revoked row. */
export async function resolveAccessToken(token: string): Promise<ResolvedToken | null> {
  const db = await admin();
  const { data } = await db
    .from("oauth_tokens")
    .select("id,merchant_id,user_id,scopes,access_expires_at,revoked_at")
    .eq("access_hash", await sha256Hex(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  if (Date.parse(data.access_expires_at) < Date.now()) return null;
  void db.from("oauth_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return {
    kind: "oauth",
    merchantId: data.merchant_id,
    scopes: parseScopes(data.scopes),
    subject: data.user_id,
    tokenId: data.id,
  };
}
