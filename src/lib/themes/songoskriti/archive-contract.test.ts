/**
 * Task 10 — the archive contract (Decision D1' — the archive key is REAL) and
 * the preview's explicit unsupported state.
 *
 * The expert's archive item asked for "a real first-class template key only
 * after defining which archive-like routes it represents … and unsupported
 * routes must not silently redirect to the homepage". **D1' ruled the
 * opposite of D1 (Option A)**: the content archive IS a first-class template
 * key, its supported kinds are the three content-archive routes the platform
 * actually serves (category / tag / author), and the preview keeps its
 * **explicit unsupported state** for a key the platform still does not know.
 * What is left is the contract itself — written down — plus the preview's
 * explicit unsupported state in place of the silent homepage fallback.
 *
 * This suite pins the contract with **five** cases, none of which depends on
 * a ruling (the ruling is already made and is a decision, not a fact):
 *
 * 1. the archive-like routes the platform actually has are enumerated;
 * 2. the product-side taxonomy surfaces are **not** routes — a product
 *    category is a search facet, not a URL;
 * 3. **no unsupported template silently redirects to the homepage** — the
 *    preview's fallback is an explicit, named unsupported state, and the
 *    storefront's own routes answer an unknown slug with their own 404;
 * 4. the unsupported state's copy is **not** demo copy — the panel must not
 *    inherit the demo-copy defect Phase 1 removed — and it states the
 *    CURRENT ruling (the archive is a template a theme may author; the
 *    platform's reader surfaces keep the platform grid because they carry no
 *    store slug);
 * 5. the contract is **written down** — so it cannot be deleted silently.
 *
 * The tree is read as TEXT (the same pattern as
 * `src/routes/store.$slug.search-composition.test.tsx`): the preview host and
 * the route modules are never imported, so this suite pulls in no server graph
 * and no component graph.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = dirname(fileURLToPath(import.meta.url));
/** The repo root — four levels up from `src/lib/themes/songoskriti/`. */
const REPO = join(DIR, "..", "..", "..", "..");

const PREVIEW_HOST = readFileSync(
  join(REPO, "src/components/store/ThemePreviewFrame.tsx"),
  "utf8",
);
const SEARCH_CONTRACT = readFileSync(
  join(REPO, "src/lib/storefront-search.ts"),
  "utf8",
);
/**
 * The Phase-3 escalation record — the one that carries the CURRENT ruling.
 * The Phase-2 record (`phase2-template-completeness-escalation.md`) is a
 * HISTORICAL document: it records the superseded D1 (Option A) and it is
 * never rewritten.
 */
const RECORD = readFileSync(
  join(
    REPO,
    "docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md",
  ),
  "utf8",
);
const ROUTE_FILES = readdirSync(join(REPO, "src/routes"));

/**
 * The escalation record's prose, with the markdown blockquote markers and the
 * line wrapping removed — so a phrase the record wraps across two lines is
 * still found. The record's *words* are what the contract is; the wrapping is
 * not.
 */
const RECORD_TEXT = RECORD.replace(/^\s*>\s?/gm, "").replace(/\s+/g, " ");

/** The demo strings Phase 1 retired from the theme's bodies. */
const RETIRED_DEMO_STRINGS = [
  "Demo page",
  "Demo search",
  "Meet the makers",
  "Sample product",
  "Demo",
];

/** The panel's copy constant, read out of the preview host's source. */
function copyConstant(name: string): string {
  const match = PREVIEW_HOST.match(
    new RegExp(`const ${name} =\\s*"([^"]*)"`, "s"),
  );
  expect(
    match,
    `the preview host must declare \`const ${name} = "…"\``,
  ).not.toBeNull();
  return match![1]!;
}

/**
 * The panel's whole copy: its two constants plus the panel component's own
 * JSX text. The component slice runs from the panel's declaration to the
 * closing brace of that function — nothing else in the preview host is part
 * of the panel's copy.
 */
function unsupportedStateCopy(): string {
  const at = PREVIEW_HOST.indexOf("function UnsupportedTemplateNotice");
  expect(
    at,
    "the preview host must declare the unsupported-state panel",
  ).toBeGreaterThanOrEqual(0);
  const end = PREVIEW_HOST.indexOf("\n}\n", at);
  expect(
    end,
    "the unsupported-state panel must be a closed function",
  ).toBeGreaterThanOrEqual(0);
  return [
    copyConstant("UNSUPPORTED_TEMPLATE_TITLE"),
    copyConstant("UNSUPPORTED_TEMPLATE_BODY"),
    PREVIEW_HOST.slice(at, end),
  ].join("\n");
}

