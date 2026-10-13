/**
 * Widget presentation resolution — service contract tests (TDD, RED-first).
 *
 * Covers the five presentation modes over the unified registry, the
 * fail-closed rule (unknown/incompatible keys NEVER resolve to a different
 * owner's renderer), the theme tray listing, and the pre-activation
 * compatibility gate. Pure service: every fixture registry is in-memory.
 */
import { describe, expect, it } from "vitest";
import {
  createWidgetRegistry,
  type UnifiedRegistry,
  type WidgetDef,
} from "./unified-widget-registry";
import type { InstalledPlugin } from "./plugin-manifest";
import {
  CLASS_B_FALLBACK,
  ISOLATED_THEME_TOKENS,
  PRESENTATION_SANDBOX_TOKENS,
  checkThemeCompatibility,
  dressingKey,
  resolvePresentation,
  themeTrayEntries,
} from "./widget-presentation";

/* --------------------------------------------------------------- fixtures */

function widgetDef(
  id: string,
  opts: {
    namespace: WidgetDef["namespace"];
    renderer?: WidgetDef["renderer"];
    themes?: string[];
    minBuilderApi?: string;
    defaults?: Record<string, unknown>;
    slots?: string[];
  },
): WidgetDef {
  return {
    id,
    namespace: opts.namespace,
    version: "1.0.0",
    label: `Label ${id}`,
    category: "general",
    slots: opts.slots ?? ["main"],
    defaults: opts.defaults ?? {},
    propsSchema: { fields: [] },
    renderer: opts.renderer ?? "builtin",
    ...(opts.themes ? { themes: [...opts.themes] } : {}),
    ...(opts.minBuilderApi ? { minBuilderApi: opts.minBuilderApi } : {}),
  };
}

function registryWith(defs: WidgetDef[]): UnifiedRegistry {
  const reg = createWidgetRegistry();
  for (const def of defs) {
    const verdict = reg.registerWidget(def);
    expect(verdict.ok).toBe(true);
  }
  return reg;
}

function communityPlugin(
  id: string,
  widgets: { key: string; themeable?: boolean }[],
  opts: {
    enabled?: boolean;
    api?: string;
    settings?: Record<string, string | number | boolean>;
  } = {},
): InstalledPlugin {
  return {
    installId: `inst-${id}`,
    manifest: {
      id,
      name: `${id} plugin`,
      version: "1.2.0",
      api: opts.api ?? "^3.0.0",
      permissions: ["render_storefront"],
      widgets: widgets.map((w) => ({
        key: w.key,
        label: `Label ${w.key}`,
        slots: ["main"],
        entry: `${w.key}-entry.js`,
        ...(w.themeable
          ? { themeable: { version: 1 as const, schema: "schema:ref" } }
          : {}),
      })),
      hooks: [],
      settings: [],
      i18n: { en: {}, bn: {} },
      budget: { jsKb: 10, mainThreadMs: 5 },
    },
    grantedScopes: ["render_storefront"],
    settings: opts.settings ?? {},
    enabled: opts.enabled ?? true,
  };
}

/* ---------------------------------------------------------- native-builtin */

