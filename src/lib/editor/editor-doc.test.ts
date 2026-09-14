import { describe, expect, it } from "vitest";
import {
  canProceed,
  docOutline,
  docStats,
  effectiveSlug,
  emptyEditorDoc,
  formatPublishDate,
  isDirty,
  parentOptions,
  prePublishChecks,
  primaryAction,
  relativeTime,
  resolvePublishStatus,
  slugify,
  titlePill,
  validateDoc,
} from "./editor-doc";
import { canRedo, canUndo, createHistory, pushHistory, redo, undo } from "./editor-history";
import {
  blocksToMarkdown,
  inlineMarkdownToHtml,
  markdownToBlocks,
  markdownToText,
  renderMarkdownBlocks,
} from "./page-markdown";

const NOW = Date.parse("2026-09-04T12:00:00Z");

describe("slugs", () => {
  it("slugifies latin and bangla titles", () => {
    expect(slugify("Hello, World!  ")).toBe("hello-world");
    expect(slugify("আমাদের কথা")).toBe("আমাদের-কথা");
  });
  it("prefers explicit slug, then english title, then title", () => {
    expect(effectiveSlug({ slug: "x", title: "A", titleEn: "B" })).toBe("x");
    expect(effectiveSlug({ slug: "", title: "A b", titleEn: "C d" })).toBe("c-d");
    expect(effectiveSlug({ slug: "", title: "A b", titleEn: "" })).toBe("a-b");
  });
});

describe("publish state", () => {
  it("derives scheduled from a future date", () => {
    const future = new Date(NOW + 3_600_000).toISOString();
    expect(
      resolvePublishStatus({ status: "published", publishAt: future, visibility: "public" }, NOW),
    ).toBe("scheduled");
    expect(
      resolvePublishStatus({ status: "published", publishAt: null, visibility: "public" }, NOW),
    ).toBe("published");
  });
  it("private visibility wins", () => {
    expect(
      resolvePublishStatus({ status: "published", publishAt: null, visibility: "private" }, NOW),
    ).toBe("private");
  });
  it("picks the WordPress primary button label", () => {
    const base = {
      status: "published" as const,
      publishAt: null,
      publishedAt: null,
      visibility: "public" as const,
    };
    expect(primaryAction(base, true, NOW)).toBe("publish");
    expect(primaryAction({ ...base, publishedAt: "2026-01-01" }, true, NOW)).toBe("update");
    expect(
      primaryAction({ ...base, publishAt: new Date(NOW + 86_400_000).toISOString() }, true, NOW),
    ).toBe("schedule");
    expect(primaryAction(base, false, NOW)).toBe("submit");
  });
});

describe("pre-publish checks", () => {
  it("blocks on missing title and password", () => {
    const doc = { ...emptyEditorDoc("page"), visibility: "password" as const };
    const checks = prePublishChecks(doc, { seoScore: 40, builderLints: 0, slugTaken: false }, NOW);
    expect(canProceed(checks)).toBe(false);
    expect(checks.find((c) => c.id === "title")?.level).toBe("fail");
    expect(checks.find((c) => c.id === "password")?.level).toBe("fail");
  });
  it("passes a complete post and warns on missing category", () => {
    const doc = {
      ...emptyEditorDoc("post"),
      title: "Hello",
      body: "<p>Some words here for the test.</p>",
    };
    const checks = prePublishChecks(doc, { seoScore: 90, builderLints: 0, slugTaken: false }, NOW);
    expect(canProceed(checks)).toBe(true);
    expect(checks.find((c) => c.id === "category")?.level).toBe("warn");
    expect(checks.find((c) => c.id === "seo")?.en).toContain("90");
  });
});

describe("stats and outline", () => {
  it("counts words for pages (markdown) and posts (markup)", () => {
    expect(docStats({ kind: "page", body: "## Hi\n\none two three" }).words).toBe(4);
    expect(docStats({ kind: "post", body: "<p>one two</p>" }).words).toBe(2);
    expect(docStats({ kind: "post", body: "" }).minutes).toBe(0);
  });
  it("lists headings in order", () => {
    const outline = docOutline({ kind: "page", body: "## A\n\ntext\n\n### B" });
    expect(outline.map((h) => [h.level, h.text])).toEqual([
      [2, "A"],
      [3, "B"],
    ]);
  });
});

