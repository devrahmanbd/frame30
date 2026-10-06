/**
 * PKG-4 — plugin ZIP parity + full lifecycle acceptance (cases only).
 *
 * Same lifecycle proof for plugins as themes get: an official plugin ZIP
 * (materialised by `exportBuiltinPluginZip`) and a custom plugin ZIP travel
 * the IDENTICAL pipeline — `installPackage(kind: "plugin")` → enable →
 * render — then update/rollback/uninstall, every rejection, and tenant
 * isolation. No network, no real database: persistence is the in-memory
 * fakeDb and every archive is hand-built (exporter output or the repo's
 * `buildTestZip` fixture — no npm zip libraries).
 *
 * Index:
 * - exporter parity ............... THIS FILE (official ZIP shape + gate)
 * - official install/enable/render . THIS FILE
 * - custom install/enable/render ... THIS FILE (+ host projection)
 * - update v1→v2 + consent ......... THIS FILE
 * - rollback (re-enable v1) ........ THIS FILE
 * - uninstall isolation ............ THIS FILE
 * - invalid ZIP / zip-slip ......... THIS FILE
 * - missing dep / bad api .......... THIS FILE
 * - broken presentation/asset/ver .. THIS FILE
 * - tenant A/B isolation ........... THIS FILE
 */
import { describe, expect, it } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import { buildTestZip } from "./__fixtures__/test-zip";
import {
  exportBuiltinPluginZip,
  exportPluginManifestZip,
  officialPluginIds,
  pkg1PluginValidator,
  PluginPackageError,
} from "./plugin-package";
import {
  installPackage,
  setPluginPackageEnabled,
  uninstallPluginPackage,
  type ManifestValidator,
} from "./package-install.server";
import {
  defaultSettings,
  parseManifest,
  pluginTrayEntries,
  resolvePluginWidget,
} from "./plugin-manifest";
import { listInstalledPlugins, upsertPlugin } from "./plugins.server";
import { getBuiltinPlugin } from "./builtin-plugins";
import {
  parseZip,
  extractPackageFiles,
  validatePackageLayout,
} from "./package-zip";

const MERCHANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const MERCHANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ACTOR = "99999999-9999-4999-8999-999999999999";

function pkgDb() {
  return fakeDb({
    tables: {
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      theme_assets: [],
      marketplace_installs: [],
      theme_audit: [],
      plugin_state: [],
      plugin_kill_switch: [],
      activity_log: [],
    },
  });
}

let keySeq = 0;
const key = () => `pkg4-key-${(keySeq += 1)}`;

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    return (e as { code?: string }).code ?? (e as Error)?.message ?? "threw";
  }
  return "no_throw";
}

function installPlugin(
  db: ReturnType<typeof fakeDb>,
  merchant: string,
  bytes: Uint8Array,
  opts: { fileName?: string; key?: string; validator?: ManifestValidator } = {},
) {
  return installPackage(
    db.asClient(),
    merchant,
    {
      kind: "plugin",
      fileName: opts.fileName ?? "plugin.zip",
      bytes,
      idempotencyKey: opts.key ?? key(),
      validator: opts.validator as ManifestValidator | undefined,
    },
    ACTOR,
  );
}

function customManifest(
  version = "1.0.0",
  extra: Record<string, unknown> = {},
) {
  return {
    id: "acme-reviews",
    name: "Acme Reviews",
    version,
    api: "^3.0.0",
    permissions: ["read_shop", "render_storefront"],
    widgets: [
      {
        key: "reviews",
        label: "Customer Reviews",
        slots: ["main"],
        entry: "framique.mount(document.createElement('div'))",
      },
    ],
    hooks: [],
    settings: [
      { key: "title", label: "Title", kind: "text", default: "Reviews" },
    ],
    i18n: { en: { title: "Title" }, bn: { title: "শিরোনাম" } },
    budget: { jsKb: 10, mainThreadMs: 5 },
    ...extra,
  };
}

function customZip(
  manifest: Record<string, unknown>,
  extra: { name: string; content: string }[] = [],
): Uint8Array {
  return buildTestZip([
    { name: "plugin.json", content: JSON.stringify(manifest) },
    ...extra,
  ]);
}

/* ------------------------------------------------------- exporter parity */

