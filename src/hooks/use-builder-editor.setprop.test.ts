/**
 * Frame30 Loop B — client save path: `editor.setPropAt` validation (TDD).
 *
 * Contract under test (`src/hooks/use-builder-editor.ts`, `setPropAt` ONLY):
 * - Schema-carrying widgets (registry `propsSchema` with fields) validate
 *   every write through the SAME `validateProps` module the server calls.
 * - Unknown prop keys — including hostile `__proto__` / `constructor`
 *   injection — are refused with `<key>.unknown_prop` field errors.
 * - Invalid values are refused with the exact `validateProps` field codes
 *   (`not_a_number`, `not_an_option`, `required`, `type`, …).
 * - Valid writes store the CLEANED value (clamps, coercions, sanitised text),
 *   so client state and the server re-validation cannot disagree.
 * - Legacy widgets (no registry schema, or the empty legacy-unvalidated
 *   shape) pass values through byte-identical to today — including unknown
 *   keys, which the legacy AST pipeline owns.
 *
 * The hook itself cannot mount in this repo's node vitest env (no
 * testing-library / jsdom — see SchemaControls.test.tsx precedent), so these
 * tests drive the exported pure transition `checkSetPropAt` / the field
 * validator `validateSchemaPropEdit`, which are the exact functions the
 * `setPropAt` action calls before writing.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkSetPropAt,
  validateSchemaPropEdit,
  type EditorDoc,
  type SetPropAtVerdict,
} from "./use-builder-editor";
import { clearRegistry, registerWidget } from "@/lib/unified-widget-registry";
import { DEFAULT_TOKENS, type Section } from "@/lib/builder-ast";
import type { PropSchema } from "@/lib/widget-props";

const SCHEMA: PropSchema = {
  fields: [
    { key: "title", label: "Title", kind: "text", required: true },
    {
      key: "count",
      label: "Count",
      kind: "number",
      min: 0,
      max: 5,
      default: 2,
    },
    {
      key: "align",
      label: "Align",
      kind: "select",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
      ],
      default: "left",
    },
    {
      key: "items",
      label: "Items",
      kind: "repeater",
      fields: [{ key: "t", label: "Row title", kind: "text" }],
    },
    {
      key: "grp",
      label: "Card",
      kind: "group",
      fields: [{ key: "sub", label: "Subtitle", kind: "text" }],
    },
  ],
};

const PLUGIN_DEF = {
  id: "plugin:acme/reviews",
  namespace: "plugin",
  version: "1.0.0",
  label: "Reviews",
  category: "social",
  slots: ["main"],
  defaults: {},
  propsSchema: JSON.parse(JSON.stringify(SCHEMA)) as PropSchema,
  renderer: "sandbox",
};

const EXTENSION: Section = {
  id: "s1",
  type: "plugin_block",
  props: { pluginKey: "plugin:acme/reviews", title: "Hi", count: 3 },
};

const LEGACY: Section = {
  id: "b1",
  type: "banner",
  props: { text: "Sale", tone: "info" },
};

function docWith(...sections: Section[]): EditorDoc {
  return {
    templates: { index: { header: [], main: sections, footer: [] } },
    tokens: { ...DEFAULT_TOKENS },
  };
}

function okOf(v: SetPropAtVerdict): unknown {
  expect(v.ok).toBe(true);
  return (v as { ok: true; value: unknown }).value;
}

function errorsOf(v: SetPropAtVerdict): string[] {
  expect(v.ok).toBe(false);
  return (v as { ok: false; errors: string[] }).errors;
}

beforeEach(() => {
  clearRegistry();
  expect(registerWidget(PLUGIN_DEF).ok).toBe(true);
});

afterEach(() => {
  clearRegistry();
});

describe("validateSchemaPropEdit (field level, shared validator)", () => {
  const props = { title: "Hi", count: 3 };

  it("accepts valid values, storing the cleaned result", () => {
    expect(okOf(validateSchemaPropEdit(SCHEMA, props, "title", "Yo"))).toBe(
      "Yo",
    );
    // Clamp-then-clean: no error, the stored value is the clamped one.
    expect(okOf(validateSchemaPropEdit(SCHEMA, props, "count", 99))).toBe(5);
  });

  it("refuses hostile unknown-key injection with field errors", () => {
    for (const key of ["junk", "__proto__", "constructor", "prototype", "bp"]) {
      const errors = errorsOf(validateSchemaPropEdit(SCHEMA, props, key, "x"));
      expect(errors).toContain(`${key}.unknown_prop`);
    }
  });

  it("refuses invalid values with the exact validator codes", () => {
    expect(
      errorsOf(validateSchemaPropEdit(SCHEMA, props, "count", "abc")),
    ).toContain("count.not_a_number");
    expect(
      errorsOf(validateSchemaPropEdit(SCHEMA, props, "align", "evil")),
    ).toContain("align.not_an_option");
    expect(
      errorsOf(validateSchemaPropEdit(SCHEMA, props, "title", "")),
    ).toContain("title.required");
    expect(
      errorsOf(validateSchemaPropEdit(SCHEMA, props, "items", "nope")),
    ).toContain("items.type");
  });

  it("sanitises executable text instead of storing it", () => {
    expect(
      okOf(
        validateSchemaPropEdit(
          SCHEMA,
          props,
          "title",
          "<script>alert(1)</script>Hi<img src=x onerror=alert(2)>",
        ),
      ),
    ).toBe("Hi");
  });

  it("accepts group-flattened sub-keys and whole repeater arrays", () => {
    expect(okOf(validateSchemaPropEdit(SCHEMA, props, "sub", "S"))).toBe("S");
    const rows = okOf(
      validateSchemaPropEdit(SCHEMA, props, "items", [{ t: "a" }]),
    );
    expect(rows).toEqual([{ t: "a" }]);
  });

  it("never throws on hostile shapes", () => {
    for (const value of [undefined, null, {}, [], 42, "__proto__"]) {
      const verdict = validateSchemaPropEdit(SCHEMA, props, "count", value);
      expect(typeof verdict.ok).toBe("boolean");
      if (!verdict.ok) expect(verdict.errors.length).toBeGreaterThan(0);
    }
  });
});

describe("checkSetPropAt (doc level, schema resolution)", () => {
  it("validates extension-widget edits against the registry schema", () => {
    const doc = docWith(EXTENSION);
    expect(
      okOf(
        checkSetPropAt(doc, "index", "main", "s1", "title", "Yo", "desktop"),
      ),
    ).toBe("Yo");
    expect(
      errorsOf(
        checkSetPropAt(doc, "index", "main", "s1", "junk", 1, "desktop"),
      ),
    ).toContain("junk.unknown_prop");
    expect(
      errorsOf(
        checkSetPropAt(doc, "index", "main", "s1", "count", "abc", "desktop"),
      ),
    ).toContain("count.not_a_number");
  });

  it("validates device-layer edits in base context", () => {
    const doc = docWith(EXTENSION);
    expect(
      okOf(
        checkSetPropAt(doc, "index", "main", "s1", "title", "Tab", "tablet"),
      ),
    ).toBe("Tab");
    expect(
      errorsOf(
        checkSetPropAt(doc, "index", "main", "s1", "evil", "x", "tablet"),
      ),
    ).toContain("evil.unknown_prop");
  });

  it("passes legacy widgets through untouched (byte-identical behavior)", () => {
    const doc = docWith(LEGACY);
    // Even unknown keys pass through: the legacy AST pipeline owns them.
    expect(
      okOf(
        checkSetPropAt(doc, "index", "main", "b1", "tone", "warn", "desktop"),
      ),
    ).toBe("warn");
    expect(
      okOf(checkSetPropAt(doc, "index", "main", "b1", "junk", 1, "desktop")),
    ).toBe(1);
  });

  it("passes through when the node is missing or the doc is null", () => {
    const doc = docWith(EXTENSION);
    expect(
      okOf(checkSetPropAt(doc, "index", "main", "ghost", "junk", 1, "desktop")),
    ).toBe(1);
    expect(
      okOf(checkSetPropAt(null, "index", "main", "s1", "junk", 1, "desktop")),
    ).toBe(1);
  });

  it("treats the empty adapter shape as legacy", () => {
    clearRegistry();
    expect(
      registerWidget({ ...PLUGIN_DEF, propsSchema: { fields: [] } }).ok,
    ).toBe(true);
    const doc = docWith(EXTENSION);
    expect(
      okOf(checkSetPropAt(doc, "index", "main", "s1", "junk", 1, "desktop")),
    ).toBe(1);
  });
});
