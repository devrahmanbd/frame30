/**
 * Frame30 — widget-props contract tests (written first, TDD).
 *
 * Covers `src/lib/widget-props.ts` against the EXACT PropField shape the
 * sibling registry builds against. The module does not exist yet, so this
 * suite starts red.
 */
import { describe, expect, it } from "vitest";
import {
  CONTROL_STATUS,
  MAX_REPEATER_ITEMS,
  MAX_TEXT_LENGTH,
  PROP_KINDS,
  controlStatus,
  defaultsFor,
  errorsForField,
  isFieldVisible,
  validateProps,
  visibleFields,
  type PropField,
  type PropSchema,
} from "./widget-props";

const TEXT: PropField = { key: "title", label: "Title", kind: "text" };

function validValueFor(kind: string): unknown {
  switch (kind) {
    case "text":
      return "Hello";
    case "richtext":
      return "<b>Hi</b>";
    case "number":
      return 42;
    case "boolean":
      return true;
    case "select":
      return "a";
    case "color":
      return "#ff0000";
    case "typography":
      return { family: "Inter", size: 16 };
    case "spacing":
    case "dimensions":
      return { top: 1, right: 2, bottom: 3, left: 4, unit: "px" };
    case "responsive":
      return { base: "x", mobile: "y" };
    case "image":
      return "/images/a.jpg";
    case "media":
    case "video":
      return "https://cdn.example.com/v.mp4";
    case "product":
      return "prod_123";
    case "collection":
      return "summer-2026";
    case "category":
      return "saree";
    case "repeater":
      return [{ title: "A" }];
    case "group":
      return undefined;
    case "link":
      return "/products";
    case "icon":
      return "Star";
    case "visibility":
      return [{ kind: "auth", op: "is", value: "in" }];
    case "animation":
      return { duration: 300, easing: "ease" };
    default:
      throw new Error(`no fixture for ${kind}`);
  }
}

function fieldFor(kind: string): PropField {
  const base: PropField = {
    key: `f_${kind}`,
    label: kind,
    kind: kind as never,
  };
  if (kind === "select")
    return { ...base, options: [{ value: "a", label: "A" }] };
  if (kind === "number") return { ...base, min: 0, max: 100 };
  if (kind === "repeater")
    return {
      ...base,
      fields: [{ key: "title", label: "Title", kind: "text" }],
    };
  if (kind === "group")
    return {
      ...base,
      fields: [{ key: "inner", label: "Inner", kind: "text" }],
    };
  return base;
}

