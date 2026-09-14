/**
 * Content desk — Phase 11 domain model.
 *
 * One WordPress-shaped list model shared by Pages and Posts: status tabs with
 * counts, row actions, the Quick Edit / Bulk Edit field set, trash with restore,
 * and the two-line date cell. Everything here is pure so it is unit-tested and
 * runs identically on the server (`content-desk.server.ts`) and in the browser.
 */

export type ContentKind = "page" | "post";

export const CONTENT_STATUSES = [
  "published",
  "draft",
  "pending",
  "scheduled",
  "private",
  "trash",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const VISIBILITIES = ["public", "private", "password"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const EDITORS = ["classic", "builder"] as const;
export type EditorKind = (typeof EDITORS)[number];

/** WordPress "Template ▾" values, mapped to storefront layouts. */
export const PAGE_TEMPLATES = [
  { id: "default", en: "Default template", bn: "ডিফল্ট টেমপ্লেট" },
  { id: "canvas", en: "Builder canvas", bn: "বিল্ডার ক্যানভাস" },
  { id: "full-width", en: "Builder full width", bn: "বিল্ডার ফুল উইডথ" },
  { id: "no-title", en: "Page, no title", bn: "শিরোনামহীন পেজ" },
  { id: "theme", en: "Theme", bn: "থিম" },
] as const;
export type PageTemplate = (typeof PAGE_TEMPLATES)[number]["id"];

/** Status tabs above the table, in WordPress order. `all` excludes trash. */
export const STATUS_VIEWS = ["all", "published", "draft", "pending", "scheduled", "private", "trash"] as const;
export type StatusView = (typeof STATUS_VIEWS)[number];

export const STATUS_LABEL: Record<ContentStatus | "all", { en: string; bn: string }> = {
  all: { en: "All", bn: "সব" },
  published: { en: "Published", bn: "প্রকাশিত" },
  draft: { en: "Drafts", bn: "খসড়া" },
  pending: { en: "Pending", bn: "অপেক্ষমাণ" },
  scheduled: { en: "Scheduled", bn: "নির্ধারিত" },
  private: { en: "Private", bn: "ব্যক্তিগত" },
  trash: { en: "Trash", bn: "ট্র্যাশ" },
};

/** Singular status word used as the title suffix (`— Draft`). */
export const STATUS_SUFFIX: Record<ContentStatus, { en: string; bn: string }> = {
  published: { en: "Published", bn: "প্রকাশিত" },
  draft: { en: "Draft", bn: "খসড়া" },
  pending: { en: "Pending review", bn: "পর্যালোচনা বাকি" },
  scheduled: { en: "Scheduled", bn: "নির্ধারিত" },
  private: { en: "Private", bn: "ব্যক্তিগত" },
  trash: { en: "Trash", bn: "ট্র্যাশ" },
};

/** Days a trashed item survives before the sweep deletes it permanently. */
export const TRASH_RETENTION_DAYS = 30;

export type ContentRow = {
  id: string;
  kind: ContentKind;
  title: string;
  slug: string;
  status: ContentStatus;
  visibility: Visibility;
  hasPassword: boolean;
  editor: EditorKind;
  template: string;
  parentId: string | null;
  menuOrder: number;
  allowComments: boolean;
  authorId: string | null;
  authorName: string | null;
  /** Posts only. */
  categories: string[];
  tags: string[];
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  scheduledFor: string | null;
  trashedAt: string | null;
  /** Home page flag (pages) — surfaces as `— Home page` suffix. */
  isHome: boolean;
  seo: {
    score: number;
    focusKeyword: string;
    failing: string[];
  };
};

export type StatusCounts = Partial<Record<ContentStatus, number>>;

/* ------------------------------------------------------------- status views */

/** Which rows a status tab shows. `all` = everything except trash. */
export function matchesView(row: Pick<ContentRow, "status">, view: StatusView): boolean {
  if (view === "all") return row.status !== "trash";
  return row.status === view;
}

/** Tab strip data: `All (n)` first, then each status that has at least one item, Trash always last when non-empty. */
export function statusTabs(counts: StatusCounts): { view: StatusView; count: number }[] {
  const total = CONTENT_STATUSES.filter((s) => s !== "trash").reduce((n, s) => n + (counts[s] ?? 0), 0);
  const tabs: { view: StatusView; count: number }[] = [{ view: "all", count: total }];
  for (const s of ["published", "draft", "pending", "scheduled", "private"] as const) {
    if ((counts[s] ?? 0) > 0) tabs.push({ view: s, count: counts[s] ?? 0 });
  }
  if ((counts.trash ?? 0) > 0) tabs.push({ view: "trash", count: counts.trash ?? 0 });
  return tabs;
}

/** Counts from a plain jsonb `{status: n}` object, tolerating unknown keys. */
export function parseCounts(input: unknown): StatusCounts {
  const out: StatusCounts = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if ((CONTENT_STATUSES as readonly string[]).includes(k)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) out[k as ContentStatus] = n;
    }
  }
  return out;
}

