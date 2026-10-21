/**
 * The preview's EXPLICIT unsupported state is REACHABLE (final-review fix
 * round, 2026-10-21).
 *
 * The archive contract (Decision **D1, Option A**) says an unsupported
 * template is an explicit state — "This template is not supported by this
 * theme", naming the key, linking back to the home tab — and **never** a
 * silent redirect to the homepage (the escalation record's §(l.1)-(l.3)).
 * The evidence record's §(B) row carried a ✅ for that, and in the shipped
 * tree the state was **unreachable**:
 *
 *   · the route's own search validation dropped every `?template=` value
 *     that is not one of the nine template keys
 *     (`validateThemePreviewSearch`, `src/lib/theme-preview-nav.ts`), so
 *     `?template=archive` never reached the preview host at all; and
 *   · the host computes its unsupported state from a **missing** key
 *     (`src/components/store/ThemePreviewFrame.tsx:575-578`, consumed at
 *     `:935-937`), so the branch could not fire while the route could only
 *     ever hand the host one of the nine keys the engine had already given
 *     a body.
 *
 * This suite pins the fix along the whole chain — the route's search
 * validation, the key reaching the host, the panel rendering, and the
 * homepage body **not** rendering in its place. It is the proof §(l.4)'s
 * scratch render never gave: that one exercised a hand-made `templates` map,
 * not the URL path.
 *
 * The route module IS imported — the preview route is a public, host-gated
 * route and its `validateSearch` is the exact function under test (the
 * precedent is `src/lib/media.serve.test.ts`). The route's **wiring** into
 * the host's props is asserted against its source text as well, the same
 * pattern as `src/routes/store.$slug.search-composition.test.tsx`.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { TemplateKey } from "@/lib/builder-ast";
import { LanguageProvider } from "@/lib/i18n";

// The frame syncs the URL on every switch via useNavigate, and the store
// chrome reads the router state — this suite renders without a router.
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  const { createElement: h } = await import("react");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useRouterState: () => ({ location: { pathname: "/" } }),
    Link: (p: Record<string, unknown>) => {
      const { to, children, ...rest } = p as {
        to?: unknown;
        children?: unknown;
        [k: string]: unknown;
      };
      return h(
        "a",
        {
          href: typeof to === "string" ? to : "/",
          ...rest,
        },
        children as never,
      );
    },
  };
});

// `StoreHeader` needs a live router and a cart provider; the preview frame's
// chrome is not what this suite is about. `MinimalCheckoutHeader` is the
// checkout tab's chrome and is mocked the same way.
vi.mock("@/components/store/StoreHeader", () => ({
  StoreHeader: ({ slug, name }: { slug: string; name: string }) => (
    <header>
      <a href="/">{name}</a>
      <a href={`/store/${slug}/checkout`}>Checkout</a>
    </header>
  ),
  MinimalCheckoutHeader: ({ slug, name }: { slug: string; name: string }) => (
    <header>
      <a href="/">{name}</a>
      <a href={`/store/${slug}/cart`}>Cart</a>
    </header>
  ),
}));

const { ThemePreviewFrame } =
  await import("@/components/store/ThemePreviewFrame");
const {
  previewSearchForSwitch,
  resolveThemePreview,
  validateThemePreviewSearch,
} = await import("@/lib/theme-preview-nav");

/** The repo root — four levels up from `src/lib/themes/songoskriti/`. */
const REPO = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);

/**
 * The route module's source — read for the WIRING (which prop the route
 * hands the requested key to). The route's `validateSearch` itself is
 * imported and asserted behaviourally.
 */
const ROUTE_SRC = readFileSync(
  join(REPO, "src", "routes", "theme-preview.$key.tsx"),
  "utf8",
);

/** The theme's REAL preview preset — the engine's own assembled templates. */
const preset = resolveThemePreview("songoskriti")!;

/**
 * The homepage's own copy, read out of the theme's assembled homepage body —
 * derived, never typed twice. It is the marker that tells the homepage
 * composition apart from the unsupported panel.
 */
const homeGrid = preset.templates.index.main.find(
  (section) => section.type === "department_grid",
);
const HOME_MARKER = String(homeGrid?.props["heading"] ?? "");

/** The demo strings Phase 1 retired from the theme's bodies. */
const RETIRED_DEMO_STRINGS = [
  "Demo page",
  "Demo search",
  "Meet the makers",
  "Sample product",
  "Demo",
];

/** Render the preview host for a REQUESTED template key. */
function render(requested: string): string {
  return renderToStaticMarkup(
    <LanguageProvider initialLang="en">
      <ThemePreviewFrame
        themeName={preset.themeName}
        author={preset.author}
        blueprintKey={preset.key}
        tokens={preset.tokens}
        templates={preset.templates}
        initialTemplate={requested as TemplateKey}
        onClose={() => {}}
      />
    </LanguageProvider>,
  );
}

