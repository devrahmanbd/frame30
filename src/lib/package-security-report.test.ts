/**
 * Versioned security report — pure assembly over existing rows + audit.
 *
 * No migration: every field recomputes from (`theme_versions` | `plugin_state`)
 * content plus the (`theme_audit` | `activity_log`) approval trail, using the
 * exact file shapes and hash bindings the activation/enable gates enforce.
 */
import { describe, expect, it } from "vitest";
import { fakeDb, type Row } from "./__fixtures__/fake-db";

const { packageSecurityReport } = await import("./package-security-report");
const { SCANNER_VERSION, contentHash } = await import("./package-scan");

const MERCHANT = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";
const THEME = "22222222-2222-4222-8222-222222222222";
const VERSION = "33333333-3333-4333-8333-333333333333";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const PLUGIN = "audit-probe";
const MANIFEST_VERSION = "1.0.0";

const SECRET = "sk-" + "abcdefghij0123456789ABCDEFGH0123";

const SECRET_TEMPLATES = {
  index: {
    header: [],
    main: [{ id: "m1", type: "heading", props: { text: `leaked ${SECRET}` } }],
    footer: [],
  },
};

const PIXEL_TEMPLATES = {
  index: {
    header: [],
    main: [
      {
        id: "p1",
        type: "html",
        props: {
          body: '<img src="https://cdn.example.com/p.gif" width="1" height="1">',
        },
      },
    ],
    footer: [],
  },
};

const CLEAN_TEMPLATES = { index: { header: [], main: [], footer: [] } };

const SECRET_MANIFEST = {
  id: PLUGIN,
  name: "Audit Probe",
  version: MANIFEST_VERSION,
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
  id: PLUGIN,
  name: "Audit Probe",
  version: MANIFEST_VERSION,
  api: "^3.0.0",
  description: "See https://docs.example.com/probe for help.",
  permissions: ["render_storefront"],
  widgets: [],
  hooks: [],
  settings: [],
  i18n: { en: {}, bn: {} },
};

/** Expected report binding: canonical hash over templates+tokens. */
function themeHash(templates: unknown): string {
  return contentHash({ templates, tokens: {} });
}

function themeDb(templates: unknown, audit: Row[] = []) {
  return fakeDb({
    tables: {
      store_themes: [
        {
          id: THEME,
          merchant_id: MERCHANT,
          name: "Target",
          is_active: false,
        },
      ],
      theme_versions: [
        {
          id: VERSION,
          merchant_id: MERCHANT,
          theme_id: THEME,
          version: 2,
          status: "draft",
          templates,
          tokens: {},
          created_by: ACTOR,
        },
      ],
      theme_audit: audit,
    },
  });
}

function approvalAudit() {
  return [
    {
      merchant_id: MERCHANT,
      theme_id: THEME,
      actor: ACTOR,
      action: "theme.approved",
      before: null,
      after: {
        version_id: VERSION,
        content_hash: themeHash(PIXEL_TEMPLATES),
      },
      created_at: "2026-10-01T00:00:00.000Z",
    },
  ];
}

function pluginDb(manifest: unknown, log: Row[] = []) {
  return fakeDb({
    tables: {
      plugin_state: [
        {
          merchant_id: MERCHANT,
          plugin_id: PLUGIN,
          manifest,
          manifest_version: MANIFEST_VERSION,
          enabled: false,
          consented_by: ACTOR,
        },
      ],
      activity_log: log,
    },
  });
}

