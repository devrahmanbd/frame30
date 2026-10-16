/**
 * Frame30 fresh-identity + edit-edge validation (TDD, passes 2–3).
 *
 * - `cloneNode` re-pins twin envelopes (every duplicate/copy/paste path —
 *   including the raw canvas + StructurePanel `studio.duplicate` call sites
 *   — gets fresh identity centrally, no shared instance id until save).
 * - `isStudioSettingWriteAllowed` gates `setSetting`/inline-edit: hostile
 *   keys never store, twin identity never drifts, everything else verbatim.
 * - `sectionsToStudioNodes` deep-clones + re-pins (global-block round-trip
 *   never shares references or instance ids with the stored block).
 * - `docSignature` covers header/footer/breakpoints (header/footer-only
 *   edits offer crash recovery).
 */
import { describe, expect, it } from "vitest";
import {
  buildExtensionInsert,
  studioNodeForExtension,
} from "@/components/builder/studio/plugin-tray";
import {
  createWidgetRegistry,
  type UnifiedRegistry,
  type WidgetDef,
} from "@/lib/unified-widget-registry";
import {
  defaultPageSettings,
  sectionsToStudioNodes,
  studioNodesToSections,
  type StudioNode,
} from "@/lib/studio/model";
import { docSignature } from "@/lib/studio/autosave";
import { cloneNode, duplicateNode } from "@/lib/studio/tree";
import { isStudioSettingWriteAllowed } from "@/lib/studio/useStudio";

const KEY = "plugin:acme/reviews";

function registry(): UnifiedRegistry {
  const reg = createWidgetRegistry();
  const def: WidgetDef = {
    id: KEY,
    namespace: "plugin",
    version: "1.0.0",
    label: `Label ${KEY}`,
    category: "plugin",
    slots: ["main"],
    defaults: {},
    propsSchema: { fields: [] },
    renderer: "sandbox",
  };
  expect(reg.registerWidget(def).ok).toBe(true);
  return reg;
}

