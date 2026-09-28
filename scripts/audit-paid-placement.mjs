#!/usr/bin/env node
/**
 * T1 audit script (READ-ONLY): report `paid` online orders without settlement.
 *
 * Lists orders stuck at `paid` that never went through a verified settlement:
 * no `charge_intents` row in `paid` status, and no genuine `payments` row
 * (a `MOCK-*` provider_reference is the pre-fix placement artifact, not
 * evidence of money moved). COD orders are excluded by design.
 *
 * This script NEVER writes. It issues PostgREST SELECTs only and exits 0
 * with the report; non-zero means the report itself failed, not that data
 * is bad (a suspect list is a normal, successful output).
 *
 * Predicate mirrors `src/lib/paid-settlement-audit.ts`
 * (`findPaidWithoutSettlement`), which carries the unit tests.
 *
 * Usage:
 *   SUPABASE_URL=https://xyz.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *     node scripts/audit-paid-placement.mjs [--json] [--merchant <uuid>]
 *
 * Env:
 *   SUPABASE_URL                PostgREST base URL (required)
 *   SUPABASE_SERVICE_ROLE_KEY   service-role key, read use only (required)
 */

const PLACEMENT_REF_PREFIX = "MOCK-";

function isSettlementPayment(p) {
  if (p.payment_status !== "paid") return false;
  return !(p.provider_reference ?? "")
    .toUpperCase()
    .startsWith(PLACEMENT_REF_PREFIX);
}

export function findPaidWithoutSettlement(orders, intents, payments) {
  const paidIntents = new Set(
    intents.filter((i) => i.status === "paid").map((i) => i.order_id),
  );
  const settledOrders = new Set(
    payments.filter(isSettlementPayment).map((p) => p.order_id),
  );
  const out = [];
  for (const o of orders) {
    if (o.status !== "paid") continue;
    if (o.payment_method === "cod") continue;
    const hasIntent = paidIntents.has(o.id);
    const hasPayment = settledOrders.has(o.id);
    if (hasIntent && hasPayment) continue;
    out.push({
      orderId: o.id,
      orderNumber: o.order_number ?? null,
      merchantId: o.merchant_id ?? null,
      method: o.payment_method,
      totalMinor:
        typeof o.total_minor_int === "number" ? o.total_minor_int : null,
      createdAt: o.created_at ?? null,
      reason: !hasIntent ? "no_paid_settlement_intent" : "no_settlement_payment_row",
    });
  }
  return out;
}

async function rest(base, key, path) {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const mIdx = args.indexOf("--merchant");
  const merchant = mIdx >= 0 ? args[mIdx + 1] : null;

  const base = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!base || !key) {
    console.error(
      "audit-paid-placement: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read-only report, no writes).",
    );
    process.exit(2);
  }

  const scope = merchant ? `&merchant_id=eq.${merchant}` : "";
  const orders = await rest(
    base,
    key,
    `orders?select=id,order_number,merchant_id,payment_method,status,total_minor_int,created_at&status=eq.paid&payment_method=neq.cod${scope}&order=created_at.asc&limit=1000`,
  );
  const ids = orders.map((o) => o.id);
  let intents = [];
  let payments = [];
  if (ids.length > 0) {
    const list = `in.(${ids.join(",")})`;
    [intents, payments] = await Promise.all([
      rest(base, key, `charge_intents?select=order_id,status,method&order_id=${list}&limit=5000`),
      rest(
        base,
        key,
        `payments?select=order_id,payment_status,provider_reference&order_id=${list}&limit=5000`,
      ),
    ]);
  }

  const suspects = findPaidWithoutSettlement(orders, intents, payments);
  if (asJson) {
    console.log(JSON.stringify({ scanned: orders.length, suspects }, null, 2));
    return;
  }
  console.log(`audit-paid-placement: scanned ${orders.length} paid online order(s)`);
  if (suspects.length === 0) {
    console.log("OK: every paid online order has a paid settlement intent + payment row.");
    return;
  }
  console.log(`ACTION: ${suspects.length} suspect(s) need ops review (paid without settlement):`);
  for (const s of suspects) {
    console.log(
      ` - ${s.orderNumber ?? s.orderId} [${s.method}] total=${s.totalMinor ?? "?"} created=${s.createdAt ?? "?"} reason=${s.reason}`,
    );
  }
}

const isMain = process.argv[1] === new URL(import.meta.url).pathname;
if (isMain) {
  main().catch((e) => {
    console.error(`audit-paid-placement: report failed: ${e.message}`);
    process.exit(1);
  });
}
