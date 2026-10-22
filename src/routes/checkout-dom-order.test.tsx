/**
 * The production checkout's RENDERED DOM order — the pin the final re-review
 * asked for.
 *
 * **The defect it guards.** The final-fix round reordered the theme's
 * checkout composition so the route's own body (`page_content`) precedes the
 * payment/summary band. But the platform's place-order action lives INSIDE
 * that body (inside the route's `<form>`), so the shopper met
 * **"Place Order" → payment rail → order summary**: the button before the
 * rail they pay with and before the total they pay.
 *
 * **The shape that fixes it.** The route owns the button, the totals and the
 * payment state; the theme owns the composition. So the route renders its
 * action in its own TRAILING slot (`ThemeChrome`'s `afterBody`), after the
 * theme's band, and the action submits the route's own form through the HTML
 * form owner (`form="…"`) — the only way a submit button can follow a band
 * the theme draws beside the route's body. The theme's AST is untouched: it
 * still arranges platform-owned pieces and carries no form, no input and no
 * submit button.
 *
 * **What is rendered here.** The PRODUCTION wiring of BOTH checkout routes —
 * each route's own exported `CheckoutShell`, with the Songoskriti checkout
 * AST — rendered to static markup (the same `react-dom/server` path the
 * cart suite uses), and the order of the four landmarks is measured in the
 * emitted HTML.
 *
 * Vitest env node — no DOM at import time; `renderToStaticMarkup` needs
 * neither a browser nor a jsdom.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SectionBuilder, ThemeAst } from "@/lib/builder-ast";
import { songoskritiPreviewSource } from "@/lib/themes/songoskriti/preview";
import { CheckoutShell as StorefrontCheckoutShell } from "./store.$slug.checkout";
import { CheckoutShell as CustomHostCheckoutShell } from "./checkout";

// The storefront's own widgets read the store base off the TanStack router
// (same as the cart suite, which stubs the same hook), and the route's
// form needs a navigate function. Neither is available outside a router.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouterState: () => ({ location: { pathname: "/store/demo/checkout" } }),
    useNavigate: () => () => undefined,
    Link: (props: { children?: unknown }) => props.children ?? null,
  };
});

const SLUG = "demo";
const FORM_ID = `fq-checkout-form-${SLUG}`;

/** The Songoskriti checkout body — the theme's PRODUCTION composition. */
function songoskritiCheckoutAst(): ThemeAst {
  let n = 0;
  const s = (type: string, props: Record<string, unknown> = {}) => ({
    id: `${type}-${n++}`,
    type,
    props,
  });
  return {
    header: [],
    main: songoskritiPreviewSource().main(
      "checkout",
      s as unknown as SectionBuilder,
    )!,
    footer: [],
  };
}

/**
 * A theme body with NO payment block and NO order summary — the case where
 * the route must supply its OWN picker and its OWN summary.
 */
function bareCheckoutAst(): ThemeAst {
  let n = 0;
  const s = (type: string, props: Record<string, unknown> = {}) => ({
    id: `${type}-${n++}`,
    type,
    props,
  });
  return {
    header: [],
    main: songoskritiPreviewSource()
      .main("checkout", s as unknown as SectionBuilder)!
      .filter((section) => section.type === "page_content"),
    footer: [],
  };
}

/** The two production checkout routes. */
const ROUTES = [
  {
    name: "the storefront checkout",
    Shell: StorefrontCheckoutShell,
    /** The route's own customer field — the first thing the shopper meets. */
    field: 'name="phone"',
    /** The route's OWN order summary panel (the theme's widget is absent). */
    summary: ">Order Summary<",
  },
  {
    name: "the custom-host checkout",
    Shell: CustomHostCheckoutShell,
    field: 'name="phone"',
    summary: ">Summary<",
  },
];

/** Renders one route's production shell to static markup. */
function renderShell(
  Shell: (typeof ROUTES)[number]["Shell"],
  ast: ThemeAst,
): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <Shell
        slug={SLUG}
        store={{
          merchant: { id: "merchant-1" },
          ast,
          tokens: null,
          siteKit: null,
          themeKey: null,
        }}
        chrome={null}
        containerClassName=""
      />
    </QueryClientProvider>,
  );
}

