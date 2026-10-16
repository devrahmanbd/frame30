/**
 * Frame30 — SettingsPanel schema swap-in (TDD).
 *
 * When the selected node is an extension node (`el: "app-block"` + the
 * `extensionInstanceId` envelope) whose widget resolves — threaded `registry`
 * first, shared singleton otherwise — to a non-empty `propsSchema` with at
 * least one renderable field, the panel renders generated controls
 * (`SchemaControls` vocabulary, reused) with schema defaults, per-key
 * validation errors, and reset-to-defaults. Every edit crosses the shared
 * `validateProps` value layer before the existing `onChange(key, value)`
 * node-update seam, so hostile values are neutralized and never stored raw;
 * global plugin settings are unreachable from this path (only schema-known
 * keys plus the `bp` responsive-layer key are ever emitted).
 *
 * Empty-schema / unknown widgets keep the legacy panel byte-identical.
 *
 * Rendering precedent: `renderToStaticMarkup` (vitest env is `node`, no
 * `@testing-library/react` in devDeps — see `SchemaControls.test.tsx`);
 * interaction is covered by the exported pure transitions
 * (`cleanSchemaEdit` / `applySchemaPanelChange` / `resetSchemaPanel`), which
 * are the exact transitions the rendered controls perform.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import {
  applySchemaPanelChange,
  cleanSchemaEdit,
  hasRenderableSchemaFields,
  resetSchemaPanel,
  resolveSchemaForNode,
  schemaResetEntries,
  SettingsPanel,
} from "./SettingsPanel";
import {
  createWidgetRegistry,
  getWidget,
  type UnifiedRegistry,
  type WidgetDef,
} from "@/lib/unified-widget-registry";
import { defaultsFor, validateProps } from "@/lib/widget-props";
import type { SettingValue, StudioNode } from "@/lib/studio/model";

function html(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

/* ---------------------------------------------------------------------------
 * Fixture third-party def: a novel field combo that exists NOWHERE in core.
 * Registered ONLY in a test-local registry passed via the `registry` prop —
 * the shared singleton is never touched (asserted below).
 */

const NOVEL_ID = "plugin:novelty/oddball";

const NOVEL_FIELDS = [
  { key: "title", label: "Title", kind: "text", default: "Fresh", max: 40 },
  { key: "blurb", label: "Blurb", kind: "richtext" },
  { key: "count", label: "Count", kind: "number", min: 1, max: 9, default: 3 },
  { key: "on", label: "Enabled", kind: "boolean", default: true },
  {
    key: "align",
    label: "Align",
    kind: "select",
    options: [
      { value: "left", label: "Left" },
      { value: "right", label: "Right" },
    ],
    default: "left",
  },
  { key: "fg", label: "Colour", kind: "color", default: "#112233" },
  { key: "cta", label: "Link", kind: "link" },
  { key: "photo", label: "Photo", kind: "image" },
  { key: "clip", label: "Clip", kind: "media" },
  {
    key: "detail",
    label: "Detail",
    kind: "text",
    showWhen: { key: "on", equals: true },
  },
  {
    key: "cluster",
    label: "Cluster",
    kind: "group",
    fields: [
      { key: "subtitle", label: "Subtitle", kind: "text", default: "Sub" },
      { key: "accent", label: "Accent", kind: "color", default: "#ff0000" },
    ],
  },
  {
    key: "rows",
    label: "Rows",
    kind: "repeater",
    fields: [
      { key: "name", label: "Name", kind: "text" },
      { key: "qty", label: "Qty", kind: "number", min: 0, max: 99 },
    ],
  },
] as unknown as WidgetDef["propsSchema"]["fields"];

function novelDef(): WidgetDef {
  return {
    id: NOVEL_ID,
    namespace: "plugin",
    version: "1.0.0",
    label: "Oddball",
    category: "novelty",
    slots: ["main"],
    defaults: {},
    propsSchema: { fields: JSON.parse(JSON.stringify(NOVEL_FIELDS)) },
    renderer: "sandbox",
  };
}

function emptyDef(): WidgetDef {
  return {
    ...novelDef(),
    id: "plugin:novelty/empty",
    propsSchema: { fields: [] },
  };
}

function registryWith(defs: WidgetDef[]): UnifiedRegistry {
  const reg = createWidgetRegistry();
  for (const def of defs) expect(reg.registerWidget(def).ok).toBe(true);
  return reg;
}

function extNode(settings: Record<string, unknown> = {}): StudioNode {
  return {
    id: "n1",
    el: "app-block",
    settings: {
      pluginKey: NOVEL_ID,
      extensionInstanceId: "n1",
      extensionApi: "3.1.0",
      ...settings,
    } as StudioNode["settings"],
  };
}