describe("packageSecurityReport (theme)", () => {
  it("reports a secret-flagged version as forbidden with recomputed findings", async () => {
    const db = themeDb(SECRET_TEMPLATES);
    const report = await packageSecurityReport(db.asClient(), {
      kind: "theme",
      merchantId: MERCHANT,
      themeId: THEME,
      versionId: VERSION,
    });
    expect(report.package).toEqual({
      kind: "theme",
      id: THEME,
      name: "Target",
    });
    expect(report.version).toBe("2");
    expect(report.sha256).toBe(themeHash(SECRET_TEMPLATES));
    expect(report.merchantId).toBe(MERCHANT);
    expect(report.uploader).toBe(ACTOR);
    expect(report.scannerVersion).toBe(SCANNER_VERSION);
    expect(report.findings.some((f) => f.code === "secret")).toBe(true);
    expect(report.decision).toBe("forbidden");
    expect(report.decidedBy).toBeNull();
    expect(report.decidedAt).toBeNull();
  });

  it("a legacy approval does not lift a forbidden report", async () => {
    const db = themeDb(SECRET_TEMPLATES, [
      {
        merchant_id: MERCHANT,
        theme_id: THEME,
        actor: ACTOR,
        action: "theme.approved",
        before: null,
        after: {
          version_id: VERSION,
          content_hash: themeHash(SECRET_TEMPLATES),
        },
        created_at: "2026-09-01T00:00:00.000Z",
      },
    ]);
    const report = await packageSecurityReport(db.asClient(), {
      kind: "theme",
      merchantId: MERCHANT,
      themeId: THEME,
      versionId: VERSION,
    });
    expect(report.decision).toBe("forbidden");
    expect(report.decidedBy).toBeNull();
  });

  it("reports Tier-1 content without approval as pending", async () => {
    const db = themeDb(PIXEL_TEMPLATES);
    const report = await packageSecurityReport(db.asClient(), {
      kind: "theme",
      merchantId: MERCHANT,
      themeId: THEME,
      versionId: VERSION,
    });
    expect(report.sha256).toBe(themeHash(PIXEL_TEMPLATES));
    expect(report.findings.some((f) => f.code === "secret")).toBe(false);
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.decision).toBe("pending");
    expect(report.decidedBy).toBeNull();
  });

  it("reports Tier-1 content with a bound approval as approved", async () => {
    const db = themeDb(PIXEL_TEMPLATES, approvalAudit());
    const report = await packageSecurityReport(db.asClient(), {
      kind: "theme",
      merchantId: MERCHANT,
      themeId: THEME,
      versionId: VERSION,
    });
    expect(report.decision).toBe("approved");
    expect(report.decidedBy).toBe(ACTOR);
    expect(report.decidedAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("reports clean content as clean with no decision", async () => {
    const db = themeDb(CLEAN_TEMPLATES);
    const report = await packageSecurityReport(db.asClient(), {
      kind: "theme",
      merchantId: MERCHANT,
      themeId: THEME,
      versionId: VERSION,
    });
    expect(report.decision).toBe("clean");
    expect(report.findings.filter((f) => f.severity === "high")).toHaveLength(
      0,
    );
  });

  it("refuses cross-merchant reads", async () => {
    const db = themeDb(PIXEL_TEMPLATES);
    await expect(
      packageSecurityReport(db.asClient(), {
        kind: "theme",
        merchantId: OTHER,
        themeId: THEME,
        versionId: VERSION,
      }),
    ).rejects.toThrow(/theme\.version_missing|theme\.missing/);
  });
});

describe("packageSecurityReport (plugin)", () => {
  it("reports a secret-flagged manifest as forbidden", async () => {
    const db = pluginDb(SECRET_MANIFEST);
    const report = await packageSecurityReport(db.asClient(), {
      kind: "plugin",
      merchantId: MERCHANT,
      packageId: PLUGIN,
      versionId: MANIFEST_VERSION,
    });
    expect(report.package).toEqual({
      kind: "plugin",
      id: PLUGIN,
      name: "Audit Probe",
    });
    expect(report.version).toBe(MANIFEST_VERSION);
    expect(report.sha256).toBe(contentHash(SECRET_MANIFEST));
    expect(report.merchantId).toBe(MERCHANT);
    expect(report.scannerVersion).toBe(SCANNER_VERSION);
    expect(report.findings.some((f) => f.code === "secret")).toBe(true);
    expect(report.decision).toBe("forbidden");
    expect(report.decidedBy).toBeNull();
  });

  it("reports clean content as clean", async () => {
    const db = pluginDb(CLEAN_MANIFEST);
    const report = await packageSecurityReport(db.asClient(), {
      kind: "plugin",
      merchantId: MERCHANT,
      packageId: PLUGIN,
      versionId: MANIFEST_VERSION,
    });
    expect(report.decision).toBe("clean");
  });

  it("refuses version mismatches like the approve fn", async () => {
    const db = pluginDb(CLEAN_MANIFEST);
    await expect(
      packageSecurityReport(db.asClient(), {
        kind: "plugin",
        merchantId: MERCHANT,
        packageId: PLUGIN,
        versionId: "9.9.9",
      }),
    ).rejects.toThrow(/plugin_version_mismatch/);
  });
});
