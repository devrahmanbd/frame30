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

  it("resolves girls and boys to distinct non-overlapping assortments", () => {
    const girlsRows = rowsFor("girls");
    const boysRows = rowsFor("boys");
    const kidsRows = rowsFor("kids");

    expect(girlsRows.length).toBeGreaterThan(0);
    expect(boysRows.length).toBeGreaterThan(0);
    expect(kidsRows.length).toBeGreaterThanOrEqual(girlsRows.length + boysRows.length);

    // Girls contains girls ghagra choli, no panjabi or sarees
    expect(girlsRows.map((r) => r.id)).toContain("girls-silk-festive-ghagra-choli");
    expect(girlsRows.map((r) => r.id)).not.toContain("boys-silk-panjabi-pajama-set");
    expect(girlsRows.map((r) => r.id)).not.toContain("muslin-floral-festive-saree");
    expect(girlsRows.map((r) => r.id)).not.toContain("taaga-contemporary-linen-tunic");

    // Boys contains boys panjabi, no ghagra choli or sarees
    expect(boysRows.map((r) => r.id)).toContain("boys-silk-panjabi-pajama-set");
    expect(boysRows.map((r) => r.id)).not.toContain("girls-silk-festive-ghagra-choli");
    expect(boysRows.map((r) => r.id)).not.toContain("muslin-floral-festive-saree");
    expect(boysRows.map((r) => r.id)).not.toContain("taaga-man-relaxed-khadi-shirt");
  });

  it("filters out excluded product from recommendation rails", () => {
    const section = {
      ...newSection("product_rail"),
      props: {
        source: "collection",
        collection: "sarees",
        exclude: "dhakai-jamdani-heritage-saree",
        limit: 24,
      },
    };
    const bundle = collectWidgetRequests({
      header: [],
      main: [section],
      footer: [],
    } as never);
    const map = previewDemoMap(bundle, "songoskriti");
    const rows = map[bundle.byNode[section.id]!] ?? [];

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.id)).not.toContain("dhakai-jamdani-heritage-saree");
  });
});
