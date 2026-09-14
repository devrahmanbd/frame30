import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BUILDER_API_VERSION,
  PLUGIN_BUDGET,
  defaultSettings,
  parseManifest,
  parsePluginWidgetKey,
  permissionDiff,
  pluginTrayEntries,
  pluginWidgetKey,
  resolvePluginWidget,
  satisfiesApiRange,
  validateSettings,
  type InstalledPlugin,
} from "./plugin-manifest";
import { HOOK_TIMEOUT_MS, resetBreakers, runHook } from "./plugin-hooks.server";
import { SECTION_CATALOG } from "./builder-ast";
import { WIDGET_REGISTRY } from "./widget-registry";

const MANIFEST = {
  id: "loyalty-lite",
  name: "Loyalty Lite",
  version: "1.2.0",
  api: "^3.0.0",
  permissions: ["read_shop", "render_storefront"],
  widgets: [
    { key: "points_bar", label: "Points bar", slots: ["main"], entry: "framique.mount(document.createTextNode('hi'))" },
  ],
  hooks: ["order.created"],
  hooksUrl: "https://apps.example.com/hooks",
  settings: [
    { key: "tier", label: "Tier", kind: "select", options: [{ value: "gold", label: "Gold" }, { value: "silver", label: "Silver" }] },
    { key: "rate", label: "Points per ৳100", kind: "number", min: 0, max: 50, default: 5 },
    { key: "show_badge", label: "Show badge", kind: "boolean", default: true },
  ],
  i18n: { en: { tier: "Tier" }, bn: { tier: "টিয়ার" } },
};

function installed(overrides: Partial<InstalledPlugin> = {}): InstalledPlugin {
  const verdict = parseManifest(MANIFEST);
  if (!verdict.ok) throw new Error(verdict.errors.join(","));
  return {
    installId: "install-1",
    manifest: verdict.manifest,
    grantedScopes: verdict.manifest.permissions,
    settings: defaultSettings(verdict.manifest.settings),
    enabled: true,
    ...overrides,
  };
}

describe("plugin manifest", () => {
  it("accepts a well-formed manifest and normalises it", () => {
    const verdict = parseManifest(MANIFEST);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.manifest.permissions).toEqual(["read_shop", "render_storefront"]);
    expect(verdict.manifest.hooks).toEqual(["order.created"]);
    expect(verdict.manifest.widgets[0].height).toBe(320);
  });

  it("rejects invented permissions, unknown hooks and dynamic code", () => {
    const bad = parseManifest({
      ...MANIFEST,
      permissions: ["read_shop", "drain_wallet"],
      hooks: ["order.created", "server.exec"],
      widgets: [{ ...MANIFEST.widgets[0], entry: "eval('x')" }],
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors.join(" ")).toContain("permissions:drain_wallet");
    expect(bad.errors.join(" ")).toContain("hooks:server.exec");
    expect(bad.errors.join(" ")).toContain("dynamic_code");
  });

  it("requires render_storefront for widget contributions and https for hooks", () => {
    const noScope = parseManifest({ ...MANIFEST, permissions: ["read_shop"] });
    expect(noScope.ok).toBe(false);
    const badUrl = parseManifest({ ...MANIFEST, hooksUrl: "http://apps.example.com/hooks" });
    expect(badUrl.ok).toBe(false);
  });

  it("caps the per-plugin JS and main-thread budget", () => {
    const over = parseManifest({
      ...MANIFEST,
      budget: { jsKb: PLUGIN_BUDGET.jsKb + 1, mainThreadMs: 10 },
    });
    expect(over.ok).toBe(false);
  });

  it("warns on missing বাংলা strings without failing the bundle", () => {
    const verdict = parseManifest({ ...MANIFEST, i18n: { en: { tier: "Tier" }, bn: {} } });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.warnings[0]).toContain("i18n.bn_missing");
  });
});

describe("compatibility and permission diffs", () => {
  it("matches caret and explicit ranges against the builder API version", () => {
    expect(satisfiesApiRange("^3.0.0")).toBe(true);
    expect(satisfiesApiRange("^2.0.0")).toBe(false);
    expect(satisfiesApiRange(">=3.0.0 <4.0.0")).toBe(true);
    expect(satisfiesApiRange("latest")).toBe(false);
    expect(satisfiesApiRange("^3.0.0", BUILDER_API_VERSION)).toBe(true);
  });

  it("flags added permissions on update as consent-requiring", () => {
    const diff = permissionDiff(["read_shop"], ["read_shop", "read_customers"]);
    expect(diff.added).toEqual(["read_customers"]);
    expect(diff.requiresConsent).toBe(true);
    expect(permissionDiff(["read_shop", "read_orders"], ["read_shop"]).requiresConsent).toBe(false);
  });
});