describe("dates", () => {
  it("formats publish dates and relative time", () => {
    expect(formatPublishDate(null)).toBe("Immediately");
    expect(relativeTime(new Date(NOW - 13 * 3_600_000).toISOString(), NOW)).toBe("13 hours ago");
    expect(relativeTime(new Date(NOW - 20_000).toISOString(), NOW)).toBe("just now");
    expect(relativeTime(new Date(NOW - 3 * 86_400_000).toISOString(), NOW)).toBe("3 days ago");
  });
});

describe("validation and dirty", () => {
  it("flags bad slugs and long fields", () => {
    const doc = { ...emptyEditorDoc("page"), title: "x", slug: "Bad Slug!" };
    expect(validateDoc(doc).some((i) => i.field === "slug")).toBe(true);
    expect(validateDoc({ ...doc, slug: "good-slug" })).toEqual([]);
  });
  it("ignores timestamps when comparing", () => {
    const a = emptyEditorDoc("post");
    expect(isDirty(a, { ...a, updatedAt: "2026-01-01" })).toBe(false);
    expect(isDirty(a, { ...a, title: "changed" })).toBe(true);
  });
  it("builds a title pill", () => {
    expect(titlePill({ title: "", kind: "page" }, "en")).toEqual({
      title: "Untitled",
      kind: "Page",
    });
  });
});

describe("parent options", () => {
  it("indents children and excludes self", () => {
    const pages = [
      { id: "a", title: "A", parentId: null },
      { id: "b", title: "B", parentId: "a" },
      { id: "c", title: "C", parentId: null },
    ];
    expect(parentOptions(pages, "c").map((p) => `${p.depth}:${p.title}`)).toEqual(["0:A", "1:B"]);
  });
});

describe("history", () => {
  it("coalesces same-field edits inside the window", () => {
    let h = createHistory("a", 0);
    h = pushHistory(h, "ab", "title", 100);
    h = pushHistory(h, "abc", "title", 200);
    expect(h.past).toHaveLength(1);
    h = pushHistory(h, "abc!", "title", 5000);
    expect(h.past).toHaveLength(2);
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect(h.present.value).toBe("abc");
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present.value).toBe("abc!");
  });
  it("a new edit clears redo", () => {
    let h = createHistory("a", 0);
    h = pushHistory(h, "b", "t", 5000);
    h = undo(h);
    h = pushHistory(h, "c", "u", 10_000);
    expect(canRedo(h)).toBe(false);
  });
});

describe("page markdown bridge", () => {
  it("round-trips the toolbar subset", () => {
    const md = [
      "## Heading",
      "",
      "Some **bold** and *em* with `code` and a [link](https://x.y/z).",
      "",
      "- one",
      "- two",
      "",
      "1. first",
      "2. second",
      "",
      "> quoted",
      "",
      "---",
      "",
      '![Alt](https://img.test/a.jpg#800x600 "Cap")',
      "",
      "```js",
      "let a = 1;",
      "```",
      "",
      "<!--more-->",
      "",
      "| H1 | H2 |",
      "| --- | --- |",
      "| a | b |",
    ].join("\n");
    const blocks = markdownToBlocks(md);
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "list",
      "list",
      "quote",
      "hr",
      "image",
      "code",
      "more",
      "table",
    ]);
    expect(blocksToMarkdown(blocks)).toBe(md);
  });
  it("keeps alignment, underline and strike through the bridge", () => {
    const md = "<!-- align:center -->\n<u>under</u> and ~~gone~~";
    const blocks = markdownToBlocks(md);
    expect(blocks[0]).toMatchObject({ type: "paragraph", align: "center" });
    expect(blocksToMarkdown(blocks)).toBe(md);
    expect(renderMarkdownBlocks(md)).toBe(
      '<p class="has-text-align-center"><u>under</u> and <s>gone</s></p>',
    );
  });
  it("escapes raw html and treats # as h2", () => {
    expect(renderMarkdownBlocks("# Title <script>alert(1)</script>")).toBe(
      "<h2>Title &lt;script&gt;alert(1)&lt;/script&gt;</h2>",
    );
    expect(inlineMarkdownToHtml("a < b")).toBe("a &lt; b");
  });
  it("extracts plain text", () => {
    expect(markdownToText("## Hi\n\n**bold** text")).toBe("Hi bold text");
  });
});
