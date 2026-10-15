/**
 * Frame30 task (A) — inspector resolution with an optional registry (TDD).
 *
 * `resolveInspectorSchema(section, registry?)` is the registry-parameterized
 * twin of the inspector's resolution path: it defaults to the shared
 * singleton (existing callers unchanged — same candidates, same empty-schema
 * convention, same legacy fallthrough), and a threaded registry additionally
 * resolves extension + plugin definitions the singleton never sees. The
 * SectionInspector call-site swap is a follow-up (that file is out of scope
 * here); this pins the seam contract it will call.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  createWidgetRegistry,
  clearRegistry,
  getWidget,
  registerWidget,
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
    renderer: namespace === "theme" ? "custom" : "builtin",
  };
}

function sectionOf(type: string, props: Record<string, unknown> = {}): Section {
  return { id: "s-1", type: type as Section["type"], props } as Section;
}

function extNode(widgetKey: string): Section {
  return {
    id: "ext-1",
    type: "extension",
    instanceId: "ext-1",
    owner: { kind: "plugin", id: "acme" },
    widgetKey,
    apiVersion: "3.1.0",
    props: {},
  } as unknown as Section;
}

afterEach(() => {
  clearRegistry();
});

describe("resolveInspectorSchema — singleton default matches the inspector", () => {
  it("resolves builtin schemas identically to resolveSchemaForSection", () => {
    expect(registerWidget(schemaDef("builtin:heading", "builtin")).ok).toBe(
      true,
    );
    const section = sectionOf("heading", { text: "Hi" });
    expect(resolveInspectorSchema(section)).toEqual(
      resolveSchemaForSection(section),
    );
    expect(resolveInspectorSchema(section)).toMatchObject({
      status: "schema",
      widgetId: "builtin:heading",
      label: "Label builtin:heading",
    });
  });

  it("resolves plugin_block keys identically to resolveSchemaForSection", () => {
    expect(registerWidget(schemaDef("plugin:acme/reviews", "plugin")).ok).toBe(
      true,
    );
    const section = sectionOf("plugin_block", {
      pluginKey: "plugin:acme/reviews",
    });
    expect(resolveInspectorSchema(section)).toEqual(
      resolveSchemaForSection(section),
    );
    expect(resolveInspectorSchema(section)).toMatchObject({
      status: "schema",
      widgetId: "plugin:acme/reviews",
    });
  });

  it("falls through to legacy for extension nodes by default (unchanged)", () => {
    const node = extNode("plugin:acme/reviews");
    expect(resolveInspectorSchema(node)).toEqual(
      resolveSchemaForSection(node as Section),
    );
    expect(resolveInspectorSchema(node)).toEqual({ status: "legacy" });
  });

  it("resolves singleton-present extension defs identically to the inspector", () => {
    expect(registerWidget(schemaDef("plugin:acme/reviews", "plugin")).ok).toBe(
      true,
    );
    const node = extNode("plugin:acme/reviews");
    expect(resolveInspectorSchema(node)).toEqual(
      resolveSchemaForSection(node as Section),
    );
    expect(resolveInspectorSchema(node)).toMatchObject({
      status: "schema",
      widgetId: "plugin:acme/reviews",
    });
  });

  it("falls through to legacy for unknown ids by default", () => {
    expect(resolveInspectorSchema(sectionOf("ghost-widget"))).toEqual({
      status: "legacy",
    });
  });
});

describe("resolveInspectorSchema — threaded registry sees extension defs", () => {
  function threaded(): UnifiedRegistry {
    const reg = createWidgetRegistry();
    expect(
      reg.registerWidget(schemaDef("plugin:acme/reviews", "plugin")).ok,
    ).toBe(true);
    expect(
      reg.registerWidget(schemaDef("theme:songoskriti/finder", "theme")).ok,
    ).toBe(true);
    return reg;
  }

  it("resolves extension plugin defs from the threaded registry", () => {
    const out = resolveInspectorSchema(
      extNode("plugin:acme/reviews"),
      threaded(),
    );
    expect(out).toMatchObject({
      status: "schema",
      widgetId: "plugin:acme/reviews",
      label: "Label plugin:acme/reviews",
    });
  });

  it("resolves extension theme defs from the threaded registry", () => {
    const out = resolveInspectorSchema(
      extNode("theme:songoskriti/finder"),
      threaded(),
    );
    expect(out).toMatchObject({
      status: "schema",
      widgetId: "theme:songoskriti/finder",
    });
  });

  it("misses in the threaded registry stay legacy with data preserved", () => {
    expect(
      resolveInspectorSchema(extNode("plugin:ghost/widget"), threaded()),
    ).toEqual({ status: "legacy" });
  });

  it("never writes through to the shared singleton", () => {
    resolveInspectorSchema(extNode("plugin:acme/reviews"), threaded());
    expect(getWidget("plugin:acme/reviews")).toBeUndefined();
  });

  it("empty-schema defs stay legacy-unvalidated (convention preserved)", () => {
    const reg = createWidgetRegistry();
    expect(
      reg.registerWidget({
        ...schemaDef("plugin:acme/reviews", "plugin"),
        propsSchema: { fields: [] },
      }).ok,
    ).toBe(true);
    expect(resolveInspectorSchema(extNode("plugin:acme/reviews"), reg)).toEqual(
      {
        status: "legacy",
      },
    );
  });

  it("never throws on garbage input", () => {
    for (const bad of [
      null,
      undefined,
      {},
      { type: 42 },
      { type: "x", props: 7 },
    ]) {
      expect(() =>
        resolveInspectorSchema(bad as unknown as Section, threaded()),
      ).not.toThrow();
      expect(
        resolveInspectorSchema(bad as unknown as Section, threaded()),
      ).toEqual({ status: "legacy" });
    }
  });
});
