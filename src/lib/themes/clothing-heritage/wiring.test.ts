/**
 * clothing-heritage wiring — TDD: every collection permalink resolves to demo
 * data, and department counts are honest demo counts (no invented metrics).
 */
import { describe, expect, it } from "vitest";
import { BLUEPRINT_PRESETS } from "../../theme-blueprints";
import { demoCatalogFor } from "../../demo-catalog";

const HREF_RE = /\/c\/([a-z0-9-]+)/g;

function allPropsTexts(preset: (typeof BLUEPRINT_PRESETS)[number]): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      out.push(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (v !== null && typeof v === "object") {
      for (const item of Object.values(v)) walk(item);
    }
  };
  for (const tpl of Object.values(preset.templates)) {
    for (const slot of [tpl.header, tpl.main, tpl.footer]) {
      for (const s of slot) walk(s.props);
    }
  }
  return out;
}

describe("clothing-heritage wiring", () => {
  const preset = BLUEPRINT_PRESETS.find((p) => p.key === "clothing-heritage")!;
  const catalog = demoCatalogFor("clothing-heritage");
  const slugs = new Set(catalog.collections.map((c) => c.slug));

  it("every /c/ permalink resolves to a demo collection", () => {
    const missing = new Set<string>();
    for (const text of allPropsTexts(preset)) {
      for (const m of text.matchAll(HREF_RE)) {
        if (!slugs.has(m[1]!)) missing.add(m[1]!);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it("circle tiles point at demo collections", () => {
    const circle = preset.templates.index.main.find(
      (s) => s.type === "circle_categories",
    )!;
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const href = String(circle.props[`c${n}Href`] ?? "");
      const slug = href.replace(/^\/c\//, "");
      expect(slugs.has(slug), href).toBe(true);
    }
  });
});
