/**
 * Tenancy foundation desk (BUILD.md §1.1).
 *
 * Everything here is platform-admin scoped: the purge lifecycle, the live
 * schema-drift verdict, and the runtime health of the cache/limiter/metrics
 * primitives. Nothing in this module trusts a client value.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import baseline from "../../supabase/schema.fingerprint.json";
import { requirePlatformAdmin } from "./platform.server";
import { cacheStats, cached } from "./cache.server";
import { enforceRateLimit } from "./rate-limit.server";
import { metricsSnapshot, withSpan, log } from "./observability.server";
import { privilegedRpc } from "./privileged-rpc.server";

type Client = SupabaseClient<Database>;
type Loose = {
  from: (t: string) => {
    select: (c: string) => {
      order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown }>;
    };
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const loose = (db: Client) => db as unknown as Loose;

export const SOFT_DELETE_TABLES = [
  "products",
  "product_variants",
  "categories",
  "brands",
  "collections",
  "coupons",
  "articles",
  "media_assets",
  "segments",
  "campaigns",
  "customers",
  "storefront_forms",
  "carriers",
  "fraud_rules",
] as const;

export type PurgeRow = {
  id: string;
  merchant_id: string;
  merchantName: string | null;
  status: string;
  reason: string;
  requested_at: string;
  scheduled_for: string;
  decided_at: string | null;
  row_counts: Record<string, number> | null;
  coolingElapsed: boolean;
};

type Fingerprint = {
  tables: Record<string, { columns: number; rls: boolean; policies: number }>;
  functions: string[];
};

export type DriftLine = { kind: "added" | "removed" | "changed" | "rls"; subject: string; detail: string };

function compare(live: Fingerprint): DriftLine[] {
  const base = baseline as unknown as Fingerprint;
  const out: DriftLine[] = [];
  const names = new Set([...Object.keys(base.tables), ...Object.keys(live.tables)]);
  for (const t of [...names].sort()) {
    const a = base.tables[t];
    const b = live.tables[t];
    if (!a) out.push({ kind: "added", subject: t, detail: "live only" });
    else if (!b) out.push({ kind: "removed", subject: t, detail: "snapshot only" });
    else {
      if (a.columns !== b.columns)
        out.push({ kind: "changed", subject: t, detail: `columns ${a.columns} → ${b.columns}` });
      if (a.policies !== b.policies)
        out.push({ kind: "changed", subject: t, detail: `policies ${a.policies} → ${b.policies}` });
      if (a.rls !== b.rls)
        out.push({ kind: "rls", subject: t, detail: `RLS ${a.rls} → ${b.rls}` });
    }
  }
  const baseFns = new Set(base.functions ?? []);
  for (const f of live.functions ?? [])
    if (!baseFns.has(f)) out.push({ kind: "added", subject: `${f}()`, detail: "live only" });
  for (const f of baseFns)
    if (!(live.functions ?? []).includes(f))
      out.push({ kind: "removed", subject: `${f}()`, detail: "snapshot only" });
  return out;
}

/** Tables with RLS off, or on with zero policies — the two shapes that leak. */
function isolationPosture(live: Fingerprint) {
  const rlsOff: string[] = [];
  const noPolicy: string[] = [];
  for (const [t, meta] of Object.entries(live.tables)) {
    if (!meta.rls) rlsOff.push(t);
    else if (meta.policies === 0) noPolicy.push(t);
  }
  return { total: Object.keys(live.tables).length, rlsOff, noPolicy };
}