describe("PKG-4 exporter parity (official ZIP shape)", () => {
  it("exports a layout-valid ZIP whose manifest passes the real gate", () => {
    expect(officialPluginIds()).toContain("loyalty-lite");
    const bytes = exportBuiltinPluginZip("loyalty-lite");
    const entries = parseZip(bytes);
    expect(entries.map((e) => e.name)).toEqual([
      "plugin.json",
      "locales/en.json",
      "locales/bn.json",
    ]);
    const files = extractPackageFiles(bytes, entries);
    const layout = validatePackageLayout(files, "plugin");
    expect(layout.manifest).toMatchObject({ name: "Loyalty Lite" });
    expect(parseManifest(layout.manifest).ok).toBe(true);
    // Manifest + settings data only: no code file survives the layout gate.
    expect(
      entries.some((e) => /\.(js|ts|jsx|tsx|exe|sh|py|php)$/i.test(e.name)),
    ).toBe(false);
  });

  it("round-trips a custom manifest through export → layout → gate", () => {
    const bytes = exportPluginManifestZip(customManifest("2.0.0"));
    const files = extractPackageFiles(bytes, parseZip(bytes));
    const layout = validatePackageLayout(files, "plugin");
    const verdict = parseManifest(layout.manifest);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.manifest.version).toBe("2.0.0");
      expect(verdict.manifest.settings).toHaveLength(1);
    }
  });

  it("refuses unknown official ids and ungateable manifests", () => {
    expect(() => exportBuiltinPluginZip("ghost-plugin")).toThrowError(
      PluginPackageError,
    );
    try {
      exportBuiltinPluginZip("ghost-plugin");
    } catch (e) {
      expect((e as PluginPackageError).code).toBe("plugin.unknown_builtin");
    }
    expect(() =>
      exportPluginManifestZip({ id: "bad!!", version: "banana" }),
    ).toThrowError(PluginPackageError);
    try {
      exportPluginManifestZip({ id: "bad!!", version: "banana" });
    } catch (e) {
      expect((e as PluginPackageError).code).toBe("plugin.manifest_invalid");
    }
  });
});

/* ------------------------------------------- official install/enable/render */

describe("PKG-4 official plugin ZIP → install → enable → render", () => {
  it("installs, enables, and renders the official loyalty-lite ZIP", async () => {
    const db = pkgDb();
    const bytes = exportBuiltinPluginZip("loyalty-lite");
    const res = await installPlugin(db, MERCHANT_A, bytes, {
      fileName: "loyalty-lite.zip",
    });
    expect(res.alreadyInstalled).toBe(false);
    expect(res.version).toBe("1.2.0");
    expect(res.artifactId).toHaveLength(64);

    const ledger = db.rows("marketplace_installs");
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      kind: "widget",
      listing_slug: "loyalty-lite",
      status: "installed",
    });
    // Namespaced assets, never the global tree.
    expect(
      db
        .rows("theme_assets")
        .every((a) => (a.name as string).startsWith("plugins/")),
    ).toBe(true);

    const enabled = await setPluginPackageEnabled(
      db.asClient(),
      MERCHANT_A,
      res.packageId,
      true,
      ACTOR,
    );
    expect(enabled.status).toBe("installed");

    // Render proof through the real manifest gate (sandbox island, Class A).
    await upsertPlugin(db.asClient() as never, MERCHANT_A, {
      manifest: getBuiltinPlugin("loyalty-lite")!.manifest,
      grantedScopes: ["read_shop", "render_storefront"],
      actorId: ACTOR,
    });
    const installed = await listInstalledPlugins(
      db.asClient() as never,
      MERCHANT_A,
    );
    const found = installed.find((p) => p.manifest.id === "loyalty-lite")!;
    expect(found.enabled).toBe(true);
    const resolved = resolvePluginWidget(
      "plugin:loyalty-lite/points_bar",
      installed,
    );
    expect(resolved.ok).toBe(true);
    expect(
      pluginTrayEntries(installed, "main").some(
        (e) => e.key === "plugin:loyalty-lite/points_bar",
      ),
    ).toBe(true);
  });

  it("replays an idempotency key without stacking ledger rows", async () => {
    const db = pkgDb();
    const bytes = exportBuiltinPluginZip("social-proof");
    const k = key();
    const first = await installPlugin(db, MERCHANT_A, bytes, { key: k });
    const second = await installPlugin(db, MERCHANT_A, bytes, { key: k });
    expect(second.alreadyInstalled).toBe(true);
    expect(second.packageId).toBe(first.packageId);
    expect(db.rows("marketplace_installs")).toHaveLength(1);
  });
});

/* --------------------------------------------- custom install/enable/render */

describe("PKG-4 custom plugin ZIP → install → enable → render", () => {
  it("installs, disables/enables, and renders a custom plugin", async () => {
    const db = pkgDb();
    const res = await installPlugin(
      db,
      MERCHANT_A,
      customZip(customManifest()),
    );
    expect(res.version).toBe("1.0.0");

    // Disabled installs resolve to a labelled placeholder, never a crash.
    const verdict = parseManifest(customManifest());
    if (!verdict.ok) throw new Error("fixture manifest rejected");
    const hostRow = {
      installId: res.packageId,
      manifest: verdict.manifest,
      grantedScopes: ["read_shop", "render_storefront"],
      settings: defaultSettings(verdict.manifest.settings),
      enabled: false,
    };
    expect(
      resolvePluginWidget("plugin:acme-reviews/reviews", [hostRow]),
    ).toEqual({
      ok: false,
      reason: "disabled",
      pluginId: "acme-reviews",
    });

    const disabled = await setPluginPackageEnabled(
      db.asClient(),
      MERCHANT_A,
      res.packageId,
      false,
      ACTOR,
    );
    expect(disabled.status).toBe("paused");
    const enabled = await setPluginPackageEnabled(
      db.asClient(),
      MERCHANT_A,
      res.packageId,
      true,
      ACTOR,
    );
    expect(enabled.status).toBe("installed");

    await upsertPlugin(db.asClient() as never, MERCHANT_A, {
      manifest: customManifest(),
      grantedScopes: ["read_shop", "render_storefront"],
      actorId: ACTOR,
    });
    const installed = await listInstalledPlugins(
      db.asClient() as never,
      MERCHANT_A,
    );
    const ok = resolvePluginWidget("plugin:acme-reviews/reviews", installed);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.widget.key).toBe("reviews");
      expect(ok.plugin.manifest.version).toBe("1.0.0");
      expect(ok.plugin.settings).toMatchObject({ title: "Reviews" });
    }
    // Unknown widgets and incompatible APIs fail closed with reasons.
    expect(
      resolvePluginWidget("plugin:acme-reviews/ghost", installed),
    ).toMatchObject({ ok: false, reason: "unknown_widget" });
    expect(
      resolvePluginWidget("plugin:acme-reviews/reviews", installed, "2.0.0"),
    ).toMatchObject({ ok: false, reason: "incompatible" });
  });
});

