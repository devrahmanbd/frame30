/**
 * Blog + pages CMS runtime.
 *
 * Phase 2.8 gave this module revisions and slug-change redirects. Phase 1 of
 * the content roadmap turns it into the trustworthy half of a Classic-Editor
 * writing surface, which means the server — not the browser — owns these rules:
 *
 *  1. **Markup is sanitised on write.** The body is parsed into the block model
 *     (`blog-body.ts`) and re-serialised before it touches the database, so a
 *     row can never contain a script, an event handler or a `javascript:` href,
 *     no matter what posted it (our editor, a stale tab, the REST API, curl).
 *  2. **Zero-CLS is a hard rule.** An image without width/height/alt is refused
 *     with a bilingual, field-addressed error instead of being quietly stored.
 *  3. **Autosave is invisible.** An autosave never advances `published_at`,
 *     never flips status, never rewrites a slug and never emits a redirect. It
 *     is a safety net, not a publish action — the WordPress bug class we refuse
 *     to reproduce.
 *  4. **History is bounded.** Every save snapshots first, and retention prunes
 *     autosave rows so a chatty editor cannot grow the table without limit.
 *  5. **It is observable.** Every write emits a metric and a structured log
 *     with merchant, article, outcome and duration, because "the save failed
 *     sometimes" is otherwise unanswerable in production.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  bodyStats,
  deriveExcerpt,
  normalizeBody,
  parseBody,
  serializeBody,
  validateBody,
  type Block,
} from "./blog-body";
import { incr, log, observe } from "./observability.server";

type Client = SupabaseClient<Database>;

export type ArticleInput = {
  id: string | null;
  title: string;
  titleEn: string;
  slug: string;
  excerpt: string;
  body: string;
  coverImageUrl: string;
  tags: string[];
  status: string;
  scheduledFor: string | null;
  metaTitle: string;
  metaDescription: string;
  canonical: string;
  robots: string;
  /** Autosaves keep the article untouched in list order and mark the snapshot. */
  autosave?: boolean;
};

/** Retention: enough history to feel safe, bounded enough to stay cheap. */
export const CMS_RETENTION = {
  maxAutosaves: 20,
  maxManual: 100,
  maxTags: 20,
  maxTagChars: 40,
  maxTitleChars: 200,
} as const;

/**
 * A save failure a merchant can act on: a stable code, the offending field and
 * bilingual copy. Thrown instead of a bare `Error` so the editor can highlight
 * the field rather than showing a red box with English database prose.
 */
export class ArticleValidationError extends Error {
  constructor(
    readonly code: string,
    readonly field: string,
    readonly en: string,
    readonly bn: string,
  ) {
    super(`${code}: ${en}`);
    this.name = "ArticleValidationError";
  }
}

export function slugifyPath(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export { lintArticle } from "./cms-lint";

/** Reserved first segments a blog slug may never occupy. */
const RESERVED_SLUGS = new Set([
  "admin",
  "auth",
  "api",
  "root",
  "cart",
  "checkout",
  "store",
  "blog",
  "sitemap",
  "robots",
  "feed",
]);

/**
 * Normalise and hard-validate an incoming article.
 *
 * Returns the sanitised row-shaped values plus the parsed blocks, so callers
 * can derive stats without parsing the body a second time.
 */
export function prepareArticle(input: ArticleInput): {
  slug: string;
  blocks: Block[];
  body: string;
  excerpt: string;
  tags: string[];
} {
  const title = input.title.trim();
  if (!title) {
    throw new ArticleValidationError("title_required", "title", "A title is required.", "শিরোনাম দিতে হবে।");
  }
  if (title.length > CMS_RETENTION.maxTitleChars) {
    throw new ArticleValidationError(
      "title_too_long",
      "title",
      `Title must be under ${CMS_RETENTION.maxTitleChars} characters.`,
      `শিরোনাম ${CMS_RETENTION.maxTitleChars} অক্ষরের কম হতে হবে।`,
    );
  }

  const blocks = parseBody(input.body);
  const body = serializeBody(blocks);
  if (!body.trim()) {
    throw new ArticleValidationError("body_required", "body", "The body cannot be empty.", "লেখার বডি খালি রাখা যাবে না।");
  }
  const issues = validateBody(blocks);
  if (issues.length) {
    const first = issues[0]!;
    throw new ArticleValidationError(first.code, "body", first.en, first.bn);
  }

  const slug = slugifyPath(input.slug || input.titleEn || title);
  if (!slug) {
    throw new ArticleValidationError("slug_required", "slug", "A usable slug is required.", "একটি ব্যবহারযোগ্য স্লাগ দরকার।");
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new ArticleValidationError(
      "slug_reserved",
      "slug",
      `"${slug}" is reserved by the platform.`,
      `"${slug}" প্ল্যাটফর্মের সংরক্ষিত ঠিকানা।`,
    );
  }

  const tags = [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))]
    .map((tag) => tag.slice(0, CMS_RETENTION.maxTagChars))
    .slice(0, CMS_RETENTION.maxTags);

  const excerpt = input.excerpt.trim() || deriveExcerpt(blocks);
  return { slug, blocks, body, excerpt, tags };
}