export async function loadTenancyDesk(db: Client, userId: string) {
  await requirePlatformAdmin(db, userId);
  return withSpan("tenancy.desk", async () => {
    const [purge, merchants, fingerprint, softCounts] = await Promise.all([
      loose(db).from("tenant_purge_requests").select("*").order("requested_at", { ascending: false }),
      loose(db).from("merchants").select("id, name").order("name", { ascending: true }),
      cached("tenancy:fingerprint", 60, async () => {
        const { data } = await (await privilegedRpc()).rpc("schema_fingerprint", {});
        return data as Fingerprint;
      }),
      softDeleteCounts(db),
    ]);

    const names = new Map(
      ((merchants.data ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]),
    );
    const now = Date.now();
    const rows: PurgeRow[] = (
      (purge.data ?? []) as Omit<PurgeRow, "merchantName" | "coolingElapsed">[]
    ).map((r) => ({
      ...r,
      merchantName: names.get(r.merchant_id) ?? null,
      coolingElapsed: new Date(r.scheduled_for).getTime() <= now,
    }));

    const live = fingerprint ?? { tables: {}, functions: [] };
    return {
      rows,
      counts: {
        pending: rows.filter((r) => r.status === "pending").length,
        executed: rows.filter((r) => r.status === "executed").length,
        cancelled: rows.filter((r) => r.status === "cancelled").length,
      },
      merchants: [...names].map(([id, name]) => ({ id, name })),
      drift: compare(live),
      isolation: isolationPosture(live),
      softDelete: softCounts,
      runtime: { cache: cacheStats(), metrics: metricsSnapshot() },
    };
  });
}

async function softDeleteCounts(db: Client) {
  const results = await Promise.all(
    SOFT_DELETE_TABLES.map(async (t) => {
      const { data } = await loose(db).from(t).select("id, deleted_at").order("id", { ascending: true });
      const rows = (data ?? []) as { deleted_at: string | null }[];
      return {
        table: t,
        live: rows.filter((r) => r.deleted_at === null).length,
        tombstoned: rows.filter((r) => r.deleted_at !== null).length,
      };
    }),
  );
  return results;
}

export async function requestPurge(
  db: Client,
  userId: string,
  input: { merchantId: string; reason: string; delayDays: number },
) {
  await requirePlatformAdmin(db, userId);
  await enforceRateLimit("owner.purge", userId);
  // Executed as the admin: the routine records `requested_by` from auth.uid().
  const { data, error } = await loose(db).rpc("tenant_request_purge", {
    _merchant_id: input.merchantId,
    _reason: input.reason,
    _delay_days: input.delayDays,
  });
  if (error) throw new Error((error as { message: string }).message);
  log("warn", "tenant.purge_requested", { merchantId: input.merchantId, requestId: data });
  return { requestId: data as string };
}

export async function cancelPurge(
  db: Client,
  userId: string,
  input: { requestId: string; reason: string },
) {
  await requirePlatformAdmin(db, userId);
  const { error } = await loose(db).rpc("tenant_cancel_purge", {
    _request_id: input.requestId,
    _reason: input.reason,
  });
  if (error) throw new Error((error as { message: string }).message);
  log("info", "tenant.purge_cancelled", { requestId: input.requestId });
  return { ok: true };
}

export async function executePurge(db: Client, userId: string, requestId: string) {
  await requirePlatformAdmin(db, userId);
  await enforceRateLimit("owner.purge", userId);
  // Irreversible tenant deletion is a money-class action: a correctly
  // permissioned admin still needs a fresh second factor.
  const { requireStepUp } = await import("./identity.server");
  await requireStepUp(db, "purge", null);
  const { data, error } = await loose(db).rpc("tenant_execute_purge", { _request_id: requestId });

  if (error) throw new Error((error as { message: string }).message);
  log("warn", "tenant.purge_executed", { requestId, counts: data });
  return { counts: (data ?? {}) as Record<string, number> };
}

/**
 * Cron executor for elapsed cooling windows (BUILD.md §1.1). The database
 * function re-checks the window and the pending status inside the same
 * statement, so a duplicate cron tick cannot double-execute a request; each
 * result carries the per-table row counts it deleted for the audit trail.
 */
export async function runDuePurges(limit = 5) {
  return withSpan("tenancy.purge_cron", async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await loose(supabaseAdmin as unknown as Client).rpc(
      "tenant_purge_run_due",
      { _limit: limit },
    );
    if (error) throw new Error((error as { message: string }).message);
    const result = (data ?? { processed: 0, results: [] }) as {
      processed: number;
      results: Record<string, unknown>[];
    };
    if (result.processed > 0) log("warn", "tenant.purge_cron", { ...result });
    return result;
  });
}
