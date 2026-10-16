/**
 * Frame30 consolidation — Pass 2 (TDD): the inspector resolves via the
 * state-aware `resolveWidget` (tray parity), not the state-blind `getWidget`.
 *
 * - Enabled defs keep full schema panels (singleton parity preserved).
 * - Disabled / suspended / incompatible / uninstalled / unknown ids fall
 *   through to the legacy path (a widget disabled mid-session no longer gets
 *   a full schema panel).
 * - The shared-singleton default is kept (existing callers unchanged) as the
 *   flagged legacy fallback; threaded registries never write through to it.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  clearRegistry,
  createWidgetRegistry,
  disableWidget as disableSingletonWidget,
  getWidget as getSingletonStateBlind,
  registerWidget as registerSingleton,
  type UnifiedRegistry,
  type WidgetDef,
} from "./unified-widget-registry";
import { resolveInspectorSchema } from "./widget-presentation";
import { resolveSchemaForSection } from "@/components/builder/SectionInspector";
import type { Section } from "./builder-ast";

function schemaDef(id: string, namespace: WidgetDef["namespace"]): WidgetDef {
  return {
    id,
    namespace,
    version: "1.0.0",
    label: `Label ${id}`,
    category: "content",
    slots: ["main"],
    defaults: {},
    propsSchema: {
      fields: [{ key: "title", label: "Title", kind: "text" }],
    },
    renderer: namespace === "plugin" ? "sandbox" : "builtin",
  };
}

function sectionOf(type: string, props: Record<string, unknown> = {}): Section {
  return { id: "s-1", type: type as Section["type"], props } as Section;
}

function threadedWith(def: WidgetDef): UnifiedRegistry {
  const reg = createWidgetRegistry();
  expect(reg.registerWidget(def).ok).toBe(true);
  return reg;
}

afterEach(() => {
  clearRegistry();
});

describe("Pass 2 — enabled defs keep schema panels (parity)", () => {
  it("threaded registry resolves an enabled def to a schema panel", () => {
    const out = resolveInspectorSchema(
      sectionOf("plugin_block", { pluginKey: "plugin:acme/reviews" }),
      threadedWith(schemaDef("plugin:acme/reviews", "plugin")),
    );
    expect(out).toMatchObject({
      status: "schema",
      widgetId: "plugin:acme/reviews",
    });
  });

  it("singleton fallback still resolves enabled defs identically to the inspector", () => {
    expect(registerSingleton(schemaDef("builtin:pass2", "builtin")).ok).toBe(
      true,
    );
    const section = sectionOf("pass2");
    expect(resolveInspectorSchema(section)).toEqual(
      resolveSchemaForSection(section),
    );
    expect(resolveInspectorSchema(section)).toMatchObject({ status: "schema" });
  });
});

describe("Pass 2 — state misses fall through to legacy (tray parity)", () => {
  it("disabled-mid-session defs lose the schema panel (threaded)", () => {
    const reg = threadedWith(schemaDef("plugin:acme/reviews", "plugin"));
    expect(
      resolveInspectorSchema(
        sectionOf("plugin_block", { pluginKey: "plugin:acme/reviews" }),
        reg,
      ),
    ).toMatchObject({ status: "schema" });
    expect(reg.disableWidget("plugin:acme/reviews").ok).toBe(true);
    // Tray parity: the tray hides it via resolveWidget misses; the inspector
    // now falls back to legacy instead of showing a full schema panel.
    expect(reg.resolveWidget("plugin:acme/reviews").ok).toBe(false);
    expect(
      resolveInspectorSchema(
        sectionOf("plugin_block", { pluginKey: "plugin:acme/reviews" }),
        reg,
      ),
    ).toEqual({ status: "legacy" });
    // Re-enable restores the panel (state-driven, not stale).
    expect(reg.enableWidget("plugin:acme/reviews").ok).toBe(true);
    expect(
      resolveInspectorSchema(
        sectionOf("plugin_block", { pluginKey: "plugin:acme/reviews" }),
        reg,
      ),
    ).toMatchObject({ status: "schema" });
  });

  it("disabled-mid-session defs lose the schema panel (singleton fallback)", () => {
    expect(registerSingleton(schemaDef("builtin:pass2off", "builtin")).ok).toBe(
      true,
    );
    const section = sectionOf("pass2off");
    expect(resolveInspectorSchema(section)).toMatchObject({ status: "schema" });
    expect(disableSingletonWidget("builtin:pass2off").ok).toBe(true);
    // State-blind getWidget still sees the def (the gap), but the inspector
    // no longer does: it resolves state-aware.
    expect(getSingletonStateBlind("builtin:pass2off")).toBeDefined();
    expect(resolveInspectorSchema(section)).toEqual({ status: "legacy" });
  });

  it("suspended defs fall through to legacy", () => {
    const reg = threadedWith(schemaDef("plugin:acme/reviews", "plugin"));
    expect(reg.suspendWidget("plugin:acme/reviews").ok).toBe(true);
    expect(
      resolveInspectorSchema(
        sectionOf("plugin_block", { pluginKey: "plugin:acme/reviews" }),
        reg,
      ),
    ).toEqual({ status: "legacy" });
  });

  it("builder-incompatible defs fall through to legacy", () => {
    const def: WidgetDef = {
      ...schemaDef("plugin:acme/reviews", "plugin"),
      minBuilderApi: "9.9.9",
    };
    const reg = threadedWith(def);
    expect(
      resolveInspectorSchema(
        sectionOf("plugin_block", { pluginKey: "plugin:acme/reviews" }),
        reg,
      ),
    ).toEqual({ status: "legacy" });
  });

  it("uninstalled plugin ids and unknown ids fall through to legacy", () => {
    const reg = threadedWith(schemaDef("plugin:acme/reviews", "plugin"));
    expect(
      resolveInspectorSchema(
        sectionOf("plugin_block", { pluginKey: "plugin:ghost/widget" }),
        reg,
      ),
    ).toEqual({ status: "legacy" });
    expect(resolveInspectorSchema(sectionOf("ghost-widget"), reg)).toEqual({
      status: "legacy",
    });
  });

  it("empty-schema defs stay legacy-unvalidated even when enabled", () => {
    const reg = createWidgetRegistry();
    expect(
      reg.registerWidget({
        ...schemaDef("plugin:acme/reviews", "plugin"),
        propsSchema: { fields: [] },
      }).ok,
    ).toBe(true);
    expect(
      resolveInspectorSchema(
        sectionOf("plugin_block", { pluginKey: "plugin:acme/reviews" }),
        reg,
      ),
    ).toEqual({ status: "legacy" });
  });

  it("never writes through to the shared singleton", () => {
    resolveInspectorSchema(
      sectionOf("plugin_block", { pluginKey: "plugin:acme/reviews" }),
      threadedWith(schemaDef("plugin:acme/reviews", "plugin")),
    );
    expect(getSingletonStateBlind("plugin:acme/reviews")).toBeUndefined();
  });

  it("never throws on a hostile threaded registry", () => {
    const section = sectionOf("plugin_block", {
      pluginKey: "plugin:acme/reviews",
    });
    const hostile = {
      resolveWidget: () => {
        throw new Error("boom");
      },
      getWidget: () => {
        throw new Error("boom");
      },
    } as unknown as UnifiedRegistry;
    expect(() => resolveInspectorSchema(section, hostile)).not.toThrow();
    expect(resolveInspectorSchema(section, hostile)).toEqual({
      status: "legacy",
    });
  });
});
