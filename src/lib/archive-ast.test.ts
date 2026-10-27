import { describe, expect, it } from "vitest";
import { stripArchiveEmptyState } from "./archive-ast";
import type { ThemeAst } from "@/lib/builder-ast";

function sections(): ThemeAst["main"] {
  return [
    { id: "band", type: "category_header", props: {} },
    { id: "empty", type: "empty_state", props: { heading: "Nothing here" } },
    {
      id: "container",
      type: "container",
      props: {},
      children: [
        { id: "nested-empty", type: "empty_state", props: {} },
        { id: "articles", type: "blog_archive", props: {} },
      ],
    },
    { id: "pagination", type: "pagination", props: {} },
  ] as unknown as ThemeAst["main"];
}

describe("stripArchiveEmptyState", () => {
  it("removes the authored empty panel at the top level and in containers", () => {
    const result = stripArchiveEmptyState(sections());
    expect(result.map((section) => section.id)).toEqual([
      "band",
      "container",
      "pagination",
    ]);
    expect(result[1]!.children?.map((section) => section.id)).toEqual([
      "articles",
    ]);
  });

  it("does not mutate the published AST", () => {
    const source = sections();
    stripArchiveEmptyState(source);
    expect(source.map((section) => section.id)).toEqual([
      "band",
      "empty",
      "container",
      "pagination",
    ]);
    expect(source[2]!.children).toHaveLength(2);
  });
});
