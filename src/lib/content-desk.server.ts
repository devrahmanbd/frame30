/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Content desk — server runtime (Phase 11).
 *
 * Reads and writes for the Pages / Posts list screens. Every query runs on the
 * caller's authenticated client so RLS is the tenant boundary; the explicit
 * `merchant_id` filters exist so a wrong id returns "not found" instead of an
 * empty update.
 *
 * Trash semantics follow WordPress: `status = 'trash'` plus `trashed_at` and the
 * status it had before (`trashed_from_status`) so Restore is exact. Nothing is
 * hard-deleted except from the Trash tab, and even then we soft-delete via
 * `deleted_at` so the URL stays auditable for redirects.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  parseCounts,
  type ContentKind,
  type ContentRow,
  type ContentStatus,
  type StatusCounts,
} from "./content-desk";
import { analyseSeo } from "./seo-analysis";
import { incr, log } from "./observability.server";

type Client = SupabaseClient<Database>;
type Loose = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };
const loose = (db: Client) => db as unknown as Loose;

const LIST_LIMIT = 500;

const PAGE_COLUMNS =
  "id, slug, title, excerpt, body_markdown, meta_title, meta_description, robots, is_published, show_in_nav, position, published_at, created_at, updated_at, status, trashed_at, author_id, parent_id, menu_order, password, visibility, template, editor, allow_comments, scheduled_for";

const ARTICLE_COLUMNS =
  "id, slug, title, title_en, excerpt, body, meta_title, meta_description, robots, canonical, status, tags, category_id, published_at, scheduled_for, created_at, updated_at, trashed_at, author_id, menu_order, password, visibility, template, editor, allow_comments";

type SeoMetaRow = { entity_type: string; entity_id: string | null; score: number; focus_keyword: string | null };

/* -------------------------------------------------------------------- list */

export type ContentDesk = {
  rows: ContentRow[];
  counts: StatusCounts;
  authors: { id: string; name: string }[];
  categories: { id: string; name: string; slug: string }[];
  storeSlug: string;
  homeSlug: string | null;
};

