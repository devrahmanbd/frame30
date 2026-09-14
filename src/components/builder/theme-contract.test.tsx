/**
 * Theme contract — every shipped preset × every template must render.
 *
 * TODO.md P1 asks for proof that a theme is not merely valid JSON but a page
 * a shopper can actually be served. The static preset tests already cover
 * parsing, linting and bilingual coverage; this one renders the real widget
 * tree through `SectionRenderer` and asserts the three things that make a
 * template shippable:
 *
 *   1. no section throws (a single bad widget would take the page down),
 *   2. the page claims at most one `<h1>` — route-h1 templates legitimately
 *      claim none, because the route supplies the heading,
 *   3. the markup is not empty, so a "rendered" template is never a blank div.
 *
 * Contexts are deliberately left unprovided: every provider used by the
 * renderer has a safe default, so this also proves a template survives a
 * cold render with no cart, no experiments and no widget data.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { SectionRenderer } from "./SectionRenderer";
import { TEMPLATE_KEYS, parseTemplates } from "@/lib/builder-ast";
import type { Section, TemplateKey } from "@/lib/builder-ast";
import { THEME_PRESETS } from "@/lib/theme-presets";
import { primarySectionId } from "@/components/store/ThemeChrome";

function renderTemplate(sections: Section[], template: TemplateKey, primaryId: string | null) {
  return renderToStaticMarkup(
    <>
      {sections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          template={template}
          storeSlug="contract-store"
          primary={section.id === primaryId}
        />
      ))}
    </>,
  );
}

const countH1 = (html: string) => (html.match(/<h1[\s>]/g) ?? []).length;

describe("theme contract: preset × template renders", () => {
  it("covers every shipped preset", () => {
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(10);
  });

  for (const preset of THEME_PRESETS) {
    describe(preset.key, () => {
      const parsed = parseTemplates(preset.templates);

      for (const template of TEMPLATE_KEYS) {
        it(`${template} renders without throwing, with at most one h1`, () => {
          const ast = parsed[template]!;
          const primaryId = primarySectionId(ast);

          const header = renderTemplate(ast.header, template, null);
          const main = renderTemplate(ast.main, template, primaryId);
          const footer = renderTemplate(ast.footer, template, null);
          const html = `${header}${main}${footer}`;

          expect(html.length).toBeGreaterThan(0);
          expect(countH1(html)).toBeLessThanOrEqual(1);
          // A failed widget boundary is contained rather than thrown, so the
          // only way to see one here is a genuinely broken preset node.
          expect(html).not.toContain("data-widget-failed");
        });
      }
    });
  }
});
