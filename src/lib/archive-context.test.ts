/**
 * Task 2 — the archive's route-owned context.
 *
 * The archive's data is the platform's: the resolved term, the published
 * records, the facets, the paging and the trail. This suite pins the
 * CONTRACT of that data — the shape the theme composes around — so the
 * surface can never quietly grow a field the theme has no business seeing.
 *
 * The four cases:
 *
 * 1. the kind vocabulary is CLOSED (`category`, `tag`, `author`); anything
 *    else is rejected;
 * 2. an archive route that resolves NO term yields an explicit `not-found`
 *    state — never an empty-but-200 archive;
 * 3. the context carries ONLY the permitted fields — no unpublished record,
 *    no other merchant's record and no personal data;
 * 4. the context is DERIVED from the route's existing server-function
 *    output, not re-queried: the module is pure and imports no server
 *    module.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARCHIVE_KINDS,
  archiveContextFrom,
  parseArchiveKind,
} from "./archive-context";

const DIR = dirname(fileURLToPath(import.meta.url));
/** The repo root — two levels up from `src/lib/`. */
const REPO = join(DIR, "..", "..");
const SOURCE = readFileSync(join(REPO, "src/lib/archive-context.ts"), "utf8");

/** The route's own server-function output — the shape the context derives from. */
const TERM_ARCHIVE = {
  kind: "category",
  term: {
    id: "term-1",
    merchant_id: "merchant-1",
    kind: "category",
    slug: "jamdani",
    name: "জামদানি",
    name_en: "Jamdani",
    description: "Handloom jamdani weaves.",
    robots_index: true,
  },
  articles: [
    {
      slug: "how-jamdani-is-woven",
      title: "How a jamdani saree is woven",
      titleEn: null,
      excerpt: "Two weavers, one loom, six weeks.",
      coverImageUrl: null,
      publishedAt: "2026-08-28T00:00:00.000Z",
      merchantName: "Songoskriti",
      merchantSlug: "songoskriti",
      category: { slug: "jamdani", name: "Jamdani" },
      author: { slug: "jannat", displayName: "Jannat", displayNameEn: null },
    },
    {
      slug: "the-loom-and-the-lake",
      title: "The loom and the lake",
      titleEn: null,
      excerpt: null,
      coverImageUrl: null,
      publishedAt: "2026-09-01T00:00:00.000Z",
      merchantName: "Songoskriti",
      merchantSlug: "songoskriti",
      category: null,
      author: null,
    },
  ],
  facets: [{ slug: "sarees", name: "Sarees", kind: "category", count: 4 }],
  paging: {
    page: 1,
    pageSize: 12,
    total: 2,
    lastPage: 1,
    from: 0,
    to: 1,
    overrun: false,
    prevPath: null,
    nextPath: null,
  },
  ancestry: [
    { id: "term-0", slug: "all", name: "All" },
    { id: "term-1", slug: "jamdani", name: "জামদানি" },
  ],
};

describe("the archive kind vocabulary is closed", () => {
  it("names exactly the three content-archive kinds", () => {
    expect([...ARCHIVE_KINDS]).toEqual(["category", "tag", "author"]);
  });

  it("accepts a kind of the vocabulary and rejects everything else", () => {
    expect(parseArchiveKind("category")).toBe("category");
    expect(parseArchiveKind("tag")).toBe("tag");
    expect(parseArchiveKind("author")).toBe("author");
    // A product collection is NOT an archive — it keeps the `collection`
    // template. A product category is a search facet, not a route.
    expect(parseArchiveKind("collection")).toBeNull();
    expect(parseArchiveKind("product")).toBeNull();
    expect(parseArchiveKind("index")).toBeNull();
    expect(parseArchiveKind("")).toBeNull();
    expect(parseArchiveKind(null)).toBeNull();
    expect(parseArchiveKind(42)).toBeNull();
  });

  it("an unknown kind yields NO context at all", () => {
    expect(
      archiveContextFrom({ ...TERM_ARCHIVE, kind: "collection" }),
    ).toBeNull();
    expect(archiveContextFrom({ ...TERM_ARCHIVE, kind: "brand" })).toBeNull();
  });
});

