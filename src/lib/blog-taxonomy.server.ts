/**
 * Phase 9.1 — admin runtime for blog taxonomy.
 *
 * Every write in here is a URL-affecting write, which is why this file is
 * longer than "insert a row":
 *
 *  - **Slug changes are 301s.** Renaming a term's slug moves a live archive
 *    URL, so the old path is recorded in `url_redirects` exactly the way
 *    `cms.server.ts` does for an article. Without that, every inbound link and
 *    every Search Console impression on the old archive dies silently.
 *  - **Deletes relink, never orphan.** Children are lifted to the deleted term's
 *    parent and the article links move with them (matching the documented
 *    `archive_category` behaviour in `docs/05-marketing/content-cms.md` §4),
 *    then the archive URL is redirected to its parent or `/blog`.
 *  - **Counters are recomputed, not incremented.** `article_count` drives both
 *    the reader rail and the sitemap's noindex decision. A drifting counter
 *    publishes thin archives, so it is recomputed from `article_terms` joined
 *    against published articles after every mutation that can change it.
 *  - **RLS is the boundary, checks are the UX.** All queries run on the caller's
 *    authenticated client, so a cross-merchant id cannot be written even if a
 *    guard here were wrong; the explicit ownership reads exist to return a
 *    merchant-readable error instead of an empty result.
 *
 * Failures are logged and counted (`framique_taxonomy_write_total`) with bounded
 * labels, and every mutation lands one `blog_terms`-scoped audit row through the
 * shared marketing audit trail when that table is available.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  TAXONOMY_LIMITS,
  TaxonomyError,
  buildTermTree,
  flattenTermTree,
  normalizeAssignments,
  parentageIssue,
  prepareTerm,
  slugifyTerm,
  subtreeHeight,
  tagNamesFor,
  termArchivePath,
  type TermInput,
  type TermKind,
  type TermNode,
  type TermRow,
} from "./blog-taxonomy";
import { incr, log, observe } from "./observability.server";

type Client = SupabaseClient<Database>;
// The taxonomy tables landed after the last type regeneration cycle in some
// checkouts; a narrow structural alias keeps the file honest without leaking
// `any` into the exported surface.
type Loose = {
  from: (table: string) => any;
};
const loose = (db: Client) => db as unknown as Loose;

const TERM_COLUMNS =
  "id, merchant_id, kind, slug, name, name_en, description, parent_id, sort_order, cover_image_url, meta_title, meta_description, robots_index, article_count, created_at, updated_at";

/* ------------------------------------------------------------ observability */

async function audit(
  db: Client,
  merchantId: string,
  actor: string,
  action: string,
  payload: Record<string, unknown>,
) {
  try {
    await loose(db)
      .from("marketing_audit")
      .insert({ merchant_id: merchantId, actor, action, payload });
  } catch {
    // An audit table that is missing or locked must never fail the merchant's
    // save; the structured log below is the durable fallback.
  }
  log("info", "taxonomy.write", { action, merchant: merchantId.slice(0, 8) });
}

function counted<T>(action: string, work: () => Promise<T>): Promise<T> {
  const started = Date.now();
  return work().then(
    (value) => {
      observe("framique_taxonomy_write_ms", Date.now() - started, { action });
      incr("framique_taxonomy_write_total", { action, result: "ok" });
      return value;
    },
    (error: unknown) => {
      const expected = error instanceof TaxonomyError;
      incr("framique_taxonomy_write_total", { action, result: expected ? "rejected" : "error" });
      if (!expected) {
        log("error", "taxonomy.write_failed", {
          action,
          reason: String((error as Error)?.message ?? error).slice(0, 200),
        });
      }
      throw error;
    },
  );
}

/* -------------------------------------------------------------------- reads */

export type TaxonomyState = {
  categories: TermNode[];
  tags: TermRow[];
  limits: typeof TAXONOMY_LIMITS;
  /** Terms with zero published articles: they render `noindex` until filled. */
  emptyTermIds: string[];
};

