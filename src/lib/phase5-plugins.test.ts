import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BUILDER_API_VERSION,
  MENU_SLOTS,
  PLUGIN_BUDGET,
  decideMenuRenderer,
  defaultSettings,
  isMenuRendererClaim,
  isMenuSlot,
  parseManifest,
  parsePluginWidgetKey,
  permissionDiff,
  pluginTrayEntries,
  pluginWidgetKey,
  renderMenuWithFallback,
  resolveMenuSwapRows,
  resolvePluginWidget,
  satisfiesApiRange,
  selectMenuSwapRows,
  validateSettings,
  type InstalledPlugin,
  type MenuRendererClaim,
} from "./plugin-manifest";
import { HOOK_TIMEOUT_MS, resetBreakers, runHook } from "./plugin-hooks.server";
import { afterFailure, policyFor } from "./job-queue";
import { verifySignature } from "./webhook-signing";
import { SECTION_CATALOG } from "./builder-ast";
import { WIDGET_REGISTRY } from "./widget-registry";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  clearMenuRenderers,
  PluginMenuBoundary,
  registerMenuRenderer,
  resolveMenuRenderer,
  selectPluginMenuRenderer,
  type PluginMenuRendererProps,
} from "./plugin-menu-renderers";

const enqueueJobMock = vi.hoisted(() => vi.fn());
vi.mock("./job-queue.server", () => ({ enqueueJob: enqueueJobMock }));
// Queue-down by default: failures report raw error/timeout (existing contract).
// Queue-path tests override per-test with mockResolvedValue.
enqueueJobMock.mockRejectedValue(new Error("queue_down"));

const MANIFEST = {
  id: "loyalty-lite",
  name: "Loyalty Lite",
  version: "1.2.0",
  api: "^3.0.0",
  permissions: ["read_shop", "render_storefront"],
  widgets: [
    {
      key: "points_bar",
      label: "Points bar",
      slots: ["main"],
      entry: "framique.mount(document.createTextNode('hi'))",
    },
  ],
  hooks: ["order.created"],
  hooksUrl: "https://apps.example.com/hooks",
  settings: [
    {
      key: "tier",
      label: "Tier",
      kind: "select",
      options: [
        { value: "gold", label: "Gold" },
        { value: "silver", label: "Silver" },
      ],
    },
    {
      key: "rate",
      label: "Points per ৳100",
      kind: "number",
      min: 0,
      max: 50,
      default: 5,
    },
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
    expect(verdict.manifest.permissions).toEqual([
      "read_shop",
      "render_storefront",
    ]);
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
    const badUrl = parseManifest({
      ...MANIFEST,
      hooksUrl: "http://apps.example.com/hooks",
    });
    expect(badUrl.ok).toBe(false);
  });

  it("refuses literal-IP / private-range / wildcard-DNS / metadata hooksUrl at the manifest gate", () => {
    const blocked = [
      "https://127.0.0.1/hooks",
      "https://192.168.1.20/hooks",
      "https://10.0.0.5/hooks",
      "https://169.254.169.254/latest/meta-data",
      "https://127.0.0.1.xip.io/hooks",
      "https://metadata.google.internal/hooks",
      "https://instance-data.compute.internal/hooks",
    ];
    for (const hooksUrl of blocked) {
      const verdict = parseManifest({ ...MANIFEST, hooksUrl });
      expect(verdict.ok, hooksUrl).toBe(false);
      if (!verdict.ok) expect(verdict.errors).toContain("hooksUrl");
    }
    expect(parseManifest(MANIFEST).ok).toBe(true);
  });

  it("caps the per-plugin JS and main-thread budget", () => {
    const over = parseManifest({
      ...MANIFEST,
      budget: { jsKb: PLUGIN_BUDGET.jsKb + 1, mainThreadMs: 10 },
    });
    expect(over.ok).toBe(false);
  });

  it("warns on missing বাংলা strings without failing the bundle", () => {
    const verdict = parseManifest({
      ...MANIFEST,
      i18n: { en: { tier: "Tier" }, bn: {} },
    });
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
    expect(
      permissionDiff(["read_shop", "read_orders"], ["read_shop"])
        .requiresConsent,
    ).toBe(false);
  });
});