describe("defaultsFor", () => {
  it("returns flat scalar defaults", () => {
    const out = defaultsFor([
      TEXT,
      { key: "count", label: "Count", kind: "number", min: 2 },
      { key: "on", label: "On", kind: "boolean" },
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
    ]);
    expect(out).toMatchObject({
      title: "",
      count: 2,
      on: false,
      align: "left",
      fg: "#000000",
    });
  });

  it("uses declared defaults when present", () => {
    const out = defaultsFor([
      { key: "t", label: "T", kind: "text", default: "hi" },
      { key: "n", label: "N", kind: "number", default: 7 },
    ]);
    expect(out.t).toBe("hi");
    expect(out.n).toBe(7);
  });

  it("merges nested group defaults flat with no group key", () => {
    const out = defaultsFor([
      {
        key: "grp",
        label: "Group",
        kind: "group",
        fields: [
          { key: "a", label: "A", kind: "text", default: "x" },
          {
            key: "nested",
            label: "Nested",
            kind: "group",
            fields: [{ key: "b", label: "B", kind: "number", default: 3 }],
          },
        ],
      },
    ]);
    expect(out).toMatchObject({ a: "x", b: 3 });
    expect(out).not.toHaveProperty("grp");
    expect(out).not.toHaveProperty("nested");
  });

  it("defaults repeaters to an empty array", () => {
    const out = defaultsFor([
      {
        key: "items",
        label: "Items",
        kind: "repeater",
        fields: [TEXT],
      },
    ]);
    expect(out.items).toEqual([]);
  });

  it("cleans repeater array defaults against the row schema", () => {
    const out = defaultsFor([
      {
        key: "items",
        label: "Items",
        kind: "repeater",
        fields: [{ key: "t", label: "T", kind: "text" }],
        default: [{ t: "A", junk: 1 }, "bad-row"],
      },
    ]);
    expect(out.items).toEqual([{ t: "A" }]);
  });

  it("skips unknown kinds (fail closed, no default emitted)", () => {
    const out = defaultsFor([
      { key: "evil", label: "Evil", kind: "exec" } as never,
    ]);
    expect(out).not.toHaveProperty("evil");
  });

  it("sanitises executable content out of declared defaults", () => {
    const out = defaultsFor([
      {
        key: "t",
        label: "T",
        kind: "text",
        default: "<script>alert(1)</script>hi",
      },
    ]);
    expect(String(out.t)).not.toContain("<");
    expect(String(out.t)).toContain("hi");
  });

  it("returns fresh references on every call", () => {
    const schema: PropSchema = [
      {
        key: "items",
        label: "Items",
        kind: "repeater",
        fields: [TEXT],
        default: [{ title: "A" }],
      },
      { key: "pad", label: "Pad", kind: "spacing" },
    ];
    const a = defaultsFor(schema);
    const b = defaultsFor(schema);
    expect(a).toEqual(b);
    expect(a.items).not.toBe(b.items);
    expect(a.pad).not.toBe(b.pad);
    (a.items as unknown[]).push({ title: "MUT" });
    expect(b.items).toEqual([{ title: "A" }]);
  });
});

describe("validateProps basics", () => {
  it("strips unknown properties and stays ok", () => {
    const r = validateProps([TEXT], { title: "Hi", junk: 1, bp: undefined });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.clean).toEqual({ title: "Hi" });
  });

  it("fills every known key so clean is complete", () => {
    const r = validateProps(
      [TEXT, { key: "n", label: "N", kind: "number" }],
      {},
    );
    expect(r.ok).toBe(true);
    expect(r.clean).toMatchObject({ title: "", n: 0 });
  });

  it("treats null/array/string props as an empty record", () => {
    for (const bad of [null, undefined, 42, "junk", []]) {
      const r = validateProps([TEXT], bad);
      expect(r.clean.title).toBe("");
    }
    const r = validateProps(
      [{ key: "t", label: "T", kind: "text", required: true }],
      null,
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("t.required");
  });

  it("validates bp override layers recursively and preserves the shape", () => {
    const schema: PropSchema = [TEXT];
    const r = validateProps(schema, {
      title: "Base",
      bp: {
        tablet: { title: "Tab", junk: 1 },
        mobile: { title: 42 },
      },
    });
    expect(r.ok).toBe(true);
    expect(r.clean.title).toBe("Base");
    const bp = r.clean.bp as Record<string, Record<string, unknown>>;
    expect(Object.keys(bp).sort()).toEqual(["mobile", "tablet"]);
    expect(bp.tablet).toEqual({ title: "Tab" });
    expect(bp.mobile).toEqual({ title: "42" });
  });

  it("prefixes layer errors and drops malformed layers", () => {
    const schema: PropSchema = [
      { key: "n", label: "N", kind: "number", min: 0, max: 10 },
    ];
    const r = validateProps(schema, {
      bp: { tablet: { n: "abc" }, broken: 42 },
    });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("bp.tablet.n.not_a_number");
    expect(r.errors).toContain("bp.broken.type");
    expect(r.clean.bp as object).not.toHaveProperty("broken");
  });
});

