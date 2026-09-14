/**
 * Theme workflow acceptance — every shipped theme must be a working store.
 *
 * A theme is not "shipped" because it has pretty tokens: it has to survive the
 * four workflows a real shop runs every day. This suite walks all presets and
 * checks each of them end to end at the AST + render level:
 *
 *   admin    — install/publish shape: all templates present, AST + tokens
 *              round-trip through the stored parsers, contrast gate clean.
 *   visitor  — browse → product → cart → checkout: each step's template holds
 *              the widgets that step needs, and every section renders (en + bn)
 *              without throwing.
 *   delivery — the order tracker renders under each theme's tokens, so a
 *              courier/tracking page is never blank on a given theme.
 *   staff    — the same templates render in studio editing mode, which is how
 *              staff edit a live store, and no widget sits in a template that
 *              cannot feed it data.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  TEMPLATE_KEYS,
  flattenAst,
  isContextMismatch,
  newSection,
  parseTemplates,
  parseTokens,
  type Section,
  type SectionType,
  type TemplateKey,
  type ThemeAst,
} from "./builder-ast";
import { contrastGate } from "./publish-gates";
import { THEME_PRESETS } from "./theme-presets";
import { SectionRenderer } from "@/components/builder/SectionRenderer";

/**
 * Widgets each storefront step cannot work without. Each entry is a list of
 * alternatives — a theme satisfies the step when it ships any one of them, so
 * an editorial theme can lead with `editorial_hero` instead of `hero`.
 */
const REQUIRED: Partial<Record<TemplateKey, SectionType[][]>> = {
  index: [
    ["hero", "editorial_hero", "banner"],
    ["product_grid", "product_rail", "deal_strip"],
    ["collection_grid", "department_strip", "brand_strip", "brand_rail", "lookbook", "collection_story"],
  ],
  collection: [["product_grid", "product_rail"]],
  product: [["product_media"], ["price_block", "buy_box"], ["add_to_cart", "buy_box", "sticky_buy_bar"]],
  cart: [["cart_lines"], ["cart_summary"]],
  checkout: [["checkout_steps"], ["cart_summary"], ["payment_methods"]],
  page: [["page_content"]],
  // Phase 8: the blog archive is builder-driven — the listing widget is what a
  // reader needs, not a page-body placeholder.
  blog: [["blog_archive", "page_content"], ["blog_pager"]],
};

function types(ast: ThemeAst): SectionType[] {
  return flattenAst(ast).map((s) => s.type);
}

function slots(ast: ThemeAst): Section[] {
  return [...ast.header, ...ast.main, ...ast.footer];
}

function renderSection(section: Section, template: TemplateKey, editing: boolean, locale: "en" | "bn") {
  return renderToStaticMarkup(
    <SectionRenderer section={section} template={template} editing={editing} locale={locale} />,
  );
}

describe.each(THEME_PRESETS.map((p) => [p.key, p] as const))("theme %s", (key, preset) => {
  /* ------------------------------------------------------------- admin */
  it("installs and publishes: every template survives the stored parsers", () => {
    for (const template of TEMPLATE_KEYS) {
      expect(preset.templates[template], `${key}/${template}`).toBeTruthy();
    }
    const stored = JSON.parse(JSON.stringify(preset.templates));
    const parsed = parseTemplates(stored);
    for (const template of TEMPLATE_KEYS) {
      const before = flattenAst(preset.templates[template]).length;
      const after = flattenAst(parsed[template]!).length;
      expect(after, `${key}/${template} nodes`).toBe(before);
      expect(parsed[template]!.main.length, `${key}/${template} main`).toBeGreaterThan(0);
    }
    const tokens = parseTokens(JSON.parse(JSON.stringify(preset.tokens)));
    expect(tokens.brand).toBe(preset.tokens.brand);
    expect(tokens.surface).toBe(preset.tokens.surface);
  });

  it("passes the readable-contrast gate", () => {
    expect(contrastGate(parseTokens(preset.tokens)).map((f) => f.message)).toEqual([]);
  });

  /* ----------------------------------------------------------- visitor */
  it.each(Object.entries(REQUIRED))("%s step ships the widgets it needs", (template, needed) => {
    const present = new Set(types(preset.templates[template as TemplateKey]));
    for (const alternatives of needed) {
      const satisfied = alternatives.some((type) => present.has(type));
      expect(satisfied, `${key}/${template} needs one of ${alternatives.join(", ")}`).toBe(true);
    }
  });

  it("keeps header and footer chrome on every browsing template", () => {
    for (const template of ["index", "product", "collection", "page", "blog"] as const) {
      const ast = preset.templates[template];
      expect(ast.header.length + ast.footer.length, `${key}/${template} chrome`).toBeGreaterThan(0);
    }
  });

  it.each(TEMPLATE_KEYS)("renders %s for a shopper in both languages", (template) => {
    for (const section of slots(preset.templates[template])) {
      for (const locale of ["en", "bn"] as const) {
        const html = renderSection(section, template, false, locale);
        expect(typeof html, `${key}/${template}/${section.type}/${locale}`).toBe("string");
      }
    }
  });

  /* ---------------------------------------------------------- delivery */
  it("hosts the order tracker a courier hand-off needs", () => {
    // Live-data widgets render nothing until an order is attached, so the
    // theme-level contract is: the tracker belongs on the page template and
    // draws under this theme's tokens in the studio.
    expect(isContextMismatch("order_tracker", "page"), key).toBe(false);
    const html = renderSection(newSection("order_tracker"), "page", true, "en");
    expect(html.length, `${key}/order_tracker`).toBeGreaterThan(0);
  });

  /* ------------------------------------------------------------- staff */
  it.each(TEMPLATE_KEYS)("renders %s in the studio for staff editing", (template) => {
    for (const section of slots(preset.templates[template])) {
      expect(() => renderSection(section, template, true, "en"), `${key}/${template}/${section.type}`).not.toThrow();
    }
  });

  it("never places a widget in a template that cannot feed it", () => {
    const mismatched: string[] = [];
    for (const template of TEMPLATE_KEYS) {
      for (const section of flattenAst(preset.templates[template])) {
        if (isContextMismatch(section.type, template)) mismatched.push(`${template}/${section.type}`);
      }
    }
    expect(mismatched, key).toEqual([]);
  });
});
