/**
 * Cron authorization.
 *
 * Scheduled routes are reachable from the public internet, so every one of them
 * must prove the caller is the scheduler. Two credentials are accepted, in this
 * order:
 *
 *   1. `BILLING_CRON_SECRET` — the deployment env secret, compared in constant
 *      time. Preferred: no database round-trip.
 *   2. A scheduler token registered in `ops_cron_secrets`, verified through the
 *      service-role-only `ops_cron_token_valid()` function. This exists so the
 *      in-database scheduler (pg_cron) can hold its own credential without the
 *      env secret ever being readable from SQL.
 *
 * With neither configured the caller gets 404 — an unconfigured deploy exposes
 * no scheduled surface at all. Failures never echo which check failed.
 */
import { incr, log } from "./observability.server";

export type CronAuth = { ok: true } | { ok: false; response: Response };

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function tokenRegistered(token: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (
      supabaseAdmin as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc("ops_cron_token_valid", { _token: token });
    if (error) {
      log("error", "cron.token_check_failed", { message: error.message });
      return false;
    }
    return data === true;
  } catch {
    return false;
  }
}

/** Returns `{ ok: true }` or the exact Response the handler should return. */
export async function authorizeCron(request: Request, route: string): Promise<CronAuth> {
  const envSecret = process.env["BILLING_CRON_SECRET"];
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    incr("framique_cron_auth_total", { route, outcome: "unauthorized" });
    return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
  }
  const presented = auth.slice(7);

  if (envSecret && safeEqual(presented, envSecret)) {
    incr("framique_cron_auth_total", { route, outcome: "ok" });
    return { ok: true };
  }
  if (await tokenRegistered(presented)) {
    incr("framique_cron_auth_total", { route, outcome: "ok" });
    return { ok: true };
  }

  incr("framique_cron_auth_total", { route, outcome: "unauthorized" });
  log("warn", "cron.unauthorized", { route });
  return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
}
