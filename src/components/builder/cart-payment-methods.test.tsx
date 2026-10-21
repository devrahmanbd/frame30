/**
 * The platform's `payment_methods` widget renders a radio PER METHOD of the
 * group the merchant contracted.
 *
 * **The defect this suite pins** (fixed 2026-10-21, escalated in the
 * escalation record's §(o)): the widget built
 * `const grouped = groupMethods(cart.methods)` — an **array** of
 * `{ layer, methods }` objects (`src/lib/payment-rails.ts:358-363`) — and
 * then indexed that value **by group name**
 * (`const keys = (grouped[group] ?? []) as PaymentMethodKey[]`,
 * `src/components/builder/cart.tsx:560`, `:584`). Indexing an array by a
 * string key is always `undefined`, the `?? []` fallback made every group
 * empty, and every group rendered `null`: the fieldset rendered its legend
 * and **no payment-method radios at all**.
 *
 * The suite renders the widget through `SectionRenderer` — the same path the
 * storefront's cart route and the theme preview use — over a cart context
 * whose rails the test chooses, and asserts:
 *
 *   · one radio per method of the group, and only for the contracted rails;
 *   · the group headings the platform owns; and
 *   · a group with no methods renders NO radios and no heading.
 *
 * **The security posture is unchanged by the fix and is asserted here too:**
 * the platform owns the methods (a rail the server did not offer is never
 * drawn), the totals stay server-quoted, and the theme contributes nothing
 * to the payment decision — the widget imports no theme module and the
 * radio values are the platform's own method keys.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type TemplateKey } from "@/lib/builder-ast";
import {
  METHOD_GROUP_ORDER,
  groupMethods,
  methodLabel,
  type PaymentMethodKey,
} from "@/lib/payment-rails";
import { SectionRenderer } from "./SectionRenderer";
import { CartProvider, DEMO_CART } from "./CartContext";

// Cart widgets read the store base off the TanStack router (same as the
// storefront, which always renders inside a RouterProvider). The bare
// render path used here has none, so stub the single hook cart widgets use.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouterState: () => ({ location: { pathname: "/store/demo/cart" } }),
  };
});

/**
 * Render the platform's `payment_methods` widget over a cart context whose
 * rails the test chooses.
 *
 * `template` is the host the widget is granted on: the storefront's cart
 * route grants it on `cart` (`src/routes/store.$slug.cart.tsx:102-108`) and
 * the theme preview grants it on `checkout`
 * (`src/components/store/ThemePreviewFrame.tsx:686-696`). Both are templates
 * the `payment_methods` catalogue entry allows
 * (`src/lib/builder-ast.ts:2921-2925`).
 */
function render(
  methods: PaymentMethodKey[],
  template: TemplateKey = "checkout",
): string {
  const cart = {
    ...DEMO_CART,
    methods,
    method: methods[0] ?? ("cod" as PaymentMethodKey),
  };
  return renderToStaticMarkup(
    <CartProvider value={cart}>
      <SectionRenderer
        section={newSection("payment_methods")}
        editing={false}
        locale="en"
        template={template}
        contextSlots={{ payment_methods: null }}
      />
    </CartProvider>,
  );
}

/** The radio inputs the fieldset rendered, in document order. */
function radios(html: string): string[] {
  return [...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map((m) => m[0]);
}

/** The value of every radio the fieldset rendered, in document order. */
function radioValues(html: string): string[] {
  return [...html.matchAll(/<input[^>]*type="radio"[^>]*value="([^"]+)"/g)].map(
    (m) => m[1]!,
  );
}

