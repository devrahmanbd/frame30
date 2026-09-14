/**
 * Catalog core: pure, client-safe primitives (BUILD.md 1.4).
 *
 * Kind coherence rules and the CSV contract live here so the admin UI, the
 * import desk and the server validator agree on one definition. No IO and no
 * money arithmetic (that stays in money.ts); the server re-validates every row
 * through `catalog_import_dry_run`.
 */

export const PRODUCT_KINDS = ["physical", "digital", "service", "subscription"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const KIND_META: Record<
  ProductKind,
  { en: string; bn: string; ships: boolean; needsStock: boolean; hint: { en: string; bn: string } }
> = {
  physical: {
    en: "Physical",
    bn: "ফিজিক্যাল",
    ships: true,
    needsStock: true,
    hint: {
      en: "Shipped goods. Stock and courier rules apply.",
      bn: "কুরিয়ারে পাঠানো পণ্য। স্টক ও কুরিয়ার নিয়ম প্রযোজ্য।",
    },
  },
  digital: {
    en: "Digital",
    bn: "ডিজিটাল",
    ships: false,
    needsStock: false,
    hint: {
      en: "Download entitlement issued after payment. Never shipped.",
      bn: "পেমেন্টের পর ডাউনলোড অনুমতি দেওয়া হয়। শিপিং নেই।",
    },
  },
  service: {
    en: "Service",
    bn: "সার্ভিস",
    ships: false,
    needsStock: false,
    hint: {
      en: "Booked by duration and capacity. No shipping, no stock.",
      bn: "সময় ও ধারণক্ষমতা অনুযায়ী বুকিং। শিপিং বা স্টক নেই।",
    },
  },
  subscription: {
    en: "Subscription",
    bn: "সাবস্ক্রিপশন",
    ships: false,
    needsStock: false,
    hint: {
      en: "Recurring billing terms per variant. Charges stay ledger-backed.",
      bn: "প্রতি ভ্যারিয়েন্টে পুনরাবৃত্ত বিলিং। চার্জ লেজারে থাকে।",
    },
  },
};

export function isShippable(kind: ProductKind) {
  return KIND_META[kind].ships;
}

export const METAFIELD_VALUE_TYPES = ["text", "number", "boolean", "json", "url", "date"] as const;
export type MetafieldValueType = (typeof METAFIELD_VALUE_TYPES)[number];

export const METAFIELD_OWNER_TYPES = [
  "product",
  "variant",
  "collection",
  "order",
  "customer",
  "article",
] as const;
export type MetafieldOwnerType = (typeof METAFIELD_OWNER_TYPES)[number];

export const COLLECTION_FIELDS = [
  "title",
  "brand",
  "category",
  "price",
  "stock",
  "kind",
  "tag",
  "metafield",
] as const;
export type CollectionField = (typeof COLLECTION_FIELDS)[number];

export const COLLECTION_OPS: Record<CollectionField, string[]> = {
  title: ["contains", "starts_with", "equals"],
  brand: ["equals"],
  category: ["equals"],
  price: ["lt", "gt", "equals"],
  stock: ["lt", "gt", "equals"],
  kind: ["equals"],
  tag: ["contains", "not_contains"],
  metafield: ["exists", "equals", "contains"],
};

export type CollectionCondition = {
  field: CollectionField;
  op: string;
  value?: string;
  key?: string;
};

export type CollectionRules = { match: "all" | "any"; conditions: CollectionCondition[] };

export function normalizeRules(input: unknown): CollectionRules {
  const raw = (input ?? {}) as { match?: unknown; conditions?: unknown };
  const match = raw.match === "any" ? "any" : "all";
  const list = Array.isArray(raw.conditions) ? raw.conditions : [];
  const conditions = list
    .map((c) => c as CollectionCondition)
    .filter((c) => !!c && COLLECTION_FIELDS.includes(c.field))
    .filter((c) => (COLLECTION_OPS[c.field] ?? []).includes(c.op))
    .filter((c) => c.field !== "metafield" || !!c.key)
    .slice(0, 20);
  return { match, conditions };
}

/** Human summary of a rule set so smart collections stay auditable in lists. */
export function describeRules(rules: CollectionRules) {
  if (!rules.conditions.length) return "no conditions";
  const parts = rules.conditions.map((c) =>
    c.field === "metafield"
      ? `metafield:${c.key} ${c.op} ${c.value ?? ""}`.trim()
      : `${c.field} ${c.op} ${c.value ?? ""}`.trim(),
  );
  return `${rules.match === "all" ? "all of" : "any of"} — ${parts.join("; ")}`;
}

export const IMPORT_COLUMNS = [
  "title",
  "slug",
  "description",
  "status",
  "kind",
  "tags",
  "variant",
  "sku",
  "currency",
  "price_minor",
  "stock",
] as const;

export const IMPORT_TEMPLATE =
  `${IMPORT_COLUMNS.join(",")}\n` +
  "Jamdani cotton shari,jamdani-cotton-shari,Handloom shari,active,physical,handloom|shari,Default,JAM-001,BDT,485000,12\n";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonRecord = { [key: string]: JsonValue };

export type ImportRow = Record<string, string>;

/**
 * RFC4180-ish CSV reader: quoted fields, escaped quotes, CRLF. Dependency-free
 * and bounded; the caller caps row count before upload.
 */
export function parseCsv(text: string): { header: string[]; rows: ImportRow[]; errors: string[] } {
  const errors: string[] = [];
  const cells: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.some((c) => c.trim() !== "")) cells.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") pushField();
    else if (ch === "\n") pushRow();
    else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) pushRow();

  if (!cells.length) return { header: [], rows: [], errors: ["empty_file"] };
  const header = cells[0]!.map((h) => h.trim().toLowerCase());
  for (const col of ["title", "slug", "price_minor"]) {
    if (!header.includes(col)) errors.push(`missing_column:${col}`);
  }

  const rows: ImportRow[] = cells.slice(1).map((line) => {
    const out: ImportRow = {};
    header.forEach((key, idx) => {
      out[key] = (line[idx] ?? "").trim();
    });
    return out;
  });

  return { header, rows, errors };
}

