import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SECTION_CATALOG, type FieldKind, type SectionType } from "./builder-ast";
import { WIDGET_REGISTRY, WIDGET_TYPES, widgetMeta } from "./widget-registry";

// Phase 2.1 split the chrome renderers into their own module, Phase 2.2 the
// merchandising ones and Phase 2.3 the product detail page; all four files make
// up the widget layer and each is held to the same theme-independence rules.
const WIDGETS_SRC =
  readFileSync("src/components/builder/widgets.tsx", "utf8") +
  readFileSync("src/components/builder/chrome.tsx", "utf8") +
  readFileSync("src/components/builder/merch.tsx", "utf8") +
  readFileSync("src/components/builder/beauty.tsx", "utf8") +
  readFileSync("src/components/builder/pdp.tsx", "utf8") +
  readFileSync("src/components/builder/collection.tsx", "utf8") +
  readFileSync("src/components/builder/cart.tsx", "utf8") +
  readFileSync("src/components/builder/apparel.tsx", "utf8") +
  readFileSync("src/components/builder/electronics.tsx", "utf8") +
  readFileSync("src/components/builder/basics.tsx", "utf8") +
  readFileSync("src/components/builder/blog.tsx", "utf8");
const RENDERER_SRC = readFileSync("src/components/builder/SectionRenderer.tsx", "utf8");

describe("widget registry — closed enum", () => {
  it("has exactly one entry per catalogue widget, and no extras", () => {
    const catalogue = SECTION_CATALOG.map((e) => e.type).sort();
    expect(WIDGET_TYPES.slice().sort()).toEqual(catalogue);
  });

  it("carries the inspector fields and slots of its catalogue entry", () => {
    for (const entry of SECTION_CATALOG) {
      const meta = widgetMeta(entry.type)!;
      expect(meta.fields, entry.type).toBe(entry.fields);
      expect(meta.slots, entry.type).toBe(entry.slots);
      expect(meta.container, entry.type).toBe(entry.container === true);
    }
  });

  it("declares typed inspector fields for every widget — no free-form JSON editing", () => {
    // Mirrors FieldKind exactly: no "json" / "raw" escape hatch may be added.
    const kinds = new Set<FieldKind>([
      "text",
      "textarea",
      "number",
      "select",
      "url",
      "boolean",
      "embed",
      "bitext",
      "color",
      "range",
      "image",
      "taxonomy",
      "unit",
      "group",
      "html",
      "array",
    ]);
    for (const meta of Object.values(WIDGET_REGISTRY)) {
      for (const field of meta.fields) {
        expect(kinds.has(field.kind as FieldKind), `${meta.type}.${field.key} kind=${field.kind}`).toBe(true);
      }
    }
  });

  it("gives every data widget a skeleton", () => {
    for (const meta of Object.values(WIDGET_REGISTRY)) {
      if (meta.data) expect(meta.skeleton, meta.type).toBe(true);
    }
  });

  it("only lets container widgets own children", () => {
    const containers = WIDGET_TYPES.filter((t) => WIDGET_REGISTRY[t].container);
    expect(containers.sort()).toEqual(["columns", "container"] satisfies SectionType[]);
  });
});

describe("widget renderers — theme independence", () => {
  it("has a renderer for every registered widget", () => {
    for (const type of WIDGET_TYPES) {
      // The map is a closed Record at type level; assert it at runtime too.
      expect(RENDERER_SRC.includes("WIDGET_COMPONENTS"), "renderer reads the registry map").toBe(true);
      expect(WIDGETS_SRC.includes(`${type}:`) || type === "columns", `${type} renderer`).toBe(true);
    }
  });

  it("imports no theme-specific module", () => {
    const imports = [...WIDGETS_SRC.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
    const themey = imports.filter((s) => /theme|preset|bazaar|atelier|circuit|rupaboti/i.test(s));
    expect(themey, `widgets.tsx imports ${themey.join(", ")}`).toEqual([]);
  });

  it("hardcodes no raw colour values — tokens only", () => {
    const hex = WIDGETS_SRC.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hex).toEqual([]);
    expect(WIDGETS_SRC).not.toMatch(/\b(?:text|bg|border)-(?:white|black)\b/);
  });
});
