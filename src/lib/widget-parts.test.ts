/**
 * The composable parts contract — its contract suite.
 *
 * The parts prop is the mechanism that lets a theme describe a widget's
 * INTERIOR: which parts a row is made of, and in which order. The suite
 * pins the four properties that make it safe:
 *
 *   (a) the vocabulary is **closed** — each widget's own list, nothing else;
 *   (b) the author's ORDER survives;
 *   (c) an unknown key is DROPPED, never rendered;
 *   (d) a duplicate is dropped and the list is capped;
 *   (e) an empty or wholly-unknown value yields `[]`, so the caller falls
 *       back to the default;
 *   (f) the default order is **today's** order, byte for byte;
 *   (g) the prop survives a `parseTemplates` round trip ONLY because the
 *       catalogue declares it — `parseSection` copies only declared fields,
 *       so an undeclared prop is dropped on the way to storage;
 *   (h) **the backward-compatibility rule**: an AST written BEFORE the prop
 *       existed parses to the widget's DEFAULT, so a published theme's stored
 *       AST renders byte-identically.
 *
 * The suite also renders the six composable widgets with and without the
 * prop and compares the markup — the compatibility rule asserted on the
 * rendered output, not merely on the parsed props.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  catalogEntry,
  newSection,
  parseAst,
  parseTemplates,
  type SectionType,
} from "@/lib/builder-ast";
import type { WidgetRow } from "@/lib/widget-data";
import { OrdersList, ProfileCard } from "@/components/builder/account";
import { widgetReader, type WidgetCtx } from "@/components/builder/widgets";
import {
  PART_PROP_KEY,
  WIDGET_PART_VOCABULARY,
  defaultParts,
  hasParts,
  partOrder,
  parseOrderedParts,
} from "./widget-parts";

// The cart widgets read the store base off the TanStack router (the same
// stub the cart suite uses) — the bare render path has no router.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouterState: () => ({ location: { pathname: "/store/demo/cart" } }),
  };
});

const BUILDER_AST = readFileSync("src/lib/builder-ast.ts", "utf8");

/** The six widget types the parts contract covers. */
const AFFECTED = [
  "cart_lines",
  "cart_summary",
  "payment_methods",
  "checkout_steps",
  "orders_list",
  "profile_card",
] as const;

/** Today's order — the order the platform's renderers draw the parts in. */
const TODAY: Record<(typeof AFFECTED)[number], readonly string[]> = {
  cart_lines: [
    "title",
    "variant",
    "unitPrice",
    "quantity",
    "lineTotal",
    "remove",
  ],
  cart_summary: ["subtotal", "discount", "shipping", "cod", "vat", "total"],
  payment_methods: ["legend", "groups", "options", "note"],
  checkout_steps: ["labels", "active", "links"],
  orders_list: ["number", "date", "status", "total"],
  profile_card: ["avatar", "name", "email", "phone"],
};

const ALLOWED = TODAY.cart_lines;

describe("the parts vocabulary — closed", () => {
  it("carries one entry for each of the six composable widget types", () => {
    for (const type of AFFECTED) {
      expect(WIDGET_PART_VOCABULARY[type], type).toBeDefined();
      expect(WIDGET_PART_VOCABULARY[type]!.length, type).toBeGreaterThan(0);
      expect(hasParts(type), type).toBe(true);
    }
  });

  it("draws every key from that widget's own vocabulary, once", () => {
    for (const type of AFFECTED) {
      const keys = WIDGET_PART_VOCABULARY[type]!;
      expect(new Set(keys).size, type).toBe(keys.length);
      for (const key of keys) {
        // A key is a bare camelCase token — never a value, never a path.
        expect(key, `${type}.${key}`).toMatch(/^[a-z][A-Za-z0-9]*$/);
      }
    }
  });

  it("shares no key with a value: a part is a NAME, never an amount", () => {
    // The prop is a list of part keys. A value would be a price.
    for (const keys of Object.values(WIDGET_PART_VOCABULARY)) {
      for (const key of keys ?? []) {
        expect(key).not.toMatch(/[0-9০-৯]/);
        expect(key).not.toMatch(/[=৳$€£]/);
        expect(key).not.toMatch(/minor|amount|value/i);
      }
    }
  });

  it("gives a type without a vocabulary no parts at all", () => {
    expect(WIDGET_PART_VOCABULARY["hero"]).toBeUndefined();
    expect(defaultParts("hero")).toEqual([]);
    expect(hasParts("hero")).toBe(false);
  });
});

