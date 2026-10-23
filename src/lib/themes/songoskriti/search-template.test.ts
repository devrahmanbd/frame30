/**
 * Songoskriti `search` template — the theme's authored composition, and the
 * theme's live-capable presentation.
 *
 * Two contracts live here.
 *
 * **1 — The composition.** The theme owns *composition*: which sections, in
 * which order, with which copy. The platform owns *data*: it executes the
 * query, authorizes the tenant and prices the results
 * (`src/routes/store.$slug.search.tsx:42-105`), and it hands the theme one
 * opaque block (`productSlot`, `:559`). So the search body is built from the
 * platform's own search widgets and carries **no** authored copy of them —
 * a theme that authors its own query box, summary and labels duplicates the
 * platform's surface (Review Focus 2).
 *
 * **2 — The presentation.** On the `search` template the theme's `product_grid`
 * renders the host's results block; on every other template it keeps the
 * theme's own row grid (the collection route passes a differently-shaped slot
 * and must not lose its styled cards). The theme's `result_toolbar` reads the
 * **live** collection query — count and sort links — and carries no
 * hard-coded taxonomy, because Task 9 grants that widget on the live
 * storefront.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  catalogEntry,
  lintTemplate,
  newSection,
  primarySectionId,
  routeSuppliesH1,
  type Section,
  type SectionBuilder,
  type ThemeAst,
} from "../../builder-ast";
import { genericDemoMain } from "../../theme-preview-nav";
import { normalizeSearchParams } from "../../storefront-search";
import { songoskritiPreviewSource } from "./preview";
import { SONGOSKRITI_WIDGETS } from "../../../components/builder/songoskriti";
import { CollectionQueryProvider } from "../../../components/builder/collection";
import {
  widgetReader,
  type WidgetComponent,
  type WidgetCtx,
} from "../../../components/builder/widgets";

/** The plain builder the engine uses — the theme's own default/variation
 *  wrap happens INSIDE `main` (`src/lib/themes/songoskriti/preview.ts:89`). */
function plainBuilder(): SectionBuilder {
  let n = 0;
  return (type, props = {}) => ({
    id: `${type}-${n++}`,
    type,
    props: { ...props },
  });
}

function searchMain(): Section[] {
  return songoskritiPreviewSource().main("search", plainBuilder())!;
}

function searchAst(): ThemeAst {
  return { header: [], main: searchMain(), footer: [] };
}

const types = searchMain().map((section) => section.type);

/** A widget ctx the way `SectionRenderer` builds one for the storefront. */
function ctxFor(section: Section, extra: Partial<WidgetCtx> = {}): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, "en"),
    Heading: "h2",
    primary: false,
    editing: false,
    locale: "en",
    storeSlug: "songoskriti",
    data: { rows: undefined, pending: false },
    renderChildren: () => null,
    link: (href: string) => href,
    ...extra,
  };
}

function renderWidget(
  Cmp: WidgetComponent,
  section: Section,
  extra: Partial<WidgetCtx> = {},
): string {
  return renderToStaticMarkup(
    createElement(
      Cmp as (p: WidgetCtx) => React.ReactElement,
      ctxFor(section, extra),
    ),
  );
}