/* ------------------------------------------------------------ title suffix */

/**
 * WordPress prints `— Draft`, `— Elementor`, `— Front Page` after the title so
 * state is readable without a badge column. We keep the same three families.
 */
export function titleSuffixes(row: ContentRow, lang: "en" | "bn" = "en"): string[] {
  const out: string[] = [];
  if (row.status !== "published" && row.status !== "trash") out.push(STATUS_SUFFIX[row.status][lang]);
  if (row.visibility === "private" && row.status === "published") out.push(STATUS_SUFFIX.private[lang]);
  if (row.hasPassword) out.push(lang === "bn" ? "পাসওয়ার্ড সুরক্ষিত" : "Password protected");
  if (row.editor === "builder") out.push(lang === "bn" ? "বিল্ডার" : "Builder");
  if (row.isHome) out.push(lang === "bn" ? "হোম পেজ" : "Home page");
  return out;
}

/* ------------------------------------------------------------- row actions */

export type RowAction =
  | "edit"
  | "quick-edit"
  | "trash"
  | "preview"
  | "view"
  | "edit-builder"
  | "restore"
  | "delete";

/** Hover action row per WordPress: published rows say View, others Preview; trash rows get Restore / Delete permanently. */
export function rowActions(row: Pick<ContentRow, "status" | "editor">): RowAction[] {
  if (row.status === "trash") return ["restore", "delete"];
  return ["edit", "quick-edit", "trash", row.status === "published" ? "view" : "preview", "edit-builder"];
}

export const ROW_ACTION_LABEL: Record<RowAction, { en: string; bn: string }> = {
  edit: { en: "Edit", bn: "সম্পাদনা" },
  "quick-edit": { en: "Quick Edit", bn: "দ্রুত সম্পাদনা" },
  trash: { en: "Trash", bn: "ট্র্যাশ" },
  preview: { en: "Preview", bn: "প্রিভিউ" },
  view: { en: "View", bn: "দেখুন" },
  "edit-builder": { en: "Edit with Builder", bn: "বিল্ডারে সম্পাদনা" },
  restore: { en: "Restore", bn: "ফিরিয়ে আনুন" },
  delete: { en: "Delete permanently", bn: "স্থায়ীভাবে মুছুন" },
};

/* ------------------------------------------------------------ bulk actions */

export const BULK_ACTIONS = ["edit", "trash", "publish", "unpublish", "restore", "delete"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export const BULK_ACTION_LABEL: Record<BulkAction, { en: string; bn: string }> = {
  edit: { en: "Edit", bn: "সম্পাদনা" },
  trash: { en: "Move to Trash", bn: "ট্র্যাশে পাঠান" },
  publish: { en: "Publish", bn: "প্রকাশ" },
  unpublish: { en: "Unpublish", bn: "অপ্রকাশিত করুন" },
  restore: { en: "Restore", bn: "ফিরিয়ে আনুন" },
  delete: { en: "Delete permanently", bn: "স্থায়ীভাবে মুছুন" },
};

/** The `Bulk actions ▾` options differ on the Trash tab. */
export function bulkActionsFor(view: StatusView): BulkAction[] {
  return view === "trash" ? ["restore", "delete"] : ["edit", "trash", "publish", "unpublish"];
}

/* ----------------------------------------------------------- date cell text */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026/09/04 at 8:53 am` — WordPress format, tabular-friendly. */
export function formatWpDate(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  void now;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  let h = d.getHours();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} at ${h}:${min} ${ampm}`;
}

/** First line of the date cell. */
export function dateCellLabel(row: Pick<ContentRow, "status" | "publishedAt" | "scheduledFor" | "trashedAt">): {
  label: { en: string; bn: string };
  iso: string | null;
} {
  if (row.status === "trash") return { label: { en: "Trashed", bn: "ট্র্যাশ করা" }, iso: row.trashedAt };
  if (row.status === "published") return { label: { en: "Published", bn: "প্রকাশিত" }, iso: row.publishedAt };
  if (row.status === "scheduled") return { label: { en: "Scheduled", bn: "নির্ধারিত" }, iso: row.scheduledFor };
  return { label: { en: "Last Modified", bn: "শেষ পরিবর্তন" }, iso: null };
}

/** Days left before a trashed row is purged; never negative. */
export function trashDaysLeft(trashedAt: string | null, now: Date = new Date()): number {
  if (!trashedAt) return TRASH_RETENTION_DAYS;
  const elapsed = (now.getTime() - new Date(trashedAt).getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - elapsed));
}