describe("validateProps numbers and booleans", () => {
  const NUM: PropField = {
    key: "n",
    label: "N",
    kind: "number",
    min: 0,
    max: 100,
  };

  it("clamps to min/max with no error", () => {
    expect(validateProps([NUM], { n: 150 }).clean.n).toBe(100);
    expect(validateProps([NUM], { n: 150 }).errors).toEqual([]);
    expect(validateProps([NUM], { n: -5 }).clean.n).toBe(0);
  });

  it("coerces numeric strings", () => {
    const r = validateProps([NUM], { n: "42" });
    expect(r.ok).toBe(true);
    expect(r.clean.n).toBe(42);
  });

  it("rejects non-numeric strings with not_a_number and falls back", () => {
    const r = validateProps([{ ...NUM, default: 5 }], { n: "abc" });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("n.not_a_number");
    expect(r.clean.n).toBe(5);
  });

  it("rejects wrong types with a type code", () => {
    for (const bad of [{}, [], true]) {
      const r = validateProps([NUM], { n: bad });
      expect(r.ok).toBe(false);
      expect(r.errors).toContain("n.type");
    }
  });

  it("coerces booleans from boolean/string/0-1 forms", () => {
    const B: PropField = { key: "b", label: "B", kind: "boolean" };
    const cases: [unknown, boolean][] = [
      [true, true],
      ["true", true],
      [1, true],
      [false, false],
      ["false", false],
      [0, false],
    ];
    for (const [input, want] of cases) {
      const r = validateProps([B], { b: input });
      expect(r.errors).toEqual([]);
      expect(r.clean.b).toBe(want);
    }
  });

  it("rejects uncoercible booleans with a type code", () => {
    const B: PropField = { key: "b", label: "B", kind: "boolean" };
    for (const bad of ["yes", 2, {}, []]) {
      const r = validateProps([B], { b: bad });
      expect(r.ok).toBe(false);
      expect(r.errors).toContain("b.type");
    }
  });
});

describe("validateProps select, color and urls", () => {
  const SEL: PropField = {
    key: "align",
    label: "Align",
    kind: "select",
    default: "left",
    options: [
      { value: "left", label: "Left" },
      { value: "center", label: "Center" },
    ],
  };

  it("rejects options outside the list and restores the default", () => {
    const r = validateProps([SEL], { align: "evil" });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("align.not_an_option");
    expect(r.clean.align).toBe("left");
  });

  it("accepts scalar values matching an option via String()", () => {
    const r = validateProps(
      [
        {
          key: "s",
          label: "S",
          kind: "select",
          options: [{ value: "1", label: "One" }],
        },
      ],
      { s: 1 },
    );
    expect(r.ok).toBe(true);
    expect(r.clean.s).toBe("1");
  });

  it("rejects objects for select with a type code", () => {
    const r = validateProps([SEL], { align: { value: "left" } });
    expect(r.errors).toContain("align.type");
  });

  it("normalises hex case and rejects non-colors", () => {
    const C: PropField = { key: "fg", label: "Fg", kind: "color" };
    expect(validateProps([C], { fg: "#FF0000" }).clean.fg).toBe("#ff0000");
    const r = validateProps([C], { fg: "red" });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("fg.not_a_color");
  });

  it("allows only safe url schemes for link/image kinds", () => {
    const L: PropField = { key: "href", label: "Href", kind: "link" };
    for (const good of [
      "/products",
      "https://example.com/x",
      "#top",
      "mailto:a@b.cd",
      "tel:+8801",
    ]) {
      expect(validateProps([L], { href: good }).errors).toEqual([]);
    }
    const bad = validateProps([L], { href: "javascript:alert(1)" });
    expect(bad.ok).toBe(false);
    expect(bad.errors).toContain("href.not_a_url");
    expect(bad.clean.href).toBe("");
  });

  it("rejects oversize urls with too_long", () => {
    const L: PropField = { key: "src", label: "Src", kind: "image" };
    const r = validateProps([L], { src: `https://e.com/${"x".repeat(3000)}` });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("src.too_long");
    expect(String(r.clean.src).length).toBeLessThanOrEqual(2048);
  });
});

