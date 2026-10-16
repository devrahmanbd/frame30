/**
 * Frame30 consolidation — Pass 4 (adversarial): attacks against the
 * consolidated seams must fail closed.
 *
 * - Cross-tenant singleton leak: tenant defs written to the shared singleton
 *   never surface in another tenant's tray/fallback, opted-in or not; the
 *   legacy unfiltered helper is shown leaking (why adoption matters), while
 *   the canonical builder stays clean.
 * - Stale fallback drift: the canonical fallback and the legacy copies agree
 *   id-for-id on a clean singleton and diverge ONLY by dropping attacker
 *   defs (fail-closed direction).
 * - Disabled-mid-session inspector: flipping state after a schema panel was
 *   shown reverts to legacy (no stale panel), on threaded AND singleton
 *   paths.
 * - Availability flips: all three maps agree on every flip (no map renders
 *   stale-available while others block); garbage flips change nothing.
 * - Key-spelling variants: padded/cased re-registrations are duplicates
 *   (first wins, warned) — never shadows; versioned owners stay isolated
 *   across case (pinned).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFallbackExtensionRegistry,
  buildTrayRegistry,
  clearRegistry,
  createWidgetRegistry,
  disableWidget as disableSingletonWidget,
  registerWidget as registerSingleton,
  type UnifiedRegistry,
  type WidgetDef,
} from "./unified-widget-registry";
import { resolveInspectorSchema } from "./widget-presentation";
import {
  clearThemePresentations,
  isThemeOwnerAvailable,
  registerThemeOwnedComponent,
  registerThemePresentation,
  registerVersionedPresentation,
  resolveThemeOwnedComponent,
  resolveThemePresentation,
  resolveVersionedPresentation,
  setThemeOwnerAvailability,
} from "./theme-presentations";
import type { WidgetComponent } from "@/components/builder/widgets";
import { resolveExtensionForRender } from "@/components/builder/SectionRenderer";
import type { Section } from "./builder-ast";

const A: WidgetComponent = () => null;
const Evil: WidgetComponent = () => null;
const Fallback: WidgetComponent = () => null;

function tenantPluginDef(id: string): WidgetDef {
  return {
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
}

function themeDef(id: string): WidgetDef {
  return {
    id,
    namespace: "theme",
    version: "1.0.0",
    label: `Label ${id}`,
    category: "content",
    slots: ["main"],
    defaults: {},
    propsSchema: { fields: [] },
    renderer: "custom",
  };
}

function schemaDef(id: string): WidgetDef {
  return {
    ...themeDef(id),
    namespace: "plugin",
    propsSchema: { fields: [{ key: "title", label: "Title", kind: "text" }] },
    renderer: "sandbox",
  };
}

function extSection(widgetKey: string): Section {
  return {
    id: "x-1",
    type: "extension",
    instanceId: "x-1",
    owner: { kind: "plugin", id: "acme" },
    widgetKey,
    apiVersion: "3.1.0",
    props: {},
  } as unknown as Section;
}

afterEach(() => {
  clearRegistry();
  clearThemePresentations();
  vi.restoreAllMocks();
});

describe("Pass 4 — cross-tenant singleton leak fails closed", () => {
  it("tenant defs on the singleton never reach ANY tenant tray", () => {
    expect(
      registerSingleton(tenantPluginDef("plugin:tenant-a/secret")).ok,
    ).toBe(true);
    expect(registerSingleton(themeDef("theme:tenant-b/custom")).ok).toBe(true);
    for (const opts of [undefined, { includeSingleton: true }] as const) {
      const trayA = buildTrayRegistry([], opts);
      const trayB = buildTrayRegistry([], opts);
      for (const tray of [trayA, trayB]) {
        expect(tray.resolveWidget("plugin:tenant-a/secret").ok).toBe(false);
        expect(tray.resolveWidget("theme:tenant-b/custom").ok).toBe(false);
      }
      expect(trayA.widgetIds()).toEqual(trayB.widgetIds());
    }
  });

  it("explicit themeDefs still carry tenant defs (isolation via parameters)", () => {
    expect(
      registerSingleton(tenantPluginDef("plugin:tenant-a/secret")).ok,
    ).toBe(true);
    const tenantTray = buildTrayRegistry([], {
      themeDefs: [themeDef("theme:tenant-a/mine")],
    });
    expect(tenantTray.resolveWidget("theme:tenant-a/mine").ok).toBe(true);
    // The singleton's tenant def still does NOT ride along.
    expect(tenantTray.resolveWidget("plugin:tenant-a/secret").ok).toBe(false);
    const otherTray = buildTrayRegistry([]);
    expect(otherTray.resolveWidget("theme:tenant-a/mine").ok).toBe(false);
  });

  it("canonical fallback stays clean where the legacy helper leaks (adoption motive)", async () => {
    expect(
      registerSingleton(tenantPluginDef("plugin:tenant-a/secret")).ok,
    ).toBe(true);
    const { buildFallbackExtensionRegistry: legacyHelper } =
      await import("@/components/builder/studio/StudioBuilder");
    // Legacy helper merges the singleton unfiltered: the leak, documented.
    expect(legacyHelper().resolveWidget("plugin:tenant-a/secret").ok).toBe(
      true,
    );
    // Canonical builder (default): clean. Opted-in: still clean (filtered).
    expect(
      buildFallbackExtensionRegistry().resolveWidget("plugin:tenant-a/secret")
        .ok,
    ).toBe(false);
    expect(
      buildFallbackExtensionRegistry({ includeSingleton: true }).resolveWidget(
        "plugin:tenant-a/secret",
      ).ok,
    ).toBe(false);
  });
});

describe("Pass 4 — stale fallback drift", () => {
  it("canonical and SectionRenderer-inline fallbacks agree on extension render", () => {
    const section = extSection("builtin:hero");
    const inline = resolveExtensionForRender(section, null, undefined);
    const canonical = resolveExtensionForRender(
      section,
      null,
      buildFallbackExtensionRegistry(),
    );
    expect(inline?.ok).toBe(true);
    expect(canonical?.ok).toBe(true);
    expect(canonical).toEqual(inline);
  });

  it("a factory registry never observes singleton writes after the build", () => {
    const tray = buildTrayRegistry([], { includeSingleton: true });
    expect(tray.resolveWidget("theme:songoskriti/adv-global").ok).toBe(false);
    expect(registerSingleton(themeDef("theme:songoskriti/adv-global")).ok).toBe(
      true,
    );
    // Held reference is a frozen snapshot lineage: no live re-read.
    expect(tray.resolveWidget("theme:songoskriti/adv-global").ok).toBe(false);
    expect(
      buildTrayRegistry([], { includeSingleton: true }).resolveWidget(
        "theme:songoskriti/adv-global",
      ).ok,
    ).toBe(true);
  });
});

describe("Pass 4 — disabled-mid-session inspector (stale panel attack)", () => {
  it("a shown panel reverts to legacy when the widget is disabled after display", () => {
    const reg = createWidgetRegistry();
    expect(reg.registerWidget(schemaDef("plugin:acme/reviews")).ok).toBe(true);
    const section = {
      id: "s-1",
      type: "plugin_block",
      props: { pluginKey: "plugin:acme/reviews" },
    } as unknown as Section;
    expect(resolveInspectorSchema(section, reg)).toMatchObject({
      status: "schema",
    });
    expect(reg.disableWidget("plugin:acme/reviews").ok).toBe(true);
    expect(resolveInspectorSchema(section, reg)).toEqual({ status: "legacy" });
  });

  it("singleton path reverts too (flagged fallback, state-aware)", () => {
    expect(
      registerSingleton({
        ...schemaDef("builtin:advpanel"),
        namespace: "builtin",
      } as WidgetDef).ok,
    ).toBe(true);
    const section = {
      id: "s-1",
      type: "advpanel",
      props: {},
    } as unknown as Section;
    expect(resolveInspectorSchema(section)).toMatchObject({ status: "schema" });
    expect(disableSingletonWidget("builtin:advpanel").ok).toBe(true);
    expect(resolveInspectorSchema(section)).toEqual({ status: "legacy" });
  });
});

describe("Pass 4 — availability flips agree across all three maps", () => {
  function dressAll() {
    registerThemePresentation("flip-victim", "heading", A);
    registerThemeOwnedComponent("theme:flip-victim/widget", A);
    registerVersionedPresentation({
      owner: "flip-victim",
      widgetId: "builtin:hero",
      versionRange: "*",
      component: A,
    });
  }

  it("every map blocks on false and restores on true (no stale-available map)", () => {
    dressAll();
    for (const available of [false, true, false, true]) {
      setThemeOwnerAvailability("flip-victim", available);
      expect(isThemeOwnerAvailable("flip-victim")).toBe(available);
      expect(resolveThemePresentation("flip-victim", "heading")).toBe(
        available ? A : undefined,
      );
      expect(resolveThemeOwnedComponent("theme:flip-victim/widget")).toBe(
        available ? A : undefined,
      );
      expect(resolveVersionedPresentation("flip-victim", "builtin:hero")).toBe(
        available ? A : undefined,
      );
    }
  });

  it("garbage flips change nothing on any map", () => {
    dressAll();
    for (const bad of ["yes", 1, null, undefined, {}]) {
      expect(() =>
        setThemeOwnerAvailability("flip-victim", bad as never),
      ).not.toThrow();
    }
    expect(resolveThemePresentation("flip-victim", "heading")).toBe(A);
    expect(resolveThemeOwnedComponent("theme:flip-victim/widget")).toBe(A);
    expect(resolveVersionedPresentation("flip-victim", "builtin:hero")).toBe(A);
  });
});

describe("Pass 4 — key-spelling variants cannot shadow", () => {
  it("padded/cased core re-registration is a warned duplicate (first wins)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerThemePresentation("spell-victim", "heading", A);
    registerThemePresentation("  SPELL-VICTIM  ", "  HEADING  " as never, Evil);
    expect(warn).toHaveBeenCalled();
    expect(resolveThemePresentation("spell-victim", "heading")).toBe(A);
    expect(
      resolveThemePresentation("SPELL-VICTIM", "HEADING" as never, Fallback),
    ).toBe(A);
  });

  it("cased theme-owned re-registration is a warned duplicate (first wins)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerThemeOwnedComponent("theme:spell-victim/widget", A);
    registerThemeOwnedComponent("  THEME:SPELL-VICTIM/WIDGET  ", Evil);
    expect(warn).toHaveBeenCalled();
    expect(resolveThemeOwnedComponent("theme:spell-victim/widget")).toBe(A);
  });

  it("versioned owners stay case-isolated (pinned): no cross-case capture", () => {
    registerVersionedPresentation({
      owner: "spell-victim",
      widgetId: "builtin:hero",
      versionRange: "*",
      component: A,
    });
    expect(resolveVersionedPresentation("SPELL-VICTIM", "builtin:hero")).toBe(
      undefined,
    );
    // The unified gate is case-insensitive (core semantics): flipping the
    // cased spelling blocks the owner on every map.
    setThemeOwnerAvailability("SPELL-VICTIM", false);
    expect(resolveVersionedPresentation("spell-victim", "builtin:hero")).toBe(
      undefined,
    );
  });

  it("hostile registry defs never enter trays (sanitize gate holds)", () => {
    const tray: UnifiedRegistry = buildTrayRegistry([], {
      themeDefs: [
        {
          id: "__proto__",
          namespace: "builtin",
          version: "1.0.0",
          label: "evil",
          category: "c",
          slots: [],
          defaults: {},
          propsSchema: { fields: [] },
          renderer: "builtin",
        } as unknown as WidgetDef,
      ],
    });
    expect(tray.resolveWidget("__proto__").ok).toBe(false);
    expect(tray.resolveWidget("builtin:hero").ok).toBe(true);
  });
});
