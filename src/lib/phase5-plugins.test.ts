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
import { afterFailure, policyFor } from "./job-queue";
import { verifySignature } from "./webhook-signing";
import { SECTION_CATALOG } from "./builder-ast";
import { WIDGET_REGISTRY } from "./widget-registry";

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
      bio: "x".repeat(99), accent: "#ff0000", logo: "https://cdn/x.png",
      site: "not a url", launch: "2026-10-01",
    });
    expect(errors).toContain("site.not_a_url");
    expect(values.bio).toHaveLength(50);
    expect(values.accent).toBe("#ff0000");
    expect(values.launch).toBe("2026-10-01");
  });
  it("rejects bad color/date/url with error codes", () => {
    const { errors } = validateSettings(
      [{ key: "c", kind: "color" }, { key: "u", kind: "url" }, { key: "d", kind: "date" }] as any,
      { c: "red", u: "notaurl", d: "yesterday" },
    );
    expect(errors).toEqual(expect.arrayContaining(["c.not_a_color", "u.not_a_url", "d.not_a_date"]));
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
});
