/**
 * RPC contract.
 *
 * Every `rpc("…")` in `src/` names a database routine. If that routine does
 * not exist, the feature is dead on arrival at runtime and no unit test that
 * mocks Supabase will ever notice. This suite reads the call sites straight
 * out of the source tree and asks the live database which ones resolve.
 *
 * `PENDING` is a shrinking quarantine list: routines the product still calls
 * but has not implemented yet (P0.6). Two rules keep it honest:
 *   • a call site that is missing and NOT in `PENDING` fails the build — no
 *     new broken call sites;
 *   • a name in `PENDING` that now exists fails the build too, so the list
 *     cannot rot once the routine lands.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const url = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
const key =
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";

const d = url && key ? describe : describe.skip;

/** Routines the app calls that are not implemented yet. Only ever shrinks. */
const PENDING = new Set([
  "approval_decide",
  "approval_submit",
  "bulk_update_variants",
  "catalog_import_apply",
  "catalog_import_dry_run",
  "collection_resolve",
  "consent_record",
  "content_desk_authors",
  "content_desk_counts",
  "experiment_assign",
  "experiment_convert",
  "form_submit",
  "impersonation_consent",
  "impersonation_request",
  "impersonation_revoke",
  "impersonation_use",
  "inventory_transfer_receive",
  "kyc_submit",
  "market_apply_theme_install",
  "market_payout_accrue",
  "market_payout_settle",
  "market_revert_theme_install",
  "market_review_submit",
  "money_conformance",
  "notifications_mark_read",
  "notifications_sweep",
  "ops_retention_sweep",
  "ops_status_public",
  "price_for_customer",
  "rate_limit_hit",
  "sku_next",
  "storefront_recently_viewed",
  "storefront_track_view",
  "subscription_claim_due",
  "subscription_settle_charge",
  "support_kb_search",
  "support_sla_sweep",
  "tenant_cancel_purge",
  "tenant_execute_purge",
  "tenant_request_purge",
  "tenant_purge_run_due",
  "theme_sweep",
]);

/** The money loop: these must never regress into `PENDING`. */
const MONEY_LOOP = [
  "charge_intent_open",
  "charge_intent_advance",
  "refund_request",
  "refund_advance",
  "order_amend",
  "order_invoice_issue",
  "fulfilment_create",
  "return_open",
  "return_advance",
  "dispute_advance",
  "gateway_apply_webhook",
  "settlement_ingest",
  "cod_reconcile",
  "pos_sale_capture",
  "pos_refund",
];

const SKIP_DIRS = new Set(["node_modules", "dist", ".output", ".vinxi"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function callSites(): string[] {
  const names = new Set<string>();
  for (const file of walk("src")) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\brpc\(\s*"([a-z0-9_]+)"/g)) names.add(match[1]!);
  }
  return [...names].sort();
}

async function present(names: string[]): Promise<Set<string>> {
  const res = await fetch(`${url}/rest/v1/rpc/rpc_contract_check`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ _names: names }),
  });
  if (!res.ok) throw new Error(`rpc_contract_check failed: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as { name: string; present: boolean }[];
  return new Set(rows.filter((r) => r.present).map((r) => r.name));
}

d("RPC contract — every rpc() call site resolves", () => {
  it("finds call sites to check", () => {
    expect(callSites().length).toBeGreaterThan(50);
  });

  it("has no unresolved call site outside the pending list", async () => {
    const names = callSites();
    const have = await present(names);
    const broken = names.filter((n) => !have.has(n) && !PENDING.has(n));
    expect(broken, `these rpc() calls have no database routine: ${broken.join(", ")}`).toEqual([]);
  });

  it("keeps the pending list free of routines that already exist", async () => {
    const names = callSites();
    const have = await present(names);
    const stale = names.filter((n) => have.has(n) && PENDING.has(n));
    expect(stale, `implemented — remove from PENDING: ${stale.join(", ")}`).toEqual([]);
  });

  it("keeps the money loop implemented", async () => {
    const have = await present(MONEY_LOOP);
    const missing = MONEY_LOOP.filter((n) => !have.has(n));
    expect(missing, `money-loop routines missing: ${missing.join(", ")}`).toEqual([]);
    for (const name of MONEY_LOOP) expect(PENDING.has(name), name).toBe(false);
  });
});
