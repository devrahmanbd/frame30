/**
 * The production checkout shell — the AUTHORITY contract.
 *
 * Decision **D2'** supersedes **D2**: the theme's `checkout` composition is
 * the production shell, and the route keeps the form, the customer fields,
 * the server quote, the validation, the stock hold and the order write.
 *
 * The failure mode this suite guards is the one the plan's Review Focus
 * names: *the production checkout loses its server authority*. So:
 *
 *   (a) the route still calls the four server functions, and no total, no
 *       method list and no customer field is read from the theme's AST;
 *   (b) the theme's AST is handed to `ThemeChrome` and to nothing else, and
 *       the authored checkout body contributes no `<form>`, no `<input>`,
 *       no submit button and no payment credential field;
 *   (c) the checkout's zone allowlist stays closed — no overlay zone, so no
 *       popup can ever cover a payment step;
 *   (d) the customer fields still come from the route's own `FormData`.
 *
 * The tree is read as TEXT (the same pattern as
 * `src/routes/store.$slug.search-composition.test.tsx`).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TEMPLATE_ZONES } from "@/lib/builder-ast";
import { songoskritiPreviewSource } from "@/lib/themes/songoskriti/preview";

const STORE_ROUTE = readFileSync("src/routes/store.$slug.checkout.tsx", "utf8");
const CUSTOM_ROUTE = readFileSync("src/routes/checkout.tsx", "utf8");
const PREVIEW_SOURCE = readFileSync(
  "src/lib/themes/songoskriti/preview.ts",
  "utf8",
);

/** The routes that serve a production checkout. */
const ROUTES = [
  { name: "the storefront checkout", src: STORE_ROUTE },
  { name: "the custom-host checkout", src: CUSTOM_ROUTE },
];

/** The section types the theme's authored checkout body may carry. */
const CHECKOUT_COMPOSITION_TYPES = [
  "heading",
  "checkout_steps",
  "columns",
  "container",
  "payment_methods",
  "payment_icons",
  "cart_summary",
  "page_content",
] as const;

