/**
 * Frame30 — Pass 3 (RED→GREEN): adversarial registry + contract.
 *
 * Hostile manifests (key squatting, version lies, capability inflation,
 * oversized schemas, proto-pollution), stale-cache reads after update,
 * cross-tenant reads. Every hostile input fails closed with a keyed error
 * or is dropped — never stored, never substituted.
 */
import { describe, expect, it } from "vitest";
import {
  parseManifest,
  resolvePluginWidget,
  type InstalledPlugin,
} from "./plugin-manifest";
import {
  buildTrayRegistry,
  createWidgetRegistry,
  fromPluginManifest,
  type WidgetDef,
} from "./unified-widget-registry";
import { resolvePresentation } from "./widget-presentation";

const ENTRY = "framique.mount(document.createTextNode('x'))";

function baseManifest(widgets: unknown[]) {
  return {
    id: "acme-co",
    name: "Acme",
    version: "1.0.0",
    api: "^3.0.0",
    permissions: ["read_shop", "render_storefront"],
    widgets,
    hooks: [],
    settings: [],
    i18n: { en: {}, bn: {} },
  };
}

function legacyWidget(over: Record<string, unknown> = {}) {
  return {
    key: "badge",
    label: "Badge",
    slots: ["main"],
    entry: ENTRY,
    ...over,
  };
}

function installOf(
  manifest: ReturnType<typeof parseManifest>,
): InstalledPlugin {
  if (!manifest.ok) throw new Error("fixture rejected");
  return {
    installId: "inst",
    manifest: manifest.manifest,
    grantedScopes: ["read_shop", "render_storefront"],
    settings: {},
    enabled: true,
  };
}

describe("Pass3 adversarial — hostile manifests fail closed", () => {
  it("key squatting: hostile widget keys rejected with keyed errors", () => {
    for (const key of [
      "__proto__",
      "constructor",
      "prototype",
      "Bad Key!",
      "x",
    ]) {
      const v = parseManifest(baseManifest([legacyWidget({ key })]));
      expect(v.ok, key).toBe(false);
      if (!v.ok) expect(v.errors.some((e) => e.includes("key"))).toBe(true);
    }
  });

  it("namespace squatting: plugin/theme ids without owner parts rejected", () => {
    const reg = createWidgetRegistry();
    const base: WidgetDef = {
      id: "plugin:acme",
      namespace: "plugin",
      version: "1.0.0",
      label: "X",
      category: "plugin",
      slots: [],
      defaults: {},
      propsSchema: { fields: [] },
      renderer: "sandbox",
    };
    expect(reg.registerWidget(base).ok).toBe(false);
    expect(
      reg.registerWidget({ ...base, id: "theme:lonely", namespace: "theme" })
        .ok,
    ).toBe(false);
  });

  it("version lies: malformed widget versions rejected, valid pins carried", () => {
    const bad = parseManifest(baseManifest([legacyWidget({ version: "999" })]));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toContain("widgets[0].version");
    const good = parseManifest(
      baseManifest([legacyWidget({ version: "1.0.0" })]),
    );
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    // A widget version lie cannot escalate builder compat: the floor still
    // comes from the manifest api range, not the widget pin.
    const defs = fromPluginManifest([installOf(good)]);
    expect(defs[0]!.version).toBe("1.0.0");
    expect(defs[0]!.minBuilderApi).toBe("3.0.0");
  });

  it("capability inflation: scopes/permissions/entry never stored", () => {
    const reg = createWidgetRegistry();
    const hostile = {
      id: "builtin:evil",
      namespace: "builtin",
      version: "1.0.0",
      label: "Evil",
      category: "general",
      slots: [],
      defaults: {},
      propsSchema: { fields: [] },
      renderer: "builtin",
      scopes: ["replace_menus"],
      permissions: ["read_shop"],
      entry: "evil.js",
      capabilities: ["admin"],
    };
    const v = reg.registerWidget(hostile);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    for (const k of ["scopes", "permissions", "entry"]) {
      expect(k in v.def).toBe(false);
    }
    // Non-record capabilities dropped (legacy hostile form).
    expect("capabilities" in v.def).toBe(false);
  });

  it("oversized schemas rejected: too many fields, deep nesting, huge defaults", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      key: `field${i}`,
      label: `Field ${i}`,
      kind: "text",
    }));
    const tooMany = parseManifest(
      baseManifest([legacyWidget({ propsSchema: many })]),
    );
    expect(tooMany.ok).toBe(false);
    const deep: Record<string, unknown> = {
      key: "level00",
      label: "L",
      kind: "group",
    };
    let cursor = deep;
    for (let i = 1; i <= 6; i++) {
      const child: Record<string, unknown> = {
        key: `level0${i}`,
        label: "L",
        kind: "group",
      };
      (cursor as Record<string, unknown>).fields = [child];
      cursor = child;
    }
    const tooDeep = parseManifest(
      baseManifest([legacyWidget({ propsSchema: [deep] })]),
    );
    expect(tooDeep.ok).toBe(false);
    const huge: Record<string, string> = {};
    for (let i = 0; i < 4000; i++) huge[`k${i}`] = "x".repeat(20);
    const tooBig = parseManifest(
      baseManifest([
        legacyWidget({
          propsSchema: [{ key: "aa", label: "A", kind: "text" }],
          defaultProps: huge,
        }),
      ]),
    );
    expect(tooBig.ok).toBe(false);
  });

  it("proto-pollution: __proto__/constructor keys never stored or forwarded", () => {
    const polluted = parseManifest(
      baseManifest([
        legacyWidget({
          propsSchema: [{ key: "__proto__", label: "X", kind: "text" }],
        }),
      ]),
    );
    expect(polluted.ok).toBe(false);
    const reg = createWidgetRegistry();
    const v = reg.registerWidget({
      id: "builtin:clean",
      namespace: "builtin",
      version: "1.0.0",
      label: "Clean",
      category: "general",
      slots: [],
      defaults: {},
      propsSchema: { fields: [] },
      renderer: "builtin",
    });
    expect(v.ok).toBe(true);
    const hit = reg.resolveWidget("builtin:clean", {
      data: JSON.parse('{"__proto__":{"polluted":true},"keep":1}'),
    });
    expect(hit.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // Presentation boundary strips hostile keys too.
    const pres = resolvePresentation({
      widgetId: "builtin:clean",
      themeKey: "songoskriti",
      registry: reg,
      props: JSON.parse('{"__proto__":{"x":1},"title":"hi"}'),
    });
    if (pres.ok && pres.mode === "native-builtin") {
      expect("polluted" in ({} as Record<string, unknown>)).toBe(false);
      expect(pres.props).not.toHaveProperty("__proto__");
      expect(pres.props).toMatchObject({ title: "hi" });
    } else {
      throw new Error("expected native-builtin");
    }
  });
});

