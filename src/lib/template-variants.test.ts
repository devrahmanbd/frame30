/**
 * The CLOSED variant vocabulary — its contract.
 *
 * The platform already persists variant keys (`parseTemplates`) and already
 * resolves them (`resolveTemplate`). What it did NOT have is a way to tell a
 * legal variant from a typo: `isVariantTemplateKey` accepts `blog_anything`.
 * This suite pins the closed table, the resolution the storefront routes use
 * (variant → base → the platform's own surface, never the homepage), the
 * round trip through storage, and the fact that the listing and the article
 * detail are DIFFERENT compositions.
 *
 * The route modules are NOT imported: they pull the whole server graph. The
 * route assertions read the route files as TEXT — the same pattern as
 * `src/routes/store.$slug.search-composition.test.tsx`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { EMPTY_AST, parseTemplates, type ThemeAst } from "@/lib/builder-ast";
import {
  TEMPLATE_VARIANTS,
  TEMPLATE_VARIANT_KEYS,
  TEMPLATE_VARIANT_LABEL,
  baseTemplateKey,
  isKnownTemplateKey,
  isTemplateVariantKey,
  resolveVariantAst,
  templateVariantEntries,
  variantKeyFor,
  variantKeysFor,
} from "@/lib/template-variants";
import { resolveThemePreview } from "@/lib/theme-preview-nav";
import type { EditorTemplateKey } from "@/hooks/use-builder-editor";

const DIR = dirname(fileURLToPath(import.meta.url));
const ROUTE_DIR = join(DIR, "..", "routes");
const LISTING_ROUTE = readFileSync(
  join(ROUTE_DIR, "store.$slug.blog.index.tsx"),
  "utf8",
);
const ARTICLE_ROUTE = readFileSync(
  join(ROUTE_DIR, "store.$slug.blog.$slug.tsx"),
  "utf8",
);
const TOPBAR_SRC = readFileSync(
  join(DIR, "..", "components", "builder", "BuilderTopBar.tsx"),
  "utf8",
);

/** A body that is unmistakably the merchant's own. */
const authored = (marker: string): ThemeAst => ({
  header: [],
  main: [
    {
      id: marker,
      type: "rich_text",
      props: { heading: "", body: marker },
    },
  ],
  footer: [],
});