/* ---------------------------------------------------------- update + rollback */

describe("PKG-4 plugin update v1→v2 + rollback", () => {
  it("installs v2 as a new ledger row and renders the new manifest", async () => {
    const db = pkgDb();
    const v1 = await installPlugin(
      db,
      MERCHANT_A,
      customZip(customManifest("1.0.0")),
    );
    const v2manifest = {
      ...customManifest("1.1.0"),
      settings: [
        { key: "title", label: "Title", kind: "text", default: "Reviews" },
        {
          key: "limit",
          label: "Limit",
          kind: "number",
          min: 1,
          max: 20,
          default: 6,
        },
      ],
    };
    const v2 = await installPlugin(db, MERCHANT_A, customZip(v2manifest));
    expect(v2.packageId).not.toBe(v1.packageId);
    expect(v2.version).toBe("1.1.0");
    // Plugin history is successive ledger rows (not theme_versions).
    expect(
      db
        .rows("marketplace_installs")
        .filter((r) => r.listing_slug === "acme-reviews"),
    ).toHaveLength(2);

    // Permission-widening updates need fresh consent — refused without it.
    const widened = {
      ...customManifest("1.2.0"),
      permissions: ["read_shop", "read_products", "render_storefront"],
    };
    await upsertPlugin(db.asClient() as never, MERCHANT_A, {
      manifest: customManifest("1.0.0"),
      grantedScopes: ["read_shop", "render_storefront"],
      actorId: ACTOR,
    });
    await expect(
      upsertPlugin(db.asClient() as never, MERCHANT_A, {
        manifest: widened,
        grantedScopes: ["read_shop", "render_storefront"],
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/plugin_consent_required:read_products/);
    await upsertPlugin(db.asClient() as never, MERCHANT_A, {
      manifest: widened,
      grantedScopes: ["read_shop", "read_products", "render_storefront"],
      reconsented: true,
      actorId: ACTOR,
    });
    const installed = await listInstalledPlugins(
      db.asClient() as never,
      MERCHANT_A,
    );
    expect(
      installed.find((p) => p.manifest.id === "acme-reviews")?.manifest.version,
    ).toBe("1.2.0");
  });

  it("rolls back by re-enabling v1 and re-projecting its manifest", async () => {
    const db = pkgDb();
    const v1 = await installPlugin(
      db,
      MERCHANT_A,
      customZip(customManifest("1.0.0")),
    );
    const v2 = await installPlugin(
      db,
      MERCHANT_A,
      customZip(customManifest("1.1.0")),
    );
    await upsertPlugin(db.asClient() as never, MERCHANT_A, {
      manifest: customManifest("1.1.0"),
      grantedScopes: ["read_shop", "render_storefront"],
      actorId: ACTOR,
    });

    // Rollback = ledger flip (v2 paused, v1 live) + v1 manifest re-projected.
    await setPluginPackageEnabled(
      db.asClient(),
      MERCHANT_A,
      v2.packageId,
      false,
      ACTOR,
    );
    await setPluginPackageEnabled(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      true,
      ACTOR,
    );
    await upsertPlugin(db.asClient() as never, MERCHANT_A, {
      manifest: customManifest("1.0.0"),
      grantedScopes: ["read_shop", "render_storefront"],
      actorId: ACTOR,
    });
    const ledger = db.rows("marketplace_installs");
    expect(ledger.find((r) => r.id === v1.packageId)?.status).toBe("installed");
    expect(ledger.find((r) => r.id === v2.packageId)?.status).toBe("paused");
    const installed = await listInstalledPlugins(
      db.asClient() as never,
      MERCHANT_A,
    );
    const active = installed.find((p) => p.manifest.id === "acme-reviews")!;
    expect(active.manifest.version).toBe("1.0.0");
    expect(
      resolvePluginWidget("plugin:acme-reviews/reviews", installed).ok,
    ).toBe(true);
  });
});

/* ----------------------------------------------------------------- uninstall */

describe("PKG-4 plugin uninstall isolation", () => {
  it("wipes one plugin's namespace without touching siblings", async () => {
    const db = pkgDb();
    const official = await installPlugin(
      db,
      MERCHANT_A,
      exportBuiltinPluginZip("loyalty-lite"),
    );
    const custom = await installPlugin(
      db,
      MERCHANT_A,
      customZip(customManifest(), [
        { name: "assets/icon.png", content: "icon" },
      ]),
    );
    const out = await uninstallPluginPackage(
      db.asClient(),
      MERCHANT_A,
      custom.packageId,
      ACTOR,
    );
    expect(out.ok).toBe(true);
    expect(out.removedAssets).toBeGreaterThan(0);
    const assets = db.rows("theme_assets");
    expect(assets.length).toBeGreaterThan(0);
    expect(
      assets.every((a) =>
        (a.name as string).startsWith("plugins/loyalty-lite/"),
      ),
    ).toBe(true);
    const ledger = db.rows("marketplace_installs");
    expect(ledger.find((r) => r.id === custom.packageId)?.status).toBe(
      "removed",
    );
    expect(ledger.find((r) => r.id === official.packageId)?.status).toBe(
      "installed",
    );
  });
});

/* ---------------------------------------------------------------- rejections */

describe("PKG-4 plugin rejections", () => {
  it("rejects non-zip bytes and non-zip names without writing anything", async () => {
    const db = pkgDb();
    expect(
      await codeOf(
        installPackage(db.asClient(), MERCHANT_A, {
          kind: "plugin",
          fileName: "plugin.zip",
          bytes: new TextEncoder().encode("not a zip"),
          idempotencyKey: key(),
        }),
      ),
    ).toBe("zip.malformed");
    expect(
      await codeOf(
        installPlugin(db, MERCHANT_A, customZip(customManifest()), {
          fileName: "plugin.tar.gz",
        }),
      ),
    ).toBe("package.bad_name");
    expect(
      await codeOf(
        installPackage(db.asClient(), MERCHANT_A, {
          kind: "plugin",
          fileName: "plugin.zip",
          bytes: new Uint8Array(),
          idempotencyKey: key(),
        }),
      ),
    ).toBe("zip.malformed");
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });

  it("rejects zip-slip entries end-to-end", async () => {
    const db = pkgDb();
    for (const bad of ["../../evil.json", "/abs.json", "C:/evil.json"]) {
      const zip = buildTestZip([
        { name: "plugin.json", content: JSON.stringify(customManifest()) },
        { name: bad, content: "{}" },
      ]);
      expect(await codeOf(installPlugin(db, MERCHANT_A, zip))).toBe(
        "zip.unsafe_path",
      );
    }
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });

  it("rejects missing dependencies, then installs once satisfied", async () => {
    const db = pkgDb();
    const zip = customZip(
      customManifest("1.0.0", { dependencies: ["ghost-dep"] }),
    );
    expect(await codeOf(installPlugin(db, MERCHANT_A, zip))).toBe(
      "package.missing_dependency",
    );
    db.rows("marketplace_installs").push({
      id: "dep-1",
      merchant_id: MERCHANT_A,
      kind: "widget",
      listing_slug: "ghost-dep",
      status: "installed",
    });
    const res = await installPlugin(db, MERCHANT_A, zip);
    expect(res.alreadyInstalled).toBe(false);
  });

  it("rejects unsupported builder APIs", async () => {
    const db = pkgDb();
    const zip = customZip(customManifest("1.0.0", { api: "^99.0.0" }));
    expect(await codeOf(installPlugin(db, MERCHANT_A, zip))).toBe(
      "package.api_incompatible",
    );
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });

  it("rejects broken presentation refs, executable assets, and bad versions", async () => {
    const db = pkgDb();
    const brokenRef = customZip(customManifest(), [
      {
        name: "templates/index.json",
        content: JSON.stringify({ hero: "assets/missing.png" }),
      },
    ]);
    expect(await codeOf(installPlugin(db, MERCHANT_A, brokenRef))).toBe(
      "package.broken_ref",
    );
    // Executable asset anywhere in the archive is refused (no sandbox weakening).
    const evilAsset = customZip(customManifest(), [
      { name: "assets/app.js", content: "evil()" },
    ]);
    expect(await codeOf(installPlugin(db, MERCHANT_A, evilAsset))).toBe(
      "zip.blocked_extension",
    );
    // Dynamic-code widget entries never reach the sandbox island: the real
    // plugin gate (via the pipeline `validator` seam) refuses them at the
    // package boundary.
    const evilEntry = customZip(
      customManifest("1.0.0", {
        widgets: [
          {
            key: "x",
            label: "X",
            slots: ["main"],
            entry: "eval('evil')",
          },
        ],
      }),
    );
    expect(
      await codeOf(
        installPlugin(db, MERCHANT_A, evilEntry, {
          validator: pkg1PluginValidator as ManifestValidator,
        }),
      ),
    ).toBe("package.manifest_invalid");
    const badVersion = customZip(customManifest("banana"));
    expect(await codeOf(installPlugin(db, MERCHANT_A, badVersion))).toBe(
      "package.bad_version",
    );
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });

  it("accepts a well-formed manifest through the real plugin gate (seam)", async () => {
    const db = pkgDb();
    const gated = await installPlugin(
      db,
      MERCHANT_A,
      customZip(customManifest()),
      {
        validator: pkg1PluginValidator as ManifestValidator,
      },
    );
    expect(gated.version).toBe("1.0.0");
    expect(
      db.rows("marketplace_installs").find((r) => r.id === gated.packageId)
        ?.listing_slug,
    ).toBe("acme-reviews");
    // Missing-dependency declarations ride the stub-compatible key.
    const withDep = customZip(
      customManifest("1.0.0", { dependencies: ["ghost-dep"] }),
    );
    expect(
      await codeOf(
        installPlugin(db, MERCHANT_A, withDep, {
          validator: pkg1PluginValidator as ManifestValidator,
        }),
      ),
    ).toBe("package.missing_dependency");
  });
});

/* ---------------------------------------------------------- tenant isolation */

describe("PKG-4 plugin tenant A/B isolation", () => {
  it("scopes every plugin step to the owning merchant", async () => {
    const db = pkgDb();
    const res = await installPlugin(
      db,
      MERCHANT_A,
      customZip(customManifest()),
    );
    expect(
      await codeOf(
        setPluginPackageEnabled(
          db.asClient(),
          MERCHANT_B,
          res.packageId,
          false,
          ACTOR,
        ),
      ),
    ).toBe("package.not_found");
    expect(
      await codeOf(
        uninstallPluginPackage(db.asClient(), MERCHANT_B, res.packageId, ACTOR),
      ),
    ).toBe("package.not_found");
    // A's rows untouched by B's attempts.
    expect(
      db.rows("marketplace_installs").find((r) => r.id === res.packageId)
        ?.status,
    ).toBe("installed");
    // B installing the same bytes gets fully separate rows + assets.
    const bRes = await installPlugin(
      db,
      MERCHANT_B,
      customZip(customManifest()),
    );
    expect(bRes.packageId).not.toBe(res.packageId);
    await uninstallPluginPackage(
      db.asClient(),
      MERCHANT_B,
      bRes.packageId,
      ACTOR,
    );
    expect(
      db
        .rows("marketplace_installs")
        .filter((r) => r.merchant_id === MERCHANT_A),
    ).toHaveLength(1);
    expect(
      db.rows("theme_assets").every((a) => a.merchant_id === MERCHANT_A),
    ).toBe(true);
  });
});

/* ---------------------------------------------------------------- K1 cases
 *
 * K1 — official plugin catalogue + parity (cases only): the three official
 * entries (Reviews, Analytics, WhatsApp Orders) list as catalogue rows
 * pointing at internally-built artifacts, and install through the NORMAL
 * `installPackage` pipeline — same validators, same ledger, same asset
 * namespace, same enable path as uploads. No downloadable artifacts, no
 * separate official path.
 */

import {
  OFFICIAL_PLUGIN_KEYS,
  STORE_ANALYTICS_MANIFEST,
  isOfficialPluginKey,
  officialPluginPinFor,
  officialPluginSource,
} from "./official-plugins";
import {
  __setOfficialPluginArtifactProviderForTests,
  installOfficialPlugin,
  listOfficialPluginCatalog,
} from "./official-plugins.server";
import { artifactIdFor } from "./package-install.server";
import { validateBundle } from "./marketplace-scopes";

/* ------------------------------------------------- PLUGIN UPLOAD lane
 *
 * PLUGIN UPLOAD — server fn + admin surface (cases only): the plugins desk
 * drop-zone had validation messaging with zero server path. `installUploadedPlugin`
 * (behind `pluginUploadFn`) is the server path: authoritative archive checks
 * (extension, size, magic bytes), then the bytes ride the NORMAL
 * `installPackage` pipeline (kind "plugin", strict `pkg1PluginValidator`) plus
 * the host projection (`upsertPlugin`), so uploads render and toggle like any
 * pipeline install. [A] burden applies: deny + replay + enable, not just the
 * happy path.
 */
import {
  installUploadedPlugin,
  MAX_PLUGIN_UPLOAD_BYTES,
} from "./plugins.functions";

const toB64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

function uploadPlugin(
  db: ReturnType<typeof fakeDb>,
  merchant: string,
  opts: {
    fileName?: string;
    fileBase64?: string;
    key?: string;
    manifest?: Record<string, unknown>;
  } = {},
) {
  const bytes = opts.fileBase64
    ? opts.fileBase64
    : toB64(customZip(opts.manifest ?? customManifest()));
  return installUploadedPlugin(
    db.asClient(),
    merchant,
    {
      fileName: opts.fileName ?? "acme-reviews.zip",
      fileBase64: bytes,
      idempotencyKey: opts.key ?? key(),
    },
    ACTOR,
  );
}

describe("PLUGIN UPLOAD installs through the pipeline + host projection", () => {
  it("installs a valid zip: ledger row + namespaced assets + host row, enabled", async () => {
    const db = pkgDb();
    const out = await uploadPlugin(db, MERCHANT_A);
    expect(out.alreadyInstalled).toBe(false);
    expect(out.slug).toBe("acme-reviews");
    expect(out.version).toBe("1.0.0");

    const ledger = db.rows("marketplace_installs");
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      id: out.installId,
      kind: "widget",
      listing_slug: "acme-reviews",
      status: "installed",
      idempotency_key: expect.any(String),
    });
    expect(
      db
        .rows("theme_assets")
        .every((a) => (a.name as string).startsWith("plugins/acme-reviews/")),
    ).toBe(true);

    // Host projection: the upload renders + toggles like any pipeline install.
    const installed = await listInstalledPlugins(
      db.asClient() as never,
      MERCHANT_A,
    );
    const found = installed.find((p) => p.manifest.id === "acme-reviews")!;
    expect(found.enabled).toBe(true);
    expect(
      resolvePluginWidget("plugin:acme-reviews/reviews", installed).ok,
    ).toBe(true);
  });

  it("deny: rejects a non-zip extension without writing anything", async () => {
    const db = pkgDb();
    const err = await uploadPlugin(db, MERCHANT_A, {
      fileName: "plugin.tar.gz",
    }).catch((e) => e);
    expect(err?.code).toBe("plugin.upload_name");
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("theme_assets")).toHaveLength(0);
    expect(db.rows("plugin_state")).toHaveLength(0);
  });

  it("deny: rejects empty bytes without writing anything", async () => {
    const db = pkgDb();
    const err = await installUploadedPlugin(
      db.asClient(),
      MERCHANT_A,
      { fileName: "empty.zip", fileBase64: "", idempotencyKey: key() },
      ACTOR,
    ).catch((e) => e);
    expect(err?.code).toBe("plugin.upload_empty");
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("plugin_state")).toHaveLength(0);
  });

  it("deny: rejects bytes without the zip magic without writing anything", async () => {
    const db = pkgDb();
    const notZip = Buffer.from("hello world, not a zip").toString("base64");
    const err = await installUploadedPlugin(
      db.asClient(),
      MERCHANT_A,
      { fileName: "evil.zip", fileBase64: notZip, idempotencyKey: key() },
      ACTOR,
    ).catch((e) => e);
    expect(err?.code).toBe("plugin.upload_magic");
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("theme_assets")).toHaveLength(0);
    expect(db.rows("plugin_state")).toHaveLength(0);
  });

  it("deny: rejects a manifest-invalid zip without writing anything", async () => {
    const db = pkgDb();
    const err = await uploadPlugin(db, MERCHANT_A, {
      manifest: { ...customManifest(), id: "bad!!" },
    }).catch((e) => e);
    expect(err?.code).toBe("package.manifest_invalid");
    const badVersion = await uploadPlugin(db, MERCHANT_A, {
      manifest: { ...customManifest(), version: "banana" },
    }).catch((e) => e);
    expect(badVersion?.code).toBe("package.bad_version");
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("theme_assets")).toHaveLength(0);
    expect(db.rows("plugin_state")).toHaveLength(0);
  });

  it("deny: rejects oversized archives without writing anything", async () => {
    const db = pkgDb();
    const big = Buffer.alloc(MAX_PLUGIN_UPLOAD_BYTES + 1).toString("base64");
    const err = await installUploadedPlugin(
      db.asClient(),
      MERCHANT_A,
      { fileName: "huge.zip", fileBase64: big, idempotencyKey: key() },
      ACTOR,
    ).catch((e) => e);
    expect(err?.code).toBe("plugin.upload_too_large");
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("theme_assets")).toHaveLength(0);
    expect(db.rows("plugin_state")).toHaveLength(0);
  });

  it("replay: the same idempotency key returns the original install, never a duplicate", async () => {
    const db = pkgDb();
    const k = key();
    const first = await uploadPlugin(db, MERCHANT_A, { key: k });
    const second = await uploadPlugin(db, MERCHANT_A, { key: k });
    expect(second.alreadyInstalled).toBe(true);
    expect(second.installId).toBe(first.installId);
    expect(second.slug).toBe("acme-reviews");
    expect(db.rows("marketplace_installs")).toHaveLength(1);
    expect(
      db.rows("plugin_state").filter((r) => r.merchant_id === MERCHANT_A),
    ).toHaveLength(1);
  });

  it("enable: the upload travels the shared enable path after install", async () => {
    const db = pkgDb();
    const out = await uploadPlugin(db, MERCHANT_A);
    const paused = await setPluginPackageEnabled(
      db.asClient(),
      MERCHANT_A,
      out.installId,
      false,
      ACTOR,
    );
    expect(paused.status).toBe("paused");
    expect(
      db.rows("marketplace_installs").find((r) => r.id === out.installId)
        ?.status,
    ).toBe("paused");
    const enabled = await setPluginPackageEnabled(
      db.asClient(),
      MERCHANT_A,
      out.installId,
      true,
      ACTOR,
    );
    expect(enabled.status).toBe("installed");
  });

  it("deny: a foreign merchant's rows are untouched (tenant isolation)", async () => {
    const db = pkgDb();
    const mine = await uploadPlugin(db, MERCHANT_A, { key: key() });
    await uploadPlugin(db, MERCHANT_B, { key: key() });
    expect(
      db.rows("marketplace_installs").filter((r) => r.merchant_id === MERCHANT_A),
    ).toHaveLength(1);
    expect(
      db.rows("marketplace_installs").find((r) => r.id === mine.installId)
        ?.merchant_id,
    ).toBe(MERCHANT_A);
  });
});

