/**
 * Studio persistence pipeline — Pass 1: insertion → inspector-edit →
 * autosave-serialize → reload → duplicate → preview-propagation.
 *
 * Pins the PUBLISHED module contracts (not implementation details):
 * - `buildExtensionInsert` (plugin-tray.ts:272) — canonical insert, registry
 *   defaults schema-cleaned via `validateProps`/`defaultsFor`, unique instance
 *   id, permitted-location snapshot, selected id.
 * - `validateProps` (widget-props.ts) — the SINGLE validator both sides call;
 *   unknown keys stripped, every known key present, `<key>.<code>` errors.
 * - `serializeStudioBody` (studio/model.ts:857) — the autosave payload the
 *   shell writes on every canvas change (`EditorShell` `onChange`).
 * - `parseStudioBody` (studio/model.ts:733) — the reload path.
 * - `studioNodeForExtension` (plugin-tray.ts:156) — the studio `app-block`
 *   twin the canvas renders; `pluginKey` preserved, instance id kept.
 * - `validateInstanceProps` (WidgetSandbox.tsx:156) — the PluginBlock preview
 *   boundary: re-validated per-instance props, DISTINCT from install globals.
 *
 * Each stage is exercised with a schema-driven plugin widget; every seam is
 * mirrored with a legacy widget control so a failure can be attributed to a
 * real source gap rather than a test error.
 */
import { describe, expect, it } from "vitest";
import {
  buildExtensionInsert,
  studioNodeForExtension,
} from "@/components/builder/studio/plugin-tray";
import {
  createWidgetRegistry,
  type WidgetDef,
} from "@/lib/unified-widget-registry";
import { defaultsFor, validateProps } from "@/lib/widget-props";
import { validateInstanceProps } from "@/components/marketplace/WidgetSandbox";
import {
  defaultPageSettings,
  parseStudioBody,
  serializeStudioBody,
  type StudioDoc,
} from "@/lib/studio/model";
import { newWidgetNode } from "@/lib/studio/catalog";

const WIDGET_KEY = "plugin:acme/reviews";

function schemaDef(): WidgetDef {
  return {
    id: WIDGET_KEY,
    namespace: "plugin",
    version: "1.0.0",
    label: "Label plugin:acme/reviews",
    category: "plugin",
    slots: ["main"],
    defaults: { title: "Declared default", limit: 5, tone: "info" },
    propsSchema: {
      fields: [
        { key: "title", label: "Title", kind: "text", default: "Fallback" },
        { key: "limit", label: "Limit", kind: "number", min: 1, max: 24 },
        {
          key: "tone",
          label: "Tone",
          kind: "select",
          options: [
            { value: "info", label: "Info" },
            { value: "warn", label: "Warning" },
          ],
        },
      ],
    },
    renderer: "sandbox",
  };
}

function registryWithWidget() {
  const registry = createWidgetRegistry();
  expect(registry.registerWidget(schemaDef()).ok).toBe(true);
  return registry;
}

function insertOk(instanceId: string) {
  const out = buildExtensionInsert(registryWithWidget(), {
    widgetKey: WIDGET_KEY,
    slot: "main",
    generateId: () => instanceId,
  });
  expect(out.ok).toBe(true);
  if (!out.ok) throw new Error("insert must succeed");
  return out.node;
}