async function snapshot(db: Client, merchantId: string, articleId: string, authorId: string | null, autosave: boolean) {
  const { data } = await db
    .from("articles")
    .select("title, title_en, excerpt, body, status, slug, meta_title, meta_description")
    .eq("id", articleId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!data) return;
  const { error } = await db.from("article_revisions").insert({
    merchant_id: merchantId,
    article_id: articleId,
    title: data.title ?? "",
    title_en: data.title_en,
    excerpt: data.excerpt,
    body: data.body ?? "",
    status: data.status ?? "draft",
    slug: data.slug ?? "",
    meta_title: data.meta_title,
    meta_description: data.meta_description,
    author_id: authorId,
    is_autosave: autosave,
  });
  if (error) {
    // History is best-effort: losing a snapshot must never lose the edit.
    incr("framique_cms_snapshot_failed_total", { reason: "insert" });
    log("warn", "cms.snapshot_failed", { article_id: articleId, message: error.message });
    return;
  }
  await pruneRevisions(db, merchantId, articleId, autosave);
}

/**
 * Retention sweep, run inline after a snapshot.
 *
 * Autosave rows churn fastest, so they are pruned on every autosave; manual
 * revisions are pruned on manual saves only. Both are capped, and a failure
 * here is logged rather than surfaced — a full history table is a cost problem,
 * not a reason to fail a writer's save.
 */
export async function pruneRevisions(db: Client, merchantId: string, articleId: string, autosave: boolean) {
  const keep = autosave ? CMS_RETENTION.maxAutosaves : CMS_RETENTION.maxManual;
  const { data, error } = await db
    .from("article_revisions")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("article_id", articleId)
    .eq("is_autosave", autosave)
    .order("created_at", { ascending: false })
    .range(keep, keep + 200);
  if (error || !data?.length) return;
  const doomed = data.map((row) => row.id);
  const { error: delError } = await db.from("article_revisions").delete().in("id", doomed).eq("merchant_id", merchantId);
  if (delError) {
    log("warn", "cms.retention_failed", { article_id: articleId, message: delError.message });
    return;
  }
  incr("framique_cms_revisions_pruned_total", { kind: autosave ? "autosave" : "manual" }, doomed.length);
}

