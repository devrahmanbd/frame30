/**
 * The archive's route-owned render context.
 *
 * The content archive (Decision **D1'** — the archive key is REAL) is a
 * LISTING surface whose data the platform owns: the resolved term, the
 * published records, the facets, the paging and the trail. The theme never
 * queries any of it — the theme composes AROUND it.
 *
 * This module is the **typed, validated** view of that data. It is PURE:
 * it takes the route's existing server-function output and maps it into the
 * permitted shape. It imports no server module, opens no connection and
 * re-queries nothing — the context is DERIVED, never fetched.
 *
 * Two rules are load-bearing:
 *
 * 1. **The kind vocabulary is closed.** `category`, `tag` and `author` are
 *    the only archive kinds, because those are the only content-archive
 *    routes the platform serves. A product collection is NOT an archive (it
 *    keeps the `collection` template) and a product category is a search
 *    facet, not a route.
 * 2. **An unresolved term is an explicit `not-found` state**, never an
 *    empty-but-200 archive. A URL the platform never had must answer with
 *    its own 404, not with an empty listing.
 *
 * The permitted fields are closed too: the context carries the kind, the
 * term's id/slug/name, the description, the breadcrumb trail, the records,
 * the facets, the paging and the state — and nothing else. No unpublished
 * record, no other merchant's record and no personal data ever enters it.
 */

/** The archive kinds the platform serves as routes today. */
export const ARCHIVE_KINDS = ["category", "tag", "author"] as const;
export type ArchiveKind = (typeof ARCHIVE_KINDS)[number];

/** Parse a requested archive kind. Anything outside the vocabulary is null. */
export function parseArchiveKind(value: unknown): ArchiveKind | null {
  if (typeof value !== "string") return null;
  return (ARCHIVE_KINDS as readonly string[]).includes(value)
    ? (value as ArchiveKind)
    : null;
}

/** The archive's state — a resolved archive, or an explicit not-found. */
export type ArchiveState = "ready" | "not-found";

/** The resolved term — the archive's subject. */
export type ArchiveTerm = {
  id: string;
  slug: string;
  name: string;
  nameEn: string | null;
};

/** One step of the trail — the ancestors of the resolved term. */
export type ArchiveCrumb = {
  id: string;
  name: string;
  slug: string;
  href: string | null;
};

/**
 * One published record. The permitted fields are closed: the reader needs
 * the card, never the author's account, the merchant's private data or any
 * other customer's information.
 */
export type ArchiveRecord = {
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: string | null;
  author: { slug: string; displayName: string } | null;
};

/** A facet the archive offers — a sibling category or tag. */
export type ArchiveFacet = {
  slug: string;
  name: string;
  kind: "category" | "tag";
  count: number;
};

/** The archive's paging — the platform's own, unchanged. */
export type ArchivePaging = {
  page: number;
  pageSize: number;
  total: number;
  lastPage: number;
  from: number;
  to: number;
  prevPath: string | null;
  nextPath: string | null;
};

/** The validated archive render context. */
export type ArchiveContext = {
  kind: ArchiveKind;
  state: ArchiveState;
  term: ArchiveTerm | null;
  description: string | null;
  breadcrumb: ArchiveCrumb[];
  records: ArchiveRecord[];
  facets: ArchiveFacet[];
  paging: ArchivePaging | null;
};

