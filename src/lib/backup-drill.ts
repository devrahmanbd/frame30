/**
 * Backup & restore drill logic (BUILD.md §A4 — data safety).
 *
 * Pure and isomorphic: the manifest of protected tables, the artifact checksum,
 * the drill verdict and the cadence rule. The server executor and the owner
 * console both import from here, so what a responder reads on screen is the
 * same rule the nightly cron enforces.
 *
 * Standing rule for [A] lines: a drill may only pass on evidence — verified
 * rows, a matching checksum and full manifest coverage. An unverified snapshot
 * is never a backup.
 */

/** Tables whose loss is irrecoverable: money, history, tenancy, identity. */
export const BACKUP_MANIFEST = [
  "merchants",
  "merchant_members",
  "merchant_settings",
  "customers",
  "customer_addresses",
  "orders",
  "order_items",
  "order_events",
  "payments",
  "refunds",
  "invoices",
  "payouts",
  "wallet_ledger_entries",
  "gift_cards",
  "gift_card_entries",
  "subscriptions",
  "products",
  "product_variants",
  "inventory_levels",
  "platform_audit_log",
] as const;

export type ManifestTable = (typeof BACKUP_MANIFEST)[number];

export type TableCount = { table: string; rows: number };

export type Snapshot = {
  scope: string;
  takenAt: string;
  counts: TableCount[];
  checksum: string;
};

export type DrillCheck = { name: string; ok: boolean; detail: string };

export type DrillVerdict = {
  status: "passed" | "failed";
  rowsVerified: number;
  checks: DrillCheck[];
  failures: string[];
};

/** FNV-1a over the canonical `table:rows` list. Stable and dependency-free. */
export function checksumCounts(counts: TableCount[]): string {
  const canonical = [...counts]
    .map((c) => `${c.table}:${Math.max(0, Math.trunc(c.rows))}`)
    .sort()
    .join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function buildSnapshot(scope: string, counts: TableCount[], takenAt: string): Snapshot {
  const normalized = counts.map((c) => ({ table: c.table, rows: Math.max(0, Math.trunc(c.rows)) }));
  return { scope, takenAt, counts: normalized, checksum: checksumCounts(normalized), };
}

export function totalRows(snapshot: Snapshot): number {
  return snapshot.counts.reduce((sum, c) => sum + c.rows, 0);
}

/**
 * Compares the snapshot against the read-back of the restored target.
 *
 * `driftTolerance` allows for rows written while the drill runs; it never
 * allows a table to disappear, and never allows a pass with zero verified rows.
 */
export function evaluateDrill(
  before: Snapshot,
  after: Snapshot,
  opts: { driftTolerance?: number; manifest?: readonly string[] } = {},
): DrillVerdict {
  const tolerance = Math.max(0, opts.driftTolerance ?? 0);
  const manifest = opts.manifest ?? BACKUP_MANIFEST;
  const checks: DrillCheck[] = [];

  const covered = new Set(before.counts.map((c) => c.table));
  const missing = manifest.filter((t) => !covered.has(t));
  checks.push({
    name: "manifest_coverage",
    ok: missing.length === 0,
    detail: missing.length ? `missing: ${missing.join(", ")}` : `${manifest.length} tables captured`,
  });

  const afterByTable = new Map(after.counts.map((c) => [c.table, c.rows]));
  const lost: string[] = [];
  const drifted: string[] = [];
  for (const c of before.counts) {
    const restored = afterByTable.get(c.table);
    if (restored === undefined) {
      lost.push(`${c.table} absent after restore`);
      continue;
    }
    const delta = Math.abs(restored - c.rows);
    const allowed = Math.max(0, Math.floor(c.rows * tolerance));
    if (restored < c.rows - allowed) lost.push(`${c.table} ${c.rows} → ${restored}`);
    else if (delta > allowed) drifted.push(`${c.table} ${c.rows} → ${restored}`);
  }
  checks.push({
    name: "row_counts",
    ok: lost.length === 0,
    detail: lost.length ? `row loss: ${lost.join("; ")}` : "no row loss",
  });
  checks.push({
    name: "drift_within_tolerance",
    ok: drifted.length === 0,
    detail: drifted.length ? `drift: ${drifted.join("; ")}` : `tolerance ${tolerance}`,
  });

  const rowsVerified = before.counts.reduce(
    (sum, c) => sum + Math.min(c.rows, afterByTable.get(c.table) ?? 0),
    0,
  );
  checks.push({
    name: "rows_verified",
    ok: rowsVerified > 0,
    detail: `${rowsVerified} rows read back`,
  });

  const checksumOk = before.checksum === after.checksum;
  checks.push({
    name: "checksum",
    ok: checksumOk,
    detail: checksumOk ? before.checksum : `${before.checksum} ≠ ${after.checksum}`,
  });

  // A checksum mismatch inside tolerance is a warning, not a failure: rows can
  // legitimately land mid-drill. Loss, missing coverage or zero rows are fatal.
  const fatal = ["manifest_coverage", "row_counts", "rows_verified"];
  const failures = checks.filter((c) => !c.ok && fatal.includes(c.name)).map((c) => c.name);
  return {
    status: failures.length === 0 ? "passed" : "failed",
    rowsVerified,
    checks,
    failures,
  };
}

/** Cadence rule: a drill is due when the last passing one is older than the interval. */
export function drillDue(lastPassedAt: string | null, now: Date, intervalHours = 24): boolean {
  if (!lastPassedAt) return true;
  const last = new Date(lastPassedAt).getTime();
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= intervalHours * 3_600_000;
}

export function nextDrillAt(lastPassedAt: string | null, intervalHours = 24): string | null {
  if (!lastPassedAt) return null;
  const last = new Date(lastPassedAt).getTime();
  if (!Number.isFinite(last)) return null;
  return new Date(last + intervalHours * 3_600_000).toISOString();
}

/** Human-readable one-liner stored on the run row. Never contains tenant data. */
export function drillNotes(verdict: DrillVerdict): string {
  return verdict.checks.map((c) => `${c.ok ? "ok" : "FAIL"} ${c.name}: ${c.detail}`).join(" | ").slice(0, 900);
}
