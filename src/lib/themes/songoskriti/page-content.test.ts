/**
 * Phase 1 — the theme's `page` template declares the route's content slot.
 *
 * `page_content` is a CONTEXT widget: the HOST hands the template its body.
 * Until the theme's `page` main declared that section, the theme carried its
 * own demo copy ("Size guide" / "How to measure" / "Demo article") in the
 * place where a merchant's CMS body belongs — and `ThemeChrome` skipped the
 * theme's layout entirely for the CMS page route, because the template never
 * declared the slot the route named.
 *
 * `page` is a route-h1 template: the route owns the `<h1>`, so the template
 * elects no primary section and declares no heading-bearing section at all.
 */
import { describe, expect, it } from "vitest";
import {
  lintTemplate,
  primarySectionId,
  routeSuppliesH1,
  type SectionBuilder,
} from "../../builder-ast";
import { genericDemoMain } from "../../theme-preview-nav";
import { songoskritiPreviewSource } from "./preview";

/**
 * The plain builder the engine uses (`assemblePreviewTemplates`,
 * `src/lib/theme-preview-nav.ts:384-391`). The theme's own
 * `withSongoskritiDefaults` / `withSongoskritiVariation` wrap happens
 * INSIDE `main` (`src/lib/themes/songoskriti/preview.ts:89`), so this is
 * the builder the theme actually authors through.
 */
function plainBuilder(): SectionBuilder {
  let n = 0;
  return (type, props = {}) => ({
    id: `${type}-${n++}`,
    type,
    props: { ...props },
  });
}

/** The theme's real `page` main, authored the way the engine authors it. */
function pageMain() {
  return songoskritiPreviewSource().main("page", plainBuilder()) ?? [];
}

describe("Songoskriti page template — the route's content slot", () => {
  it("declares exactly [breadcrumb, page_content] in that order", () => {
    const types = pageMain().map((x) => x.type);
    // Not a containment check: this pins the content slot exactly once, the
    // breadcrumb slot, and the ORDER (the breadcrumb opens the body, the
    // route's furniture survives above the merchant's content).
    expect(types).toEqual(["breadcrumb", "page_content"]);
  });

  it("carries none of the old demo copy", () => {
    const serialised = JSON.stringify(pageMain());
    expect(serialised).not.toContain("Size guide");
    expect(serialised).not.toContain("How to measure");
    expect(serialised).not.toContain("Demo article");
  });

  it("lints clean with the template key passed", () => {
    // The key is what enables the route-h1 exemption — this plan's contract
    // is the KEYED lint, not the unkeyed one.
    const ast = { header: [], main: pageMain(), footer: [] };
    expect(lintTemplate(ast, "page")).toEqual([]);
  });

  it("elects no primary section: the route supplies the h1", () => {
    const ast = { header: [], main: pageMain(), footer: [] };
    expect(routeSuppliesH1("page")).toBe(true);
    expect(primarySectionId(ast)).toBeNull();
  });

  it("opens with the breadcrumb, matching the preview-nav opener map", () => {
    // One fact, pinned from two sides: this pins the composition, the
    // preview-nav suite pins the opener (`FIRST_SECTION.page`), and this
    // ties the two to the same first section so they cannot drift apart.
    expect(pageMain()[0]!.type).toBe("breadcrumb");
  });

  it("is no longer structurally the engine's generic demo body", () => {
    const types = pageMain().map((x) => x.type);
    expect(types).not.toEqual(
      genericDemoMain("page", plainBuilder()).map((x) => x.type),
    );
  });

  it("contains no heading-bearing section", () => {
    // `primarySectionId(ast) === null` alone is not enough: a `heading`
    // section with an EMPTY `text` would not be elected, yet a merchant
    // editing that template can type into it and be elected on the next
    // render — producing a second <h1> next to the route's own.
    const ast = { header: [], main: pageMain(), footer: [] };
    expect(
      ast.main
        .filter(
          (x) =>
            x.type === "heading" ||
            (typeof x.props["heading"] === "string" &&
              x.props["heading"] !== ""),
        )
        .map((x) => x.type),
    ).toEqual([]);
  });
});
