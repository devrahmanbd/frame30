/**
 * T4.3 §21 — built-in widget lifecycle contract (contract-level vitest suite;
 * no Playwright, no .e2e/ infra — none exists in this repo).
 *
 * Covers the §21 scenarios adapted to pure/SSR contracts:
 *  1. built-in widget builder → save → preview → publish → render
 *  2. authored-data round trip (persist-shape rule)
 *  3. broken widget → placeholder + page still renders (200-equivalent)
 *  4. lint publish gate (errors block, warnings stay advisory)
 *
 * Reuses the existing builders/validators only: newSection, parseAst,
 * parseTemplates, lintTemplate, flattenAst, templateOf, resolveTemplate,
 * WidgetBoundary, SectionRenderer.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  flattenAst,
  lintTemplate,
  newSection,
  parseAst,
  parseTemplates,
  resolveTemplate,
  templateOf,
  type Section,
  type ThemeAst,
} from "./builder-ast";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
import { WidgetBoundary } from "@/components/builder/WidgetBoundary";

function shell(section: Section): string {
  return renderToStaticMarkup(<SectionRenderer section={section} locale="en" />);
}

describe("T4.3 lifecycle — built-in widget builder→save→preview→publish→render", () => {
  it("builds a heading + product grid page that survives save and previews clean", () => {
    // BUILD (editor): merchant drops two built-in widgets on the canvas.
    const heading = {
      ...newSection("heading"),
      id: "lc-heading",
      props: { ...newSection("heading").props, text: "Festive edit" },
    };
    const grid = {
      ...newSection("product_grid"),
      id: "lc-grid",
      props: {
        ...newSection("product_grid").props,
        heading: "New in",
        limit: 8,
      },
    };
    const draft: ThemeAst = { header: [], main: [heading, grid], footer: [] };

    // SAVE: serialise → parse (the server path). Unknown props are dropped,
    // catalog props + bitext twins survive.
    const saved = parseAst(JSON.parse(JSON.stringify(draft)));
    expect(saved.main.map((s) => s.type)).toEqual(["heading", "product_grid"]);
    expect(saved.main[0]!.props["text"]).toBe("Festive edit");
    expect(saved.main[1]!.props["heading"]).toBe("New in");

    // PREVIEW: lint is clean (no errors), so preview may render.
    const issues = lintTemplate(saved, "index");
    expect(issues.filter((i) => i.level === "error")).toEqual([]);

    // PUBLISH: template resolves through the fallback chain, never blank.
    const templates = parseTemplates({ index: saved });
    const { ast, match } = resolveTemplate(templates, "index");
    expect(match).toBe("base");
    expect(templateOf(templates, "index").main).toHaveLength(2);
    expect(flattenAst(ast).map((s) => s.id)).toEqual(["lc-heading", "lc-grid"]);

    // RENDER: the storefront path renders both widgets with authored copy.
    const html = renderToStaticMarkup(
      <>
        {ast.main.map((s) => (
          <SectionRenderer key={s.id} section={s} locale="en" />
        ))}
      </>,
    );
    expect(html).toContain("Festive edit");
    expect(html).toContain("New in");
  });

  it("blocks publish on lint errors while warnings stay advisory", () => {
    // Two h1 claimants is an error → publish gate must refuse.
    const a = { ...newSection("hero"), id: "lc-a" };
    const b = { ...newSection("hero"), id: "lc-b" };
    const errors = lintTemplate({ header: [], main: [a, b], footer: [] }, "index");
    expect(
      errors.some((i) => i.level === "error" && /<h1>/.test(i.message)),
    ).toBe(true);

    // An empty container is a warning only — publish stays open.
    const empty = { ...newSection("container"), id: "lc-empty" };
    const warns = lintTemplate(
      { header: [], main: [{ ...newSection("heading"), id: "lc-h" }, empty], footer: [] },
      "index",
    );
    expect(warns.some((i) => i.level === "warn" && /Empty container/.test(i.message))).toBe(
      true,
    );
    expect(
      warns.filter((i) => i.level === "error" && /Empty container/.test(i.message)),
    ).toEqual([]);
  });
});

describe("T4.3 lifecycle — authored-data round trip (persist-shape rule)", () => {
  it("is byte-stable across serialise→parse→serialise, twins included", () => {
    const section = {
      ...newSection("announcement_bar"),
      id: "lc-ann",
      props: {
        ...newSection("announcement_bar").props,
        m1: "Cash on delivery",
        m1_bn: "ক্যাশ অন ডেলিভারি",
      },
    };
    const once = parseAst({ header: [section], main: [], footer: [] });
    const twice = parseAst(JSON.parse(JSON.stringify(once)));
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    expect(twice.header[0]!.props["m1"]).toBe("Cash on delivery");
    expect(twice.header[0]!.props["m1_bn"]).toBe("ক্যাশ অন ডেলিভারি");
  });

  it("drops smuggled props and re-suffixes duplicate ids", () => {
    const base = newSection("heading");
    const parsed = parseAst({
      header: [],
      main: [
        { ...base, id: "dup", props: { ...base.props, evil: "x" } },
        { ...base, id: "dup", props: { ...base.props } },
      ],
      footer: [],
    });
    expect(parsed.main[0]).not.toHaveProperty("props.evil");
    expect(parsed.main[0]!.props).not.toHaveProperty("evil");
    // Later duplicate gets a fresh suffixed id — never a shadow.
    expect(parsed.main[1]!.id).not.toBe("dup");
    expect(parsed.main[1]!.id.startsWith("dup")).toBe(true);
  });
});

describe("T4.3 lifecycle — broken widget → placeholder, page still renders", () => {
  it("parses an unknown widget into an invalid placeholder, never a crash", () => {
    const parsed = parseAst({
      header: [],
      main: [{ id: "lc-broken", type: "nope_widget", props: {} }],
      footer: [],
    });
    expect(parsed.main).toHaveLength(1);
    expect(parsed.main[0]!.invalid).toMatch(/^unknown_widget:/);
  });

  it("skips the broken node in production while siblings render (200-equivalent)", () => {
    const parsed = parseAst({
      header: [],
      main: [
        { id: "lc-broken", type: "nope_widget", props: {} },
        { ...newSection("heading"), id: "lc-ok", props: { ...newSection("heading").props, text: "Still here" } },
      ],
      footer: [],
    });
    const html = renderToStaticMarkup(
      <>
        {parsed.main.map((s) => (
          <SectionRenderer key={s.id} section={s} locale="en" />
        ))}
      </>,
    );
    // Broken node renders nothing; the sibling and its copy survive.
    expect(html).toContain("Still here");
    // The editor path surfaces the problem inline instead of blanking.
    const editing = renderToStaticMarkup(
      <SectionRenderer section={parsed.main[0]!} locale="en" editing />,
    );
    expect(editing).toContain("Unsupported widget");
  });

  it("contains a throwing widget to its own node via WidgetBoundary", () => {
    // Error → failed state carrying the message.
    expect(WidgetBoundary.getDerivedStateFromError(new Error("boom"))).toEqual({
      failed: true,
      message: "boom",
    });
    // Storefront placeholder reserves space and is queryable; page markup
    // around it is untouched.
    const store = new WidgetBoundary({ type: "product_rail", children: null });
    store.state = { failed: true, message: "boom" };
    const healthy = {
      ...newSection("heading"),
      props: { ...newSection("heading").props, text: "Boundary ok" },
    };
    expect(shell(healthy)).toContain("Boundary ok");
    expect(
      renderToStaticMarkup(store.render() as React.ReactElement),
    ).toContain('data-widget-failed="product_rail"');
  });
});