function legacyNode(): StudioNode {
  return { id: "l1", el: "heading", settings: { text: "Hi" } };
}

function panel(
  node: StudioNode,
  extra: Record<string, unknown> = {},
): ReactElement {
  const noop = () => {};
  return (
    <SettingsPanel
      node={node}
      device={(extra.device as "desktop") ?? "desktop"}
      activeDevices={["desktop"]}
      onDevice={noop}
      onChange={noop}
      onBack={noop}
      onResetStyles={noop}
      {...extra}
    />
  );
}

const SCHEMA = { fields: NOVEL_FIELDS } as unknown as Parameters<
  typeof cleanSchemaEdit
>[0];

/* ------------------------------------------------------------------ resolution */

describe("resolveSchemaForNode", () => {
  it("resolves an extension node through the threaded registry", () => {
    const reg = registryWith([novelDef()]);
    const res = resolveSchemaForNode(extNode(), reg);
    expect(res.status).toBe("schema");
    if (res.status !== "schema") return;
    expect(res.widgetId).toBe(NOVEL_ID);
    expect(res.meta).toContain("plugin");
  });

  it("keeps legacy nodes on the legacy panel", () => {
    const reg = registryWith([novelDef()]);
    expect(resolveSchemaForNode(legacyNode(), reg)).toEqual({
      status: "legacy",
    });
    // Envelope without a widget key is not addressable.
    expect(
      resolveSchemaForNode(
        {
          id: "x",
          el: "app-block",
          settings: { extensionInstanceId: "x" },
        } as StudioNode,
        reg,
      ),
    ).toEqual({ status: "legacy" });
  });

  it("falls back to legacy for unknown widgets and empty schemas", () => {
    const reg = registryWith([emptyDef()]);
    expect(resolveSchemaForNode(extNode(), reg)).toEqual({ status: "legacy" });
    expect(
      resolveSchemaForNode(
        extNode({ pluginKey: "plugin:novelty/missing" }),
        reg,
      ),
    ).toEqual({ status: "legacy" });
  });

  it("falls back to legacy for all-unknown-kind schemas", () => {
    expect(
      hasRenderableSchemaFields({
        fields: [{ key: "x", label: "X", kind: "warp-drive" }],
      } as never),
    ).toBe(false);
    expect(hasRenderableSchemaFields(SCHEMA)).toBe(true);
  });

  it("never throws on hostile nodes", () => {
    const reg = registryWith([novelDef()]);
    for (const hostile of [
      null,
      undefined,
      42,
      "node",
      [],
      { el: "app-block", settings: null },
      { el: "app-block", settings: [] },
      { el: "app-block", settings: { extensionInstanceId: {}, pluginKey: [] } },
    ]) {
      expect(resolveSchemaForNode(hostile as never, reg)).toEqual({
        status: "legacy",
      });
    }
    expect(resolveSchemaForNode(extNode(), null)).toEqual({
      status: "legacy",
    });
  });
});

/* ------------------------------------------------------------ control rendering */