describe("the production checkout — the place-order action comes LAST", () => {
  it.each(ROUTES)(
    "$name renders fields → payment → summary → submit, in that order",
    ({ Shell, field }) => {
      const html = renderShell(Shell, songoskritiCheckoutAst());

      // The four landmarks, in the order the shopper must meet them.
      const fields = html.indexOf(field);
      const payment = html.indexOf('data-fq-node="payment_methods-');
      const summary = html.indexOf('data-fq-node="cart_summary-');
      const submit = html.indexOf(`type="submit" form="${FORM_ID}"`);

      expect(fields, "the route's own customer field renders").toBeGreaterThan(
        -1,
      );
      expect(payment, "the theme's payment block renders").toBeGreaterThan(-1);
      expect(summary, "the theme's order summary renders").toBeGreaterThan(-1);
      expect(submit, "the route's place-order action renders").toBeGreaterThan(
        -1,
      );

      expect(fields, "the customer's own fields come FIRST").toBeLessThan(
        payment,
      );
      expect(
        payment,
        "the payment control comes AFTER the fields",
      ).toBeGreaterThan(fields);
      expect(
        summary,
        "the order summary comes AFTER the payment control",
      ).toBeGreaterThan(payment);
      expect(
        submit,
        "the place-order action comes AFTER the summary and the total",
      ).toBeGreaterThan(summary);

      // The action is not merely later in the string: it is after the
      // theme's band in the DOCUMENT, and the route's form is closed before
      // it — the action submits the form through the HTML form owner.
      const formEnd = html.indexOf("</form>");
      expect(
        formEnd,
        "the route's own form closes before the action",
      ).toBeGreaterThan(-1);
      expect(
        submit,
        "the action sits after the route's form, in the theme's frame",
      ).toBeGreaterThan(formEnd);
    },
  );

  it.each(ROUTES)(
    "$name's action submits the route's OWN form (the HTML form owner)",
    ({ Shell }) => {
      const html = renderShell(Shell, songoskritiCheckoutAst());
      // The form the route owns …
      expect(html, "the route's form carries its own id").toContain(
        `id="${FORM_ID}"`,
      );
      // … and the action names it, so it can live outside the form element.
      expect(html, "the action names the route's form").toContain(
        `form="${FORM_ID}"`,
      );
      // Exactly ONE order form, and exactly ONE action.
      expect(html.match(/<form\b/g)?.length ?? 0).toBe(1);
      expect(html.match(/type="submit"/g)?.length ?? 0).toBe(1);
    },
  );

  it.each(ROUTES)(
    "$name's theme band carries no form and no submit button of its own",
    ({ Shell }) => {
      const html = renderShell(Shell, songoskritiCheckoutAst());
      // The band: everything between the theme's payment block and the
      // route's trailing action.
      const band = html.slice(
        html.indexOf('data-fq-node="payment_methods-'),
        html.indexOf(`type="submit" form="${FORM_ID}"`),
      );
      expect(band, "the theme's band authors no form").not.toContain("<form");
      expect(band, "the theme's band authors no submit button").not.toContain(
        'type="submit"',
      );
      // …and the whole page carries exactly one form and one action, both
      // the platform's.
      expect(html.match(/<form\b/g)?.length ?? 0).toBe(1);
      expect(html.match(/type="submit"/g)?.length ?? 0).toBe(1);
    },
  );

  it.each(ROUTES)(
    "$name still supplies its OWN picker and summary when the theme's body omits them",
    ({ Shell, field, summary: summaryMarker }) => {
      const html = renderShell(Shell, bareCheckoutAst());
      // The route's own payment picker …
      const picker = html.indexOf('name="method"');
      // … and the route's own order summary (the route's panel, not the
      // theme's widget).
      const summary = html.indexOf(summaryMarker);
      const submit = html.indexOf(`type="submit" form="${FORM_ID}"`);

      expect(
        picker,
        "the route supplies its own payment picker",
      ).toBeGreaterThan(-1);
      expect(
        summary,
        "the route supplies its own order summary",
      ).toBeGreaterThan(-1);
      expect(submit, "the route's action still renders").toBeGreaterThan(-1);

      expect(html.indexOf(field)).toBeLessThan(picker);
      expect(
        picker,
        "the payment control comes after the fields",
      ).toBeGreaterThan(html.indexOf(field));
      expect(
        summary,
        "the order summary comes after the payment control",
      ).toBeGreaterThan(picker);
      expect(submit, "the place-order action still comes last").toBeGreaterThan(
        summary,
      );
    },
  );
});
