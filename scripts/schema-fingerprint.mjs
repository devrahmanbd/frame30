#!/usr/bin/env node
/**
 * Schema drift guard.
 *
 *   node scripts/schema-fingerprint.mjs --write   # snapshot the live schema
 *   node scripts/schema-fingerprint.mjs --check   # CI gate: fail on drift
 *
 * Compares the committed snapshot in supabase/schema.fingerprint.json with the
 * live database shape returned by public.schema_fingerprint().
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve("supabase/schema.fingerprint.json");

function env(name) {
  const v = process.env[name];
  if (v) return v;
  try {
    const line = readFileSync(resolve(".env"), "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${name}=`));
    if (line) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
  } catch {}
  return undefined;
}

const url = env("SUPABASE_URL") ?? env("VITE_SUPABASE_URL");
const key = env("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.log("schema-fingerprint: no database credentials in env — skipping");
  process.exit(0);
}

const res = await fetch(`${url}/rest/v1/rpc/schema_fingerprint`, {
  method: "POST",
  headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: "{}",
});
if (!res.ok) {
  console.error(`schema-fingerprint: rpc failed (${res.status})`);
  process.exit(1);
}
const live = await res.json();

if (process.argv.includes("--write")) {
  writeFileSync(OUT, `${JSON.stringify(live, null, 2)}\n`);
  console.log(`schema-fingerprint: wrote ${Object.keys(live.tables).length} tables`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(OUT, "utf8"));
} catch {
  console.error("schema-fingerprint: no committed snapshot — run with --write");
  process.exit(1);
}

const drift = [];
const names = new Set([...Object.keys(baseline.tables), ...Object.keys(live.tables)]);
for (const t of [...names].sort()) {
  const a = baseline.tables[t];
  const b = live.tables[t];
  if (!a) drift.push(`+ table ${t} exists live but not in the snapshot`);
  else if (!b) drift.push(`- table ${t} in the snapshot is missing live`);
  else {
    if (a.columns !== b.columns) drift.push(`~ ${t}: columns ${a.columns} -> ${b.columns}`);
    if (a.rls !== b.rls) drift.push(`! ${t}: RLS ${a.rls} -> ${b.rls}`);
    if (a.policies !== b.policies) drift.push(`~ ${t}: policies ${a.policies} -> ${b.policies}`);
  }
}
const fnBase = new Set(baseline.functions ?? []);
for (const f of live.functions ?? []) if (!fnBase.has(f)) drift.push(`+ function ${f}`);
for (const f of fnBase) if (!(live.functions ?? []).includes(f)) drift.push(`- function ${f}`);

if (drift.length === 0) {
  console.log("schema-fingerprint: no drift");
  process.exit(0);
}
console.error("schema-fingerprint: DRIFT DETECTED\n" + drift.map((d) => `  ${d}`).join("\n"));
process.exit(1);
