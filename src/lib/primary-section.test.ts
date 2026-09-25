/**
 * primarySectionId — exactly one section owns the page h1.
 */
import { describe, expect, it } from "vitest";
import { newSection, primarySectionId, type ThemeAst } from "./builder-ast";

const ast = (main: ReturnType<typeof newSection>[]): ThemeAst => ({
  header: [],
  main,
  footer: [],
});
const withProps = (
  type: Parameters<typeof newSection>[0],
  props: Record<string, string>,
) => ({ ...newSection(type), props });

describe("primarySectionId", () => {
  it("returns null for missing or section-less asts", () => {
    expect(primarySectionId(null)).toBeNull();
    expect(primarySectionId(ast([]))).toBeNull();
  });

  it("prefers hero_carousel over the announcement bar (preview index)", () => {
    const hero = withProps("hero_carousel", {});
    const main = ast([
      withProps("announcement_bar", {}),
      hero,
      withProps("circle_categories", {}),
    ]);
    expect(primarySectionId(main)).toBe(hero.id);
  });

  it("prefers a heading widget over a rich_text heading prop", () => {
    const heading = withProps("heading", { text: "New in" });
    const main = ast([
      heading,
      withProps("rich_text", { heading: "Details", body: "x" }),
    ]);
    expect(primarySectionId(main)).toBe(heading.id);
  });

  it("falls back to a section carrying a heading prop", () => {
    const rich = withProps("rich_text", { heading: "Details", body: "x" });
    expect(primarySectionId(ast([rich]))).toBe(rich.id);
  });

  it("keeps the legacy hero type first", () => {
    const hero = withProps("hero", {});
    const main = ast([hero, withProps("heading", { text: "Later" })]);
    expect(primarySectionId(main)).toBe(hero.id);
  });

  it("skips invalid sections", () => {
    const bad = { ...withProps("hero", {}), invalid: "gone" };
    const heading = withProps("heading", { text: "Fallback" });
    expect(primarySectionId(ast([bad, heading]))).toBe(heading.id);
  });
});