describe("the checkout shell — the platform keeps the server authority", () => {
  it.each(ROUTES)("$name still calls the four server functions", ({ src }) => {
    expect(src).toContain("quoteCart(");
    expect(src).toContain("reserveCheckout(");
    expect(src).toContain("releaseCheckout(");
    expect(src).toContain("placeOrder(");
    // …and imports them from the platform's own server-fn module.
    expect(src).toContain('from "@/lib/storefront.functions"');
    expect(src).toMatch(/import\s*\{[^}]*placeOrder[^}]*\}\s*from/);
  });

  it.each(ROUTES)(
    "$name reads no total, method list or customer field from the theme AST",
    ({ src }) => {
      // The totals are the SERVER's quote.
      expect(src).toContain("quote?.totals");
      // The rails are the server's answer.
      expect(src).toContain("quote?.settings.methods");
      // The customer fields are the route's own FormData.
      for (const field of [
        "name",
        "phone",
        "email",
        "address",
        "city",
        "postcode",
        "note",
      ]) {
        expect(src).toContain(`form.get("${field}")`);
      }
      // The AST is never indexed and never read a field from.
      expect(src).not.toMatch(/\bast\s*[.[]/);
      expect(src).not.toMatch(/\bast\?\./);
    },
  );

  it.each(ROUTES)(
    "$name hands the theme AST to ThemeChrome and to nothing else",
    ({ src }) => {
      // Exactly ONE `ast=` prop, and it is ThemeChrome's.
      const astProps = [...src.matchAll(/(^|[^a-zA-Z])ast=\{/g)];
      expect(astProps).toHaveLength(1);
      expect(src).toContain("ast={ast}");
      expect(src).toContain("<ThemeChrome");
      // The AST is never handed to a form, a section or a widget.
      expect(src).not.toMatch(/<form[^>]*>[^<]*\{ast/);
      // …and it is never spread into another element's props.
      expect(src).not.toMatch(/\.\.\.ast/);
    },
  );

  it.each(ROUTES)(
    "$name owns the payment state through the shared cart context",
    ({ src }) => {
      // The platform's `payment_methods` widget writes `cart.setMethod`; the
      // route reads the SAME value back, so the order is placed with the rail
      // the shopper chose.
      expect(src).toContain("useCartContext");
      expect(src).toContain("cart.method");
      expect(src).toContain("cart.setMethod");
      expect(src).toContain("paymentMethod: method");
    },
  );

  it.each(ROUTES)("$name carries no payment credential field", ({ src }) => {
    const lower = src.toLowerCase();
    for (const forbidden of [
      "card_number",
      "cardnumber",
      "card number",
      "cvv",
      "cvc",
      "card_expiry",
      "card expiry",
      "expiry_month",
      "otp_code",
      "pin_number",
    ]) {
      expect(lower).not.toContain(forbidden);
    }
  });

  it.each(ROUTES)("$name keeps the honeypot in its own form", ({ src }) => {
    expect(src).toContain('form.get("company_website")');
    expect(src).toContain('name="company_website"');
  });
});

describe("the checkout shell — the theme contributes presentation only", () => {
  it("the authored checkout body carries no form, input or credential", () => {
    const source = songoskritiPreviewSource();
    let n = 0;
    const s = (type: string, props: Record<string, unknown> = {}) => ({
      id: `${type}-${n++}`,
      type,
      props,
    });
    const main = source.main("checkout", s as never)!;
    const flat = [
      ...main,
      ...main.flatMap((section) => section.children ?? []),
      ...main.flatMap((section) =>
        (section.children ?? []).flatMap((child) => child.children ?? []),
      ),
    ];
    const types = flat.map((section) => section.type);
    // Every section is one of the presentation/platform types.
    for (const type of types) {
      expect(CHECKOUT_COMPOSITION_TYPES as readonly string[]).toContain(type);
    }
    // …and none of them can author a form, inject markup or run a plugin.
    for (const forbidden of [
      "html",
      "form",
      "plugin_block",
      "newsletter",
      "quiz",
      "sticky_bar",
    ]) {
      expect(types).not.toContain(forbidden);
    }
  });

  it("the checkout's zone allowlist stays closed", () => {
    const zones = TEMPLATE_ZONES.checkout;
    // The overlay zones (`popup`, `drawer`, `sidebar`) stay OFF the checkout:
    // nothing may cover a payment step.
    expect(zones).not.toContain("popup");
    expect(zones).not.toContain("drawer");
    expect(zones).not.toContain("sidebar");
    // The post-purchase body belongs to the checkout…
    expect(zones).toContain("thank_you");
    // …and the platform's other gated canvases do not.
    expect(zones).not.toContain("password");
    expect(zones).not.toContain("coming_soon");
    expect(zones).not.toContain("not_found");
  });

  it("the theme's checkout body declares the route-owned body slot", () => {
    // The route's form reaches the theme's frame through the platform's
    // route-owned body slot — the same slot the authored page uses.
    expect(PREVIEW_SOURCE).toContain('s("page_content", {})');
    expect(STORE_ROUTE).toContain('contentSlot="page_content"');
    expect(CUSTOM_ROUTE).toContain('contentSlot="page_content"');
  });

  it("both routes grant the cart widgets their context slots", () => {
    for (const { src } of ROUTES) {
      for (const slot of [
        "cart_lines",
        "cart_summary",
        "checkout_steps",
        "payment_methods",
      ]) {
        expect(src).toContain(`${slot}: null`);
      }
    }
  });
});

describe("the checkout shell — the platform's controls are never missing", () => {
  it.each(ROUTES)(
    "$name supplies its OWN payment picker when the theme's body carries none",
    ({ src }) => {
      // The route READS the theme's body and decides, through the tested
      // helper, whether the theme brings a payment block. A body that
      // carries no `payment_methods` section would leave the shopper
      // placing an order with no rail chosen — the order would silently go
      // out on the shared cart's initial "cod" — so the route renders its
      // own picker.
      expect(src).toContain('checkoutShellControls(ast, "shell")');
      expect(src).toContain("showPaymentPicker");
      expect(src).toContain("showPaymentPicker ? paymentPicker : null");
      // The picker is the ROUTE's own: the server's rails, written to the
      // shared cart — never a theme-authored control.
      expect(src).toContain("quote?.settings.methods");
      expect(src).toContain("cart.setMethod");
    },
  );

  it.each(ROUTES)(
    "$name supplies its OWN order summary when the theme's body carries none",
    ({ src }) => {
      // The same rule for the totals: a body that carries no `cart_summary`
      // section would leave "Place Order" enabled with no total shown.
      expect(src).toContain('checkoutShellControls(ast, "shell")');
      expect(src).toContain("showSummary");
      expect(src).toContain("summaryPanel");
      // The summary is the server's quote — never a theme-authored total.
      expect(src).toContain("quote?.totals");
    },
  );

  it("the fallback keeps BOTH controls whatever the theme published", () => {
    // The hand-built checkout is today's checkout, unchanged: it always
    // carries the picker and the summary.
    for (const { src } of ROUTES) {
      expect(src).toContain('checkoutShellControls(ast, "fallback")');
    }
  });
});

describe("the checkout shell — the place-order ACTION is the route's, and it comes last", () => {
  it.each(ROUTES)(
    "$name renders the action in the route's trailing slot, after the theme's band",
    ({ src }) => {
      // The theme cannot place the action, fill it or know it exists: the
      // route alone decides that its own action comes after the theme's
      // composition.
      expect(src).toContain("afterBody=");
      expect(src).toContain("afterBody={");
      // …and the SEAM decides when: the shell puts the action after the
      // theme's band; the hand-built fallback keeps it inside its form.
      expect(src).toContain("submitAfterBody");
      expect(src).toContain("shellControls.submitAfterBody");
    },
  );

  it.each(ROUTES)(
    "$name's action submits the route's OWN form (the HTML form owner)",
    ({ src }) => {
      // The form the route owns carries an id; the action names it, so it
      // can live OUTSIDE the form element (after the theme's band) and still
      // submit it — the browser still validates the form's own fields.
      expect(src).toContain("id={formId}");
      expect(src).toContain("form={formId}");
      // The form is the route's: the action is not a second form.
      expect(src).toContain("const formId = `fq-checkout-form-${slug}`");
    },
  );

  it.each(ROUTES)(
    "$name's form REPORTS the action's state up (the quote owns it)",
    ({ src }) => {
      // The server quote, the pending mutation and the charge hop live with
      // the form, which owns the order write; the action renders outside it,
      // so the form reports the action's state up.
      expect(src).toContain("onSubmitState");
      expect(src).toContain("reportSubmit");
      expect(src).toContain("CheckoutSubmitState");
    },
  );

  it("the seam answers the third question: where does the action render?", () => {
    // `checkoutShellControls` is the ONE seam both routes ask; it now
    // answers where the place-order action renders as well.
    const seam = readFileSync("src/lib/theme-shell-slots.ts", "utf8");
    expect(seam).toContain("submitAfterBody");
    expect(seam).toContain('variant === "shell" && themeBodyRenders(ast)');
  });

  it("the theme's own composition still carries no form, input or action", () => {
    // The AST-level half of the same contract: the theme may only arrange
    // platform-owned pieces.
    const source = songoskritiPreviewSource();
    let n = 0;
    const s = (type: string, props: Record<string, unknown> = {}) => ({
      id: `${type}-${n++}`,
      type,
      props,
    });
    const main = source.main("checkout", s as never)!;
    const flat = [
      ...main,
      ...main.flatMap((section) => section.children ?? []),
      ...main.flatMap((section) =>
        (section.children ?? []).flatMap((child) => child.children ?? []),
      ),
    ];
    for (const section of flat) {
      expect(
        ["form", "input", "button", "submit"].includes(section.type),
        `${section.type} is not a platform-owned piece`,
      ).toBe(false);
    }
  });
});