describe("schema control rendering", () => {
  it("renders one generated control per scalar kind (no legacy tabs)", () => {
    const reg = registryWith([novelDef()]);
    const out = html(panel(extNode(), { registry: reg }));
    for (const key of ["title", "blurb", "count", "on", "align", "fg", "cta"]) {
      expect(out).toContain(`data-field="${key}"`);
    }
    expect(out).toContain('data-status="full"');
    // Legacy tabbed chrome is gone on the schema path…
    expect(out).not.toContain("studio-settings-tab-general");
    // …but the header + reset affordances remain.
    expect(out).toContain("Edit Oddball");
    expect(out).toContain("Reset to defaults");
    expect(out).toContain("plugin · novelty · v1.0.0");
  });

  it("renders nested group, repeater, and media placeholders", () => {
    const reg = registryWith([novelDef()]);
    const out = html(
      panel(extNode({ rows: [{ name: "A", qty: 2 }] }), { registry: reg }),
    );
    // Group: presentation-only cluster, children stored flat.
    expect(out).toContain('data-field="cluster"');
    expect(out).toContain('data-field="subtitle"');
    expect(out).toContain('data-field="accent"');
    // Repeater: structural rows + add affordance.
    expect(out).toContain('data-field="rows"');
    expect(out).toContain("Add item");
    expect(out).toContain("Item 1");
    // Media kinds: labelled placeholders on the same change contract.
    expect(out).toContain('data-placeholder="image"');
    expect(out).toContain('data-placeholder="media"');
    expect(out).toContain("Clear");
  });

  it("applies schema defaults underneath per-instance values", () => {
    const reg = registryWith([novelDef()]);
    const out = html(panel(extNode(), { registry: reg }));
    // Default title renders; stored value wins when present.
    expect(out).toContain('value="Fresh"');
    const stored = html(panel(extNode({ title: "Stored" }), { registry: reg }));
    expect(stored).toContain('value="Stored"');
    expect(stored).not.toContain('value="Fresh"');
  });

  it("reads responsive bp layers on non-desktop devices", () => {
    const reg = registryWith([novelDef()]);
    const out = html(
      panel(extNode({ title: "Base", bp: { tablet: { title: "Tab" } } }), {
        registry: reg,
        device: "tablet",
      }),
    );
    expect(out).toContain('value="Tab"');
    expect(out).toContain("tablet");
  });

  it("shows keyed validation errors for hostile stored values", () => {
    const reg = registryWith([novelDef()]);
    const out = html(
      panel(
        extNode({
          align: "diagonal",
          count: "not-a-number",
          fg: "not-a-color",
          cta: "javascript:evil()",
        }),
        { registry: reg },
      ),
    );
    expect(out).toContain("align.not_an_option");
    expect(out).toContain("count.not_a_number");
    expect(out).toContain("fg.not_a_color");
    expect(out).toContain("cta.not_a_url");
  });

  it("gates showWhen fields from rendering only", () => {
    const reg = registryWith([novelDef()]);
    const hidden = html(panel(extNode({ on: false }), { registry: reg }));
    expect(hidden).not.toContain('data-field="detail"');
    const shown = html(panel(extNode({ on: true }), { registry: reg }));
    expect(shown).toContain('data-field="detail"');
    // Hidden values are still validated by the shared validator the panel
    // uses for its error display, and kept in storage (never deleted).
    const errors = validateProps(SCHEMA, {
      on: false,
      detail: "x".repeat(9000),
    } as never).errors;
    expect(errors).toContain("detail.too_long");
    const edit = cleanSchemaEdit(
      SCHEMA,
      { on: false, detail: "kept" },
      "title",
      "New",
    );
    expect(edit).toEqual({ key: "title", value: "New" });
  });
});

/* ------------------------------------------------------- validated write seam */

describe("cleanSchemaEdit", () => {
  it("cleans hostile values instead of storing them raw", () => {
    expect(
      cleanSchemaEdit(SCHEMA, {}, "title", "<script>evil()</script>Hi"),
    ).toEqual({ key: "title", value: "Hi" });
    expect(cleanSchemaEdit(SCHEMA, {}, "count", "7")).toEqual({
      key: "count",
      value: 7,
    });
    expect(cleanSchemaEdit(SCHEMA, {}, "count", 99)).toEqual({
      key: "count",
      value: 9,
    });
    expect(cleanSchemaEdit(SCHEMA, {}, "on", "true")).toEqual({
      key: "on",
      value: true,
    });
    expect(cleanSchemaEdit(SCHEMA, {}, "fg", "#AABBCC")).toEqual({
      key: "fg",
      value: "#aabbcc",
    });
    // Invalid select falls back to the declared default, never raw.
    expect(cleanSchemaEdit(SCHEMA, {}, "align", "diagonal")).toEqual({
      key: "align",
      value: "left",
    });
    // Unsafe URLs are rejected to the empty default, never stored.
    expect(cleanSchemaEdit(SCHEMA, {}, "cta", "javascript:evil()")).toEqual({
      key: "cta",
      value: "",
    });
    // Non-finite numbers fall back to the declared default, never NaN.
    expect(cleanSchemaEdit(SCHEMA, {}, "count", Number.NaN)).toEqual({
      key: "count",
      value: 3,
    });
  });

  it("fails closed on unknown, envelope, and hostile keys", () => {
    for (const key of [
      "nope",
      "pluginKey",
      "extensionInstanceId",
      "extensionApi",
      "extensionVersion",
      "pluginSettings",
      "settings",
      "globals",
      "",
      "__proto__",
    ]) {
      expect(cleanSchemaEdit(SCHEMA, {}, key, "x")).toBeNull();
    }
  });

  it("routes non-desktop devices through the validated bp layer", () => {
    const edit = cleanSchemaEdit(
      SCHEMA,
      { title: "Base", bp: { tablet: { title: "Old" } } },
      "title",
      "<b>Tab</b>",
      "tablet",
    );
    expect(edit?.key).toBe("bp");
    const layer = (edit?.value as Record<string, Record<string, unknown>>)
      .tablet;
    expect(layer.title).toBe("Tab");
    // Desktop writes stay flat.
    expect(cleanSchemaEdit(SCHEMA, {}, "title", "D", "desktop")).toEqual({
      key: "title",
      value: "D",
    });
    expect(cleanSchemaEdit(SCHEMA, {}, "title", "D", "__proto__")).toBeNull();
  });

  it("never throws on hostile props or schemas", () => {
    expect(cleanSchemaEdit(null as never, null as never, "x", "y")).toBeNull();
    expect(
      cleanSchemaEdit(SCHEMA, null as never, "title", { evil: 1 }),
    ).not.toBeNull();
  });
});