export const IMPORT_MAX_ROWS = 2000;

export type ImportVerdict = "create" | "update" | "error";

export type ImportDiffEntry = {
  row: number;
  verdict: ImportVerdict;
  reason: string | null;
  slug: string | null;
  title: string | null;
  before: JsonRecord | null;
  after: JsonRecord | null;
};

export type ImportJob = {
  id: string;
  merchant_id: string;
  status: "dry_run" | "applied" | "failed" | "discarded";
  file_name: string;
  source_hash: string;
  row_count: number;
  diff: ImportDiffEntry[];
  summary: { creates?: number; updates?: number; errors?: number };
  applied_at: string | null;
  applied_summary: { created?: number; updated?: number; skipped?: number } | null;
  created_at: string;
};

/** Stable content hash: the same file uploaded twice resolves to the same job. */
export async function hashRows(fileName: string, rows: ImportRow[]) {
  const payload = JSON.stringify({ fileName, rows });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Round-trip export (BUILD.md §1.6). The exporter emits exactly the columns the
 * importer accepts, so a downloaded file can be edited and re-uploaded without
 * reshaping. One row per variant; a product with no variants still exports.
 */
export type CatalogExportRow = {
  title: string;
  slug: string;
  description: string | null;
  status: string;
  kind: string;
  tags: string[] | null;
  variant: string | null;
  sku: string | null;
  currency: string | null;
  price_minor: number | null;
  stock: number | null;
};

function exportCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCatalogCsv(rows: CatalogExportRow[]): string {
  const lines = [IMPORT_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.title,
        r.slug,
        r.description ?? "",
        r.status,
        r.kind,
        (r.tags ?? []).join("|"),
        r.variant ?? "Default",
        r.sku ?? "",
        r.currency ?? "",
        r.price_minor ?? 0,
        r.stock ?? 0,
      ]
        .map(exportCell)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}
