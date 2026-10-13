/**
 * Provenance is server-derived and unforgeable (regression pins).
 *
 * Provenance never comes from uploaded bytes or marketplace rows:
 * - `isOfficialPluginKey` / `isOfficialThemeKey` check the in-repo
 *   registries (`OFFICIAL_PLUGIN_KEYS` / `OFFICIAL_THEME_KEYS`), never
 *   manifest fields;
 * - official installs stamp `official:<key>` ledger markers at insert
 *   (`official-plugins.server.ts` / `appearance.server.ts`), while the
 *   custom `installPackage` lane stamps `upload`;
 * - Tier-0 `approval_forbidden` gates (`plugins.server.ts`,
 *   `appearance.server.ts`) scan stored content on every call and never
 *   consult the listing;
 * - risk tiers (`risk-tier.ts`) resolve behavior signals above provenance.
 *
 * Pure regression file: creates no production code, modifies none. If any
 * test here fails against a source change, the change widened trust — do
 * not "fix" the test without a security review.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import { isOfficialPluginKey, getOfficialPlugin } from "./official-plugins";
import { isOfficialThemeKey } from "./themes/appearance";
import { parseManifest } from "./plugin-manifest";
import { gateExportManifest, pkg1PluginValidator } from "./plugin-package";
import { validateThemeManifest } from "./theme-package";
import { resolvePolicy, resolveTierFromSignals } from "./risk-tier";
import { contentHash } from "./package-scan";

const { installOfficialPlugin } = await import("./official-plugins.server");
const { approvePluginVersion, setPluginEnabled } =
  await import("./plugins.server");
const { approveThemeVersion, activateTheme, installOfficialTheme } =
  await import("./themes/appearance.server");
const { installPackage, setPackageManifestValidator } =
  await import("./package-install.server");
const { packageSecurityReport } = await import("./package-security-report");

const MERCHANT = "22222222-2222-4222-8222-222222222222";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const SECRET = "sk-" + "abcdefghij0123456789ABCDEFGH0123";

beforeEach(() => {
  setPackageManifestValidator(null);
});

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    return ((e as { code?: unknown }).code ??
      (e as Error)?.message ??
      "threw") as string;
  }
  return "no_throw";
}

/* ------------------------------------------------- forged fixtures */

const FORGED_PLUGIN_ID = "evil-reviews";

/** Valid custom manifest carrying forged official-provenance fields. */
const FORGED_PLUGIN_MANIFEST = {
  id: FORGED_PLUGIN_ID,
  name: "Evil Reviews",
  version: "1.0.0",
  api: "^3.0.0",
  permissions: ["read_shop", "render_storefront"],
  widgets: [
    {
      key: "main",
      label: "Main",
      slots: ["main"],
      entry: "framique.mount(document.createElement('div'))",
    },
  ],
  hooks: [],
  settings: [],
  i18n: { en: {}, bn: {} },
  provenance: "official",
  official: true,
  pinned: "official:product-reviews",
  artifact_pinned: "official:product-reviews",
};

const FORGED_THEME_KEY = "shiny-theme";

/** Valid custom theme manifest carrying forged official-provenance fields. */
const FORGED_THEME_MANIFEST = {
  key: FORGED_THEME_KEY,
  name: "Shiny Theme",
  nameBn: "শাইনি থিম",
  version: "1.0.0",
  api: "^3.0.0",
  templates: ["index"],
  presentationSurfaces: ["widget"],
  locales: ["en"],
  capabilities: ["render_storefront"],
  provenance: "official",
  official: true,
  pinned: "official:songoskriti",
  artifact_pinned: "official:songoskriti",
};

/* ------------------------------------------------- tiny stored-zip builder
 * Mirrors the repo's hand-rolled test builder (no npm zip libs): stored
 * entries + central directory + EOCD, so the archives parse without deps.
 */
const enc = new TextEncoder();
const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v: number) => [
  v & 0xff,
  (v >>> 8) & 0xff,
  (v >>> 16) & 0xff,
  (v >>> 24) & 0xff,
];