describe("the variant vocabulary is CLOSED", () => {
  it("is exactly the table the plan names — no more, no less", () => {
    expect(TEMPLATE_VARIANTS).toEqual({
      blog: ["listing", "article"],
      archive: ["category", "tag", "author"],
    });
    // The derived key list is the table's flattening — it can never drift.
    expect([...TEMPLATE_VARIANT_KEYS]).toEqual([
      "blog_listing",
      "blog_article",
      "archive_category",
      "archive_tag",
      "archive_author",
    ]);
  });

  it("rejects a variant outside the table", () => {
    // The OPEN-ENDED shape predicate still accepts it — that is deliberate
    // (the old `page_<slug>` theme-package shape is a legal persisted key).
    // The CLOSED predicate is the one the editor and the routes use.
    expect(isTemplateVariantKey("blog_anything")).toBe(false);
    expect(isTemplateVariantKey("blog_artcile")).toBe(false);
    expect(isTemplateVariantKey("blog_listing_extra")).toBe(false);
    expect(isTemplateVariantKey("collection_listing")).toBe(false);
    expect(isTemplateVariantKey("")).toBe(false);
    expect(isTemplateVariantKey(42)).toBe(false);
    // … and the closed validator agrees.
    expect(isKnownTemplateKey("blog_anything")).toBe(false);
    expect(isKnownTemplateKey("blog_listing")).toBe(true);
    expect(isKnownTemplateKey("blog")).toBe(true);
    expect(isKnownTemplateKey("archive")).toBe(true);
    expect(isKnownTemplateKey("not_a_template")).toBe(false);
    expect(isKnownTemplateKey(undefined)).toBe(false);
    // A (base, suffix) pair outside the table has no key at all.
    expect(variantKeyFor("blog", "anything")).toBeNull();
    expect(variantKeyFor("blog", "listing")).toBe("blog_listing");
    expect(variantKeyFor("archive", "author")).toBe("archive_author");
    expect(variantKeyFor("collection", "listing")).toBeNull();
  });

  it("the STOREFRONT seam accepts every suffix of the table — and nothing else", async () => {
    // The storefront's only seam used to carry a HAND-WRITTEN copy of the
    // suffix list ("listing" | "article"), so the three archive variants
    // could not be requested at all — the day their route lands it would
    // 500 at the validator. The list is DERIVED now, and this case proves
    // the derivation.
    const { STORE_VARIANT_SUFFIXES } =
      await import("@/lib/storefront.functions");
    expect([...STORE_VARIANT_SUFFIXES]).toEqual(
      Object.values(TEMPLATE_VARIANTS).flat(),
    );
    // Every legal suffix is accepted …
    for (const suffix of Object.values(TEMPLATE_VARIANTS).flat()) {
      expect(
        variantKeyFor("blog", suffix) ?? variantKeyFor("archive", suffix),
      ).not.toBeNull();
    }
    // … and an unknown one is not.
    expect(STORE_VARIANT_SUFFIXES).not.toContain("bogus");
    expect(STORE_VARIANT_SUFFIXES).toHaveLength(5);
  });

  it("resolves the base a key belongs to — the inverse of the shape predicate", () => {
    expect(baseTemplateKey("blog")).toBe("blog");
    expect(baseTemplateKey("blog_listing")).toBe("blog");
    expect(baseTemplateKey("archive_author")).toBe("archive");
    expect(baseTemplateKey("blog_anything")).toBeNull();
    expect(baseTemplateKey("not_a_template")).toBeNull();
    expect(baseTemplateKey(null)).toBeNull();
  });

  it("lists the variants each base owns", () => {
    expect([...variantKeysFor("blog")]).toEqual([
      "blog_listing",
      "blog_article",
    ]);
    expect([...variantKeysFor("archive")]).toEqual([
      "archive_category",
      "archive_tag",
      "archive_author",
    ]);
    expect([...variantKeysFor("collection")]).toEqual([]);
  });

  it("the switcher's second level is exactly the closed vocabulary, grouped by base", () => {
    // The editor's switcher renders this grouping: the BASE stays the
    // default selection, the variants sit beneath it.
    expect(templateVariantEntries()).toEqual([
      { base: "blog", variants: ["blog_listing", "blog_article"] },
      {
        base: "archive",
        variants: ["archive_category", "archive_tag", "archive_author"],
      },
    ]);
    // Every variant has a label, and no label exists outside the table.
    expect(Object.keys(TEMPLATE_VARIANT_LABEL).sort()).toEqual(
      [...TEMPLATE_VARIANT_KEYS].sort(),
    );
    // The switcher component renders the second level from that grouping.
    expect(TOPBAR_SRC).toContain("templateVariantEntries()");
    expect(TOPBAR_SRC).toContain("TEMPLATE_VARIANT_LABEL[variant]");
    expect(TOPBAR_SRC).toContain("data-template-variant={variant}");
  });

  it("is the editor's template identity — a base, or a closed variant", () => {
    const base: EditorTemplateKey = "blog";
    const variant: EditorTemplateKey = "blog_listing";
    expect(base).toBe("blog");
    expect(variant).toBe("blog_listing");
    // @ts-expect-error — a variant outside the closed table is NOT an
    // editor identity: the merchant cannot type it and the editor cannot
    // address it.
    const illegal: EditorTemplateKey = "blog_anything";
    expect(illegal).toBe("blog_anything");
  });
});

describe("a variant survives storage", () => {
  it("persists blog_article and blog_listing through a parse round trip", () => {
    const map = {
      blog: authored("base"),
      blog_listing: authored("listing"),
      blog_article: authored("article"),
    };
    const parsed = parseTemplates(JSON.parse(JSON.stringify(map)));
    expect(parsed.blog_listing?.main[0]?.props["body"]).toBe("listing");
    expect(parsed.blog_article?.main[0]?.props["body"]).toBe("article");
    expect(parsed.blog?.main[0]?.props["body"]).toBe("base");
  });
});