export async function loadContentDesk(db: Client, merchantId: string, kind: ContentKind): Promise<ContentDesk> {
  const [merchant, authorsRes, countsRes, metas] = await Promise.all([
    db.from("merchants").select("slug, name").eq("id", merchantId).maybeSingle(),
    loose(db).rpc("content_desk_authors", { _merchant_id: merchantId }),
    loose(db).rpc("content_desk_counts", { _merchant_id: merchantId, _kind: kind }),
    db
      .from("seo_meta")
      .select("entity_type, entity_id, score, focus_keyword")
      .eq("merchant_id", merchantId)
      .eq("entity_type", kind === "page" ? "page" : "article")
      .limit(LIST_LIMIT),
  ]);

  const authors = new Map<string, string>();
  for (const a of (authorsRes.data ?? []) as { user_id: string; full_name: string | null }[]) {
    authors.set(a.user_id, a.full_name || "Team member");
  }
  const seo = new Map<string, { score: number; keyword: string }>();
  for (const m of ((metas.data ?? []) as SeoMetaRow[])) {
    if (m.entity_id) seo.set(m.entity_id, { score: m.score, keyword: m.focus_keyword ?? "" });
  }

  const storeSlug = merchant.data?.slug ?? "";
  const storeName = merchant.data?.name ?? "Store";

  let rows: ContentRow[] = [];
  let categories: ContentDesk["categories"] = [];

  if (kind === "page") {
    const { data, error } = await loose(db)
      .from("storefront_pages")
      .select(PAGE_COLUMNS)
      .eq("merchant_id", merchantId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(LIST_LIMIT);
    if (error) throw new Error(error.message);
    rows = (data as any[]).map((r) => pageRow(r, authors, seo, storeName));
  } else {
    const [{ data, error }, terms, links] = await Promise.all([
      loose(db)
        .from("articles")
        .select(ARTICLE_COLUMNS)
        .eq("merchant_id", merchantId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(LIST_LIMIT),
      loose(db).from("blog_terms").select("id, name, slug, kind").eq("merchant_id", merchantId).limit(500),
      loose(db).from("article_terms").select("article_id, term_id").eq("merchant_id", merchantId).limit(5_000),
    ]);
    if (error) throw new Error(error.message);
    const termById = new Map<string, { name: string; slug: string; kind: string }>();
    for (const t of (terms.data ?? []) as any[]) termById.set(t.id, { name: t.name, slug: t.slug, kind: t.kind });
    const catsByArticle = new Map<string, string[]>();
    for (const l of (links.data ?? []) as any[]) {
      const term = termById.get(l.term_id);
      if (!term || term.kind !== "category") continue;
      const list = catsByArticle.get(l.article_id) ?? [];
      list.push(term.name);
      catsByArticle.set(l.article_id, list);
    }
    categories = [...termById.entries()]
      .filter(([, t]) => t.kind === "category")
      .map(([id, t]) => ({ id, name: t.name, slug: t.slug }))
      .sort((a, b) => a.name.localeCompare(b.name));
    rows = (data as any[]).map((r) => articleRow(r, authors, seo, catsByArticle.get(r.id) ?? [], storeName));
  }

  return {
    rows,
    counts: parseCounts(countsRes.data),
    authors: [...authors.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    categories,
    storeSlug,
    homeSlug: null,
  };
}

function statusOf(raw: string | null | undefined, fallbackPublished: boolean): ContentStatus {
  const s = (raw ?? "").toLowerCase();
  if (["published", "draft", "pending", "scheduled", "private", "trash"].includes(s)) return s as ContentStatus;
  if (s === "archived") return "draft";
  return fallbackPublished ? "published" : "draft";
}

function quickSeo(
  id: string,
  cached: Map<string, { score: number; keyword: string }>,
  fields: { title: string; metaTitle: string; metaDescription: string; robots: string; body: string; slug: string; storeName: string },
): ContentRow["seo"] {
  const hit = cached.get(id);
  const report = analyseSeo({
    metaTitle: fields.metaTitle,
    metaDescription: fields.metaDescription,
    canonical: "",
    robotsIndex: !fields.robots.startsWith("noindex"),
    robotsFollow: !fields.robots.includes("nofollow"),
    ogImageUrl: "",
    focusKeyword: hit?.keyword ?? "",
    faq: [],
    content: fields.body,
    url: `/${fields.slug}`,
    fallbackTitle: `${fields.title} — ${fields.storeName}`,
    fallbackDescription: "",
  });
  return {
    score: hit?.score ?? report.score,
    focusKeyword: hit?.keyword ?? "",
    failing: report.checks.filter((c) => c.status === "fail").slice(0, 4).map((c) => c.label),
  };
}

function pageRow(
  r: any,
  authors: Map<string, string>,
  seo: Map<string, { score: number; keyword: string }>,
  storeName: string,
): ContentRow {
  return {
    id: r.id,
    kind: "page",
    title: r.title,
    slug: r.slug,
    status: statusOf(r.status, Boolean(r.is_published)),
    visibility: r.visibility ?? "public",
    hasPassword: Boolean(r.password),
    editor: r.editor === "builder" ? "builder" : "classic",
    template: r.template ?? "default",
    parentId: r.parent_id ?? null,
    menuOrder: Number(r.menu_order ?? r.position ?? 0),
    allowComments: Boolean(r.allow_comments),
    authorId: r.author_id ?? null,
    authorName: r.author_id ? (authors.get(r.author_id) ?? null) : null,
    categories: [],
    tags: [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    publishedAt: r.published_at ?? null,
    scheduledFor: r.scheduled_for ?? null,
    trashedAt: r.trashed_at ?? null,
    isHome: r.slug === "home" || r.slug === "index",
    seo: quickSeo(r.id, seo, {
      title: r.title,
      metaTitle: r.meta_title ?? "",
      metaDescription: r.meta_description ?? r.excerpt ?? "",
      robots: r.robots ?? "",
      body: r.body_markdown ?? "",
      slug: r.slug,
      storeName,
    }),
  };
}

function articleRow(
  r: any,
  authors: Map<string, string>,
  seo: Map<string, { score: number; keyword: string }>,
  categories: string[],
  storeName: string,
): ContentRow {
  return {
    id: r.id,
    kind: "post",
    title: r.title,
    slug: r.slug,
    status: statusOf(r.status, false),
    visibility: r.visibility ?? "public",
    hasPassword: Boolean(r.password),
    editor: r.editor === "builder" ? "builder" : "classic",
    template: r.template ?? "default",
    parentId: null,
    menuOrder: Number(r.menu_order ?? 0),
    allowComments: r.allow_comments !== false,
    authorId: r.author_id ?? null,
    authorName: r.author_id ? (authors.get(r.author_id) ?? null) : null,
    categories,
    tags: Array.isArray(r.tags) ? r.tags : [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    publishedAt: r.published_at ?? null,
    scheduledFor: r.scheduled_for ?? null,
    trashedAt: r.trashed_at ?? null,
    isHome: false,
    seo: quickSeo(r.id, seo, {
      title: r.title,
      metaTitle: r.meta_title ?? "",
      metaDescription: r.meta_description ?? r.excerpt ?? "",
      robots: r.robots ?? "",
      body: r.body ?? "",
      slug: r.slug,
      storeName,
    }),
  };
}

/* ------------------------------------------------------------------ writes */

const table = (kind: ContentKind) => (kind === "page" ? "storefront_pages" : "articles");

async function ownedRows(db: Client, merchantId: string, kind: ContentKind, ids: string[]) {
  const { data, error } = await loose(db)
    .from(table(kind))
    .select("id, status, slug, title")
    .eq("merchant_id", merchantId)
    .is("deleted_at", null)
    .in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; status: string; slug: string; title: string }[];
}

export type QuickEditInput = {
  id: string;
  title: string;
  slug: string;
  date: string | null;
  password: string | null;
  parentId: string | null;
  menuOrder: number;
  template: string;
  status: ContentStatus;
  visibility: "public" | "private" | "password";
  allowComments: boolean;
};

export async function applyQuickEdit(db: Client, merchantId: string, kind: ContentKind, input: QuickEditInput) {
  const [existing] = await ownedRows(db, merchantId, kind, [input.id]);
  if (!existing) throw new Error("not_found");

  const patch: Record<string, unknown> = {
    title: input.title,
    slug: input.slug,
    status: input.status,
    visibility: input.visibility,
    menu_order: input.menuOrder,
    template: input.template,
    allow_comments: input.allowComments,
    editor: undefined,
  };
  delete patch.editor;
  if (kind === "page") {
    patch.parent_id = input.parentId;
    patch.position = input.menuOrder;
  }
  // Password: empty string clears, null keeps, anything else sets.
  if (input.password !== null) patch.password = input.password || null;
  if (input.visibility !== "password") patch.password = null;

  if (input.status === "scheduled") {
    patch.scheduled_for = input.date ? new Date(input.date).toISOString() : null;
    patch.published_at = null;
  } else if (input.status === "published") {
    patch.published_at = input.date ? new Date(input.date).toISOString() : (existing.status === "published" ? undefined : new Date().toISOString());
    patch.scheduled_for = null;
    if (patch.published_at === undefined) delete patch.published_at;
  }

  if (existing.slug !== input.slug && existing.status === "published") {
    await recordRedirect(db, merchantId, kind, existing.slug, input.slug);
  }

  const { error } = await loose(db).from(table(kind)).update(patch).eq("id", input.id).eq("merchant_id", merchantId);
  if (error) {
    if (error.code === "23505") throw new Error("slug_taken");
    throw new Error(error.message);
  }
  incr("framique_content_desk_write_total", { kind, action: "quick_edit" });
  log("info", "content_desk.quick_edit", { merchant_id: merchantId, kind, id: input.id });
  return { ok: true as const };
}

export type BulkPatch = Partial<{
  authorId: string;
  parentId: string | null;
  template: string;
  allowComments: boolean;
  status: Exclude<ContentStatus, "trash">;
}>;

export async function applyBulkEdit(db: Client, merchantId: string, kind: ContentKind, ids: string[], patch: BulkPatch) {
  const rows = await ownedRows(db, merchantId, kind, ids);
  if (rows.length === 0) return { updated: 0 };
  const update: Record<string, unknown> = {};
  if (patch.authorId !== undefined) update.author_id = patch.authorId;
  if (patch.parentId !== undefined && kind === "page") update.parent_id = patch.parentId;
  if (patch.template !== undefined) update.template = patch.template;
  if (patch.allowComments !== undefined) update.allow_comments = patch.allowComments;
  if (patch.status !== undefined) {
    update.status = patch.status;
    if (patch.status === "published") update.published_at = new Date().toISOString();
  }
  if (Object.keys(update).length === 0) return { updated: 0 };
  const { error } = await loose(db)
    .from(table(kind))
    .update(update)
    .eq("merchant_id", merchantId)
    .in("id", rows.map((r) => r.id));
  if (error) throw new Error(error.message);
  incr("framique_content_desk_write_total", { kind, action: "bulk_edit" });
  return { updated: rows.length };
}

export type BulkVerb = "trash" | "restore" | "publish" | "unpublish" | "delete";

export async function applyBulkVerb(db: Client, merchantId: string, kind: ContentKind, ids: string[], verb: BulkVerb) {
  const rows = await ownedRows(db, merchantId, kind, ids);
  if (rows.length === 0) return { updated: 0 };
  const now = new Date().toISOString();

  if (verb === "delete") {
    const trashed = rows.filter((r) => r.status === "trash");
    if (trashed.length === 0) return { updated: 0 };
    const { error } = await loose(db)
      .from(table(kind))
      .update({ deleted_at: now })
      .eq("merchant_id", merchantId)
      .in("id", trashed.map((r) => r.id));
    if (error) throw new Error(error.message);
    incr("framique_content_desk_write_total", { kind, action: "delete" });
    return { updated: trashed.length };
  }

  if (verb === "restore") {
    // Restore is per-row because each remembers its own prior status.
    const { data } = await loose(db)
      .from(table(kind))
      .select("id, trashed_from_status")
      .eq("merchant_id", merchantId)
      .in("id", rows.filter((r) => r.status === "trash").map((r) => r.id));
    let n = 0;
    for (const r of (data ?? []) as { id: string; trashed_from_status: string | null }[]) {
      const back = r.trashed_from_status && r.trashed_from_status !== "trash" ? r.trashed_from_status : "draft";
      const { error } = await loose(db)
        .from(table(kind))
        .update({ status: back, trashed_at: null, trashed_from_status: null })
        .eq("id", r.id)
        .eq("merchant_id", merchantId);
      if (error) throw new Error(error.message);
      n += 1;
    }
    incr("framique_content_desk_write_total", { kind, action: "restore" });
    return { updated: n };
  }

  if (verb === "trash") {
    let n = 0;
    for (const r of rows.filter((r) => r.status !== "trash")) {
      const { error } = await loose(db)
        .from(table(kind))
        .update({ status: "trash", trashed_at: now, trashed_from_status: r.status || "draft" })
        .eq("id", r.id)
        .eq("merchant_id", merchantId);
      if (error) throw new Error(error.message);
      n += 1;
    }
    incr("framique_content_desk_write_total", { kind, action: "trash" });
    return { updated: n };
  }

  const status = verb === "publish" ? "published" : "draft";
  const targets = rows.filter((r) => r.status !== "trash" && r.status !== status);
  if (targets.length === 0) return { updated: 0 };
  const update: Record<string, unknown> = { status };
  if (verb === "publish") update.published_at = now;
  const { error } = await loose(db)
    .from(table(kind))
    .update(update)
    .eq("merchant_id", merchantId)
    .in("id", targets.map((r) => r.id));
  if (error) throw new Error(error.message);
  incr("framique_content_desk_write_total", { kind, action: verb });
  return { updated: targets.length };
}

/** `Add page` / `Add post` creates an untitled draft and hands back its id so the editor opens it. */
export async function createDraft(db: Client, merchantId: string, kind: ContentKind, userId: string, opts: { title?: string; editor?: "classic" | "builder" } = {}) {
  const title = opts.title?.trim() || (kind === "page" ? "Untitled page" : "Untitled post");
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || kind;
  const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;
  const row: Record<string, unknown> =
    kind === "page"
      ? { merchant_id: merchantId, title, slug, status: "draft", is_published: false, body_markdown: "", author_id: userId, editor: opts.editor ?? "classic", show_in_nav: false }
      : { merchant_id: merchantId, title, slug, status: "draft", body: "", author_id: userId, editor: opts.editor ?? "classic" };
  const { data, error } = await loose(db).from(table(kind)).insert(row).select("id").single();
  if (error) throw new Error(error.message);
  incr("framique_content_desk_write_total", { kind, action: "create" });
  return { id: (data as { id: string }).id };
}

/** Slug rename on a published item keeps the old URL alive as a 301. */
async function recordRedirect(db: Client, merchantId: string, kind: ContentKind, fromSlug: string, toSlug: string) {
  const from = kind === "page" ? `/pages/${fromSlug}` : `/blog/${fromSlug}`;
  const to = kind === "page" ? `/pages/${toSlug}` : `/blog/${toSlug}`;
  const { error } = await loose(db)
    .from("url_redirects")
    .upsert({ merchant_id: merchantId, from_path: from, to_path: to, status_code: 301 }, { onConflict: "merchant_id,from_path" });
  if (error) log("warn", "content_desk.redirect_failed", { merchant_id: merchantId, from, to, error: error.message });
}

/** Cron: permanently soft-delete anything trashed more than 30 days ago. */
export async function sweepTrash(db: Client, retentionDays = 30) {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  let total = 0;
  for (const t of ["storefront_pages", "articles"] as const) {
    const { data, error } = await loose(db)
      .from(t)
      .update({ deleted_at: new Date().toISOString() })
      .eq("status", "trash")
      .is("deleted_at", null)
      .lt("trashed_at", cutoff)
      .select("id");
    if (error) throw new Error(error.message);
    total += (data ?? []).length;
  }
  incr("framique_content_trash_swept_total", {}, total);
  return { swept: total };
}
