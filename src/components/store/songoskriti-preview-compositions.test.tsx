/**
 * Task 7 — the theme preview renders every authored composition.
 *
 * The preview is the merchant's first impression and the parity source: the
 * six surfaces it shows (cart, account, search, blog, page, checkout) must be
 * the theme's **own** compositions, over **representative, visibly labelled**
 * demo data — never the studio's `DEMO_CART`, never the shared `DEMO_ORDERS`,
 * never the pack's `SAMPLE` blog rows; the checkout surface can only be the
 * theme's authored composition rendered through `SectionRenderer` — the
 * composition that replaced the generic checkout mock (the file was deleted
 * 2026-10-22, proven unused by the obsolete-path record's O1).
 *
 * This suite renders the frame with the theme's REAL template bodies (the
 * same plain builder the engine uses) and asserts what a merchant sees:
 * the Songoskriti cart lines and a coherent total, a labelled shopper and
 * order history, the authored search composition over the demo facets with a
 * working pager, the blog pack over the Songoskriti demo feed, the labelled
 * sample page, and the **authored** checkout body — not the mock.
 *
 * Every expected string is DERIVED from the theme's own demo fixtures, so
 * the suite cannot drift from the data it checks: a number typed twice is a
 * number that can disagree with itself.
 *
 * **The platform's payment rails are now asserted.** The platform's
 * `payment_methods` widget used to render NO payment-method radios — it
 * indexed `groupMethods()`'s ARRAY by group name
 * (`src/components/builder/cart.tsx:560`, `:584` against
 * `src/lib/payment-rails.ts:358-363`). That defect was escalated and fixed
 * on 2026-10-21 (the escalation record's §(o)); the widget's own suite is
 * `src/components/builder/cart-payment-methods.test.tsx`, and the checkout
 * case below now asserts the radios the preview's authored checkout body
 * actually renders — the platform-owned payment components the expert's P0
 * item 4 asks for.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TemplateKey, ThemeAst } from "@/lib/builder-ast";
import { LanguageProvider } from "@/lib/i18n";
import { formatDisplayMoney } from "@/lib/money-display";

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

const { ThemePreviewFrame } = await import("./ThemePreviewFrame");
const { songoskritiPreviewSource } =
  await import("@/lib/themes/songoskriti/preview");
const {
  SONGOSKRITI_PREVIEW_SEARCH_TOTAL,
  songoskritiPreviewCart,
  songoskritiPreviewFeed,
} = await import("@/lib/themes/songoskriti/preview-demo-data");

const source = songoskritiPreviewSource();

/**
 * The theme's REAL bodies for every template — the same plain builder the
 * preview engine uses (`resolveThemePreview` → `assemblePreviewTemplates`).
 * Every template gets a body, so nothing falls back to the homepage and a
 * tab can never look empty for the wrong reason.
 */
