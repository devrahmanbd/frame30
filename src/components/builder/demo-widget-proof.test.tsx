/**
 * T2.2 — DemoProductWidget two-theme proof (§22 acceptance).
 *
 * Proof design (no fixture widget created — deliberate reuse):
 * `product_rail` is the simplest real widget covering the proof's
 * title+price+image shape through the shared `ProductCard` data semantics.
 * `resolveWidgetComponent("songoskriti", "product_rail")` returns the
 * songoskriti editorial rail while `resolveWidgetComponent("somvabona",
 * "product_rail")` returns the generic rail (somvabona adds no override, so
 * the generic fallback IS its presentation — never brand leak). That is the
 * exact function `SectionRenderer` calls, so rendering the SAME `Section`
 * object plus the SAME `WidgetDataProvider` bundle under
 * `themeKey="songoskriti"` vs `themeKey="somvabona"` is the same path the
 * editor and the storefront resolve. A fixture `DemoProductWidget` would
 * distort the proof (a new type has no two-theme resolution history), so per
 * the task preference it was NOT created.
 *
 * The proof asserts, for identical inputAST + identical rows:
 * 1. Structurally different markup (different classes/elements/order).
 * 2. Identical data content (heading, titles, prices, images, promise).
 * 3. Zero widget-logic changes, zero AST changes, zero if-theme branches
 *    (source scan: no theme literal in the renderer, no themeKey read in
 *    any widget/primitive).
 * 4. The `data-widget`/`data-skin` pair is emitted on both keys, which is
 *    what theme skin sheets key on.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection } from "@/lib/builder-ast";
import { formatDisplayMoney } from "@/lib/money-display";
import type { WidgetRow } from "@/lib/widget-data";
import { SectionRenderer } from "./SectionRenderer";
import { WidgetDataProvider } from "./WidgetDataContext";
import { SONGOSKRITI_WIDGETS } from "./songoskriti";
import { resolveWidgetComponent } from "./theme-widgets";
import { GENERIC_WIDGETS } from "./widgets";

/** Same product data (title + price + image) for both presentations. */
const ROWS: WidgetRow[] = [
  {
    id: "demo-saree",
    title: "Dhakai Jamdani saree",
    href: "/p/demo-saree",
    priceMinor: 12500_00,
    currency: "BDT",
    imageUrl: "/ph/demo-saree.png",
    inStock: true,
  },
  {
    id: "demo-panjabi",
    title: "Silk panjabi",
    href: "/p/demo-panjabi",
    priceMinor: 4800_00,
    currency: "BDT",
    imageUrl: "/ph/demo-panjabi.png",
    inStock: true,
  },
];

/**
 * ONE section object for the whole proof. Both theme renders share this
 * reference, so any AST mutation by either path fails the snapshot test.
 */
function demoSection() {
  return {
    ...newSection("product_rail"),
    id: "demo-proof-rail",
    props: {
      ...newSection("product_rail").props,
      heading: "Demo collection",
      limit: 8,
      cardVariant: "compact",
      promise: "Cash on delivery",
    },
  };
}

function renderUnderTheme(section: ReturnType<typeof demoSection>, themeKey: string) {
  const bundle = {
    requests: [{ key: "demo", source: "collection", params: {} }],
    byNode: { [section.id]: "demo" },
  };
  const map = { demo: ROWS };
  return renderToStaticMarkup(
    <WidgetDataProvider
      bundle={bundle as never}
      map={map as never}
    >
      <SectionRenderer section={section} themeKey={themeKey} locale="en" />
    </WidgetDataProvider>,
  );
}