describe("applySchemaPanelChange + resetSchemaPanel", () => {
  it("writes validated values through the existing onChange seam", () => {
    const calls: Array<[string, SettingValue]> = [];
    const onChange = (key: string, value: SettingValue) => {
      calls.push([key, value]);
    };
    expect(
      applySchemaPanelChange(
        SCHEMA,
        {},
        "title",
        "<script>evil()</script>Hi",
        undefined,
        onChange,
      ),
    ).toBe(true);
    expect(calls).toEqual([["title", "Hi"]]);
    // Dropped edits issue no write.
    expect(
      applySchemaPanelChange(
        SCHEMA,
        {},
        "pluginKey",
        "evil",
        undefined,
        onChange,
      ),
    ).toBe(false);
    expect(calls).toHaveLength(1);
    // Responsive edits write the bp layer object through the same seam.
    expect(
      applySchemaPanelChange(SCHEMA, {}, "title", "T", "tablet", onChange),
    ).toBe(true);
    expect(calls[1]?.[0]).toBe("bp");
  });

  it("reset writes one default per schema key (never envelope/globals)", () => {
    const calls: Array<[string, SettingValue]> = [];
    resetSchemaPanel(SCHEMA, (key, value) => {
      calls.push([key, value]);
    });
    const expected = schemaResetEntries(SCHEMA);
    expect(calls).toEqual(expected);
    const keys = calls.map(([key]) => key);
    expect(keys).toContain("title");
    expect(keys).toContain("subtitle");
    for (const banned of [
      "pluginKey",
      "extensionInstanceId",
      "extensionApi",
      "extensionVersion",
    ]) {
      expect(keys).not.toContain(banned);
    }
    // Entries match the shared defaults layer exactly.
    expect(Object.fromEntries(expected)).toEqual(defaultsFor(SCHEMA));
  });

  it("only ever emits schema-known keys plus bp (no global settings path)", () => {
    const known = new Set([
      ...Object.keys(defaultsFor(SCHEMA)),
      "detail",
      "bp",
    ]);
    const seen = new Set<string>();
    const onChange = (key: string) => {
      seen.add(key);
    };
    for (const key of [
      "title",
      "count",
      "on",
      "align",
      "fg",
      "cta",
      "photo",
      "clip",
      "subtitle",
      "rows",
      "pluginKey",
      "settings",
      "globals",
    ]) {
      applySchemaPanelChange(SCHEMA, {}, key, "x", undefined, onChange);
    }
    applySchemaPanelChange(SCHEMA, {}, "title", "x", "tablet", onChange);
    resetSchemaPanel(SCHEMA, onChange);
    for (const key of seen) expect(known.has(key)).toBe(true);
  });
});

/* -------------------------------------------------------------- legacy safety */

describe("legacy fallback", () => {
  it("keeps the legacy panel byte-identical for non-extension nodes", () => {
    const reg = registryWith([novelDef()]);
    const node = legacyNode();
    expect(html(panel(node, { registry: reg }))).toBe(html(panel(node)));
    expect(html(panel(node))).toContain("studio-settings-tab-general");
  });

  it("keeps the legacy panel byte-identical for empty/unknown schemas", () => {
    const reg = registryWith([emptyDef()]);
    const empty = extNode({ pluginKey: "plugin:novelty/empty" });
    expect(html(panel(empty, { registry: reg }))).toBe(html(panel(empty)));
    expect(html(panel(empty))).toContain("studio-settings-tab-general");
    const missing = extNode({ pluginKey: "plugin:novelty/missing" });
    expect(html(panel(missing, { registry: reg }))).toBe(html(panel(missing)));
  });
});

/* ---------------------------------------------------------- no-core-change proof */

describe("third-party widgets need no core changes", () => {
  it("renders a fixture def known only to the threaded registry", () => {
    const reg = registryWith([novelDef()]);
    const out = html(panel(extNode(), { registry: reg }));
    expect(out).toContain('data-field="title"');
    expect(out).toContain('data-field="rows"');
    // The shared singleton was never taught this widget.
    expect(getWidget(NOVEL_ID)).toBeUndefined();
    // …and the singleton path still falls back to legacy for it.
    expect(html(panel(extNode()))).toContain("studio-settings-tab-general");
  });
});