describe("parseOrderedParts — the author's order survives", () => {
  it("keeps the order the author wrote", () => {
    expect(parseOrderedParts("unitPrice, title", ALLOWED)).toEqual([
      "unitPrice",
      "title",
    ]);
  });

  it("trims the tokens and drops the empty ones", () => {
    expect(parseOrderedParts("  title , , variant  ", ALLOWED)).toEqual([
      "title",
      "variant",
    ]);
  });

  it("drops an unknown key — it is never rendered", () => {
    expect(parseOrderedParts("title, unitprice", ALLOWED)).toEqual(["title"]);
    expect(parseOrderedParts("title, price, total", ALLOWED)).toEqual([
      "title",
    ]);
  });

  it("drops a duplicate", () => {
    expect(parseOrderedParts("title, variant, title", ALLOWED)).toEqual([
      "title",
      "variant",
    ]);
  });

  it("caps the length at the vocabulary's length", () => {
    const long =
      "title,variant,unitPrice,quantity,lineTotal,remove,title,variant";
    expect(parseOrderedParts(long, ALLOWED)).toHaveLength(ALLOWED.length);
  });

  it("returns an empty list for an empty, blank or non-string value", () => {
    expect(parseOrderedParts("", ALLOWED)).toEqual([]);
    expect(parseOrderedParts("   ", ALLOWED)).toEqual([]);
    expect(parseOrderedParts(undefined, ALLOWED)).toEqual([]);
    expect(parseOrderedParts(null, ALLOWED)).toEqual([]);
    expect(parseOrderedParts(42, ALLOWED)).toEqual([]);
  });

  it("returns an empty list when every key is unknown", () => {
    expect(parseOrderedParts("unitprice, price, total", ALLOWED)).toEqual([]);
  });

  it("never throws on a hostile value", () => {
    expect(() =>
      parseOrderedParts({ toString: () => "title" }, ALLOWED),
    ).not.toThrow();
  });
});

describe("defaultParts — today's order, byte for byte", () => {
  it("is today's cart line order", () => {
    expect(defaultParts("cart_lines")).toEqual([
      "title",
      "variant",
      "unitPrice",
      "quantity",
      "lineTotal",
      "remove",
    ]);
  });

  it("is today's cart summary order", () => {
    expect(defaultParts("cart_summary")).toEqual([
      "subtotal",
      "discount",
      "shipping",
      "cod",
      "vat",
      "total",
    ]);
  });

  it("is today's order for the other four", () => {
    for (const type of AFFECTED) {
      expect(defaultParts(type), type).toEqual(TODAY[type]);
    }
  });

  it("hands out a copy — a caller cannot mutate the shared vocabulary", () => {
    const first = defaultParts("cart_lines") as string[];
    first.push("tampered");
    expect(defaultParts("cart_lines")).toHaveLength(6);
  });
});

describe("partOrder — the effective order", () => {
  it("is the author's list when it is usable", () => {
    expect(partOrder("quantity, title", "cart_lines")).toEqual([
      "quantity",
      "title",
    ]);
  });

  it("falls back to the default for an empty or wholly-unknown value", () => {
    expect(partOrder("", "cart_lines")).toEqual(TODAY.cart_lines);
    expect(partOrder("   ", "cart_lines")).toEqual(TODAY.cart_lines);
    expect(partOrder(undefined, "cart_lines")).toEqual(TODAY.cart_lines);
    expect(partOrder("unitprice", "cart_lines")).toEqual(TODAY.cart_lines);
  });

  it("keeps the known keys of a partly-unknown list", () => {
    expect(partOrder("title, unitprice, variant", "cart_lines")).toEqual([
      "title",
      "variant",
    ]);
  });

  it("is the default for a type with no vocabulary", () => {
    expect(partOrder("title", "hero")).toEqual([]);
  });
});

