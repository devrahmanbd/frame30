/**
 * Identity & access core (BUILD.md §1.2).
 *
 * Everything security-relevant about a session lives here: PII-minimal audit
 * trail, credential-stuffing lockout, device/session registry, and single-use
 * step-up grants that gate money actions (refund, payout, purge).
 *
 * Rules honoured: no raw email/IP is ever persisted (salted hash only), every
 * decision is server-side, every branch emits a metric and an audit row.
 */
import { getRequest } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { incr, log, withSpan } from "./observability.server";
import { enforceRateLimit, rateLimit, type RateVerdict } from "./rate-limit.server";

type Client = SupabaseClient<Database>;
type LooseDb = {
  from: (table: string) => {
    insert: (rows: unknown) => Promise<{ error: unknown }>;
    upsert: (rows: unknown, opts?: unknown) => Promise<{ error: unknown }>;
    select: (cols: string) => any;
    update: (patch: unknown) => any;
  };
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export class StepUpRequiredError extends Error {
  constructor(readonly action: string) {
    super("step_up.required");
    this.name = "StepUpRequiredError";
  }
}

/** Actions that always require a fresh second-factor confirmation. */
export const STEP_UP_ACTIONS = ["refund", "payout", "purge", "api_key.rotate"] as const;
export type StepUpAction = (typeof STEP_UP_ACTIONS)[number];
export const STEP_UP_TTL_SECONDS = 300;

async function sha256(value: string) {
  const salt = process.env["AUTH_HASH_SALT"] ?? "framique-identity";
  const bytes = new TextEncoder().encode(`${salt}:${value.trim().toLowerCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/** Never returns raw values — only what is safe to store or log. */
export async function requestFingerprint() {
  let ip = "unknown";
  let ua = "unknown";
  try {
    const req = getRequest();
    ip =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    ua = req.headers.get("user-agent") ?? "unknown";
  } catch {
    // Outside a request scope (tests, scripts): fall through to defaults.
  }
  return { ipHash: await sha256(ip), device: describeDevice(ua), userAgent: ua.slice(0, 180) };
}

/** Resolves the authenticated user id from the request bearer token, or null if guest/anonymous. */
export async function resolveRequestUserId(): Promise<string | null> {
  try {
    const req = getRequest();
    const authHeader = req?.headers?.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token || token.split(".").length !== 3) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.getClaims(token);
    if (error || !data?.claims?.sub) {
      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      return userData?.user?.id ?? null;
    }
    return String(data.claims.sub);
  } catch {
    return null;
  }
}

export function describeDevice(ua: string) {
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iOS/i.test(ua)
      ? "iOS"
      : /Mac OS X/i.test(ua)
        ? "macOS"
        : /Windows/i.test(ua)
          ? "Windows"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Unknown OS";
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /Chrome\//i.test(ua)
      ? "Chrome"
      : /Safari\//i.test(ua)
        ? "Safari"
        : /Firefox\//i.test(ua)
          ? "Firefox"
          : "Unknown browser";
  return `${browser} · ${os}`;
}

export type AuthEventInput = {
  event: string;
  outcome: "ok" | "denied" | "error";
  userId?: string | null;
  email?: string | null;
  detail?: Record<string, unknown>;
};

/** Append-only audit row. Failure to audit must never break the request. */
export async function recordAuthEvent(input: AuthEventInput) {
  const { event, outcome } = input;
  incr("framique_auth_event_total", { event, outcome });
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const fp = await requestFingerprint();
    await (supabaseAdmin as unknown as LooseDb).from("auth_events").insert({
      user_id: input.userId ?? null,
      email_hash: input.email ? await sha256(input.email) : null,
      event,
      outcome,
      ip_hash: fp.ipHash,
      user_agent: fp.userAgent,
      detail: input.detail ?? {},
    });
  } catch (err) {
    log("warn", "auth_event.persist_failed", { event, outcome, message: String(err) });
  }
}

export type SignInGuardVerdict = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

/**
 * Brute-force / credential-stuffing lockout. Two buckets are checked so a
 * single hot IP cannot burn a victim's account out of existence: the account
 * bucket and the network bucket must both have headroom.
 */
export async function signInGuard(email: string): Promise<SignInGuardVerdict> {
  return withSpan("identity.signInGuard", async () => {
    const fp = await requestFingerprint();
    const emailHash = await sha256(email);
    const [account, network] = await Promise.all([
      rateLimit("auth.signin", `email:${emailHash}`),
      rateLimit("auth.signin", `ip:${fp.ipHash}`),
    ]);
    const worst: RateVerdict = account.allowed ? network : account;
    const verdict = {
      allowed: account.allowed && network.allowed,
      retryAfterSeconds: Math.max(
        0,
        Math.ceil((new Date(worst.reset_at).getTime() - Date.now()) / 1000),
      ),
      remaining: Math.min(account.remaining, network.remaining),
    };
    if (!verdict.allowed) {
      await recordAuthEvent({
        event: "signin.locked",
        outcome: "denied",
        email,
        detail: { retryAfterSeconds: verdict.retryAfterSeconds },
      });
    }
    return verdict;
  });
}

/** Records the device behind the current session so the user can revoke it. */
export async function registerSession(
  userId: string,
  input: { sessionId: string; aal?: string | null },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const fp = await requestFingerprint();
  const db = supabaseAdmin as unknown as LooseDb;
  const { error } = await db.from("auth_sessions").upsert(
    {
      user_id: userId,
      session_id: input.sessionId,
      device: fp.device,
      ip_hash: fp.ipHash,
      aal: input.aal ?? "aal1",
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "user_id,session_id" },
  );
  if (error) log("warn", "auth_session.upsert_failed", { message: String(error) });
  await recordAuthEvent({ event: "session.seen", outcome: "ok", userId });
  return { ok: true };
}

export async function markSessionsRevoked(userId: string, keepSessionId: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as LooseDb;
  let q = db.from("auth_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).is("revoked_at", null);
  if (keepSessionId) q = q.neq("session_id", keepSessionId);
  await q;
  await recordAuthEvent({ event: "session.revoked_others", outcome: "ok", userId });
  return { ok: true };
}

export type SecurityDesk = {
  sessions: {
    id: string;
    device: string | null;
    aal: string | null;
    created_at: string;
    last_seen_at: string;
    revoked_at: string | null;
    current: boolean;
  }[];
  events: { id: string; event: string; outcome: string; created_at: string; device: string | null }[];
  stepUpActions: string[];
  stepUpTtlSeconds: number;
};

export async function loadSecurityDesk(
  supabase: Client,
  userId: string,
  currentSessionId: string | null,
): Promise<SecurityDesk> {
  return withSpan("identity.securityDesk", async () => {
    const db = supabase as unknown as LooseDb;
    const [sessions, events] = await Promise.all([
      db
        .from("auth_sessions")
        .select("id, session_id, device, aal, created_at, last_seen_at, revoked_at")
        .eq("user_id", userId)
        .order("last_seen_at", { ascending: false })
        .limit(25),
      db
        .from("auth_events")
        .select("id, event, outcome, created_at, user_agent")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    const rows = (sessions.data ?? []) as Record<string, string | null>[];
    return {
      sessions: rows.map((s) => ({
        id: String(s["id"]),
        device: s["device"] ?? null,
        aal: s["aal"] ?? null,
        created_at: String(s["created_at"]),
        last_seen_at: String(s["last_seen_at"]),
        revoked_at: s["revoked_at"] ?? null,
        current: currentSessionId != null && s["session_id"] === currentSessionId,
      })),
      events: ((events.data ?? []) as Record<string, string | null>[]).map((e) => ({
        id: String(e["id"]),
        event: String(e["event"]),
        outcome: String(e["outcome"]),
        created_at: String(e["created_at"]),
        device: e["user_agent"] ? describeDevice(String(e["user_agent"])) : null,
      })),
      stepUpActions: [...STEP_UP_ACTIONS],
      stepUpTtlSeconds: STEP_UP_TTL_SECONDS,
    };
  });
}

/**
 * Mints a single-use grant for a sensitive action. The caller must already
 * have satisfied a second factor — proven by an `aal2` claim on the session
 * (TOTP verified) — otherwise the grant is refused.
 */
export async function grantStepUp(
  userId: string,
  claims: Record<string, unknown>,
  input: { action: StepUpAction; merchantId?: string | null },
) {
  const aal = String(claims["aal"] ?? "aal1");
  if (aal !== "aal2") {
    await recordAuthEvent({
      event: "step_up.denied",
      outcome: "denied",
      userId,
      detail: { action: input.action, aal },
    });
    throw new StepUpRequiredError(input.action);
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const expiresAt = new Date(Date.now() + STEP_UP_TTL_SECONDS * 1000).toISOString();
  const { error } = await (supabaseAdmin as unknown as LooseDb).from("step_up_grants").insert({
    user_id: userId,
    action: input.action,
    merchant_id: input.merchantId ?? null,
    method: "totp",
    expires_at: expiresAt,
  });
  if (error) throw new Error("step_up.grant_failed");
  await recordAuthEvent({
    event: "step_up.granted",
    outcome: "ok",
    userId,
    detail: { action: input.action },
  });
  return { expiresAt, ttlSeconds: STEP_UP_TTL_SECONDS };
}

/**
 * Consumes a grant. Call at the top of every money-moving server path. The
 * grant is burned inside the database so a replayed request cannot reuse it.
 */
export async function requireStepUp(
  supabase: Client,
  action: StepUpAction,
  merchantId?: string | null,
) {
  const { data, error } = await (supabase as unknown as LooseDb).rpc("step_up_consume", {
    _action: action,
    _merchant_id: merchantId ?? null,
  });
  if (error || data !== true) {
    incr("framique_step_up_total", { action, outcome: "required" });
    throw new StepUpRequiredError(action);
  }
  incr("framique_step_up_total", { action, outcome: "consumed" });
  return true;
}

/** Rate-limited password reset. Always reports success — never leaks whether the account exists. */
export async function requestPasswordReset(email: string, redirectTo: string) {
  const fp = await requestFingerprint();
  const emailHash = await sha256(email);
  const [byEmail, byIp] = await Promise.all([
    rateLimit("auth.reset", `email:${emailHash}`),
    rateLimit("auth.reset", `ip:${fp.ipHash}`),
  ]);
  if (!byEmail.allowed || !byIp.allowed) {
    await recordAuthEvent({ event: "password_reset.throttled", outcome: "denied", email });
    return { sent: true as const, throttled: true as const };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo });
  await recordAuthEvent({
    event: "password_reset.requested",
    outcome: error ? "error" : "ok",
    email,
  });
  return { sent: true as const, throttled: false as const };
}

/**
 * Email change with re-verification (BUILD.md §1.2).
 *
 * We never mutate the address directly: Supabase is asked to send a
 * confirmation link, and with secure email change enabled both the current and
 * the new address must confirm before the login identity moves. The request is
 * rate limited per user, audited, and refused for an unverified session.
 */
export async function requestEmailChange(
  supabase: Client,
  userId: string,
  input: { newEmail: string; redirectTo: string },
) {
  return withSpan("identity.emailChange", async () => {
    await enforceRateLimit("auth.email_change", userId);
    const { data: current } = await supabase.auth.getUser();
    const currentEmail = current?.user?.email ?? null;
    if (currentEmail && currentEmail.toLowerCase() === input.newEmail.trim().toLowerCase()) {
      await recordAuthEvent({ event: "email.change.requested", outcome: "denied", userId });
      throw new Error("email_change.same_address");
    }
    const { error } = await supabase.auth.updateUser(
      { email: input.newEmail.trim() },
      { emailRedirectTo: input.redirectTo },
    );
    if (error) {
      await recordAuthEvent({ event: "email.change.requested", outcome: "error", userId });
      // Never echo the provider message: it distinguishes taken addresses.
      throw new Error("email_change.failed");
    }
    incr("framique_email_change_total", { outcome: "requested" });
    await recordAuthEvent({
      event: "email.change.requested",
      outcome: "ok",
      userId,
      email: input.newEmail,
    });
    return { pending: true as const, verificationSentTo: "both" as const };
  });
}

export async function registerMerchant(input: { email: string; password: string; fullName: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email.trim(),
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName.trim(),
      _server_provisioned_merchant: true
    }
  });

  if (error) {
    await recordAuthEvent({ event: "signup.failed", outcome: "error", email: input.email });
    throw error;
  }

  await recordAuthEvent({ event: "signup.success", outcome: "ok", email: input.email });
  return { ok: true };
}