export async function loadTaxonomy(db: Client, merchantId: string): Promise<TaxonomyState> {
  const { data, error } = await loose(db)
    .from("blog_terms")
    .select(TERM_COLUMNS)
    .eq("merchant_id", merchantId)
    .order("sort_order", { ascending: true })
    .limit(TAXONOMY_LIMITS.maxTermsPerKind * 2 + 1);
  if (error) {
    log("warn", "taxonomy.load_failed", { reason: String(error.message).slice(0, 160) });
    return { categories: [], tags: [], limits: TAXONOMY_LIMITS, emptyTermIds: [] };
  }
  const rows = (data ?? []) as TermRow[];
  const categories = buildTermTree(rows.filter((row) => row.kind === "category"));
  const tags = rows
    .filter((row) => row.kind === "tag")
    .sort((a, b) => (b.article_count ?? 0) - (a.article_count ?? 0) || a.name.localeCompare(b.name, "bn"));
  return {
    categories,
    tags,
    limits: TAXONOMY_LIMITS,
    emptyTermIds: rows.filter((row) => !(row.article_count ?? 0)).map((row) => row.id),
  };
}

async function allTerms(db: Client, merchantId: string, kind?: TermKind): Promise<TermRow[]> {
  let query = loose(db).from("blog_terms").select(TERM_COLUMNS).eq("merchant_id", merchantId);
  if (kind) query = query.eq("kind", kind);
  const { data } = await query.limit(TAXONOMY_LIMITS.maxTermsPerKind * 2 + 1);
  return (data ?? []) as TermRow[];
}

/* ------------------------------------------------------------------ writes */

/** Ensure the slug is unique for this merchant+kind, suffixing `-2`, `-3`, … */
async function uniqueSlug(
  db: Client,
  merchantId: string,
  kind: TermKind,
  slug: string,
  excludeId: string | null,
): Promise<string> {
  const { data } = await loose(db)
    .from("blog_terms")
    .select("id, slug")
    .eq("merchant_id", merchantId)
    .eq("kind", kind)
    .like("slug", `${slug}%`)
    .limit(50);
  const taken = new Set(
    ((data ?? []) as { id: string; slug: string }[])
      .filter((row) => row.id !== excludeId)
      .map((row) => row.slug),
  );
  if (!taken.has(slug)) return slug;
  for (let n = 2; n < 60; n += 1) {
    const candidate = slugifyTerm(`${slug}-${n}`);
    if (!taken.has(candidate)) return candidate;
  }
  throw new TaxonomyError(
    "slug_exhausted",
    "slug",
    "Too many terms share this slug — pick a different one.",
    "এই স্লাগ অনেকবার ব্যবহৃত — অন্য স্লাগ দিন।",
  );
}

/**
 * Record a 301 for a moved archive. Best-effort by design: a redirect table
 * that rejects the row must not roll back a legitimate rename, and Phase 6's
 * broken-link scan will surface the gap on its next run.
 */
async function recordArchiveRedirect(
  db: Client,
  merchantId: string,
  fromPath: string,
  toPath: string,
) {
  if (fromPath === toPath) return;
  try {
    await loose(db)
      .from("url_redirects")
      .upsert(
        { merchant_id: merchantId, from_path: fromPath, to_path: toPath, status_code: 301 },
        { onConflict: "merchant_id,from_path" },
      );
  } catch (error) {
    log("warn", "taxonomy.redirect_failed", {
      reason: String((error as Error)?.message ?? error).slice(0, 160),
    });
  }
}

