/**
 * Frame30 item 4 — StudioBuilder's ACTUAL settings panel (TDD).
 *
 * The selected extension twin resolves by canonical owner + `widgetKey`
 * through the threaded authorized registry — never the singleton when
 * threaded is provided (proven: the singleton lacks the def yet the panel
 * resolves to generated controls). Full control coverage without hardcoding
 * any third-party widget in core: text / richtext / number / boolean /
 * select / color / media (image + media + video placeholders) / link /
 * group / nested repeater rows / data-bindings (product + collection +
 * category) / responsive `bp` / `showWhen` / validation-errors / reset.
 *
 * Fixture def lives ONLY here (`plugin:novelty/*`); a static pin asserts the
 * panel source never names it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import {
  cleanSchemaEdit,
  resolveSchemaForNode,
  SettingsPanel,
} from "./SettingsPanel";
import { twinAddressOf } from "@/lib/studio/extension-lifecycle";
import {
  createWidgetRegistry,
  getWidget,
  type UnifiedRegistry,
  type WidgetDef,
} from "@/lib/unified-widget-registry";
import { ownerForWidgetKey } from "@/lib/builder-ast";
import type { StudioNode } from "@/lib/studio/model";

const NOVEL_ID = "plugin:novelty/oddball-lifecycle";

/* Novel combo covering EVERY required control family — exists nowhere else. */
const FIELDS = [
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
  { key: "trailer", label: "Trailer", kind: "video" },
  { key: "prod", label: "Product", kind: "product" },
  { key: "coll", label: "Collection", kind: "collection" },
  { key: "cat", label: "Category", kind: "category" },
  { key: "badge", label: "Badge", kind: "icon" },
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
      {
        key: "tone",
        label: "Tone",
        kind: "select",
        options: [
          { value: "info", label: "Info" },
          { value: "warn", label: "Warn" },
        ],
      },
    ],
  },
] as unknown as WidgetDef["propsSchema"]["fields"];

function def(): WidgetDef {
  return {
    id: NOVEL_ID,
    namespace: "plugin",
    version: "1.0.0",
    label: "Lifecycle Oddball",
    category: "novelty",
    slots: ["main"],
    defaults: {},
    propsSchema: { fields: JSON.parse(JSON.stringify(FIELDS)) },
    renderer: "sandbox",
  };
}

function registryWith(): UnifiedRegistry {
  const reg = createWidgetRegistry();
  expect(reg.registerWidget(def()).ok).toBe(true);
  return reg;
}

function twin(settings: Record<string, unknown> = {}): StudioNode {
  return {
    id: "sel-1",
    el: "app-block",
    settings: {
      pluginKey: NOVEL_ID,
      extensionInstanceId: "sel-1",
      extensionApi: "3.1.0",
      ...settings,
    } as StudioNode["settings"],
  };
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

const html = (node: ReactElement): string => renderToStaticMarkup(node);

describe("item 4 — threaded authorized registry, never the singleton", () => {
  it("resolves by canonical owner + widgetKey through the threaded registry", () => {
    const reg = registryWith();
    const node = twin();
    const addr = twinAddressOf(node);
    expect(addr?.widgetKey).toBe(NOVEL_ID);
    expect(addr?.owner).toEqual(ownerForWidgetKey(NOVEL_ID));
    expect(addr?.owner).toEqual({ kind: "plugin", id: "novelty" });
    const res = resolveSchemaForNode(node, reg);
    expect(res.status).toBe("schema");
    if (res.status !== "schema") return;
    expect(res.widgetId).toBe(NOVEL_ID);
  });

  it("proves the singleton lacks the def yet the threaded panel resolves", () => {
    const reg = registryWith();
    expect(getWidget(NOVEL_ID)).toBeUndefined();
    const threaded = html(panel(twin(), { registry: reg }));
    expect(threaded).toContain('data-field="title"');
    expect(threaded).not.toContain("studio-settings-tab-general");
    // Same node WITHOUT the threaded registry falls back to legacy.
    const singleton = html(panel(twin()));
    expect(singleton).toContain("studio-settings-tab-general");
    expect(singleton).not.toContain('data-field="title"');
  });

  it("never hardcodes any third-party widget in core", () => {
    const source = readFileSync(
      "src/components/builder/studio/SettingsPanel.tsx",
      "utf8",
    );
    expect(source).not.toContain("novelty");
    expect(source).not.toContain("oddball");
    const lifecycle = readFileSync(
      "src/lib/studio/extension-lifecycle.ts",
      "utf8",
    );
    expect(lifecycle).not.toContain("novelty");
  });
});

describe("item 4 — full control coverage from one novel schema", () => {
  it("renders every scalar + placeholder + structural family", () => {
    const reg = registryWith();
    const out = html(
      panel(twin({ rows: [{ name: "A", qty: 2, tone: "info" }] }), {
        registry: reg,
      }),
    );
    for (const key of [
      "title",
      "blurb",
      "count",
      "on",
      "align",
      "fg",
      "cta",
      "badge",
      "cat",
    ]) {
      expect(out, key).toContain(`data-field="${key}"`);
    }
    // Media pickers (image/media/video) + data pickers (product/collection).
    for (const kind of ["image", "media", "video", "product", "collection"]) {
      expect(out, kind).toContain(`data-placeholder="${kind}"`);
    }
    // Group cluster + nested repeater rows.
    expect(out).toContain('data-field="cluster"');
    expect(out).toContain('data-field="subtitle"');
    expect(out).toContain('data-field="rows"');
    expect(out).toContain("Item 1");
    expect(out).toContain("Add item");
    expect(out).toContain("Edit Lifecycle Oddball");
    expect(out).toContain("Reset to defaults");
  });

  it("reads responsive bp layers on non-desktop devices", () => {
    const reg = registryWith();
    const out = html(
      panel(twin({ title: "Base", bp: { tablet: { title: "Tab" } } }), {
        registry: reg,
        device: "tablet",
      }),
    );
    expect(out).toContain('value="Tab"');
  });

  it("gates showWhen from rendering only (values still validate + persist)", () => {
    const reg = registryWith();
    expect(html(panel(twin({ on: false }), { registry: reg }))).not.toContain(
      'data-field="detail"',
    );
    expect(html(panel(twin({ on: true }), { registry: reg }))).toContain(
      'data-field="detail"',
    );
  });

  it("shows keyed validation errors for hostile stored values", () => {
    const reg = registryWith();
    const out = html(
      panel(
        twin({
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

  it("validates writes + resets through the shared layer (never raw)", () => {
    const reg = registryWith();
    const node = twin();
    const res = resolveSchemaForNode(node, reg);
    expect(res.status).toBe("schema");
    if (res.status !== "schema") return;
    expect(
      cleanSchemaEdit(res.schema, {}, "title", "<script>evil()</script>Hi"),
    ).toEqual({ key: "title", value: "Hi" });
    expect(cleanSchemaEdit(res.schema, {}, "count", 99)).toEqual({
      key: "count",
      value: 9,
    });
    // Envelope / unknown keys fail closed.
    for (const key of ["pluginKey", "extensionInstanceId", "nope"]) {
      expect(cleanSchemaEdit(res.schema, {}, key, "x")).toBeNull();
    }
    // Responsive writes go through the validated bp layer.
    const edit = cleanSchemaEdit(
      res.schema,
      { title: "Base" },
      "title",
      "Tab",
      "tablet",
    );
    expect(edit?.key).toBe("bp");
  });
});