describe("an unresolved term is an explicit not-found state", () => {
  it("never yields an empty-but-200 archive", () => {
    const context = archiveContextFrom({
      ...TERM_ARCHIVE,
      term: null,
      articles: [],
    });
    expect(context).not.toBeNull();
    expect(context?.state).toBe("not-found");
    expect(context?.term).toBeNull();
    expect(context?.records).toEqual([]);
  });

  it("a resolved term is a READY state", () => {
    const context = archiveContextFrom(TERM_ARCHIVE);
    expect(context?.state).toBe("ready");
    expect(context?.term?.slug).toBe("jamdani");
    expect(context?.records).toHaveLength(2);
  });
});

describe("the context carries only the permitted fields", () => {
  it("the top-level fields are exactly the permitted ones", () => {
    const context = archiveContextFrom(TERM_ARCHIVE);
    expect(Object.keys(context ?? {}).sort()).toEqual([
      "breadcrumb",
      "description",
      "facets",
      "kind",
      "paging",
      "records",
      "state",
      "term",
    ]);
  });

  it("the term carries its id, slug and name — and no merchant's private data", () => {
    const context = archiveContextFrom(TERM_ARCHIVE);
    expect(Object.keys(context?.term ?? {}).sort()).toEqual([
      "id",
      "name",
      "nameEn",
      "slug",
    ]);
    // The merchant id the row carries is NOT handed to the theme.
    expect(JSON.stringify(context)).not.toContain("merchant_id");
    expect(JSON.stringify(context)).not.toContain("merchant-1");
  });

  it("a record carries the card and nothing else — no PII, no other merchant's data", () => {
    const context = archiveContextFrom(TERM_ARCHIVE);
    const record = context?.records[0];
    expect(Object.keys(record ?? {}).sort()).toEqual([
      "author",
      "coverImageUrl",
      "excerpt",
      "publishedAt",
      "slug",
      "title",
    ]);
    const serialised = JSON.stringify(context);
    // No unpublished-record marker, no other merchant's record, no PII.
    for (const forbidden of [
      "status",
      "unpublished",
      "authorId",
      "author_id",
      "email",
      "phone",
      "customer",
      "user_id",
    ]) {
      expect(
        serialised,
        `the context must not carry "${forbidden}"`,
      ).not.toContain(forbidden);
    }
  });

  it("the trail, the facets and the paging are the platform's own", () => {
    const context = archiveContextFrom(TERM_ARCHIVE);
    expect(context?.breadcrumb.map((c) => c.slug)).toEqual(["all", "jamdani"]);
    expect(context?.facets).toEqual([
      { slug: "sarees", name: "Sarees", kind: "category", count: 4 },
    ]);
    expect(context?.paging?.total).toBe(2);
    expect(context?.paging?.nextPath).toBeNull();
  });
});

describe("the context is derived, never re-queried", () => {
  it("the module imports no server module and opens no connection", () => {
    const imports = [...SOURCE.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
    for (const specifier of imports) {
      expect(
        specifier,
        `the archive context must not import "${specifier}"`,
      ).not.toMatch(/\.server($|\/)/);
      expect(specifier).not.toMatch(/supabase|postgres|database/i);
    }
    // No query, no fetch, no RPC — the context maps what the route already
    // has.
    expect(SOURCE).not.toMatch(/\.from\(/);
    expect(SOURCE).not.toMatch(/\bfetch\(/);
    expect(SOURCE).not.toMatch(/\brpc\b/);
  });

  it("the route's own server-function output is the ONLY input", () => {
    // The context is a pure map: it takes the loader's data and returns the
    // permitted view of it. Nothing else can reach it.
    const context = archiveContextFrom(TERM_ARCHIVE);
    expect(context?.kind).toBe("category");
    expect(context?.description).toBe("Handloom jamdani weaves.");
    expect(context?.records.map((r) => r.slug)).toEqual([
      "how-jamdani-is-woven",
      "the-loom-and-the-lake",
    ]);
  });
});