describe("the catalogue declares the prop — the round trip", () => {
  it("declares a `parts` field on every composable row", () => {
    for (const type of AFFECTED) {
      const entry = catalogEntry(type);
      expect(entry, type).toBeDefined();
      const field = entry!.fields.find((f) => f.key === PART_PROP_KEY);
      expect(field, `${type}.${PART_PROP_KEY}`).toBeDefined();
      // The platform's existing comma-separated-list convention — a plain
      // text field. No new inspector field kind.
      expect(field!.kind, type).toBe("text");
    }
  });

  it("declares the `layout` field on the three list widgets", () => {
    for (const type of [
      "cart_lines",
      "orders_list",
      "payment_methods",
    ] as const) {
      const field = catalogEntry(type)!.fields.find((f) => f.key === "layout");
      expect(field, type).toBeDefined();
      expect(field!.kind, type).toBe("select");
      expect(
        field!.options?.map((o) => o.value),
        type,
      ).toEqual(["row", "card"]);
    }
  });

  it("declares the prop on the catalogue row for `cart_lines`, as text", () => {
    // The catalogue is a data table the compiler cannot check for a field
    // it does not know — the row is read as TEXT and the field asserted.
    const at = BUILDER_AST.indexOf('type: "cart_lines"');
    expect(
      at,
      "builder-ast.ts must declare the cart_lines row",
    ).toBeGreaterThan(0);
    const row = BUILDER_AST.slice(at, at + 1200);
    expect(row).toContain(`"${PART_PROP_KEY}"`);
    expect(row).toContain('"layout"');
  });

  it("carries the prop through a parse → serialise → parse round trip", () => {
    const parsed = parseTemplates({
      cart: {
        main: [
          {
            id: "lines-1",
            type: "cart_lines",
            props: { [PART_PROP_KEY]: "quantity,title,remove" },
          },
        ],
      },
    });
    const node = parsed.cart?.main[0];
    expect(node?.type).toBe("cart_lines");
    expect(node?.props?.[PART_PROP_KEY]).toBe("quantity,title,remove");
    // The serialised form parses back to the same value.
    const again = parseTemplates(JSON.parse(JSON.stringify(parsed)));
    expect(again.cart?.main[0]?.props?.[PART_PROP_KEY]).toBe(
      "quantity,title,remove",
    );
  });

  it("DROPS the prop when the catalogue does not declare it", () => {
    // The guard the round trip depends on: an undeclared prop is dropped on
    // the way to storage, with no error anywhere.
    const parsed = parseAst({
      main: [
        {
          id: "spacer-1",
          type: "spacer",
          props: { [PART_PROP_KEY]: "title,variant" },
        },
      ],
    });
    expect(parsed.main[0]?.props?.[PART_PROP_KEY]).toBeUndefined();
  });
});

describe("the backward-compatibility rule — a stored AST renders identically", () => {
  it("gives a stored AST written before the prop the widget's default", () => {
    // The AST a published theme carries today: no `parts` key at all.
    const stored = parseAst({
      main: [
        { id: "lines-1", type: "cart_lines", props: { heading: "Your items" } },
      ],
    });
    const node = stored.main[0]!;
    expect(node.props?.[PART_PROP_KEY]).toBe(TODAY.cart_lines.join(","));
    expect(partOrder(node.props?.[PART_PROP_KEY], "cart_lines")).toEqual(
      TODAY.cart_lines,
    );
  });

  it("gives the default to every composable type, not just `cart_lines`", () => {
    for (const type of AFFECTED) {
      const stored = parseAst({
        main: [{ id: `n-${type}`, type, props: {} }],
      });
      const node = stored.main[0]!;
      expect(node.props?.[PART_PROP_KEY], type).toBe(TODAY[type].join(","));
      expect(partOrder(node.props?.[PART_PROP_KEY], type), type).toEqual(
        TODAY[type],
      );
    }
  });

  it("keeps an authored order across the round trip", () => {
    const stored = parseAst({
      main: [
        {
          id: "lines-1",
          type: "cart_lines",
          props: { [PART_PROP_KEY]: "quantity,title" },
        },
      ],
    });
    expect(stored.main[0]?.props?.[PART_PROP_KEY]).toBe("quantity,title");
  });
});

/* ------------------------------------------------------------- the markup */

const ORDER_ROWS: WidgetRow[] = [
  {
    id: "demo-ord-1",
    title: "ORD-1001",
    subtitle: "delivered",
    priceMinor: 129900,
    currency: "BDT",
    date: "2026-09-10T10:00:00.000Z",
  },
];

const PROFILE_ROW: WidgetRow = {
  id: "demo-profile",
  title: "Demo Shopper",
  subtitle: "demo@example.com",
  body: "01700000000",
};

/** A section with a STABLE id — the rendered markup must be comparable. */
function sectionOf(type: SectionType, props: Record<string, string> = {}) {
  const section = newSection(type);
  return {
    ...section,
    id: `parts-${type}`,
    props: { ...section.props, ...props },
  };
}

/** The same section with the `parts` prop removed — a pre-change AST. */
function withoutParts(type: SectionType) {
  const section = sectionOf(type);
  const props = { ...section.props };
  delete props[PART_PROP_KEY];
  return { ...section, props };
}

async function renderCommerce(
  type: SectionType,
  props?: Record<string, string>,
): Promise<string> {
  const { SectionRenderer } =
    await import("@/components/builder/SectionRenderer");
  return renderToStaticMarkup(
    createElement(SectionRenderer, {
      section: sectionOf(type, props),
      editing: false,
      locale: "en" as const,
      template: "cart" as const,
      storeSlug: "demo",
      contextSlots: { [type]: null },
    }),
  );
}