function themeTemplates(): Record<TemplateKey, ThemeAst> {
  let n = 0;
  const s = (type: string, props: Record<string, unknown> = {}) => ({
    id: `${type}-${n++}`,
    type,
    props: { ...props },
  });
  const ast = (template: TemplateKey): ThemeAst => ({
    header: source.header(template, s as never) ?? [],
    main: source.main(template, s as never) ?? [],
    footer: source.footer(template, s as never) ?? [],
  });
  return {
    index: ast("index"),
    product: ast("product"),
    collection: ast("collection"),
    account: ast("account"),
    page: ast("page"),
    blog: ast("blog"),
    cart: ast("cart"),
    checkout: ast("checkout"),
    search: ast("search"),
    archive: ast("archive"),
  };
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function render(template: TemplateKey, initialFocus?: string): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider initialLang="en">
        <ThemePreviewFrame
          themeName={source.themeName}
          author={source.author}
          blueprintKey={source.key}
          tokens={source.tokens}
          templates={themeTemplates()}
          initialTemplate={template}
          initialFocus={initialFocus}
          onClose={() => {}}
        />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

/** The formatted money the widgets print — derived, never typed twice. */
function money(minor: number): string {
  return formatDisplayMoney(minor)
    .replace(/^[^\d]*/, "")
    .replace(/\.00$/, "");
}

describe("songoskriti preview — the cart composition", () => {
  it("renders the Songoskriti cart lines and a coherent summary", () => {
    const html = render("cart");
    expect(html).toContain("Dhakai Jamdani Heritage Saree");
    expect(html).toContain("Comilla Handspun Khadi Kurta");
    // The studio's demo snapshot never reaches the Songoskriti preview.
    expect(html).not.toContain("Sample product");
    expect(html).not.toContain("Second product");
    // The total is the fixture's own total — derived, not hard-coded.
    const cart = songoskritiPreviewCart();
    expect(html).toContain(money(cart.totals!.totalMinor));
  });
});

describe("songoskriti preview — the account composition", () => {
  it("renders a labelled shopper and the Songoskriti order history", () => {
    const html = render("account");
    expect(html).toContain("Rumana Haque (demo shopper)");
    expect(html).toContain("rumana@example.com");
    expect(html).toContain("ORD-2451");
    expect(html).toContain("delivered");
    expect(html).toContain("ORD-2477");
    // The shared studio rows never reach the Songoskriti preview.
    expect(html).not.toContain("Demo Shopper");
    expect(html).not.toContain("ORD-1001");
  });
});

describe("songoskriti preview — the search composition", () => {
  it("renders the authored search body over the demo facets and the demo total", () => {
    const html = render("search");
    // The theme's own search heading.
    expect(html).toContain("Search the collection");
    // The demo facet labels reach the theme's facet SIDEBAR — the granted
    // `facet_sidebar` widget — and not only the toolbar. The sidebar is
    // sliced out of the markup so the assertion cannot be satisfied by the
    // platform's chips (which live in the host's search block instead).
    const sidebar = html.slice(
      html.indexOf('<aside aria-label="Filters"'),
      html.indexOf("</aside>"),
    );
    expect(sidebar).toContain("Jewellery");
    expect(sidebar).toContain("physical");
    // The theme's toolbar renders its filter control ONLY when the
    // platform handed the widget real facet rows — and the host merges the
    // theme's own facet rows into the widget-data map.
    expect(html).toMatch(/>Filter<\/button>/);
    // The demo catalogue's products, named by the results grid.
    expect(html).toContain("Dhakai Jamdani Heritage Saree");
    // The demo result count the toolbar reads from the demo query — the
    // fixture's own total, never a number typed twice. The assertion is
    // the RENDERED count ("38 products"), not a bare "38" that any number
    // anywhere in the markup would satisfy.
    expect(html).toContain(`${SONGOSKRITI_PREVIEW_SEARCH_TOTAL} products`);
    // The pager: the platform's `Pagination` widget builds a real page-2
    // link from the demo query (it renders only above one page, which is
    // why the demo total is 38 and not the catalogue's 13 products).
    expect(html).toContain("page=2");
    // The retired demo copy never reaches the Songoskriti preview.
    expect(html).not.toContain("Demo search");
  });

  it("hands the theme the platform's search block — the query box and the chips", () => {
    const html = render("search");
    // The storefront hands the theme ONE opaque block (`productSlot`,
    // `src/routes/store.$slug.search.tsx:559`): the platform's query box,
    // the platform's category/kind chips and the results grid. The preview
    // hands the same shape, so the preview demonstrates the contract the
    // storefront relies on — and the theme's grid honours it.
    expect(html).toContain('type="search"');
    expect(html).toContain('id="fq-preview-search"');
    // The platform's query box carries the platform's own label.
    expect(html).toContain("Product name, description or tag");
    // The platform's category/kind chips are LINKS built from the demo
    // query, not buttons — and their fieldset legend ("Product type") is
    // the chips' own, not the sidebar's group title ("Type").
    expect(html).toContain("/store/songoskriti/search?q=jamdani&amp;category=");
    expect(html).toContain("Product type");
    // The platform's results grid — the demo rows, rendered by the
    // platform's own card.
    expect(html).toContain('data-part="price"');
  });

  it("does not render the empty state under a non-empty result set", () => {
    const html = render("search");
    // The platform's `EmptyState` widget renders its panel UNCONDITIONALLY
    // (`src/components/builder/collection.tsx:707-753`), so the GRANT is
    // what decides whether the theme's empty copy appears — and the
    // storefront grants it only when the result set is empty. The preview
    // mirrors that contract, so the theme's "Nothing matches those filters"
    // panel never sits underneath a grid of results.
    expect(html).not.toContain("Nothing matches those filters");
    expect(html).not.toContain("Clear all filters");
  });
});

describe("songoskriti preview — the blog composition", () => {
  it("renders the blog pack over the Songoskriti demo feed", () => {
    const html = render("blog");
    for (const article of songoskritiPreviewFeed().articles) {
      expect(html, article.slug).toContain(article.title);
    }
    // The pack's own fallback rows and the retired demo story never reach
    // the Songoskriti preview.
    expect(html).not.toContain("Sample article 1");
    expect(html).not.toContain("Meet the makers");
  });
});

describe("songoskriti preview — the page composition", () => {
  it("renders the labelled sample page with exactly one h1", () => {
    const html = render("page");
    expect(html).toContain("Sample page");
    expect(html).toContain("Last updated");
    // The route owns the h1 — the sample body carries the title and nothing
    // else does.
    expect(html.match(/<h1/g)?.length ?? 0).toBe(1);
    // The retired demo copy never reaches the Songoskriti preview.
    expect(html).not.toContain("Size guide");
    expect(html).not.toContain("How to measure");
    expect(html).not.toContain("Demo article");
  });
});

describe("songoskriti preview — the checkout composition", () => {
  it("renders the AUTHORED checkout body, not the generic mock", () => {
    const html = render("checkout");
    expect(html).toContain("Checkout");
    expect(html).toContain("Order summary");
    // The theme's OWN payment marks — the `payment_icons` section's marks
    // ("bKash, Nagad, Rocket, Visa, Mastercard, Cash on delivery",
    // `src/lib/themes/songoskriti/preview.ts`), rendered as brand badges
    // and one text chip. This is what the preview shows for payment.
    expect(html).toContain("We accept");
    expect(html).toContain('aria-label="bKash"');
    expect(html).toContain("Cash on delivery");
    // The platform's `payment_methods` widget is granted and renders its
    // own fieldset legend.
    expect(html).toContain("Payment method");
    // … and it renders a RADIO per method the synthetic cart's server
    // quote offers — the platform-owned payment components the expert's P0
    // item 4 asks the preview to present. The rails come from the
    // synthetic cart's own `methods` (`src/lib/themes/songoskriti/preview-demo-data.ts:183`).
    const cart = songoskritiPreviewCart();
    const platformRadios = [...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)];
    expect(platformRadios).toHaveLength(cart.methods.length);
    for (const method of cart.methods) {
      expect(html).toContain(`name="fq-payment-method"`);
      expect(html).toMatch(
        new RegExp(`<input[^>]*type="radio"[^>]*value="${method}"`),
      );
    }
    // The synthetic order the demo cart quotes — the money comes from the
    // synthetic cart context, never from a literal.
    expect(html).toContain(money(cart.totals!.totalMinor));
    // The mock's hard-coded line and money never reach the preview.
    expect(html).not.toContain("Muslin Floral Festive Saree");
    expect(html).not.toContain("৳ 4,500");
  });
});

