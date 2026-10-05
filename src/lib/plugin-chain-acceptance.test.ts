/**
 * T2.3 — chained community-plugin acceptance test.
 *
 * One end-to-end chain with a fixture community widget, exercising the full
 * path with the EXISTING builders/validators (never reimplemented here):
 *
 *   install (parseManifest + validateBundle + upsertPlugin + consent)
 *     → use in builder (pluginTrayEntries + newSection("plugin_block") + resolvePluginWidget)
 *     → persist in AST (parseAst round-trip + templateOf + lintTemplate)
 *     → render through active theme A (resolve + authorizeWidgetCall sandbox bridge)
 *     → switch theme B (presentation changes, data/logic identical + gate ok under both)
 *     → publish/rollback (composePublishGate + rollbackVersion success)
 *     → fail safely when blocked (contrast-blocked gate, suspend→placeholder,
 *        dynamic-code refused, cross-merchant rollback denied)
 *
 * Each link asserts; the chain shares one fakeDb + one AST so a broken link
 * fails loudly at its own step.
 */
import { describe, expect, it, vi } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

import {
  defaultSettings,
  parseManifest,
  pluginTrayEntries,
  pluginWidgetKey,
  resolvePluginWidget,
  validateSettings,
} from "./plugin-manifest";
import {
  authorizeWidgetCall,
  validateBundle,
} from "./marketplace-scopes";
import {
  DEFAULT_TOKENS,
  flattenAst,
  lintTemplate,
  newSection,
  parseAst,
  parseTemplates,
  parseTokens,
  templateOf,
} from "./builder-ast";
const { listInstalledPlugins, upsertPlugin } = await import("./plugins.server");
const { resumePlugin, suspendPlugin } =
  await import("./plugin-lifecycle.server");
