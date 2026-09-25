/**
 * previewDemoMap collection/category filtering — TDD: category slugs resolve
 * to category-filtered rows (not the new-in fallback), unknown slugs fall
 * back to the base rows.
 */
import { describe, expect, it } from "vitest";
import { newSection } from "./builder-ast";
import { collectWidgetRequests } from "./widget-data";
import { previewDemoMap } from "./preview-demo-data";

function rowsFor(collection: string, theme = "songoskriti") {
  const section = {
    ...newSection("product_rail"),
    props: { source: "collection", collection, limit: 24 },
  };
  const bundle = collectWidgetRequests({
    header: [],
    main: [section],
    footer: [],
  } as never);
  const map = previewDemoMap(bundle, theme);
  const key = bundle.byNode[section.id]!;
  return map[key] ?? [];
}

describe("previewDemoMap collection filtering", () => {
  it("resolves a category slug to category-filtered rows", () => {
    const rows = rowsFor("women");
    expect(rows.length).toBeGreaterThan(0);
    // every row's product belongs to the women category (songoskriti has no
    // `women` collection, so a collection-only filter would fall back to base)
    expect(
      rows.every((r) => r.subtitle === "women" || r.id.includes("women")),
    ).toBe(true);
  });

  it("resolves a collection slug to its rows", () => {
    const rows = rowsFor("festive");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("falls back to the full base rows for unknown slugs", () => {
    const rows = rowsFor("nope-xyz");
    const festive = rowsFor("festive");
    expect(rows.length).toBeGreaterThan(festive.length);
    expect(rows.map((r) => r.id)).toContain("rajshahi-silk-festive-panjabi");
  });
});