describe("the archive contract (Decision D1' — the archive key is REAL)", () => {
  it("enumerates the archive-like routes the platform actually serves", () => {
    // The blog listing and its three taxonomy kinds, plus the storefront's
    // own blog index — the whole of the archive-like surface.
    expect(ROUTE_FILES).toContain("blog.index.tsx");
    expect(ROUTE_FILES).toContain("blog.category.$slug.tsx");
    expect(ROUTE_FILES).toContain("blog.tag.$slug.tsx");
    expect(ROUTE_FILES).toContain("blog.author.$slug.tsx");
    expect(ROUTE_FILES).toContain("store.$slug.blog.index.tsx");
  });

  it("keeps the product-side taxonomy surfaces off the URL — a category is a search facet, not a route", () => {
    // No product-category route and no brand route exist: the products' own
    // taxonomy is a facet of the search query, not a page.
    expect(
      ROUTE_FILES.filter((file) => file.includes("$categorySlug")),
    ).toEqual([]);
    expect(ROUTE_FILES.filter((file) => /brand/i.test(file))).toEqual([]);
    // The category rides the search contract instead — the facet the search
    // route applies (`src/lib/storefront-search.ts`).
    expect(SEARCH_CONTRACT).toContain("category: string | null;");
    expect(SEARCH_CONTRACT).toContain('out["category"] = p.category;');
  });

  it("never redirects an unsupported template to the homepage — the preview states it, the route 404s", () => {
    // The preview host's fallback is NOT the bare `?? templates.index`: the
    // unsupported template is an explicit state, computed as a flag.
    expect(PREVIEW_HOST).not.toMatch(
      /templates\[template\]\s*\?\?\s*templates\.index/,
    );
    expect(PREVIEW_HOST).toContain("const unsupported =");
    // …and the flag is CONSUMED at the render site, not merely computed.
    expect(PREVIEW_HOST).toContain("unsupported ? (");
    expect(PREVIEW_HOST).toContain(
      "<UnsupportedTemplateNotice template={template} />",
    );
    // The storefront's own blog routes answer an unknown slug with their
    // OWN 404 — never a redirect to the homepage.
    for (const route of [
      "blog.category.$slug.tsx",
      "store.$slug.blog.index.tsx",
    ]) {
      const source = readFileSync(join(REPO, "src/routes", route), "utf8");
      expect(source, route).toContain("throw notFound()");
      expect(source, route).not.toContain("redirect(");
    }
  });

  it("writes the unsupported state in copy that is not demo copy and states the CURRENT ruling", () => {
    const copy = unsupportedStateCopy();
    // The panel says what it is: a statement about the theme's coverage.
    expect(copy).toContain("This template is not supported by this theme");
    // It NAMES the template key and LINKS BACK to the home tab.
    expect(copy).toContain("The requested template key is");
    expect(copy).toContain("Back to the home tab");
    expect(copy).toContain('href="/"');
    // And it carries NONE of the retired demo strings — the panel must not
    // inherit the demo-copy defect Phase 1 removed from the theme's bodies.
    for (const retired of RETIRED_DEMO_STRINGS) {
      expect(
        copy,
        `the unsupported state must not carry "${retired}"`,
      ).not.toContain(retired);
    }
    // The D1 (Option A) wording is SUPERSEDED: the archive is a template a
    // theme may author, and the platform's reader surfaces keep the
    // platform grid because they carry no store slug. The old copy — the
    // archive surfaces "wear the blog template" — would be false now.
    expect(copy).toContain(
      "The archive is a first-class template a theme may author",
    );
    expect(copy).toContain("keep the platform grid");
    expect(copy).toContain("carry no store slug");
    expect(copy).not.toContain("wear the blog template");
  });

  it("keeps the contract written down, so it cannot be deleted silently", () => {
    expect(RECORD_TEXT).toContain(
      "Archive contract (Decision D1' — the archive key is REAL)",
    );
    expect(RECORD_TEXT).toContain("`archive` is a first-class template key");
    expect(RECORD_TEXT).toContain(
      "the three content-archive routes are its kinds",
    );
    expect(RECORD_TEXT).toContain(
      "the platform reader surfaces keep the platform grid because they carry no store slug",
    );
    expect(RECORD_TEXT).toContain("src/routes/store.$slug.blog.index.tsx");
  });
});
