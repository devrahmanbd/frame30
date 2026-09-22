import { describe, expect, it } from "vitest";
import { articleToDoc, splitTermAssignment, statusOf } from "./editor.server";

describe("statusOf", () => {
  it("preserves archived so re-saving never flips it to draft", () => {
    expect(statusOf("archived", false)).toBe("archived");
    expect(statusOf("archived", true)).toBe("archived");
  });
  it("preserves the other known statuses", () => {
    expect(statusOf("trash", false)).toBe("trash");
    expect(statusOf("scheduled", false)).toBe("scheduled");
    expect(statusOf("private", false)).toBe("private");
  });
  it("falls back for unknown statuses", () => {
    expect(statusOf("bogus", false)).toBe("draft");
    expect(statusOf("bogus", true)).toBe("published");
    expect(statusOf(null, false)).toBe("draft");
  });
});

describe("splitTermAssignment", () => {
  it("splits category ids from taxonomy-tag ids", () => {
    expect(
      splitTermAssignment([
        { term_id: "c1", blog_terms: { kind: "category" } },
        { term_id: "t1", blog_terms: { kind: "tag" } },
        { term_id: "t2", blog_terms: { kind: "tag" } },
      ]),
    ).toEqual({ categories: ["c1"], taxonomyTags: ["t1", "t2"] });
  });
  it("sends join misses to categories, as before", () => {
    expect(
      splitTermAssignment([
        { term_id: "c1", blog_terms: null },
        { term_id: "c2" },
      ]),
    ).toEqual({ categories: ["c1", "c2"], taxonomyTags: [] });
  });
  it("handles empty assignment", () => {
    expect(splitTermAssignment([])).toEqual({
      categories: [],
      taxonomyTags: [],
    });
    expect(splitTermAssignment(null)).toEqual({
      categories: [],
      taxonomyTags: [],
    });
  });
});

describe("articleToDoc", () => {
  it("keeps free-text tags apart from taxonomy-tag ids", () => {
    const doc = articleToDoc(
      {
        id: "a1",
        title: "Hello",
        tags: ["free", "text"],
        status: "archived",
        allow_comments: true,
      },
      ["cat-1"],
      ["free", "text"],
      ["term-tag-1"],
    );
    expect(doc.tags).toEqual(["free", "text"]);
    expect(doc.taxonomyTags).toEqual(["term-tag-1"]);
    expect(doc.categories).toEqual(["cat-1"]);
    expect(doc.status).toBe("archived");
  });
});
