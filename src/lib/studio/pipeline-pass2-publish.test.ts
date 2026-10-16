/**
 * Studio persistence pipeline — Pass 2: publishing / storefront.
 *
 * Pins the PUBLISHED module contracts (not implementation details):
 * - The PUBLISHED document is a `serializeStudioBody` payload whose parsed
 *   nodes carry their own instance props: no draft bleed, no globals.
 * - `createStudioPublishHandler` (EditorShell.tsx:136) flushes the live
 *   canvas into the shell body BEFORE `commit("publish")` reads it.
 * - Missing/disabled widgets degrade to explicit, data-preserving recovery:
 *   `buildExtensionInsert` misses (`unknown`/`disabled`/`incompatible`/
 *   `uninstalled`/`illegal_slot` + `preservedData`), `resolveExtensionNode`
 *   / `toExtensionPlaceholder` (`extension.missing:<reason>`), and
 *   `extensionMissingReason` — never a silent wrong-widget render
 *   (`parseAst` unknown types become `unknown_widget:<type>` placeholders;
 *   `extensionToPluginBlock` returns null off the plugin namespace).
 */
import { describe, expect, it, vi } from "vitest";
import {
  buildExtensionInsert,
  studioNodeForExtension,
} from "@/components/builder/studio/plugin-tray";
import {
  createWidgetRegistry,
  type WidgetDef,
} from "@/lib/unified-widget-registry";
import { validateProps } from "@/lib/widget-props";
import { validateInstanceProps } from "@/components/marketplace/WidgetSandbox";
import {
  defaultPageSettings,
  parseStudioBody,
  serializeStudioBody,
  type StudioDoc,
  type StudioNode,
} from "@/lib/studio/model";
import { createStudioPublishHandler } from "@/components/admin/editor/EditorShell";
import {
  extensionMissingReason,
  extensionToPluginBlock,
  parseAst,
  pluginBlockToExtension,
  resolveExtensionNode,
  type Section,
} from "@/lib/builder-ast";
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

/** A persisted studio twin carrying validated per-instance props. */
function persistedTwin(instanceId: string, title: string): StudioNode {
  const out = buildExtensionInsert(registryWithWidget(), {
    widgetKey: WIDGET_KEY,
    slot: "main",
    generateId: () => instanceId,
  });
  expect(out.ok).toBe(true);
  if (!out.ok) throw new Error("insert must succeed");
  const clean = validateProps(schemaDef().propsSchema, {
    ...out.node.props,
    title,
  }).clean as Record<string, unknown>;
  return studioNodeForExtension({ ...out.node, props: clean });
}

function publishedBodyOf(twin: StudioNode, title: string): string {
  const doc: StudioDoc = {
    version: 2,
    root: [twin],
    page: { ...defaultPageSettings(title), status: "published" },
  };
  return serializeStudioBody(doc);
}

describe("pass 2 — the PUBLISHED document carries its own instance props", () => {
  it("draft and published bodies each parse back their own props (no bleed)", () => {
    const draftTwin = persistedTwin("ext-pass2-draft", "Draft copy");
    const liveTwin = persistedTwin("ext-pass2-live", "Live copy");
    const draftBody = publishedBodyOf(draftTwin, "Draft");
    const liveBody = publishedBodyOf(liveTwin, "Live");

    expect(liveBody).toContain("Live copy");
    expect(liveBody).not.toContain("Draft copy");
    expect(draftBody).toContain("Draft copy");
    expect(draftBody).not.toContain("Live copy");

    const live = parseStudioBody(liveBody)!;
    const draft = parseStudioBody(draftBody)!;
    expect((live.root[0]!.settings as Record<string, unknown>)["title"]).toBe(
      "Live copy",
    );
    expect((draft.root[0]!.settings as Record<string, unknown>)["title"]).toBe(
      "Draft copy",
    );
    expect(live.root[0]!.settings).not.toEqual(draft.root[0]!.settings);
  });

  it("published props are instance props, never install globals", () => {
    const live = parseStudioBody(
      publishedBodyOf(persistedTwin("ext-pass2-globals", "Live"), "Live"),
    )!;
    const stored = live.root[0]!.settings as Record<string, unknown>;
    const globals = { apiKey: "sk-live-123", currency: "BDT" };
    const snapshot = JSON.parse(JSON.stringify(globals));
    const forPreview = validateInstanceProps(
      {
        title: stored["title"],
        limit: stored["limit"],
        tone: stored["tone"],
      },
      schemaDef().propsSchema,
    );
    expect(forPreview).toEqual({ title: "Live", limit: 5, tone: "info" });
    expect(forPreview).not.toHaveProperty("apiKey");
    expect(globals).toEqual(snapshot);
  });

  it("control: a legacy widget publishes its own props at the same seam", () => {
    const legacy = newWidgetNode("heading");
    legacy.settings["text"] = "Legacy headline";
    const body = publishedBodyOf(legacy, "Legacy");
    const parsed = parseStudioBody(body)!;
    expect(parsed.page.status).toBe("published");
    expect(parsed.root[0]!.settings["text"]).toBe("Legacy headline");
  });
});

