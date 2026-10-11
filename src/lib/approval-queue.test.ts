/**
 * Threat-defense — merchant approval queue (TDD).
 *
 * `pendingApprovals` is the read-only queue behind the themes-desk /
 * plugins-desk "needs approval" badges: flagged latest content (theme drafts
 * via `scanPackage`, installed plugin manifests via `scanPackage`) with no
 * matching approval audit. It must never write — reads only — and must never
 * leak another merchant's rows.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({
  holder: null as { observability: Record<string, unknown> } | null,
}));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { pendingApprovals } = await import("./approval-queue.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const THEME = "44444444-4444-4444-4444-444444444444";
const VERSION = "55555555-5555-4555-8555-555555555555";
const CLEAN_THEME = "77777777-7777-4777-8777-777777777777";
const CLEAN_VERSION = "88888888-8888-4888-8888-888888888888";
const ACTOR = "99999999-9999-4999-8999-999999999999";

const SECRET = "sk-abcdefghij0123456789ABCDEFGH0123";

const FLAGGED_TEMPLATES = {
  index: {
    header: [],
    main: [
      {
        id: "m1",
        type: "heading",
        props: { text: `leaked ${SECRET}` },
      },
    ],
    footer: [],
  },
};
const CLEAN_TEMPLATES = { index: { header: [], main: [], footer: [] } };

const FLAGGED_MANIFEST = {
  id: "flagged-probe",
  name: "Flagged Probe",
  version: "1.0.0",
  api: "^3.0.0",
  permissions: ["render_storefront"],
  widgets: [
    {
      key: "probe",
      label: "Probe",
      slots: ["main"],
      entry: `framique.mount(document.createElement('div')) // ${SECRET}`,
    },
  ],
  hooks: [],
  settings: [],
  i18n: { en: {}, bn: {} },
};
const CLEAN_MANIFEST = {
  id: "clean-probe",
  name: "Clean Probe",
  version: "1.0.0",
  api: "^3.0.0",
  permissions: ["render_storefront"],
  widgets: [],
  hooks: [],
  settings: [],
  i18n: { en: {}, bn: {} },
};

function queueDb() {
  return fakeDb({
    tables: {
      store_themes: [
        {
          id: THEME,
          merchant_id: MERCHANT,
          name: "Flagged Theme",
          is_active: false,
        },
        {
          id: CLEAN_THEME,
          merchant_id: MERCHANT,
          name: "Clean Theme",
          is_active: false,
        },
      ],
      theme_drafts: [
        {
          merchant_id: MERCHANT,
          theme_id: THEME,
          revision: 2,
          templates: FLAGGED_TEMPLATES,
          tokens: {},
        },
        {
          merchant_id: MERCHANT,
          theme_id: CLEAN_THEME,
          revision: 1,
          templates: CLEAN_TEMPLATES,
          tokens: {},
        },
      ],
      theme_versions: [
        {
          id: VERSION,
          merchant_id: MERCHANT,
          theme_id: THEME,
          version: 2,
          status: "draft",
          templates: FLAGGED_TEMPLATES,
          tokens: {},
        },
        {
          id: CLEAN_VERSION,
          merchant_id: MERCHANT,
          theme_id: CLEAN_THEME,
          version: 1,
          status: "published",
          templates: CLEAN_TEMPLATES,
          tokens: {},
        },
      ],
      theme_audit: [],
      plugin_state: [
        {
          merchant_id: MERCHANT,
          plugin_id: "flagged-probe",
          manifest: FLAGGED_MANIFEST,
          manifest_version: "1.0.0",
          scopes: ["render_storefront"],
          settings: {},
          enabled: false,
        },
        {
          merchant_id: MERCHANT,
          plugin_id: "clean-probe",
          manifest: CLEAN_MANIFEST,
          manifest_version: "1.0.0",
          scopes: ["render_storefront"],
          settings: {},
          enabled: true,
        },
      ],
      activity_log: [],
    },
  });
}

beforeEach(() => recorder.reset());

describe("pendingApprovals", () => {
  it("lists flagged theme drafts and plugin installs with findings", async () => {
    const db = queueDb();
    const out = await pendingApprovals(db.asClient(), MERCHANT);
    expect(out.themes).toHaveLength(1);
    expect(out.themes[0]).toMatchObject({
      themeId: THEME,
      themeName: "Flagged Theme",
      versionId: VERSION,
    });
    expect(out.themes[0].findings.map((f) => f.code)).toContain("secret");
    expect(out.plugins).toHaveLength(1);
    expect(out.plugins[0]).toMatchObject({
      pluginId: "flagged-probe",
      name: "Flagged Probe",
      manifestVersion: "1.0.0",
    });
    expect(out.plugins[0].findings.map((f) => f.code)).toContain("secret");
  });

  it("omits clean content", async () => {
    const db = queueDb();
    const out = await pendingApprovals(db.asClient(), MERCHANT);
    expect(out.themes.find((t) => t.themeId === CLEAN_THEME)).toBeUndefined();
    expect(
      out.plugins.find((p) => p.pluginId === "clean-probe"),
    ).toBeUndefined();
  });

  it("never writes", async () => {
    const db = queueDb();
    await pendingApprovals(db.asClient(), MERCHANT);
    expect(db.callsOf("insert")).toHaveLength(0);
    expect(db.callsOf("update")).toHaveLength(0);
    expect(db.callsOf("delete")).toHaveLength(0);
    expect(db.callsOf("upsert")).toHaveLength(0);
  });

  it("isolates merchants", async () => {
    const db = fakeDb({
      tables: {
        store_themes: [
          {
            id: THEME,
            merchant_id: OTHER,
            name: "Foreign Theme",
            is_active: false,
          },
        ],
        theme_drafts: [
          {
            merchant_id: OTHER,
            theme_id: THEME,
            revision: 1,
            templates: FLAGGED_TEMPLATES,
            tokens: {},
          },
        ],
        theme_versions: [
          {
            id: VERSION,
            merchant_id: OTHER,
            theme_id: THEME,
            version: 1,
            status: "draft",
            templates: FLAGGED_TEMPLATES,
            tokens: {},
          },
        ],
        theme_audit: [],
        plugin_state: [
          {
            merchant_id: OTHER,
            plugin_id: "flagged-probe",
            manifest: FLAGGED_MANIFEST,
            manifest_version: "1.0.0",
            scopes: ["render_storefront"],
            settings: {},
            enabled: false,
          },
        ],
        activity_log: [],
      },
    });
    const out = await pendingApprovals(db.asClient(), MERCHANT);
    expect(out).toEqual({ themes: [], plugins: [] });
    const foreign = await pendingApprovals(db.asClient(), OTHER);
    expect(foreign.themes).toHaveLength(1);
    expect(foreign.plugins).toHaveLength(1);
  });

  it("theme approval removes the theme row from the queue", async () => {
    const { approveThemeVersion } = await import("./themes/appearance.server");
    const db = queueDb();
    expect(
      (await pendingApprovals(db.asClient(), MERCHANT)).themes,
    ).toHaveLength(1);
    await approveThemeVersion(db.asClient(), MERCHANT, THEME, VERSION, ACTOR);
    const out = await pendingApprovals(db.asClient(), MERCHANT);
    expect(out.themes).toHaveLength(0);
    // The plugin half is untouched by a theme approval.
    expect(out.plugins).toHaveLength(1);
  });

  it("plugin approval removes the plugin row from the queue", async () => {
    const { approvePluginVersion } = await import("./plugins.server");
    const db = queueDb();
    expect(
      (await pendingApprovals(db.asClient(), MERCHANT)).plugins,
    ).toHaveLength(1);
    await approvePluginVersion(
      db.asClient(),
      MERCHANT,
      "flagged-probe",
      "1.0.0",
      ACTOR,
    );
    const out = await pendingApprovals(db.asClient(), MERCHANT);
    expect(out.plugins).toHaveLength(0);
    // The theme half is untouched by a plugin approval.
    expect(out.themes).toHaveLength(1);
  });
});