describe("resolvePresentation — native-builtin", () => {
  it("resolves to the core default with identical props passthrough", () => {
    const reg = registryWith([
      widgetDef("builtin:hero", {
        namespace: "builtin",
        defaults: { heading: "Hi" },
      }),
    ]);
    const props = { heading: "Sale", limit: 4 };
    const result = resolvePresentation({
      widgetId: "builtin:hero",
      themeKey: "somvabona",
      registry: reg,
      props,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.mode !== "native-builtin") {
      throw new Error("expected native-builtin");
    }
    expect(result.presentation).toBe("core-default");
    expect(result.props).toEqual(props);
    expect(result.props).not.toBe(props);
  });

  it("resolves to the theme override when the override table names it", () => {
    const reg = registryWith([
      widgetDef("builtin:hero", { namespace: "builtin" }),
    ]);
    const byRequested = resolvePresentation({
      widgetId: "builtin:hero",
      themeKey: "songoskriti",
      registry: reg,
      themeOverrides: { songoskriti: ["builtin:hero"] },
    });
    if (!byRequested.ok || byRequested.mode !== "native-builtin") {
      throw new Error("expected native-builtin");
    }
    expect(byRequested.presentation).toBe("theme-override");

    // Bare-id requests alias to the same def and match via the def id.
    const byAlias = resolvePresentation({
      widgetId: "hero",
      themeKey: "songoskriti",
      registry: reg,
      themeOverrides: { songoskriti: ["builtin:hero"] },
    });
    if (!byAlias.ok || byAlias.mode !== "native-builtin") {
      throw new Error("expected native-builtin via alias");
    }
    expect(byAlias.presentation).toBe("theme-override");
  });

  it("resolves studio twins as native-builtin core defaults", () => {
    const reg = registryWith([
      widgetDef("studio:hero", { namespace: "studio", renderer: "custom" }),
    ]);
    const result = resolvePresentation({
      widgetId: "studio:hero",
      themeKey: "songoskriti",
      registry: reg,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.mode !== "native-builtin") {
      throw new Error("expected native-builtin for studio twins");
    }
    expect(result.presentation).toBe("core-default");
  });

  it("resolves core-default for null theme keys (unkeyed composition)", () => {
    const reg = registryWith([
      widgetDef("builtin:hero", { namespace: "builtin" }),
    ]);
    const result = resolvePresentation({
      widgetId: "builtin:hero",
      themeKey: null,
      registry: reg,
    });
    if (!result.ok || result.mode !== "native-builtin") {
      throw new Error("expected native-builtin");
    }
    expect(result.presentation).toBe("core-default");
  });
});

/* -------------------------------------------------------------- official */

describe("resolvePresentation — official source-backed", () => {
  it("resolves official widgets to a trusted source ref, never a ZIP", () => {
    const reg = registryWith([
      widgetDef("plugin:product-reviews/summary", {
        namespace: "plugin",
        renderer: "sandbox",
      }),
    ]);
    const result = resolvePresentation({
      widgetId: "plugin:product-reviews/summary",
      themeKey: "somvabona",
      registry: reg,
      props: { limit: 6 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.mode !== "official") {
      throw new Error("expected official");
    }
    expect(result.impl).toEqual({
      kind: "trusted-source",
      ref: "source:official:product-reviews",
    });
    expect(result.props).toEqual({ limit: 6 });
    const serialised = JSON.stringify(result);
    expect(serialised).not.toMatch(/zip|archive|bytes/i);
    for (const key of ["archive", "bytes", "zip", "entry"]) {
      expect(result, `must not carry ${key}`).not.toHaveProperty(key);
    }
  });

  it("keeps official mode even when the manifest declares it themeable", () => {
    const reg = registryWith([
      widgetDef("plugin:whatsapp-chat/bubble", {
        namespace: "plugin",
        renderer: "sandbox",
      }),
    ]);
    const result = resolvePresentation({
      widgetId: "plugin:whatsapp-chat/bubble",
      themeKey: "songoskriti",
      registry: reg,
      installedPlugins: [
        communityPlugin("whatsapp-chat", [{ key: "bubble", themeable: true }], {
          settings: { label: "Chat" },
        }),
      ],
    });
    if (!result.ok || result.mode !== "official") {
      throw new Error("official takes precedence over class");
    }
    expect(result.impl.ref).toBe("source:official:whatsapp-chat");
  });

  it("never resolves community plugins to the official mode", () => {
    const reg = registryWith([
      widgetDef("plugin:acme/reviews", {
        namespace: "plugin",
        renderer: "sandbox",
      }),
    ]);
    const result = resolvePresentation({
      widgetId: "plugin:acme/reviews",
      themeKey: "songoskriti",
      registry: reg,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected a hit");
    expect(result.mode).not.toBe("official");
  });
});

/* ------------------------------------------------------- Class A isolated */

describe("resolvePresentation — isolated plugin (Class A)", () => {
  it("resolves to the sandbox with outer-layout theme tokens only", () => {
    const reg = registryWith([
      widgetDef("plugin:acme/reviews", {
        namespace: "plugin",
        renderer: "sandbox",
      }),
    ]);
    const result = resolvePresentation({
      widgetId: "plugin:acme/reviews",
      themeKey: "songoskriti",
      registry: reg,
      installedPlugins: [communityPlugin("acme", [{ key: "reviews" }])],
      props: { title: "Hi" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.mode !== "plugin-isolated") {
      throw new Error("expected plugin-isolated");
    }
    expect(result.sandbox).toEqual({
      tokens: PRESENTATION_SANDBOX_TOKENS,
      themeTokens: ISOLATED_THEME_TOKENS,
    });
    expect(PRESENTATION_SANDBOX_TOKENS).toBe("allow-scripts");
    expect(result.props).toEqual({ title: "Hi" });
    expect(result).not.toHaveProperty("entry");
  });

  it("never dresses Class A, even when a dressing is registered for it", () => {
    const reg = registryWith([
      widgetDef("plugin:acme/reviews", {
        namespace: "plugin",
        renderer: "sandbox",
      }),
    ]);
    const result = resolvePresentation({
      widgetId: "plugin:acme/reviews",
      themeKey: "songoskriti",
      registry: reg,
      installedPlugins: [communityPlugin("acme", [{ key: "reviews" }])],
      dressedPresentations: new Set([
        dressingKey("songoskriti", "plugin:acme/reviews"),
      ]),
    });
    if (!result.ok || result.mode !== "plugin-isolated") {
      throw new Error("Class A must stay sandboxed");
    }
  });

  it("defaults unlisted plugins to the isolated sandbox (fail-safe)", () => {
    const reg = registryWith([
      widgetDef("plugin:acme/reviews", {
        namespace: "plugin",
        renderer: "sandbox",
      }),
    ]);
    const result = resolvePresentation({
      widgetId: "plugin:acme/reviews",
      themeKey: "songoskriti",
      registry: reg,
    });
    if (!result.ok || result.mode !== "plugin-isolated") {
      throw new Error("expected fail-safe isolation");
    }
  });
});

/* ------------------------------------------------------ Class B themeable */

describe("resolvePresentation — themeable plugin (Class B)", () => {
  function themeableReg(): UnifiedRegistry {
    return registryWith([
      widgetDef("plugin:acme/faq", {
        namespace: "plugin",
        renderer: "sandbox",
      }),
    ]);
  }

  function themeableInstall() {
    return communityPlugin("acme", [{ key: "faq", themeable: true }], {
      settings: { heading: "Help", limit: 5 },
    });
  }

  it("dresses the pair with the declared public data", () => {
    const result = resolvePresentation({
      widgetId: "plugin:acme/faq",
      themeKey: "songoskriti",
      registry: themeableReg(),
      installedPlugins: [themeableInstall()],
      dressedPresentations: new Set([
        dressingKey("songoskriti", "plugin:acme/faq"),
      ]),
      publicData: { heading: "Declared" },
    });
    if (!result.ok || result.mode !== "plugin-themeable") {
      throw new Error("expected plugin-themeable");
    }
    expect(result.dressed).toBe(true);
    expect(result.data).toEqual({ heading: "Declared" });
    expect(result.fallback).toBe(CLASS_B_FALLBACK);
    expect(result).not.toHaveProperty("entry");
  });

  it("falls back to the sandboxed island when the theme is undressed", () => {
    const result = resolvePresentation({
      widgetId: "plugin:acme/faq",
      themeKey: "somvabona",
      registry: themeableReg(),
      installedPlugins: [themeableInstall()],
      publicData: { heading: "Declared" },
    });
    if (!result.ok || result.mode !== "plugin-themeable") {
      throw new Error("expected plugin-themeable");
    }
    expect(result.dressed).toBe(false);
    expect(result.fallback).toBe(CLASS_B_FALLBACK);
    expect(result.data).toEqual({ heading: "Declared" });
  });

  it("falls back to install settings, then to the defined empty data", () => {
    const fromSettings = resolvePresentation({
      widgetId: "plugin:acme/faq",
      themeKey: "songoskriti",
      registry: themeableReg(),
      installedPlugins: [themeableInstall()],
    });
    if (!fromSettings.ok || fromSettings.mode !== "plugin-themeable") {
      throw new Error("expected plugin-themeable");
    }
    expect(fromSettings.data).toEqual({ heading: "Help", limit: 5 });

    const empty = resolvePresentation({
      widgetId: "plugin:acme/faq",
      themeKey: "songoskriti",
      registry: themeableReg(),
      installedPlugins: [communityPlugin("acme", [{ key: "faq" }])],
    });
    // Declared without a contract ⇒ Class A, never an empty dressed render.
    if (!empty.ok || empty.mode !== "plugin-isolated") {
      throw new Error("expected plugin-isolated without a contract");
    }
  });
});

/* ------------------------------------------------------------ theme-owned */

describe("resolvePresentation — theme-owned", () => {
  function ownedReg(): UnifiedRegistry {
    return registryWith([
      widgetDef("theme:songoskriti/finder", {
        namespace: "theme",
        renderer: "custom",
        themes: ["songoskriti"],
        defaults: { title: "Find" },
      }),
    ]);
  }

  it("resolves the owning-theme definition under the owning theme", () => {
    const result = resolvePresentation({
      widgetId: "theme:songoskriti/finder",
      themeKey: "songoskriti",
      registry: ownedReg(),
      props: { title: "Find craft" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.mode !== "theme-owned") {
      throw new Error("expected theme-owned");
    }
    expect(result.presentation).toBe("owner-definition");
    expect(result.placeholder).toBe(false);
    expect(result.props).toEqual({ title: "Find craft" });
  });

  it("falls back recoverably under a non-owning theme, holding no renderer", () => {
    const props = { title: "Find craft" };
    const result = resolvePresentation({
      widgetId: "theme:songoskriti/finder",
      themeKey: "somvabona",
      registry: ownedReg(),
      props,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.mode !== "theme-owned") {
      throw new Error("expected theme-owned fallback");
    }
    expect(result.presentation).toBe("recoverable-fallback");
    expect(result.placeholder).toBe(true);
    expect(result.renderer).toBeNull();
    expect(result.props).toEqual(props);
  });

  it("never leaks another owner's definition under an unknown theme", () => {
    const result = resolvePresentation({
      widgetId: "theme:songoskriti/finder",
      themeKey: "no-such-theme",
      registry: ownedReg(),
      props: { title: "Find craft" },
    });
    if (!result.ok || result.mode !== "theme-owned") {
      throw new Error("expected theme-owned fallback");
    }
    expect(result.presentation).toBe("recoverable-fallback");
    expect(result.renderer).toBeNull();
    expect(result.props).toEqual({ title: "Find craft" });
  });
});

/* --------------------------------------- failing-first: never cross-owner */

describe("resolvePresentation — fail-closed across owners", () => {
  function twoThemeReg(): UnifiedRegistry {
    return registryWith([
      widgetDef("theme:songoskriti/finder", {
        namespace: "theme",
        renderer: "custom",
        themes: ["songoskriti"],
      }),
      widgetDef("theme:somvabona/buckets", {
        namespace: "theme",
        renderer: "custom",
        themes: ["somvabona"],
      }),
      widgetDef("builtin:hero", { namespace: "builtin" }),
    ]);
  }

  it("unknown ids miss under every theme with no def attached", () => {
    const reg = twoThemeReg();
    for (const themeKey of ["songoskriti", "somvabona", "no-such-theme"]) {
      const result = resolvePresentation({
        widgetId: "builtin:ghost",
        themeKey,
        registry: reg,
        props: { keep: 1 },
      });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected a miss");
      expect(result.reason).toBe("unknown");
      expect(result.preservedProps).toEqual({ keep: 1 });
      expect(result.renderer).toBeNull();
      expect(result).not.toHaveProperty("def");
    }
  });

  it("incompatible defs miss with data preserved", () => {
    const reg = registryWith([
      widgetDef("builtin:fancy", {
        namespace: "builtin",
        minBuilderApi: "99.0.0",
      }),
    ]);
    const result = resolvePresentation({
      widgetId: "builtin:fancy",
      themeKey: "songoskriti",
      registry: reg,
      props: { draft: true },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a miss");
    expect(result.reason).toBe("incompatible");
    expect(result.preservedProps).toEqual({ draft: true });
  });

  it("disabled and uninstalled ids miss with their reasons", () => {
    const reg = registryWith([
      widgetDef("builtin:faq", { namespace: "builtin" }),
    ]);
    expect(reg.disableWidget("builtin:faq").ok).toBe(true);
    const disabled = resolvePresentation({
      widgetId: "builtin:faq",
      themeKey: "songoskriti",
      registry: reg,
    });
    if (disabled.ok) throw new Error("expected a miss");
    expect(disabled.reason).toBe("disabled");

    const uninstalled = resolvePresentation({
      widgetId: "plugin:ghost/widget",
      themeKey: "songoskriti",
      registry: reg,
    });
    if (uninstalled.ok) throw new Error("expected a miss");
    expect(uninstalled.reason).toBe("uninstalled");
  });

  it("cross-theme lookups never return the other owner's def", () => {
    const reg = twoThemeReg();
    const crossed = resolvePresentation({
      widgetId: "theme:songoskriti/finder",
      themeKey: "somvabona",
      registry: reg,
    });
    if (!crossed.ok || crossed.mode !== "theme-owned") {
      throw new Error("expected theme-owned fallback");
    }
    expect(crossed.presentation).toBe("recoverable-fallback");
    // The owning theme's def is addressable but never usable here: no
    // renderer is held, so no foreign brand can render.
    expect(crossed.renderer).toBeNull();
    expect(crossed.placeholder).toBe(true);

    const unknownKey = resolvePresentation({
      widgetId: "theme:somvabona/nope",
      themeKey: "songoskriti",
      registry: reg,
    });
    if (unknownKey.ok) throw new Error("expected a miss");
    expect(unknownKey.reason).toBe("unknown");
    expect(unknownKey).not.toHaveProperty("def");
  });

  it("never throws on garbage input", () => {
    const reg = twoThemeReg();
    const misses: unknown[] = [
      null,
      undefined,
      42,
      {},
      { widgetId: 7, themeKey: null, registry: reg },
      { widgetId: "", themeKey: "songoskriti", registry: reg },
      { widgetId: "builtin:hero", themeKey: "songoskriti", registry: null },
    ];
    for (const input of misses) {
      let result: unknown;
      expect(() => {
        result = resolvePresentation(
          input as unknown as Parameters<typeof resolvePresentation>[0],
        );
      }).not.toThrow();
      expect(result as unknown).toMatchObject({ ok: false, mode: "missing" });
    }
    // Garbage theme keys degrade to unkeyed resolution (theme-widgets.ts
    // null-key precedent) — still a hit, never a throw, never foreign.
    let unkeyed: unknown;
    expect(() => {
      unkeyed = resolvePresentation({
        widgetId: "builtin:hero",
        themeKey: 7 as never,
        registry: reg,
      });
    }).not.toThrow();
    expect(unkeyed as unknown).toMatchObject({
      ok: true,
      mode: "native-builtin",
      themeKey: "",
    });
  });
});

/* -------------------------------------------------------------- theme tray */

describe("themeTrayEntries", () => {
  function trayReg(): UnifiedRegistry {
    return registryWith([
      widgetDef("theme:songoskriti/finder", {
        namespace: "theme",
        renderer: "custom",
        themes: ["songoskriti"],
      }),
      widgetDef("theme:songoskriti/story", {
        namespace: "theme",
        renderer: "custom",
        themes: ["songoskriti", "somvabona"],
      }),
      widgetDef("builtin:hero", { namespace: "builtin" }),
    ]);
  }

  it("lists defs claiming the theme, sorted, skipping the rest", () => {
    const out = themeTrayEntries("songoskriti", { registry: trayReg() });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected tray entries");
    expect(out.entries.map((e) => e.id)).toEqual([
      "theme:songoskriti/finder",
      "theme:songoskriti/story",
    ]);
    expect(out.entries[0]).toMatchObject({
      label: "Label theme:songoskriti/finder",
    });
  });

  it("lists shared defs under the other claiming theme", () => {
    const out = themeTrayEntries("somvabona", { registry: trayReg() });
    if (!out.ok) throw new Error("expected tray entries");
    expect(out.entries.map((e) => e.id)).toEqual(["theme:songoskriti/story"]);
  });

  it("excludes registry-disabled defs", () => {
    const reg = trayReg();
    expect(reg.disableWidget("theme:songoskriti/finder").ok).toBe(true);
    const out = themeTrayEntries("songoskriti", { registry: reg });
    if (!out.ok) throw new Error("expected tray entries");
    expect(out.entries.map((e) => e.id)).toEqual(["theme:songoskriti/story"]);
  });

  it("returns empty + unknown_theme for missing themes", () => {
    const reg = trayReg();
    const missing = themeTrayEntries("no-such-theme", { registry: reg });
    expect(missing).toEqual({
      ok: false,
      themeKey: "no-such-theme",
      entries: [],
      reason: "unknown_theme",
    });
    // An official theme with no claiming defs is known but widget-less:
    // valid empty tray, not a miss.
    const empty = themeTrayEntries("songoskriti", {
      registry: createWidgetRegistry(),
    });
    expect(empty).toEqual({ ok: true, themeKey: "songoskriti", entries: [] });
  });

  it("honours installed/enabled state passed in", () => {
    const reg = trayReg();
    const disabled = themeTrayEntries("songoskriti", {
      registry: reg,
      installedThemes: [{ key: "songoskriti", enabled: false }],
    });
    expect(disabled).toEqual({
      ok: false,
      themeKey: "songoskriti",
      entries: [],
      reason: "disabled",
    });

    const incompatible = themeTrayEntries("songoskriti", {
      registry: reg,
      installedThemes: [{ key: "songoskriti", minBuilderApi: "99.0.0" }],
    });
    expect(incompatible).toEqual({
      ok: false,
      themeKey: "songoskriti",
      entries: [],
      reason: "incompatible",
    });

    const missing = themeTrayEntries("songoskriti", {
      registry: reg,
      installedThemes: [{ key: "somvabona" }],
    });
    expect(missing).toEqual({
      ok: false,
      themeKey: "songoskriti",
      entries: [],
      reason: "unknown_theme",
    });
  });

  it("never throws on bad keys or garbage options", () => {
    for (const key of ["", "   ", null, undefined, 42, {}]) {
      let out: unknown;
      expect(() => {
        out = themeTrayEntries(key, { registry: trayReg() });
      }).not.toThrow();
      expect(out as unknown).toMatchObject({
        ok: false,
        entries: [],
        reason: "bad_key",
      });
    }
    let out: unknown;
    expect(() => {
      out = themeTrayEntries("songoskriti", null as never);
    }).not.toThrow();
    expect(out as unknown).toMatchObject({ entries: [] });
  });
});

/* ------------------------------------------------------- compatibility gate */

describe("checkThemeCompatibility", () => {
  function gateReg(): UnifiedRegistry {
    const reg = registryWith([
      widgetDef("builtin:hero", { namespace: "builtin" }),
      widgetDef("builtin:faq", { namespace: "builtin" }),
      widgetDef("builtin:fancy", {
        namespace: "builtin",
        minBuilderApi: "99.0.0",
      }),
      widgetDef("theme:songoskriti/finder", {
        namespace: "theme",
        renderer: "custom",
        themes: ["songoskriti"],
      }),
    ]);
    expect(reg.disableWidget("builtin:faq").ok).toBe(true);
    return reg;
  }

  it("marks resolvable widgets compatible", () => {
    const report = checkThemeCompatibility(
      "songoskriti",
      ["builtin:hero", "theme:songoskriti/finder"],
      { registry: gateReg() },
    );
    expect(report.themeKey).toBe("songoskriti");
    expect(report.results).toEqual([
      { widgetId: "builtin:hero", compatible: true, reason: "compatible" },
      {
        widgetId: "theme:songoskriti/finder",
        compatible: true,
        reason: "compatible",
      },
    ]);
  });

  it("reports every miss reason", () => {
    const report = checkThemeCompatibility(
      "songoskriti",
      [
        "builtin:ghost",
        "builtin:faq",
        "builtin:fancy",
        "plugin:ghost/widget",
        "theme:songoskriti/finder",
      ],
      { registry: gateReg() },
    );
    const byId = new Map(report.results.map((r) => [r.widgetId, r]));
    expect(byId.get("builtin:ghost")).toMatchObject({
      compatible: false,
      reason: "unknown",
    });
    expect(byId.get("builtin:faq")).toMatchObject({
      compatible: false,
      reason: "disabled",
    });
    expect(byId.get("builtin:fancy")).toMatchObject({
      compatible: false,
      reason: "incompatible",
    });
    expect(byId.get("plugin:ghost/widget")).toMatchObject({
      compatible: false,
      reason: "uninstalled",
    });
    expect(byId.get("theme:songoskriti/finder")).toMatchObject({
      compatible: true,
      reason: "compatible",
    });
  });

  it("flags foreign theme-owned widgets before activation", () => {
    const report = checkThemeCompatibility(
      "somvabona",
      ["theme:songoskriti/finder", "builtin:hero"],
      { registry: gateReg() },
    );
    expect(report.results).toEqual([
      {
        widgetId: "theme:songoskriti/finder",
        compatible: false,
        reason: "foreign-theme",
      },
      { widgetId: "builtin:hero", compatible: true, reason: "compatible" },
    ]);
  });

  it("flags bad keys and bad themes without throwing", () => {
    const badIds = checkThemeCompatibility(
      "songoskriti",
      ["", "   ", 42, null, "builtin:hero"],
      { registry: gateReg() },
    );
    expect(
      badIds.results.slice(0, 4).every((r) => r.reason === "bad_key"),
    ).toBe(true);
    expect(badIds.results[4]).toMatchObject({
      compatible: true,
      reason: "compatible",
    });

    const badTheme = checkThemeCompatibility("", ["builtin:hero"], {
      registry: gateReg(),
    });
    expect(badTheme.results).toEqual([
      { widgetId: "builtin:hero", compatible: false, reason: "bad_theme" },
    ]);

    const noRegistry = checkThemeCompatibility(
      "songoskriti",
      ["builtin:hero"],
      {
        registry: null as never,
      },
    );
    expect(noRegistry.results).toEqual([
      { widgetId: "builtin:hero", compatible: false, reason: "unknown" },
    ]);

    const notArray = checkThemeCompatibility("songoskriti", null as never, {
      registry: gateReg(),
    });
    expect(notArray.results).toEqual([]);
  });
});