describe("pass 2 — publish flushes the live canvas before commit", () => {
  it("serializes the next doc, then publishes, carrying the latest props", async () => {
    const seen: string[] = [];
    const order: string[] = [];
    const publish = vi.fn().mockResolvedValue(undefined);
    const handle = createStudioPublishHandler(
      (body) => {
        order.push("serialize");
        seen.push(body);
      },
      async () => {
        order.push("publish");
        await publish();
      },
      async () => {},
    );
    const doc: StudioDoc = {
      version: 2,
      root: [persistedTwin("ext-pass2-flush", "Just typed")],
      page: defaultPageSettings("Flush"),
    };
    await handle(doc);
    expect(order).toEqual(["serialize", "publish"]);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(seen).toHaveLength(1);
    const flushed = parseStudioBody(seen[0])!;
    expect(
      (flushed.root[0]!.settings as Record<string, unknown>)["title"],
    ).toBe("Just typed");
  });
});

describe("pass 2 — missing/disabled widgets degrade to explicit recovery", () => {
  function extensionSection(instanceId: string): Section {
    const out = buildExtensionInsert(registryWithWidget(), {
      widgetKey: WIDGET_KEY,
      slot: "main",
      generateId: () => instanceId,
    });
    if (!out.ok) throw new Error("insert must succeed");
    return {
      id: out.node.id,
      type: "extension",
      props: JSON.parse(JSON.stringify(out.node.props)) as Section["props"],
      instanceId: out.node.instanceId,
      widgetKey: out.node.widgetKey,
      owner: { ...out.node.owner },
      apiVersion: out.node.apiVersion,
    } as unknown as Section;
  }

  it("unknown ids miss as unknown with data preserved (never a wrong widget)", () => {
    const out = buildExtensionInsert(registryWithWidget(), {
      widgetKey: "builtin:ghost",
      slot: "main",
    });
    expect(out).toMatchObject({ ok: false, error: "unknown" });
    if (out.ok) return;
    expect(out.preservedData).toBeDefined();
  });

  it("absent plugin ids miss as uninstalled; disabled widgets as disabled", () => {
    const ghost = buildExtensionInsert(registryWithWidget(), {
      widgetKey: "plugin:ghost/widget",
      slot: "main",
    });
    expect(ghost).toMatchObject({ ok: false, error: "uninstalled" });

    const registry = registryWithWidget();
    expect(registry.disableWidget(WIDGET_KEY).ok).toBe(true);
    const off = buildExtensionInsert(registry, {
      widgetKey: WIDGET_KEY,
      slot: "main",
    });
    expect(off).toMatchObject({ ok: false, error: "disabled" });
    if (off.ok) return;
    expect(off.preservedData).toBeDefined();
  });

  it("an unresolvable instance becomes a labelled placeholder with props intact", () => {
    const node = extensionSection("ext-pass2-missing");
    const before = JSON.parse(JSON.stringify(node.props));
    const verdict = resolveExtensionNode(node, () => ({
      ok: false,
      reason: "disabled",
    }));
    expect(verdict.missing).toBe(true);
    expect(verdict.reason).toBe("disabled");
    expect(verdict.node.invalid).toBe("extension.missing:disabled");
    expect(verdict.node.props).toEqual(before);
    expect(extensionMissingReason(verdict.node)).toBe("disabled");
  });

  it("recovery clears the marker and restores the instance byte-identical", () => {
    const node = extensionSection("ext-pass2-recover");
    const before = JSON.parse(JSON.stringify(node.props));
    const missing = resolveExtensionNode(node, () => ({
      ok: false,
      reason: "uninstalled",
    })).node;
    expect(extensionMissingReason(missing)).toBe("uninstalled");
    const recovered = resolveExtensionNode(missing, () => ({ ok: true }));
    expect(recovered.missing).toBe(false);
    expect(recovered.node.invalid).toBeUndefined();
    expect(recovered.node.props).toEqual(before);
    expect(JSON.stringify(recovered.node.props)).toBe(JSON.stringify(before));
  });

  it("blank widget keys degrade to missing_key, never an anonymous render", () => {
    const node = extensionSection("ext-pass2-nokey");
    (node as unknown as Record<string, unknown>)["widgetKey"] = "  ";
    const verdict = resolveExtensionNode(node, () => ({ ok: true }));
    expect(verdict.missing).toBe(true);
    expect(verdict.reason).toBe("missing_key");
    expect(extensionMissingReason(verdict.node)).toBe("missing_key");
  });

  it("control: the same miss seam preserves a legacy widget's data", () => {
    const legacy = newWidgetNode("heading");
    legacy.settings["text"] = "Keep me";
    const body = serializeStudioBody({
      version: 2,
      root: [legacy],
      page: defaultPageSettings("Legacy miss control"),
    });
    const parsed = parseStudioBody(body)!;
    expect(parsed.root[0]!.settings["text"]).toBe("Keep me");
    expect("invalid" in parsed.root[0]!).toBe(false);
  });
});