function buildZip(entries: { name: string; content: string }[]): Uint8Array {
  const out: number[] = [];
  const central: number[] = [];
  for (const e of entries) {
    const nameBytes = Array.from(enc.encode(e.name));
    const raw = Array.from(enc.encode(e.content));
    const localOffset = out.length;
    out.push(
      0x50,
      0x4b,
      0x03,
      0x04,
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(raw.length),
      ...u32(raw.length),
      ...u16(nameBytes.length),
      ...u16(0),
      ...nameBytes,
      ...raw,
    );
    central.push(
      0x50,
      0x4b,
      0x01,
      0x02,
      ...u16(20),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(raw.length),
      ...u32(raw.length),
      ...u16(nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(localOffset),
      ...nameBytes,
    );
  }
  const centralOffset = out.length;
  out.push(...central);
  const centralSize = out.length - centralOffset;
  out.push(
    0x50,
    0x4b,
    0x05,
    0x06,
    ...u16(0),
    ...u16(0),
    ...u16(entries.length),
    ...u16(entries.length),
    ...u32(centralSize),
    ...u32(centralOffset),
    ...u16(0),
  );
  return new Uint8Array(out);
}

let keySeq = 0;
const freshKey = () => `prov-key-${(keySeq += 1)}`;

/* ------------------------------------------- 1. forged provenance denied */

describe("forged manifest provenance never reads as official", () => {
  it("plugin validators strip forged fields; the custom id is never official", () => {
    const parsed = parseManifest(FORGED_PLUGIN_MANIFEST);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.manifest).not.toHaveProperty("provenance");
      expect(parsed.manifest).not.toHaveProperty("official");
      expect(parsed.manifest).not.toHaveProperty("pinned");
      expect(parsed.manifest).not.toHaveProperty("artifact_pinned");
      expect(parsed.manifest.id).toBe(FORGED_PLUGIN_ID);
    }
    const gated = gateExportManifest(FORGED_PLUGIN_MANIFEST);
    expect(gated).not.toHaveProperty("provenance");
    expect(gated).not.toHaveProperty("official");
    expect(gated).not.toHaveProperty("pinned");
    const pipeline = pkg1PluginValidator(FORGED_PLUGIN_MANIFEST, "plugin");
    expect(pipeline.ok).toBe(true);
    // Official status derives from the registry key, never manifest fields.
    expect(isOfficialPluginKey(FORGED_PLUGIN_ID)).toBe(false);
    expect(getOfficialPlugin(FORGED_PLUGIN_ID)).toBeNull();
    expect(isOfficialPluginKey("product-reviews")).toBe(true);
  });

  it("installOfficialPlugin refuses the forged key and writes no ledger row", async () => {
    const db = fakeDb({ tables: { marketplace_installs: [] } });
    const code = await codeOf(
      installOfficialPlugin(db.asClient(), MERCHANT, FORGED_PLUGIN_ID, ACTOR),
    );
    expect(code).toMatch(/plugin\.official_unknown/);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });

  it("theme validator strips forged fields; the custom key is never official", () => {
    const verdict = validateThemeManifest(FORGED_THEME_MANIFEST);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.manifest).not.toHaveProperty("provenance");
      expect(verdict.manifest).not.toHaveProperty("official");
      expect(verdict.manifest).not.toHaveProperty("pinned");
      expect(verdict.manifest.key).toBe(FORGED_THEME_KEY);
    }
    expect(isOfficialThemeKey(FORGED_THEME_KEY)).toBe(false);
    expect(isOfficialThemeKey("songoskriti")).toBe(true);
  });

  it("installOfficialTheme refuses the forged key", async () => {
    const db = fakeDb({ tables: {} });
    const code = await codeOf(
      installOfficialTheme(db.asClient(), MERCHANT, FORGED_THEME_KEY, ACTOR),
    );
    expect(code).toMatch(/theme\.unknown/);
  });

  it("custom plugin lane stamps `upload`, never the forged `official:` pin", async () => {
    const db = fakeDb({
      tables: {
        marketplace_installs: [],
        theme_assets: [],
        plugin_state: [],
        theme_audit: [],
      },
    });
    // The forged bytes ride the wire inside plugin.json — the pipeline must
    // still stamp lane provenance, not the manifest's claim.
    const zip = buildZip([
      { name: "plugin.json", content: JSON.stringify(FORGED_PLUGIN_MANIFEST) },
    ]);
    const res = await installPackage(
      db.asClient(),
      MERCHANT,
      {
        kind: "plugin",
        fileName: "evil-reviews.zip",
        bytes: zip,
        idempotencyKey: freshKey(),
      },
      ACTOR,
    );
    expect(res.alreadyInstalled).toBe(false);
    const rows = db.rows("marketplace_installs");
    expect(rows).toHaveLength(1);
    expect(rows[0].listing_slug).toBe(FORGED_PLUGIN_ID);
    expect(rows[0].artifact_pinned).toBe("upload");
    expect(String(rows[0].artifact_pinned)).not.toMatch(/^official:/);
  });

  it("custom theme lane stamps `upload`, never the forged `official:` pin", async () => {
    const db = fakeDb({
      tables: {
        store_themes: [],
        theme_versions: [],
        theme_drafts: [],
        theme_assets: [],
        marketplace_installs: [],
        theme_audit: [],
      },
    });
    const zip = buildZip([
      { name: "theme.json", content: JSON.stringify(FORGED_THEME_MANIFEST) },
      { name: "templates/index.json", content: JSON.stringify({ blocks: [] }) },
    ]);
    const res = await installPackage(
      db.asClient(),
      MERCHANT,
      {
        kind: "theme",
        fileName: "shiny-theme.zip",
        bytes: zip,
        idempotencyKey: freshKey(),
      },
      ACTOR,
    );
    expect(res.alreadyInstalled).toBe(false);
    const rows = db.rows("marketplace_installs");
    expect(rows).toHaveLength(1);
    expect(rows[0].artifact_pinned).toBe("upload");
    expect(String(rows[0].artifact_pinned)).not.toMatch(/^official:/);
  });
});