describe("pass 1 — insertion initializes validated defaults", () => {
  it("carries schema-cleaned declared defaults, identity, slot, selection", () => {
    const registry = registryWithWidget();
    const out = buildExtensionInsert(registry, {
      widgetKey: WIDGET_KEY,
      slot: "main",
      generateId: () => "ext-pass1-a",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.node.type).toBe("extension");
    expect(out.node.widgetKey).toBe(WIDGET_KEY);
    expect(out.node.props["title"]).toBe("Declared default");
    expect(out.node.props["limit"]).toBe(5);
    expect(out.node.props["tone"]).toBe("info");
    expect(out.node.id).toBe("ext-pass1-a");
    expect(out.node.instanceId).toBe("ext-pass1-a");
    expect(out.selectedId).toBe("ext-pass1-a");
    expect(out.node.owner).toEqual({ kind: "plugin", id: "acme" });
    expect(out.node.slots).toEqual(["main"]);
  });

  it("matches the shared value layer exactly (declared defaults win)", () => {
    const node = insertOk("ext-pass1-b");
    const def = schemaDef();
    const merged = {
      ...(defaultsFor(def.propsSchema) as Record<string, unknown>),
      ...(JSON.parse(JSON.stringify(def.defaults)) as Record<string, unknown>),
    };
    const expected = validateProps(def.propsSchema, merged).clean;
    expect(node.props).toEqual(expected);
    expect(JSON.stringify(node.props)).toBe(JSON.stringify(expected));
  });

  it("control: a legacy widget inserts with its own defaults at the same seam", () => {
    const legacy = newWidgetNode("heading");
    expect(legacy.el).toBe("heading");
    expect(legacy.settings).toMatchObject({ text: expect.any(String) });
  });
});

describe("pass 1 — inspector edits validate through the shared layer", () => {
  it("a valid edit changes one key and keeps siblings byte-identical", () => {
    const node = insertOk("ext-pass1-edit");
    const before = JSON.parse(JSON.stringify(node.props)) as Record<
      string,
      unknown
    >;
    const edited = validateProps(schemaDef().propsSchema, {
      ...before,
      title: "New headline",
    });
    expect(edited.ok).toBe(true);
    expect(edited.errors).toEqual([]);
    expect(edited.clean["title"]).toBe("New headline");
    expect(edited.clean["limit"]).toBe(before["limit"]);
    expect(edited.clean["tone"]).toBe(before["tone"]);
    // The stored node is untouched — validation never mutates its input.
    expect(node.props["title"]).toBe(before["title"]);
  });

  it("an invalid value is refused with a field code; siblings survive", () => {
    const node = insertOk("ext-pass1-refuse");
    const base = JSON.parse(JSON.stringify(node.props)) as Record<
      string,
      unknown
    >;
    const refused = validateProps(schemaDef().propsSchema, {
      ...base,
      limit: "not-a-number",
    });
    expect(refused.ok).toBe(false);
    expect(refused.errors).toContain("limit.not_a_number");
    expect(refused.clean["title"]).toBe(base["title"]);
    expect(refused.clean["tone"]).toBe(base["tone"]);
  });

  it("unknown keys are stripped, never stored", () => {
    const node = insertOk("ext-pass1-strip");
    const base = JSON.parse(JSON.stringify(node.props)) as Record<
      string,
      unknown
    >;
    const cleaned = validateProps(schemaDef().propsSchema, {
      ...base,
      evil: "<script>alert(1)</script>",
    });
    expect(cleaned.clean).not.toHaveProperty("evil");
    expect(cleaned.clean["title"]).toBe(base["title"]);
  });

  it("control: the same edit seam works for a legacy widget node", () => {
    const legacy = newWidgetNode("heading");
    const edited = { ...legacy.settings, text: "Edited heading" };
    expect(edited["text"]).toBe("Edited heading");
    expect(legacy.settings["text"]).not.toBe("Edited heading");
  });
});

describe("pass 1 — autosave-serialize → reload preserves props byte-identical", () => {
  function autosaveReload(props: Record<string, unknown>): {
    body: string;
    reloaded: Record<string, unknown>;
  } {
    const node = insertOk("ext-pass1-wire-node");
    node.props = JSON.parse(JSON.stringify(props)) as Record<string, unknown>;
    const twin = studioNodeForExtension(node);
    const doc: StudioDoc = {
      version: 2,
      root: [twin],
      page: defaultPageSettings("Pass 1"),
    };
    // The autosave payload: `onChange(next) => setBody(serializeStudioBody(next))`.
    const body = serializeStudioBody(doc);
    const reloadedDoc = parseStudioBody(body);
    expect(reloadedDoc).not.toBeNull();
    return {
      body,
      reloaded: reloadedDoc!.root[0]!.settings as Record<string, unknown>,
    };
  }

  it("validated per-instance props survive the wire byte-identical", () => {
    const node = insertOk("ext-pass1-wire");
    const edited = validateProps(schemaDef().propsSchema, {
      ...node.props,
      title: "Authored headline",
      limit: 12,
    }).clean as Record<string, unknown>;
    const { reloaded } = autosaveReload(edited);
    expect(reloaded["title"]).toBe("Authored headline");
    expect(reloaded["limit"]).toBe(12);
    expect(reloaded["tone"]).toBe(edited["tone"]);
    expect(reloaded["pluginKey"]).toBe(WIDGET_KEY);
    expect(reloaded["extensionInstanceId"]).toBe("ext-pass1-wire-node");
    expect(JSON.stringify(reloaded)).toBe(
      JSON.stringify(
        studioNodeForExtension({
          ...node,
          id: "ext-pass1-wire-node",
          instanceId: "ext-pass1-wire-node",
          props: edited,
        }).settings,
      ),
    );
  });

  it("a second serialize is stable (reload does not drift)", () => {
    const node = insertOk("ext-pass1-stable");
    const twin = studioNodeForExtension(node);
    const doc: StudioDoc = {
      version: 2,
      root: [twin],
      page: defaultPageSettings("Pass 1"),
    };
    const first = serializeStudioBody(doc);
    const second = serializeStudioBody(parseStudioBody(first)!);
    expect(second).toBe(first);
  });

  it("control: a legacy widget survives the same wire byte-identical", () => {
    const legacy = newWidgetNode("heading");
    const doc: StudioDoc = {
      version: 2,
      root: [legacy],
      page: defaultPageSettings("Pass 1 legacy"),
    };
    const body = serializeStudioBody(doc);
    const reloaded = parseStudioBody(body)!;
    expect(reloaded.root[0]!.settings).toEqual(legacy.settings);
    expect(JSON.stringify(reloaded.root[0]!.settings)).toBe(
      JSON.stringify(legacy.settings),
    );
  });
});

describe("pass 1 — duplicates stay independent", () => {
  it("two instances never share identity or props references", () => {
    const a = insertOk("ext-pass1-dup-a");
    const b = insertOk("ext-pass1-dup-b");
    expect(a.instanceId).not.toBe(b.instanceId);
    expect(a.props).toEqual(b.props);
    expect(a.props).not.toBe(b.props);
    (a.props as Record<string, unknown>)["title"] = "Only A";
    expect(b.props["title"]).toBe("Declared default");
  });

  it("editing a duplicate's validated copy leaves the original intact", () => {
    const original = insertOk("ext-pass1-dup-orig");
    const dupeProps = JSON.parse(JSON.stringify(original.props)) as Record<
      string,
      unknown
    >;
    const edited = validateProps(schemaDef().propsSchema, {
      ...dupeProps,
      title: "Duplicate headline",
    }).clean;
    expect(edited["title"]).toBe("Duplicate headline");
    expect(original.props["title"]).toBe("Declared default");
  });

  it("control: two legacy inserts are independent at the same seam", () => {
    const a = newWidgetNode("heading");
    const b = newWidgetNode("heading");
    expect(a.id).not.toBe(b.id);
    expect(a.settings).not.toBe(b.settings);
    a.settings["text"] = "Only A";
    expect(b.settings["text"]).not.toBe("Only A");
  });
});

describe("pass 1 — preview propagation re-validates at the boundary", () => {
  it("hostile/unknown values are neutralised, known values pass through", () => {
    const out = validateInstanceProps(
      {
        title: "<script>alert(1)</script>Hi",
        limit: 99,
        tone: "nope",
        unknownKey: "drop me",
      },
      schemaDef().propsSchema,
    );
    expect(out["title"]).toBe("Hi");
    expect(out["limit"]).toBe(24);
    expect(out["tone"]).toBe("info");
    expect(out).not.toHaveProperty("unknownKey");
  });

  it("returns a fresh object every call; stored props are never mutated", () => {
    const node = insertOk("ext-pass1-boundary");
    const stored = JSON.parse(JSON.stringify(node.props)) as Record<
      string,
      unknown
    >;
    const first = validateInstanceProps(stored, schemaDef().propsSchema);
    const second = validateInstanceProps(stored, schemaDef().propsSchema);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first).not.toBe(stored);
    expect(stored).toEqual(node.props);
  });

  it("per-instance props stay DISTINCT from install globals (PluginBlock contract)", () => {
    const globals = { apiKey: "sk-live-123", currency: "BDT" };
    const snapshot = JSON.parse(JSON.stringify(globals));
    const clean = validateInstanceProps(
      { title: "Live", limit: 3, tone: "warn" },
      schemaDef().propsSchema,
    );
    expect(clean).toEqual({ title: "Live", limit: 3, tone: "warn" });
    expect(clean).not.toHaveProperty("apiKey");
    expect(clean).not.toHaveProperty("currency");
    expect(globals).toEqual(snapshot);
  });

  it("control: the boundary preserves legacy (schema-less) props JSON-safe", () => {
    const legacy = newWidgetNode("heading");
    const clean = validateInstanceProps(legacy.settings, null);
    expect(clean).toMatchObject({ text: expect.any(String) });
    expect(clean).not.toBe(legacy.settings);
  });
});
