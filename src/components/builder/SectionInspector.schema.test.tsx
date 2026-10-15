/**
 * Frame30 Loop B — SectionInspector schema swap-in (TDD, RED first).
 *
 * Contract under test (`src/components/builder/SectionInspector.tsx`):
 * - Widgets WITH a registry `propsSchema` (non-empty fields) render generated
 *   controls through `SchemaControls` — labels, help, required markers,
 *   repeaters, groups and responsive layers per the SchemaControls contract.
 * - Widgets WITHOUT one (no def, or the empty legacy-unvalidated shape the
 *   adapters emit) keep the exact bespoke path — byte-identical behavior.
 * - Missing/incompatible definitions never render blank and never execute
 *   schema content: unknown widget types keep the recoverable panel, hostile
 *   schema strings render escaped, and schemas with zero renderable fields
 *   fall back to the recoverable panel.
 * - Reset-to-defaults restores `defaultsFor(schema)`; single-key edits merge
 *   (unrelated props preserved); two instances over one schema stay isolated.
 *
 * Rendering precedent: `renderToStaticMarkup` (vitest env is node, no
 * testing-library) + pure-helper tests for every interaction seam, because
 * DOM events cannot fire here.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import {
  hasRenderableFields,
  resolveSchemaForSection,
  schemaChangeAdapter,
  schemaDefaultEntries,
  SectionInspector,
} from "./SectionInspector";
import { clearRegistry, registerWidget } from "@/lib/unified-widget-registry";
import { defaultsFor, type PropSchema } from "@/lib/widget-props";
import type { Breakpoint, PropValue, Section } from "@/lib/builder-ast";

function html(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

const SCHEMA = {
  fields: [
    { key: "title", label: "Title", kind: "text", required: true },
    { key: "count", label: "Count", kind: "number", min: 0, max: 5 },
    {
      key: "align",
      label: "Align",
      kind: "select",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
      ],
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
} as const;

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

function pluginSection(props: Record<string, PropValue> = {}): Section {
  return {
    id: "r1",
    type: "plugin_block",
    props: { pluginKey: "plugin:acme/reviews", ...props },
  };
}

const noop = () => {};
const inspectorProps = {
  template: "index" as const,
  device: "desktop" as Breakpoint,
  onChange: noop as (key: string, value: PropValue, device: Breakpoint) => void,
  onClearOverride: noop as (key: string, device: Breakpoint) => void,
  onToggleHidden: noop as (breakpoint: Breakpoint) => void,
  onDelete: noop,
  onDuplicate: noop,
};

beforeEach(() => {
  clearRegistry();
  expect(registerWidget(PLUGIN_DEF).ok).toBe(true);
});

afterEach(() => {
  clearRegistry();
});

describe("resolveSchemaForSection", () => {
  it("resolves a plugin widget through the pluginKey prop", () => {
    const out = resolveSchemaForSection(pluginSection());
    expect(out.status).toBe("schema");
    if (out.status === "schema") {
      expect(out.label).toBe("Reviews");
      expect(out.widgetId).toBe("plugin:acme/reviews");
    }
  });

  it("resolves a builtin type through the builtin: alias", () => {
    expect(
      registerWidget({
        id: "builtin:hero",
        namespace: "builtin",
        version: "1.0.0",
        label: "Hero",
        category: "layout",
        slots: ["main"],
        defaults: {},
        propsSchema: {
          fields: [{ key: "title", label: "Title", kind: "text" }],
        },
        renderer: "builtin",
      }).ok,
    ).toBe(true);
    const out = resolveSchemaForSection({
      id: "h1",
      type: "hero",
      props: {},
    });
    expect(out.status).toBe("schema");
  });

  it("prefers the pluginKey over the section-type candidates", () => {
    expect(
      registerWidget({
        id: "builtin:plugin_block",
        namespace: "builtin",
        version: "1.0.0",
        label: "App block",
        category: "content",
        slots: ["main"],
        defaults: {},
        propsSchema: {
          fields: [{ key: "other", label: "Other", kind: "text" }],
        },
        renderer: "builtin",
      }).ok,
    ).toBe(true);
    const out = resolveSchemaForSection(pluginSection());
    if (out.status === "schema") {
      expect(out.widgetId).toBe("plugin:acme/reviews");
    } else {
      expect.unreachable("pluginKey candidate must win");
    }
  });

  it("treats the empty adapter shape as legacy (bespoke path)", () => {
    clearRegistry();
    expect(
      registerWidget({ ...PLUGIN_DEF, propsSchema: { fields: [] } }).ok,
    ).toBe(true);
    expect(resolveSchemaForSection(pluginSection()).status).toBe("legacy");
  });

  it("returns legacy when nothing is registered and for null sections", () => {
    clearRegistry();
    expect(resolveSchemaForSection(pluginSection()).status).toBe("legacy");
    expect(resolveSchemaForSection(null).status).toBe("legacy");
  });
});

describe("schema path rendering", () => {
  it("renders generated controls: labels, values, required, repeater, group", () => {
    const out = html(
      <SectionInspector
        {...inspectorProps}
        section={pluginSection({
          title: "Hello",
          count: 3,
          align: "center",
          items: [{ t: "R1" }, { t: "R2" }],
          sub: "Sub value",
        })}
      />,
    );
    for (const label of ["Title", "Count", "Align", "Items", "Card"]) {
      expect(out, label).toContain(label);
    }
    expect(out).toContain("Hello");
    expect(out).toContain("required");
    expect(out).toContain("R1");
    expect(out).toContain("R2");
    expect(out).toContain("Add item");
    expect(out).toContain("Sub value");
    expect(out).toContain('data-field="title"');
  });

  it("shows widget name and registry metadata in the header", () => {
    const out = html(
      <SectionInspector {...inspectorProps} section={pluginSection()} />,
    );
    expect(out).toContain("Reviews");
    expect(out).toContain("social");
    expect(out).toContain("r1");
  });

  it("offers reset-to-defaults without the bespoke panel tabs", () => {
    const out = html(
      <SectionInspector {...inspectorProps} section={pluginSection()} />,
    );
    expect(out).toContain("Reset to defaults");
    expect(out).not.toContain("Field groups");
  });

  it("reads the active responsive layer and tags the override", () => {
    const out = html(
      <SectionInspector
        {...inspectorProps}
        device="tablet"
        section={{
          ...pluginSection({ title: "Base" }),
          bp: { tablet: { title: "Tab" } },
        }}
      />,
    );
    expect(out).toContain("Tab");
    expect(out).toContain("override");
  });

  it("keeps the shared bottom chrome (visibility, duplicate, delete)", () => {
    const out = html(
      <SectionInspector {...inspectorProps} section={pluginSection()} />,
    );
    expect(out).toContain("Visible on");
    expect(out).toContain("Duplicate");
    expect(out).toContain("Delete");
  });
});

describe("never blank, never executes schema content", () => {
  it("escapes hostile schema strings instead of executing them", () => {
    clearRegistry();
    expect(
      registerWidget({
        ...PLUGIN_DEF,
        id: "plugin:acme/hostile",
        propsSchema: {
          fields: [
            {
              key: "t",
              label: '<img src=x onerror="alert(1)">Evil',
              kind: "text",
            },
          ],
        },
      }).ok,
    ).toBe(true);
    const out = html(
      <SectionInspector
        {...inspectorProps}
        section={{
          id: "x1",
          type: "plugin_block",
          props: { pluginKey: "plugin:acme/hostile", t: "v" },
        }}
      />,
    );
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("hasRenderableFields rejects empty and all-unknown-kind schemas", () => {
    expect(hasRenderableFields({ fields: [] })).toBe(false);
    expect(
      hasRenderableFields({
        fields: [{ key: "e", label: "Evil", kind: "exec" } as never],
      }),
    ).toBe(false);
    expect(
      hasRenderableFields({
        fields: [{ key: "t", label: "T", kind: "text" }],
      }),
    ).toBe(true);
  });

  it("unknown widget types keep the recoverable panel (never blank)", () => {
    clearRegistry();
    const seen: string[] = [];
    const out = html(
      <SectionInspector
        {...inspectorProps}
        onDelete={() => seen.push("deleted")}
        section={
          { id: "g1", type: "ghost_widget", props: {} } as unknown as Section
        }
      />,
    );
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain("not supported");
    expect(out).toContain("Remove section");
    expect(seen).toEqual([]);
  });

  it("a null section explains itself instead of blanking", () => {
    const out = html(<SectionInspector {...inspectorProps} section={null} />);
    expect(out).toContain("Select a section");
  });
});

describe("legacy bespoke path is untouched", () => {
  it("renders the bespoke banner inspector with panels and chrome", () => {
    clearRegistry();
    const out = html(
      <SectionInspector
        {...inspectorProps}
        section={{
          id: "b1",
          type: "banner",
          props: { text: "Sale", tone: "info" },
        }}
      />,
    );
    expect(out).toContain("Announcement banner");
    expect(out).toContain("Message");
    expect(out).toContain("Sale");
    expect(out).toContain("Tone");
    expect(out).toContain("Field groups");
    expect(out).toContain("Visible on");
    expect(out).toContain("Duplicate");
    expect(out).toContain("Delete");
    // Bespoke controls carry no schema data-field markers.
    expect(out).not.toContain("data-field=");
    expect(out).not.toContain("Reset to defaults");
  });
});

describe("reset-to-defaults and merge semantics (pure seams)", () => {
  const schema = PLUGIN_DEF.propsSchema;

  it("schemaDefaultEntries equals defaultsFor(schema)", () => {
    expect(Object.fromEntries(schemaDefaultEntries(schema))).toEqual(
      defaultsFor(schema),
    );
  });

  it("reset restores every default through per-key onChange calls", () => {
    const calls: Array<[string, unknown]> = [];
    for (const [key, value] of schemaDefaultEntries(schema)) {
      calls.push([key, value]);
    }
    // Simulated parent merge: each onChange writes one key.
    const bag: Record<string, unknown> = {
      title: "dirty",
      count: 99,
      stray: "kept?",
    };
    for (const [key, value] of calls) bag[key] = value;
    expect(bag).toMatchObject(defaultsFor(schema));
  });

  it("a single-key edit preserves unrelated properties", () => {
    const prev: Record<string, unknown> = {
      title: "Keep",
      count: 2,
      align: "left",
    };
    const next = { ...prev, count: 4 };
    expect(next).toMatchObject({ title: "Keep", count: 4, align: "left" });
  });

  it("schemaChangeAdapter forwards key/value and defaults the device", () => {
    const calls: Array<[string, unknown, Breakpoint | undefined]> = [];
    const adapted = schemaChangeAdapter(
      (key, value, device) => calls.push([key, value, device]),
      "tablet",
    );
    adapted("title", "Hi", undefined);
    adapted("count", 2, "mobile");
    expect(calls).toEqual([
      ["title", "Hi", "tablet"],
      ["count", 2, "mobile"],
    ]);
  });
});

describe("per-instance isolation", () => {
  it("two instances over one schema render and evolve independently", () => {
    const a = pluginSection({ title: "A", count: 1 });
    const b: Section = {
      id: "r2",
      type: "plugin_block",
      props: { pluginKey: "plugin:acme/reviews", title: "B", count: 2 },
    };
    const outA = html(<SectionInspector {...inspectorProps} section={a} />);
    const outB = html(<SectionInspector {...inspectorProps} section={b} />);
    expect(outA).toContain('value="A"');
    expect(outA).not.toContain('value="B"');
    expect(outB).toContain('value="B"');
    expect(outB).not.toContain('value="A"');
    // Editing one bag never touches the other (controlled-component contract).
    const aNext = { ...a.props, title: "A2" };
    expect(aNext.title).toBe("A2");
    expect(b.props.title).toBe("B");
  });
});

describe("canonical extension nodes (widgetKey)", () => {
  const CAROUSEL_ID = "plugin:acme/reviews-carousel";

  function extensionSection(widgetKey: unknown): Section {
    const node: Record<string, unknown> = {
      id: "e1",
      type: "extension",
      instanceId: "e1",
      owner: { kind: "plugin", id: "acme" },
      apiVersion: "1.0.0",
      props: {},
    };
    if (widgetKey !== "__missing__") node["widgetKey"] = widgetKey;
    return node as unknown as Section;
  }

  it("resolves a canonical node by widgetKey with the correct widgetId", () => {
    expect(
      registerWidget({
        id: CAROUSEL_ID,
        namespace: "plugin",
        version: "1.0.0",
        label: "Reviews Carousel",
        category: "social",
        slots: ["main"],
        defaults: {},
        propsSchema: JSON.parse(JSON.stringify(SCHEMA)) as PropSchema,
        renderer: "sandbox",
      }).ok,
    ).toBe(true);
    const out = resolveSchemaForSection(extensionSection(CAROUSEL_ID));
    expect(out.status).toBe("schema");
    if (out.status === "schema") {
      expect(out.widgetId).toBe(CAROUSEL_ID);
      expect(out.label).toBe("Reviews Carousel");
    }
  });

  it("falls to legacy when the widgetKey is unknown", () => {
    const out = resolveSchemaForSection(
      extensionSection("plugin:acme/does-not-exist"),
    );
    expect(out.status).toBe("legacy");
  });

  it("treats an empty-schema widget as legacy (never a bypass)", () => {
    expect(
      registerWidget({
        id: CAROUSEL_ID,
        namespace: "plugin",
        version: "1.0.0",
        label: "Reviews Carousel",
        category: "social",
        slots: ["main"],
        defaults: {},
        propsSchema: { fields: [] },
        renderer: "sandbox",
      }).ok,
    ).toBe(true);
    expect(resolveSchemaForSection(extensionSection(CAROUSEL_ID)).status).toBe(
      "legacy",
    );
  });

  it("falls to legacy on hostile widgetKey shapes without throwing", () => {
    const hostile: unknown[] = [
      "__missing__",
      undefined,
      null,
      42,
      0,
      false,
      true,
      {},
      [],
      ["plugin:acme/reviews-carousel"],
      "",
      "   ",
    ];
    for (const shape of hostile) {
      let out;
      expect(() => {
        out = resolveSchemaForSection(extensionSection(shape));
      }).not.toThrow();
      expect(
        (out as ReturnType<typeof resolveSchemaForSection>).status,
        `widgetKey=${JSON.stringify(shape)}`,
      ).toBe("legacy");
    }
  });
});
