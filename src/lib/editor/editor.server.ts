/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 12 — editor server runtime.
 *
 * Loads one page or post into an `EditorDoc`, saves it back (autosave
 * checkpoint, manual save, publish/schedule), keeps a revision trail, and
 * exposes the sidebar option lists (authors, parents, taxonomy). All queries
 * run on the caller's authenticated client, so RLS is the tenant boundary.
 *
 * Save semantics (mirrors `cms.server.ts` and WordPress):
 *  - autosave: content checkpoint only — never changes slug, status or dates.
 *  - manual:   full write; `published_at` is stamped once, on first publish.
 *  - slug change on a published item records a 301 in `url_redirects`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { normalizeBody, parseBody, validateBody } from "@/lib/blog-body";
import { isBuilderBody } from "@/lib/page-builder";
import { analyseSeo } from "@/lib/seo-analysis";
import { parseEntitySeo, robotsContent } from "@/lib/seo/seo-meta";
import { incr, log } from "@/lib/observability.server";
import {
  effectiveSlug,
  emptyEditorDoc,
  resolvePublishStatus,
  validateDoc,
  type ContentKind,
  type ContentStatus,
  type EditorDoc,
  type PostFormat,
} from "./editor-doc";
import { blocksToMarkdown, markdownToBlocks, markdownToText } from "./page-markdown";

type Client = SupabaseClient<Database>;
type Loose = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};
const loose = (db: Client) => db as unknown as Loose;

const PAGE_COLUMNS =
  "id, slug, title, excerpt, body_markdown, meta_title, meta_description, robots, is_published, show_in_nav, position, published_at, created_at, updated_at, status, trashed_at, author_id, parent_id, menu_order, password, visibility, template, editor, allow_comments, scheduled_for, featured_image_url, seo_extended, theme_id";

const ARTICLE_COLUMNS =
  "id, slug, title, title_en, excerpt, body, cover_image_url, meta_title, meta_description, robots, canonical, status, tags, category_id, published_at, scheduled_for, created_at, updated_at, trashed_at, author_id, menu_order, password, visibility, template, editor, allow_comments, format, seo_extended";

const table = (kind: ContentKind) => (kind === "page" ? "storefront_pages" : "articles");
const revisionTable = (kind: ContentKind) =>
  kind === "page" ? "page_revisions" : "article_revisions";
const fk = (kind: ContentKind) => (kind === "page" ? "page_id" : "article_id");

export class EditorError extends Error {
  constructor(
    public code: string,
    public en: string,
    public bn: string,
    public field: string = "",
  ) {
    super(`${code}|${field}|${en}|${bn}`);
    this.name = "EditorError";
  }
}

/* ------------------------------------------------------------------ load */

export type EditorContext = {
  doc: EditorDoc;
  storeSlug: string;
  storeName: string;
  authors: { id: string; name: string }[];
  parents: { id: string; title: string; parentId: string | null }[];
  terms: { id: string; kind: "category" | "tag"; label: string; slug: string }[];
  /** Phase 17 — installed themes a page can pin itself to. */
  themes: { id: string; name: string; isActive: boolean }[];
  revisions: RevisionSummary[];
  currentUserId: string;
};

export type RevisionSummary = {
  id: string;
  title: string;
  status: string;
  isAutosave: boolean;
  createdAt: string;
  authorId: string | null;
};

function statusOf(raw: string | null | undefined, published: boolean): ContentStatus {
  const s = (raw ?? "") as ContentStatus;
  if (["published", "draft", "pending", "scheduled", "private", "trash"].includes(s)) return s;
  return published ? "published" : "draft";
}

