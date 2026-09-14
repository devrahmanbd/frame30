/**
 * Time-machine snapshots — pure half.
 *
 * A snapshot is a single gzipped NDJSON archive: one header line describing
 * what was captured, then one line per row. Everything that decides *what*
 * goes in, in *what order* it can be put back, what must never leave the
 * database in clear text, and whether an archive still matches the live
 * system lives here — so the owner console, the executor and the tests all
 * read the same rules.
 *
 * Two invariants hold the feature together:
 *  1. Restore order is the capture order. The list below is written
 *     parents-before-children so a restore can never orphan a row.
 *  2. Secrets are redacted on capture, not on download. An archive that
 *     leaves the database must not be able to re-authorise a payment rail.
 */

export type SnapshotGroup = "commerce" | "content" | "design" | "platform";

export type SnapshotTable = {
  table: string;
  group: SnapshotGroup;
  /** Column used to narrow a single-store snapshot; null = platform-wide only. */
  scopeColumn: string | null;
  /** Primary key used when putting rows back. */
  key: string;
  /** Columns blanked on capture — credentials must never sit in an archive. */
  redact?: readonly string[];
};

/**
 * Capture order = restore order. Do not sort this list.
 */
export const SNAPSHOT_TABLES: readonly SnapshotTable[] = [
  // ---- platform (global) ------------------------------------------------
  { table: "plan_definitions", group: "platform", scopeColumn: null, key: "plan" },
  { table: "platform_flags", group: "platform", scopeColumn: null, key: "key" },
  { table: "platform_admins", group: "platform", scopeColumn: null, key: "user_id" },
  // ---- tenancy & commerce ----------------------------------------------
  { table: "merchants", group: "commerce", scopeColumn: "id", key: "id" },
  { table: "merchant_members", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "merchant_settings", group: "commerce", scopeColumn: "merchant_id", key: "merchant_id" },
  { table: "tenant_limits", group: "platform", scopeColumn: "merchant_id", key: "merchant_id" },
  {
    table: "gateway_accounts",
    group: "platform",
    scopeColumn: "merchant_id",
    key: "id",
    redact: ["credentials_ciphertext", "webhook_secret"],
  },
  { table: "categories", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "brands", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "products", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "product_variants", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "inventory_locations", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "inventory_levels", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "collections", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "collection_products", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "customers", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "customer_addresses", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "orders", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "order_items", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "order_events", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "payments", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "refunds", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "invoices", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "payouts", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "wallet_ledger_entries", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "gift_cards", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "gift_card_entries", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "subscriptions", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  { table: "coupons", group: "commerce", scopeColumn: "merchant_id", key: "id" },
  // ---- content ---------------------------------------------------------
  { table: "blog_terms", group: "content", scopeColumn: "merchant_id", key: "id" },
  { table: "articles", group: "content", scopeColumn: "merchant_id", key: "id" },
  { table: "article_terms", group: "content", scopeColumn: "merchant_id", key: "article_id,term_id" },
  { table: "storefront_pages", group: "content", scopeColumn: "merchant_id", key: "id" },
  { table: "nav_menus", group: "content", scopeColumn: "merchant_id", key: "id" },
  { table: "nav_menu_items", group: "content", scopeColumn: "merchant_id", key: "id" },
  { table: "media_assets", group: "content", scopeColumn: "merchant_id", key: "id" },
  { table: "seo_meta", group: "content", scopeColumn: "merchant_id", key: "id" },
  { table: "url_redirects", group: "content", scopeColumn: "merchant_id", key: "id" },
  // ---- design ----------------------------------------------------------
  { table: "theme_registry", group: "design", scopeColumn: "merchant_id", key: "key" },
  { table: "theme_versions", group: "design", scopeColumn: "merchant_id", key: "id" },
  { table: "store_themes", group: "design", scopeColumn: "merchant_id", key: "id" },
  { table: "theme_assets", group: "design", scopeColumn: "merchant_id", key: "id" },
  { table: "theme_schedules", group: "design", scopeColumn: "merchant_id", key: "id" },
  // ---- audit trail last: it references everything above ----------------
  { table: "platform_audit_log", group: "platform", scopeColumn: null, key: "id" },
];

export const SNAPSHOT_GROUPS: readonly SnapshotGroup[] = ["commerce", "content", "design", "platform"];

export const ARCHIVE_FORMAT = "framique.snapshot.v1";

/** Tables a single-store snapshot can carry (everything scoped to a merchant). */
export function tablesForScope(scope: "platform" | "store"): SnapshotTable[] {
  return SNAPSHOT_TABLES.filter((t) => (scope === "platform" ? true : t.scopeColumn !== null));
}

export function tableSpec(table: string): SnapshotTable | null {
  return SNAPSHOT_TABLES.find((t) => t.table === table) ?? null;
}

/** Blanks the credential columns for a table. Never mutates the input row. */
export function redactRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const spec = tableSpec(table);
  if (!spec?.redact?.length) return { ...row };
  const out = { ...row };
  for (const column of spec.redact) {
    if (column in out) out[column] = null;
  }
  return out;
}