describe("songoskriti preview — product composition DOM H1 count & heading levels", () => {
  it("renders the product page with exactly one H1 and Product Details & Craft as H2", () => {
    const html = render("product", "dhakai-jamdani-heritage-saree");
    // Exactly one <h1> on the entire page (the product title)
    expect(html.match(/<h1/g)?.length ?? 0).toBe(1);
    expect(html).toMatch(/<h1[^>]*>Dhakai Jamdani Heritage Saree<\/h1>/);
    // Product Details & Craft is rendered as <h2>, not <h1>
    expect(html).toContain("Product Details &amp; Craft");
    expect(html).not.toMatch(/<h1[^>]*>Product Details &amp; Craft<\/h1>/);
    expect(html).toMatch(/<h2[^>]*>Product Details &amp; Craft<\/h2>/);
  });
});

describe("songoskriti preview — collection composition /c/sarees recommendations", () => {
  it("renders More to explore on /c/sarees with strictly authentic sarees and rejects Taaga tunic", () => {
    const html = render("collection", "sarees");
    // Authentic sarees are present in the rendered HTML
    expect(html).toContain("Dhakai Jamdani Heritage Saree");
    expect(html).toContain("Handwoven Muslin Floral Saree");
    expect(html).toContain("Tangail Taant Handloom Cotton Saree");

    // Strictly rejected from /c/sarees:
    expect(html).not.toContain("Taaga Contemporary Asymmetric Linen Tunic");
    expect(html).not.toContain("Taaga Man Relaxed Fit Khadi Shirt");
    expect(html).not.toContain("Rajshahi Silk Festive Panjabi");
    expect(html).not.toContain("Comilla Handspun Khadi Kurta");
    expect(html).not.toContain("Handcrafted Nakshi Kantha Quilt");
    expect(html).not.toContain("Dhamrai Brass Heritage Necklace");
    expect(html).not.toContain("Girls Silk Festive Ghagra Choli Set");
    expect(html).not.toContain("Boys Handloom Silk Panjabi &amp; Pajama");
  });

  it("renders More Children's Wear intentional cross-sell on /c/girls", () => {
    const html = render("collection", "girls");
    expect(html).toContain("Girls Festive Wear");
    expect(html).toContain("Girls Silk Festive Ghagra Choli Set");
    expect(html).toContain("More Children&#x27;s Wear");
    expect(html).toContain("Boys Handloom Silk Panjabi &amp; Pajama");
  });

  it("eliminates duplicate product lists on collection templates (P1 audit reconciliation)", () => {
    // Sarees collection: each authentic saree appears exactly once by canonical link and title
    const sareesHtml = render("collection", "sarees");
    expect(sareesHtml).not.toContain("More to explore");
    expect(sareesHtml).not.toContain("আরও দেখুন");

    // Canonical product destination link assertions (2 links per product: image anchor + title anchor)
    const jamdaniLinks = (
      sareesHtml.match(/href="\/p\/dhakai-jamdani-heritage-saree"/g) || []
    ).length;
    expect(jamdaniLinks, "Dhakai Jamdani product card anchors appear exactly once per card (2 anchors)").toBe(2);

    const muslinLinks = (
      sareesHtml.match(/href="\/p\/muslin-floral-festive-saree"/g) || []
    ).length;
    expect(muslinLinks, "Handwoven Muslin product card anchors appear exactly once per card (2 anchors)").toBe(2);

    const tangailLinks = (
      sareesHtml.match(/href="\/p\/tangail-handloom-cotton-saree"/g) || []
    ).length;
    expect(tangailLinks, "Tangail Taant product card anchors appear exactly once per card (2 anchors)").toBe(2);

    // Title element counts (exactly 1 card title per product)
    const jamdaniCardCount = (
      sareesHtml.match(
        /data-part="title"[^>]*>Dhakai Jamdani Heritage Saree/g,
      ) || []
    ).length;
    expect(jamdaniCardCount).toBe(1);
    const muslinCardCount = (
      sareesHtml.match(
        /data-part="title"[^>]*>Handwoven Muslin Floral Saree/g,
      ) || []
    ).length;
    expect(muslinCardCount).toBe(1);
    const tangailCardCount = (
      sareesHtml.match(
        /data-part="title"[^>]*>Tangail Taant Handloom Cotton Saree/g,
      ) || []
    ).length;
    expect(tangailCardCount).toBe(1);

    // Festive collection: items in main grid appear exactly once; redundant rail omitted
    const festiveHtml = render("collection", "festive");
    expect(festiveHtml).not.toContain("More to explore");
    expect(festiveHtml).not.toContain("আরও দেখুন");
    const festivePanjabiCardCount = (
      festiveHtml.match(
        /data-part="title"[^>]*>Rajshahi Silk Festive Panjabi/g,
      ) || []
    ).length;
    expect(festivePanjabiCardCount).toBe(1);
    const festivePanjabiLinks = (
      festiveHtml.match(/href="\/p\/rajshahi-silk-festive-panjabi"/g) || []
    ).length;
    expect(festivePanjabiLinks, "Rajshahi Silk Panjabi links appear for exactly 1 card").toBe(2);

    // /c/girls cross-sell preservation: intentional cross-sell is NOT deleted
    const girlsHtml = render("collection", "girls");
    expect(girlsHtml).toContain("More Children&#x27;s Wear");
    const boysCrossSellLinks = (
      girlsHtml.match(/href="\/p\/boys-silk-panjabi-pajama-set"/g) || []
    ).length;
    expect(boysCrossSellLinks, "Boys Panjabi cross-sell link appears in /c/girls").toBeGreaterThanOrEqual(1);
  });
});
