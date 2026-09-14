/**
 * RLS allow/deny matrix.
 *
 * Every tenant table must be invisible to the anonymous role, and the handful
 * of deliberately public tables must stay readable — a storefront that cannot
 * read `products` is as broken as a ledger that anyone can read. The suite
 * talks to the Data API with the publishable key, exactly as a browser would,
 * so it tests the policies that actually ship rather than a local mock.
 *
 * Writes are probed too: RLS that allows an anonymous INSERT is a silent
 * tenant-data breach that a read-only matrix would never catch.
 */
import { describe, expect, it } from "vitest";

const url = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
const key =
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";

const configured = Boolean(url && key);
const d = configured ? describe : describe.skip;

/** Public by design: the storefront and the pricing page read these anonymously. */
const ALLOW_READ = [
  "merchants",
  "products",
  "product_variants",
  "categories",
  "collections",
  "collection_products",
  "plan_definitions",
  "storefront_pages",
  "store_themes",
  "vat_rates",
];

/**
 * Column-scoped public reads. `merchant_settings` is readable anonymously for
 * shipping/COD configuration only — `business_bin` is a tax identifier and is
 * revoked at the column level, so `select=*` must fail.
 */
const PUBLIC_COLUMNS = "merchant_id,cod_enabled,shipping_flat_minor_int,support_email";
const PRIVATE_COLUMNS: Array<[string, string]> = [["merchant_settings", "business_bin"]];

/** Tenant, money, identity and risk data. Anonymous reads must return nothing. */
const DENY_READ = [
  "orders",
  "order_items",
  "order_events",
  "payments",
  "refunds",
  "charge_intents",
  "wallet_ledger_entries",
  "settlement_files",
  "settlement_items",
  "invoices",
  "subscriptions",
  "subscribers",
  "customers",
  "customer_addresses",
  "customer_consents",
  "api_keys",
  "api_key_events",
  "auth_events",
  "auth_sessions",
  "staff_roles",
  "staff_audit",
  "merchant_members",
  "merchant_kyc",
  "fraud_cases",
  "fraud_rules",
  "fraud_blacklist",
  "fraud_audit",
  "ai_conversations",
  "ai_messages",
  "webhook_events",
  "gateway_accounts",
  "platform_admins",
  "platform_audit_log",
  "export_jobs",
  "pos_sessions",
  "pos_orders",
  "digital_assets",
  "digital_grants",
  "campaigns",
  "campaign_sends",
  "segments",
  "coupons",
  "coupon_redemptions",
  "notifications",
  "activity_log",
  "payouts",
  "payout_accounts",
  "payout_approvals",
  "payout_holds",
  "payout_events",
];

/** Anonymous writes must be refused everywhere, public tables included. */
const DENY_WRITE: Array<[string, Record<string, unknown>]> = [
  ["orders", { status: "pending" }],
  ["products", { title_en: "rls-probe" }],
  ["merchants", { name: "rls-probe", slug: "rls-probe" }],
  ["platform_admins", { user_id: "00000000-0000-4000-8000-000000000000" }],
  ["fraud_blacklist", { kind: "phone", value: "+8801700000000" }],
  ["wallet_ledger_entries", { amount_minor_int: 1 }],
  ["activity_log", { resource_type: "rls-probe", action: "created" }],
  ["notifications", { kind: "rls-probe", title_en: "x", title_bn: "x" }],
];

async function read(table: string) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: key },
  });
  const body = res.status === 200 ? ((await res.json()) as unknown[]) : [];
  return { status: res.status, rows: body };
}

async function write(table: string, row: Record<string, unknown>) {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  return res.status;
}

/**
 * RPC allow/deny matrix.
 *
 * EXECUTE on `public` routines is explicit: the storefront allowlist is
 * callable anonymously, everything privileged is not. A grant added by
 * accident is invisible in the UI but hands an anonymous caller a
 * SECURITY DEFINER routine, so the boundary is asserted here.
 */
const NIL = "00000000-0000-4000-8000-000000000000";

const RPC_ALLOW_ANON: Array<[string, Record<string, unknown>]> = [
  ["storefront_search", { _slug: "rls-probe", _q: "probe", _limit: 1, _offset: 0 }],
  ["review_agg", { _product_id: NIL }],
  ["product_recommendations", { _merchant_id: NIL, _product_id: NIL, _limit: 1 }],
  ["storefront_payment_methods", { _slug: "rls-probe" }],
  ["order_public_view", { _order_id: NIL, _token: "rls-probe" }],
];

/**
 * Server-only and signed-in-only routines. Each is probed with its real
 * argument names — a wrong-arity call answers 404 whether or not the grant
 * exists, so only a signature-matching probe proves the routine is out of
 * reach for the anonymous role.
 */