async function renderCommerceWithout(type: SectionType): Promise<string> {
  const { SectionRenderer } =
    await import("@/components/builder/SectionRenderer");
  return renderToStaticMarkup(
    createElement(SectionRenderer, {
      section: withoutParts(type),
      editing: false,
      locale: "en" as const,
      template: "cart" as const,
      storeSlug: "demo",
      contextSlots: { [type]: null },
    }),
  );
}

function accountCtx(
  type: "orders_list" | "profile_card",
  data?: { rows?: WidgetRow[]; pending: boolean },
  props: Record<string, string> = {},
): WidgetCtx {
  const section = {
    id: `test-${type}`,
    type: type as unknown as SectionType,
    props: { ...props },
  };
  return {
    section,
    ...widgetReader(section, undefined, "en"),
    link: (href: string) => href,
    Heading: "h2",
    primary: false,
    editing: false,
    locale: "en",
    storeSlug: "test-store",
    data,
    renderChildren: () => null,
  };
}

describe("the composable widgets — the markup with and without the prop", () => {
  it("renders `cart_lines` identically with and without the prop", async () => {
    const withProp = await renderCommerce("cart_lines");
    const without = await renderCommerceWithout("cart_lines");
    expect(withProp).toBe(without);
  });

  it("renders `cart_summary` identically with and without the prop", async () => {
    const withProp = await renderCommerce("cart_summary");
    const without = await renderCommerceWithout("cart_summary");
    expect(withProp).toBe(without);
  });

  it("renders `checkout_steps` identically with and without the prop", async () => {
    const withProp = await renderCommerce("checkout_steps");
    const without = await renderCommerceWithout("checkout_steps");
    expect(withProp).toBe(without);
  });

  it("renders `payment_methods` identically with and without the prop", async () => {
    const withProp = await renderCommerce("payment_methods");
    const without = await renderCommerceWithout("payment_methods");
    expect(withProp).toBe(without);
  });

  it("renders `orders_list` identically with and without the prop", () => {
    const withProp = renderToStaticMarkup(
      createElement(OrdersList, {
        ...accountCtx(
          "orders_list",
          { rows: ORDER_ROWS, pending: false },
          {
            [PART_PROP_KEY]: TODAY.orders_list.join(","),
          },
        ),
      }),
    );
    const without = renderToStaticMarkup(
      createElement(OrdersList, {
        ...accountCtx("orders_list", { rows: ORDER_ROWS, pending: false }),
      }),
    );
    expect(withProp).toBe(without);
  });

  it("renders `profile_card` identically with and without the prop", () => {
    const withProp = renderToStaticMarkup(
      createElement(ProfileCard, {
        ...accountCtx(
          "profile_card",
          { rows: [PROFILE_ROW], pending: false },
          {
            [PART_PROP_KEY]: TODAY.profile_card.join(","),
          },
        ),
      }),
    );
    const without = renderToStaticMarkup(
      createElement(ProfileCard, {
        ...accountCtx("profile_card", { rows: [PROFILE_ROW], pending: false }),
      }),
    );
    expect(withProp).toBe(without);
  });
});

describe("the composable widgets — today's order is today's markup", () => {
  it("draws the cart line's parts in today's order", async () => {
    const html = await renderCommerce("cart_lines");
    const title = html.indexOf("Sample product");
    const variant = html.indexOf("Default");
    const unitPrice = html.indexOf("৳ 990.00");
    const quantity = html.indexOf("Quantity for Sample product");
    const lineTotal = html.indexOf("w-24 shrink-0");
    const remove = html.indexOf("Remove");
    expect([title, variant, unitPrice, quantity, lineTotal, remove]).toEqual(
      [...[title, variant, unitPrice, quantity, lineTotal, remove]].sort(
        (a, b) => a - b,
      ),
    );
  });

  it("draws the summary's totals in today's order", async () => {
    const html = await renderCommerce("cart_summary");
    expect(html.indexOf("Subtotal")).toBeLessThan(html.indexOf("Delivery"));
    expect(html.indexOf("Delivery")).toBeLessThan(html.indexOf("Total"));
  });

  it("draws the order row's parts in today's order", () => {
    const html = renderToStaticMarkup(
      createElement(OrdersList, {
        ...accountCtx("orders_list", { rows: ORDER_ROWS, pending: false }),
      }),
    );
    expect(html.indexOf("ORD-1001")).toBeLessThan(html.indexOf("delivered"));
  });
});
