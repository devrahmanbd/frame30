/**
 * Time-machine snapshots — executor.
 *
 * Captures every table in `SNAPSHOT_TABLES` into one gzipped NDJSON archive in
 * the private `platform-snapshots` bucket, records it in
 * `platform_snapshots`, reads it back on demand, and can put the rows back
 * (parents first, upsert-only, never deleting) under a typed confirmation.
 *
 * Every entry point goes through `ownerGate`, so a capture, a download link, a
 * rehearsal and a real restore each leave an append-only audit row naming the
 * owner who did it.
 */
import { gunzipSync, gzipSync } from "zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { ownerGate, OwnerError } from "./owner-ops.server";
import { incr, log } from "./observability.server";
import {
  ARCHIVE_FORMAT,
  archivePath,
  batches,
  formatBytes,
  phraseMatches,
  redactRow,
  restoreOrder,
  snapshotChecksum,
  tableSpec,
  tablesForScope,
  totalRows,
  verifyArchive,
  type SnapshotTable,
  type TableCount,
  type VerifyVerdict,
} from "./snapshots";

type Client = SupabaseClient<Database>;

const BUCKET = "platform-snapshots";
const PAGE = 1000;
/** Hard ceiling per table so one runaway table cannot exhaust worker memory. */
const MAX_ROWS_PER_TABLE = 50_000;
const SIGNED_URL_TTL_SECONDS = 900;

type Row = Record<string, unknown>;

/* eslint-disable @typescript-eslint/no-explicit-any -- the archive is table-agnostic by design */
type Admin = { from: (t: string) => any; storage: { from: (b: string) => any } };

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

// -------------------------------------------------------------------- capture

async function readTable(a: Admin, spec: SnapshotTable, merchantId: string | null): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; from < MAX_ROWS_PER_TABLE; from += PAGE) {
    let q = a.from(spec.table).select("*").range(from, from + PAGE - 1);
    if (merchantId && spec.scopeColumn) q = q.eq(spec.scopeColumn, merchantId);
    const { data, error } = await q;
    if (error) throw new OwnerError("snapshot.read_failed", `${spec.table}: ${error.message}`);
    const page = (data ?? []) as Row[];
    for (const row of page) rows.push(redactRow(spec.table, row));
    if (page.length < PAGE) break;
  }
  return rows;
}

export type SnapshotSummary = {
  id: string;
  label: string;
  scope: "platform" | "store";
  merchantId: string | null;
  status: string;
  byteSize: number;
  sizeLabel: string;
  tableCount: number;
  rowCount: number;
  checksum: string | null;
  counts: TableCount[];
  redacted: string[];
  note: string | null;
  takenAt: string;
  verifiedAt: string | null;
  failure: string | null;
};

function toSummary(row: Row): SnapshotSummary {
  const bytes = Number(row["byte_size"] ?? 0);
  return {
    id: String(row["id"]),
    label: String(row["label"] ?? ""),
    scope: (row["scope"] as "platform" | "store") ?? "platform",
    merchantId: (row["merchant_id"] as string | null) ?? null,
    status: String(row["status"] ?? "ready"),
    byteSize: bytes,
    sizeLabel: formatBytes(bytes),
    tableCount: Number(row["table_count"] ?? 0),
    rowCount: Number(row["row_count"] ?? 0),
    checksum: (row["checksum"] as string | null) ?? null,
    counts: Array.isArray(row["counts"]) ? (row["counts"] as TableCount[]) : [],
    redacted: Array.isArray(row["redacted"]) ? (row["redacted"] as string[]) : [],
    note: (row["note"] as string | null) ?? null,
    takenAt: String(row["taken_at"] ?? row["created_at"] ?? ""),
    verifiedAt: (row["verified_at"] as string | null) ?? null,
    failure: (row["failure"] as string | null) ?? null,
  };
}

/**
 * Takes a snapshot. The ledger row is written *before* the upload so a crash
 * mid-capture leaves a visible `failed` row rather than a silent gap.
 */