describe("widget contribution tier", () => {
  it("round-trips namespaced keys", () => {
    const key = pluginWidgetKey("loyalty-lite", "points_bar");
    expect(key).toBe("plugin:loyalty-lite/points_bar");
    expect(parsePluginWidgetKey(key)).toEqual({ pluginId: "loyalty-lite", widget: "points_bar" });
    expect(parsePluginWidgetKey("points_bar")).toBeNull();
  });

  it("resolves an installed, compatible widget", () => {
    const res = resolvePluginWidget("plugin:loyalty-lite/points_bar", [installed()]);
    expect(res.ok).toBe(true);
  });

  it("never resolves — but never throws — for broken states", () => {
    const cases: [string, InstalledPlugin[], string][] = [
      ["plugin:loyalty-lite/points_bar", [], "not_installed"],
      ["plugin:loyalty-lite/ghost", [installed()], "unknown_widget"],
      ["plugin:loyalty-lite/points_bar", [installed({ enabled: false })], "disabled"],
      ["nonsense", [installed()], "bad_key"],
    ];
    for (const [key, plugins, reason] of cases) {
      const res = resolvePluginWidget(key, plugins);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe(reason);
    }
  });

  it("downgrades an incompatible plugin to a placeholder instead of breaking the page", () => {
    const old = installed();
    const res = resolvePluginWidget("plugin:loyalty-lite/points_bar", [
      { ...old, manifest: { ...old.manifest, api: "^2.0.0" } },
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("incompatible");
  });

  it("lists tray entries only for enabled, slot-matching widgets", () => {
    expect(pluginTrayEntries([installed()], "main")).toHaveLength(1);
    expect(pluginTrayEntries([installed()], "footer")).toHaveLength(0);
    expect(pluginTrayEntries([installed({ enabled: false })], "main")).toHaveLength(0);
  });

  it("keeps the core registry closed — plugins ride the single app-block widget", () => {
    expect(WIDGET_REGISTRY.plugin_block).toBeDefined();
    const pluginTypes = SECTION_CATALOG.filter((e) => e.type.startsWith("plugin"));
    expect(pluginTypes.map((e) => e.type)).toEqual(["plugin_block"]);
  });
});

describe("settings schema", () => {
  it("coerces, clamps and drops unknown keys", () => {
    const schema = parseManifest(MANIFEST).ok ? parseManifest(MANIFEST) : null;
    if (!schema || !schema.ok) throw new Error("bad fixture");
    const out = validateSettings(schema.manifest.settings, {
      tier: "silver",
      rate: 999,
      show_badge: "true",
      injected: "<script>",
    });
    expect(out.errors).toEqual([]);
    expect(out.values).toEqual({ tier: "silver", rate: 50, show_badge: true });
  });

  it("rejects values outside the declared option set", () => {
    const verdict = parseManifest(MANIFEST);
    if (!verdict.ok) throw new Error("bad fixture");
    const out = validateSettings(verdict.manifest.settings, { tier: "platinum" });
    expect(out.errors).toContain("tier.not_an_option");
  });
});

describe("server hooks", () => {
  afterEach(() => {
    resetBreakers();
    vi.restoreAllMocks();
  });

  it("calls only subscribers and returns their result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 })),
    );
    const out = await runHook([installed()], "order.created", { id: "o1" });
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("ok");
    expect(await runHook([installed()], "cart.calculate", {})).toEqual([]);
  });

  it("survives a failing plugin and opens the breaker after repeated failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const plugins = [installed()];
    for (let i = 0; i < 3; i += 1) {
      const out = await runHook(plugins, "order.created", {});
      expect(out[0].status).toBe("error");
    }
    const out = await runHook(plugins, "order.created", {});
    expect(out[0].status).toBe("skipped");
  });

  it("skips disabled plugins entirely — the kill switch stops hook traffic", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await runHook([installed({ enabled: false })], "order.created", {});
    expect(out[0].status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds hook latency with a timeout", async () => {
    expect(HOOK_TIMEOUT_MS).toBeLessThanOrEqual(1000);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            );
          }),
      ),
    );
    const out = await runHook([installed()], "order.created", {}, 20);
    expect(out[0].status).toBe("timeout");
  });
});