/**
 * The whole URL path, in the order the browser walks it: the route's search
 * validation, then the key it hands to the host.
 */
function renderRequested(search: Record<string, unknown>): string {
  const validated = validateThemePreviewSearch(search);
  const requested = validated.template ?? validated.unsupportedTemplate;
  expect(requested, "the request must reach the host").toBeDefined();
  return render(requested!);
}

describe("the preview's unsupported template state is reachable", () => {
  it("the route's search validation carries an unknown key instead of dropping it", () => {
    const search = validateThemePreviewSearch({ template: "archive" });
    // The known-key slot keeps its meaning — a key the platform knows.
    expect(search.template).toBeUndefined();
    // The REQUEST is carried, so it can reach the host.
    expect(search.unsupportedTemplate).toBe("archive");
    // A key the platform knows is not an unsupported request.
    const known = validateThemePreviewSearch({ template: "search" });
    expect(known.template).toBe("search");
    expect(known.unsupportedTemplate).toBeUndefined();
  });

  it("bounds the requested key: only a key-shaped token is carried", () => {
    // Markup is never carried into the canvas (the host PRINTS the key).
    expect(
      validateThemePreviewSearch({ template: "<script>alert(1)</script>" })
        .unsupportedTemplate,
    ).toBeUndefined();
    // Neither is an unbounded string.
    expect(
      validateThemePreviewSearch({ template: "x".repeat(65) })
        .unsupportedTemplate,
    ).toBeUndefined();
    // Nor an empty one.
    expect(
      validateThemePreviewSearch({ template: "" }).unsupportedTemplate,
    ).toBeUndefined();
    // A key-shaped token of the allowed length is carried.
    expect(
      validateThemePreviewSearch({ template: "x".repeat(64) })
        .unsupportedTemplate,
    ).toHaveLength(64);
  });

  it("an unknown ?template= reaches the host and renders the explicit unsupported state", () => {
    const html = renderRequested({ template: "archive" });
    // The panel's own heading.
    expect(html).toContain("This template is not supported by this theme");
    // It NAMES the requested key.
    expect(html).toContain("archive");
    // It LINKS BACK to the home tab.
    expect(html).toContain('href="/"');
    expect(html).toContain("Back to the home tab");
  });

  it("the homepage composition does NOT render in place of the unsupported state", () => {
    expect(HOME_MARKER, "the homepage body must carry a marker").not.toBe("");
    const home = render("index");
    // The homepage really renders its own copy …
    expect(home).toContain(HOME_MARKER);
    // … and the unsupported state does not.
    const unsupported = renderRequested({ template: "archive" });
    expect(unsupported).not.toContain(HOME_MARKER);
  });

  it("the unsupported state carries none of the retired demo strings", () => {
    const html = renderRequested({ template: "archive" });
    for (const retired of RETIRED_DEMO_STRINGS) {
      expect(
        html,
        `the unsupported state must not carry "${retired}"`,
      ).not.toContain(retired);
    }
  });

  it("a template the theme authors still renders its own body", () => {
    const html = render("search");
    expect(html).toContain("Search the collection");
    expect(html).not.toContain("This template is not supported by this theme");
  });

  it("the assembled templates carry the nine keys and not the requested one", () => {
    // The engine synthesises a body for every key it KNOWS; an unknown key
    // is absent from the map, which is what the host turns into the panel.
    expect(Object.keys(preset.templates)).toHaveLength(9);
    expect(
      (preset.templates as Record<string, unknown>)["archive"],
    ).toBeUndefined();
  });

  it("the request ends with the visit — a switch clears it from the URL", () => {
    const next = previewSearchForSwitch("index", null, null, {
      template: undefined,
      unsupportedTemplate: "archive",
    });
    expect(next.template).toBe("index");
    expect(next.unsupportedTemplate).toBeUndefined();
  });

  it("the route hands the requested key to the preview host", async () => {
    // The ROUTE's own search validation — the exact function the browser
    // runs — carries the unknown key.
    const { Route } = await import("@/routes/theme-preview.$key");
    const validate = Route.options.validateSearch as (
      search: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(validate({ template: "archive" }).unsupportedTemplate).toBe(
      "archive",
    );
    // … and the route reads the request out of its own validated search …
    expect(ROUTE_SRC).toContain("unsupportedTemplate");
    // … and hands it to the host as the template it was asked for.
    expect(ROUTE_SRC).toContain(
      "(initialTemplate ?? unsupportedTemplate) as TemplateKey | undefined",
    );
  });
});