function twin(id: string, extra: Record<string, unknown> = {}): StudioNode {
  const built = buildExtensionInsert(registry(), {
    widgetKey: KEY,
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

describe("cloneNode fresh-identity branching", () => {
  it("re-pins the twin envelope to the fresh id (no shared instance)", () => {
    const source = twin("dup-src", { title: "Src" });
    const copy = cloneNode(source);
    expect(copy.id).not.toBe(source.id);
    expect(copy.settings["extensionInstanceId"]).toBe(copy.id);
    expect(source.settings["extensionInstanceId"]).toBe("dup-src");
    expect(copy.settings["pluginKey"]).toBe(KEY);
    expect(copy.settings["title"]).toBe("Src");
  });

  it("deep-clones props (edit A never bleeds into B)", () => {
    const source = twin("bleed-src", {
      rows: [{ name: "A", qty: 1 }],
    });
    const copy = cloneNode(source);
    (copy.settings["rows"] as { name: string }[])[0]!.name = "B";
    expect((source.settings["rows"] as { name: string }[])[0]!.name).toBe("A");
    expect(copy.settings["rows"]).not.toBe(source.settings["rows"]);
  });

  it("re-pins nested twins inside containers", () => {
    const inner = twin("nest-inner", { title: "In" });
    const box: StudioNode = {
      id: "nest-box",
      el: "container",
      settings: { layout: "flex" },
      children: [inner],
    };
    const copy = cloneNode(box);
    expect(copy.id).not.toBe("nest-box");
    expect(copy.children?.[0]!.id).not.toBe("nest-inner");
    expect(copy.children?.[0]!.settings["extensionInstanceId"]).toBe(
      copy.children?.[0]!.id,
    );
  });

  it("leaves legacy nodes structurally identical (fresh id, same values)", () => {
    const legacy: StudioNode = {
      id: "leg-1",
      el: "heading",
      settings: { text: "Hi" },
    };
    const copy = cloneNode(legacy);
    expect(copy.id).not.toBe("leg-1");
    expect(copy.settings).toEqual({ text: "Hi" });
    expect(copy.settings).not.toBe(legacy.settings);
    expect("extensionInstanceId" in copy.settings).toBe(false);
  });

  it("duplicateNode re-pins too (shared clone path)", () => {
    const source = twin("dupn-src");
    const out = duplicateNode([source], "dupn-src");
    expect(out).toHaveLength(2);
    expect(out[1]!.id).not.toBe("dupn-src");
    expect(out[1]!.settings["extensionInstanceId"]).toBe(out[1]!.id);
  });
});

describe("isStudioSettingWriteAllowed — setSetting/inline-edit edge", () => {
  const node = (settings: Record<string, unknown>): StudioNode =>
    ({ id: "n1", el: "app-block", settings }) as StudioNode;

  it("allows ordinary twin + legacy writes verbatim", () => {
    const tw = twin("set-1", { title: "A" });
    expect(isStudioSettingWriteAllowed(tw, "title")).toBe(true);
    expect(isStudioSettingWriteAllowed(tw, "pluginKey")).toBe(true);
    expect(
      isStudioSettingWriteAllowed(
        { id: "h", el: "heading", settings: { text: "x" } } as StudioNode,
        "text",
      ),
    ).toBe(true);
  });

  it("blocks hostile keys for every node (never stored)", () => {
    const tw = twin("set-hostile");
    for (const key of [
      "__proto__",
      "constructor",
      "prototype",
      "",
      "x".repeat(121),
    ]) {
      expect(isStudioSettingWriteAllowed(tw, key)).toBe(false);
      expect(
        isStudioSettingWriteAllowed(
          { id: "h", el: "heading", settings: {} } as StudioNode,
          key,
        ),
      ).toBe(false);
    }
    expect(isStudioSettingWriteAllowed(tw, null)).toBe(false);
    expect(isStudioSettingWriteAllowed(null, "title")).toBe(true);
  });

  it("blocks twin identity drift (extensionInstanceId stays pinned)", () => {
    const tw = twin("set-pin");
    expect(isStudioSettingWriteAllowed(tw, "extensionInstanceId")).toBe(false);
    // Legacy nodes carry no envelope: the key is harmless data.
    expect(
      isStudioSettingWriteAllowed(
        node({ pluginKey: KEY }),
        "extensionInstanceId",
      ),
    ).toBe(true);
  });

  it("never throws on hostile shapes", () => {
    expect(isStudioSettingWriteAllowed(null, null)).toBe(false);
    expect(isStudioSettingWriteAllowed(42, "extensionInstanceId")).toBe(true);
    expect(
      isStudioSettingWriteAllowed(
        { id: "x", el: "app-block", settings: null },
        "extensionInstanceId",
      ),
    ).toBe(true);
  });
});

describe("sectionsToStudioNodes — global-block import re-pin", () => {
  it("re-pins the envelope to the fresh import id", () => {
    const stored = twin("stored-1", { title: "Keep" });
    const sections = studioNodesToSections([stored]);
    const [imported] = sectionsToStudioNodes(sections);
    expect(imported!.id).not.toBe("stored-1");
    expect(imported!.settings["extensionInstanceId"]).toBe(imported!.id);
    expect(imported!.settings["pluginKey"]).toBe(KEY);
    expect(imported!.settings["title"]).toBe("Keep");
  });

  it("never shares references with the stored block (no bleed)", () => {
    const stored = twin("stored-2", { rows: [{ name: "A" }] });
    const sections = studioNodesToSections([stored]);
    const [imported] = sectionsToStudioNodes(sections);
    expect(imported!.settings["rows"]).not.toBe(stored.settings["rows"]);
    (imported!.settings["rows"] as { name: string }[])[0]!.name = "B";
    expect((stored.settings["rows"] as { name: string }[])[0]!.name).toBe("A");
  });

  it("two imports of one block never share an instance id", () => {
    const stored = twin("stored-3");
    const sections = studioNodesToSections([stored]);
    const [a] = sectionsToStudioNodes(sections);
    const [b] = sectionsToStudioNodes(sections);
    expect(a!.id).not.toBe(b!.id);
    expect(a!.settings["extensionInstanceId"]).toBe(a!.id);
    expect(b!.settings["extensionInstanceId"]).toBe(b!.id);
  });
});

describe("docSignature — header/footer/slot coverage", () => {
  const base = () => ({
    version: 2 as const,
    root: [],
    page: defaultPageSettings("S"),
  });

  it("header-only edits change the signature (recovery offered)", () => {
    const a = { ...base(), header: [] as StudioNode[] };
    const b = {
      ...base(),
      header: [
        { id: "h", el: "heading", settings: { text: "Hi" } } as StudioNode,
      ],
    };
    expect(docSignature(a)).not.toBe(docSignature(b));
  });

  it("footer-only edits change the signature (recovery offered)", () => {
    const a = { ...base(), footer: [] as StudioNode[] };
    const b = {
      ...base(),
      footer: [
        { id: "f", el: "text", settings: { text: "Bye" } } as StudioNode,
      ],
    };
    expect(docSignature(a)).not.toBe(docSignature(b));
  });

  it("slot tags + breakpoints change the signature", () => {
    const a = {
      ...base(),
      root: [{ id: "m", el: "heading", settings: { text: "x" } } as StudioNode],
    };
    const b = {
      ...base(),
      root: [
        {
          id: "m",
          el: "heading",
          settings: { text: "x" },
          slot: "header" as const,
        } as StudioNode,
      ],
    };
    expect(docSignature(a)).not.toBe(docSignature(b));
    expect(
      docSignature({ ...base(), breakpoints: ["desktop"] as never[] }),
    ).not.toBe(docSignature({ ...base(), breakpoints: [] as never[] }));
  });

  it("identical docs (incl. empty chrome) share a signature", () => {
    expect(docSignature(base())).toBe(docSignature(base()));
  });
});