/** The route's own server-function output, in the shapes the routes have. */
export type ArchiveContextInput = {
  kind: unknown;
  term?: {
    id?: unknown;
    slug?: unknown;
    name?: unknown;
    name_en?: unknown;
    description?: unknown;
  } | null;
  articles?:
    | readonly {
        slug?: unknown;
        title?: unknown;
        excerpt?: unknown;
        coverImageUrl?: unknown;
        publishedAt?: unknown;
        author?: { slug?: unknown; displayName?: unknown } | null;
      }[]
    | null;
  facets?:
    | readonly {
        slug?: unknown;
        name?: unknown;
        kind?: unknown;
        count?: unknown;
      }[]
    | null;
  paging?: {
    page?: unknown;
    pageSize?: unknown;
    total?: unknown;
    lastPage?: unknown;
    from?: unknown;
    to?: unknown;
    prevPath?: unknown;
    nextPath?: unknown;
  } | null;
  ancestry?:
    | readonly {
        id?: unknown;
        slug?: unknown;
        name?: unknown;
      }[]
    | null;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function termFrom(input: ArchiveContextInput["term"]): ArchiveTerm | null {
  if (!input) return null;
  const slug = str(input.slug);
  const name = str(input.name);
  if (!slug || !name) return null;
  // The row's own id when it carries one (a taxonomy term). An author row
  // carries only its slug — which IS its public identity on that surface —
  // so the slug stands in for the id there.
  const id = str(input.id) ?? slug;
  const nameEn = str(input.name_en);
  return { id, slug, name, nameEn };
}

function recordFrom(
  article: NonNullable<ArchiveContextInput["articles"]>[number],
): ArchiveRecord | null {
  const slug = str(article.slug);
  const title = str(article.title);
  if (!slug || !title) return null;
  const authorSlug = article.author ? str(article.author.slug) : null;
  const authorName = article.author ? str(article.author.displayName) : null;
  return {
    slug,
    title,
    excerpt: str(article.excerpt),
    coverImageUrl: str(article.coverImageUrl),
    publishedAt: str(article.publishedAt),
    author:
      authorSlug && authorName
        ? { slug: authorSlug, displayName: authorName }
        : null,
  };
}

function facetFrom(
  facet: NonNullable<ArchiveContextInput["facets"]>[number],
): ArchiveFacet | null {
  const slug = str(facet.slug);
  const name = str(facet.name);
  if (!slug || !name) return null;
  const kind = facet.kind === "tag" ? "tag" : "category";
  return { slug, name, kind, count: num(facet.count) ?? 0 };
}

function pagingFrom(
  paging: ArchiveContextInput["paging"],
): ArchivePaging | null {
  if (!paging) return null;
  const page = num(paging.page);
  const total = num(paging.total);
  if (page === null || total === null) return null;
  return {
    page,
    pageSize: num(paging.pageSize) ?? 0,
    total,
    lastPage: num(paging.lastPage) ?? 1,
    from: num(paging.from) ?? 0,
    to: num(paging.to) ?? 0,
    prevPath: str(paging.prevPath),
    nextPath: str(paging.nextPath),
  };
}

/**
 * Derive the archive's render context from the route's existing
 * server-function output.
 *
 * Returns **null** when the requested kind is not one of the archive kinds
 * — the caller renders an explicit unsupported state, never a listing.
 * Returns a context whose `state` is `"not-found"` when the route resolved
 * no term — the caller answers with its own 404, never an empty listing.
 */
export function archiveContextFrom(
  input: ArchiveContextInput,
): ArchiveContext | null {
  const kind = parseArchiveKind(input.kind);
  if (!kind) return null;
  const term = termFrom(input.term);
  const ancestry = input.ancestry ?? [];
  const breadcrumb: ArchiveCrumb[] = [];
  for (const crumb of ancestry) {
    const id = str(crumb.id);
    const name = str(crumb.name);
    const slug = str(crumb.slug);
    if (!id || !name || !slug) continue;
    breadcrumb.push({ id, name, slug, href: null });
  }
  return {
    kind,
    state: term ? "ready" : "not-found",
    term,
    description: str(input.term?.description),
    breadcrumb,
    records: (input.articles ?? [])
      .map(recordFrom)
      .filter((record): record is ArchiveRecord => record !== null),
    facets: (input.facets ?? [])
      .map(facetFrom)
      .filter((facet): facet is ArchiveFacet => facet !== null),
    paging: pagingFrom(input.paging),
  };
}