export async function createSnapshot(
  db: Client,
  userId: string,
  input: { scope: "platform" | "store"; merchantId?: string | null; label?: string | null; note?: string | null },
) {
  return ownerGate(
    db,
    userId,
    {
      action: "snapshot.create",
      entity: "platform_snapshots",
      bucket: "owner.snapshot",
      kind: "write",
      meta: { scope: input.scope, merchantId: input.merchantId ?? null },
    },
    async () => {
      if (input.scope === "store" && !input.merchantId) {
        throw new OwnerError("snapshot.store_required", "Pick a store for a store-only snapshot.");
      }
      const a = await admin();
      const takenAt = new Date().toISOString();
      const label = (input.label ?? "").trim() || `${input.scope === "store" ? "Store" : "Platform"} ${takenAt.slice(0, 16).replace("T", " ")}`;

      const ins = await a
        .from("platform_snapshots")
        .insert({
          label,
          scope: input.scope,
          merchant_id: input.scope === "store" ? input.merchantId : null,
          status: "running",
          format: ARCHIVE_FORMAT,
          note: input.note ?? null,
          taken_at: takenAt,
          created_by: userId,
        })
        .select("id")
        .single();
      if (ins.error || !ins.data) {
        throw new OwnerError("snapshot.ledger_unavailable", ins.error?.message ?? "no row");
      }
      const id = String((ins.data as Row)["id"]);

      try {
        const specs = tablesForScope(input.scope);
        const merchantId = input.scope === "store" ? (input.merchantId ?? null) : null;
        const counts: TableCount[] = [];
        const redacted: string[] = [];
        const lines: string[] = [];

        for (const spec of specs) {
          const rows = await readTable(a, spec, merchantId);
          counts.push({ table: spec.table, rows: rows.length });
          if (spec.redact?.length && rows.length) {
            for (const column of spec.redact) redacted.push(`${spec.table}.${column}`);
          }
          for (const row of rows) lines.push(JSON.stringify({ t: spec.table, r: row }));
        }

        const checksum = snapshotChecksum(counts);
        const header = JSON.stringify({
          format: ARCHIVE_FORMAT,
          snapshotId: id,
          scope: input.scope,
          merchantId,
          takenAt,
          checksum,
          counts,
          redacted,
        });
        const body = gzipSync(Buffer.from([header, ...lines].join("\n") + "\n", "utf8"), { level: 9 });
        const path = archivePath(input.scope, id, takenAt);

        const up = await a.storage.from(BUCKET).upload(path, body, {
          contentType: "application/gzip",
          upsert: true,
        });
        if (up.error) throw new OwnerError("snapshot.upload_failed", up.error.message);

        const rowCount = totalRows(counts);
        await a
          .from("platform_snapshots")
          .update({
            status: "ready",
            storage_path: path,
            byte_size: body.byteLength,
            table_count: counts.length,
            row_count: rowCount,
            checksum,
            counts: counts as unknown as Json,
            redacted: [...new Set(redacted)] as unknown as Json,
          })
          .eq("id", id);

        incr("framique_snapshot_created_total", { scope: input.scope });
        log("info", "snapshot.created", { id, rows: rowCount, bytes: body.byteLength });
        return { id, checksum, rowCount, byteSize: body.byteLength, sizeLabel: formatBytes(body.byteLength) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await a.from("platform_snapshots").update({ status: "failed", failure: message }).eq("id", id);
        incr("framique_snapshot_failures_total", { scope: input.scope });
        log("error", "snapshot.failed", { id, message });
        throw err instanceof OwnerError ? err : new OwnerError("snapshot.capture_failed", message);
      }
    },
  );
}

// ----------------------------------------------------------------------- reads

export async function loadSnapshots(db: Client, userId: string) {
  return ownerGate(
    db,
    userId,
    { action: "snapshot.read", entity: "platform_snapshots", bucket: "owner.read", kind: "read" },
    async () => {
      const [snaps, restores, stores] = await Promise.all([
        db.from("platform_snapshots").select("*").order("taken_at", { ascending: false }).limit(60),
        db
          .from("platform_snapshot_restores")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(30),
        db.from("merchants").select("id,name,slug").order("name").limit(200),
      ]);
      if (snaps.error) throw new OwnerError("snapshot.list_failed", snaps.error.message);

      const rows = (snaps.data ?? []) as Row[];
      let totalBytes = 0;
      let totalRowCount = 0;
      for (const r of rows) {
        totalBytes += Number(r["byte_size"] ?? 0);
        totalRowCount += Number(r["row_count"] ?? 0);
      }

      return {
        snapshots: rows.map(toSummary),
        restores: ((restores.data ?? []) as Row[]).map((r) => ({
          id: String(r["id"]),
          snapshotId: String(r["snapshot_id"]),
          mode: String(r["mode"]),
          status: String(r["status"]),
          rowsWritten: Number(r["rows_written"] ?? 0),
          results: Array.isArray(r["results"]) ? (r["results"] as { table: string; rows: number }[]) : [],
          failure: (r["failure"] as string | null) ?? null,
          startedAt: String(r["started_at"] ?? ""),
          finishedAt: (r["finished_at"] as string | null) ?? null,
        })),
        stores: ((stores.data ?? []) as Row[]).map((r) => ({
          id: String(r["id"]),
          name: String(r["name"] ?? r["slug"] ?? ""),
        })),
        totals: {
          count: rows.length,
          bytes: totalBytes,
          sizeLabel: formatBytes(totalBytes),
          rows: totalRowCount,
        },
      };
    },
  );
}

/** Short-lived signed download link. Audited, because an archive is bulk data. */
export async function signSnapshot(db: Client, userId: string, id: string) {
  return ownerGate(
    db,
    userId,
    {
      action: "snapshot.download",
      entity: "platform_snapshots",
      entityId: id,
      bucket: "owner.read",
      kind: "read",
    },
    async () => {
      const a = await admin();
      const { data, error } = await a
        .from("platform_snapshots")
        .select("storage_path,status")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new OwnerError("snapshot.list_failed", error.message);
      const path = (data as Row | null)?.["storage_path"] as string | undefined;
      if (!path) throw new OwnerError("snapshot.archive_missing", "This snapshot has no archive file.");
      const signed = await a.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (signed.error || !signed.data?.signedUrl) {
        throw new OwnerError("snapshot.sign_failed", signed.error?.message ?? "no url");
      }
      return { url: String(signed.data.signedUrl), expiresInSeconds: SIGNED_URL_TTL_SECONDS };
    },
  );
}

type Archive = {
  header: { checksum: string; counts: TableCount[]; scope: "platform" | "store"; merchantId: string | null };
  rowsByTable: Map<string, Row[]>;
};

async function downloadArchive(a: Admin, id: string): Promise<Archive> {
  const meta = await a.from("platform_snapshots").select("storage_path").eq("id", id).maybeSingle();
  const path = (meta.data as Row | null)?.["storage_path"] as string | undefined;
  if (!path) throw new OwnerError("snapshot.archive_missing", "This snapshot has no archive file.");

  const dl = await a.storage.from(BUCKET).download(path);
  if (dl.error || !dl.data) throw new OwnerError("snapshot.download_failed", dl.error?.message ?? "no body");
  const buf = Buffer.from(await (dl.data as Blob).arrayBuffer());
  const text = gunzipSync(buf).toString("utf8");

  const lines = text.split("\n").filter((l) => l.length > 0);
  const header = JSON.parse(lines[0] ?? "{}") as Archive["header"] & { format?: string };
  if (!Array.isArray(header.counts)) throw new OwnerError("snapshot.archive_damaged", "missing header counts");

  const rowsByTable = new Map<string, Row[]>();
  for (const line of lines.slice(1)) {
    const entry = JSON.parse(line) as { t: string; r: Row };
    const list = rowsByTable.get(entry.t) ?? [];
    list.push(entry.r);
    rowsByTable.set(entry.t, list);
  }
  return { header, rowsByTable };
}

/** Reads the archive back and compares it with the live database. */
export async function verifySnapshot(db: Client, userId: string, id: string) {
  return ownerGate(
    db,
    userId,
    {
      action: "snapshot.verify",
      entity: "platform_snapshots",
      entityId: id,
      bucket: "owner.read",
      kind: "read",
    },
    async () => {
      const a = await admin();
      const archive = await downloadArchive(a, id);
      const archived: TableCount[] = [...archive.rowsByTable.entries()].map(([table, rows]) => ({
        table,
        rows: rows.length,
      }));
      // Tables captured with zero rows must still count, or coverage looks short.
      for (const c of archive.header.counts) {
        if (!archive.rowsByTable.has(c.table)) archived.push({ table: c.table, rows: 0 });
      }

      const merchantId = archive.header.merchantId;
      const live: TableCount[] = [];
      for (const c of archived) {
        const spec = tableSpec(c.table);
        if (!spec) continue;
        let q = a.from(c.table).select("*", { count: "exact", head: true });
        if (merchantId && spec.scopeColumn) q = q.eq(spec.scopeColumn, merchantId);
        const { count } = await q;
        live.push({ table: c.table, rows: count ?? 0 });
      }

      const verdict: VerifyVerdict = verifyArchive(archived, live, archive.header.checksum);
      await a
        .from("platform_snapshots")
        .update({
          status: verdict.status === "damaged" ? "damaged" : "verified",
          verified_at: new Date().toISOString(),
          verify_result: verdict as unknown as Json,
        })
        .eq("id", id);
      incr("framique_snapshot_verify_total", { status: verdict.status });
      return verdict;
    },
  );
}

// -------------------------------------------------------------------- restore

export type RestoreResult = {
  mode: "dry_run" | "restore";
  status: "completed" | "failed";
  rowsWritten: number;
  results: { table: string; rows: number; skipped?: string }[];
};

/**
 * Puts the archive back. Upsert-only and parents-first: rows created after the
 * snapshot are left alone, so a rewind can never be a silent mass delete.
 * A real restore requires the exact confirmation phrase for that snapshot.
 */
export async function restoreSnapshot(
  db: Client,
  userId: string,
  input: { id: string; mode: "dry_run" | "restore"; confirm?: string | null; tables?: string[] },
): Promise<RestoreResult> {
  return ownerGate(
    db,
    userId,
    {
      action: input.mode === "restore" ? "snapshot.restore" : "snapshot.rehearse",
      entity: "platform_snapshots",
      entityId: input.id,
      bucket: "owner.snapshot_restore",
      kind: "write",
      meta: { mode: input.mode, tables: input.tables ?? "all" },
    },
    async () => {
      const a = await admin();
      const meta = await a.from("platform_snapshots").select("label,status").eq("id", input.id).maybeSingle();
      const row = meta.data as Row | null;
      if (!row) throw new OwnerError("snapshot.not_found", "That snapshot no longer exists.");
      if (String(row["status"]) === "damaged") {
        throw new OwnerError("snapshot.damaged", "This archive failed verification and cannot be restored.");
      }
      if (input.mode === "restore" && !phraseMatches(input.confirm ?? "", String(row["label"]))) {
        throw new OwnerError("snapshot.confirm_required", "Type the confirmation phrase exactly.");
      }

      const archive = await downloadArchive(a, input.id);
      const wanted = input.tables?.length ? restoreOrder(input.tables) : restoreOrder([...archive.rowsByTable.keys()]);

      const ledger = await a
        .from("platform_snapshot_restores")
        .insert({
          snapshot_id: input.id,
          mode: input.mode,
          status: "running",
          tables: wanted as unknown as Json,
          created_by: userId,
        })
        .select("id")
        .single();
      const restoreId = ledger.data ? String((ledger.data as Row)["id"]) : null;

      const results: RestoreResult["results"] = [];
      let rowsWritten = 0;
      try {
        for (const table of wanted) {
          const spec = tableSpec(table);
          const rows = archive.rowsByTable.get(table) ?? [];
          if (!spec) {
            results.push({ table, rows: 0, skipped: "not in the snapshot manifest" });
            continue;
          }
          if (spec.redact?.length) {
            // Credentials were blanked on capture; writing them back would wipe
            // the live secret. The rail keeps whatever it has now.
            results.push({ table, rows: rows.length, skipped: "credentials are never restored" });
            continue;
          }
          if (input.mode === "dry_run") {
            results.push({ table, rows: rows.length });
            continue;
          }
          for (const chunk of batches(rows)) {
            const { error } = await a.from(table).upsert(chunk, { onConflict: spec.key });
            if (error) throw new OwnerError("snapshot.restore_failed", `${table}: ${error.message}`);
            rowsWritten += chunk.length;
          }
          results.push({ table, rows: rows.length });
        }

        if (restoreId) {
          await a
            .from("platform_snapshot_restores")
            .update({
              status: "completed",
              rows_written: rowsWritten,
              results: results as unknown as Json,
              finished_at: new Date().toISOString(),
            })
            .eq("id", restoreId);
        }
        incr("framique_snapshot_restore_total", { mode: input.mode, status: "completed" });
        return { mode: input.mode, status: "completed", rowsWritten, results };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (restoreId) {
          await a
            .from("platform_snapshot_restores")
            .update({
              status: "failed",
              rows_written: rowsWritten,
              results: results as unknown as Json,
              failure: message,
              finished_at: new Date().toISOString(),
            })
            .eq("id", restoreId);
        }
        incr("framique_snapshot_restore_total", { mode: input.mode, status: "failed" });
        log("error", "snapshot.restore_failed", { id: input.id, message });
        throw err instanceof OwnerError ? err : new OwnerError("snapshot.restore_failed", message);
      }
    },
  );
}

export async function deleteSnapshot(db: Client, userId: string, id: string) {
  return ownerGate(
    db,
    userId,
    {
      action: "snapshot.delete",
      entity: "platform_snapshots",
      entityId: id,
      bucket: "owner.snapshot",
      kind: "write",
    },
    async () => {
      const a = await admin();
      const meta = await a.from("platform_snapshots").select("storage_path").eq("id", id).maybeSingle();
      const path = (meta.data as Row | null)?.["storage_path"] as string | undefined;
      if (path) await a.storage.from(BUCKET).remove([path]);
      const { error } = await a.from("platform_snapshots").delete().eq("id", id);
      if (error) throw new OwnerError("snapshot.delete_failed", error.message);
      return { ok: true };
    },
  );
}
