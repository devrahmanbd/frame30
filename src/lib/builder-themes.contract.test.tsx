/**
 * T4.3 §21 — theme + community-widget contracts (contract-level vitest suite).
 *
 * Covers, adapted from §21:
 *  1. community widget (plugin_block) install → builder → persist → theme
 *     render → theme switch (no brand leak, no crash)
 *  2. theme A/B same-widget-different-presentation — extends the
 *     DemoProductWidget proof pattern (see
 *     src/components/builder/demo-widget-proof.test.tsx), but on
 *     `product_grid` instead of `product_rail`, so the proof is extended,
 *     not duplicated
 *  3. broken theme → last-good/fallback (unknown key falls back to generic;
 *     unknown skins coerce to defaults; server keeps the last-good pin)
 *
 * Reuses: newSection, parseAst, withThemeWidgetDefaults, resolveSkin,
 * resolveWidgetComponent, GENERIC_WIDGETS, SONGOSKRITI_WIDGETS,
 * SectionRenderer + WidgetDataProvider.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import {
  newSection,
  parseAst,
  resolveSkin,
  withThemeWidgetDefaults,
} from "./builder-ast";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
import { WidgetDataProvider } from "@/components/builder/WidgetDataContext";
import { SONGOSKRITI_WIDGETS } from "@/components/builder/songoskriti";
import { GENERIC_WIDGETS } from "@/components/builder/widgets";
import { resolveWidgetComponent } from "@/components/builder/theme-widgets";
import type { WidgetRow } from "./widget-data";

const ROWS: WidgetRow[] = [
  {
    id: "t43-saree",
    title: "Dhakai Jamdani saree",
    href: "/p/t43-saree",
    priceMinor: 12500_00,
    currency: "BDT",
    imageUrl: "/ph/t43-saree.png",
    inStock: true,
  },
  {
    id: "t43-panjabi",
    title: "Silk panjabi",
    href: "/p/t43-panjabi",
    priceMinor: 4800_00,
    currency: "BDT",
    imageUrl: "/ph/t43-panjabi.png",
    inStock: true,
  },
];

/** ONE grid object shared by both theme renders (zero-AST-mutation proof). */
function gridSection() {
  return {
    ...newSection("product_grid"),
    id: "t43-proof-grid",
    props: {
      ...newSection("product_grid").props,
      heading: "T4.3 collection",
      limit: 8,
    },
  };
}

function renderUnderTheme(section: ReturnType<typeof gridSection>, themeKey: string) {
  const bundle = {
    requests: [{ key: "t43", source: "collection", params: {} }],
    byNode: { [section.id]: "t43" },
  };
  const map = { t43: ROWS };
  return renderToStaticMarkup(
    <WidgetDataProvider bundle={bundle as never} map={map as never}>
      <SectionRenderer section={section} themeKey={themeKey} locale="en" />
    </WidgetDataProvider>,
  );
}

describe("T4.3 themes — community widget install→persist→render→switch", () => {
  it("persists a plugin_block install through save without loss", () => {
    const node = {
      ...newSection("plugin_block"),
      id: "t43-plugin",
      props: { ...newSection("plugin_block").props },
    };
    const saved = parseAst({ header: [], main: [node], footer: [] });
    expect(saved.main).toHaveLength(1);
    expect(saved.main[0]!.type).toBe("plugin_block");
    expect(saved.main[0]!.invalid).toBeUndefined();
    // Round-trip stable: install survives every save.
    const again = parseAst(JSON.parse(JSON.stringify(saved)));
    expect(JSON.stringify(again)).toBe(JSON.stringify(saved));
  });

  it("renders the installed block on both themes without brand leak or crash", () => {
    const node = { ...newSection("plugin_block"), id: "t43-plugin" };
    const songo = renderToStaticMarkup(
      <SectionRenderer section={node} themeKey="songoskriti" locale="en" />,
    );
    const somva = renderToStaticMarkup(
      <SectionRenderer section={node} themeKey="somvabona" locale="en" />,
    );
    // Either a real render or the unavailable placeholder — never a throw,
    // and never one theme's brand inside the other's tree.
    expect(typeof songo).toBe("string");
    expect(typeof somva).toBe("string");
    expect(songo).not.toContain("somvabona");
    expect(somva).not.toContain("songoskriti");
  });

  it("theme defaults merge under authored props and reject unknown keys", () => {
    const merged = withThemeWidgetDefaults(
      "product_grid",
      { heading: "Authored", skin: "rows" },
      { product_grid: { skin: "cards", limit: 12 } },
    );
    expect(merged["skin"]).toBe("rows");
    expect(merged["heading"]).toBe("Authored");
    expect(merged["limit"]).toBe(12);
    const hostile = withThemeWidgetDefaults(
      "product_grid",
      {},
      { product_grid: { skin: "rows", evil: "x" } },
    );
    expect(hostile).not.toHaveProperty("evil");
  });
});