export async function saveArticle(db: Client, merchantId: string, userId: string, input: ArticleInput) {
  const started = Date.now();
  const autosave = !!input.autosave;
  const outcome = (result: string) => {
    incr("framique_cms_article_saves_total", { result, kind: autosave ? "autosave" : "manual" });
    observe("framique_cms_article_save_ms", Date.now() - started, { kind: autosave ? "autosave" : "manual" });
  };

  let prepared: ReturnType<typeof prepareArticle>;
  try {
    prepared = prepareArticle(input);
  } catch (error) {
    outcome("rejected");
    log("info", "cms.article_rejected", {
      merchant_id: merchantId,
      article_id: input.id,
      code: error instanceof ArticleValidationError ? error.code : "unknown",
    });
    throw error;
  }
  const { slug, blocks, body, excerpt, tags } = prepared;
  const stats = bodyStats(blocks);

  const row = {
    merchant_id: merchantId,
    title: input.title.trim(),
    title_en: input.titleEn.trim() || null,
    slug,
    excerpt,
    body,
    cover_image_url: input.coverImageUrl.trim() || null,
    tags,
    status: input.status,
    scheduled_for:
      input.status === "scheduled" && input.scheduledFor ? new Date(input.scheduledFor).toISOString() : null,
    meta_title: input.metaTitle.trim() || null,
    meta_description: input.metaDescription.trim() || null,
    canonical: input.canonical.trim() || null,
    robots: input.robots,
  };

  try {
    if (input.id) {
      const { data: before, error: readError } = await db
        .from("articles")
        .select("slug, status, published_at")
        .eq("id", input.id)
        .eq("merchant_id", merchantId)
        .maybeSingle();
      if (readError) throw readError;
      if (!before) {
        throw new ArticleValidationError("not_found", "id", "That article no longer exists.", "লেখাটি আর নেই।");
      }

      await snapshot(db, merchantId, input.id, userId, autosave);

      /* published_at is set once, at the first transition into `published`, and
       * never touched by an autosave. Re-stamping it on every save is how
       * WordPress-era systems silently reorder a blog and break canonical
       * dates in structured data. */
      const alreadyPublished = !!before.published_at;
      const publishedAt =
        !autosave && input.status === "published" && !alreadyPublished
          ? new Date().toISOString()
          : before.published_at;

      // An autosave is a content checkpoint only: identity and lifecycle stay.
      const update = autosave
        ? { ...row, slug: before.slug, status: before.status, published_at: before.published_at }
        : { ...row, published_at: publishedAt };

      const { error } = await db.from("articles").update(update).eq("id", input.id).eq("merchant_id", merchantId);
      if (error) throw error;

      if (!autosave && before.slug && before.slug !== slug) {
        await recordSlugRedirect(db, merchantId, before.slug, slug);
      }
      outcome("updated");
      log("info", "cms.article_saved", {
        merchant_id: merchantId,
        article_id: input.id,
        kind: autosave ? "autosave" : "manual",
        status: update.status,
        words: stats.words,
      });
      return { id: input.id, slug: autosave ? before.slug : slug, stats, autosaved: autosave };
    }

    /* Cap enforcement happens on creation only: an over-cap merchant must still
     * be able to edit, unpublish, and export what they already wrote. Blocking
     * edits would hold their content hostage, which is both hostile and, for a
     * plan they may be about to pay for, self-defeating. */
    const { assertEntitlement, invalidateEntitlements } = await import("./entitlements.server");
    await assertEntitlement(db, merchantId, "articles", 1);

    const { data, error } = await db
      .from("articles")
      .insert({ ...row, published_at: input.status === "published" ? new Date().toISOString() : null })
      .select("id")
      .single();
    if (error) throw error;
    outcome("created");
    invalidateEntitlements(merchantId);
    log("info", "cms.article_created", { merchant_id: merchantId, article_id: data.id, words: stats.words });
    return { id: data.id, slug, stats, autosaved: autosave };
  } catch (error) {
    if (error instanceof ArticleValidationError) {
      outcome("rejected");
      throw error;
    }
    outcome("failed");
    const message = error instanceof Error ? error.message : String(error);
    log("error", "cms.article_save_failed", { merchant_id: merchantId, article_id: input.id, message });
    // Uniqueness is the one database error a writer can actually fix.
    if (/duplicate key|unique constraint/i.test(message)) {
      throw new ArticleValidationError(
        "slug_taken",
        "slug",
        "Another article already uses that slug.",
        "এই স্লাগ আগে থেকেই অন্য লেখায় ব্যবহৃত।",
      );
    }
    throw error;
  }
}

/**
 * Record a 301 for a changed slug, collapsing chains as we go.
 *
 * Without collapsing, renaming a post three times leaves A→B→C→D and every
 * visitor on the oldest link pays three redirects (and Google gives up after a
 * handful). Rewriting older hops to the final target keeps every path one hop.
 */
