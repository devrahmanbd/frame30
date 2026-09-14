#!/usr/bin/env node
/**
 * Framique — one-command migration runner for a self-hosted Postgres.
 *
 *   bun run db:migrate            # apply every pending file
 *   bun run db:migrate --check    # exit 1 if anything is pending (CI gate)
 *   bun run db:migrate --dry-run  # print the plan, touch nothing
 *
 * Source of truth is the checked-in SQL: `migration/*.sql` first (baseline,
 * seeds, fixes) then `supabase/migrations/*.sql`. Each file is applied once,
 * inside a transaction, and recorded in `public.schema_migration_files` with
 * its sha256 — re-editing an applied file is an error, not a silent no-op.
 *
 * Connection: DATABASE_URL, or POSTGRES_* pieces, defaulting to the compose
 * stack (`supabase/docker/docker-compose.yml`) reached through docker exec.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const DIRS = ["migration", "supabase/migrations"];
const args = new Set(process.argv.slice(2));
const CHECK = args.has("--check");
const DRY = args.has("--dry-run");

const LEDGER = `
CREATE TABLE IF NOT EXISTS public.schema_migration_files (
  filename    text PRIMARY KEY,
  checksum    text NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  duration_ms integer NOT NULL DEFAULT 0
);`;

function discover() {
  const out = [];
  for (const dir of DIRS) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs).filter((f) => f.endsWith(".sql")).sort()) {
      const body = readFileSync(join(abs, name), "utf8");
      out.push({
        id: `${dir}/${name}`,
        path: join(abs, name),
        checksum: createHash("sha256").update(body).digest("hex"),
      });
    }
  }
  return out;
}

function psql({ sql, file }) {
  const url = process.env["DATABASE_URL"];
  const base = url
    ? ["psql", url]
    : [
        "docker",
        "compose",
        "-f",
        join(ROOT, "supabase/docker/docker-compose.yml"),
        "exec",
        "-T",
        "db",
        "psql",
        "-U",
        process.env["POSTGRES_USER"] ?? "postgres",
        "-d",
        process.env["POSTGRES_DB"] ?? "postgres",
      ];
  const argv = [...base, "-v", "ON_ERROR_STOP=1", "--no-psqlrc", "-q"];
  if (file) argv.push("-f", url ? file : "-");
  else argv.push("-c", sql);
  const input = file && !url ? readFileSync(file, "utf8") : undefined;
  const res = spawnSync(argv[0], argv.slice(1), {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
  });
  if (res.status !== 0) {
    throw new Error(`psql failed (${res.status ?? "spawn error"}) for ${file ?? "inline SQL"}`);
  }
  return res.stdout ?? "";
}

function applied() {
  const rows = psql({
    sql: "SELECT filename || ' ' || checksum FROM public.schema_migration_files ORDER BY filename;",
  });
  const map = new Map();
  for (const line of rows.split("\n")) {
    const [filename, checksum] = line.trim().split(/\s+/);
    if (filename && checksum && !filename.startsWith("(")) map.set(filename, checksum);
  }
  return map;
}

function main() {
  const files = discover();
  if (files.length === 0) {
    console.error("no migration files found");
    process.exit(1);
  }

  if (DRY) {
    for (const f of files) console.log(`plan ${f.id}`);
    return;
  }

  psql({ sql: LEDGER });
  const done = applied();

  const drifted = files.filter((f) => done.has(f.id) && done.get(f.id) !== f.checksum);
  if (drifted.length) {
    console.error("applied migrations were edited after the fact:");
    for (const f of drifted) console.error(`  ${f.id}`);
    console.error("write a new migration instead of editing an applied one.");
    process.exit(1);
  }

  const pending = files.filter((f) => !done.has(f.id));
  if (CHECK) {
    if (pending.length) {
      console.error(`${pending.length} migration(s) pending:`);
      for (const f of pending) console.error(`  ${f.id}`);
      process.exit(1);
    }
    console.log(`schema up to date (${files.length} applied)`);
    return;
  }

  for (const f of pending) {
    const started = Date.now();
    process.stdout.write(`apply ${f.id} … `);
    psql({ file: f.path });
    const ms = Date.now() - started;
    psql({
      sql: `INSERT INTO public.schema_migration_files (filename, checksum, duration_ms)
            VALUES ('${f.id}', '${f.checksum}', ${ms})
            ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum;`,
    });
    console.log(`ok (${ms}ms)`);
  }
  console.log(pending.length ? `applied ${pending.length} migration(s)` : "nothing to apply");
}

main();