const RPC_DENY_ANON: Array<[string, Record<string, unknown>]> = [
  // Cron sweeps.
  ["billing_sweep", {}],
  ["notifications_sweep", {}],
  ["theme_sweep", { _limit: 1 }],
  ["support_sla_sweep", {}],
  ["courier_sweep", {}],
  ["ops_cron_reap_stale", {}],
  ["ops_retention_sweep", {}],
  ["stock_hold_sweep", {}],
  ["schema_fingerprint", {}],
  // Ingest paths reached only by verified webhooks and the cron runner.
  ["courier_ingest_event", { _carrier_code: "x", _awb: "x", _event_id: "x", _status: "in_transit" }],
  ["courier_replay_event", { _id: NIL, _merchant_id: NIL }],
  ["gateway_apply_webhook", { _provider: "bkash", _webhook_id: "x", _merchant_id: NIL }],
  ["ops_cron_claim", { _key: "x", _token: "x", _trigger: "x", _lease_seconds: 1 }],
  ["ops_cron_token_valid", { _token: "x" }],
  ["analytics_ingest", { _merchant_id: NIL, _events: [] }],
  ["analytics_flush", { _merchant_id: NIL }],
  ["analytics_claim_conversions", { _limit: 1 }],
  ["analytics_claim_reports", { _limit: 1 }],
  // POS, stock holds and the limiter.
  ["pos_shift_report", { _merchant_id: NIL, _session_id: NIL }],
  ["pos_move_stock", { _merchant_id: NIL, _location_id: NIL, _variant_id: NIL, _delta: 0 }],
  ["stock_hold_release", { _checkout_token: "x" }],
  ["rate_limit_hit", { _bucket: "x", _subject: "x", _limit: 1, _window_seconds: 1 }],
  // Platform governance: admin-gated inside the routine, never anonymous.
  ["platform_save_plan", { _plan: {} }],
  ["platform_set_flag", { _key: "x", _value: {} }],
  ["platform_set_tenant_limits", { _merchant_id: NIL, _products_limit: 1, _staff_limit: 1 }],
  ["platform_clear_tenant_limits", { _merchant_id: NIL }],
  ["platform_audit_event", { _action: "x", _entity: "x" }],
  ["platform_merchant_suspend", { _merchant_id: NIL, _reason: "x" }],
  ["platform_merchant_reinstate", { _merchant_id: NIL, _note: "x" }],
  ["tenant_request_purge", { _merchant_id: NIL, _reason: "x", _delay_days: 30 }],
  ["tenant_cancel_purge", { _request_id: NIL, _reason: "x" }],
  ["tenant_execute_purge", { _request_id: NIL }],
  // Merchant desks: signed-in callers only, identity checked internally.
  ["billing_plan_change", { _merchant_id: NIL, _target: "growth", _actor: "x" }],
  ["billing_trial_claim", { _merchant_id: NIL, _fingerprint: "x", _actor: "x" }],
  ["sku_next", { _merchant_id: NIL, _prefix: "SKU" }],
  ["merchant_save_setup", { _merchant_id: NIL }],
  ["customer_self", { _merchant_id: NIL }],
  // Shopper account reads: identity asserted from auth.uid() inside the routine.
  ["customer_overview", { _merchant_id: NIL }],
  ["customer_order_detail", { _merchant_id: NIL, _order_id: NIL }],
  ["customer_require_self", { _merchant_id: NIL }],
  ["customer_overview_impl", { _merchant_id: NIL }],
  ["customer_order_detail_impl", { _merchant_id: NIL, _order_id: NIL }],
];

async function rpc(fn: string, args: Record<string, unknown> = {}) {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const body = (await res.text()).slice(0, 400);
  return { status: res.status, body };
}

async function readColumns(table: string, columns: string) {
  const res = await fetch(`${url}/rest/v1/${table}?select=${columns}&limit=1`, {
    headers: { apikey: key },
  });
  return res.status;
}

d("RLS matrix — anonymous role", () => {
  it.each(ALLOW_READ)("allows reading %s", async (table) => {
    const { status } = await read(table);
    expect(status, `${table} should be readable by anon`).toBe(200);
  });

  it.each(DENY_READ)("returns no rows from %s", async (table) => {
    const { status, rows } = await read(table);
    if (status === 200) {
      expect(rows, `${table} exposed rows to the anonymous role`).toEqual([]);
    } else {
      expect([401, 403, 404]).toContain(status);
    }
  });

  it.each(DENY_WRITE)("refuses an insert into %s", async (table, row) => {
    const status = await write(table, row);
    expect(status, `${table} accepted an anonymous insert`).toBeGreaterThanOrEqual(400);
  });

  it.each(ALLOW_READ)("still reaches %s with an empty catalogue", async (table) => {
    // A 200 with zero rows is a real answer; the deny cases above are asserted
    // separately, so this stays meaningful on an unseeded database.
    const { status } = await read(table);
    expect(status).toBe(200);
  });

  it("reads the public settings columns but not the tax identifier", async () => {
    expect(
      await readColumns("merchant_settings", PUBLIC_COLUMNS),
      "storefront settings columns must stay readable",
    ).toBe(200);
    for (const [table, column] of PRIVATE_COLUMNS) {
      expect(
        await readColumns(table, column),
        `${table}.${column} must not be readable anonymously`,
      ).toBeGreaterThanOrEqual(400);
    }
  });
});

d("RPC matrix — anonymous role", () => {
  it.each(RPC_DENY_ANON)("refuses %s", async (fn, args) => {
    const { status, body } = await rpc(fn, args);
    // PostgREST hides routines the role cannot execute: 404 PGRST202, or an
    // explicit 401/403. Anything else means the routine ran.
    expect([401, 403, 404], `${fn} was callable anonymously (${status} ${body})`).toContain(status);
  });

  it.each(RPC_ALLOW_ANON)("keeps %s reachable", async (fn, args) => {
    const { status, body } = await rpc(fn, args);
    expect(status, `${fn} is no longer reachable anonymously (${body})`).toBeLessThan(400);
  });

  it("the deny probe is not vacuous — the same shape of call succeeds elsewhere", async () => {
    const denied = await rpc("platform_clear_tenant_limits", { _merchant_id: NIL });
    const allowed = await rpc("review_agg", { _product_id: NIL });
    expect([401, 403, 404]).toContain(denied.status);
    expect(allowed.status).toBeLessThan(400);
  });
});