describe("T4.3 themes — A/B: same product_grid data, two presentations", () => {
  it("resolves the same key to different renderers by theme key", () => {
    const songo = resolveWidgetComponent("songoskriti", "product_grid");
    const somva = resolveWidgetComponent("somvabona", "product_grid");
    expect(songo).toBe(SONGOSKRITI_WIDGETS.product_grid);
    expect(somva).toBe(GENERIC_WIDGETS.product_grid);
    expect(somva).not.toBe(songo);
    expect(songo).toBeDefined();
    expect(somva).toBeDefined();
  });

  it("renders structurally different markup from the same section + rows", () => {
    const section = gridSection();
    const before = JSON.stringify(section);
    const songo = renderUnderTheme(section, "songoskriti");
    const somva = renderUnderTheme(section, "somvabona");
    expect(songo.length).toBeGreaterThan(0);
    expect(somva.length).toBeGreaterThan(0);
    expect(songo).not.toBe(somva);
    // Zero AST mutation: the shared object is byte-identical after both.
    expect(JSON.stringify(section)).toBe(before);
  });

  it("keeps identical data content under both presentations", () => {
    const section = gridSection();
    const songo = renderUnderTheme(section, "songoskriti");
    const somva = renderUnderTheme(section, "somvabona");
    for (const html of [songo, somva]) {
      expect(html).toContain("T4.3 collection");
      for (const row of ROWS) {
        expect(html).toContain(row.title);
        expect(html).toContain(row.imageUrl as string);
      }
      expect(html).toContain('data-widget="product_grid"');
    }
  });

  it("theme-widgets.ts stays the only place that names themes", () => {
    const renderer = readFileSync(
      "src/components/builder/SectionRenderer.tsx",
      "utf8",
    );
    expect(renderer).not.toContain("songoskriti");
    expect(renderer).not.toContain("somvabona");
    const registry = readFileSync(
      "src/components/builder/theme-widgets.ts",
      "utf8",
    );
    expect(registry).toContain("songoskriti");
    expect(registry).toContain("somvabona");
  });
});

describe("T4.3 themes — broken theme → last-good/fallback", () => {
  it("an unknown theme key falls back to generic, never to another brand", () => {
    const resolved = resolveWidgetComponent("nope-theme", "product_grid");
    expect(resolved).toBe(GENERIC_WIDGETS.product_grid);
    expect(resolved).not.toBe(SONGOSKRITI_WIDGETS.product_grid);
    // A theme-only key with no generic renderer resolves to undefined so
    // the caller renders the unavailable placeholder — never brand.
    expect(
      resolveWidgetComponent("nope-theme", "testimonials"),
    ).toBeUndefined();
  });

  it("unknown stored skins coerce to defaults instead of breaking render", () => {
    expect(resolveSkin("product_grid", "neon")).toBe("cards");
    expect(resolveSkin("product_rail", "")).toBe("editorial");
    const html = renderToStaticMarkup(
      <SectionRenderer
        section={{
          ...newSection("product_grid"),
          props: { ...newSection("product_grid").props, skin: "neon" },
        }}
        locale="en"
      />,
    );
    expect(html).toContain('data-skin="cards"');
  });

  it("the server keeps a last-good pin with a builtin fallback (pinned wiring)", () => {
    // Read-only pin: publishedTheme serves the most recent prior published
    // pin when the pointer dangles, else the $fallback builtin.
    const src = readFileSync("src/lib/themes.server.ts", "utf8");
    expect(src).toContain("lastGoodVersion");
    expect(src).toContain("prior_pin");
    expect(src).toContain("builtin");
  });
});
