/**
 * ThemePreviewFrame — chrome-free preview with blocked actions (TDD).
 *
 * The preview shows exactly the store: no dock, no template tabs, no close
 * button. In-canvas links switch templates (product / collection / search /
 * page / blog / cart / checkout / account / home); signup, order tracking
 * and auth links plus submit controls inside any form and every form
 * submit are blocked with a "Disabled in preview" toast.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("sonner", () => ({ toast: { info: vi.fn() } }));

// ThemePreviewFrame now syncs the URL on every switch via useNavigate; this
// suite renders without a router, so the hook is stubbed to a no-op.
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

// `StoreHeader` needs a live router (useRouterState/Link); this suite is
// about the preview frame's chrome and interception, so the header is
// stubbed down to the shape that matters: account/checkout links and a
// subscribe form.
vi.mock("@/components/store/StoreHeader", () => ({
  StoreHeader: ({ slug, name }: { slug: string; name: string }) => (
    <header>
      <a href="/">{name}</a>
      <a href="/account">Account</a>
      <a href={`/store/${slug}/checkout`}>Checkout</a>
      <form action="#newsletter" method="post">
        <input name="email" type="email" />
        <button type="submit">Subscribe</button>
      </form>
    </header>
  ),
}));

const { ThemePreviewFrame } = await import("./ThemePreviewFrame");
// Click routing is single-sourced in @/lib/theme-preview-nav (the Frame
// defines no local parser/handler copies); this suite pins the lib behavior
// through the same symbols the Frame imports.
const {
  PREVIEW_DISABLED_MESSAGE,
  handlePreviewCanvasClick,
  handlePreviewCanvasSubmit,
  isPreviewBlockedHref,
  previewClickAction,
  previewTemplateForHref,
} = await import("@/lib/theme-preview-nav");
const { toast } = await import("sonner");
const { DEFAULT_TOKENS, newSection } = await import("@/lib/builder-ast");
import type { TemplateKey, ThemeAst } from "@/lib/builder-ast";

const toastInfo = () => vi.mocked(toast.info);

function buildTemplates(): Record<TemplateKey, ThemeAst> {
  const empty = (): ThemeAst => ({ header: [], main: [], footer: [] });
  return {
    index: {
      header: [],
      main: [newSection("heading"), newSection("newsletter")],
      footer: [],
    },
    product: empty(),
    collection: empty(),
    account: empty(),
    page: empty(),
    blog: empty(),
    cart: empty(),
    checkout: empty(),
    search: empty(),
  };
}

function frameProps(initialTemplate?: TemplateKey) {
  return {
    themeName: "Heritage",
    author: "heritage",
    blueprintKey: "demo",
    tokens: DEFAULT_TOKENS,
    templates: buildTemplates(),
    initialTemplate,
    onClose: () => {},
  };
}

/** Minimal fake for the capture-phase click event the canvas handles. */
function clickOn(node: { closest: (selector: string) => unknown }) {
  return {
    target: node,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

const anchorNode = (href: string) => ({
  closest: (selector: string) =>
    selector === "a[href]" ? { getAttribute: () => href } : null,
});

const submitButtonNode = (form: object | null) => {
  const button = {
    closest: (selector: string) => (selector === "form" ? form : null),
  };
  return {
    closest: (selector: string) =>
      selector.includes("submit") ? button : null,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ThemePreviewFrame chrome", () => {
  it("renders the store with no preview dock", () => {
    const html = renderToStaticMarkup(<ThemePreviewFrame {...frameProps()} />);
    expect(html).toContain('role="dialog"');
    // Store content still renders: wordmark, sections, newsletter form.
    expect(html).toContain("Heritage");
    expect(html).toContain("Subscribe");
    // Dock chrome is gone: no expander dot, no tab nav, no close button.
    expect(html).not.toContain("Preview controls");
    expect(html).not.toContain("Close preview");
    expect(html).not.toContain('aria-label="Template"');
  });

  it("keeps the ?template= deep-link initial state", () => {
    const indexHtml = renderToStaticMarkup(
      <ThemePreviewFrame {...frameProps()} />,
    );
    const productHtml = renderToStaticMarkup(
      <ThemePreviewFrame {...frameProps("product")} />,
    );
    // Index carries the heading + newsletter sections; the empty product
    // template renders the empty-state copy instead.
    expect(indexHtml).toContain("Section heading");
    expect(productHtml).toContain("No sections authored for this template.");
    expect(productHtml).not.toContain("Section heading");
  });
});

describe("preview click blocking", () => {
  it.each([
    "/signin",
    "/signup",
    "/login",
    "/register",
    "/store/demo/login",
    "/order/abc123",
    "/store/demo/order/abc123",
    "/track",
    "/store/demo/track",
  ])("blocks %s", (href) => {
    expect(isPreviewBlockedHref(href)).toBe(true);
    expect(previewClickAction(href)).toEqual({ kind: "blocked" });
  });

  it.each([
    "/p/shirt",
    "/c/shoes",
    "/search",
    "/",
    "/pages/about",
    "/blog/x",
    "/cart",
    "/checkout",
    "/account",
  ])("does not block %s", (href) => {
    expect(isPreviewBlockedHref(href)).toBe(false);
  });

  it("switches to the checkout demo template instead of acting", () => {
    const event = clickOn(anchorNode("/store/demo/checkout"));
    const switchTo = vi.fn();
    handlePreviewCanvasClick(event, switchTo);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(switchTo).toHaveBeenCalledWith("checkout", null, null);
    expect(toastInfo()).not.toHaveBeenCalled();
  });

  it("switches to the account demo template instead of acting", () => {
    const event = clickOn(anchorNode("/account"));
    const switchTo = vi.fn();
    handlePreviewCanvasClick(event, switchTo);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(switchTo).toHaveBeenCalledWith("account", null, null);
    expect(toastInfo()).not.toHaveBeenCalled();
  });

  it("prevents a submit-button click inside a newsletter form", () => {
    const event = clickOn(submitButtonNode({}));
    const switchTo = vi.fn();
    handlePreviewCanvasClick(event, switchTo);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(toastInfo()).toHaveBeenCalledWith(PREVIEW_DISABLED_MESSAGE);
    expect(switchTo).not.toHaveBeenCalled();
  });

  it("blocks every form submit with a toast", () => {
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    handlePreviewCanvasSubmit(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(toastInfo()).toHaveBeenCalledWith(PREVIEW_DISABLED_MESSAGE);
  });
});

describe("preview in-canvas template navigation", () => {
  it.each([
    ["/p/jamdani-saree", "product", "jamdani-saree"],
    ["/store/demo/p/jamdani-saree", "product", "jamdani-saree"],
    ["/c/sarees", "collection", "sarees"],
    ["/store/demo/c/sarees", "collection", "sarees"],
    ["/search", "search", undefined],
    ["/cart", "cart", undefined],
    ["/store/demo/cart", "cart", undefined],
    ["/checkout", "checkout", undefined],
    ["/store/demo/checkout", "checkout", undefined],
    ["/account", "account", undefined],
    ["/store/demo/account", "account", undefined],
    ["/pages/shipping", "page", "shipping"],
    ["/blog/how-jamdani-is-woven", "blog", "how-jamdani-is-woven"],
    ["/blog", "blog", undefined],
    ["/", "index", undefined],
    ["/store/demo", "index", undefined],
  ])("maps %s to the %s template", (href, template, slug) => {
    expect(previewTemplateForHref(href)).toBe(template);
    // Single-source action shape: { kind: "switch", target } — page/blog
    // links carry their slug in target (focus stays product/collection-only
    // in the canvas handler), list forms carry slug: null.
    expect(previewClickAction(href)).toEqual({
      kind: "switch",
      target: {
        template,
        slug: slug ?? null,
        query: null,
      },
    });
  });

  it("returns null for blocked and unknown hrefs", () => {
    expect(previewTemplateForHref("/signup")).toBeNull();
    expect(previewTemplateForHref("/order/abc")).toBeNull();
    expect(previewTemplateForHref("/unrelated-path")).toBeNull();
  });

  it("switches template on a product click without a toast", () => {
    const event = clickOn(anchorNode("/p/jamdani-saree"));
    const switchTo = vi.fn();
    handlePreviewCanvasClick(event, switchTo);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(switchTo).toHaveBeenCalledWith("product", "jamdani-saree", null);
    expect(toastInfo()).not.toHaveBeenCalled();
  });

  it("reports the clicked collection slug through switchTo", () => {
    const event = clickOn(anchorNode("/c/contemporary"));
    const switchTo = vi.fn();
    handlePreviewCanvasClick(event, switchTo);
    expect(switchTo).toHaveBeenCalledWith("collection", "contemporary", null);
    expect(toastInfo()).not.toHaveBeenCalled();
  });

  it("clears focus on switches that carry no slug", () => {
    const event = clickOn(anchorNode("/search"));
    const switchTo = vi.fn();
    handlePreviewCanvasClick(event, switchTo);
    expect(switchTo).toHaveBeenCalledWith("search", null, null);
  });

  it("passes the raw search query through switchTo for URL sync", () => {
    const event = clickOn(anchorNode("/search?q=saree&max=99900"));
    const switchTo = vi.fn();
    handlePreviewCanvasClick(event, switchTo);
    expect(switchTo).toHaveBeenCalledWith("search", null, "q=saree&max=99900");
  });

  it("does not switch on blocked links", () => {
    const event = clickOn(anchorNode("/order/abc"));
    const switchTo = vi.fn();
    handlePreviewCanvasClick(event, switchTo);
    expect(switchTo).not.toHaveBeenCalled();
    expect(toastInfo()).toHaveBeenCalledWith(PREVIEW_DISABLED_MESSAGE);
  });

  it("honours a ?focus= deep link on first paint", () => {
    const heading = {
      ...newSection("heading"),
      props: { text: "New in", text_bn: "নতুন এসেছে" },
    };
    const templates = {
      ...buildTemplates(),
      collection: { header: [], main: [heading], footer: [] },
    };
    const html = renderToStaticMarkup(
      <ThemePreviewFrame
        {...frameProps("collection")}
        templates={templates}
        initialFocus="women"
      />,
    );
    expect(html).toContain("Women");
    expect(html).toContain("<h1");
  });
});

describe("preview frame search round-trip", () => {
  it("search click writes separate keys so refresh preserves them", async () => {
    const { previewSearchForSwitch } = await import("@/lib/theme-preview-nav");
    // Same updater ThemePreviewFrame.switchTo passes to navigate: raw
    // in-canvas query must never land as a single q value.
    const next = previewSearchForSwitch("search", null, "max=99900", {
      template: "search",
    });
    expect(next).toMatchObject({ template: "search", max: "99900" });
    expect(next).not.toHaveProperty("q", "max=99900");
  });

  it("collection click keeps focus under the ?focus= contract", async () => {
    const { previewSearchForSwitch } = await import("@/lib/theme-preview-nav");
    const next = previewSearchForSwitch("collection", "festive", null, {});
    expect(next).toMatchObject({ template: "collection", focus: "festive" });
    expect(next).not.toHaveProperty("slug");
  });
});

// Back-button sync (ThemePreviewFrame useEffect on
// initialTemplate/initialFocus): node env has no router/DOM history, so
// verify manually — /c/festive -> /c/wedding -> back shows festive.

describe("preview skin sheets (lane B2-1)", () => {
  const SHEETS = {
    "product_rail:editorial": ".used-editorial{color:red}",
    "product_rail:minimal": ".unused-minimal{color:blue}",
    "hero_carousel:split": ".unused-split{color:green}",
  };

  function skinnedTemplates(): Record<TemplateKey, ThemeAst> {
    const empty = (): ThemeAst => ({ header: [], main: [], footer: [] });
    return {
      // product_rail defaults to the editorial skin (catalog default).
      index: { header: [], main: [newSection("product_rail")], footer: [] },
      product: empty(),
      collection: empty(),
      account: empty(),
      page: empty(),
      blog: empty(),
      cart: empty(),
      checkout: empty(),
      search: empty(),
    };
  }

  it("inlines nothing without skin sheets (today's DOM)", () => {
    const html = renderToStaticMarkup(
      <ThemePreviewFrame {...frameProps()} templates={skinnedTemplates()} />,
    );
    expect(html).not.toContain("data-fq-skin-css");
  });

  it("inlines only the sheets the rendered template uses", () => {
    const html = renderToStaticMarkup(
      <ThemePreviewFrame
        {...frameProps()}
        templates={skinnedTemplates()}
        skinSheets={SHEETS}
      />,
    );
    expect(html).toContain('data-fq-skin-css=""');
    expect(html).toContain(".used-editorial{color:red}");
    expect(html).not.toContain(".unused-minimal");
    expect(html).not.toContain(".unused-split");
  });

  it("counts header and footer sections, not just main", () => {
    const templates = skinnedTemplates();
    templates.index = {
      header: [],
      main: [],
      footer: [{ ...newSection("product_rail"), props: { skin: "minimal" } }],
    };
    const html = renderToStaticMarkup(
      <ThemePreviewFrame
        {...frameProps()}
        templates={templates}
        skinSheets={SHEETS}
      />,
    );
    expect(html).toContain(".unused-minimal{color:blue}");
    expect(html).not.toContain(".used-editorial");
  });

  it("inlines nothing when no skinned widgets render", () => {
    const html = renderToStaticMarkup(
      <ThemePreviewFrame {...frameProps()} skinSheets={SHEETS} />,
    );
    expect(html).not.toContain("data-fq-skin-css");
  });
});