describe("T2.2 two-theme proof: same widget data, two presentations", () => {
  it("resolves the same key to different renderers by theme key", () => {
    const songo = resolveWidgetComponent("songoskriti", "product_rail");
    const somva = resolveWidgetComponent("somvabona", "product_rail");
    expect(songo).toBe(SONGOSKRITI_WIDGETS.product_rail);
    expect(somva).toBe(GENERIC_WIDGETS.product_rail);
    // The violation this proof ends: both themes must NOT share one brand.
    expect(somva).not.toBe(songo);
    expect(songo).toBeDefined();
    expect(somva).toBeDefined();
  });

  it("renders structurally different markup from the same section + rows", () => {
    const section = demoSection();
    const before = JSON.stringify(section);
    const songo = renderUnderTheme(section, "songoskriti");
    const somva = renderUnderTheme(section, "somvabona");

    expect(songo.length).toBeGreaterThan(0);
    expect(somva.length).toBeGreaterThan(0);
    expect(songo).not.toBe(somva);

    // Songoskriti-only: docked header row + luxury bordered surface.
    expect(songo).toContain("justify-between");
    expect(songo).toContain("border-[var(--theme-border)]");
    // Somvabona (generic) only: shared Rail with overlay nav + badge hooks.
    expect(somva).toContain('data-part="rail-nav"');
    expect(somva).toContain("bg-background/90");
    // Cross-absence: neither presentation leaks the other's structure.
    expect(somva).not.toContain("justify-between");
    expect(songo).not.toContain('data-part="rail-nav"');

    // Different element order: songoskriti docks arrows BEFORE the list,
    // the generic rail overlays them AFTER the list.
    expect(songo.indexOf("<button")).toBeLessThan(songo.indexOf("<ul"));
    expect(somva.indexOf("<ul")).toBeLessThan(somva.indexOf("<button"));

    // ZERO AST changes: the shared section object is byte-identical after
    // both renders.
    expect(JSON.stringify(section)).toBe(before);
  });

  it("keeps identical data content (title + price + image + promise)", () => {
    const section = demoSection();
    const songo = renderUnderTheme(section, "songoskriti");
    const somva = renderUnderTheme(section, "somvabona");

    expect(songo).toContain("Demo collection");
    expect(somva).toContain("Demo collection");
    for (const row of ROWS) {
      for (const html of [songo, somva]) {
        expect(html).toContain(row.title);
        expect(html).toContain(row.imageUrl as string);
        expect(html).toContain('data-part="title"');
        expect(html).toContain('data-part="price"');
      }
      const expectedPrice = formatDisplayMoney(row.priceMinor, {
        locale: "en",
        currency: row.currency ?? "BDT",
      });
      expect(songo).toContain(expectedPrice);
      expect(somva).toContain(expectedPrice);
    }
    expect(songo).toContain("Cash on delivery");
    expect(somva).toContain("Cash on delivery");
  });

  it("emits the data-widget/data-skin pair on both theme keys", () => {
    for (const themeKey of ["songoskriti", "somvabona"]) {
      const html = renderUnderTheme(demoSection(), themeKey);
      expect(html).toContain('data-widget="product_rail"');
      expect(html).toContain('data-skin="editorial"');
    }
    // Unkeyed (studio) path emits the same pair — skins key on attributes,
    // never on the widget knowing its theme.
    const plain = renderToStaticMarkup(
      <SectionRenderer section={newSection("product_rail")} locale="en" />,
    );
    expect(plain).toContain('data-widget="product_rail"');
    expect(plain).toContain('data-skin="editorial"');
  });

  it("has zero if-theme branches in the widget path", () => {
    const renderer = readFileSync(
      "src/components/builder/SectionRenderer.tsx",
      "utf8",
    );
    // The renderer forwards the key opaquely — it never names a theme.
    expect(renderer).not.toContain("songoskriti");
    expect(renderer).not.toContain("somvabona");

    // No widget or primitive in the rail path reads the theme key or
    // compares against a theme literal.
    for (const file of [
      "src/components/builder/merch.tsx",
      "src/components/builder/songoskriti.tsx",
      "src/components/builder/primitives/ProductCard.tsx",
      "src/components/builder/primitives/Rail.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, `${file} reads themeKey`).not.toContain("themeKey");
      expect(src, `${file} branches on songoskriti`).not.toContain(
        '"songoskriti"',
      );
      expect(src, `${file} branches on somvabona`).not.toContain(
        '"somvabona"',
      );
    }
  });
});