export async function recordSlugRedirect(db: Client, merchantId: string, fromSlug: string, toSlug: string) {
  const from = `/blog/${fromSlug}`;
  const to = `/blog/${toSlug}`;
  const { error } = await db
    .from("url_redirects")
    .upsert({ merchant_id: merchantId, from_path: from, to_path: to, status_code: 301 }, { onConflict: "merchant_id,from_path" });
  if (error) {
    log("warn", "cms.redirect_failed", { merchant_id: merchantId, from, message: error.message });
    return;
  }
  const { error: collapseError } = await db
    .from("url_redirects")
    .update({ to_path: to })
    .eq("merchant_id", merchantId)
    .eq("to_path", from);
  if (collapseError) log("warn", "cms.redirect_collapse_failed", { merchant_id: merchantId, message: collapseError.message });
  // A redirect that points at itself is a loop; drop it defensively.
  await db.from("url_redirects").delete().eq("merchant_id", merchantId).eq("from_path", to).eq("to_path", to);
  incr("framique_cms_redirects_total", { reason: "slug_change" });
}

export async function listRevisions(db: Client, merchantId: string, articleId: string) {
  const { data, error } = await db
    .from("article_revisions")
    .select("id, title, status, slug, is_autosave, created_at")
    .eq("merchant_id", merchantId)
    .eq("article_id", articleId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data ?? [];
}

/** Full revision bodies for the side-by-side compare panel. */
export async function revisionPair(db: Client, merchantId: string, leftId: string, rightId: string) {
  const { data, error } = await db
    .from("article_revisions")
    .select("id, article_id, title, title_en, excerpt, body, status, slug, meta_title, meta_description, is_autosave, created_at")
    .eq("merchant_id", merchantId)
    .in("id", [...new Set([leftId, rightId])]);
  if (error) throw error;
  const left = (data ?? []).find((row) => row.id === leftId) ?? null;
  const right = (data ?? []).find((row) => row.id === rightId) ?? null;
  if (!left || !right) throw new Error("Revision not found");
  if (left.article_id !== right.article_id) throw new Error("Revisions belong to different articles");
  return { left, right };
}

export async function restoreRevision(db: Client, merchantId: string, revisionId: string, userId: string) {
  const { data: rev, error } = await db
    .from("article_revisions")
    .select("article_id, title, title_en, excerpt, body, status, slug, meta_title, meta_description")
    .eq("id", revisionId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error) throw error;
  if (!rev) throw new Error("Revision not found");
  // Restoring is itself a change worth a snapshot.
  await snapshot(db, merchantId, rev.article_id, userId, false);
  const { error: upErr } = await db
    .from("articles")
    .update({
      title: rev.title,
      title_en: rev.title_en,
      excerpt: rev.excerpt,
      // Old rows predate the block model; normalising keeps the invariant that
      // whatever is in `articles.body` is always sanitised, canonical markup.
      body: normalizeBody(rev.body ?? ""),
      status: rev.status,
      meta_title: rev.meta_title,
      meta_description: rev.meta_description,
    })
    .eq("id", rev.article_id)
    .eq("merchant_id", merchantId);
  if (upErr) throw upErr;
  incr("framique_cms_revision_restores_total", {});
  log("info", "cms.revision_restored", { merchant_id: merchantId, article_id: rev.article_id, revision_id: revisionId });
  return { articleId: rev.article_id };
}

export async function listRedirects(db: Client, merchantId: string) {
  const { data, error } = await db
    .from("url_redirects")
    .select("id, from_path, to_path, status_code, hits, created_at")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function saveRedirect(db: Client, merchantId: string, fromPath: string, toPath: string) {
  const from = fromPath.startsWith("/") ? fromPath : `/${fromPath}`;
  const to = toPath.startsWith("/") ? toPath : `/${toPath}`;
  if (from === to) throw new Error("A redirect cannot point at itself");
  const { error } = await db
    .from("url_redirects")
    .upsert({ merchant_id: merchantId, from_path: from, to_path: to, status_code: 301 }, { onConflict: "merchant_id,from_path" });
  if (error) throw error;
}

export async function deleteRedirect(db: Client, merchantId: string, id: string) {
  const { error } = await db.from("url_redirects").delete().eq("id", id).eq("merchant_id", merchantId);
  if (error) throw error;
}