/** `All dates ▾` options: distinct `YYYY-MM` buckets, newest first, labelled `September 2026`. */
export function dateBuckets(rows: readonly Pick<ContentRow, "createdAt">[]): { id: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    const d = new Date(r.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const id = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!seen.has(id)) {
      const long = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
      ][d.getMonth()];
      seen.set(id, `${long} ${d.getFullYear()}`);
    }
  }
  return [...seen.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([id, label]) => ({ id, label }));
}

export function inDateBucket(row: Pick<ContentRow, "createdAt">, bucket: string | undefined): boolean {
  if (!bucket) return true;
  return row.createdAt.slice(0, 7) === bucket;
}

/* ----------------------------------------------------------- filter + sort */

export type SortKey = "title" | "author" | "date" | "seo" | "order";

export function filterRows(
  rows: readonly ContentRow[],
  opts: { view: StatusView; q: string; bucket?: string; category?: string },
): ContentRow[] {
  const needle = opts.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (!matchesView(r, opts.view)) return false;
    if (!inDateBucket(r, opts.bucket)) return false;
    if (opts.category && !r.categories.includes(opts.category)) return false;
    if (!needle) return true;
    return (
      r.title.toLowerCase().includes(needle) ||
      r.slug.toLowerCase().includes(needle) ||
      (r.authorName ?? "").toLowerCase().includes(needle) ||
      r.tags.some((t) => t.toLowerCase().includes(needle))
    );
  });
}

export function sortRows(rows: readonly ContentRow[], key: SortKey | "", dir: "asc" | "desc"): ContentRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const value = (r: ContentRow): string | number => {
    switch (key) {
      case "title":
        return r.title.toLowerCase();
      case "author":
        return (r.authorName ?? "").toLowerCase();
      case "seo":
        return r.seo.score;
      case "order":
        return r.menuOrder;
      case "date":
      default:
        return r.status === "published" && r.publishedAt ? r.publishedAt : r.updatedAt;
    }
  };
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
    return String(x).localeCompare(String(y)) * sign;
  });
}

/* ------------------------------------------------------------- quick edit */

export type QuickEditDraft = {
  title: string;
  slug: string;
  /** `YYYY-MM-DDTHH:mm` local; empty = keep. */
  date: string;
  password: string;
  isPrivate: boolean;
  parentId: string | null;
  menuOrder: number;
  template: string;
  status: Exclude<ContentStatus, "trash" | "private">;
  allowComments: boolean;
};

export type QuickEditErrors = Partial<Record<keyof QuickEditDraft, { en: string; bn: string }>>;

export const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$/;

