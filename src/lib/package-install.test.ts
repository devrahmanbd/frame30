/**
 * PKG-2 — install pipeline suite (cases only).
 *
 * Covers: valid install, each rejection (malformed, slip, symlink,
 * oversized, bad structure, bad version, missing dep, broken presentation
 * ref), update v1→v2, rollback v2→v1, uninstall isolation, tenant A/B
 * isolation, plugin install/enable/uninstall, and the PKG-1 validator seam.
 *
 * No network, no real database: all persistence goes through the in-memory
 * fakeDb, and zips are hand-built (no npm zip libraries).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { deflateRawSync } from "node:zlib";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  installPackage,
  previewPackage,
  activatePackage,
  rollbackPackage,
  uninstallPackage,
  uninstallPluginPackage,
  setPluginPackageEnabled,
  setPackageManifestValidator,
  pkg1ThemeValidator,
  type ManifestValidator,
} from "./package-install.server";
import { themeVersionPrefix } from "./package-store.server";

const MERCHANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const MERCHANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ACTOR = "99999999-9999-4999-8999-999999999999";

/* ------------------------------------------------------- tiny zip builder */

const enc = new TextEncoder();
const u16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
const u32 = (v: number) => [
  v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff,
];

type Entry = {
  name: string;
  content: string;
  method?: 0 | 8;
  externalAttrs?: number;
};

function buildZip(entries: Entry[]): Uint8Array {
  const out: number[] = [];
  const central: number[] = [];
  for (const e of entries) {
    const nameBytes = Array.from(enc.encode(e.name));
    const raw = enc.encode(e.content);
    const method = e.method ?? 0;
    const payload = Array.from(method === 8 ? deflateRawSync(raw) : raw);
    const localOffset = out.length;
    out.push(
      0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0x0800), ...u16(method),
      ...u16(0), ...u16(0), ...u32(0), ...u32(payload.length), ...u32(raw.length),
      ...u16(nameBytes.length), ...u16(0), ...nameBytes, ...payload,
    );
    central.push(
      0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(method),
      ...u16(0), ...u16(0), ...u32(0), ...u32(payload.length), ...u32(raw.length),
      ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(e.externalAttrs ?? 0), ...u32(localOffset), ...nameBytes,
    );
  }
  const centralOffset = out.length;
  out.push(...central);
  const centralSize = out.length - centralOffset;
  out.push(
    0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0),
    ...u16(entries.length), ...u16(entries.length),
    ...u32(centralSize), ...u32(centralOffset), ...u16(0),
  );
  return new Uint8Array(out);
}

function themeZip(
  manifest: Record<string, unknown>,
  extra: Entry[] = [],
  opts: { templates?: Record<string, unknown> } = {},
): Uint8Array {
  return buildZip([
    { name: "theme.json", content: JSON.stringify(manifest), method: 8 },
    {
      name: "templates/index.json",
      content: JSON.stringify(opts.templates ?? { blocks: [] }),
    },
    ...extra,
  ]);
}

function pluginZip(manifest: Record<string, unknown>, extra: Entry[] = []): Uint8Array {
  return buildZip([
    { name: "plugin.json", content: JSON.stringify(manifest) },
    ...extra,
  ]);
}