/* ------------------------------------------- 2. listing confers no trust */

const LISTING_PLUGIN = "shiny-widget";
const LISTING_THEME_SLUG = "shiny-listing-theme";

const SECRET_PLUGIN_MANIFEST = {
  id: LISTING_PLUGIN,
  name: "Shiny Widget",
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

const THEME_ID = "44444444-4444-4444-4444-444444444444";
const THEME_VERSION = "55555555-5555-4555-8555-555555555555";

const SECRET_TEMPLATES = {
  index: {
    header: [],
    main: [{ id: "m1", type: "heading", props: { text: `leaked ${SECRET}` } }],
    footer: [],
  },
};

function pluginListingDb() {
  return fakeDb({
    tables: {
      plugin_state: [
        {
          merchant_id: MERCHANT,
          plugin_id: LISTING_PLUGIN,
          manifest: SECRET_PLUGIN_MANIFEST,
          manifest_version: "1.0.0",
          enabled: false,
        },
      ],
      activity_log: [],
      // Legitimate-looking marketplace row: active community listing.
      marketplace_installs: [
        {
          merchant_id: MERCHANT,
          kind: "widget",
          listing_slug: LISTING_PLUGIN,
          listing_name: "Shiny Widget",
          version: "1.0.0",
          status: "installed",
          artifact_pinned: null,
        },
      ],
    },
  });
}

function themeListingDb() {
  return fakeDb({
    tables: {
      store_themes: [
        {
          id: THEME_ID,
          merchant_id: MERCHANT,
          name: "Shiny Listing Theme",
          is_active: false,
          source_listing_slug: LISTING_THEME_SLUG,
          published_version_id: THEME_VERSION,
        },
      ],
      theme_versions: [
        {
          id: THEME_VERSION,
          merchant_id: MERCHANT,
          theme_id: THEME_ID,
          version: 1,
          status: "published",
          templates: SECRET_TEMPLATES,
          tokens: {},
        },
      ],
      theme_audit: [],
      // Legitimate-looking marketplace row: active community listing.
      marketplace_installs: [
        {
          merchant_id: MERCHANT,
          kind: "theme",
          listing_slug: LISTING_THEME_SLUG,
          listing_name: "Shiny Listing Theme",
          version: "1.0.0",
          status: "installed",
          artifact_pinned: null,
        },
      ],
    },
  });
}

describe("marketplace listing never confers trust", () => {
  it("non-official listing slug never gains official provenance", async () => {
    expect(isOfficialPluginKey(LISTING_PLUGIN)).toBe(false);
    expect(getOfficialPlugin(LISTING_PLUGIN)).toBeNull();
    expect(isOfficialThemeKey(LISTING_THEME_SLUG)).toBe(false);
    const db = fakeDb({ tables: { marketplace_installs: [] } });
    expect(
      await codeOf(
        installOfficialPlugin(db.asClient(), MERCHANT, LISTING_PLUGIN, ACTOR),
      ),
    ).toMatch(/plugin\.official_unknown/);
    expect(
      await codeOf(
        installOfficialTheme(
          db.asClient(),
          MERCHANT,
          LISTING_THEME_SLUG,
          ACTOR,
        ),
      ),
    ).toMatch(/theme\.unknown/);
  });

  it("secret-flagged custom plugin hits approval_forbidden despite the listing", async () => {
    const db = pluginListingDb();
    const code = await codeOf(
      approvePluginVersion(
        db.asClient(),
        MERCHANT,
        LISTING_PLUGIN,
        "1.0.0",
        ACTOR,
      ),
    );
    expect(code).toMatch(/plugin\.approval_forbidden/);
    expect(
      db.rows("activity_log").filter((r) => r.action === "plugin.approved"),
    ).toHaveLength(0);
  });

  it("enabling the secret-flagged listing plugin stays forbidden", async () => {
    const db = pluginListingDb();
    const code = await codeOf(
      setPluginEnabled(db.asClient(), MERCHANT, LISTING_PLUGIN, true, ACTOR),
    );
    expect(code).toMatch(/plugin\.approval_forbidden/);
    expect(
      db.rows("plugin_state").find((r) => r.plugin_id === LISTING_PLUGIN)
        ?.enabled,
    ).toBe(false);
  });

  it("secret-flagged custom theme hits approval_forbidden despite the listing", async () => {
    const db = themeListingDb();
    const err = await approveThemeVersion(
      db.asClient(),
      MERCHANT,
      THEME_ID,
      THEME_VERSION,
      ACTOR,
    ).catch((e) => e);
    expect(err?.code).toBe("theme.approval_forbidden");
    expect(
      db.rows("theme_audit").filter((r) => r.action === "theme.approved"),
    ).toHaveLength(0);
  });

  it("activating the secret-flagged listing theme stays forbidden", async () => {
    const db = themeListingDb();
    const err = await activateTheme(
      db.asClient(),
      MERCHANT,
      THEME_ID,
      ACTOR,
    ).catch((e) => e);
    expect(err?.code).toBe("theme.approval_forbidden");
    expect(
      db.rows("store_themes").find((r) => r.id === THEME_ID)?.is_active,
    ).toBe(false);
  });

  it("security reports read forbidden for listing-backed secret content", async () => {
    const pdb = pluginListingDb();
    const pluginReport = await packageSecurityReport(pdb.asClient(), {
      kind: "plugin",
      merchantId: MERCHANT,
      packageId: LISTING_PLUGIN,
      versionId: "1.0.0",
    });
    expect(pluginReport.decision).toBe("forbidden");
    expect(pluginReport.findings.some((f) => f.code === "secret")).toBe(true);

    const tdb = themeListingDb();
    const themeReport = await packageSecurityReport(tdb.asClient(), {
      kind: "theme",
      merchantId: MERCHANT,
      themeId: THEME_ID,
      versionId: THEME_VERSION,
    });
    expect(themeReport.decision).toBe("forbidden");
    expect(themeReport.findings.some((f) => f.code === "secret")).toBe(true);
  });
});

/* ------------------------------------------- 3. provenance/risk independence */

describe("provenance never exempts risk tier", () => {
  it("behavior signals override official provenance in tier resolution", () => {
    const official = {
      themeSource: "marketplace" as const,
      pluginSources: ["marketplace" as const],
    };
    expect(resolveTierFromSignals(official).tier).toBe("low");
    // Fraud engine beats official provenance AND a stored low tier.
    expect(resolveTierFromSignals({ ...official, fraudScore: 85 }).tier).toBe(
      "high",
    );
    expect(
      resolveTierFromSignals({
        ...official,
        storedTier: "low",
        fraudScore: 90,
      }).tier,
    ).toBe("high");
    expect(resolveTierFromSignals({ ...official, abuseFlags: 3 }).tier).toBe(
      "high",
    );
    expect(resolveTierFromSignals({ ...official, botScore: 70 }).tier).toBe(
      "medium",
    );
  });

  it("resolvePolicy is the enforcement point: high/medium restrict capabilities", () => {
    const high = resolvePolicy("high");
    expect(high.features.customCode).toBe(false);
    expect(high.features.customJs).toBe(false);
    expect(high.features.pluginBundles).toBe(false);
    expect(high.features.uploads).toBe(false);
    expect(high.features.checkout).toBe(false);
    expect(high.features.apiWrite).toBe(false);
    expect(high.features.builder).toBe(false);
    expect(high.features.marketplaceInstall).toBe(false);
    expect(high.features.analytics).toBe(false);
    expect(high.upload.maxFileSizeBytes).toBe(0);
    expect(high.upload.allowedMimeTypes).toHaveLength(0);
    expect(high.rateLimitMultiplier).toBe(0.1);
    expect(high.csp.scriptSrc).not.toContain("strict-dynamic");
    expect(high.iframe.sandbox).not.toContain("allow-scripts");

    const medium = resolvePolicy("medium");
    expect(medium.features.customCode).toBe(false);
    expect(medium.features.customJs).toBe(false);
    expect(medium.features.pluginBundles).toBe(false);
    expect(medium.features.uploads).toBe(false);
  });

  it("an official merchant under behavior signal gets restricted capabilities", () => {
    const { tier } = resolveTierFromSignals({
      themeSource: "marketplace",
      pluginSources: ["marketplace"],
      botScore: 75,
    });
    expect(tier).toBe("medium");
    const policy = resolvePolicy(tier);
    expect(policy.features.customCode).toBe(false);
    expect(policy.features.pluginBundles).toBe(false);

    const { tier: fraudTier } = resolveTierFromSignals({
      themeSource: "marketplace",
      pluginSources: ["marketplace"],
      fraudScore: 95,
    });
    expect(fraudTier).toBe("high");
    expect(resolvePolicy(fraudTier).features.checkout).toBe(false);
  });
});

/* ------------------------------------------- 4. approval binding */

const PIXEL_A = {
  index: {
    header: [],
    main: [
      {
        id: "p1",
        type: "html",
        props: {
          body: '<img src="https://cdn.example.com/a.gif" width="1" height="1">',
        },
      },
    ],
    footer: [],
  },
};

const PIXEL_B = {
  index: {
    header: [],
    main: [
      {
        id: "p1",
        type: "html",
        props: {
          body: '<img src="https://cdn.example.com/b.gif" width="1" height="1">',
        },
      },
    ],
    footer: [],
  },
};

/** Expected approval binding: canonical hash over templates+tokens. */
function themeHash(templates: unknown): string {
  return contentHash({ templates, tokens: {} });
}

function themeBindingDb(templates: unknown, versionId = THEME_VERSION) {
  return fakeDb({
    tables: {
      store_themes: [
        {
          id: THEME_ID,
          merchant_id: MERCHANT,
          name: "Binding Probe",
          is_active: false,
          published_version_id: versionId,
        },
      ],
      theme_versions: [
        {
          id: versionId,
          merchant_id: MERCHANT,
          theme_id: THEME_ID,
          version: 1,
          status: "published",
          templates,
          tokens: {},
        },
      ],
      theme_audit: [],
    },
  });
}

const BIND_PLUGIN = "bind-probe";
const CLEAN_V1 = {
  id: BIND_PLUGIN,
  name: "Bind Probe",
  version: "1.0.0",
  api: "^3.0.0",
  permissions: ["render_storefront"],
  widgets: [],
  hooks: [],
  settings: [],
  i18n: { en: {}, bn: {} },
};

describe("approval binds exact content, never a neighbor", () => {
  it("theme approval for content A does not authorize content B", async () => {
    const db = themeBindingDb(PIXEL_A);
    const approved = await approveThemeVersion(
      db.asClient(),
      MERCHANT,
      THEME_ID,
      THEME_VERSION,
      ACTOR,
    );
    expect(approved).toEqual({ ok: true });
    expect(db.rows("theme_audit")).toHaveLength(1);
    expect(
      (db.rows("theme_audit")[0].after as { content_hash: string })
        .content_hash,
    ).toBe(themeHash(PIXEL_A));

    // Same version row, swapped content: the recorded hash no longer matches.
    const stored = db
      .rows("theme_versions")
      .find((r) => r.id === THEME_VERSION);
    expect(stored).toBeDefined();
    stored!.templates = PIXEL_B;
    const err = await activateTheme(
      db.asClient(),
      MERCHANT,
      THEME_ID,
      ACTOR,
    ).catch((e) => e);
    expect(err?.code).toBe("theme.approval_required");
    expect(
      db.rows("store_themes").find((r) => r.id === THEME_ID)?.is_active,
    ).toBe(false);

    const report = await packageSecurityReport(db.asClient(), {
      kind: "theme",
      merchantId: MERCHANT,
      themeId: THEME_ID,
      versionId: THEME_VERSION,
    });
    expect(report.decision).toBe("pending");
    expect(report.decidedBy).toBeNull();
  });

  it("theme approval intentionally covers identical content under another version id", async () => {
    // Documents the header contract in appearance.server.ts: approval binds
    // the template CONTENT hash, not the row id, because activation
    // materializes a separate published row from the draft. Same bytes under
    // a new id stay covered; any byte change needs fresh approval (pinned
    // above).
    const OTHER_VERSION = "77777777-7777-4777-8777-777777777777";
    const db = themeBindingDb(PIXEL_A);
    await approveThemeVersion(
      db.asClient(),
      MERCHANT,
      THEME_ID,
      THEME_VERSION,
      ACTOR,
    );
    db.tables.theme_versions.push({
      id: OTHER_VERSION,
      merchant_id: MERCHANT,
      theme_id: THEME_ID,
      version: 2,
      status: "published",
      templates: PIXEL_A,
      tokens: {},
    });
    db
      .rows("store_themes")
      .find((r) => r.id === THEME_ID)!.published_version_id = OTHER_VERSION;
    const out = await activateTheme(db.asClient(), MERCHANT, THEME_ID, ACTOR);
    expect(out.id).toBe(THEME_ID);
    expect(
      db.rows("store_themes").find((r) => r.id === THEME_ID)?.is_active,
    ).toBe(true);
  });

  it("plugin approval for version A does not authorize version B", async () => {
    const db = fakeDb({
      tables: {
        plugin_state: [
          {
            merchant_id: MERCHANT,
            plugin_id: BIND_PLUGIN,
            manifest: CLEAN_V1,
            manifest_version: "1.0.0",
            enabled: false,
          },
        ],
        activity_log: [],
      },
    });
    expect(
      await approvePluginVersion(
        db.asClient(),
        MERCHANT,
        BIND_PLUGIN,
        "1.0.0",
        ACTOR,
      ),
    ).toEqual({ ok: true });

    // Content B ships as a new manifest version.
    const row = db
      .rows("plugin_state")
      .find((r) => r.plugin_id === BIND_PLUGIN)!;
    row.manifest = { ...CLEAN_V1, version: "2.0.0" };
    row.manifest_version = "2.0.0";

    // The stale version string is unusable: re-approval against it refuses.
    await expect(
      approvePluginVersion(
        db.asClient(),
        MERCHANT,
        BIND_PLUGIN,
        "1.0.0",
        ACTOR,
      ),
    ).rejects.toThrow("plugin_version_mismatch");
    // The enable gate's exact-match lookup finds no row for version B.
    const approvals = db
      .rows("activity_log")
      .filter((r) => r.action === "plugin.approved");
    const coversB = approvals.some((a) => {
      const changed = (a.changed ?? {}) as Record<string, unknown>;
      return (
        changed.plugin === BIND_PLUGIN && changed.manifest_version === "2.0.0"
      );
    });
    expect(coversB).toBe(false);
    // The report does not credit the old approval to the new version.
    const report = await packageSecurityReport(db.asClient(), {
      kind: "plugin",
      merchantId: MERCHANT,
      packageId: BIND_PLUGIN,
      versionId: "2.0.0",
    });
    expect(report.decidedBy).toBeNull();
    expect(report.decision).toBe("clean");
  });

  it("secret content under an approved version string stays forbidden", async () => {
    // The plugin binding is version-string-only (unlike the theme content
    // hash), so this pins the backstop: every enable re-scans stored bytes
    // and Tier-0 refuses even with a matching approval row on record.
    const db = fakeDb({
      tables: {
        plugin_state: [
          {
            merchant_id: MERCHANT,
            plugin_id: BIND_PLUGIN,
            manifest: {
              ...CLEAN_V1,
              widgets: [
                {
                  key: "probe",
                  label: "Probe",
                  slots: ["main"],
                  entry: `framique.mount(document.createElement('div')) // ${SECRET}`,
                },
              ],
            },
            manifest_version: "1.0.0",
            enabled: false,
          },
        ],
        activity_log: [
          {
            merchant_id: MERCHANT,
            actor: ACTOR,
            action: "plugin.approved",
            resource_type: "plugin",
            resource_id: null,
            changed: { plugin: BIND_PLUGIN, manifest_version: "1.0.0" },
          },
        ],
      },
    });
    const code = await codeOf(
      setPluginEnabled(db.asClient(), MERCHANT, BIND_PLUGIN, true, ACTOR),
    );
    expect(code).toMatch(/plugin\.approval_forbidden/);
  });
});