function pageToDoc(row: any): EditorDoc {
  return {
    ...emptyEditorDoc("page"),
    id: row.id,
    title: row.title ?? "",
    slug: row.slug ?? "",
    body: row.body_markdown ?? "",
    editor: row.editor === "builder" || isBuilderBody(row.body_markdown) ? "builder" : "classic",
    excerpt: row.excerpt ?? "",
    status: statusOf(row.status, !!row.is_published),
    publishAt: row.scheduled_for ?? null,
    publishedAt: row.published_at ?? null,
    visibility:
      (row.visibility as EditorDoc["visibility"]) ?? (row.password ? "password" : "public"),
    password: row.password ?? "",
    authorId: row.author_id ?? null,
    template: row.template ?? "default",
    themeId: row.theme_id ?? null,
    parentId: row.parent_id ?? null,
    menuOrder: Number(row.menu_order ?? row.position ?? 0),
    allowComments: !!row.allow_comments,
    featuredImage: row.featured_image_url ?? "",
    showInNav: !!row.show_in_nav,
    seo: {
      metaTitle: row.meta_title ?? "",
      metaDescription: row.meta_description ?? "",
      canonical: "",
      robots: row.robots ?? "index,follow",
    },
    seoExtended: parseEntitySeo(row.seo_extended),
    updatedAt: row.updated_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

function articleToDoc(row: any, categories: string[], tags: string[]): EditorDoc {
  return {
    ...emptyEditorDoc("post"),
    id: row.id,
    title: row.title ?? "",
    titleEn: row.title_en ?? "",
    slug: row.slug ?? "",
    body: row.body ?? "",
    editor: row.editor === "builder" || isBuilderBody(row.body) ? "builder" : "classic",
    excerpt: row.excerpt ?? "",
    status: statusOf(row.status, row.status === "published"),
    publishAt: row.scheduled_for ?? null,
    publishedAt: row.published_at ?? null,
    visibility:
      (row.visibility as EditorDoc["visibility"]) ?? (row.password ? "password" : "public"),
    password: row.password ?? "",
    authorId: row.author_id ?? null,
    template: row.template ?? "default",
    parentId: null,
    menuOrder: Number(row.menu_order ?? 0),
    allowComments: row.allow_comments ?? true,
    format: (row.format as PostFormat) ?? "standard",
    featuredImage: row.cover_image_url ?? "",
    categories,
    tags,
    seo: {
      metaTitle: row.meta_title ?? "",
      metaDescription: row.meta_description ?? "",
      canonical: row.canonical ?? "",
      robots: row.robots ?? "index,follow",
    },
    seoExtended: parseEntitySeo(row.seo_extended),
    updatedAt: row.updated_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

export async function loadEditor(
  db: Client,
  merchantId: string,
  userId: string,
  kind: ContentKind,
  id: string | null,
): Promise<EditorContext> {
  const [merchant, authorsRes, parentsRes, termsRes, themesRes] = await Promise.all([
    db.from("merchants").select("slug, name").eq("id", merchantId).maybeSingle(),
    loose(db).rpc("content_desk_authors", { _merchant_id: merchantId }),
    kind === "page"
      ? loose(db)
          .from("storefront_pages")
          .select("id, title, parent_id")
          .eq("merchant_id", merchantId)
          .is("deleted_at", null)
          .neq("status", "trash")
          .order("menu_order")
          .limit(500)
      : Promise.resolve({ data: [] }),
    kind === "post"
      ? loose(db)
          .from("blog_terms")
          .select("id, kind, name, slug, parent_id")
          .eq("merchant_id", merchantId)
          .order("sort_order")
          .limit(400)
      : Promise.resolve({ data: [] }),
    // Phase 17 — a page may pin any installed theme; posts always follow the site.
    kind === "page"
      ? loose(db)
          .from("store_themes")
          .select("id, name, is_active")
          .eq("merchant_id", merchantId)
          .order("created_at", { ascending: true })
          .limit(50)
      : Promise.resolve({ data: [] }),
  ]);

  let doc = emptyEditorDoc(kind);
  doc.authorId = userId;
  let revisions: RevisionSummary[] = [];

  if (id) {
    const { data: row, error } = await loose(db)
      .from(table(kind))
      .select(kind === "page" ? PAGE_COLUMNS : ARTICLE_COLUMNS)
      .eq("id", id)
      .eq("merchant_id", merchantId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new EditorError("not_found", "That item no longer exists.", "আইটেমটি আর নেই।");

    if (kind === "page") doc = pageToDoc(row);
    else {
      const { data: assigned } = await loose(db)
        .from("article_terms")
        .select("term_id, blog_terms(kind)")
        .eq("merchant_id", merchantId)
        .eq("article_id", id);
      const categories: string[] = [];
      const tags: string[] = [];
      for (const a of (assigned ?? []) as any[]) {
        (a.blog_terms?.kind === "tag" ? tags : categories).push(a.term_id);
      }
      // Tags: taxonomy tags when the term tables exist, else the free-text `tags[]` column.
      doc = articleToDoc(row, categories, tags.length ? tags : ((row.tags ?? []) as string[]));
    }
    revisions = await listRevisions(db, merchantId, kind, id);
  }

  const terms = ((termsRes as any).data ?? []) as any[];
  return {
    doc,
    storeSlug: merchant.data?.slug ?? "",
    storeName: merchant.data?.name ?? "",
    authors: (((authorsRes as any).data ?? []) as { user_id: string; full_name: string }[]).map(
      (a) => ({ id: a.user_id, name: a.full_name }),
    ),
    parents: (((parentsRes as any).data ?? []) as any[]).map((p) => ({
      id: p.id,
      title: p.title ?? "",
      parentId: p.parent_id ?? null,
    })),
    terms: terms.map((t) => ({
      id: t.id,
      kind: t.kind === "tag" ? "tag" : "category",
      label: t.name,
      slug: t.slug,
    })),
    themes: (((themesRes as any).data ?? []) as any[]).map((theme) => ({
      id: theme.id,
      name: theme.name ?? "Theme",
      isActive: Boolean(theme.is_active),
    })),
    revisions,
    currentUserId: userId,
  };
}

/* ------------------------------------------------------------------ save */

export type SaveMode = "autosave" | "save" | "publish";

export type SaveResult = {
  id: string;
  slug: string;
  status: ContentStatus;
  publishedAt: string | null;
  updatedAt: string;
  autosaved: boolean;
  revisionId: string | null;
  seoScore: number;
};

/** Canonicalise the body the same way the storefront renders it. */
function canonicalBody(kind: ContentKind, body: string): string {
  if (isBuilderBody(body)) return body;
  if (kind === "page") return blocksToMarkdown(markdownToBlocks(body));
  const blocks = parseBody(body);
  const issues = validateBody(blocks);
  if (issues.length) {
    const first = issues[0]!;
    throw new EditorError(first.code, first.en, first.bn, "body");
  }
  return normalizeBody(body);
}

function plainText(kind: ContentKind, body: string): string {
  if (isBuilderBody(body)) return "";
  if (kind === "page") return markdownToText(body);
  return parseBody(body)
    .map((b) => ("inline" in b ? b.inline.map((n) => ("v" in n ? n.v : "")).join("") : ""))
    .join(" ");
}

async function slugTaken(
  db: Client,
  merchantId: string,
  kind: ContentKind,
  slug: string,
  selfId: string | null,
): Promise<boolean> {
  let q = loose(db)
    .from(table(kind))
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("slug", slug)
    .is("deleted_at", null)
    .limit(1);
  if (selfId) q = q.neq("id", selfId);
  const { data } = await q;
  return (data ?? []).length > 0;
}

async function snapshot(
  db: Client,
  merchantId: string,
  kind: ContentKind,
  id: string,
  userId: string,
  autosave: boolean,
): Promise<string | null> {
  const { data } = await loose(db)
    .from(table(kind))
    .select(
      kind === "page"
        ? "title, excerpt, body_markdown, status, slug, meta_title, meta_description"
        : "title, title_en, excerpt, body, status, slug, meta_title, meta_description",
    )
    .eq("id", id)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!data) return null;
  const row: Record<string, unknown> = {
    merchant_id: merchantId,
    [fk(kind)]: id,
    title: data.title ?? "",
    excerpt: data.excerpt ?? null,
    status: data.status ?? "draft",
    slug: data.slug ?? "",
    meta_title: data.meta_title ?? null,
    meta_description: data.meta_description ?? null,
    author_id: userId,
    is_autosave: autosave,
  };
  if (kind === "page") row["body_markdown"] = data.body_markdown ?? "";
  else {
    row["body"] = data.body ?? "";
    row["title_en"] = data.title_en ?? null;
  }
  const { data: inserted, error } = await loose(db)
    .from(revisionTable(kind))
    .insert(row)
    .select("id")
    .single();
  if (error) {
    incr("framique_editor_snapshot_failed_total", { kind });
    log("warn", "editor.snapshot_failed", { kind, id, message: error.message });
    return null;
  }
  await pruneRevisions(db, merchantId, kind, id);
  return (inserted as { id: string }).id;
}

/** Keep the 5 newest autosaves and the 40 newest manual revisions. */
async function pruneRevisions(db: Client, merchantId: string, kind: ContentKind, id: string) {
  for (const [auto, keep] of [
    [true, 5],
    [false, 40],
  ] as const) {
    const { data } = await loose(db)
      .from(revisionTable(kind))
      .select("id")
      .eq("merchant_id", merchantId)
      .eq(fk(kind), id)
      .eq("is_autosave", auto)
      .order("created_at", { ascending: false })
      .range(keep, keep + 200);
    const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
    if (ids.length) await loose(db).from(revisionTable(kind)).delete().in("id", ids);
  }
}

export async function saveEditor(
  db: Client,
  merchantId: string,
  userId: string,
  doc: EditorDoc,
  mode: SaveMode,
  canPublish: boolean,
): Promise<SaveResult> {
  const autosave = mode === "autosave";
  const issues = validateDoc(doc);
  if (issues.length && !autosave) {
    const first = issues[0]!;
    throw new EditorError("invalid", first.en, first.bn, String(first.field));
  }
  if (autosave && !doc.title.trim() && !doc.body.trim()) {
    throw new EditorError("empty", "Nothing to save yet.", "এখনও সংরক্ষণের কিছু নেই।");
  }

  const body = canonicalBody(doc.kind, doc.body);
  const slug =
    effectiveSlug({ ...doc, title: doc.title || "untitled" }) ||
    `${doc.kind}-${Date.now().toString(36)}`;

  // Publishing without the permission demotes to pending review (WordPress "Submit for review").
  let status =
    mode === "publish"
      ? resolvePublishStatus({
          ...doc,
          status: doc.status === "draft" || doc.status === "pending" ? "published" : doc.status,
        })
      : doc.status;
  if (!canPublish && (status === "published" || status === "scheduled" || status === "private"))
    status = "pending";
  if (status === "trash") status = "draft";

  const now = new Date().toISOString();
  const extendedSeo = parseEntitySeo(doc.seoExtended);
  const robots = robotsContent(extendedSeo).toLowerCase();
  const seoScore = analyseSeo({
    metaTitle: extendedSeo.title || doc.seo.metaTitle,
    metaDescription: extendedSeo.description || doc.seo.metaDescription,
    canonical: extendedSeo.canonical || doc.seo.canonical,
    robotsIndex: !robots.includes("noindex"),
    robotsFollow: !robots.includes("nofollow"),
    ogImageUrl: doc.featuredImage,
    focusKeyword: extendedSeo.focusKeywords[0] ?? "",
    faq: extendedSeo.schema.faq,
    content: plainText(doc.kind, body),
    url: doc.kind === "page" ? `/pages/${slug}` : `/blog/${slug}`,
    fallbackTitle: doc.title,
    fallbackDescription: doc.excerpt,
  }).score;

  const shared: Record<string, unknown> = {
    title: doc.title.trim() || "Untitled",
    excerpt: doc.excerpt.trim() || null,
    meta_title: (extendedSeo.title || doc.seo.metaTitle).trim() || null,
    meta_description: (extendedSeo.description || doc.seo.metaDescription).trim() || null,
    robots,
    seo_extended: extendedSeo,
    author_id: doc.authorId,
    template: doc.template,
    editor: doc.editor,
    menu_order: doc.menuOrder,
    allow_comments: doc.allowComments,
    visibility: doc.visibility,
    password: doc.visibility === "password" ? doc.password : null,
  };
  const row: Record<string, unknown> =
    doc.kind === "page"
      ? {
          ...shared,
          body_markdown: body,
          theme_id: doc.themeId,
          parent_id: doc.parentId,
          position: doc.menuOrder,
          show_in_nav: doc.showInNav,
          featured_image_url: doc.featuredImage.trim() || null,
        }
      : {
          ...shared,
          body,
          title_en: doc.titleEn.trim() || null,
          cover_image_url: doc.featuredImage.trim() || null,
          canonical: (extendedSeo.canonical || doc.seo.canonical).trim() || null,
          format: doc.format,
          tags: doc.tags
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 12),
        };

  if (doc.id) {
    const { data: before, error: readError } = await loose(db)
      .from(table(doc.kind))
      .select("slug, status, published_at")
      .eq("id", doc.id)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!before)
      throw new EditorError("not_found", "That item no longer exists.", "আইটেমটি আর নেই।");

    const revisionId = await snapshot(db, merchantId, doc.kind, doc.id, userId, autosave);

    if (
      !autosave &&
      before.slug !== slug &&
      (await slugTaken(db, merchantId, doc.kind, slug, doc.id))
    ) {
      throw new EditorError(
        "slug_taken",
        "That URL is already used by another item.",
        "এই ঠিকানা অন্য কিছুতে ব্যবহৃত।",
        "slug",
      );
    }

    const firstPublish =
      !autosave && (status === "published" || status === "private") && !before.published_at;
    const update = autosave
      ? { ...row, updated_at: now }
      : {
          ...row,
          slug,
          status,
          scheduled_for: status === "scheduled" ? doc.publishAt : null,
          published_at: firstPublish
            ? doc.publishAt && new Date(doc.publishAt).getTime() <= Date.now()
              ? doc.publishAt
              : now
            : before.published_at,
          ...(doc.kind === "page" ? { is_published: status === "published" } : {}),
          updated_at: now,
        };
    const { error } = await loose(db)
      .from(table(doc.kind))
      .update(update)
      .eq("id", doc.id)
      .eq("merchant_id", merchantId);
    if (error) throw new Error(error.message);

    if (!autosave && before.slug && before.slug !== slug && before.status === "published") {
      await recordRedirect(db, merchantId, doc.kind, before.slug, slug);
    }
    if (!autosave && doc.kind === "post") await syncTerms(db, merchantId, doc.id, doc.categories);

    incr("framique_editor_save_total", { kind: doc.kind, mode });
    return {
      id: doc.id,
      slug: autosave ? before.slug : slug,
      status: autosave ? statusOf(before.status, before.status === "published") : status,
      publishedAt: (update as any).published_at ?? before.published_at ?? null,
      updatedAt: now,
      autosaved: autosave,
      revisionId,
      seoScore,
    };
  }

  // Create
  if (await slugTaken(db, merchantId, doc.kind, slug, null)) {
    throw new EditorError(
      "slug_taken",
      "That URL is already used by another item.",
      "এই ঠিকানা অন্য কিছুতে ব্যবহৃত।",
      "slug",
    );
  }
  const createStatus: ContentStatus = autosave ? "draft" : status;
  const publishedAt = createStatus === "published" || createStatus === "private" ? now : null;
  const { data, error } = await loose(db)
    .from(table(doc.kind))
    .insert({
      ...row,
      merchant_id: merchantId,
      slug,
      status: createStatus,
      scheduled_for: createStatus === "scheduled" ? doc.publishAt : null,
      published_at: publishedAt,
      ...(doc.kind === "page" ? { is_published: createStatus === "published" } : {}),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = (data as { id: string }).id;
  if (!autosave && doc.kind === "post") await syncTerms(db, merchantId, id, doc.categories);
  incr("framique_editor_save_total", {
    kind: doc.kind,
    mode: autosave ? "autosave-create" : "create",
  });
  return {
    id,
    slug,
    status: createStatus,
    publishedAt,
    updatedAt: now,
    autosaved: autosave,
    revisionId: null,
    seoScore,
  };
}

/** Category links live in `article_terms`; missing taxonomy tables degrade to a warning, never a failed save. */
async function syncTerms(db: Client, merchantId: string, articleId: string, termIds: string[]) {
  const unique = [...new Set(termIds)].slice(0, 12);
  const { error: clearError } = await loose(db)
    .from("article_terms")
    .delete()
    .eq("merchant_id", merchantId)
    .eq("article_id", articleId);
  if (clearError) {
    log("warn", "editor.terms_unavailable", { article_id: articleId, message: clearError.message });
    return;
  }
  if (!unique.length) return;
  const rows = unique.map((termId, index) => ({
    merchant_id: merchantId,
    article_id: articleId,
    term_id: termId,
    is_primary: index === 0,
  }));
  const { error } = await loose(db).from("article_terms").insert(rows);
  if (error) log("warn", "editor.terms_failed", { article_id: articleId, message: error.message });
}

async function recordRedirect(
  db: Client,
  merchantId: string,
  kind: ContentKind,
  fromSlug: string,
  toSlug: string,
) {
  const from = kind === "page" ? `/pages/${fromSlug}` : `/blog/${fromSlug}`;
  const to = kind === "page" ? `/pages/${toSlug}` : `/blog/${toSlug}`;
  const { error } = await loose(db)
    .from("url_redirects")
    .upsert(
      { merchant_id: merchantId, from_path: from, to_path: to, status_code: 301 },
      { onConflict: "merchant_id,from_path" },
    );
  if (error)
    log("warn", "editor.redirect_failed", {
      merchant_id: merchantId,
      from,
      to,
      error: error.message,
    });
}

/* -------------------------------------------------------------- revisions */

export async function listRevisions(
  db: Client,
  merchantId: string,
  kind: ContentKind,
  id: string,
): Promise<RevisionSummary[]> {
  const { data, error } = await loose(db)
    .from(revisionTable(kind))
    .select("id, title, status, is_autosave, created_at, author_id")
    .eq("merchant_id", merchantId)
    .eq(fk(kind), id)
    .order("created_at", { ascending: false })
    .limit(45);
  if (error) return [];
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    title: r.title ?? "",
    status: r.status ?? "draft",
    isAutosave: !!r.is_autosave,
    createdAt: r.created_at,
    authorId: r.author_id ?? null,
  }));
}

/** Returns the revision body so the client can load it into the editor (undoable). */
export async function readRevision(
  db: Client,
  merchantId: string,
  kind: ContentKind,
  revisionId: string,
) {
  const { data, error } = await loose(db)
    .from(revisionTable(kind))
    .select(
      kind === "page"
        ? "id, title, excerpt, body_markdown, slug, meta_title, meta_description, created_at"
        : "id, title, title_en, excerpt, body, slug, meta_title, meta_description, created_at",
    )
    .eq("merchant_id", merchantId)
    .eq("id", revisionId)
    .maybeSingle();
  if (error || !data)
    throw new EditorError("not_found", "Revision not found.", "সংস্করণ পাওয়া যায়নি।");
  return {
    id: data.id as string,
    title: (data.title ?? "") as string,
    titleEn: ((data as any).title_en ?? "") as string,
    excerpt: (data.excerpt ?? "") as string,
    body: ((kind === "page" ? (data as any).body_markdown : (data as any).body) ?? "") as string,
    slug: (data.slug ?? "") as string,
    metaTitle: (data.meta_title ?? "") as string,
    metaDescription: (data.meta_description ?? "") as string,
    createdAt: data.created_at as string,
  };
}

/* ------------------------------------------------------------------ trash */

export async function trashFromEditor(
  db: Client,
  merchantId: string,
  kind: ContentKind,
  id: string,
) {
  const { data: before } = await loose(db)
    .from(table(kind))
    .select("status")
    .eq("id", id)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  const { error } = await loose(db)
    .from(table(kind))
    .update({
      status: "trash",
      trashed_at: new Date().toISOString(),
      trashed_from_status: before?.status ?? "draft",
      ...(kind === "page" ? { is_published: false } : {}),
    })
    .eq("id", id)
    .eq("merchant_id", merchantId);
  if (error) throw new Error(error.message);
  incr("framique_editor_trash_total", { kind });
  return { ok: true };
}

/* --------------------------------------------------------------- editor choice */

export async function setEditorKind(
  db: Client,
  merchantId: string,
  kind: ContentKind,
  id: string,
  editor: "classic" | "builder",
) {
  const { error } = await loose(db)
    .from(table(kind))
    .update({ editor })
    .eq("id", id)
    .eq("merchant_id", merchantId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
