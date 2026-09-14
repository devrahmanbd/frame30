/**
 * Entitlement enforcement runtime.
 *
 * One rule, one call site shape: any write that consumes a metered resource
 * calls `assertEntitlement()` *before* it writes, and the same snapshot powers
 * the usage panel the merchant has been looking at. The snapshot itself comes
 * from `public.cms_entitlements()` (SECURITY DEFINER), so caps and usage are
 * counted by the database in one round trip and cannot be spoofed by a client.
 *
 * Caching: usage moves on every save, so the snapshot is cached for a short
 * window only — long enough to stop the editor's autosave loop from counting
 * rows every three seconds, short enough that a merchant who deletes an article
 * can immediately create another one.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  EntitlementError,
  normalizeSnapshot,
  usageReport,
  verdictFor,
  type EntitlementResource,
  type EntitlementSnapshot,
} from "./entitlements";
import { incr, log } from "./observability.server";

type Client = SupabaseClient<Database>;
type Rpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const TTL_MS = 15_000;
const cache = new Map<string, { at: number; snapshot: EntitlementSnapshot }>();
/** Bounded so a busy worker cannot grow the map without limit. */
const MAX_CACHE_ENTRIES = 500;

export function invalidateEntitlements(merchantId: string) {
  cache.delete(merchantId);
}

export async function entitlementSnapshot(
  db: Client,
  merchantId: string,
  opts: { fresh?: boolean } = {},
): Promise<EntitlementSnapshot> {
  const hit = cache.get(merchantId);
  if (!opts.fresh && hit && Date.now() - hit.at < TTL_MS) return hit.snapshot;

  const { data, error } = await (db as unknown as Rpc).rpc("cms_entitlements", {
    _merchant_id: merchantId,
  });
  if (error) {
    // Fail *closed* on the caps we can reason about is impossible without data,
    // so instead we fail loudly: a limits outage is an incident, not a silent
    // "unlimited" grant. Callers translate this into a retryable message.
    incr("framique_entitlement_snapshot_total", { outcome: "error" });
    log("error", "entitlements.snapshot_failed", { merchantId, message: error.message.slice(0, 160) });
    throw new Error("entitlements_unavailable");
  }

  const snapshot = normalizeSnapshot(data);
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(merchantId, { at: Date.now(), snapshot });
  incr("framique_entitlement_snapshot_total", { outcome: "ok", plan: snapshot.plan });
  return snapshot;
}

/**
 * Throws `EntitlementError` when a hard cap would be crossed. Soft resources
 * (revision retention) return the verdict so the caller can trim instead of
 * refusing the merchant's work.
 */
export async function assertEntitlement(
  db: Client,
  merchantId: string,
  resource: EntitlementResource,
  requested = 1,
) {
  const snapshot = await entitlementSnapshot(db, merchantId);
  const verdict = verdictFor(snapshot, resource, requested);
  if (verdict.level !== "ok") {
    incr("framique_plan_limit_total", {
      resource,
      level: verdict.level,
      plan: snapshot.plan,
    });
  }
  if (!verdict.allowed) {
    log("warn", "entitlements.blocked", {
      merchantId,
      resource,
      plan: snapshot.plan,
      used: verdict.used,
      cap: verdict.cap,
    });
    throw new EntitlementError(verdict);
  }
  return { snapshot, verdict };
}

/**
 * Same check, no exception — for surfaces that must render a disabled button
 * with a reason rather than react to a thrown error.
 */
export async function entitlementCheck(
  db: Client,
  merchantId: string,
  resource: EntitlementResource,
  requested = 1,
) {
  const snapshot = await entitlementSnapshot(db, merchantId);
  return verdictFor(snapshot, resource, requested);
}

export async function entitlementPanel(db: Client, merchantId: string, fresh = false) {
  const snapshot = await entitlementSnapshot(db, merchantId, { fresh });
  const report = usageReport(snapshot);
  return {
    plan: snapshot.plan,
    status: snapshot.status,
    trialEndsAt: snapshot.trialEndsAt,
    resources: report,
    blocking: report.filter((r) => r.level === "block").map((r) => r.resource),
    warning: report.filter((r) => r.level === "warn").map((r) => r.resource),
  };
}