describe("songoskriti search template composition", () => {
  it("authors the platform's search widgets in the exact order", () => {
    // One assertion, four facts: the results grid is present, the six
    // platform search widgets are present, the empty state is present, and
    // the body carries no authored copy of the platform's pieces.
    expect(types).toEqual([
      "category_header",
      "result_toolbar",
      "facet_sidebar",
      "filter_chips",
      "product_grid",
      "pagination",
      "empty_state",
    ]);
  });

  it("carries no authored copy of the platform's listing", () => {
    // The route owns the query box, the result summary and every label
    // (`src/routes/store.$slug.search.tsx:186-529`).
    expect(types).not.toContain("rich_text");
    expect(types).not.toContain("heading");
  });

  it("has zero lint errors on the search template", () => {
    // The template key is passed — the keyed form is the contract. Errors
    // are the composition-breaking findings (a second <h1> claimant, a
    // context mismatch, an unsupported widget). The warn level is the
    // platform's translation-coverage finding, which is a bilingual-content
    // concern and not this file's bar.
    expect(
      lintTemplate(searchAst(), "search").filter((i) => i.level === "error"),
    ).toEqual([]);
  });

  it("claims the page's h1 exactly once", () => {
    // The route's <h1> lives in its `fallback`
    // (`src/routes/store.$slug.search.tsx:531-534`), which is NOT rendered
    // when the theme publishes a body
    // (`src/components/store/ThemeChrome.tsx:400-421`) — so the theme's body
    // must claim the page's h1.
    expect(routeSuppliesH1("search")).toBe(true);
    expect(primarySectionId(searchAst())).not.toBeNull();
  });

  it("uses only section types allowed on the search template", () => {
    for (const section of searchMain()) {
      const templates = catalogEntry(section.type)!.templates;
      if (!templates) continue;
      expect(
        templates,
        `${section.type} must allow the search template`,
      ).toContain("search");
    }
  });

  it("is no longer the engine's generic demo body", () => {
    expect(types).not.toEqual(
      genericDemoMain("search", plainBuilder()).map((x) => x.type),
    );
  });

  it("carries no demo marker", () => {
    const serialised = JSON.stringify(searchMain().map((s) => s.props));
    expect(serialised).not.toContain("Demo search");
    expect(serialised).not.toContain("Live search runs on the storefront");
    expect(serialised).not.toContain("Demo");
  });

  it("names every prop, and names the ones a merchant cannot edit", () => {
    // (a) Every section carries at least one editable catalogue field, so a
    // merchant can edit each widget in the builder. The list is read PER
    // widget type from the catalogue — not a hard-coded union — so a widget
    // whose fields change cannot silently pass.
    for (const section of searchMain()) {
      const fields = catalogEntry(section.type)!.fields.map((f) => f.key);
      const authored = Object.keys(section.props);
      expect(
        authored.some((key) => fields.includes(key)),
        `${section.type} must expose an editable catalogue field`,
      ).toBe(true);
    }

    // (b) The exact prop-key set of every section is pinned, so no prop can
    // be added or dropped without failing.
    const propKeys = new Map(
      searchMain().map((section) => [
        section.type,
        Object.keys(section.props).sort(),
      ]),
    );
    expect(propKeys.get("category_header")).toEqual([
      "body",
      "body_bn",
      "description",
      "description_bn",
      "heading",
      "heading_bn",
      "homeLabel",
      "homeLabel_bn",
      "text",
      "text_bn",
    ]);
    expect(propKeys.get("result_toolbar")).toEqual([
      "countLabel",
      "countLabel_bn",
      "filtersLabel",
      "filtersLabel_bn",
      "sortDefault",
      "sortLabel",
      "sortLabel_bn",
    ]);
    // §(s.8) Lane A: the seven facet group labels + their বাংলা twins are now
    // authored pairs (the pin GROWS to the exact new set — nothing dropped).
    expect(propKeys.get("facet_sidebar")).toEqual([
      "categoryLabel",
      "categoryLabel_bn",
      "clearLabel",
      "clearLabel_bn",
      "collapsed",
      "drawerLabel",
      "drawerLabel_bn",
      "heading",
      "heading_bn",
      "inStockLabel",
      "inStockLabel_bn",
      "kindLabel",
      "kindLabel_bn",
      "limit",
      "priceLabel",
      "priceLabel_bn",
      "showCategories",
      "showKinds",
      "stockLabel",
      "stockLabel_bn",
    ]);
    expect(propKeys.get("filter_chips")).toEqual([
      "clearLabel",
      "clearLabel_bn",
    ]);
    expect(propKeys.get("product_grid")).toEqual([
      "columns",
      "heading",
      "heading_bn",
      "limit",
      "skin",
    ]);
    // §(s.8) Lane A: the load-more / prev / next labels + বাংলা twins are
    // authored pairs (the pin GROWS to the exact new set — nothing dropped).
    expect(propKeys.get("pagination")).toEqual([
      "mode",
      "moreLabel",
      "moreLabel_bn",
      "nextLabel",
      "nextLabel_bn",
      "pageLabel",
      "pageLabel_bn",
      "prevLabel",
      "prevLabel_bn",
    ]);
    expect(propKeys.get("empty_state")).toEqual([
      "body",
      "body_bn",
      "clearLabel",
      "clearLabel_bn",
      "heading",
      "heading_bn",
      "limit",
    ]);

    // (c) The props OUTSIDE the catalogue field lists are asserted as an
    // exact set. It is now EMPTY: every prop the search composition authors
    // is a declared catalogue field, so a merchant editing these widgets in
    // the builder sees all of them and the sanitiser drops none of them.
    // (Before the final-fix round the set was five —
    // `category_header:text` / `text_bn` / `description` / `description_bn`
    // and `result_toolbar:sortDefault` — and every one of those five was
    // silently dropped on save.)
    //
    // A `bitext` field's বাংলা sibling counts as DECLARED: the platform's
    // own bilingual mechanism carries it (`withBiText`,
    // `src/lib/builder-ast.ts:6505-6521`), and the inspector edits it.
    const outside: string[] = [];
    for (const section of searchMain()) {
      const fields = catalogEntry(section.type)!.fields;
      const declared = new Set(fields.map((f) => f.key));
      for (const f of fields) {
        if (f.kind === "bitext") declared.add(`${f.key}_bn`);
      }
      for (const key of Object.keys(section.props)) {
        if (!declared.has(key)) outside.push(`${section.type}:${key}`);
      }
    }
    expect(outside).toEqual([]);
  });
});