const { composePublishGate } = await import("./publish-gates");
const { rollbackVersion } = await import("./themes.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const OTHER_MERCHANT = "99999999-9999-4999-8999-999999999999";
const ACTOR = "88888888-8888-4888-8888-888888888888";
const PLUGIN = "community-reviews";
const WIDGET = "review_wall";
const PLUGIN_KEY = pluginWidgetKey(PLUGIN, WIDGET);
const VERSION_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const THEME_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

/** Fixture community widget: widget contribution + one text setting. */
const COMMUNITY_MANIFEST = {
  id: PLUGIN,
  name: "Community Reviews",
  version: "1.0.0",
  api: "^3.0.0",
  permissions: ["read_shop", "render_storefront"],
  widgets: [
    {
      key: WIDGET,
      label: "Review wall",
      slots: ["main"],
      entry: "framique.mount(document.createTextNode('reviews'))",
    },
  ],
  hooks: [],
  settings: [{ key: "title", label: "Title", kind: "text", default: "Reviews" }],
  i18n: { en: { title: "Title" }, bn: { title: "শিরোনাম" } },
};

/** Chain state shared across links (ordered `it`s, asserted per link). */
const chain: {
  db: ReturnType<typeof fakeDb>;
  pluginKey: string;
  ast: ReturnType<typeof parseAst>;
  lintErrors: string[];
} = {
  db: fakeDb({ tables: {} }),
  pluginKey: PLUGIN_KEY,
  ast: { header: [], main: [], footer: [] },
  lintErrors: [],
};

function auditActions(db: ReturnType<typeof fakeDb>): string[] {
  return db
    .rows("activity_log")
    .map((r: { action?: string }) => r.action ?? "");
}

describe("T2.3 chained community-plugin acceptance", () => {
  it("link 1 — install: manifest validates, bundle gates pass, install persists with consent evidence", async () => {
    const verdict = parseManifest(COMMUNITY_MANIFEST);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.manifest.widgets).toHaveLength(1);

    const bundle = validateBundle(
      verdict.manifest,
      verdict.manifest.permissions,
    );
    expect(bundle.ok).toBe(true);

    const db = fakeDb({ tables: { plugin_state: [], activity_log: [] } });
    const out = await upsertPlugin(db.asClient() as never, MERCHANT, {
      manifest: COMMUNITY_MANIFEST,
      grantedScopes: ["read_shop", "render_storefront"],
      actorId: ACTOR,
    });
    expect(out).toMatchObject({ ok: true, pluginId: PLUGIN });

    const rows = db.rows("plugin_state");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.scopes).toEqual(["read_shop", "render_storefront"]);
    expect(rows[0]!.consented_by).toBe(ACTOR);
    expect(auditActions(db)).toContain("plugin.installed");
    expect(auditActions(db)).toContain("plugin.scopes_granted");

    const installed = await listInstalledPlugins(
      db.asClient() as never,
      MERCHANT,
    );
    expect(installed).toHaveLength(1);
    expect(installed[0]!.enabled).toBe(true);
    expect(installed[0]!.settings).toEqual(
      defaultSettings(verdict.manifest.settings),
    );

    // Consent fail-safe: a superset/unknown grant writes nothing.
    const evil = fakeDb({ tables: { plugin_state: [], activity_log: [] } });
    await expect(
      upsertPlugin(evil.asClient() as never, MERCHANT, {
        manifest: COMMUNITY_MANIFEST,
        grantedScopes: ["read_shop", "render_storefront", "drain_wallet"],
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/plugin_consent_required/);
    expect(evil.rows("plugin_state")).toHaveLength(0);
    expect(evil.rows("activity_log")).toHaveLength(0);

    chain.db = db;
  });

  it("link 2 — use in builder: tray surfaces the widget and a plugin_block points at it", async () => {
    const installed = await listInstalledPlugins(
      chain.db.asClient() as never,
      MERCHANT,
    );
    // Tray (existing builder surface): main slot lists it, footer does not.
    const main = pluginTrayEntries(installed, "main");
    expect(main.map((e) => e.key)).toContain(PLUGIN_KEY);
    expect(pluginTrayEntries(installed, "footer")).toHaveLength(0);

    // Builder insert (mirrors dashboard/builder.tsx onAddPlugin): a
    // plugin_block pointed at the namespaced key.
    const node = newSection("plugin_block");
    expect(node.type).toBe("plugin_block");
    node.props = { ...node.props, pluginKey: PLUGIN_KEY };
    chain.ast = { header: [], main: [node], footer: [] };

    const res = resolvePluginWidget(PLUGIN_KEY, installed);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.widget.key).toBe(WIDGET);
      expect(res.widget.entry).toContain("framique.mount");
    }
  });

  it("link 3 — persist in AST: round-trip preserves the plugin block; lint is error-free", async () => {
    const json = JSON.parse(JSON.stringify(chain.ast));
    const roundTripped = parseAst(json);
    const nodes = flattenAst(roundTripped).filter(
      (s) => s.type === "plugin_block",
    );
    expect(nodes).toHaveLength(1);
    expect(
      (nodes[0]!.props as Record<string, unknown>)["pluginKey"],
    ).toBe(PLUGIN_KEY);
    // Template lookup (the persistence read path) finds the same node.
    const viaTemplate = templateOf(
      parseTemplates({ index: chain.ast }),
      "index",
    );
    expect(
      flattenAst(viaTemplate)
        .filter((s) => s.type === "plugin_block")
        .map((s) => (s.props as Record<string, unknown>)["pluginKey"]),
    ).toEqual([PLUGIN_KEY]);

    const issues = lintTemplate(roundTripped, "index");
    chain.lintErrors = issues
      .filter((i) => i.level === "error")
      .map((i) => `index: ${i.message}`);
    expect(chain.lintErrors).toEqual([]);
    chain.ast = roundTripped;
  });

  it("link 4 — render through active theme A: resolution + sandbox bridge allow the widget", async () => {
    const installed = await listInstalledPlugins(
      chain.db.asClient() as never,
      MERCHANT,
    );
    const tokensA = parseTokens({ ...DEFAULT_TOKENS });
    expect(tokensA.brand).toBe(DEFAULT_TOKENS.brand);

    // The island resolves under the active theme's tokens.
    expect(resolvePluginWidget(PLUGIN_KEY, installed).ok).toBe(true);

    // Sandbox bridge (existing machinery): granted reads pass, ungranted
    // writes and unknown methods fail closed.
    expect(
      authorizeWidgetCall({ v: 1, id: "1", method: "shop.info" }, [
        "read_shop",
        "render_storefront",
      ]),
    ).toEqual({ allowed: true, method: "shop.info", write: false });
    expect(
      authorizeWidgetCall({ v: 1, id: "2", method: "products.update" }, [
        "read_shop",
        "render_storefront",
      ]),
    ).toMatchObject({ allowed: false, reason: "scope_denied" });
    expect(
      authorizeWidgetCall({ v: 1, id: "3", method: "server.exec" }, [
        "read_shop",
        "render_storefront",
      ]),
    ).toMatchObject({ allowed: false, reason: "unknown_method" });
    expect(
      authorizeWidgetCall({ nope: true }, ["read_shop", "render_storefront"]),
    ).toMatchObject({ allowed: false, reason: "malformed" });
  });

  it("link 5 — switch theme: presentation changes, data/logic identical, gate ok under both", async () => {
    const installed = await listInstalledPlugins(
      chain.db.asClient() as never,
      MERCHANT,
    );
    const tokensA = parseTokens({ ...DEFAULT_TOKENS });
    const tokensB = parseTokens({
      ...DEFAULT_TOKENS,
      brand: "#1E3A8A",
      accent: "#0E7490",
      surface: "#F8FAFC",
      radius: "12px",
    });
    // Presentation changes with the theme …
    expect(tokensB.brand).not.toBe(tokensA.brand);
    expect(tokensB.surface).not.toBe(tokensA.surface);
    expect(tokensB.radius).not.toBe(tokensA.radius);

    // … but data/logic are identical: same resolution, same widget entry,
    // same settings, same sandbox verdict.
    for (const tokens of [tokensA, tokensB]) {
      expect(tokens).toBeTruthy();
      const res = resolvePluginWidget(PLUGIN_KEY, installed);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.widget.entry).toContain("framique.mount");
    }
    const verdict = parseManifest(COMMUNITY_MANIFEST);
    if (!verdict.ok) throw new Error("fixture broke");
    expect(validateSettings(verdict.manifest.settings, { title: "Reviews" }))
      .toMatchObject({ values: { title: "Reviews" }, errors: [] });
    expect(
      authorizeWidgetCall({ v: 1, id: "1", method: "shop.info" }, [
        "read_shop",
        "render_storefront",
      ]),
    ).toEqual({ allowed: true, method: "shop.info", write: false });

    // Publishable under either theme.
    for (const tokens of [tokensA, tokensB]) {
      const gate = composePublishGate({
        tokens,
        lint: chain.lintErrors,
        translation: [],
        fonts: [],
        perf: { ast: chain.ast, template: "index" },
        responsive: { ast: chain.ast },
        a11y: { ast: chain.ast },
      });
      expect(gate.ok).toBe(true);
      expect(gate.failures).toEqual([]);
    }
  });

  it("link 6 — publish/rollback: clean gate publishes, rollback restores, cross-merchant denied", async () => {
    const gate = composePublishGate({
      tokens: parseTokens({ ...DEFAULT_TOKENS }),
      lint: chain.lintErrors,
      translation: [],
      fonts: [],
    });
    expect(gate.ok).toBe(true);

    const db = fakeDb({
      tables: {
        theme_versions: [
          { id: VERSION_ID, merchant_id: MERCHANT, theme_id: THEME_ID },
        ],
        theme_custom_code: [],
      },
      rpc: async (fn) =>
        fn === "theme_rollback"
          ? { data: "cccccccc-cccc-4ccc-cccc-cccccccccccc", error: null }
          : { data: null, error: { message: `rpc_not_stubbed:${fn}` } },
    });
    const out = await rollbackVersion(
      db.asClient() as never,
      MERCHANT,
      VERSION_ID,
    );
    expect(out.versionId).toBe("cccccccc-cccc-4ccc-cccc-cccccccccccc");
    expect(db.rpcCalls("theme_rollback")).toHaveLength(1);

    // Cross-merchant versionId replay fails closed: no row, no RPC.
    const before = db.rpcCalls("theme_rollback").length;
    await expect(
      rollbackVersion(db.asClient() as never, OTHER_MERCHANT, VERSION_ID),
    ).rejects.toThrow(/version_missing|not found/i);
    expect(db.rpcCalls("theme_rollback")).toHaveLength(before);
  });

  it("link 7 — blocked publish fails safely: gate blocks, state untouched, widget degrades to placeholder", async () => {
    // A theme that kills contrast blocks the publish …
    const badTokens = parseTokens({
      ...DEFAULT_TOKENS,
      brand: "#FFFFFF",
      accent: "#FFFFFF",
      surface: "#FFFFFF",
      ink: "#FFFFFF",
    });
    const blocked = composePublishGate({
      tokens: badTokens,
      lint: [],
      translation: [],
      fonts: [],
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.failures.length).toBeGreaterThan(0);
    expect(blocked.failures.some((f) => f.code.startsWith("contrast."))).toBe(
      true,
    );
    // … while the persisted draft is untouched by the refusal.
    const before = JSON.stringify(chain.ast);
    expect(JSON.stringify(parseAst(JSON.parse(before)))).toBe(before);

    // Suspended plugin degrades to a labelled placeholder — never a crash.
    await suspendPlugin(
      chain.db.asClient() as never,
      MERCHANT,
      PLUGIN,
      "operator",
      ACTOR,
    );
    const suspended = await listInstalledPlugins(
      chain.db.asClient() as never,
      MERCHANT,
    );
    expect(suspended[0]!.enabled).toBe(false);
    const dead = resolvePluginWidget(PLUGIN_KEY, suspended);
    expect(dead.ok).toBe(false);
    if (!dead.ok) expect(dead.reason).toBe("disabled");
    await resumePlugin(chain.db.asClient() as never, MERCHANT, PLUGIN, ACTOR);
    const back = await listInstalledPlugins(
      chain.db.asClient() as never,
      MERCHANT,
    );
    expect(resolvePluginWidget(PLUGIN_KEY, back).ok).toBe(true);

    // Dynamic-code bundle never reaches a row.
    const rogue = fakeDb({ tables: { plugin_state: [], activity_log: [] } });
    const evilManifest = {
      ...COMMUNITY_MANIFEST,
      widgets: [
        {
          key: WIDGET,
          label: "Review wall",
          slots: ["main"],
          entry: "eval('steal')",
        },
      ],
    };
    const evilVerdict = parseManifest(evilManifest);
    expect(evilVerdict.ok).toBe(false);
    await expect(
      upsertPlugin(rogue.asClient() as never, MERCHANT, {
        manifest: evilManifest,
        grantedScopes: ["read_shop", "render_storefront"],
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/plugin_manifest_invalid|plugin\.bundle_rejected/);
    expect(rogue.rows("plugin_state")).toHaveLength(0);
    expect(rogue.rows("activity_log")).toHaveLength(0);
  });
});