describe("widget contribution tier", () => {
  it("round-trips namespaced keys", () => {
    const key = pluginWidgetKey("loyalty-lite", "points_bar");
    expect(key).toBe("plugin:loyalty-lite/points_bar");
    expect(parsePluginWidgetKey(key)).toEqual({
      pluginId: "loyalty-lite",
      widget: "points_bar",
    });
    expect(parsePluginWidgetKey("points_bar")).toBeNull();
  });

  it("resolves an installed, compatible widget", () => {
    const res = resolvePluginWidget("plugin:loyalty-lite/points_bar", [
      installed(),
    ]);
    expect(res.ok).toBe(true);
  });

  it("never resolves — but never throws — for broken states", () => {
    const cases: [string, InstalledPlugin[], string][] = [
      ["plugin:loyalty-lite/points_bar", [], "not_installed"],
      ["plugin:loyalty-lite/ghost", [installed()], "unknown_widget"],
      [
        "plugin:loyalty-lite/points_bar",
        [installed({ enabled: false })],
        "disabled",
      ],
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
    expect(
      pluginTrayEntries([installed({ enabled: false })], "main"),
    ).toHaveLength(0);
  });

  it("keeps the core registry closed — plugins ride the single app-block widget", () => {
    expect(WIDGET_REGISTRY.plugin_block).toBeDefined();
    const pluginTypes = SECTION_CATALOG.filter((e) =>
      e.type.startsWith("plugin"),
    );
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
    const out = validateSettings(verdict.manifest.settings, {
      tier: "platinum",
    });
    expect(out.errors).toContain("tier.not_an_option");
  });

  it("validates textarea/color/media/url/date kinds", () => {
    const schema = [
      { key: "bio", kind: "textarea", max: 50 },
      { key: "accent", kind: "color" },
      { key: "logo", kind: "media" },
      { key: "site", kind: "url" },
      { key: "launch", kind: "date" },
    ] as const;
    const { values, errors } = validateSettings(schema as any, {
      bio: "x".repeat(99),
      accent: "#ff0000",
      logo: "https://cdn/x.png",
      site: "not a url",
      launch: "2026-10-01",
    });
    expect(errors).toContain("site.not_a_url");
    expect(values.bio).toHaveLength(50);
    expect(values.accent).toBe("#ff0000");
    expect(values.launch).toBe("2026-10-01");
  });
  it("rejects bad color/date/url with error codes", () => {
    const { errors } = validateSettings(
      [
        { key: "c", kind: "color" },
        { key: "u", kind: "url" },
        { key: "d", kind: "date" },
      ] as any,
      { c: "red", u: "notaurl", d: "yesterday" },
    );
    expect(errors).toEqual(
      expect.arrayContaining(["c.not_a_color", "u.not_a_url", "d.not_a_date"]),
    );
  });
});

describe("server hooks", () => {
  afterEach(() => {
    resetBreakers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    enqueueJobMock.mockReset();
    enqueueJobMock.mockRejectedValue(new Error("queue_down"));
    delete process.env.PLUGIN_HOOK_SECRET;
  });

  it("calls only subscribers and returns their result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 }),
      ),
    );
    const out = await runHook(
      [installed({ grantedScopes: ["read_orders"] })],
      "order.created",
      { id: "o1" },
    );
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("ok");
    expect(
      await runHook(
        [installed({ grantedScopes: ["read_orders"] })],
        "cart.calculate",
        {},
      ),
    ).toEqual([]);
  });

  it("survives a failing plugin and opens the breaker after repeated failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    const plugins = [installed({ grantedScopes: ["read_orders"] })];
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
    const out = await runHook(
      [installed({ enabled: false })],
      "order.created",
      {},
    );
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
              reject(
                Object.assign(new Error("aborted"), { name: "AbortError" }),
              ),
            );
          }),
      ),
    );
    const out = await runHook(
      [installed({ grantedScopes: ["read_orders"] })],
      "order.created",
      {},
      20,
    );
    expect(out[0].status).toBe("timeout");
  });

  it("skips when HOOK_SCOPE unsatisfied — no fetch (R2-0 deny)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await runHook(
      [installed({ grantedScopes: ["read_shop"] })], // missing read_orders for order.created
      "order.created",
      { id: "o1" },
    );
    expect(out[0].status).toBe("skipped:scope");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signs every callback with framique-signature t=,v1=", async () => {
    let seen: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        seen = init;
        return new Response("{}", { status: 200 });
      }),
    );
    process.env.PLUGIN_HOOK_SECRET = "test-secret";
    const out = await runHook(
      [installed({ grantedScopes: ["read_orders"] })],
      "order.created",
      { id: "o1" },
    );
    expect(out[0].status).toBe("ok");
    const headers = seen?.headers as Record<string, string>;
    expect(headers["framique-signature"]).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    const verified = await verifySignature({
      header: headers["framique-signature"],
      body: seen?.body as string,
      secrets: ["test-secret"],
    });
    expect(verified).toBe(true);
  });

  it("queues on timeout instead of only returning timeout (R2-3)", async () => {
    enqueueJobMock.mockResolvedValue({ id: "job-1", duplicate: false });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_r, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(Object.assign(new Error("a"), { name: "AbortError" })),
            );
          }),
      ),
    );
    const out = await runHook(
      [installed({ grantedScopes: ["read_orders"] })],
      "order.created",
      { id: "o9" },
      20,
    );
    expect(out[0].status).toBe("queued");
    expect(enqueueJobMock).toHaveBeenCalledTimes(1);
    const input = enqueueJobMock.mock.calls[0][0];
    expect(input.queue).toBe("plugins");
    expect(input.name).toBe("plugin.hook.deliver");
    expect(String(input.idempotencyKey)).toMatch(
      /^hook:loyalty-lite:order\.created:[0-9a-f]+$/,
    );
  });

  it("keeps a stable idempotency key for identical payloads (R2-3)", async () => {
    enqueueJobMock.mockResolvedValue({ id: "job-1", duplicate: false });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    const plugins = [installed({ grantedScopes: ["read_orders"] })];
    await runHook(plugins, "order.created", { id: "same" });
    await runHook(plugins, "order.created", { id: "same" });
    const keys = enqueueJobMock.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    resetBreakers();
    await runHook(plugins, "order.created", { id: "different" });
    const later = enqueueJobMock.mock.calls[2][0].idempotencyKey;
    expect(later).not.toBe(keys[0]);
  });

  it("runHook never rejects even when fetch and queue both fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new TypeError("network down");
      }),
    );
    const plugins = [installed({ grantedScopes: ["read_orders"] })];
    const out = await runHook(plugins, "order.created", { id: "x" });
    expect(out[0].status).toBe("error");
    await expect(
      runHook(plugins, "order.created", { id: "x" }),
    ).resolves.toBeTruthy();
  });

  it("refuses egress-denied hooksUrl at live delivery without fetch (defense in depth)", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const blocked = [
      "https://127.0.0.1/hooks",
      "https://192.168.1.20/hooks",
      "https://127.0.0.1.xip.io/hooks",
      "https://metadata.google.internal/hooks",
    ];
    for (const hooksUrl of blocked) {
      resetBreakers();
      const base = installed({ grantedScopes: ["read_orders"] });
      const plugin = {
        ...base,
        manifest: { ...base.manifest, hooksUrl },
      };
      const out = await runHook([plugin], "order.created", { id: "o1" });
      expect(out[0].status, hooksUrl).toBe("skipped");
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(enqueueJobMock).not.toHaveBeenCalled();
  });
});