describe("the routes resolve the variant", () => {
  it("the LISTING route asks for blog_listing, the DETAIL route for blog_article", () => {
    // Both routes carry a STORE SLUG, so both can resolve a theme at all
    // (`getStoreChrome` needs one). The listing resolves `blog_listing`, the
    // detail resolves `blog_article`.
    expect(LISTING_ROUTE).toContain('template: "blog"');
    expect(LISTING_ROUTE).toContain('variant: "listing"');
    expect(ARTICLE_ROUTE).toContain('template: "blog"');
    expect(ARTICLE_ROUTE).toContain('variant: "article"');
  });

  it("resolves the variant when it is authored", () => {
    const templates = {
      blog: authored("base"),
      blog_listing: authored("listing"),
      blog_article: authored("article"),
    };
    const listing = resolveVariantAst(templates, "blog", "listing");
    expect(listing?.key).toBe("blog_listing");
    expect(listing?.match).toBe("suffix");
    expect(listing?.ast.main[0]?.props["body"]).toBe("listing");
    const article = resolveVariantAst(templates, "blog", "article");
    expect(article?.key).toBe("blog_article");
    expect(article?.ast.main[0]?.props["body"]).toBe("article");
  });

  it("falls back to the BASE blog body when the variant is absent", () => {
    const templates = { blog: authored("base") };
    const listing = resolveVariantAst(templates, "blog", "listing");
    expect(listing?.key).toBe("blog");
    expect(listing?.match).toBe("base");
    expect(listing?.ast.main[0]?.props["body"]).toBe("base");
    const article = resolveVariantAst(templates, "blog", "article");
    expect(article?.key).toBe("blog");
    expect(article?.match).toBe("base");
  });

  it("falls back to the PLATFORM's own surface when neither is present — never the homepage", () => {
    // No composition at all: the resolution is null, so the route renders its
    // own platform surface. `resolveTemplate`'s `page`/`index` tail is never
    // accepted — that is the behaviour this programme forbids.
    expect(resolveVariantAst({}, "blog", "listing")).toBeNull();
    expect(resolveVariantAst(null, "blog", "listing")).toBeNull();
    expect(resolveVariantAst(undefined, "blog", "article")).toBeNull();
    // A suffix outside the closed table has no composition at all.
    expect(
      resolveVariantAst({ blog: authored("base") }, "blog", "anything"),
    ).toBeNull();
    // … and the platform's grid is what the route renders when the chrome
    // is absent — the route passes no AST in that case.
    expect(LISTING_ROUTE).toContain("ast={data.chrome?.ast ?? null}");
    expect(ARTICLE_ROUTE).toContain("ast={data.chrome?.ast ?? null}");
  });
});

describe("the listing and the article detail are DIFFERENT compositions", () => {
  const preset = resolveThemePreview("songoskriti")!;

  it("Songoskriti authors both variants", () => {
    expect(preset.variants["blog_listing"]).toBeTruthy();
    expect(preset.variants["blog_article"]).toBeTruthy();
  });

  it("their section-type sets differ, so a merchant can tell them apart", () => {
    const listing = preset.variants["blog_listing"]!.main.map((s) => s.type);
    const article = preset.variants["blog_article"]!.main.map((s) => s.type);
    expect(listing.length).toBeGreaterThan(0);
    expect(article.length).toBeGreaterThan(0);
    expect(listing).not.toEqual(article);
    // The detail carries the route-owned body slot the listing does not —
    // that is what makes the two surfaces different pages, not two copies.
    expect(article).toContain("page_content");
    expect(listing).not.toContain("page_content");
    // … and the listing keeps the blog pack.
    expect(listing).toContain("blog_archive");
  });

  it("the base blog body is still the listing's pack", () => {
    const base = preset.templates.blog.main.map((s) => s.type);
    expect(base).toEqual(["blog_terms", "blog_archive", "blog_pager"]);
  });

  it("an empty AST is not a composition", () => {
    expect(
      resolveVariantAst({ blog: EMPTY_AST }, "blog", "listing"),
    ).toBeNull();
  });
});