describe("validateProps text", () => {
  it(`rejects text over ${MAX_TEXT_LENGTH} chars with too_long and truncates`, () => {
    const r = validateProps([TEXT], { title: "x".repeat(MAX_TEXT_LENGTH + 1) });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("title.too_long");
    expect(String(r.clean.title).length).toBe(MAX_TEXT_LENGTH);
  });

  it("accepts exactly the limit", () => {
    const r = validateProps([TEXT], { title: "x".repeat(MAX_TEXT_LENGTH) });
    expect(r.ok).toBe(true);
  });

  it("rejects objects and arrays with a type code", () => {
    for (const bad of [{}, [], ["x"]]) {
      const r = validateProps([TEXT], { title: bad });
      expect(r.errors).toContain("title.type");
    }
  });

  it("coerces numbers and booleans to strings", () => {
    expect(validateProps([TEXT], { title: 42 }).clean.title).toBe("42");
    expect(validateProps([TEXT], { title: true }).clean.title).toBe("true");
  });

  it("strips tags silently so no markup survives", () => {
    const r = validateProps([TEXT], {
      title: 'Hi <img src=x onerror="alert(1)"> bye',
    });
    expect(r.ok).toBe(true);
    expect(String(r.clean.title)).not.toContain("<");
    expect(String(r.clean.title)).not.toContain("onerror");
  });

  it("flags missing required text", () => {
    const schema: PropSchema = [
      { key: "t", label: "T", kind: "text", required: true },
    ];
    for (const missing of [undefined, "", null]) {
      const props: Record<string, unknown> = {};
      if (missing !== undefined) props.t = missing;
      const r = validateProps(schema, props);
      expect(r.ok).toBe(false);
      expect(r.errors).toContain("t.required");
    }
  });

  it("satisfies required from a declared default", () => {
    const r = validateProps(
      [{ key: "t", label: "T", kind: "text", required: true, default: "d" }],
      {},
    );
    expect(r.ok).toBe(true);
    expect(r.clean.t).toBe("d");
  });
});