describe("K1 official plugin catalogue shape", () => {
  it("names exactly the three official keys, nothing else", () => {
    expect([...OFFICIAL_PLUGIN_KEYS]).toEqual([
      "product-reviews",
      "store-analytics",
      "whatsapp-chat",
    ]);
    for (const key of OFFICIAL_PLUGIN_KEYS) {
      expect(isOfficialPluginKey(key)).toBe(true);
      expect(officialPluginPinFor(key)).toBe(`official:${key}`);
    }
    // Other builtins and unknown keys are community, never official.
    for (const key of ["loyalty-lite", "social-proof", "vapor", ""]) {
      expect(isOfficialPluginKey(key)).toBe(false);
    }
  });

  it("backs Reviews + WhatsApp Orders in builtin manifest data", () => {
    const reviews = officialPluginSource("product-reviews")!;
    expect(reviews).toMatchObject({
      key: "product-reviews",
      author: "Framique",
    });
    expect(
      (reviews.manifest as { id: string }).id,
    ).toBe("product-reviews");
    const wa = officialPluginSource("whatsapp-chat")!;
    expect(
      (wa.manifest as { id: string }).id,
    ).toBe("whatsapp-chat");
    expect(officialPluginSource("loyalty-lite")).toBeNull();
    expect(officialPluginSource("vapor")).toBeNull();
  });

  it("lists official rows in order with artifact refs over exporter-built bytes", async () => {
    const entries = await listOfficialPluginCatalog();
    expect(entries.map((e) => e.row.key)).toEqual([
      "product-reviews",
      "store-analytics",
      "whatsapp-chat",
    ]);
    for (const entry of entries) {
      expect(entry.row.provenance).toBe("official");
      expect(entry.row.artifact.pinned).toBe(`official:${entry.row.key}`);
      expect(entry.row.artifact.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.row.artifact.fileName).toBe(`${entry.row.key}.zip`);
      // The row points at the internally-built artifact: the checksum is the
      // pipeline identity of the exact bytes the install will run.
      expect(entry.row.artifact.checksum).toBe(artifactIdFor(entry.bytes));
      expect(entry.row.version).toBe(entry.version);
      expect(entry.bytes.length).toBeGreaterThan(0);
    }
    // Reviews + WhatsApp rows rebuild byte-identical from the builtin exporter.
    const reviews = entries[0]!;
    expect(artifactIdFor(reviews.bytes)).toBe(
      artifactIdFor(exportBuiltinPluginZip("product-reviews")),
    );
    const analytics = entries[1]!;
    expect(artifactIdFor(analytics.bytes)).toBe(
      artifactIdFor(exportPluginManifestZip(STORE_ANALYTICS_MANIFEST)),
    );
  });

  it("passes the authored Analytics source through the real install gates", () => {
    const parsed = parseManifest(STORE_ANALYTICS_MANIFEST);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("analytics manifest rejected");
    expect(
      validateBundle(STORE_ANALYTICS_MANIFEST, parsed.manifest.permissions).ok,
    ).toBe(true);
    const seam = pkg1PluginValidator(STORE_ANALYTICS_MANIFEST, "plugin");
    expect(seam.ok).toBe(true);
    if (seam.ok) expect(seam.manifest.slug).toBe("store-analytics");
    const bytes = exportPluginManifestZip(STORE_ANALYTICS_MANIFEST);
    const layout = validatePackageLayout(
      extractPackageFiles(bytes, parseZip(bytes)),
      "plugin",
    );
    expect(parseManifest(layout.manifest).ok).toBe(true);
  });

  it("a broken build for one key hides that key, never the section", async () => {
    __setOfficialPluginArtifactProviderForTests(async (key) => {
      if (key === "whatsapp-chat") throw new Error("build exploded");
      const { exportBuiltinPluginZip: zip } = await import("./plugin-package");
      const { artifactIdFor: hash } = await import("./package-install.server");
      const source = officialPluginSource(key)!;
      const bytes =
        key === "store-analytics"
          ? exportPluginManifestZip(source.manifest)
          : zip(key);
      const checksum = hash(bytes);
      const gated = parseManifest(source.manifest) as {
        ok: true;
        manifest: { version: string };
      };
      return {
        row: {
          key,
          name: source.nameEn,
          summary: source.summaryEn,
          author: source.author,
          category: source.category,
          version: gated.manifest.version,
          provenance: "official" as const,
          artifact: {
            checksum,
            version: gated.manifest.version,
            fileName: `${key}.zip`,
            pinned: officialPluginPinFor(key),
          },
        },
        version: gated.manifest.version,
        bytes,
        manifest: source.manifest,
        artifact: {
          checksum,
          version: gated.manifest.version,
          fileName: `${key}.zip`,
          pinned: officialPluginPinFor(key),
        },
      };
    });
    try {
      const entries = await listOfficialPluginCatalog();
      expect(entries.map((e) => e.row.key)).toEqual([
        "product-reviews",
        "store-analytics",
      ]);
    } finally {
      __setOfficialPluginArtifactProviderForTests(null);
    }
  });

  it("refuses unknown keys without writing anything", async () => {
    const db = pkgDb();
    expect(await codeOf(installOfficialPlugin(db.asClient(), MERCHANT_A, "vapor"))).toMatch(
      /plugin\.official_unknown/,
    );
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("theme_assets")).toHaveLength(0);
    expect(db.rows("plugin_state")).toHaveLength(0);
  });
});

