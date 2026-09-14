import { describe, expect, it } from "vitest";
import { TEMPLATE_KEYS, biTextKeysOf, lintTemplate, parseTemplates, parseTokens } from "./builder-ast";
import type { Section } from "./builder-ast";
import { bnKey } from "./bitext";
import { THEME_PRESETS } from "./theme-presets";

/** Walks a section tree, including nested container children. */
function walk(section: Section, visit: (node: Section) => void) {
  visit(section);
  for (const child of section.children ?? []) walk(child, visit);
}

describe("official theme presets", () => {
  it("ships fourteen themes with unique keys and sort order", () => {
    expect(THEME_PRESETS).toHaveLength(14);
    const keys = new Set(THEME_PRESETS.map((p) => p.key));
    expect(keys.size).toBe(14);
  });

  for (const preset of THEME_PRESETS) {
    describe(preset.key, () => {
      it("keeps tokens inside the design system", () => {
        expect(parseTokens(preset.tokens)).toEqual(preset.tokens);
      });

      it("defines every template", () => {
        expect(Object.keys(preset.templates).sort()).toEqual([...TEMPLATE_KEYS].sort());
      });

      it("survives AST parsing without dropping sections", () => {
        const parsed = parseTemplates(preset.templates);
        for (const key of TEMPLATE_KEYS) {
          const source = preset.templates[key];
          const out = parsed[key]!;
          expect(out.header).toHaveLength(source.header.length);
          expect(out.main).toHaveLength(source.main.length);
          expect(out.footer).toHaveLength(source.footer.length);
          expect([...out.header, ...out.main, ...out.footer].some((s) => s.invalid)).toBe(false);
        }
      });

      it("lints clean on every template", () => {
        const parsed = parseTemplates(preset.templates);
        for (const key of TEMPLATE_KEYS) {
          // Phase 5: no allow-list. `ROUTE_H1_TEMPLATES` declares which
          // templates get their <h1> from route data, so lint is clean as-is.
          expect(lintTemplate(parsed[key]!, key)).toEqual([]);
        }
      });

      it("uses globally unique section ids", () => {
        const ids = Object.values(preset.templates).flatMap((ast) => [
          ...ast.header,
          ...ast.main,
          ...ast.footer,
        ]).map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it("keeps বাংলা coverage above the publish gate", () => {
        let total = 0;
        let translated = 0;
        for (const ast of Object.values(preset.templates))
          for (const section of [...ast.header, ...ast.main, ...ast.footer])
            walk(section, (node) => {
              for (const key of biTextKeysOf(node.type)) {
                const en = node.props?.[key];
                if (typeof en !== "string" || !en.trim()) continue;
                total += 1;
                if (String(node.props?.[bnKey(key)] ?? "").trim()) translated += 1;
              }
            });
        const coverage = total === 0 ? 1 : translated / total;
        expect(coverage).toBeGreaterThanOrEqual(0.9);
      });
    });
  }
});