export type TableCount = { table: string; rows: number };

/**
 * FNV-1a over the canonical `table:rows` list — stable, dependency-free, and
 * the same algorithm the nightly restore drill already uses.
 */
export function snapshotChecksum(counts: TableCount[]): string {
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

export function totalRows(counts: TableCount[]): number {
  return counts.reduce((sum, c) => sum + Math.max(0, Math.trunc(c.rows)), 0);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function archivePath(scope: "platform" | "store", id: string, takenAt: string): string {
  const stamp = takenAt.replace(/[:.]/g, "-");
  return `${scope}/${stamp}-${id}.ndjson.gz`;
}

// --------------------------------------------------------------- verification

export type VerifyCheck = { name: string; ok: boolean; detail: string };

export type VerifyVerdict = {
  status: "matches" | "drifted" | "damaged";
  checks: VerifyCheck[];
  drift: { table: string; archived: number; live: number }[];
};

/**
 * Reads an archive back against the live database.
 *
 * `damaged` means the archive itself no longer agrees with its own checksum or
 * carries no rows — it must never be offered as a restore source. `drifted` is
 * normal for an older archive and is reported, not hidden.
 */
export function verifyArchive(
  archived: TableCount[],
  live: TableCount[],
  checksum: string,
): VerifyVerdict {
  const checks: VerifyCheck[] = [];
  const recomputed = snapshotChecksum(archived);
  const intact = recomputed === checksum;
  checks.push({
    name: "checksum",
    ok: intact,
    detail: intact ? checksum : `recorded ${checksum}, archive reads ${recomputed}`,
  });

  const rows = totalRows(archived);
  checks.push({
    name: "rows_present",
    ok: rows > 0,
    detail: `${rows} rows across ${archived.length} tables`,
  });

  const liveByTable = new Map(live.map((c) => [c.table, c.rows]));
  const drift: VerifyVerdict["drift"] = [];
  for (const c of archived) {
    const now = liveByTable.get(c.table) ?? 0;
    if (now !== c.rows) drift.push({ table: c.table, archived: c.rows, live: now });
  }
  checks.push({
    name: "live_match",
    ok: drift.length === 0,
    detail: drift.length === 0 ? "live database matches the archive" : `${drift.length} tables differ`,
  });

  const status: VerifyVerdict["status"] = !intact || rows === 0 ? "damaged" : drift.length ? "drifted" : "matches";
  return { status, checks, drift };
}

// ------------------------------------------------------------------- restores

/**
 * A restore never deletes. It puts archived rows back on top of the live ones,
 * parents first, so a row created after the snapshot survives the rewind
 * instead of being silently destroyed by a console click.
 */
export function restoreOrder(tables: string[]): string[] {
  const rank = new Map(SNAPSHOT_TABLES.map((t, i) => [t.table, i]));
  return [...new Set(tables)]
    .filter((t) => rank.has(t))
    .sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
}

/** The phrase an owner must type before a restore runs. */
export function confirmPhrase(label: string): string {
  return `restore ${label}`.trim().toLowerCase();
}

export function phraseMatches(typed: string, label: string): boolean {
  return typed.trim().toLowerCase().replace(/\s+/g, " ") === confirmPhrase(label);
}

export const RESTORE_BATCH_SIZE = 400;

export function batches<T>(rows: T[], size = RESTORE_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}