describe("queued hook delivery", () => {
  afterEach(() => {
    resetBreakers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    enqueueJobMock.mockReset();
    enqueueJobMock.mockRejectedValue(new Error("queue_down"));
    delete process.env.PLUGIN_HOOK_SECRET;
  });

  it("delivers a queued hook with HMAC and reports ok", async () => {
    let seen: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        seen = init;
        return new Response("{}", { status: 200 });
      }),
    );
    process.env.PLUGIN_HOOK_SECRET = "test-secret";
    const { deliverQueuedHook } = await import("./plugin-hooks.server");
    const body = JSON.stringify({
      hook: "order.created",
      payload: { id: "o1" },
      settings: {},
    });
    const res = await deliverQueuedHook({
      pluginId: "loyalty-lite",
      installId: "install-1",
      hook: "order.created",
      body,
      hooksUrl: "https://apps.example.com/hooks",
    });
    expect(res).toEqual({ ok: true, installId: "install-1" });
    const headers = seen?.headers as Record<string, string>;
    expect(headers["framique-signature"]).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    await expect(
      verifySignature({
        header: headers["framique-signature"],
        body,
        secrets: ["test-secret"],
      }),
    ).resolves.toBe(true);
  });

  it("returns malformed when hooksUrl or hook is missing", async () => {
    const { deliverQueuedHook } = await import("./plugin-hooks.server");
    await expect(deliverQueuedHook({})).resolves.toEqual({
      ok: false,
      reason: "malformed",
    });
    await expect(deliverQueuedHook({ hook: "order.created" })).resolves.toEqual(
      { ok: false, reason: "malformed" },
    );
  });

  it("returns breaker_open while the circuit is open (dead_letter via queue)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    const plugins = [installed({ grantedScopes: ["read_orders"] })];
    for (let i = 0; i < 3; i += 1) {
      await runHook(plugins, "order.created", {});
    }
    const { deliverQueuedHook } = await import("./plugin-hooks.server");
    await expect(
      deliverQueuedHook({
        pluginId: "loyalty-lite",
        installId: "install-1",
        hook: "order.created",
        body: "{}",
        hooksUrl: "https://apps.example.com/hooks",
      }),
    ).resolves.toEqual({ ok: false, reason: "breaker_open" });
  });

  it("throws on non-2xx so the queue retries toward dead_letter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    const { deliverQueuedHook } = await import("./plugin-hooks.server");
    await expect(
      deliverQueuedHook({
        pluginId: "loyalty-lite",
        installId: "install-1",
        hook: "order.created",
        body: "{}",
        hooksUrl: "https://apps.example.com/hooks",
      }),
    ).rejects.toThrow(/status_500/);
    const outcome = afterFailure(policyFor("plugins"), 6, "job-x", true);
    expect(outcome).toEqual({ next: "dead", runAfterSeconds: 0, dead: true });
  });

  it("refuses egress-denied hooksUrl in queued redelivery without fetch", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { deliverQueuedHook } = await import("./plugin-hooks.server");
    const blocked = [
      "https://127.0.0.1/hooks",
      "https://192.168.1.20/hooks",
      "https://127.0.0.1.xip.io/hooks",
      "https://metadata.google.internal/hooks",
    ];
    for (const hooksUrl of blocked) {
      await expect(
        deliverQueuedHook({
          pluginId: "loyalty-lite",
          installId: "install-1",
          hook: "order.created",
          body: "{}",
          hooksUrl,
        }),
      ).resolves.toEqual({ ok: false, reason: "egress_denied" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("TRACK M — menu slot vocabulary (shape 1: fill)", () => {
  const menuWidget = (slot: string) => ({
    key: `nav_${slot}`,
    label: `Nav ${slot}`,
    slots: [slot],
    entry: "framique.mount(document.createTextNode('nav'))",
  });

  it("sanctions exactly menu_bar, menu_dropdown and menu_drawer", () => {
    expect([...MENU_SLOTS]).toEqual([
      "menu_bar",
      "menu_dropdown",
      "menu_drawer",
    ]);
    for (const slot of MENU_SLOTS) expect(isMenuSlot(slot)).toBe(true);
    expect(isMenuSlot("header")).toBe(false);
    expect(isMenuSlot("sidebar")).toBe(false);
  });

  it("accepts menu slots in slot validation, alone and mixed with block slots", () => {
    for (const slot of MENU_SLOTS) {
      const verdict = parseManifest({ ...MANIFEST, widgets: [menuWidget(slot)] });
      expect(verdict.ok, slot).toBe(true);
    }
    const mixed = parseManifest({
      ...MANIFEST,
      widgets: [
        { ...menuWidget("menu_bar"), key: "nav_a", slots: ["main", "menu_bar"] },
      ],
    });
    expect(mixed.ok).toBe(true);
    if (mixed.ok)
      expect(mixed.manifest.widgets[0]!.slots).toEqual(["main", "menu_bar"]);
  });

  it("still rejects invented slots without touching the menu vocabulary", () => {
    const bad = parseManifest({
      ...MANIFEST,
      widgets: [menuWidget("sidebar")],
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toContain("widgets[0].slots");
  });

  it("menu widgets still require render_storefront (sandboxed island rule)", () => {
    const noScope = parseManifest({
      ...MANIFEST,
      permissions: ["read_shop", "read_menus"],
      widgets: [menuWidget("menu_bar")],
    });
    expect(noScope.ok).toBe(false);
    if (!noScope.ok)
      expect(noScope.errors).toContain(
        "permissions.render_storefront_required",
      );
  });

  it("lists tray entries for menu slots and resolves them like block widgets", () => {
    const verdict = parseManifest({
      ...MANIFEST,
      widgets: [menuWidget("menu_bar")],
    });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const plugin: InstalledPlugin = {
      installId: "install-nav",
      manifest: verdict.manifest,
      grantedScopes: verdict.manifest.permissions,
      settings: {},
      enabled: true,
    };
    expect(pluginTrayEntries([plugin], "menu_bar")).toHaveLength(1);
    expect(pluginTrayEntries([plugin], "menu_drawer")).toHaveLength(0);
    expect(pluginTrayEntries([plugin], "main")).toHaveLength(0);
    const res = resolvePluginWidget("plugin:loyalty-lite/nav_menu_bar", [
      plugin,
    ]);
    expect(res.ok).toBe(true);
  });

  it("adds no server hook for menus", async () => {
    const { SERVER_HOOKS } = await import("./plugin-manifest");
    expect([...SERVER_HOOKS]).toEqual([
      "cart.calculate",
      "checkout.validate",
      "order.created",
      "product.saved",
    ]);
  });
});

describe("TRACK M — full renderer swap (shape 2: review-gated, fail-open)", () => {
  const claim = (over: Partial<MenuRendererClaim> = {}): MenuRendererClaim => ({
    pluginId: "nav-pro",
    slot: "menu_bar",
    entry: "framique.mount(document.createTextNode('nav'))",
    reviewApproved: true,
    ...over,
  });

  it("validates claim shape without deciding approval", () => {
    expect(isMenuRendererClaim(claim())).toBe(true);
    expect(isMenuRendererClaim(claim({ reviewApproved: false }))).toBe(true);
    expect(isMenuRendererClaim({ ...claim(), slot: "sidebar" })).toBe(false);
    expect(isMenuRendererClaim({ ...claim(), entry: "" })).toBe(false);
    expect(isMenuRendererClaim(null)).toBe(false);
  });

  it("gates the swap: approval AND replace_menus scope, first claim wins", () => {
    const granted = ["render_storefront", "replace_menus"];
    expect(
      decideMenuRenderer([claim()], "menu_bar", granted),
    ).toEqual({ kind: "plugin", pluginId: "nav-pro", slot: "menu_bar" });
    // No claim for the slot → theme default.
    expect(decideMenuRenderer([claim()], "menu_drawer", granted)).toEqual({
      kind: "theme_default",
      reason: "not_claimed",
    });
    // Unapproved → theme default, plugin named for the review queue.
    expect(
      decideMenuRenderer([claim({ reviewApproved: false })], "menu_bar", granted),
    ).toEqual({
      kind: "theme_default",
      reason: "not_approved",
      pluginId: "nav-pro",
    });
    // Approved but scope missing → theme default.
    expect(
      decideMenuRenderer([claim()], "menu_bar", ["render_storefront"]),
    ).toEqual({
      kind: "theme_default",
      reason: "scope_denied",
      pluginId: "nav-pro",
    });
    // Malformed inputs fail open, never throw.
    expect(decideMenuRenderer(null, "menu_bar", granted)).toEqual({
      kind: "theme_default",
      reason: "not_claimed",
    });
    expect(
      decideMenuRenderer("junk" as never, "menu_bar", "junk" as never),
    ).toEqual({ kind: "theme_default", reason: "not_claimed" });
  });

  it("never attempts the plugin renderer under a theme_default decision", () => {
    const decision = decideMenuRenderer([], "menu_bar", []);
    let attempted = false;
    const out = renderMenuWithFallback(
      decision,
      () => {
        attempted = true;
        throw new Error("must not run");
      },
      () => "theme",
    );
    expect(out).toBe("theme");
    expect(attempted).toBe(false);
  });

  it("falls back to the theme renderer when the plugin renderer throws", () => {
    const decision = decideMenuRenderer(
      [claim()],
      "menu_bar",
      ["replace_menus"],
    );
    expect(decision.kind).toBe("plugin");
    const seen: unknown[] = [];
    const out = renderMenuWithFallback(
      decision,
      () => {
        throw new Error("boom");
      },
      () => "theme",
      (error, failed) => {
        seen.push([error, failed]);
      },
    );
    expect(out).toBe("theme");
    expect(seen).toHaveLength(1);
    expect((seen[0] as [Error, { reason: string }])[0].message).toBe("boom");
    expect((seen[0] as [unknown, { kind: string; reason: string }])[1]).toEqual({
      kind: "theme_default",
      reason: "renderer_failed",
      pluginId: "nav-pro",
    });
  });

  it("logs a tagged console.error by default on renderer failure", () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      const decision = decideMenuRenderer(
        [claim()],
        "menu_bar",
        ["replace_menus"],
      );
      const out = renderMenuWithFallback(
        decision,
        () => {
          throw new Error("kaboom");
        },
        () => "theme",
      );
      expect(out).toBe("theme");
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0]![0])).toContain(
        "menu_renderer_failed:nav-pro",
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("resolveMenuSwapRows keeps theme rows unless a plugin decision carries rows", () => {
    const theme = ["a", "b"];
    // Theme decision → identical ref, plugin render never runs.
    const idle = resolveMenuSwapRows(theme, null, "menu_bar");
    expect(idle.rows).toBe(theme);
    expect(idle.decision).toEqual({
      kind: "theme_default",
      reason: "not_claimed",
    });
    // Plugin decision with rows → plugin rows.
    const won = resolveMenuSwapRows(theme, {
      claims: [claim()],
      grantedScopes: ["replace_menus"],
      pluginRows: ["p1"],
    }, "menu_bar");
    expect(won.rows).toEqual(["p1"]);
    // Approved but empty → theme rows (never blanks navigation).
    const empty = resolveMenuSwapRows(theme, {
      claims: [claim()],
      grantedScopes: ["replace_menus"],
      pluginRows: [],
    }, "menu_bar");
    expect(empty.rows).toBe(theme);
    // Throwing renderRows → theme rows + onError.
    const onError = vi.fn();
    const failed = resolveMenuSwapRows(theme, {
      claims: [claim()],
      grantedScopes: ["replace_menus"],
      renderRows: () => {
        throw new Error("render down");
      },
      onError,
    }, "menu_bar");
    expect(failed.rows).toBe(theme);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("selectMenuSwapRows never blanks navigation on empty plugin rows", () => {
    const theme = ["a"];
    expect(
      selectMenuSwapRows(theme, [], { kind: "plugin", pluginId: "x", slot: "menu_bar" }),
    ).toBe(theme);
    expect(
      selectMenuSwapRows(theme, ["p"], { kind: "plugin", pluginId: "x", slot: "menu_bar" }),
    ).toEqual(["p"]);
    expect(
      selectMenuSwapRows(theme, ["p"], { kind: "theme_default", reason: "not_approved" }),
    ).toBe(theme);
  });
});

describe("MENU RUNTIME — plugin renderer replacement (registry + boundary)", () => {
  afterEach(() => clearMenuRenderers());

  const claim = (over: Partial<MenuRendererClaim> = {}): MenuRendererClaim => ({
    pluginId: "nav-pro",
    slot: "menu_bar",
    entry: "framique.mount(document.createTextNode('nav'))",
    reviewApproved: true,
    ...over,
  });
  const granted = ["render_storefront", "replace_menus"];

  const PluginNav = ({ rows, pluginId }: PluginMenuRendererProps<string>) =>
    createElement(
      "nav",
      { "data-plugin-nav": pluginId },
      rows.join("|"),
    );

  it("approved + scoped swaps resolve the registered renderer with the winning rows", () => {
    registerMenuRenderer("nav-pro", "menu_bar", PluginNav);
    const decision = decideMenuRenderer([claim()], "menu_bar", granted);
    expect(decision.kind).toBe("plugin");
    const Selected = selectPluginMenuRenderer(decision, "menu_bar");
    expect(Selected).toBe(PluginNav);
    // The renderer receives the winning rows (theme rows unless the swap
    // carried rows) — the plugin owns presentation, never row selection.
    const { rows } = resolveMenuSwapRows(["a", "b"], {
      claims: [claim()],
      grantedScopes: granted,
      pluginRows: ["p1"],
    }, "menu_bar");
    const html = renderToStaticMarkup(
      createElement(Selected!, {
        rows,
        slot: "menu_bar",
        pluginId: "nav-pro",
      }) as ReactElement,
    );
    expect(html).toContain('data-plugin-nav="nav-pro"');
    expect(html).toContain("p1");
  });

  it("unapproved swaps never resolve a renderer even when registered", () => {
    registerMenuRenderer("nav-pro", "menu_bar", PluginNav);
    const decision = decideMenuRenderer(
      [claim({ reviewApproved: false })],
      "menu_bar",
      granted,
    );
    expect(decision).toEqual({
      kind: "theme_default",
      reason: "not_approved",
      pluginId: "nav-pro",
    });
    expect(selectPluginMenuRenderer(decision, "menu_bar")).toBeUndefined();
  });

  it("scope-denied swaps never resolve a renderer even when registered", () => {
    registerMenuRenderer("nav-pro", "menu_bar", PluginNav);
    const decision = decideMenuRenderer([claim()], "menu_bar", [
      "render_storefront",
    ]);
    expect(decision).toEqual({
      kind: "theme_default",
      reason: "scope_denied",
      pluginId: "nav-pro",
    });
    expect(selectPluginMenuRenderer(decision, "menu_bar")).toBeUndefined();
  });

  it("an approval for one slot never unlocks another slot's renderer", () => {
    registerMenuRenderer("nav-pro", "menu_bar", PluginNav);
    registerMenuRenderer("nav-pro", "menu_drawer", PluginNav);
    const barDecision = decideMenuRenderer([claim()], "menu_bar", granted);
    expect(barDecision.kind).toBe("plugin");
    // Same plugin, same registry — but the verdict approved menu_bar, so
    // the drawer slot stays on the theme default (fail-open, no bleed).
    expect(selectPluginMenuRenderer(barDecision, "menu_drawer")).toBeUndefined();
    expect(selectPluginMenuRenderer(barDecision, "menu_bar")).toBe(PluginNav);
    // And the mirror: a drawer verdict never unlocks the desktop slot.
    const drawerClaim = { ...claim(), slot: "menu_drawer" as const };
    const drawerDecision = decideMenuRenderer([drawerClaim], "menu_drawer", granted);
    expect(drawerDecision.kind).toBe("plugin");
    expect(selectPluginMenuRenderer(drawerDecision, "menu_bar")).toBeUndefined();
    expect(selectPluginMenuRenderer(drawerDecision, "menu_drawer")).toBe(PluginNav);
  });

  it("approved + scoped but unregistered keeps rows swapping through theme markup", () => {
    const decision = decideMenuRenderer([claim()], "menu_bar", granted);
    expect(decision.kind).toBe("plugin");
    // No renderer registered → no replacement; rows still resolve fail-open.
    expect(selectPluginMenuRenderer(decision, "menu_bar")).toBeUndefined();
    const { rows } = resolveMenuSwapRows(["a"], {
      claims: [claim()],
      grantedScopes: granted,
      pluginRows: ["p1"],
    }, "menu_bar");
    expect(rows).toEqual(["p1"]);
  });

  it("registration is first-wins and never throws on invalid input", () => {
    const Other = () => createElement("nav", null, "other");
    registerMenuRenderer("nav-pro", "menu_bar", PluginNav);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      registerMenuRenderer("nav-pro", "menu_bar", Other);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
    const decision = decideMenuRenderer([claim()], "menu_bar", granted);
    expect(selectPluginMenuRenderer(decision, "menu_bar")).toBe(PluginNav);
    expect(() =>
      registerMenuRenderer("", "menu_bar", PluginNav),
    ).not.toThrow();
    expect(() =>
      registerMenuRenderer("nav-pro", "sidebar" as never, PluginNav),
    ).not.toThrow();
    expect(() =>
      registerMenuRenderer("nav-pro", "menu_drawer", null as never),
    ).not.toThrow();
    expect(selectPluginMenuRenderer(null, "menu_bar")).toBeUndefined();
    expect(
      selectPluginMenuRenderer("junk" as never, "menu_bar"),
    ).toBeUndefined();
  });

  it("resolveMenuRenderer falls back instead of leaking another registration", () => {
    registerMenuRenderer("nav-pro", "menu_bar", PluginNav);
    const Fallback = () => createElement("nav", null, "theme");
    expect(resolveMenuRenderer("nav-pro", "menu_bar")).toBe(PluginNav);
    // Unknown plugin, null key and other slots all fall back — never
    // another plugin's renderer, never a throw.
    expect(resolveMenuRenderer("stranger", "menu_bar", Fallback)).toBe(
      Fallback,
    );
    expect(resolveMenuRenderer(null, "menu_bar", Fallback)).toBe(Fallback);
    expect(resolveMenuRenderer("nav-pro", "menu_drawer", Fallback)).toBe(
      Fallback,
    );
    expect(resolveMenuRenderer("stranger", "menu_bar")).toBeUndefined();
  });

  it("a failed boundary renders the theme default fallback, not the plugin", () => {
    expect(
      PluginMenuBoundary.getDerivedStateFromError(new Error("boom")),
    ).toEqual({ failed: true });
    const themeNav = createElement(
      "nav",
      { "aria-label": "Store menu" },
      "Women",
    );
    const pluginEl = createElement(PluginNav, {
      rows: ["p1"],
      slot: "menu_bar",
      pluginId: "nav-pro",
    });
    const props = {
      pluginId: "nav-pro",
      slot: "menu_bar" as const,
      fallback: themeNav,
      children: pluginEl,
    };
    // Healthy: the plugin presentation renders.
    const healthy = new PluginMenuBoundary(props);
    expect(renderToStaticMarkup(healthy.render() as ReactElement)).toContain(
      'data-plugin-nav="nav-pro"',
    );
    // Failed: shoppers get the theme navigation, never a crash or blank.
    const failed = new PluginMenuBoundary(props);
    failed.state = PluginMenuBoundary.getDerivedStateFromError(
      new Error("renderer down"),
    );
    const html = renderToStaticMarkup(failed.render() as ReactElement);
    expect(html).toContain('aria-label="Store menu"');
    expect(html).toContain("Women");
    expect(html).not.toContain("data-plugin-nav");
  });

  it("boundary failures report tagged lines and never break reporting", () => {
    const onError = vi.fn();
    const boundary = new PluginMenuBoundary({
      pluginId: "nav-pro",
      slot: "menu_bar",
      fallback: createElement("nav", null, "theme"),
      onError,
      children: createElement("nav", null, "plugin"),
    });
    boundary.componentDidCatch(new Error("renderer down"), {} as never);
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]![0] as Error).message).toBe(
      "renderer down",
    );
    // Default seam: one tagged console.error line, mirroring the sync gate.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fallback = new PluginMenuBoundary({
        pluginId: "nav-pro",
        slot: "menu_bar",
        fallback: createElement("nav", null, "theme"),
        children: createElement("nav", null, "plugin"),
      });
      fallback.componentDidCatch(new Error("kaboom"), {} as never);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0]![0])).toContain(
        "menu_renderer_failed:nav-pro",
      );
    } finally {
      errorSpy.mockRestore();
    }
    // A throwing reporter never breaks navigation.
    const fragile = new PluginMenuBoundary({
      pluginId: "nav-pro",
      slot: "menu_bar",
      fallback: createElement("nav", null, "theme"),
      onError: () => {
        throw new Error("telemetry down");
      },
      children: createElement("nav", null, "plugin"),
    });
    expect(() =>
      fragile.componentDidCatch(new Error("renderer down"), {} as never),
    ).not.toThrow();
  });
});
