/**
 * Owner console operations: audited cross-tenant access, platform revenue,
 * merchant suspension with payment freeze, and consented impersonation.
 *
 * Every export here is a cross-tenant surface, so all of them go through
 * `ownerGate`: platform-admin check, named rate-limit bucket, Prometheus
 * counter, span, and an append-only row in `platform_audit_log`. Reads are
 * audited exactly like writes — §2.7 requires both.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { requirePlatformAdmin } from "./platform.server";
import { enforceRateLimit, type BucketName } from "./rate-limit.server";
import { incr, log, withSpan } from "./observability.server";
import { cached, invalidate } from "./cache.server";
import { churnWindow, revenueSnapshot, type SubscriptionRow } from "./revenue";

type Client = SupabaseClient<Database>;

export class OwnerError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "OwnerError";
  }
}

type GateOptions = {
  action: string;
  entity: string;
  entityId?: string | null;
  bucket: BucketName;
  /** `read` rows keep the audit trail honest about cross-tenant inspection. */
  kind: "read" | "write";
  meta?: Record<string, unknown>;
};

/**
 * One gate for every owner surface. Audit rows are written through the
 * security-definer RPC so the actor can never be forged from the client.
 */
export async function ownerGate<T>(
  db: Client,
  userId: string,
  opts: GateOptions,
  fn: () => Promise<T>,
): Promise<T> {
  await requirePlatformAdmin(db, userId);
  await enforceRateLimit(opts.bucket, userId);

  return withSpan(
    `owner.${opts.action}`,
    async () => {
      const out = await fn();
      incr("framique_owner_action_total", { action: opts.action, kind: opts.kind });
      const { error } = await db.rpc("platform_audit_event", {
        _action: opts.action,
        _entity: opts.entity,
        _entity_id: (opts.entityId ?? null) as unknown as string,
        _before: {} as Json,
        _after: (opts.meta ?? {}) as Json,
        _scope: opts.kind === "read" ? "owner_read" : "owner_write",
      });
      if (error) {
        // An unauditable owner action is a compliance failure, not a warning.
        incr("framique_owner_audit_failures_total", { action: opts.action });
        log("error", "owner.audit_write_failed", { action: opts.action, message: error.message });
        throw new OwnerError("owner.audit_unavailable", error.message);
      }
      return out;
    },
    { action: opts.action },
  );
}

// ------------------------------------------------------------------ audit feed

export type AuditFilter = {
  scope?: string | null;
  action?: string | null;
  entityId?: string | null;
  page?: number;
  pageSize?: number;
};