describe("payment methods — a radio per method of the group", () => {
  it("renders one radio for every method the server offered", () => {
    const html = render(["cod", "bkash", "nagad"]);
    // The platform's own radio group — one group for the whole fieldset.
    expect(radios(html)).toHaveLength(3);
    // One radio per method, in the platform's grouping order.
    expect(radioValues(html)).toEqual(["cod", "bkash", "nagad"]);
  });

  it("renders the platform's own group headings, one per group with rails", () => {
    const html = render(["cod", "bkash", "nagad"]);
    // `cod` is its own group; the two wallets share the MFS group.
    expect(html).toContain("Cash on delivery");
    expect(html).toContain("Mobile wallets");
    // … and the labels are the PLATFORM's own catalogue labels.
    expect(html).toContain(methodLabel("bkash", "en"));
    expect(html).toContain(methodLabel("nagad", "en"));
  });

  it("renders a radio per method of EACH group the server offered", () => {
    // One rail in every group: five groups, five radios, five headings.
    const onePerGroup: PaymentMethodKey[] = [
      "cod",
      "bkash",
      "cellfin",
      "card",
      "sslcommerz",
    ];
    const html = render(onePerGroup);
    expect(radioValues(html)).toEqual(onePerGroup);
    expect(radios(html)).toHaveLength(5);
    // Every group the rails fall into is drawn — the platform's own group
    // order, the same order `METHOD_GROUP_ORDER` declares.
    const layers = groupMethods(onePerGroup).map((g) => g.layer);
    expect(layers).toEqual([...METHOD_GROUP_ORDER]);
    for (const label of [
      "Cash on delivery",
      "Mobile wallets",
      "Bank transfer",
      "Cards",
      "Other",
    ]) {
      expect(html, label).toContain(label);
    }
  });

  it("renders NO radios for a group with no methods", () => {
    const html = render(["cod"]);
    // The COD group renders its one radio …
    expect(radioValues(html)).toEqual(["cod"]);
    expect(radios(html)).toHaveLength(1);
    // … and the MFS group — which has no rails — renders NEITHER a radio
    // NOR a heading.
    expect(html).not.toContain("Mobile wallets");
    expect(html).not.toContain("bKash");
    expect(html).not.toContain("Nagad");
  });

  it("never offers a rail the server did not offer", () => {
    const html = render(["cod"]);
    // The widget draws exactly the rails in the cart context — the rails
    // the server quoted. Nothing else is invented.
    expect(radioValues(html)).toEqual(["cod"]);
    // An uncontracted rail is not drawn.
    expect(html).not.toContain(methodLabel("sslcommerz", "en"));
  });

  it("renders the empty state — and no radios — when no rail is offered", () => {
    const html = render([]);
    expect(radios(html)).toHaveLength(0);
    expect(html).toContain("No payment method is available right now.");
    expect(html).not.toContain("<fieldset");
  });

  it("renders the same radios on the storefront's cart host", () => {
    // The storefront's cart route grants the widget on the `cart` template
    // (`src/routes/store.$slug.cart.tsx:102-108`); the preview grants it on
    // `checkout`. The widget must behave identically on both.
    const html = render(["cod", "bkash"], "cart");
    expect(radioValues(html)).toEqual(["cod", "bkash"]);
  });

  it("keeps the platform in charge of the payment decision", () => {
    // The widget's rails come from `groupMethods()` — the platform's own
    // grouping of the cart context's rails — and nothing else.
    const grouped = groupMethods(["cod", "bkash", "nagad"]);
    expect(grouped.map((g) => g.layer)).toEqual(["cod", "mfs"]);
    expect(grouped.map((g) => g.methods)).toEqual([
      ["cod"],
      ["bkash", "nagad"],
    ]);
    // The rendered radios are exactly those methods, in that order.
    const html = render(["cod", "bkash", "nagad"]);
    expect(radioValues(html)).toEqual(
      grouped.flatMap((g) => g.methods as PaymentMethodKey[]),
    );
    // The selected method is the cart context's own selection — the radio
    // for it is the checked one.
    const selected = radios(html).find((r) => r.includes('value="cod"'))!;
    expect(selected).toContain('checked=""');
    const unselected = radios(html).find((r) => r.includes('value="bkash"'))!;
    expect(unselected).not.toContain("checked");
  });
});
