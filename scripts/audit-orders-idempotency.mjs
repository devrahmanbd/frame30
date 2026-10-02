#!/usr/bin/env node
/**
 * Report-first duplicate audit for the orders idempotency backstop.
 *
 *   node scripts/audit-orders-idempotency.mjs           # print duplicate groups
 *   node scripts/audit-orders-idempotency.mjs --json    # machine-readable output
 *
 * SELECT-only: never writes. Exit 0 when no duplicate
 * (merchant_id, idempotency_key) groups exist, exit 2 when duplicates need a
 * human decision, exit 1 on infrastructure failure.
 *
 * Flow (enforced by the 20260928000000 migration contract): run this report,
 * disposition each group (keep the EARLIEST row per tuple — same merchant+key
 * is the same placement event by construction; rows with a NULL key never
 * conflict), and only then apply a constrained delete + the UNIQUE index.
 * The migration itself must never rewrite order history at deploy time.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function env(name) {
  const v = process.env[name];
  if (v) return v;
  try {
    const line = readFileSync(resolve(".env"), "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${name}=`));
    if (line)
      return line
        .slice(name.length + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
  } catch {}
  return undefined;
}

const asJson = process.argv.includes("--json");

const url = env("SUPABASE_URL") ?? env("VITE_SUPABASE_URL");
const key = env("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.log(
    "audit-orders-idempotency: no database credentials in env — skipping",
  );
  process.exit(0);
}

// PostgREST has no GROUP BY, so page the key columns and group locally.
// Orders tables are append-mostly; key columns keep the payload small.
const PAGE = 1000;
const seen = new Map(); // `${merchant_id}│${idempotency_key}` -> { merchant_id, idempotency_key, count, min_created_at, ids[] }
let offset = 0;

for (;;) {
  const res = await fetch(
    `${url}/rest/v1/orders?select=id,merchant_id,idempotency_key,created_at,order_number&order=merchant_id.asc,idempotency_key.asc&limit=${PAGE}&offset=${offset}`,
    {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
      },
    },
  );
  if (!res.ok) {
    console.error(`audit-orders-idempotency: read failed (${res.status})`);
    process.exit(1);
  }
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) break;
  for (const r of rows) {
    if (r.idempotency_key === null || r.idempotency_key === undefined) continue;
    const k = `${r.merchant_id}│${r.idempotency_key}`;
    let g = seen.get(k);
    if (!g) {
      g = {
        merchant_id: r.merchant_id,
        idempotency_key: r.idempotency_key,
        count: 0,
        earliest_order_number: null,
        earliest_created_at: null,
        ids: [],
      };
      seen.set(k, g);
    }
    g.count += 1;
    g.ids.push(r.id);
    if (
      g.earliest_created_at === null ||
      r.created_at < g.earliest_created_at
    ) {
      g.earliest_created_at = r.created_at;
      g.earliest_order_number = r.order_number;
    }
  }
  if (rows.length < PAGE) break;
  offset += PAGE;
}

const duplicates = [...seen.values()].filter((g) => g.count > 1);

if (asJson) {
  console.log(JSON.stringify({ duplicate_groups: duplicates }, null, 2));
} else if (duplicates.length === 0) {
  console.log(
    "audit-orders-idempotency: no duplicate (merchant_id, idempotency_key) groups — index build is safe",
  );
} else {
  console.log(
    `audit-orders-idempotency: ${duplicates.length} duplicate group(s) need human disposition (keep earliest per group):`,
  );
  for (const g of duplicates) {
    console.log(
      `  merchant=${g.merchant_id} key=${g.idempotency_key} count=${g.count} keep=${g.earliest_order_number} (${g.earliest_created_at}) ids=${g.ids.join(",")}`,
    );
  }
}

process.exit(duplicates.length > 0 ? 2 : 0);