export async function loadOwnerAudit(db: Client, userId: string, filter: AuditFilter = {}) {
  const pageSize = Math.min(Math.max(filter.pageSize ?? 25, 5), 100);
  const page = Math.max(filter.page ?? 1, 1);
  const from = (page - 1) * pageSize;

  return ownerGate(
    db,
    userId,
    {
      action: "audit.read",
      entity: "platform_audit_log",
      bucket: "owner.read",
      kind: "read",
      meta: { scope: filter.scope ?? "all", page },
    },
    async () => {
      let q = db
        .from("platform_audit_log")
        .select("id, action, entity, entity_id, actor, scope, before_data, after_data, created_at", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (filter.scope) q = q.eq("scope", filter.scope);
      if (filter.action) q = q.ilike("action", `${filter.action}%`);
      if (filter.entityId) q = q.eq("entity_id", filter.entityId);

      const { data, count, error } = await q;
      if (error) throw new OwnerError("audit.read_failed", error.message);

      const scopes = await db.from("platform_audit_log").select("scope").limit(500);
      return {
        rows: data ?? [],
        total: count ?? 0,
        page,
        pageSize,
        scopes: [...new Set((scopes.data ?? []).map((r) => r.scope))].sort(),
      };
    },
  );
}

// --------------------------------------------------------------------- revenue

export async function loadRevenue(db: Client, userId: string) {
  return ownerGate(
    db,
    userId,
    {
      action: "revenue.read",
      entity: "platform",
      bucket: "owner.revenue",
      kind: "read",
    },
    async () =>
      // Platform-wide (not tenant) aggregate, so a shared key is safe.
      cached(
        "owner:revenue:v1",
        60,
        async () => {
          const [subs, plans, merchants] = await Promise.all([
            db
              .from("subscriptions")
              .select("merchant_id, plan, status, currency_code, cancelled_at, created_at"),
            db.from("plan_definitions").select("plan, currency_code, price_minor_int, title_en"),
            db.from("merchants").select("id, name, status"),
          ]);

          const rows: SubscriptionRow[] = (subs.data ?? []).map((s) => ({
            merchantId: s.merchant_id,
            plan: s.plan,
            status: s.status,
            currencyCode: s.currency_code,
            cancelledAt: s.cancelled_at,
            createdAt: s.created_at,
          }));
          const priced = (plans.data ?? []).map((p) => ({
            plan: p.plan,
            currencyCode: p.currency_code,
            priceMinorInt: p.price_minor_int,
          }));

          const snapshot = revenueSnapshot(rows, priced, "BDT");
          const planTitles = new Map((plans.data ?? []).map((p) => [p.plan, p.title_en]));
          const merchantRows = merchants.data ?? [];

          return {
            snapshot: {
              ...snapshot,
              perPlan: snapshot.perPlan.map((p) => ({
                ...p,
                title: planTitles.get(p.plan as never) ?? p.plan,
              })),
            },
            churn30: churnWindow(rows, 30),
            churn90: churnWindow(rows, 90),
            tenants: {
              total: merchantRows.length,
              active: merchantRows.filter((m) => m.status === "active").length,
              suspended: merchantRows.filter((m) => m.status === "suspended").length,
              pending: merchantRows.filter((m) => m.status === "pending").length,
            },
            generatedAt: new Date().toISOString(),
          };
        },
        { staleSeconds: 120 },
      ),
  );
}

// ------------------------------------------------------- suspend / reinstate

export type SuspensionRow = Database["public"]["Tables"]["merchant_suspensions"]["Row"];

export async function loadSuspensions(db: Client, userId: string) {
  return ownerGate(
    db,
    userId,
    { action: "suspension.read", entity: "merchant", bucket: "owner.read", kind: "read" },
    async () => {
      const [suspensions, merchants] = await Promise.all([
        db
          .from("merchant_suspensions")
          .select("*")
          .order("suspended_at", { ascending: false })
          .limit(200),
        db.from("merchants").select("id, name, slug, status").order("name"),
      ]);
      const names = new Map((merchants.data ?? []).map((m) => [m.id, m.name]));
      return {
        merchants: merchants.data ?? [],
        rows: (suspensions.data ?? []).map((s) => ({
          ...s,
          merchantName: names.get(s.merchant_id) ?? null,
          active: s.reinstated_at === null,
        })),
      };
    },
  );
}

export async function suspendMerchant(
  db: Client,
  userId: string,
  merchantId: string,
  reason: string,
  freezePayments: boolean,
) {
  return ownerGate(
    db,
    userId,
    {
      action: "merchant.suspend",
      entity: "merchant",
      entityId: merchantId,
      bucket: "owner.suspend",
      kind: "write",
      meta: { freeze_payments: freezePayments },
    },
    async () => {
      const { error } = await db.rpc("platform_merchant_suspend", {
        _merchant_id: merchantId,
        _reason: reason,
        _freeze_payments: freezePayments,
      });
      if (error) throw new OwnerError(mapRpcError(error.message), error.message);
      invalidate("owner:revenue");
      invalidate(`merchant:freeze:${merchantId}`);
      incr("framique_merchant_suspension_total", { outcome: "suspended" });
      return { ok: true };
    },
  );
}

export async function reinstateMerchant(
  db: Client,
  userId: string,
  merchantId: string,
  note: string | null,
) {
  return ownerGate(
    db,
    userId,
    {
      action: "merchant.reinstate",
      entity: "merchant",
      entityId: merchantId,
      bucket: "owner.suspend",
      kind: "write",
    },
    async () => {
      const { error } = await db.rpc("platform_merchant_reinstate", {
        _merchant_id: merchantId,
        _note: note ?? undefined,
      });
      if (error) throw new OwnerError(mapRpcError(error.message), error.message);
      invalidate("owner:revenue");
      invalidate(`merchant:freeze:${merchantId}`);
      incr("framique_merchant_suspension_total", { outcome: "reinstated" });
      return { ok: true };
    },
  );
}

/**
 * Payment freeze enforcement. Called from the charge/refund rails with the
 * service-role client: a suspended tenant with `payments_frozen` cannot move
 * money in either direction, even if a checkout was already in flight.
 */
export async function assertPaymentsNotFrozen(merchantId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const frozen = await cached(`merchant:freeze:${merchantId}`, 30, async () => {
    const { data } = await supabaseAdmin
      .from("merchant_suspensions")
      .select("id, payments_frozen")
      .eq("merchant_id", merchantId)
      .is("reinstated_at", null)
      .eq("payments_frozen", true)
      .maybeSingle();
    return Boolean(data);
  });
  if (frozen) {
    incr("framique_payment_freeze_block_total", {});
    log("warn", "payments.frozen_merchant_blocked", { merchantId });
    throw new OwnerError("payment.merchant_frozen");
  }
}

// --------------------------------------------------------------- impersonation

export type GrantRow = Database["public"]["Tables"]["impersonation_grants"]["Row"];

export type GrantState = "pending_consent" | "active" | "expired" | "revoked";

export function grantState(row: GrantRow, now = new Date()): GrantState {
  if (row.revoked_at) return "revoked";
  if (Date.parse(row.expires_at) <= now.getTime()) return "expired";
  return row.consent_at ? "active" : "pending_consent";
}

export async function loadImpersonation(db: Client, userId: string) {
  return ownerGate(
    db,
    userId,
    { action: "impersonation.read", entity: "impersonation_grants", bucket: "owner.read", kind: "read" },
    async () => {
      const [grants, merchants] = await Promise.all([
        db
          .from("impersonation_grants")
          .select("*")
          .order("requested_at", { ascending: false })
          .limit(100),
        db.from("merchants").select("id, name, slug").order("name"),
      ]);
      const names = new Map((merchants.data ?? []).map((m) => [m.id, m.name]));
      return {
        merchants: merchants.data ?? [],
        rows: (grants.data ?? []).map((g) => ({
          ...g,
          merchantName: names.get(g.merchant_id) ?? null,
          state: grantState(g),
        })),
      };
    },
  );
}

export async function requestImpersonation(
  db: Client,
  userId: string,
  input: { merchantId: string; reason: string; scope: "read" | "write"; minutes: number },
) {
  return ownerGate(
    db,
    userId,
    {
      action: "impersonation.request",
      entity: "merchant",
      entityId: input.merchantId,
      bucket: "owner.impersonate",
      kind: "write",
      meta: { scope: input.scope, minutes: input.minutes },
    },
    async () => {
      const { data, error } = await db.rpc("impersonation_request", {
        _merchant_id: input.merchantId,
        _reason: input.reason,
        _scope: input.scope,
        _minutes: input.minutes,
      });
      if (error) throw new OwnerError(mapRpcError(error.message), error.message);
      incr("framique_impersonation_total", { outcome: "requested" });
      return { grant: data as unknown as GrantRow };
    },
  );
}

export async function revokeImpersonation(db: Client, userId: string, grantId: string) {
  return ownerGate(
    db,
    userId,
    {
      action: "impersonation.revoke",
      entity: "impersonation_grant",
      entityId: grantId,
      bucket: "owner.impersonate",
      kind: "write",
    },
    async () => {
      const { error } = await db.rpc("impersonation_revoke", { _grant_id: grantId });
      if (error) throw new OwnerError(mapRpcError(error.message), error.message);
      incr("framique_impersonation_total", { outcome: "revoked" });
      return { ok: true };
    },
  );
}

/**
 * Spend one impersonated access. The RPC re-checks consent, expiry and
 * revocation server-side, so a stale browser tab cannot keep a window open.
 */
export async function useImpersonation(
  db: Client,
  userId: string,
  grantId: string,
  action: string,
) {
  await requirePlatformAdmin(db, userId);
  await enforceRateLimit("owner.impersonate_use", userId);
  const { data, error } = await db.rpc("impersonation_use", {
    _grant_id: grantId,
    _action: action,
  });
  if (error) {
    incr("framique_impersonation_total", { outcome: "denied" });
    throw new OwnerError(mapRpcError(error.message), error.message);
  }
  incr("framique_impersonation_total", { outcome: "used" });
  return { grant: data as unknown as GrantRow };
}

// ------------------------------------------------- merchant side of consent

/** Merchant-facing: grants awaiting this tenant's approval. No owner gate. */
export async function merchantConsentQueue(db: Client, merchantId: string) {
  const { data } = await db
    .from("impersonation_grants")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("requested_at", { ascending: false })
    .limit(20);
  return {
    rows: (data ?? []).map((g) => ({ ...g, state: grantState(g) })),
  };
}

export async function respondToImpersonation(db: Client, grantId: string, approve: boolean) {
  const { error } = await db.rpc("impersonation_consent", {
    _grant_id: grantId,
    _approve: approve,
  });
  if (error) throw new OwnerError(mapRpcError(error.message), error.message);
  incr("framique_impersonation_total", { outcome: approve ? "consented" : "declined" });
  return { ok: true };
}

function mapRpcError(message: string) {
  const known = [
    "platform.forbidden",
    "merchant.not_found",
    "merchant.already_suspended",
    "merchant.not_suspended",
    "suspend.reason_required",
    "impersonation.reason_required",
    "impersonation.already_pending",
    "impersonation.consent_required",
    "impersonation.consent_forbidden",
    "impersonation.expired",
    "impersonation.not_found",
  ];
  return known.find((k) => message.includes(k)) ?? "owner.operation_failed";
}