describe("validateProps repeater and group", () => {
  const ITEMS: PropField = {
    key: "items",
    label: "Items",
    kind: "repeater",
    fields: [
      { key: "t", label: "T", kind: "text" },
      { key: "n", label: "N", kind: "number", min: 0, max: 10 },
    ],
  };

  it(`rejects over ${MAX_REPEATER_ITEMS} items with too_many and truncates`, () => {
    const rows = Array.from({ length: MAX_REPEATER_ITEMS + 5 }, (_, i) => ({
      t: `r${i}`,
    }));
    const r = validateProps([ITEMS], { items: rows });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("items.too_many");
    expect((r.clean.items as unknown[]).length).toBe(MAX_REPEATER_ITEMS);
  });

  it("accepts exactly the item cap", () => {
    const rows = Array.from({ length: MAX_REPEATER_ITEMS }, () => ({ t: "x" }));
    expect(validateProps([ITEMS], { items: rows }).ok).toBe(true);
  });

  it("keys row errors by index and sub-field", () => {
    const r = validateProps([ITEMS], {
      items: [
        { t: "ok", n: 3 },
        { t: "bad", n: "abc" },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("items.1.n.not_a_number");
    const rows = r.clean.items as Record<string, unknown>[];
    expect(rows[1]).toMatchObject({ t: "bad" });
    expect(rows[0]).toMatchObject({ t: "ok", n: 3 });
  });

  it("drops non-object rows with an indexed type code", () => {
    const r = validateProps([ITEMS], { items: [{ t: "ok" }, 42, null] });
    expect(r.errors).toContain("items.1.type");
    expect(r.errors).toContain("items.2.type");
    expect(r.clean.items).toEqual([{ t: "ok", n: 0 }]);
  });

  it("rejects non-array repeater values and cleans to []", () => {
    const r = validateProps([ITEMS], { items: "nope" });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("items.type");
    expect(r.clean.items).toEqual([]);
  });

  it("strips unknown row keys", () => {
    const r = validateProps([ITEMS], {
      items: [{ t: "A", junk: 1 }],
    });
    expect(r.clean.items).toEqual([{ t: "A", n: 0 }]);
  });

  it("validates group children at the flat level", () => {
    const schema: PropSchema = [
      {
        key: "grp",
        label: "Group",
        kind: "group",
        fields: [
          { key: "t", label: "T", kind: "text", required: true },
          { key: "n", label: "N", kind: "number", min: 0, max: 5 },
        ],
      },
    ];
    const r = validateProps(schema, { t: "", n: 99, grp: "junk" });
    expect(r.errors).toContain("t.required");
    expect(r.clean.n).toBe(5);
    expect(r.clean).not.toHaveProperty("grp");
  });

  it("supports a repeater nested inside a group at the flat key", () => {
    const schema: PropSchema = [
      {
        key: "grp",
        label: "Group",
        kind: "group",
        fields: [ITEMS],
      },
    ];
    const r = validateProps(schema, { items: [{ t: "A", n: 2 }] });
    expect(r.ok).toBe(true);
    expect(r.clean.items).toEqual([{ t: "A", n: 2 }]);
  });
});

describe("unknown kinds fail closed", () => {
  it("rejects an invented kind and omits the value", () => {
    const r = validateProps(
      [{ key: "evil", label: "Evil", kind: "exec" } as never],
      { evil: "anything" },
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("evil.unknown_kind");
    expect(r.clean).not.toHaveProperty("evil");
  });

  it("every union kind validates a representative value without unknown_kind", () => {
    for (const kind of PROP_KINDS) {
      const field = fieldFor(kind);
      const props: Record<string, unknown> = {};
      if (kind !== "group") props[field.key] = validValueFor(kind);
      else props.inner = "g";
      const r = validateProps([field], props);
      expect(
        r.errors.filter((e) => e.endsWith(".unknown_kind")),
        `kind ${kind}`,
      ).toEqual([]);
      expect(r.ok, `kind ${kind}: ${r.errors.join(",")}`).toBe(true);
    }
  });

  it("CONTROL_STATUS maps every union kind and rejects the rest", () => {
    expect(Object.keys(CONTROL_STATUS).sort()).toEqual([...PROP_KINDS].sort());
    for (const kind of PROP_KINDS) {
      expect(["full", "placeholder", "structural"]).toContain(
        CONTROL_STATUS[kind],
      );
      expect(controlStatus(kind)).toBe(CONTROL_STATUS[kind]);
    }
    expect(controlStatus("exec")).toBe("unknown");
    expect(controlStatus("")).toBe("unknown");
  });
});

describe("executable content never passes", () => {
  it("removes script blocks and event handlers from text", () => {
    const r = validateProps([TEXT], {
      title: "<script>alert(1)</script><img src=x onerror=alert(2)>hi",
    });
    const clean = String(r.clean.title);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onerror/i);
    expect(clean).toContain("hi");
  });

  it("keeps benign richtext markup but neutralises hazards", () => {
    const R: PropField = { key: "body", label: "Body", kind: "richtext" };
    const r = validateProps([R], {
      body: '<b>ok</b><script>evil()</script><a href="javascript:evil()" onload="x()">go</a>',
    });
    const clean = String(r.clean.body);
    expect(clean).toContain("<b>ok</b>");
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/onload/i);
    expect(clean).not.toMatch(/javascript:/i);
  });

  it("rejects executable media urls", () => {
    for (const kind of ["image", "media", "video"] as const) {
      const r = validateProps(
        [{ key: "src", label: "Src", kind } as PropField],
        { src: "javascript:alert(1)" },
      );
      expect(r.errors).toContain("src.not_a_url");
      expect(r.clean.src).toBe("");
    }
  });

  it("strips tags from structured string leaves", () => {
    const T: PropField = { key: "ty", label: "Ty", kind: "typography" };
    const r = validateProps([T], {
      ty: { family: '<img src=x onerror="e()">Inter', size: 16 },
    });
    const ty = r.clean.ty as Record<string, unknown>;
    expect(String(ty.family)).not.toContain("<");
    expect(String(ty.family)).toContain("Inter");
  });

  it("drops function values from structured fields", () => {
    const A: PropField = { key: "an", label: "An", kind: "animation" };
    const r = validateProps([A], {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      an: { run: (() => 1) as unknown as Function, duration: 200 },
    });
    expect(r.clean.an).toEqual({ duration: 200 });
  });
});

describe("showWhen helpers", () => {
  const COND: PropField = {
    key: "detail",
    label: "Detail",
    kind: "text",
    showWhen: { key: "style", equals: "fancy" },
  };

  it("shows fields without conditions", () => {
    expect(isFieldVisible(TEXT, {})).toBe(true);
  });

  it("matches equality and hides on mismatch or absence", () => {
    expect(isFieldVisible(COND, { style: "fancy" })).toBe(true);
    expect(isFieldVisible(COND, { style: "plain" })).toBe(false);
    expect(isFieldVisible(COND, {})).toBe(false);
  });

  it("visibleFields filters while preserving order", () => {
    const schema: PropSchema = [TEXT, COND];
    expect(visibleFields(schema, { style: "fancy" })).toEqual([TEXT, COND]);
    expect(visibleFields(schema, {})).toEqual([TEXT]);
  });

  it("showWhen gates rendering only — validation still applies", () => {
    const schema: PropSchema = [
      { key: "style", label: "Style", kind: "text" },
      { ...COND, required: true },
    ];
    const r = validateProps(schema, { style: "plain" });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("detail.required");
  });
});

describe("errorsForField", () => {
  it("selects a field's codes including nested repeater paths", () => {
    const errors = [
      "title.too_long",
      "items.1.n.not_a_number",
      "items.too_many",
      "other.required",
    ];
    expect(errorsForField(errors, "title")).toEqual(["title.too_long"]);
    expect(errorsForField(errors, "items")).toEqual([
      "items.1.n.not_a_number",
      "items.too_many",
    ]);
    expect(errorsForField(errors, "missing")).toEqual([]);
  });

  it("does not confuse sibling prefixes", () => {
    expect(errorsForField(["title2.required"], "title")).toEqual([]);
  });
});

describe("parity round-trip", () => {
  it("defaults validate clean when required fields declare defaults", () => {
    const schema: PropSchema = [
      { key: "t", label: "T", kind: "text", required: true, default: "d" },
      { key: "n", label: "N", kind: "number", min: 0, max: 5, default: 2 },
      {
        key: "items",
        label: "Items",
        kind: "repeater",
        fields: [{ key: "t", label: "T", kind: "text" }],
      },
    ];
    const r = validateProps(schema, defaultsFor(schema));
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe("registry interop (unified-widget-registry WidgetDef shape)", () => {
  it("accepts the registry {fields} carrier in every entry function", async () => {
    const { fieldsOf } = await import("./widget-props");
    const { registerWidget } = await import("./unified-widget-registry");
    const schema: { fields: PropField[] } = {
      fields: [
        { key: "title", label: "Title", kind: "text", default: "Hi" },
        { key: "count", label: "Count", kind: "number", min: 0, max: 9 },
      ],
    };
    const def = {
      id: "builtin:interop-probe",
      namespace: "builtin",
      version: "1.0.0",
      label: "Interop Probe",
      category: "basic",
      slots: ["main"],
      defaults: {},
      propsSchema: { fields: [...schema.fields] },
      renderer: "builtin",
    };
    expect(registerWidget(def).ok).toBe(true);
    expect(fieldsOf(def.propsSchema)).toHaveLength(2);
    const d = defaultsFor(def.propsSchema);
    expect(d).toMatchObject({ title: "Hi" });
    const r = validateProps(def.propsSchema, { title: "Yo", count: 99 });
    expect(r.ok).toBe(true);
    expect(r.clean).toMatchObject({ title: "Yo", count: 9 });
    const ok = validateProps(def.propsSchema, { title: "Yo", count: 3 });
    expect(ok.ok).toBe(true);
    expect(ok.clean).toMatchObject({ title: "Yo", count: 3 });
  });
});
