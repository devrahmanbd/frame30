/**
 * Task 4 — the PREVIEW SAFETY contract.
 *
 * Two rules, both about a surface that looks live:
 *
 *  (a) **No blank required slot.** Every CONTEXT widget the theme places (a
 *      catalogue section with a `templates` list — `SectionRenderer` renders
 *      it only when the host grants its slot) is granted by the production
 *      host AND by the preview. Templates whose route supplies its own
 *      surface instead (the collection grid/header) are named explicitly.
 *  (b) **No control that looks live but is inert.** The anonymous account
 *      renders the platform's one order-lookup panel, never a blank profile;
 *      a rail-less store cannot submit and says why in ONE shared sentence;
 *      the preview's payment radio is locally stateful and visibly a demo;
 *      every interactive element the preview cart/checkout renders either
 *      navigates, is intercepted with a named reason, or sits under the demo
 *      marker.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, useMemo } from "react";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => () => undefined,
    Link: ({
      to,
      params,
      search,
      children,
      ...rest
    }: {
      to: string;
      params?: unknown;
      search?: unknown;
      children?: React.ReactNode;
    }) =>
      createElement(
        "a",
        {
          "data-link-to": to,
          "data-link-params": JSON.stringify(params ?? null),
          "data-link-search": JSON.stringify(search ?? null),
          ...rest,
        },
        children,
      ),
  };
});

vi.mock("@/components/store/StoreHeader", () => ({
  StoreHeader: ({ slug, name }: { slug: string; name: string }) =>
    createElement(
      "header",
      null,
      createElement("a", { href: "/" }, name),
      createElement("a", { href: `/store/${slug}/checkout` }, "Checkout"),
    ),
  MinimalCheckoutHeader: ({ name }: { name: string }) =>
    createElement("header", null, name),
}));

import {
  DEFAULT_TOKENS,
  TEMPLATE_KEYS,
  catalogEntry,
  flattenSections,
  type SectionBuilder,
  type TemplateKey,
  type ThemeAst,
} from "./builder-ast";
import { songoskritiPreviewSource } from "./themes/songoskriti/preview";
import { ThemePreviewFrame } from "@/components/store/ThemePreviewFrame";
import { usePreviewRailSelection } from "@/components/store/ThemePreviewFrame";
import { AccountDashboard } from "@/components/store/AccountDashboard";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
import { CartProvider } from "@/components/builder/CartContext";
import { PAYMENT_METHOD_CATALOG } from "./payment-rails";
import { noPaymentRailMessage } from "./payment-rail-empty";
import { CheckoutSubmit } from "@/routes/store.$slug.checkout";
import { checkoutSubmitState } from "@/lib/checkout-submit-state";

const read = (path: string): string => readFileSync(path, "utf8");

/** The balanced `{…}` block that starts at the first `{` after `marker`. */
function block(src: string, marker: string): string {
  const at = src.indexOf(marker);
  expect(at, `the source must contain ${marker}`).toBeGreaterThanOrEqual(0);
  const open = src.indexOf("{", at + marker.length - 1);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced block after ${marker}`);
}

/** True when the name is a catalogue widget — i.e. a grantable slot. */
function isSlot(name: string): boolean {
  return catalogEntry(name as never) !== undefined;
}

/**
 * The slots a host grants, read from its source: object keys, shorthand
 * keys, and the keys of a local map spread into the grant (`...accountSlots`),
 * including maps built by `out.<slot> = …` assignment.
 */
function grantedSlots(src: string, marker: string): string[] {
  const body = block(src, marker);
  const slots = new Set<string>();
  for (const m of body.matchAll(/([a-z_]+)\s*:/g))
    if (isSlot(m[1]!)) slots.add(m[1]!);
  for (const m of body.matchAll(/([a-z_]+)\s*,/g))
    if (isSlot(m[1]!)) slots.add(m[1]!);
  for (const m of body.matchAll(/\.\.\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const name = m[1]!;
    if (!src.includes(`const ${name} =`)) continue;
    const local = block(src, `const ${name} =`);
    for (const k of local.matchAll(/([a-z_]+)\s*:/g))
      if (isSlot(k[1]!)) slots.add(k[1]!);
    for (const a of local.matchAll(/out\.([a-z_]+)\s*=/g))
      if (isSlot(a[1]!)) slots.add(a[1]!);
  }
  return [...slots].sort();
}

/** The theme's own body for one template. */
function themeMain(template: TemplateKey) {
  let n = 0;
  const s: SectionBuilder = (type, props = {}) => ({
    id: `${type}-${n++}`,
    type,
    props: { ...props },
  });
  return songoskritiPreviewSource().main(template, s) ?? [];
}

/** Context widgets the theme places, i.e. sections that REQUIRE a grant. */
function requiredSlots(template: TemplateKey): string[] {
  return [...new Set(flattenSections(themeMain(template)).map((s) => s.type))]
    .filter((type) => catalogEntry(type)?.templates?.includes(template))
    .sort();
}

const PREVIEW = read("src/components/store/ThemePreviewFrame.tsx");
const CART_ROUTE = read("src/routes/store.$slug.cart.tsx");
const CHECKOUT_ROUTE = read("src/routes/store.$slug.checkout.tsx");
const ACCOUNT_ROUTE = read("src/routes/store.$slug.account.tsx");
const SEARCH_ROUTE = read("src/routes/store.$slug.search.tsx");
const PRODUCT_VIEW = read("src/components/store/ProductView.tsx");
const PAGE_VIEW = read("src/components/store/PageView.tsx");
const BLOG_HOST = read("src/components/store/BlogArchiveTheme.tsx");
const COLLECTION_VIEW = read("src/components/store/CollectionView.tsx");

const HOSTS: Partial<
  Record<TemplateKey, { src: string; marker: string; label: string }>
> = {
  cart: { src: CART_ROUTE, marker: "contextSlots={{", label: "cart route" },
  checkout: {
    src: CHECKOUT_ROUTE,
    marker: "contextSlots={{",
    label: "checkout route",
  },
  account: {
    src: ACCOUNT_ROUTE,
    marker: "contextSlots={{",
    label: "account route",
  },
  search: {
    src: SEARCH_ROUTE,
    marker: "contextSlots={{",
    label: "search route",
  },
  product: {
    src: PRODUCT_VIEW,
    marker: "contextSlots={{",
    label: "product view",
  },
  page: { src: PAGE_VIEW, marker: "contextSlots={{", label: "page view" },
  blog: {
    src: BLOG_HOST,
    marker: "contextSlots={{",
    label: "blog host",
  },
};

function previewGrants(template: TemplateKey): string[] {
  if (template === "account")
    return [
      ...new Set([
        ...grantedSlots(PREVIEW, "const accountSlots ="),
        ...grantedSlots(PREVIEW, "const accountBodySlot ="),
      ]),
    ].sort();
  if (template === "cart") return grantedSlots(PREVIEW, "const cartSlots =");
  if (template === "checkout")
    return grantedSlots(PREVIEW, "const checkoutSlots =");
  if (template === "search")
    return grantedSlots(PREVIEW, "const searchSlots =");
  if (template === "blog") return grantedSlots(PREVIEW, "const blogSlots =");
  if (template === "page") return grantedSlots(PREVIEW, "const pageSlots =");
  if (template === "product") {
    // The product host is a HOOK (`useMockProductSlots`), not a literal map:
    // its returned object is the preview's grant set.
    const at = PREVIEW.indexOf("function useMockProductSlots");
    const hook = PREVIEW.slice(at);
    const body = block(hook, "return {");
    return [
      ...new Set([...body.matchAll(/([a-z_]+)\s*[,:]/g)].map((m) => m[1]!)),
    ]
      .filter(isSlot)
      .sort();
  }
  return [];
}

/**
 * Templates whose route supplies its own designed surface instead of a
 * theme slot. CollectionView renders the collection's own `<h1>`, filter
 * toolbar and grid (`productSlot`/`collectionSlot`) around the theme body;
 * the theme's `category_header`/`result_toolbar` are therefore not required
 * grants there. The archive has no merchant-scoped route at all, so the
 * preview's own grant set is its contract.
 */
const ROUTE_REPLACED: Partial<Record<TemplateKey, string[]>> = {
  collection: ["category_header", "result_toolbar"],
};

const REASONS = "route-replaced";

function buildTemplates(): Record<TemplateKey, ThemeAst> {
  return Object.fromEntries(
    TEMPLATE_KEYS.map((key) => [
      key,
      { header: [], main: themeMain(key), footer: [] },
    ]),
  ) as unknown as Record<TemplateKey, ThemeAst>;
}

function renderPreview(template: TemplateKey): string {
  return renderToStaticMarkup(
    createElement(ThemePreviewFrame, {
      themeName: "Songoskriti",
      author: "songoskriti",
      blueprintKey: "songoskriti",
      tokens: DEFAULT_TOKENS,
      templates: buildTemplates(),
      initialTemplate: template,
      onClose: () => undefined,
    }),
  );
}

/** The cart the rail is rendered against — two catalogue rails, no money. */
const RAIL_CART = {
  lines: [],
  count: 0,
  totals: null,
  pending: false,
  error: null,
  methods: ["cod", "bkash"] as string[],
  method: "cod" as string,
  setMethod: () => {},
  couponCode: "",
  setCouponCode: () => {},
  setQuantity: () => {},
  remove: () => {},
  clear: () => {},
  live: false,
};

/**
 * The rail, rendered with the preview's OWN local selection.
 *
 * `click` chooses the SECOND catalogue rail — the exact call the radio's
 * `onChange` makes (`cart.setMethod(key)`). The selection is the preview's
 * own hook (`usePreviewRailSelection`), and the radio is the platform's own
 * `payment_methods` widget.
 */
function renderRail({ click }: { click: boolean }): string {
  function RailHarness() {
    const { method, setMethod } = usePreviewRailSelection();
    const cart = useMemo(
      () => ({
        ...RAIL_CART,
        method,
        setMethod: (next: string) => setMethod(next as never),
      }),
      [method, setMethod],
    );
    // The click: choose the second catalogue rail.
    if (click && method === "cod") setMethod("bkash" as never);
    return createElement(
      CartProvider,
      { value: cart as never },
      createElement(SectionRenderer, {
        section: {
          id: "payment_methods-0",
          type: "payment_methods",
          props: {},
        },
        template: "cart",
        editing: false,
        contextSlots: { payment_methods: null },
      }),
    );
  }
  return renderToStaticMarkup(createElement(RailHarness));
}

describe("Task 4 (a) — no blank required slot", () => {
  for (const template of TEMPLATE_KEYS) {
    const required = requiredSlots(template);
    if (required.length === 0) continue;
    const host = HOSTS[template];
    const replaced = ROUTE_REPLACED[template] ?? [];

    it(`${template}: every context widget is granted or route-replaced`, () => {
      if (host) {
        const granted = grantedSlots(host.src, host.marker);
        const missing = required.filter(
          (slot) => !granted.includes(slot) && !replaced.includes(slot),
        );
        expect(
          missing,
          `${host.label} must grant these theme slots (or name them ${REASONS})`,
        ).toEqual([]);
      } else {
        // Only collection (route-replaced) and archive (route-less) reach
        // here; index places no context widget at all.
        expect(
          replaced.length > 0 || template === "archive",
          `${template} has no host grant map and names no replacement`,
        ).toBe(true);
      }

      // The PREVIEW must grant the same slots on the same template.
      if (template !== "collection" && template !== "archive") {
        const preview = previewGrants(template);
        const missing = required.filter(
          (slot) => !preview.includes(slot) && !replaced.includes(slot),
        );
        expect(
          missing,
          `the preview must grant the same ${template} slots`,
        ).toEqual([]);
      }
    });
  }

  it("cart, checkout and account required sets are exactly the reviewed ones", () => {
    expect(requiredSlots("cart")).toEqual(["cart_lines", "cart_summary"]);
    expect(requiredSlots("checkout")).toEqual([
      "cart_summary",
      "checkout_steps",
      "page_content",
      "payment_methods",
    ]);
    expect(requiredSlots("account")).toEqual([
      "account_nav",
      "account_orders",
      "account_overview",
      "page_content",
    ]);
  });

  it("archive — the preview's grants cover the template's required slots", () => {
    const preview = grantedSlots(PREVIEW, "const archiveSlots =");
    // The merchant-scoped route that landed in Batch B grants the same six
    // through the shared archive host (`preview-parity.contract.test.ts`
    // pins the equality); this suite keeps the required-subset premise.
    expect(
      requiredSlots("archive").filter((slot) => !preview.includes(slot)),
    ).toEqual([]);
  });

  it("collection replaces the theme header/toolbar with its own designed surface", () => {
    const required = requiredSlots("collection");
    expect(required).toEqual(["category_header", "result_toolbar"]);
    // The route owns the h1, the filter toolbar and the grid around the body.
    expect(COLLECTION_VIEW).toContain("<h1");
    expect(COLLECTION_VIEW).toContain("productSlot={grid}");
    expect(COLLECTION_VIEW).toContain("fallback={grid}");
  });
});

describe("Task 4 (b) — the anonymous account is a designed state, not a blank", () => {
  it("grants the theme's profile card only to a signed-in shopper", () => {
    expect(ACCOUNT_ROUTE).toMatch(/if \(p && signedIn\) \{/);
    expect(ACCOUNT_ROUTE).not.toMatch(
      /if \(p\) \{[\s\S]{0,200}out\.profile_card/,
    );
  });

  it("renders the platform's one order-lookup panel when signed out", () => {
    const markup = renderToStaticMarkup(
      createElement(AccountDashboard, {
        slug: "demo",
        overview: undefined,
        status: "unauthenticated",
        tab: "orders",
        currency: "BDT",
      }),
    );
    expect(markup).toContain("order-lookup-input");
    expect(markup).toContain("order-lookup-code");
    // No profile card, no invented shopper.
    expect(markup).not.toContain("profile-card");
  });
});

/** The action's own `<button>` tag — the attributes, not the class list. */
function actionButtonTag(markup: string): string {
  return /<button\b[^>]*>/.exec(markup)?.[0] ?? "";
}

/** True when the action's button carries the `disabled` ATTRIBUTE. */
function actionIsDisabled(markup: string): boolean {
  return /\sdisabled(=|\s|>)/.test(actionButtonTag(markup));
}

describe("Task 4 (c) — a rail-less store cannot submit and says why once", () => {
  it("RENDERS a disabled place-order action that names the reason", () => {
    // The RENDER, not a source string: the SERVER offers no rail, so the
    // action is disabled and the notice under it names the reason.
    const state = checkoutSubmitState({
      totals: { totalMinor: 100 },
      pending: false,
      chargeHop: "idle",
      offered: [],
      lang: "en",
      label: "Place Order",
    });
    expect(state.disabled).toBe(true);
    expect(state.notice).toBe(noPaymentRailMessage("en"));

    const markup = renderToStaticMarkup(
      createElement(CheckoutSubmit, {
        state,
        formId: "fq-checkout-form",
      }),
    );
    // The button is disabled…
    expect(actionIsDisabled(markup)).toBe(true);
    expect(markup).toContain('type="submit"');
    expect(markup).toContain('form="fq-checkout-form"');
    // …and the notice names the reason, in the ONE shared sentence.
    expect(markup).toContain(noPaymentRailMessage("en"));
  });

  it("RENDERS an enabled place-order action when the server offers a rail", () => {
    const state = checkoutSubmitState({
      totals: { totalMinor: 100 },
      pending: false,
      chargeHop: "idle",
      offered: ["cod"],
      lang: "en",
      label: "Place Order",
    });
    expect(state.disabled).toBe(false);
    expect(state.notice).toBeNull();
    const markup = renderToStaticMarkup(
      createElement(CheckoutSubmit, {
        state,
        formId: "fq-checkout-form",
      }),
    );
    expect(actionIsDisabled(markup)).toBe(false);
    expect(markup).toContain("Place Order");
  });

  it("the route WIRES the server's rails into that decision", () => {
    // The wiring scan, kept IN ADDITION to the renders above: the route's
    // own decision is the pure function the renders exercise, and it is fed
    // the SERVER's rails.
    expect(CHECKOUT_ROUTE).toContain("checkoutSubmitState({");
    expect(CHECKOUT_ROUTE).toContain("offered,");
    expect(CHECKOUT_ROUTE).toContain("noPaymentRailMessage(lang)");
  });

  it("uses ONE shared sentence in the theme's widget and the route's picker", () => {
    expect(CHECKOUT_ROUTE).toContain('from "@/lib/payment-rail-empty"');
    expect(read("src/components/builder/cart.tsx")).toContain(
      'from "@/lib/payment-rail-empty"',
    );
    const shared = read("src/lib/payment-rail-empty.ts");
    expect(
      shared.match(/No payment method is available right now\./g),
    ).toHaveLength(1);
    // The old second sentence is gone from the route and widget.
    for (const src of [
      CHECKOUT_ROUTE,
      read("src/components/builder/cart.tsx"),
    ]) {
      expect(src).not.toContain(
        "This store has not enabled any payment method yet.",
      );
    }
  });
});

/**
 * True when the radio for `value` is the CHECKED one.
 *
 * The markup's attribute order is React's, not ours, so the radio's tag is
 * read and its own attributes are inspected.
 */
function isChecked(markup: string, value: string): boolean {
  const tag = [...markup.matchAll(/<input\b[^>]*>/g)]
    .map((m) => m[0])
    .find((t) => t.includes('type="radio"') && t.includes(`value="${value}"`));
  if (!tag) return false;
  return /\schecked(=|\s|>)/.test(tag);
}

describe("Task 4 (d) — the preview rail is local, labelled, and never inert", () => {
  it("choosing a rail CHANGES the selection (the radio is locally stateful)", () => {
    // The INTERACTION, not a source string: the rail's `onChange` calls
    // `cart.setMethod(key)`, the preview's cart context turns that into a
    // local state transition, and the rail's `checked` state follows it.
    //
    // The repo has no DOM environment (no jsdom, and this programme adds no
    // dependency), so the DOM event dispatch is the one step that cannot be
    // exercised here. Everything the event triggers IS exercised: the SAME
    // `usePreviewRailSelection` hook the preview frame uses, the SAME cart
    // context shape, and the SAME `payment_methods` widget that renders the
    // radio — driven by the SAME call the radio's `onChange` makes.
    const before = renderRail({ click: false });
    expect(before).toContain('value="cod"');
    expect(isChecked(before, "cod")).toBe(true);
    expect(isChecked(before, "bkash")).toBe(false);

    const after = renderRail({ click: true });
    // The selection changed: the SECOND rail is now the checked one, and
    // the first is not.
    expect(isChecked(after, "bkash")).toBe(true);
    expect(isChecked(after, "cod")).toBe(false);
    // The rail itself is unchanged — only the selection moved.
    expect(after).toContain('value="cod"');
    expect(after).toContain('name="fq-payment-method"');
  });

  it("the preview frame's own rail is the initial selection", () => {
    // The frame renders the rail with the initial (local) selection checked,
    // and the OTHER catalogue rail is present but not checked.
    const markup = renderPreview("checkout");
    expect(isChecked(markup, "cod")).toBe(true);
    expect(isChecked(markup, "bkash")).toBe(false);
    // …and the frame uses the very hook the interaction above drives.
    expect(PREVIEW).toContain("usePreviewRailSelection()");
    expect(PREVIEW).toContain("method: previewMethod");
    expect(PREVIEW).toContain(
      "setMethod: (method: PaymentMethodKey) => setPreviewMethod(method)",
    );
  });

  it("marks the rail block as a demo on cart and checkout", () => {
    for (const template of ["cart", "checkout"] as const) {
      const markup = renderPreview(template);
      expect(markup).toContain('data-fq-demo-marker="payment-methods"');
      expect(markup).toContain("Disabled in preview");
    }
    expect(renderPreview("index")).not.toContain(
      'data-fq-demo-marker="payment-methods"',
    );
  });

  it("renders every interactive element as live, intercepted, or demo-marked", () => {
    for (const template of ["cart", "checkout"] as const) {
      const markup = renderPreview(template);

      // The demo marker is visible on the same page as the rail.
      expect(markup).toContain('data-fq-demo-marker="payment-methods"');

      const links = [...markup.matchAll(/<a\b([^>]*)>/g)].map((m) => m[1]!);
      expect(links.length).toBeGreaterThan(0);
      for (const attrs of links) {
        const href = /href="([^"]*)"/.exec(attrs)?.[1];
        expect(href, `every anchor needs an href: ${attrs}`).toBeTruthy();
        expect(href).not.toBe("#");
      }

      const radios = [
        ...markup.matchAll(/<input\b([^>]*type="radio"[^>]*)>/g),
      ].map((m) => m[1]!);
      for (const attrs of radios) {
        expect(attrs).toContain('name="fq-payment-method"');
        const value = /value="([^"]*)"/.exec(attrs)?.[1];
        expect(value && value in PAYMENT_METHOD_CATALOG).toBe(true);
      }

      const buttons = [
        ...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g),
      ];
      for (const [, attrs, inner] of buttons) {
        const label = inner.replace(/<[^>]*>/g, "").trim();
        const named = /aria-label="[^"]+"/.test(attrs ?? "");
        expect(
          label.length > 0 || named,
          `every button must say what it does: ${attrs}`,
        ).toBe(true);
      }

      const inputs = [...markup.matchAll(/<input\b([^>]*)>/g)].map(
        (m) => m[1]!,
      );
      for (const attrs of inputs) {
        expect(attrs, `every input needs a type: ${attrs}`).toContain("type=");
      }
    }
  });
});