describe("Pass3 adversarial — stale cache + cross-tenant", () => {
  it("stale-cache: held references stay frozen, re-resolve observes updates", () => {
    const reg = createWidgetRegistry();
    reg.registerWidget({
      id: "builtin:hero",
      namespace: "builtin",
      version: "1.0.0",
      label: "V1",
      category: "general",
      slots: [],
      defaults: {},
      propsSchema: { fields: [] },
      renderer: "builtin",
    });
    const stale = reg.getWidget("builtin:hero")!;
    reg.registerWidget({
      id: "builtin:hero",
      namespace: "builtin",
      version: "2.0.0",
      label: "V2",
      category: "general",
      slots: [],
      defaults: {},
      propsSchema: { fields: [] },
      renderer: "builtin",
    });
    // The held reference is a frozen snapshot (stale by design).
    expect(stale.version).toBe("1.0.0");
    expect(Object.isFrozen(stale)).toBe(true);
    // Re-resolve observes the invalidation.
    const fresh = reg.resolveWidget("builtin:hero");
    expect(fresh.ok).toBe(true);
    if (fresh.ok) expect(fresh.def.version).toBe("2.0.0");
    expect(reg.getWidget("builtin:hero")!.version).toBe("2.0.0");
  });

  it("cross-tenant: one tenant's widgets never resolve in another's registry", () => {
    const goodA = parseManifest(baseManifest([legacyWidget({ key: "alpha" })]));
    const goodB = parseManifest(
      baseManifest([{ ...legacyWidget({ key: "alpha" }), entry: ENTRY }]),
    );
    expect(goodA.ok && goodB.ok).toBe(true);
    if (!goodA.ok || !goodB.ok) return;
    const installA: InstalledPlugin = {
      ...installOf(goodA),
      manifest: { ...goodA.manifest, id: "tenant-a" },
    };
    const installB: InstalledPlugin = {
      ...installOf(goodB),
      manifest: { ...goodB.manifest, id: "tenant-b" },
    };
    const regA = buildTrayRegistry([installA]);
    const regB = buildTrayRegistry([installB]);
    expect(regA.resolveWidget("plugin:tenant-a/alpha").ok).toBe(true);
    expect(regA.resolveWidget("plugin:tenant-b/alpha").ok).toBe(false);
    expect(regB.resolveWidget("plugin:tenant-b/alpha").ok).toBe(true);
    expect(regB.resolveWidget("plugin:tenant-a/alpha").ok).toBe(false);
    // Install-aware resolver agrees (not_installed, never substitution).
    expect(resolvePluginWidget("plugin:tenant-a/alpha", [installB]).ok).toBe(
      false,
    );
  });

  it("suspended platform state is explicit at every boundary", () => {
    const good = parseManifest(baseManifest([legacyWidget()]));
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    const suspended: InstalledPlugin = {
      ...installOf(good),
      suspended: true,
    };
    expect(resolvePluginWidget("plugin:acme-co/badge", [suspended]).ok).toBe(
      false,
    );
    if (!resolvePluginWidget("plugin:acme-co/badge", [suspended]).ok) {
      expect(
        resolvePluginWidget("plugin:acme-co/badge", [suspended]),
      ).toMatchObject({ reason: "suspended" });
    }
    expect(fromPluginManifest([suspended])).toEqual([]);
    const reg = createWidgetRegistry();
    reg.registerWidget({
      id: "builtin:faq",
      namespace: "builtin",
      version: "1.0.0",
      label: "FAQ",
      category: "general",
      slots: [],
      defaults: {},
      propsSchema: { fields: [] },
      renderer: "builtin",
    });
    expect(reg.suspendWidget("builtin:faq").ok).toBe(true);
    const miss = reg.resolveWidget("builtin:faq");
    expect(miss.ok).toBe(false);
    if (!miss.ok) expect(miss.missing.reason).toBe("suspended");
    const pres = resolvePresentation({
      widgetId: "builtin:faq",
      themeKey: "songoskriti",
      registry: reg,
    });
    expect(pres.ok).toBe(false);
    if (!pres.ok) expect(pres.reason).toBe("suspended");
  });
});
