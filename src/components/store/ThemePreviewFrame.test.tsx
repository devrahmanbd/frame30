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

const {
  ThemePreviewFrame,
  PREVIEW_DISABLED_MESSAGE,
  handlePreviewCanvasClick,
  handlePreviewCanvasSubmit,
  isPreviewBlockedHref,
  previewClickAction,
  previewTemplateForHref,
} = await import("./ThemePreviewFrame");
const { toast } = await import("sonner");
const { DEFAULT_TOKENS, newSection } = await import(
  "@/lib/builder-ast"
);
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
function clickOn(node: {
  closest: (selector: string) => unknown;
}) {
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
    const setTemplate = vi.fn();
    handlePreviewCanvasClick(event, setTemplate);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(setTemplate).toHaveBeenCalledWith("checkout");
    expect(toastInfo()).not.toHaveBeenCalled();
  });

  it("switches to the account demo template instead of acting", () => {
    const event = clickOn(anchorNode("/account"));
    const setTemplate = vi.fn();
    handlePreviewCanvasClick(event, setTemplate);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(setTemplate).toHaveBeenCalledWith("account");
    expect(toastInfo()).not.toHaveBeenCalled();
  });

  it("prevents a submit-button click inside a newsletter form", () => {
    const event = clickOn(submitButtonNode({}));
    const setTemplate = vi.fn();
    handlePreviewCanvasClick(event, setTemplate);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(toastInfo()).toHaveBeenCalledWith(PREVIEW_DISABLED_MESSAGE);
    expect(setTemplate).not.toHaveBeenCalled();
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
    ["/p/jamdani-saree", "product"],
    ["/store/demo/p/jamdani-saree", "product"],
    ["/c/sarees", "collection"],
    ["/store/demo/c/sarees", "collection"],
    ["/search", "search"],
    ["/cart", "cart"],
    ["/store/demo/cart", "cart"],
    ["/checkout", "checkout"],
    ["/store/demo/checkout", "checkout"],
    ["/account", "account"],
    ["/store/demo/account", "account"],
    ["/pages/shipping", "page"],
    ["/blog/how-jamdani-is-woven", "blog"],
    ["/blog", "blog"],
    ["/", "index"],
    ["/store/demo", "index"],
  ])("maps %s to the %s template", (href, template) => {
    expect(previewTemplateForHref(href)).toBe(template);
    expect(previewClickAction(href)).toEqual({
      kind: "switch",
      template,
    });
  });

  it("returns null for blocked and unknown hrefs", () => {
    expect(previewTemplateForHref("/signup")).toBeNull();
    expect(previewTemplateForHref("/order/abc")).toBeNull();
    expect(previewTemplateForHref("/unrelated-path")).toBeNull();
  });

  it("switches template on a product click without a toast", () => {
    const event = clickOn(anchorNode("/p/jamdani-saree"));
    const setTemplate = vi.fn();
    handlePreviewCanvasClick(event, setTemplate);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(setTemplate).toHaveBeenCalledWith("product");
    expect(toastInfo()).not.toHaveBeenCalled();
  });
});