export async function saveTerm(
  db: Client,
  merchantId: string,
  actor: string,
  input: TermInput,
): Promise<{ id: string; slug: string; movedFrom: string | null }> {
  return counted("save", async () => {
    const prepared = prepareTerm(input);
    const siblings = await allTerms(db, merchantId, prepared.kind);

    const existing = input.id ? siblings.find((row) => row.id === input.id) : undefined;
    if (input.id && !existing) {
      throw new TaxonomyError("term_missing", "id", "That term no longer exists.", "টার্মটি আর নেই।");
    }
    if (!input.id && siblings.length >= TAXONOMY_LIMITS.maxTermsPerKind) {
      throw new TaxonomyError(
        "term_limit",
        "name",
        `You already have ${TAXONOMY_LIMITS.maxTermsPerKind} ${prepared.kind} terms.`,
        `আপনার ইতিমধ্যে ${TAXONOMY_LIMITS.maxTermsPerKind}টি টার্ম আছে।`,
      );
    }

    // Parentage: reject cycles and depth overflow, counting the subtree the
    // term already carries — otherwise a legal-looking move smuggles a 4-level
    // tree in by re-parenting the root of a 2-level one.
    if (prepared.parent_id) {
      const issue = parentageIssue(siblings, input.id, prepared.parent_id);
      if (issue === "missing") {
        throw new TaxonomyError("parent_missing", "parentId", "That parent no longer exists.", "প্যারেন্ট টার্মটি নেই।");
      }
      if (issue === "cycle") {
        throw new TaxonomyError(
          "parent_cycle",
          "parentId",
          "That would put the category inside itself.",
          "এতে ক্যাটাগরি নিজের ভিতরে চলে যাবে।",
        );
      }
      const height = input.id ? subtreeHeight(siblings, input.id) : 1;
      const depthAbove = siblings.length ? depthOf(siblings, prepared.parent_id) : 1;
      if (issue === "depth" || depthAbove + height > TAXONOMY_LIMITS.maxDepth) {
        throw new TaxonomyError(
          "parent_depth",
          "parentId",
          `Categories can be nested ${TAXONOMY_LIMITS.maxDepth} levels deep.`,
          `ক্যাটাগরি সর্বোচ্চ ${TAXONOMY_LIMITS.maxDepth} স্তর পর্যন্ত নেস্ট করা যায়।`,
        );
      }
    }

    const slug = await uniqueSlug(db, merchantId, prepared.kind, prepared.slug, input.id);
    const row = { ...prepared, slug, merchant_id: merchantId };

    if (existing) {
      const { error } = await loose(db)
        .from("blog_terms")
        .update(row)
        .eq("id", existing.id)
        .eq("merchant_id", merchantId);
      if (error) throw new Error(error.message);

      let movedFrom: string | null = null;
      if (existing.slug !== slug) {
        movedFrom = termArchivePath(existing.kind, existing.slug);
        await recordArchiveRedirect(db, merchantId, movedFrom, termArchivePath(prepared.kind, slug));
      }
      await audit(db, merchantId, actor, "blog.term_updated", {
        id: existing.id,
        kind: prepared.kind,
        slug,
        renamed: existing.slug !== slug,
      });
      return { id: existing.id, slug, movedFrom };
    }

    const { data, error } = await loose(db).from("blog_terms").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    await audit(db, merchantId, actor, "blog.term_created", { id: data.id, kind: prepared.kind, slug });
    return { id: data.id as string, slug, movedFrom: null };
  });
}

/** Levels above and including `termId` (1 for a root). Loop-safe. */
function depthOf(rows: Pick<TermRow, "id" | "parent_id">[], termId: string): number {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  let cursor: string | null = termId;
  let depth = 0;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    depth += 1;
    cursor = byId.get(cursor)?.parent_id ?? null;
  }
  return Math.max(1, depth);
}

/**
 * Delete a term, lifting its children and article links to its parent.
 *
 * Refuses above `maxAutoShift` relinks — mirroring the documented
 * `category_not_empty_guard` — because silently rewiring a large subtree is not
 * an undoable click.
 */
export async function deleteTerm(
  db: Client,
  merchantId: string,
  actor: string,
  termId: string,
  opts: { maxAutoShift?: number } = {},
): Promise<{ relinkedChildren: number; relinkedArticles: number; redirectTo: string }> {
  const maxAutoShift = opts.maxAutoShift ?? 25;
  return counted("delete", async () => {
    const rows = await allTerms(db, merchantId);
    const term = rows.find((row) => row.id === termId);
    if (!term) {
      throw new TaxonomyError("term_missing", "id", "That term no longer exists.", "টার্মটি আর নেই।");
    }
    const children = rows.filter((row) => row.parent_id === termId);
    if (children.length > maxAutoShift) {
      throw new TaxonomyError(
        "category_not_empty_guard",
        "id",
        `This category has ${children.length} children — move them before deleting.`,
        `এই ক্যাটাগরিতে ${children.length}টি সাব-ক্যাটাগরি আছে — আগে সরিয়ে নিন।`,
      );
    }

    const parent = term.parent_id ? rows.find((row) => row.id === term.parent_id) ?? null : null;

    if (children.length) {
      const { error } = await loose(db)
        .from("blog_terms")
        .update({ parent_id: term.parent_id ?? null })
        .eq("merchant_id", merchantId)
        .eq("parent_id", termId);
      if (error) throw new Error(error.message);
    }

    // Article links: move to the parent when there is one (keeps the article
    // inside a category tree), otherwise drop the link and let the article fall
    // back to uncategorised rather than pointing at a dead term.
    const { data: links } = await loose(db)
      .from("article_terms")
      .select("article_id, is_primary")
      .eq("merchant_id", merchantId)
      .eq("term_id", termId)
      .limit(5_000);
    const affected = (links ?? []) as { article_id: string; is_primary: boolean }[];

    if (parent && affected.length) {
      // Upsert rather than update: an article already filed under the parent
      // would otherwise violate the (article_id, term_id) primary key.
      await loose(db)
        .from("article_terms")
        .upsert(
          affected.map((link) => ({
            merchant_id: merchantId,
            article_id: link.article_id,
            term_id: parent.id,
            is_primary: link.is_primary,
          })),
          { onConflict: "article_id,term_id" },
        );
    }
    await loose(db).from("article_terms").delete().eq("merchant_id", merchantId).eq("term_id", termId);

    const { error: delError } = await loose(db)
      .from("blog_terms")
      .delete()
      .eq("id", termId)
      .eq("merchant_id", merchantId);
    if (delError) throw new Error(delError.message);

    const redirectTo = parent ? termArchivePath(parent.kind, parent.slug) : "/blog";
    await recordArchiveRedirect(db, merchantId, termArchivePath(term.kind, term.slug), redirectTo);
    if (parent) await refreshCounts(db, merchantId, [parent.id]);
    await audit(db, merchantId, actor, "blog.term_deleted", {
      id: termId,
      kind: term.kind,
      children: children.length,
      articles: affected.length,
    });
    return { relinkedChildren: children.length, relinkedArticles: affected.length, redirectTo };
  });
}