export function slugifyTitle(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function quickEditFrom(row: ContentRow): QuickEditDraft {
  const iso = row.status === "scheduled" ? row.scheduledFor : row.publishedAt;
  return {
    title: row.title,
    slug: row.slug,
    date: iso ? toLocalInput(iso) : "",
    password: "",
    isPrivate: row.visibility === "private",
    parentId: row.parentId,
    menuOrder: row.menuOrder,
    template: row.template,
    status: row.status === "trash" || row.status === "private" ? "draft" : row.status,
    allowComments: row.allowComments,
  };
}

export function validateQuickEdit(draft: QuickEditDraft, opts: { selfId?: string } = {}): QuickEditErrors {
  const errors: QuickEditErrors = {};
  if (draft.title.trim().length < 2) errors.title = { en: "Title needs at least 2 characters.", bn: "শিরোনামে কমপক্ষে ২টি অক্ষর দিন।" };
  if (draft.title.length > 160) errors.title = { en: "Title is longer than 160 characters.", bn: "শিরোনাম ১৬০ অক্ষরের বেশি।" };
  if (!SLUG_RE.test(draft.slug)) errors.slug = { en: "Use lowercase letters, numbers and dashes only.", bn: "শুধু ছোট হাতের অক্ষর, সংখ্যা ও ড্যাশ।" };
  if (draft.password.length > 64) errors.password = { en: "Password is too long.", bn: "পাসওয়ার্ড খুব বড়।" };
  if (draft.password && draft.isPrivate) errors.password = { en: "A private page cannot also have a password.", bn: "ব্যক্তিগত পেজে পাসওয়ার্ড দেওয়া যায় না।" };
  if (!Number.isInteger(draft.menuOrder) || draft.menuOrder < 0 || draft.menuOrder > 9999)
    errors.menuOrder = { en: "Order must be a whole number from 0 to 9999.", bn: "ক্রম ০ থেকে ৯৯৯৯ এর মধ্যে হতে হবে।" };
  if (opts.selfId && draft.parentId === opts.selfId) errors.parentId = { en: "A page cannot be its own parent.", bn: "পেজ নিজের প্যারেন্ট হতে পারে না।" };
  if (draft.date && Number.isNaN(new Date(draft.date).getTime())) errors.date = { en: "Enter a valid date.", bn: "সঠিক তারিখ দিন।" };
  return errors;
}

/** Resolve the status/visibility pair the server should persist. */
export function effectiveStatus(draft: QuickEditDraft, now: Date = new Date()): { status: ContentStatus; visibility: Visibility } {
  if (draft.isPrivate) return { status: "private", visibility: "private" };
  const visibility: Visibility = draft.password ? "password" : "public";
  if (draft.status === "published" && draft.date && new Date(draft.date).getTime() > now.getTime()) {
    return { status: "scheduled", visibility };
  }
  return { status: draft.status, visibility };
}

/* -------------------------------------------------------------- bulk edit */

export const NO_CHANGE = "__no_change__" as const;

export type BulkEditDraft = {
  authorId: string | typeof NO_CHANGE;
  parentId: string | null | typeof NO_CHANGE;
  template: string | typeof NO_CHANGE;
  allowComments: boolean | typeof NO_CHANGE;
  status: Exclude<ContentStatus, "trash"> | typeof NO_CHANGE;
};

export const EMPTY_BULK_EDIT: BulkEditDraft = {
  authorId: NO_CHANGE,
  parentId: NO_CHANGE,
  template: NO_CHANGE,
  allowComments: NO_CHANGE,
  status: NO_CHANGE,
};

/** Only the fields the merchant actually changed travel to the server. */
export function bulkEditPatch(draft: BulkEditDraft): Partial<{
  authorId: string;
  parentId: string | null;
  template: string;
  allowComments: boolean;
  status: Exclude<ContentStatus, "trash">;
}> {
  const patch: ReturnType<typeof bulkEditPatch> = {};
  if (draft.authorId !== NO_CHANGE) patch.authorId = draft.authorId;
  if (draft.parentId !== NO_CHANGE) patch.parentId = draft.parentId;
  if (draft.template !== NO_CHANGE) patch.template = draft.template;
  if (draft.allowComments !== NO_CHANGE) patch.allowComments = draft.allowComments;
  if (draft.status !== NO_CHANGE) patch.status = draft.status;
  return patch;
}

/* ------------------------------------------------------------- SEO score */

/** Rank Math bands: ≥81 great, 51–80 good, <51 poor. */
export function seoBand(score: number): "great" | "good" | "poor" {
  if (score >= 81) return "great";
  if (score >= 51) return "good";
  return "poor";
}

/* ---------------------------------------------------------------- helpers */

export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Tree order for the Parent ▾ select: parents first, children indented. */
export function parentOptions(rows: readonly ContentRow[], excludeId?: string): { id: string; label: string; depth: number }[] {
  const byParent = new Map<string | null, ContentRow[]>();
  for (const r of rows) {
    if (r.status === "trash" || r.id === excludeId) continue;
    const list = byParent.get(r.parentId) ?? [];
    list.push(r);
    byParent.set(r.parentId, list);
  }
  const out: { id: string; label: string; depth: number }[] = [];
  const walk = (parent: string | null, depth: number, seen: Set<string>) => {
    for (const r of (byParent.get(parent) ?? []).sort((a, b) => a.menuOrder - b.menuOrder || a.title.localeCompare(b.title))) {
      if (seen.has(r.id) || depth > 5) continue;
      seen.add(r.id);
      out.push({ id: r.id, label: r.title, depth });
      walk(r.id, depth + 1, seen);
    }
  };
  walk(null, 0, new Set());
  // Orphans (parent trashed/missing) still need to be selectable.
  for (const r of rows) {
    if (r.status !== "trash" && r.id !== excludeId && !out.some((o) => o.id === r.id)) out.push({ id: r.id, label: r.title, depth: 0 });
  }
  return out;
}

/** Keyboard map shown in the `?` help sheet and handled by the desk. */
export const DESK_SHORTCUTS = [
  { keys: "j / k", en: "Next / previous row", bn: "পরের / আগের সারি" },
  { keys: "x", en: "Select row", bn: "সারি নির্বাচন" },
  { keys: "e", en: "Edit", bn: "সম্পাদনা" },
  { keys: "q", en: "Quick edit", bn: "দ্রুত সম্পাদনা" },
  { keys: "#", en: "Move to trash", bn: "ট্র্যাশে পাঠান" },
  { keys: "/", en: "Focus search", bn: "সার্চে যান" },
  { keys: "Esc", en: "Close quick edit", bn: "দ্রুত সম্পাদনা বন্ধ" },
  { keys: "?", en: "This help", bn: "এই সাহায্য" },
] as const;
