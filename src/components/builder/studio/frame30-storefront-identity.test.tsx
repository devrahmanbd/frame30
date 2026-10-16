/**
 * Frame30 adversarial + wiring pins (TDD, pass 4).
 *
 * - Id collisions through every fixed path (clone/duplicate, paste refresh,
 *   global-block round-trip, template-style re-pin, save normalize).
 * - Cross-instance bleed through every fixed path (edit A, B unchanged).
 * - Hostile inserts (proto keys, script markup, oversized, circular/hostile
 *   children, blank keys) never throw, never pollute, never render
 *   wrong-owner output.
 * - StudioBuilder wiring pins (static): extension-key drops funnel through
 *   `addPluginNode`, Globals copy + both template inserts re-pin via
 *   `duplicateExtensionStudioNode`, `addPluginNode` honors drop targets.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioNodes } from "@/components/store/StudioNodes";
import { PluginProvider } from "@/components/builder/PluginContext";
import {
  buildExtensionInsert,
  studioNodeForExtension,
} from "@/components/builder/studio/plugin-tray";
import { duplicateExtensionStudioNode } from "./StudioBuilder";
import {
  createWidgetRegistry,
  type UnifiedRegistry,
  type WidgetDef,
} from "@/lib/unified-widget-registry";
import {
  normalizeDocForSave,
  refreshPastedTwins,
  withFreshTwinIdentity,
} from "@/lib/studio/extension-lifecycle";
import {
  defaultPageSettings,
  sectionsToStudioNodes,
  studioNodesToSections,
  type StudioDoc,
  type StudioNode,
} from "@/lib/studio/model";
import { cloneNode } from "@/lib/studio/tree";
import { isStudioSettingWriteAllowed } from "@/lib/studio/useStudio";

const KEY = "plugin:acme/reviews";
const KEY2 = "plugin:acme/stars";

function registryWith(ids: string[]): UnifiedRegistry {
  const reg = createWidgetRegistry();
  for (const id of ids) {
    const def: WidgetDef = {
      id,
      namespace: "plugin",
      version: "1.0.0",
      label: `Label ${id}`,
      category: "plugin",
      slots: ["main"],
      defaults: {},
      propsSchema: { fields: [] },
      renderer: "sandbox",
    };
    expect(reg.registerWidget(def).ok).toBe(true);
  }
  return reg;
}

function twin(
  widgetKey: string,
  reg: UnifiedRegistry,
  id: string,
  extra: Record<string, unknown> = {},
): StudioNode {
  const built = buildExtensionInsert(reg, {
    widgetKey,
    slot: "main",
    generateId: () => id,
  });
  expect(built.ok).toBe(true);
  if (!built.ok) throw new Error("insert must succeed");
  return studioNodeForExtension({
    ...built.node,
    props: { ...built.node.props, ...extra },
  });
}

function docWith(root: StudioNode[]): StudioDoc {
  return { version: 2, root, page: defaultPageSettings("Adv") };
}

describe("adversarial — id collisions through every fixed path", () => {
  it("raw clone duplicates never share an instance id", () => {
    const reg = registryWith([KEY]);
    const source = twin(KEY, reg, "collide-src", { title: "A" });
    const copy = cloneNode(source);
    // Simulate the pre-fix collision: force the stale envelope back, then
    // prove save still heals (defense in depth, not the primary fix).
    (copy.settings as Record<string, unknown>)["extensionInstanceId"] =
      "collide-src";
    const saved = normalizeDocForSave(docWith([source, copy]), reg);
    const ids = saved.root.map((n) => n.settings["extensionInstanceId"]);
    expect(new Set(ids).size).toBe(2);
    for (const n of saved.root) {
      expect(n.settings["extensionInstanceId"]).toBe(n.id);
    }
  });

  it("pasted batches + global round-trip + template re-pin never collide", () => {
    const reg = registryWith([KEY]);
    const src = twin(KEY, reg, "paste-src", { title: "P" });
    const pasted = refreshPastedTwins([src, src], new Set(["paste-src"]));
    expect(pasted[0]!.id).not.toBe(pasted[1]!.id);
    const sections = studioNodesToSections([src]);
    const [g1] = sectionsToStudioNodes(sections);
    const [g2] = sectionsToStudioNodes(sections);
    expect(g1!.settings["extensionInstanceId"]).toBe(g1!.id);
    expect(g2!.settings["extensionInstanceId"]).toBe(g2!.id);
    expect(g1!.id).not.toBe(g2!.id);
    // Template-style import path (duplicateExtensionStudioNode re-pin).
    const t1 = duplicateExtensionStudioNode(src);
    const t2 = duplicateExtensionStudioNode(src);
    expect(t1.id).not.toBe(t2.id);
    expect(t1.settings["extensionInstanceId"]).toBe(t1.id);
    expect(t2.settings["extensionInstanceId"]).toBe(t2.id);
  });

  it("nested collisions remap with re-pinned envelopes", () => {
    const reg = registryWith([KEY]);
    const a = twin(KEY, reg, "same", { title: "A" });
    const b = twin(KEY, reg, "same", { title: "B" });
    const saved = normalizeDocForSave(docWith([a, b]), reg);
    expect(saved.root[0]!.id).not.toBe(saved.root[1]!.id);
    for (const n of saved.root) {
      expect(n.settings["extensionInstanceId"]).toBe(n.id);
    }
  });
});

describe("adversarial — cross-instance bleed through every fixed path", () => {
  it("clone / paste / global-import / template-import / save stay separate", () => {
    const reg = registryWith([KEY]);
    const src = twin(KEY, reg, "bleed-src", { title: "A" });
    const paths: StudioNode[] = [
      cloneNode(src),
      refreshPastedTwins([src], new Set(["bleed-src"]))[0]!,
      sectionsToStudioNodes(studioNodesToSections([src]))[0]!,
      duplicateExtensionStudioNode(src),
      withFreshTwinIdentity(src),
    ];
    expect(paths).toHaveLength(5);
    paths.forEach((node, i) => {
      (node.settings as Record<string, unknown>)["title"] = `Edited-${i}`;
    });
    expect(src.settings["title"]).toBe("A");
    const saved = normalizeDocForSave(docWith([src, ...paths]), reg);
    const titles = saved.root.map((n) => n.settings["title"]);
    expect(titles[0]).toBe("A");
    expect(new Set(saved.root.map((n) => n.id)).size).toBe(6);
  });

  it("container-child edits never bleed into the stored global block", () => {
    const reg = registryWith([KEY]);
    const inner = twin(KEY, reg, "g-inner", { title: "Orig" });
    const sections = studioNodesToSections([
      { id: "g-box", el: "container", settings: {}, children: [inner] },
    ]);
    const [imported] = sectionsToStudioNodes(sections);
    (imported!.children?.[0]!.settings as Record<string, unknown>)["title"] =
      "Changed";
    expect(inner.settings["title"]).toBe("Orig");
  });
});

describe("adversarial — hostile inserts never throw, never pollute, never cross-owner", () => {
  it("proto-pollution keys never store through any fixed path", () => {
    const reg = registryWith([KEY]);
    const hostile = JSON.parse(
      '{"title":"ok","__proto__":{"polluted":"yes"},"constructor":"x"}',
    ) as Record<string, unknown>;
    const src = twin(KEY, reg, "pp-src", hostile);
    for (const node of [
      cloneNode(src),
      duplicateExtensionStudioNode(src),
      withFreshTwinIdentity(src),
      normalizeDocForSave(docWith([src]), reg).root[0]!,
    ]) {
      expect(
        Object.prototype.hasOwnProperty.call(node!.settings, "__proto__"),
      ).toBe(false);
      expect(
        Object.prototype.hasOwnProperty.call(node!.settings, "constructor"),
      ).toBe(false);
    }
    // Global-block import (`sectionsToStudioNodes`, envelope re-pin only)
    // carries props inertly without polluting, and the insert/save edges
    // strip: the Globals copy-insert re-pin drops hostile keys, and save
    // normalizes them away — nothing hostile ever persists.
    const [imported] = sectionsToStudioNodes(studioNodesToSections([src]));
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    const inserted = duplicateExtensionStudioNode(imported!);
    expect(
      Object.prototype.hasOwnProperty.call(inserted.settings, "__proto__"),
    ).toBe(false);
    const savedImport = normalizeDocForSave(docWith([imported!]), reg);
    expect(
      Object.prototype.hasOwnProperty.call(
        savedImport.root[0]!.settings,
        "__proto__",
      ),
    ).toBe(false);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(isStudioSettingWriteAllowed(src, "__proto__")).toBe(false);
  });

  it("circular/hostile children + blank keys stay render-safe", () => {
    const evil = {
      id: "evil",
      el: "app-block",
      settings: {
        pluginKey: KEY,
        extensionInstanceId: "evil",
        title: "ok",
      },
      children: "not-an-array",
    } as unknown as StudioNode;
    expect(() => cloneNode(evil)).not.toThrow();
    expect(() => duplicateExtensionStudioNode(evil)).not.toThrow();
    expect(() =>
      sectionsToStudioNodes([{ id: "s", type: "app-block", props: null }]),
    ).not.toThrow();
    const html = renderToStaticMarkup(
      createElement(PluginProvider, {
        plugins: [],
        children: createElement(StudioNodes, { nodes: [evil] }),
      }),
    );
    // Fail-closed: explicit recovery, never another owner's island.
    expect(html).not.toBe("");
    expect(html).not.toContain("<iframe");
  });

  it("oversized hostile values are capped at save, never stored raw", () => {
    const reg = registryWith([KEY]);
    const big = "x".repeat(20000);
    // No-schema defs preserve JSON-safe (capped text) without validation.
    const src = twin(KEY, reg, "big-src", { title: big });
    const saved = normalizeDocForSave(docWith([src]), reg);
    expect(
      (saved.root[0]!.settings["title"] as string).length,
    ).toBeLessThanOrEqual(8192);
  });

  it("cross-plugin twin never renders the wrong owner's island", () => {
    const reg = registryWith([KEY2]);
    const node = twin(KEY, registryWith([KEY]), "xowner-1", { title: "Mine" });
    const html = renderToStaticMarkup(
      createElement(StudioNodes, { nodes: [node], registry: reg }),
    );
    expect(html).toContain("Widget preview unavailable");
    expect(html).not.toContain("<iframe");
  });
});

describe("StudioBuilder fixed-path wiring pins (static)", () => {
  const src = readFileSync(
    "src/components/builder/studio/StudioBuilder.tsx",
    "utf8",
  );

  it("extension-key drops funnel through addPluginNode with the drop target", () => {
    expect(src).toContain("addPluginNode(key, target)");
    expect(src).toMatch(/key\.includes\(":"\)/);
  });

  it("addPluginNode honors an explicit drop target over the armed parent", () => {
    expect(src).toMatch(/\(pluginKey: string, target\?: DropTarget\)/);
    expect(src).toContain("const at = target ?? where");
  });

  it("Globals copy-insert re-pins via fresh-identity branching", () => {
    expect(src).toContain("const fresh = duplicateExtensionStudioNode(node)");
  });

  it("both template inserts re-pin via fresh-identity branching", () => {
    const hits = src.match(
      /studio\.addNode\(duplicateExtensionStudioNode\(node\)\)/g,
    );
    expect(hits?.length).toBe(2);
  });
});
