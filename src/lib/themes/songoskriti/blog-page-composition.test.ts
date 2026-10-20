/**
 * Songoskriti `blog` template — the editorial composition, and the theme's
 * sample content page.
 *
 * **The composition.** The platform's blog pack renders the listing — the
 * terms rail, the archive grid and the pager
 * (`src/components/builder/blog.tsx:392-394`) — and the platform owns the
 * feed (`BlogFeedProvider`). The theme owns *which* pack sections, in which
 * order, with which copy. There is **no authored story body**: the demo
 * story the preview used to show ("Meet the makers") is retired, because a
 * static story block in the theme is the platform's content impersonated.
 *
 * **The sample page.** The `page` template's body is a context slot the host
 * fills; the preview has no CMS record, so it fills it with the theme's
 * **explicitly labelled** sample. The live Page route renders the merchant's
 * record through `page_content` and this plan does not change that.
 */
import { describe, expect, it } from "vitest";
import {
  catalogEntry,
  lintTemplate,
  type SectionBuilder,
  type ThemeAst,
} from "../../builder-ast";
import { PREVIEW_DEMO_PAGE } from "../../preview-page-data";
import { songoskritiPreviewSource } from "./preview";

/** The plain builder the engine uses. */
function plainBuilder(): SectionBuilder {
  let n = 0;
  return (type, props = {}) => ({
    id: `${type}-${n++}`,
    type,
    props: { ...props },
  });
}

function blogAst(): ThemeAst {
  return {
    header: [],
    main: songoskritiPreviewSource().main("blog", plainBuilder())!,
    footer: [],
  };
}

const types = blogAst().main.map((section) => section.type);

describe("songoskriti blog template composition", () => {
  it("authors the platform's blog pack in the exact order", () => {
    // The platform's blog pack, in the platform's order (terms → archive →
    // pager), with no authored story body.
    expect(types).toEqual(["blog_terms", "blog_archive", "blog_pager"]);
  });

  it("carries no authored story body", () => {
    // The "Meet the makers" demo story is gone; the editorial voice moves
    // to the theme's blog pack rendering and to the demo feed's own
    // excerpts, not to a static story block.
    expect(types).not.toContain("rich_text");
    expect(types).not.toContain("image");
  });

  it("uses only section types allowed on the blog template", () => {
    for (const section of blogAst().main) {
      const templates = catalogEntry(section.type)!.templates;
      if (!templates) continue;
      expect(
        templates,
        `${section.type} must allow the blog template`,
      ).toContain("blog");
    }
  });

  it("has zero lint errors on the blog template", () => {
    expect(
      lintTemplate(blogAst(), "blog").filter((i) => i.level === "error"),
    ).toEqual([]);
  });

  it("carries no demo marker", () => {
    const serialised = JSON.stringify(blogAst().main.map((s) => s.props));
    expect(serialised).not.toContain("Meet the makers");
    expect(serialised).not.toContain("Demo story");
    expect(serialised).not.toContain("Demo");
  });
});

describe("songoskriti sample content page", () => {
  it("keeps the production payload shape and is explicitly labelled", async () => {
    const pageModule = await import("./preview-page");
    const page = pageModule.SONGOSKRITI_PREVIEW_PAGE;
    // The sample page keeps the production payload shape
    // (`src/lib/preview-page-data.ts:27-33`), so it cannot drift from the
    // route's record.
    expect(Object.keys(page).sort()).toEqual([
      "excerpt",
      "html",
      "title",
      "updated_at",
    ]);
    // …and it says, in words, that it is sample content.
    expect(page.title).toContain("Sample");
    expect((page.excerpt ?? "").toLowerCase()).toContain("sample");
    // The theme's sample is a *designed* sample, not the one-line placeholder.
    expect(page.html.length).toBeGreaterThan(PREVIEW_DEMO_PAGE.html.length);
  });
});
