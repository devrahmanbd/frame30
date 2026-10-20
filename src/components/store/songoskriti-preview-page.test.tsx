/**
 * The theme preview's `?template=page` tab must render a real body.
 *
 * `page_content` is a CONTEXT widget (`src/components/builder/widgets.tsx:1617`),
 * so the host hands it a React node. The preview's only slot source
 * (`useMockProductSlots`, `src/components/store/ThemePreviewFrame.tsx:256`)
 * returns `undefined` for every template but `product`, so once the theme's
 * `page` template declares the slot (Task 1) the tab rendered chrome around an
 * empty body.
 *
 * This suite pins the fix: the page template renders a non-empty demo body,
 * exactly one `<h1>` (the route owns it — the demo body carries the title and
 * nothing else does), none of the theme's retired demo copy, and a fixture
 * whose shape mirrors the production page payload.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TemplateKey, ThemeAst } from "@/lib/builder-ast";

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
// chrome is not what this suite is about.
vi.mock("@/components/store/StoreHeader", () => ({
  StoreHeader: ({ slug, name }: { slug: string; name: string }) => (
    <header>
      <a href="/">{name}</a>
      <a href={`/store/${slug}/checkout`}>Checkout</a>
    </header>
  ),
}));

const { ThemePreviewFrame } = await import("./ThemePreviewFrame");
const { songoskritiPreviewSource } =
  await import("@/lib/themes/songoskriti/preview");

const source = songoskritiPreviewSource();

/** The theme's REAL page body — the same builder the theme's own test uses. */
function pageAst(): ThemeAst {
  let n = 0;
  const s = (type: string, props: Record<string, unknown> = {}) => ({
    id: `${type}-${n++}`,
    type,
    props: { ...props },
  });
  return {
    header: [],
    main: source.main("page", s as never) ?? [],
    footer: [],
  };
}

/** Every template but `page` is empty, so the `?? templates.index` fallback
 *  cannot paper over an empty body. */
function templates(): Record<TemplateKey, ThemeAst> {
  const empty = (): ThemeAst => ({ header: [], main: [], footer: [] });
  return {
    index: empty(),
    product: empty(),
    collection: empty(),
    account: empty(),
    page: pageAst(),
    blog: empty(),
    cart: empty(),
    checkout: empty(),
    search: empty(),
  };
}

function renderPage(): string {
  return renderToStaticMarkup(
    createElement(ThemePreviewFrame, {
      themeName: source.themeName,
      author: source.author,
      blueprintKey: source.key,
      tokens: source.tokens,
      templates: templates(),
      initialTemplate: "page",
      onClose: () => {},
    }),
  );
}

describe("songoskriti preview — the page template's body", () => {
  it("renders a non-empty body for ?template=page", () => {
    const html = renderPage();
    expect(html).toContain("<article");
    expect(html).toContain("</article>");
    expect(html).toContain("Demo page body.");
  });

  it("renders exactly one h1 (the route owns it)", () => {
    const html = renderPage();
    expect(html.match(/<h1/g)?.length ?? 0).toBe(1);
  });

  it("leaks none of the theme's retired demo copy", () => {
    const html = renderPage();
    expect(html).not.toContain("Size guide");
    expect(html).not.toContain("How to measure");
    expect(html).not.toContain("Demo article");
  });

  it("mirrors the production page payload shape", async () => {
    const { PREVIEW_DEMO_PAGE } = await import("@/lib/preview-page-data");
    expect(Object.keys(PREVIEW_DEMO_PAGE).sort()).toEqual([
      "excerpt",
      "html",
      "title",
      "updated_at",
    ]);
  });
});