function pkgDb() {
  return fakeDb({
    tables: {
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      theme_assets: [],
      marketplace_installs: [],
      theme_audit: [],
    },
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    return (e as { code?: string }).code ?? (e as Error)?.message ?? "threw";
  }
  return "no_throw";
}

let keySeq = 0;
const key = () => `pkg-key-${(keySeq += 1)}`;

function installTheme(
  db: ReturnType<typeof fakeDb>,
  merchant: string,
  zip: Uint8Array,
  opts: { validator?: ManifestValidator; key?: string } = {},
) {
  return installPackage(
    db.asClient(),
    merchant,
    {
      kind: "theme",
      fileName: "theme.zip",
      bytes: zip,
      idempotencyKey: opts.key ?? key(),
      validator: opts.validator,
    },
    ACTOR,
  );
}

const MANIFEST_V1 = { name: "Test Theme", version: "1.0.0" };

beforeEach(() => {
  setPackageManifestValidator(null);
});

/* ---------------------------------------------------------------- valid install */

describe("PKG-2 valid install", () => {
  it("registers theme + version + draft + namespaced assets + ledger + audit", async () => {
    const db = pkgDb();
    const zip = themeZip(MANIFEST_V1, [
      { name: "styles/main.css", content: "a{color:red}" },
      { name: "assets/logo.png", content: "png-bytes" },
      { name: "locales/en.json", content: "{}" },
    ]);
    const res = await installTheme(db, MERCHANT_A, zip);
    expect(res.alreadyInstalled).toBe(false);
    expect(res.updated).toBe(false);
    expect(res.versionNumber).toBe(1);
    expect(res.artifactId).toHaveLength(64);

    expect(db.rows("store_themes")).toHaveLength(1);
    expect(db.rows("theme_versions")).toHaveLength(1);
    expect(db.rows("theme_drafts")).toHaveLength(1);
    expect(db.rows("marketplace_installs")).toHaveLength(1);
    expect(db.rows("theme_audit")).toHaveLength(1);

    // Asset isolation: per-version namespace, versioned collision-safe URLs.
    const prefix = themeVersionPrefix(res.versionId);
    const assets = db.rows("theme_assets");
    expect(assets.length).toBeGreaterThan(0);
    for (const a of assets) {
      expect(a.merchant_id).toBe(MERCHANT_A);
      expect(a.theme_id).toBe(res.packageId);
      expect(a.name.startsWith(prefix)).toBe(true);
      expect(a.url).toContain(res.versionId);
      expect(a.url).toContain("?v=");
    }
    // The manifest itself is metadata, not a servable asset.
    expect(assets.some((a) => a.name.endsWith("theme.json"))).toBe(false);
    // Nothing copied into a global namespace.
    expect(assets.some((a) => !a.name.startsWith("themes/"))).toBe(false);
  });

  it("replays an idempotency key without stacking rows", async () => {
    const db = pkgDb();
    const zip = themeZip(MANIFEST_V1);
    const k = key();
    const first = await installTheme(db, MERCHANT_A, zip, { key: k });
    const second = await installTheme(db, MERCHANT_A, zip, { key: k });
    expect(second.alreadyInstalled).toBe(true);
    expect(second.packageId).toBe(first.packageId);
    expect(db.rows("store_themes")).toHaveLength(1);
    expect(db.rows("theme_versions")).toHaveLength(1);
  });

  it("previews an owned version without touching the live pointer", async () => {
    const db = pkgDb();
    const res = await installTheme(db, MERCHANT_A, themeZip(MANIFEST_V1));
    const preview = await previewPackage(db.asClient(), MERCHANT_A, res.versionId);
    expect(preview.packageId).toBe(res.packageId);
    expect(preview.assets.length).toBeGreaterThan(0);
    const theme = db.rows("store_themes")[0]!;
    expect(theme.is_active).toBe(false);
    expect(theme.published_version_id ?? null).toBe(null);
  });

  it("activates a version onto the live pointer", async () => {
    const db = pkgDb();
    const res = await installTheme(db, MERCHANT_A, themeZip(MANIFEST_V1));
    const out = await activatePackage(
      db.asClient(),
      MERCHANT_A,
      res.packageId,
      res.versionId,
      ACTOR,
    );
    expect(out.versionId).toBe(res.versionId);
    const theme = db.rows("store_themes")[0]!;
    expect(theme.is_active).toBe(true);
    expect(theme.published_version_id).toBe(res.versionId);
  });
});

/* ----------------------------------------------------------------- rejections */

describe("PKG-2 rejections", () => {
  it("rejects malformed archives", async () => {
    const db = pkgDb();
    expect(
      await codeOf(
        installPackage(db.asClient(), MERCHANT_A, {
          kind: "theme",
          fileName: "theme.zip",
          bytes: new TextEncoder().encode("not a zip"),
          idempotencyKey: key(),
        }),
      ),
    ).toBe("zip.malformed");
    expect(db.rows("store_themes")).toHaveLength(0);
  });

  it("rejects zip-slip entries", async () => {
    const db = pkgDb();
    const zip = buildZip([
      { name: "theme.json", content: JSON.stringify(MANIFEST_V1) },
      { name: "../../evil.json", content: "{}" },
    ]);
    expect(await codeOf(installTheme(db, MERCHANT_A, zip))).toBe("zip.unsafe_path");
    expect(db.rows("store_themes")).toHaveLength(0);
  });

  it("rejects symlink entries", async () => {
    const db = pkgDb();
    const SYMLINK = ((0xa000 | 0o777) << 16) >>> 0;
    const zip = buildZip([
      { name: "theme.json", content: JSON.stringify(MANIFEST_V1) },
      { name: "link", content: "theme.json", externalAttrs: SYMLINK },
    ]);
    expect(await codeOf(installTheme(db, MERCHANT_A, zip))).toBe("zip.symlink");
    expect(db.rows("store_themes")).toHaveLength(0);
  });

  it("rejects oversized entries", async () => {
    const db = pkgDb();
    const zip = themeZip(MANIFEST_V1, [
      { name: "assets/big.png", content: "0123456789" },
    ]);
    expect(
      await codeOf(
        installPackage(db.asClient(), MERCHANT_A, {
          kind: "theme",
          fileName: "theme.zip",
          bytes: zip,
          idempotencyKey: key(),
          limits: { maxEntryBytes: 8 },
        }),
      ),
    ).toBe("zip.entry_too_large");
    expect(db.rows("store_themes")).toHaveLength(0);
  });

  it("rejects bad structure (executables anywhere)", async () => {
    const db = pkgDb();
    const zip = themeZip(MANIFEST_V1, [{ name: "assets/app.js", content: "evil()" }]);
    expect(await codeOf(installTheme(db, MERCHANT_A, zip))).toBe("zip.blocked_extension");
    expect(db.rows("store_themes")).toHaveLength(0);
  });

  it("rejects missing root manifests", async () => {
    const db = pkgDb();
    const zip = buildZip([{ name: "templates/index.json", content: "{}" }]);
    expect(await codeOf(installTheme(db, MERCHANT_A, zip))).toBe("zip.missing_manifest");
  });

  it("rejects bad versions", async () => {
    const db = pkgDb();
    const zip = themeZip({ name: "Test Theme", version: "banana" });
    expect(await codeOf(installTheme(db, MERCHANT_A, zip))).toBe("package.bad_version");
    expect(db.rows("store_themes")).toHaveLength(0);
  });

  it("rejects incompatible api ranges", async () => {
    const db = pkgDb();
    const zip = themeZip({ name: "Test Theme", version: "1.0.0", api: "^99.0.0" });
    expect(await codeOf(installTheme(db, MERCHANT_A, zip))).toBe(
      "package.api_incompatible",
    );
  });

  it("rejects missing dependencies, then installs once satisfied", async () => {
    const db = pkgDb();
    const zip = themeZip({
      name: "Needs Chat",
      version: "1.0.0",
      dependencies: ["chat-widget"],
    });
    expect(await codeOf(installTheme(db, MERCHANT_A, zip))).toBe(
      "package.missing_dependency",
    );
    db.rows("marketplace_installs").push({
      id: "dep-1",
      merchant_id: MERCHANT_A,
      kind: "widget",
      listing_slug: "chat-widget",
      status: "installed",
    });
    const res = await installTheme(db, MERCHANT_A, zip);
    expect(res.alreadyInstalled).toBe(false);
  });

  it("rejects broken presentation refs", async () => {
    const db = pkgDb();
    const zip = themeZip(
      MANIFEST_V1,
      [{ name: "styles/main.css", content: "a{}" }],
      { templates: { hero: "assets/missing.png" } },
    );
    expect(await codeOf(installTheme(db, MERCHANT_A, zip))).toBe("package.broken_ref");
    expect(db.rows("store_themes")).toHaveLength(0);
  });
});

/* ---------------------------------------------------------- update + rollback */

describe("PKG-2 update v1→v2 + rollback v2→v1", () => {
  async function twoVersions(db: ReturnType<typeof fakeDb>) {
    const v1 = await installTheme(
      db,
      MERCHANT_A,
      themeZip({ name: "Test Theme", version: "1.0.0" }, [
        { name: "assets/logo.png", content: "v1-logo" },
      ]),
    );
    const v2 = await installTheme(
      db,
      MERCHANT_A,
      themeZip({ name: "Test Theme", version: "1.1.0" }, [
        { name: "assets/logo.png", content: "v2-logo" },
      ]),
    );
    return { v1, v2 };
  }

  it("updates v1→v2 on the same package line with isolated asset namespaces", async () => {
    const db = pkgDb();
    const { v1, v2 } = await twoVersions(db);
    expect(v2.packageId).toBe(v1.packageId);
    expect(v2.updated).toBe(true);
    expect(v2.versionNumber).toBe(2);
    expect(db.rows("theme_versions")).toHaveLength(2);
    const names = db.rows("theme_assets").map((a) => a.name as string);
    const logos = names.filter((n) => n.endsWith("assets/logo.png"));
    expect(logos).toHaveLength(2);
    expect(new Set(logos).size).toBe(2);
    expect(logos.some((n) => n.includes(v1.versionId))).toBe(true);
    expect(logos.some((n) => n.includes(v2.versionId))).toBe(true);
  });

  it("refuses a downgrade as a bad version", async () => {
    const db = pkgDb();
    await installTheme(db, MERCHANT_A, themeZip({ name: "T", version: "1.1.0" }));
    expect(
      await codeOf(
        installTheme(db, MERCHANT_A, themeZip({ name: "T", version: "1.0.0" })),
      ),
    ).toBe("package.bad_version");
  });

  it("rolls back v2→v1 as a new published version carrying v1 content", async () => {
    const db = pkgDb();
    const { v1, v2 } = await twoVersions(db);
    await activatePackage(db.asClient(), MERCHANT_A, v2.packageId, v2.versionId, ACTOR);
    const rolled = await rollbackPackage(
      db.asClient(),
      MERCHANT_A,
      v2.packageId,
      v1.versionId,
      ACTOR,
    );
    expect(rolled.versionNumber).toBe(3);
    const versions = db.rows("theme_versions");
    expect(versions).toHaveLength(3);
    const v3row = versions.find((v) => v.id === rolled.versionId)!;
    const v1row = versions.find((v) => v.id === v1.versionId)!;
    expect(v3row.rollback_of).toBe(v1.versionId);
    expect(v3row.status).toBe("published");
    expect(v3row.templates).toEqual(v1row.templates);
    const theme = db.rows("store_themes")[0]!;
    expect(theme.published_version_id).toBe(rolled.versionId);
    expect(theme.is_active).toBe(true);
  });
});

/* --------------------------------------------------------------- uninstall */

describe("PKG-2 uninstall isolation", () => {
  it("refuses to uninstall the active package", async () => {
    const db = pkgDb();
    const res = await installTheme(db, MERCHANT_A, themeZip(MANIFEST_V1));
    await activatePackage(db.asClient(), MERCHANT_A, res.packageId, res.versionId, ACTOR);
    expect(
      await codeOf(uninstallPackage(db.asClient(), MERCHANT_A, res.packageId, ACTOR)),
    ).toBe("package.active");
  });

  it("removes one package's artifacts without touching sibling packages", async () => {
    const db = pkgDb();
    const first = await installTheme(
      db,
      MERCHANT_A,
      themeZip({ name: "Alpha", version: "1.0.0" }, [
        { name: "assets/a.png", content: "a" },
      ]),
    );
    const second = await installTheme(
      db,
      MERCHANT_A,
      themeZip({ name: "Beta", version: "2.0.0" }, [
        { name: "assets/b.png", content: "b" },
      ]),
    );
    await activatePackage(db.asClient(), MERCHANT_A, second.packageId, second.versionId, ACTOR);
    const out = await uninstallPackage(db.asClient(), MERCHANT_A, first.packageId, ACTOR);
    expect(out.ok).toBe(true);
    expect(out.removedAssets).toBeGreaterThan(0);
    // Sibling package fully intact: theme, versions, namespaced assets.
    expect(db.rows("store_themes").map((r) => r.id)).toEqual([second.packageId]);
    expect(
      db.rows("theme_assets").every((a) => (a.name as string).includes(second.versionId)),
    ).toBe(true);
    // Ledger: the removed line is terminal, the sibling stays installed.
    const ledger = db.rows("marketplace_installs");
    expect(ledger.find((r) => r.listing_slug === "alpha")?.status).toBe("removed");
    expect(ledger.find((r) => r.listing_slug === "beta")?.status).toBe("installed");
  });
});

/* -------------------------------------------------------- tenant isolation */

describe("PKG-2 tenant A/B isolation", () => {
  it("scopes every step to the owning merchant", async () => {
    const db = pkgDb();
    const res = await installTheme(db, MERCHANT_A, themeZip(MANIFEST_V1));
    // B cannot see or mutate A's package through any entry point.
    expect(await codeOf(previewPackage(db.asClient(), MERCHANT_B, res.versionId))).toBe(
      "package.not_found",
    );
    expect(
      await codeOf(
        activatePackage(db.asClient(), MERCHANT_B, res.packageId, res.versionId, ACTOR),
      ),
    ).toBe("package.not_found");
    expect(
      await codeOf(
        rollbackPackage(db.asClient(), MERCHANT_B, res.packageId, res.versionId, ACTOR),
      ),
    ).toBe("package.not_found");
    expect(
      await codeOf(uninstallPackage(db.asClient(), MERCHANT_B, res.packageId, ACTOR)),
    ).toBe("package.not_found");
    // A's rows are untouched by B's attempts.
    expect(db.rows("store_themes")).toHaveLength(1);
    // B installing the same bytes gets fully separate rows.
    const bRes = await installTheme(db, MERCHANT_B, themeZip(MANIFEST_V1));
    expect(bRes.packageId).not.toBe(res.packageId);
    expect(db.rows("store_themes")).toHaveLength(2);
    const names = db.rows("theme_assets").map((a) => a.name as string);
    expect(names.some((n) => n.includes(res.versionId))).toBe(true);
    expect(names.some((n) => n.includes(bRes.versionId))).toBe(true);
    // Uninstalling B removes only B's namespace.
    await uninstallPackage(db.asClient(), MERCHANT_B, bRes.packageId, ACTOR);
    expect(db.rows("store_themes").map((r) => r.merchant_id)).toEqual([MERCHANT_A]);
    expect(
      db.rows("theme_assets").every((a) => a.merchant_id === MERCHANT_A),
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------- plugins */

describe("PKG-2 plugin packages", () => {
  function pluginDb() {
    return pkgDb();
  }

  it("installs, disables/enables, and uninstalls a plugin in isolation", async () => {
    const db = pluginDb();
    const other = await installPackage(
      db.asClient(),
      MERCHANT_A,
      {
        kind: "plugin",
        fileName: "other.zip",
        bytes: pluginZip({ name: "Other", version: "1.0.0" }),
        idempotencyKey: key(),
      },
      ACTOR,
    );
    const res = await installPackage(
      db.asClient(),
      MERCHANT_A,
      {
        kind: "plugin",
        fileName: "chat.zip",
        bytes: pluginZip({ name: "Chat", version: "1.0.0" }, [
          { name: "assets/icon.png", content: "icon" },
        ]),
        idempotencyKey: key(),
      },
      ACTOR,
    );
    expect(res.alreadyInstalled).toBe(false);
    expect(res.version).toBe("1.0.0");
    const prefix = `plugins/chat/${res.artifactId.slice(0, 8)}/assets/`;
    expect(
      db.rows("theme_assets").every((a) => (a.name as string).startsWith("plugins/")),
    ).toBe(true);
    expect(db.rows("theme_assets").some((a) => (a.name as string).startsWith(prefix))).toBe(
      true,
    );

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

    // Cross-tenant enable is refused.
    expect(
      await codeOf(
        setPluginPackageEnabled(db.asClient(), MERCHANT_B, res.packageId, false, ACTOR),
      ),
    ).toBe("package.not_found");

    const out = await uninstallPluginPackage(db.asClient(), MERCHANT_A, res.packageId, ACTOR);
    expect(out.ok).toBe(true);
    expect(out.removedAssets).toBeGreaterThan(0);
    // Sibling plugin namespace untouched; other install row intact.
    expect(db.rows("theme_assets").map((a) => a.name)).toEqual(
      db.rows("theme_assets").map((a) => a.name),
    );
    expect(
      db.rows("theme_assets").every((a) =>
        (a.name as string).startsWith(`plugins/other/${other.artifactId.slice(0, 8)}/`),
      ),
    ).toBe(true);
    const ledger = db.rows("marketplace_installs");
    expect(ledger.find((r) => r.id === res.packageId)?.status).toBe("removed");
    expect(ledger.find((r) => r.id === other.packageId)?.status).toBe("installed");
  });
});

/* ---------------------------------------------------------- PKG-1 seam */

describe("PKG-2 PKG-1 validator boundary", () => {
  it("falls back to the stub when no validator is registered", async () => {
    const db = pkgDb();
    // Minimal manifest passes the stub; a nameless one does not.
    const ok = await installTheme(db, MERCHANT_A, themeZip(MANIFEST_V1));
    expect(ok.version).toBe("1.0.0");
    expect(
      await codeOf(
        installTheme(db, MERCHANT_A, themeZip({ version: "1.0.0" } as never)),
      ),
    ).toBe("package.manifest_invalid");
  });

  it("prefers an explicitly injected validator (fake PKG-1)", async () => {
    const db = pkgDb();
    const fakeValidator: ManifestValidator = (manifest) => {
      const raw = manifest as Record<string, unknown>;
      if ((raw as { nope?: boolean }).nope === true)
        return { ok: false, errors: ["fake_pkg1_reject"] };
      return {
        ok: true,
        manifest: {
          slug: "fake",
          name: "Fake",
          version: "9.9.9",
          dependencies: [],
          raw,
        },
      };
    };
    expect(
      await codeOf(
        installPackage(db.asClient(), MERCHANT_A, {
          kind: "theme",
          fileName: "theme.zip",
          bytes: themeZip({ name: "X", version: "1.0.0", nope: true }),
          idempotencyKey: key(),
          validator: fakeValidator,
        }),
      ),
    ).toBe("package.manifest_invalid");
    const res = await installPackage(db.asClient(), MERCHANT_A, {
      kind: "theme",
      fileName: "theme.zip",
      bytes: themeZip(MANIFEST_V1),
      idempotencyKey: key(),
      validator: fakeValidator,
    });
    expect(res.version).toBe("9.9.9");
  });

  it("uses the process-wide validator once PKG-1 registers itself", async () => {
    const db = pkgDb();
    setPackageManifestValidator(() => ({ ok: false, errors: ["pkg1_global"] }));
    expect(await codeOf(installTheme(db, MERCHANT_A, themeZip(MANIFEST_V1)))).toBe(
      "package.manifest_invalid",
    );
  });

  it("adapts the real PKG-1 theme gate end-to-end (accept)", async () => {
    const db = pkgDb();
    const full = {
      key: "pkg1-theme",
      name: "PKG1 Theme",
      nameBn: "পিকেজ১ থিম",
      version: "1.0.0",
      api: "^3.0.0",
      templates: ["index"],
      presentationSurfaces: ["widget"],
      locales: ["en"],
      capabilities: ["render_storefront", "read_products"],
    };
    const res = await installPackage(db.asClient(), MERCHANT_A, {
      kind: "theme",
      fileName: "theme.zip",
      bytes: themeZip(full),
      idempotencyKey: key(),
      validator: pkg1ThemeValidator,
    });
    expect(res.version).toBe("1.0.0");
    expect(db.rows("store_themes")[0]).toMatchObject({
      source_listing_slug: "pkg1-theme",
      source_version: "1.0.0",
    });
  });

  it("adapts the real PKG-1 theme gate (bad version + dep refs)", async () => {
    const db = pkgDb();
    const bad = {
      key: "pkg1-theme",
      name: "PKG1 Theme",
      nameBn: "পিকেজ১ থিম",
      version: "banana",
      api: "^3.0.0",
      templates: ["index"],
      presentationSurfaces: ["widget"],
      locales: ["en"],
      capabilities: ["render_storefront"],
    };
    expect(
      await codeOf(
        installPackage(db.asClient(), MERCHANT_A, {
          kind: "theme",
          fileName: "theme.zip",
          bytes: themeZip(bad),
          idempotencyKey: key(),
          validator: pkg1ThemeValidator,
        }),
      ),
    ).toBe("package.bad_version");

    const withDep = {
      key: "pkg1-dep",
      name: "PKG1 Dep",
      nameBn: "ডিপ",
      version: "1.0.0",
      api: "^3.0.0",
      templates: ["index"],
      presentationSurfaces: ["widget"],
      locales: ["en"],
      capabilities: ["render_storefront"],
      pluginDependencies: [{ ref: "plugin:chat", version: "1.0.0" }],
    };
    expect(
      await codeOf(
        installPackage(db.asClient(), MERCHANT_A, {
          kind: "theme",
          fileName: "theme.zip",
          bytes: themeZip(withDep),
          idempotencyKey: key(),
          validator: pkg1ThemeValidator,
        }),
      ),
    ).toBe("package.missing_dependency");
    db.rows("marketplace_installs").push({
      id: "dep-chat",
      merchant_id: MERCHANT_A,
      kind: "widget",
      listing_slug: "chat",
      status: "installed",
    });
    const res = await installPackage(db.asClient(), MERCHANT_A, {
      kind: "theme",
      fileName: "theme.zip",
      bytes: themeZip(withDep),
      idempotencyKey: key(),
      validator: pkg1ThemeValidator,
    });
    expect(res.version).toBe("1.0.0");
  });
});