describe("pass 2 — never a silent wrong-widget", () => {
  it("unknown AST types parse to labelled placeholders, not another widget", () => {
    const ast = parseAst({
      header: [],
      main: [
        { id: "g1", type: "ghost_widget", props: { text: "boo" } },
        { id: "h1", type: "heading", props: { text: "Real", level: "h2" } },
      ],
      footer: [],
    });
    expect(ast.main[0]!.invalid).toBe("unknown_widget:ghost_widget");
    expect(ast.main[0]!.type).not.toBe("heading");
    expect(ast.main[1]!.type).toBe("heading");
    expect(ast.main[1]!.invalid).toBeUndefined();
  });

  it("non-plugin extensions have no legacy home (null, not a wrong block)", () => {
    const out = buildExtensionInsert(registryWithWidget(), {
      widgetKey: WIDGET_KEY,
      slot: "main",
      generateId: () => "ext-pass2-legacy-home",
    });
    if (!out.ok) return;
    const section = {
      id: out.node.id,
      type: "extension",
      props: JSON.parse(JSON.stringify(out.node.props)) as Section["props"],
      instanceId: out.node.instanceId,
      widgetKey: "builtin:hero",
      owner: { kind: "builtin", id: "hero" },
      apiVersion: out.node.apiVersion,
    } as unknown as Section;
    expect(extensionToPluginBlock(section)).toBeNull();
    expect(pluginBlockToExtension(section)).toBeNull();
  });

  it("plugin extensions round-trip the legacy plugin_block exactly", () => {
    const out = buildExtensionInsert(registryWithWidget(), {
      widgetKey: WIDGET_KEY,
      slot: "main",
      generateId: () => "ext-pass2-roundtrip",
    });
    if (!out.ok) return;
    const section = {
      id: out.node.id,
      type: "extension",
      props: {
        ...(JSON.parse(JSON.stringify(out.node.props)) as Record<
          string,
          unknown
        >),
        height: 480,
      },
      instanceId: out.node.instanceId,
      widgetKey: out.node.widgetKey,
      owner: { ...out.node.owner },
      apiVersion: out.node.apiVersion,
    } as unknown as Section;
    const legacy = extensionToPluginBlock(section)!;
    expect(legacy).not.toBeNull();
    expect(legacy.type).toBe("plugin_block");
    expect(
      (legacy.props as unknown as Record<string, unknown>)["pluginKey"],
    ).toBe(WIDGET_KEY);
    expect((legacy.props as unknown as Record<string, unknown>)["height"]).toBe(
      480,
    );
    const back = pluginBlockToExtension(legacy)!;
    expect(back.widgetKey).toBe(WIDGET_KEY);
    expect(back.instanceId).toBe("ext-pass2-roundtrip");
  });
});