/**
 * Persist a manual order. One statement per row is acceptable here because the
 * payload is capped at the per-kind term limit and a reorder is a human drag,
 * not a render-path read.
 */
export async function reorderTerms(
  db: Client,
  merchantId: string,
  actor: string,
  order: { id: string; sortOrder: number; parentId: string | null }[],
): Promise<{ updated: number }> {
  return counted("reorder", async () => {
    if (order.length > TAXONOMY_LIMITS.maxTermsPerKind) {
      throw new TaxonomyError("reorder_too_large", "order", "Too many terms in one move.", "একবারে অনেক বেশি টার্ম।");
    }
    const rows = await allTerms(db, merchantId);
    const known = new Map(rows.map((row) => [row.id, row]));

    // Validate the whole proposed shape before writing any of it: a partially
    // applied reorder can leave a cycle behind, and a cycle hangs the renderer.
    const proposed = rows.map((row) => {
      const move = order.find((item) => item.id === row.id);
      return { id: row.id, parent_id: move ? move.parentId : row.parent_id ?? null };
    });
    for (const item of order) {
      if (!known.has(item.id)) {
        throw new TaxonomyError("term_missing", "order", "One of those terms is gone.", "একটি টার্ম আর নেই।");
      }
      const issue = parentageIssue(proposed, item.id, item.parentId);
      if (issue) {
        throw new TaxonomyError(
          `reorder_${issue}`,
          "order",
          issue === "depth"
            ? `Categories can be nested ${TAXONOMY_LIMITS.maxDepth} levels deep.`
            : "That move would create a loop.",
          issue === "depth"
            ? `ক্যাটাগরি সর্বোচ্চ ${TAXONOMY_LIMITS.maxDepth} স্তর পর্যন্ত হতে পারে।`
            : "এই পরিবর্তনে লুপ তৈরি হবে।",
        );
      }
    }

    let updated = 0;
    for (const item of order) {
      const { error } = await loose(db)
        .from("blog_terms")
        .update({ sort_order: Math.max(0, Math.trunc(item.sortOrder)), parent_id: item.parentId })
        .eq("id", item.id)
        .eq("merchant_id", merchantId);
      if (!error) updated += 1;
    }
    await audit(db, merchantId, actor, "blog.terms_reordered", { count: updated });
    return { updated };
  });
}

/* ------------------------------------------------------------- assignments */

/**
 * Replace an article's term set.
 *
 * The legacy `articles.tags` text array is kept in sync deliberately: the
 * storefront search index and older widgets still read it, so taxonomy is
 * additive rather than a breaking migration.
 */