describe("songoskriti search presentation", () => {
  it("renders the host's results on the search template", () => {
    const grid = newSection("product_grid");
    const html = renderWidget(SONGOSKRITI_WIDGETS.product_grid, grid, {
      template: "search",
      productSlot: createElement("ul", { id: "HOST-SLOT-MARKER" }),
      data: { rows: undefined, pending: false },
    });
    // The platform's results slot wins: the search route hands the theme
    // ONE opaque block (`productSlot`,
    // `src/routes/store.$slug.search.tsx:559`) and on the search template
    // that block IS the result set.
    expect(html).toContain("HOST-SLOT-MARKER");

    // The theme's toolbar shows the shopper's LIVE count and the REAL sort
    // href, and carries no hard-coded taxonomy — this is what makes Task 9's
    // storefront grant of `result_toolbar` safe (Review Focus 3).
    const toolbar = newSection("result_toolbar");
    const toolbarHtml = renderToStaticMarkup(
      createElement(
        CollectionQueryProvider,
        {
          value: {
            params: normalizeSearchParams({ q: "jamdani" }),
            total: 24,
            basePath: "/store/songoskriti/search",
          },
        },
        createElement(
          SONGOSKRITI_WIDGETS.result_toolbar as (
            p: WidgetCtx,
          ) => React.ReactElement,
          ctxFor(toolbar),
        ),
      ),
    );
    expect(toolbarHtml).toContain("24");
    expect(toolbarHtml).toContain("/store/songoskriti/search?q=jamdani");
    expect(toolbarHtml).toContain("sort=price_asc");
    for (const taxonomy of [
      "Sarees",
      "Panjabi",
      "Jewellery",
      "Festive",
      "Wedding",
      "Eid",
    ]) {
      expect(toolbarHtml).not.toContain(taxonomy);
    }
  });

  it("keeps the theme's own grid on the collection template (guard)", () => {
    // This case is a GUARD: it passes before and after the change, and it
    // exists to fail if the host slot is ever honoured everywhere. The
    // collection route passes a differently-shaped slot
    // (`src/routes/store.$slug.c.$collectionSlug.tsx:220`) and must keep its
    // styled cards.
    const grid = newSection("product_grid");
    const html = renderWidget(SONGOSKRITI_WIDGETS.product_grid, grid, {
      template: "collection",
      productSlot: createElement("ul", { id: "HOST-SLOT-MARKER" }),
      data: {
        rows: [
          {
            id: "p1",
            title: "Row product",
            subtitle: "Women",
            priceMinor: 1850000,
            currency: "BDT",
          },
        ],
        pending: false,
      },
    });
    expect(html).not.toContain("HOST-SLOT-MARKER");
    expect(html).toContain("Row product");
  });
});
