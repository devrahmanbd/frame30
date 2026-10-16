/**
 * Frame30 — SchemaControls contract tests (written first, TDD).
 *
 * Rendering precedent: existing component suites in this repo render with
 * `renderToStaticMarkup` (see `WidgetBoundary.test.tsx`) because the vitest
 * environment is `node` and `@testing-library/react` is not in devDeps — so
 * interaction is covered by pure state-transition tests on the exported
 * change handlers, not by DOM events. The module does not exist yet, so this
 * suite starts red.
 *
 * Server/client parity: these tests import `validateProps` from the SAME
 * `@/lib/widget-props` module the server save path calls, and drive the
 * component's submit path through it.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import {
  CONTROL_STATUS,
  PROP_KINDS,
  defaultsFor,
  validateProps,
  type PropField,
  type PropSchema,
  type WidgetProps,
} from "@/lib/widget-props";
import {
  SchemaControls,
  applyRepeaterRowChange,
  applySchemaChange,
  submitSchemaProps,
} from "./SchemaControls";

function html(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

const noop = () => {};

const FULL_SCHEMA: PropSchema = [
  {
    key: "title",
    label: "Title",
    kind: "text",
    help: "Card headline.",
    required: true,
  },
  { key: "count", label: "Count", kind: "number", min: 0, max: 10 },
  { key: "on", label: "Enabled", kind: "boolean" },
  {
    key: "align",
    label: "Align",
    kind: "select",
    options: [
      { value: "left", label: "Left" },
      { value: "center", label: "Center" },
    ],
  },
  { key: "fg", label: "Colour", kind: "color" },
  { key: "pad", label: "Padding", kind: "spacing" },
];

const FULL_PROPS: WidgetProps = {
  title: "Hello",
  count: 3,
  on: true,
  align: "center",
  fg: "#ff0000",
  pad: { top: 1, right: 2, bottom: 3, left: 4, unit: "px" },
};

describe("full controls", () => {
  it("renders labelled controls with values, help and required markers", () => {
    const out = html(
      <SchemaControls
        schema={FULL_SCHEMA}
        props={FULL_PROPS}
        onChange={noop}
      />,
    );
    for (const label of [
      "Title",
      "Count",
      "Enabled",
      "Align",
      "Colour",
      "Padding",
    ]) {
      expect(out).toContain(label);
    }
    expect(out).toContain("Hello");
    expect(out).toContain("Card headline.");
    expect(out).toContain("required");
    expect(out).toContain("#ff0000");
    expect(out).toContain("center");
  });

  it("pairs every label with its control", () => {
    const out = html(
      <SchemaControls
        schema={FULL_SCHEMA}
        props={FULL_PROPS}
        onChange={noop}
      />,
    );
    const fors = [...out.matchAll(/ for="([^"]+)"/g)].map((m) => m[1]);
    expect(fors.length).toBeGreaterThan(0);
    for (const id of fors) {
      expect(out).toContain(`id="${id}"`);
    }
  });
});

describe("media and data pickers (former placeholders, now editable)", () => {
  const PICKERS: PropSchema = (
    ["image", "media", "video", "product", "collection"] as const
  ).map((kind) => ({ key: `p_${kind}`, label: `${kind} pick`, kind }));

  it("renders editable pickers with the same props contract", () => {
    const out = html(
      <SchemaControls
        schema={PICKERS}
        props={{ p_image: "/a.jpg", p_product: "prod_1" }}
        onChange={noop}
      />,
    );
    for (const kind of ["image", "media", "video", "product", "collection"]) {
      expect(out).toContain(`${kind} pick`);
      expect(out).toContain(`data-placeholder="${kind}"`);
    }
    // Editable inputs on the final contract, Clear on every picker.
    expect(out).toContain("<input");
    expect(out).toContain("/a.jpg");
    expect(out).toContain("Clear");
    // Media kinds take URLs, data kinds take handles.
    expect(out).toContain('type="url"');
    expect(out).toContain('type="text"');
  });

  it("clears a picker to the empty string through the pure transition", () => {
    const next = applySchemaChange(
      PICKERS,
      { p_image: "/a.jpg" },
      "p_image",
      "",
    );
    expect(next).toEqual({ p_image: "" });
  });

  it("renders structured editors with editable inputs", () => {
    const out = html(
      <SchemaControls
        schema={(
          ["typography", "responsive", "visibility", "animation"] as const
        ).map((kind) => ({ key: `s_${kind}`, label: `${kind} cfg`, kind }))}
        props={{}}
        onChange={noop}
      />,
    );
    for (const kind of [
      "typography",
      "responsive",
      "visibility",
      "animation",
    ]) {
      expect(out).toContain(`data-placeholder="${kind}"`);
    }
    // Full structured editors: typography sub-fields, responsive cascade
    // note, visibility breakpoints, animation effect controls.
    expect(out).toContain("<input");
    expect(out).toContain("<select");
    expect(out).toContain("Family");
    expect(out).toContain("Desktop");
    expect(out).toContain("Effect");
  });
});

describe("every union kind renders-or-rejects deterministically", () => {
  function fieldFor(kind: string): PropField {
    const base = {
      key: `k_${kind}`,
      label: `${kind} label`,
      kind,
    } as PropField;
    if (kind === "select")
      return { ...base, options: [{ value: "a", label: "A" }] };
    if (kind === "repeater")
      return {
        ...base,
        fields: [{ key: "t", label: "Row title", kind: "text" }],
      };
    if (kind === "group")
      return {
        ...base,
        fields: [{ key: "inner", label: "Inner field", kind: "text" }],
      };
    return base;
  }

  it("matches CONTROL_STATUS for all 22 kinds", () => {
    const schema: PropSchema = PROP_KINDS.map(fieldFor);
    const props: WidgetProps = {
      ...defaultsFor(schema),
      k_text: "v",
      k_items_unused: 1,
    };
    const out = html(
      <SchemaControls schema={schema} props={props} onChange={noop} />,
    );
    for (const kind of PROP_KINDS) {
      const status = CONTROL_STATUS[kind];
      if (status === "full") {
        expect(out, kind).toContain(`${kind} label`);
        expect(out, kind).toContain(`data-field="k_${kind}"`);
      } else if (status === "placeholder") {
        expect(out, kind).toContain(`data-placeholder="${kind}"`);
      } else {
        if (kind === "group") expect(out, kind).toContain("Inner field");
        if (kind === "repeater") expect(out, kind).toContain("Add item");
      }
    }
  });

  it("fails closed on an unknown kind: no label, no input, no fallback", () => {
    const out = html(
      <SchemaControls
        schema={[{ key: "evil", label: "Evil Widget", kind: "exec" } as never]}
        props={{ evil: "x" }}
        onChange={noop}
      />,
    );
    expect(out).not.toContain("Evil Widget");
    expect(out).not.toContain("<input");
    expect(out).not.toContain("<select");
    expect(out).not.toContain("<textarea");
    expect(out).not.toContain("<button");
  });
});

describe("repeater and group nesting", () => {
  const schema: PropSchema = [
    {
      key: "grp",
      label: "Card",
      kind: "group",
      fields: [{ key: "subtitle", label: "Subtitle", kind: "text" }],
    },
    {
      key: "items",
      label: "Items",
      kind: "repeater",
      fields: [{ key: "t", label: "Row title", kind: "text" }],
    },
  ];

  it("renders group legends and repeater rows", () => {
    const out = html(
      <SchemaControls
        schema={schema}
        props={{ subtitle: "S", items: [{ t: "R1" }, { t: "R2" }] }}
        onChange={noop}
      />,
    );
    expect(out).toContain("Card");
    expect(out).toContain("Subtitle");
    expect(out).toContain("R1");
    expect(out).toContain("R2");
    expect(out).toContain("Add item");
  });

  it("displays nested row errors under the row", () => {
    const out = html(
      <SchemaControls
        schema={schema}
        props={{ items: [{ t: "R1" }] }}
        errors={["items.0.t.too_long"]}
        onChange={noop}
      />,
    );
    expect(out).toContain("items.0.t.too_long");
  });
});

describe("showWhen visibility", () => {
  const schema: PropSchema = [
    { key: "style", label: "Style", kind: "text" },
    {
      key: "detail",
      label: "Detail",
      kind: "text",
      showWhen: { key: "style", equals: "fancy" },
    },
  ];

  it("hides mismatched fields and shows matched ones", () => {
    expect(
      html(<SchemaControls schema={schema} props={{}} onChange={noop} />),
    ).not.toContain("Detail");
    expect(
      html(
        <SchemaControls
          schema={schema}
          props={{ style: "fancy" }}
          onChange={noop}
        />,
      ),
    ).toContain("Detail");
  });
});

describe("validation errors display", () => {
  it("shows the exact codes validateProps reports", () => {
    const schema: PropSchema = [
      { key: "title", label: "Title", kind: "text", required: true },
      { key: "count", label: "Count", kind: "number" },
    ];
    const props: WidgetProps = { count: "abc" };
    const result = validateProps(schema, props);
    expect(result.ok).toBe(false);
    const out = html(
      <SchemaControls
        schema={schema}
        props={props}
        errors={result.errors}
        onChange={noop}
      />,
    );
    for (const code of result.errors) {
      expect(out).toContain(code);
    }
  });
});

describe("submit-path parity (same module both directions)", () => {
  const schema: PropSchema = [
    { key: "title", label: "Title", kind: "text", required: true },
    { key: "count", label: "Count", kind: "number", min: 0, max: 5 },
  ];

  it("submitSchemaProps delegates to the shared validateProps", () => {
    for (const props of [
      { title: "Hi", count: 2 },
      { title: "", count: "abc", junk: 1 },
    ]) {
      expect(submitSchemaProps(schema, props)).toEqual(
        validateProps(schema, props),
      );
    }
  });

  it("client submit errors and server re-validation agree", () => {
    const props: WidgetProps = { title: "", count: 99, junk: "drop" };
    const client = submitSchemaProps(schema, props);
    const server = validateProps(schema, structuredClone(props));
    expect(client).toEqual(server);
    expect(client.ok).toBe(false);
    // Clamp-then-error case: count clamps silently, title is required.
    expect(client.errors).toContain("title.required");
    expect(client.clean.count).toBe(5);
    expect(client.clean).not.toHaveProperty("junk");
  });
});

function structuredClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("per-instance isolation (pure state transitions)", () => {
  const schema: PropSchema = [
    { key: "title", label: "Title", kind: "text" },
    { key: "count", label: "Count", kind: "number" },
  ];

  it("editing one instance never touches the other", () => {
    const a: WidgetProps = { title: "A", count: 1 };
    const b: WidgetProps = { title: "B", count: 2 };
    const aSnapshot = { ...a };
    const next = applySchemaChange(schema, a, "title", "A2");
    expect(a).toEqual(aSnapshot);
    expect(b).toEqual({ title: "B", count: 2 });
    expect(next).toEqual({ title: "A2", count: 1 });
    expect(next).not.toBe(a);
    // Same schema, second instance markup stays independent.
    const out = html(
      <div>
        <SchemaControls schema={schema} props={next} onChange={noop} />
        <SchemaControls schema={schema} props={b} onChange={noop} />
      </div>,
    );
    expect(out).toContain("A2");
    expect(out).toContain("B");
  });

  it("refuses unknown keys by returning the same reference", () => {
    const props: WidgetProps = { title: "A" };
    expect(applySchemaChange(schema, props, "junk", 1)).toBe(props);
  });

  it("updates repeater rows immutably", () => {
    const rSchema: PropSchema = [
      {
        key: "items",
        label: "Items",
        kind: "repeater",
        fields: [{ key: "t", label: "T", kind: "text" }],
      },
    ];
    const props: WidgetProps = { items: [{ t: "a" }, { t: "b" }] };
    const next = applyRepeaterRowChange(rSchema, props, "items", 1, "t", "B2");
    expect(next.items).toEqual([{ t: "a" }, { t: "B2" }]);
    expect(props.items).toEqual([{ t: "a" }, { t: "b" }]);
    expect(next.items).not.toBe(props.items);
    expect((next.items as Record<string, unknown>[])[0]).toBe(
      (props.items as Record<string, unknown>[])[0],
    );
  });

  it("repeater transitions fail closed on bad paths", () => {
    const rSchema: PropSchema = [
      {
        key: "items",
        label: "Items",
        kind: "repeater",
        fields: [{ key: "t", label: "T", kind: "text" }],
      },
    ];
    const props: WidgetProps = { items: [{ t: "a" }] };
    expect(applyRepeaterRowChange(rSchema, props, "nope", 0, "t", "x")).toBe(
      props,
    );
    expect(applyRepeaterRowChange(rSchema, props, "items", 7, "t", "x")).toBe(
      props,
    );
    expect(
      applyRepeaterRowChange(rSchema, props, "items", 0, "junk", "x"),
    ).toBe(props);
  });
});

describe("responsive overrides passthrough", () => {
  it("reads the device layer without mutating the overrides object", () => {
    const schema: PropSchema = [{ key: "title", label: "Title", kind: "text" }];
    const overrides = { tablet: { title: "Tab" }, mobile: { title: "Mob" } };
    const snapshot = structuredClone(overrides);
    const out = html(
      <SchemaControls
        schema={schema}
        props={{ title: "Base" }}
        device="tablet"
        overrides={overrides}
        onChange={noop}
      />,
    );
    expect(out).toContain("Tab");
    expect(out).toContain("override");
    expect(overrides).toEqual(snapshot);
  });

  it("preserves the bp shape through the shared validator", () => {
    const schema: PropSchema = [{ key: "title", label: "Title", kind: "text" }];
    const r = validateProps(schema, {
      title: "Base",
      bp: { tablet: { title: "Tab" } },
    });
    expect(r.ok).toBe(true);
    expect(r.clean.bp).toEqual({ tablet: { title: "Tab" } });
  });
});

describe("submit form", () => {
  const schema: PropSchema = [FULL_SCHEMA[0]];

  it("wraps in a form with an Apply button only when onSubmit is set", () => {
    const withSubmit = html(
      <SchemaControls
        schema={schema}
        props={{ title: "Hi" }}
        onChange={noop}
        onSubmit={() => {}}
      />,
    );
    expect(withSubmit).toContain("<form");
    expect(withSubmit).toContain("Apply");
    const without = html(
      <SchemaControls
        schema={schema}
        props={{ title: "Hi" }}
        onChange={noop}
      />,
    );
    expect(without).not.toContain("<form");
  });
});
