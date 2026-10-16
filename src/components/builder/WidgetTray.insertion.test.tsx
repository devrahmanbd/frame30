/**
 * Frame30 canonical insertion — the tray's only path (TDD).
 *
 * `insertTrayWidget` (the `WidgetTray` insertion seam) always attempts the
 * canonical registry-resolving insert first: where the registry resolves,
 * the extension node is delivered and the legacy `onAddPlugin` placeholder
 * NEVER fires. The legacy path survives only as explicit recovery for
 * genuine misses (unknown / disabled / illegal-slot), and `none` when
 * nothing is wired — never a silent mis-insert.
 */
import { describe, expect, it } from "vitest";
import type { ExtensionNode, Slot } from "@/lib/builder-ast";
import {
  createWidgetRegistry,
  type UnifiedRegistry,
  type WidgetDef,
} from "@/lib/unified-widget-registry";
import { insertTrayWidget } from "./WidgetTray";

function schemaDef(
  id: string,
  opts: {
    namespace?: WidgetDef["namespace"];
    renderer?: WidgetDef["renderer"];
    slots?: string[];
    fields?: WidgetDef["propsSchema"]["fields"];
    defaults?: Record<string, unknown>;
  } = {},
): WidgetDef {
  return {
    id,
    namespace: opts.namespace ?? "plugin",
    version: "1.0.0",
    label: `Label ${id}`,
    category: "plugin",
    slots: opts.slots ?? ["main"],
    defaults: opts.defaults ?? {},
    propsSchema: { fields: opts.fields ?? [] },
    renderer: opts.renderer ?? "sandbox",
  };
}

function registryWith(defs: WidgetDef[]): UnifiedRegistry {
  const reg = createWidgetRegistry();
  for (const def of defs) expect(reg.registerWidget(def).ok).toBe(true);
  return reg;
}

function handlers() {
  const extensions: ExtensionNode[] = [];
  const legacyKeys: string[] = [];
  return {
    extensions,
    legacyKeys,
    wired: {
      onAddExtension: (node: ExtensionNode) => extensions.push(node),
      onAddPlugin: (key: string) => legacyKeys.push(key),
    },
  };
}

describe("canonical insertion is the only path where the registry resolves", () => {
  it("delivers the extension node and never fires the legacy path", () => {
    const reg = registryWith([
      schemaDef("plugin:acme/reviews", {
        fields: [{ key: "title", label: "Title", kind: "text" }],
        defaults: { title: "Hi" },
      }),
    ]);
    const h = handlers();
    const outcome = insertTrayWidget(
      reg,
      "main",
      "plugin:acme/reviews",
      h.wired,
    );
    expect(outcome.handled).toBe("extension");
    expect(outcome.result.ok).toBe(true);
    expect(h.extensions).toHaveLength(1);
    expect(h.extensions[0]).toMatchObject({
      type: "extension",
      widgetKey: "plugin:acme/reviews",
    });
    // Legacy recovery stays silent when canonical succeeds.
    expect(h.legacyKeys).toEqual([]);
  });

  it("resolves studio and theme tiers through the same canonical path", () => {
    const reg = registryWith([
      {
        ...schemaDef("studio:lookbook", { slots: [] }),
        namespace: "studio",
        renderer: "custom",
      },
      {
        ...schemaDef("theme:songoskriti/finder", { slots: ["main"] }),
        namespace: "theme",
        renderer: "custom",
      },
    ]);
    for (const [key, slot] of [
      ["studio:lookbook", "footer"],
      ["theme:songoskriti/finder", "main"],
    ] as Array<[string, Slot]>) {
      const h = handlers();
      const outcome = insertTrayWidget(reg, slot, key, h.wired);
      expect(outcome.handled, key).toBe("extension");
      expect(h.extensions).toHaveLength(1);
      expect(h.legacyKeys, key).toEqual([]);
    }
  });
});

describe("genuinely-missing keeps explicit recovery", () => {
  it("falls back to the legacy placeholder on unknown ids", () => {
    const reg = registryWith([schemaDef("plugin:acme/reviews")]);
    const h = handlers();
    const outcome = insertTrayWidget(
      reg,
      "main",
      "plugin:ghost/widget",
      h.wired,
    );
    expect(outcome.handled).toBe("legacy");
    expect(h.extensions).toEqual([]);
    expect(h.legacyKeys).toEqual(["plugin:ghost/widget"]);
  });

  it("falls back to the legacy placeholder on illegal slots", () => {
    const reg = registryWith([schemaDef("plugin:acme/reviews")]);
    const h = handlers();
    const outcome = insertTrayWidget(
      reg,
      "header",
      "plugin:acme/reviews",
      h.wired,
    );
    expect(outcome.handled).toBe("legacy");
    expect(h.extensions).toEqual([]);
    expect(h.legacyKeys).toEqual(["plugin:acme/reviews"]);
  });

  it("falls back to the legacy placeholder when the def is disabled", () => {
    const reg = registryWith([schemaDef("plugin:acme/reviews")]);
    expect(reg.disableWidget("plugin:acme/reviews").ok).toBe(true);
    const h = handlers();
    const outcome = insertTrayWidget(
      reg,
      "main",
      "plugin:acme/reviews",
      h.wired,
    );
    expect(outcome.handled).toBe("legacy");
    expect(h.extensions).toEqual([]);
    expect(h.legacyKeys).toEqual(["plugin:acme/reviews"]);
  });

  it("reports none when nothing handles the insert", () => {
    const reg = registryWith([schemaDef("plugin:acme/reviews")]);
    const outcome = insertTrayWidget(reg, "main", "plugin:acme/reviews", {
      onAddExtension: undefined as never,
    });
    expect(outcome.handled).toBe("none");
  });
});
