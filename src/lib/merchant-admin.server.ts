/**
 * Merchant admin backbone: store-setup checklist, alert feed and activity log.
 *
 * Every read is tenant scoped through RLS (the caller's own Supabase client),
 * burst limited, span traced and counted. Nothing here trusts a client supplied
 * merchant id: the scope always comes from the authenticated membership.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cached } from "./cache.server";
import { incr, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";

type Client = SupabaseClient<Database>;

export class AdminError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "AdminError";
  }
}

function fail(message: string | undefined): never {
  throw new AdminError(message ?? "common.error");
}

export const SETUP_STEPS = [
  { key: "profile", href: "/admin/settings" },
  { key: "payments", href: "/admin/payments" },
  { key: "shipping", href: "/admin/shipping" },
  { key: "courier", href: "/admin/shipping" },
  { key: "product", href: "/admin/products" },
  { key: "theme", href: "/admin/builder" },
  { key: "vat", href: "/admin/settings" },
  { key: "kyc", href: "/admin/staff" },
] as const;

export type SetupStep = {
  key: (typeof SETUP_STEPS)[number]["key"];
  href: string;
  done: boolean;
};

export type SetupState = {
  steps: SetupStep[];
  done: number;
  total: number;
  complete: boolean;
  dismissedAt: string | null;
};

export type NotificationRow = {
  id: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  titleEn: string;
  titleBn: string;
  bodyEn: string;
  bodyBn: string;
  href: string | null;
  read: boolean;
  createdAt: string;
};

export type ActivityRow = {
  id: string;
  actor: string | null;
  resourceType: string;
  resourceId: string | null;
  action: string;
  fields: { field: string; before: string; after: string }[];
  createdAt: string;
};

function rpcClient(supabase: Client) {
  return supabase as unknown as {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

export async function loadSetupState(
  supabase: Client,
  merchantId: string,
  opts: { fresh?: boolean } = {},
): Promise<SetupState> {
  const read = async () => {
    const { data, error } = await rpcClient(supabase).rpc("merchant_setup_state", {
      _merchant_id: merchantId,
    });
    if (error) fail(error.message);
    return (data ?? {}) as Record<string, unknown>;
  };

  const raw = opts.fresh
    ? await read()
    : await cached(`setup:${merchantId}`, 30, read, { staleSeconds: 60 });

  const steps: SetupStep[] = SETUP_STEPS.map((s) => ({
    key: s.key,
    href: s.href,
    done: raw[s.key] === true,
  }));
  const done = steps.filter((s) => s.done).length;
  return {
    steps,
    done,
    total: steps.length,
    complete: done === steps.length,
    dismissedAt: (raw["dismissed_at"] as string | null) ?? null,
  };
}

export async function saveSetup(
  supabase: Client,
  merchantId: string,
  userId: string,
  patch: Record<string, unknown>,
): Promise<SetupState> {
  return withSpan("admin.setup_save", async () => {
    await enforceRateLimit("admin.setup", userId);
    const { error } = await rpcClient(supabase).rpc("merchant_save_setup", {
      _merchant_id: merchantId,
      _patch: patch,
    });
    if (error) fail(error.message);
    incr("framique_admin_setup_saved_total");
    return loadSetupState(supabase, merchantId, { fresh: true });
  });
}

export async function loadNotifications(
  supabase: Client,
  merchantId: string,
  userId: string,
  limit = 20,
): Promise<{ items: NotificationRow[]; unread: number }> {
  return withSpan("admin.notifications", async () => {
    await enforceRateLimit("admin.notifications", userId);
    const [feed, unread] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, kind, severity, title_en, title_bn, body_en, body_bn, href, read_at, created_at")
        .eq("merchant_id", merchantId)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 50)),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", merchantId)
        .is("archived_at", null)
        .is("read_at", null),
    ]);
    if (feed.error) fail(feed.error.message);

    return {
      unread: unread.count ?? 0,
      items: (feed.data ?? []).map((n) => ({
        id: n.id,
        kind: n.kind,
        severity: n.severity,
        titleEn: n.title_en,
        titleBn: n.title_bn,
        bodyEn: n.body_en,
        bodyBn: n.body_bn,
        href: n.href,
        read: Boolean(n.read_at),
        createdAt: n.created_at,
      })),
    };
  });
}

export async function markNotificationsRead(
  supabase: Client,
  merchantId: string,
  userId: string,
  ids: string[] | null,
): Promise<number> {
  await enforceRateLimit("admin.notifications", userId);
  const { data, error } = await rpcClient(supabase).rpc("notifications_mark_read", {
    _merchant_id: merchantId,
    _ids: ids,
  });
  if (error) fail(error.message);
  incr("framique_admin_notifications_read_total", {}, Number(data ?? 0));
  return Number(data ?? 0);
}

const REDACT = /(secret|token|hash|password|key)/i;

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length > 80 ? `${value.slice(0, 77)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return Array.isArray(value) ? `${value.length} item(s)` : "object";
}

export async function listActivity(
  supabase: Client,
  merchantId: string,
  userId: string,
  input: { cursor?: string | null; resourceType?: string | null; action?: string | null; limit?: number },
): Promise<{ rows: ActivityRow[]; nextCursor: string | null }> {
  return withSpan("admin.activity", async () => {
    await enforceRateLimit("admin.activity", userId);
    const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);

    let q = supabase
      .from("activity_log")
      .select("id, actor, resource_type, resource_id, action, changed, created_at")
      .eq("merchant_id", merchantId)
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (input.cursor) q = q.lt("id", Number(input.cursor));
    if (input.resourceType) q = q.eq("resource_type", input.resourceType);
    if (input.action) q = q.eq("action", input.action);

    const { data, error } = await q;
    if (error) fail(error.message);

    const page = (data ?? []).slice(0, limit);
    const actorIds = Array.from(new Set(page.map((r) => r.actor).filter((a): a is string => !!a)));
    const { data: profiles } = actorIds.length
      ? await supabase.from("profiles").select("id, email, full_name").in("id", actorIds)
      : { data: [] as { id: string; email: string | null; full_name: string | null }[] };

    const nameOf = (id: string | null) => {
      if (!id) return null;
      const p = (profiles ?? []).find((row) => row.id === id);
      return p?.full_name || p?.email || `${id.slice(0, 8)}…`;
    };

    const rows: ActivityRow[] = page.map((r) => {
      const changed = (r.changed ?? {}) as Record<string, { before?: unknown; after?: unknown }>;
      return {
        id: String(r.id),
        actor: nameOf(r.actor),
        resourceType: r.resource_type,
        resourceId: r.resource_id,
        action: r.action,
        createdAt: r.created_at,
        fields: Object.entries(changed)
          .filter(([field]) => !REDACT.test(field))
          .slice(0, 6)
          .map(([field, diff]) => ({
            field,
            before: renderValue(diff?.before),
            after: renderValue(diff?.after),
          })),
      };
    });

    return {
      rows,
      nextCursor: (data ?? []).length > limit ? String(page[page.length - 1]?.id ?? "") : null,
    };
  });
}