describe("K1 official install runs the normal installPackage pipeline", () => {
  it("installs Reviews with ledger + namespaced assets + host row + official pin", async () => {
    const db = pkgDb();
    const out = await installOfficialPlugin(
      db.asClient(),
      MERCHANT_A,
      "product-reviews",
      ACTOR,
    );
    expect(out.alreadyInstalled).toBe(false);
    expect(out.version).toBe("2.1.0");
    expect(out.artifactId).toHaveLength(64);

    const ledger = db.rows("marketplace_installs");
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      kind: "widget",
      listing_slug: "product-reviews",
      listing_name: "Verified Product Reviews",
      status: "installed",
      // The pipeline hashed the exact official bytes…
      artifact_checksum: artifactIdFor(
        exportBuiltinPluginZip("product-reviews"),
      ),
      artifact_version: "2.1.0",
      // …stamped with the official provenance marker, not `upload`.
      artifact_pinned: "official:product-reviews",
    });
    // Namespaced assets, never the global tree.
    const assets = db.rows("theme_assets");
    expect(assets.length).toBeGreaterThan(0);
    expect(
      assets.every((a) =>
        (a.name as string).startsWith("plugins/product-reviews/"),
      ),
    ).toBe(true);
    // Same audit action as uploads.
    expect(
      db.rows("theme_audit").filter((r) => r.action === "package.installed"),
    ).toHaveLength(1);
    // Host projection: the install renders like any pipeline install.
    const installed = await listInstalledPlugins(
      db.asClient() as never,
      MERCHANT_A,
    );
    const found = installed.find((p) => p.manifest.id === "product-reviews")!;
    expect(found.enabled).toBe(true);
    expect(
      resolvePluginWidget("plugin:product-reviews/reviews_carousel", installed)
        .ok,
    ).toBe(true);
  });

  it("official install is indistinguishable from a custom install past the artifact source", async () => {
    const db = pkgDb();
    const bytes = exportBuiltinPluginZip("whatsapp-chat");
    await installOfficialPlugin(db.asClient(), MERCHANT_A, "whatsapp-chat", ACTOR);
    // Upload-equivalent: the same bytes through installPackage directly.
    await installPackage(
      db.asClient(),
      MERCHANT_B,
      {
        kind: "plugin",
        fileName: "whatsapp-chat.zip",
        bytes,
        idempotencyKey: "upload-equivalent-key",
      },
      ACTOR,
    );
    const ledger = db.rows("marketplace_installs");
    expect(ledger).toHaveLength(2);
    // Same audit action, same asset namespace family.
    expect(
      db.rows("theme_audit").filter((r) => r.action === "package.installed"),
    ).toHaveLength(2);
    expect(
      db
        .rows("theme_assets")
        .every((a) => (a.name as string).startsWith("plugins/whatsapp-chat/")),
    ).toBe(true);
    // Same ledger shape; only identity + provenance marker differ.
    const strip = (r: Record<string, unknown>) => {
      const {
        id,
        idempotency_key,
        artifact_pinned,
        merchant_id,
        created_at,
        ...rest
      } = r;
      void id;
      void idempotency_key;
      void artifact_pinned;
      void merchant_id;
      void created_at;
      return rest;
    };
    const [official, custom] = ledger as Record<string, unknown>[];
    expect(strip(custom!)).toEqual(strip(official!));
    expect(official!.artifact_pinned).toBe("official:whatsapp-chat");
    expect(custom!.artifact_pinned).toBe("upload");
    expect(official!.artifact_checksum).toBe(custom!.artifact_checksum);
  });

  it("installs Analytics end to end with its authored artifact", async () => {
    const db = pkgDb();
    const out = await installOfficialPlugin(
      db.asClient(),
      MERCHANT_A,
      "store-analytics",
      ACTOR,
    );
    expect(out.version).toBe("1.0.0");
    expect(db.rows("marketplace_installs")[0]).toMatchObject({
      listing_slug: "store-analytics",
      status: "installed",
      artifact_checksum: artifactIdFor(
        exportPluginManifestZip(STORE_ANALYTICS_MANIFEST),
      ),
      artifact_pinned: "official:store-analytics",
    });
    const installed = await listInstalledPlugins(
      db.asClient() as never,
      MERCHANT_A,
    );
    expect(
      resolvePluginWidget("plugin:store-analytics/sales_overview", installed).ok,
    ).toBe(true);
  });

  it("replays the official ledger key instead of stacking rows", async () => {
    const db = pkgDb();
    const first = await installOfficialPlugin(
      db.asClient(),
      MERCHANT_A,
      "product-reviews",
      ACTOR,
    );
    const second = await installOfficialPlugin(
      db.asClient(),
      MERCHANT_A,
      "product-reviews",
      ACTOR,
    );
    expect(second.alreadyInstalled).toBe(true);
    expect(second.packageId).toBe(first.packageId);
    expect(db.rows("marketplace_installs")).toHaveLength(1);
  });

  it("travels the shared enable path after install", async () => {
    const db = pkgDb();
    const out = await installOfficialPlugin(
      db.asClient(),
      MERCHANT_A,
      "whatsapp-chat",
      ACTOR,
    );
    const paused = await setPluginPackageEnabled(
      db.asClient(),
      MERCHANT_A,
      out.packageId,
      false,
      ACTOR,
    );
    expect(paused.status).toBe("paused");
    const enabled = await setPluginPackageEnabled(
      db.asClient(),
      MERCHANT_A,
      out.packageId,
      true,
      ACTOR,
    );
    expect(enabled.status).toBe("installed");
  });
});