export async function setArticleTerms(
  db: Client,
  merchantId: string,
  actor: string,
  articleId: string,
  requested: { termId: string; isPrimary: boolean }[],
): Promise<{ terms: { termId: string; isPrimary: boolean }[]; tags: string[] }> {
  return counted("assign", async () => {
    const { data: article } = await loose(db)
      .from("articles")
      .select("id")
      .eq("id", articleId)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (!article) {
      throw new TaxonomyError("article_missing", "articleId", "That article no longer exists.", "লেখাটি আর নেই।");
    }

    const rows = await allTerms(db, merchantId);
    const unknown = requested.filter((item) => !rows.some((row) => row.id === item.termId));
    if (unknown.length) {
      throw new TaxonomyError(
        "term_unknown",
        "terms",
        "One of those terms does not belong to this store.",
        "একটি টার্ম এই দোকানের নয়।",
      );
    }
    const assignments = normalizeAssignments(requested, rows);

    const { data: before } = await loose(db)
      .from("article_terms")
      .select("term_id")
      .eq("merchant_id", merchantId)
      .eq("article_id", articleId);
    const previous = ((before ?? []) as { term_id: string }[]).map((row) => row.term_id);

    await loose(db).from("article_terms").delete().eq("merchant_id", merchantId).eq("article_id", articleId);
    if (assignments.length) {
      const { error } = await loose(db).from("article_terms").insert(
        assignments.map((item) => ({
          merchant_id: merchantId,
          article_id: articleId,
          term_id: item.termId,
          is_primary: item.isPrimary,
        })),
      );
      if (error) throw new Error(error.message);
    }

    const tags = tagNamesFor(assignments, rows);
    await loose(db).from("articles").update({ tags }).eq("id", articleId).eq("merchant_id", merchantId);

    // Both sides of the change need fresh counters: a term the article left is
    // now potentially empty (and therefore noindex).
    await refreshCounts(db, merchantId, [...new Set([...previous, ...assignments.map((a) => a.termId)])]);
    await audit(db, merchantId, actor, "blog.article_terms_set", {
      article: articleId,
      terms: assignments.length,
    });
    return { terms: assignments, tags };
  });
}

/** The term set currently on an article, for the editor sidebar. */
export async function articleTerms(db: Client, merchantId: string, articleId: string) {
  const { data } = await loose(db)
    .from("article_terms")
    .select("term_id, is_primary")
    .eq("merchant_id", merchantId)
    .eq("article_id", articleId);
  return ((data ?? []) as { term_id: string; is_primary: boolean }[]).map((row) => ({
    termId: row.term_id,
    isPrimary: row.is_primary,
  }));
}

/* ----------------------------------------------------------------- counters */

/**
 * Recompute `article_count` for the given terms (or all of them).
 *
 * Counted over *published, non-deleted* articles only, because the number's job
 * is to decide whether an archive is worth indexing and to order the reader
 * rail. Two queries total, regardless of how many terms are involved.
 */
export async function refreshCounts(
  db: Client,
  merchantId: string,
  termIds?: string[],
): Promise<{ updated: number }> {
  const ids = termIds?.filter(Boolean) ?? [];
  if (termIds && !ids.length) return { updated: 0 };

  let linkQuery = loose(db)
    .from("article_terms")
    .select("term_id, article_id")
    .eq("merchant_id", merchantId)
    .limit(20_000);
  if (ids.length) linkQuery = linkQuery.in("term_id", ids);
  const { data: links } = await linkQuery;
  const rows = (links ?? []) as { term_id: string; article_id: string }[];

  const articleIds = [...new Set(rows.map((row) => row.article_id))];
  const published = new Set<string>();
  // Chunked so a merchant with thousands of posts does not build a URL the
  // gateway rejects.
  for (let i = 0; i < articleIds.length; i += 200) {
    const chunk = articleIds.slice(i, i + 200);
    const { data } = await loose(db)
      .from("articles")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("status", "published")
      .is("deleted_at", null)
      .in("id", chunk);
    for (const row of (data ?? []) as { id: string }[]) published.add(row.id);
  }

  const counts = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const row of rows) {
    if (!published.has(row.article_id)) continue;
    counts.set(row.term_id, (counts.get(row.term_id) ?? 0) + 1);
  }

  let updated = 0;
  for (const [termId, count] of counts) {
    const { error } = await loose(db)
      .from("blog_terms")
      .update({ article_count: count })
      .eq("id", termId)
      .eq("merchant_id", merchantId);
    if (!error) updated += 1;
  }
  incr("framique_taxonomy_count_refresh_total", { scope: ids.length ? "partial" : "full" });
  return { updated };
}

/** Flat list for pickers: label carries the indent so the UI stays dumb. */
export async function termOptions(db: Client, merchantId: string) {
  const state = await loadTaxonomy(db, merchantId);
  return [
    ...flattenTermTree(state.categories).map((node) => ({
      id: node.id,
      kind: "category" as TermKind,
      label: `${"— ".repeat(node.depth - 1)}${node.name}`,
      slug: node.slug,
      count: node.article_count ?? 0,
    })),
    ...state.tags.map((tag) => ({
      id: tag.id,
      kind: "tag" as TermKind,
      label: tag.name,
      slug: tag.slug,
      count: tag.article_count ?? 0,
    })),
  ];
}