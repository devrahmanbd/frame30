/**
 * LIFECYCLE lane — full package lifecycle proof (contract-level, vitest only).
 *
 * One sequential chain per kind, end to end on the same rows:
 * upload/install → preview → activate → update → rollback → delete.
 *
 * - custom theme: pure `installPackage` pipeline (ZIP bytes in, version line
 *   out) through `previewPackage` / `activatePackage` / `rollbackPackage` /
 *   `uninstallPackage`.
 * - official theme: `installOfficialTheme` (internally-built artifact through
 *   the NORMAL pipeline) then the admin UI server fns (`activateTheme`,
 *   `deleteTheme`) on those pipeline rows — proving the console operates the
 *   pipeline rows it lists — with update/rollback through the pipeline fns.
 * - official plugin: `installOfficialPlugin` (real in-repo provider) →
 *   disable/enable → update → `rollbackPluginPackage` → uninstall, with host
 *   projection render proof.
 * - custom plugin: `installPackage(kind: "plugin")` through the same steps,
 *   with host projection render proof.
 * - uploaded theme shell: `installUploadedTheme` (the drop-zone server
 *   target) → `previewPackage` → `activateTheme` → `deleteTheme` — the exact
 *   chain the newly-wired admin drop-zone drives.
 *
 * No network, no real database: persistence is the in-memory fakeDb and every
 * archive is hand-built via the repo `buildTestZip` fixture (no npm zip
 * libraries). Read-only neighbours: the pipeline, the appearance/official
 * servers, the plugin host — this file only calls them.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { fakeDb } from "./__fixtures__/fake-db";
import { buildTestZip } from "./__fixtures__/test-zip";
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

const {
  installPackage,
  previewPackage,
  activatePackage,
  rollbackPackage,
  uninstallPackage,
  rollbackPluginPackage,
  uninstallPluginPackage,
  setPluginPackageEnabled,
} = await import("./package-install.server");
const {
  installOfficialTheme,
  installUploadedTheme,
  activateTheme,
  deleteTheme,
  __setOfficialArtifactProviderForTests,
} = await import("./themes/appearance.server");
const { installOfficialPlugin } = await import("./official-plugins.server");
const { listInstalledPlugins, upsertPlugin } = await import("./plugins.server");
const { resolvePluginWidget } = await import("./plugin-manifest");

const MERCHANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const MERCHANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ACTOR = "99999999-9999-4999-8999-999999999999";

function lifecycleDb() {
  return fakeDb({
    tables: {
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      theme_assets: [],
      marketplace_installs: [],
      theme_audit: [],
      theme_catalog_favourites: [],
      theme_registry: [],
      plugin_state: [],
      plugin_kill_switch: [],
      activity_log: [],
    },
  });
}

let keySeq = 0;
const key = () => `lifecycle-key-${(keySeq += 1)}`;

/* ------------------------------------------------------- manifest builders */

function strictTheme(
  themeKey: string,
  version = "1.0.0",
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    key: themeKey,
    name: `Lifecycle ${themeKey}`,
    nameBn: "লাইফসাইকেল",
    version,
    api: "^3.0.0",
    templates: ["index"],
    presentationSurfaces: ["widget"],
    locales: ["en"],
    capabilities: ["render_storefront"],
    ...extra,
  };
}

function themeZip(
  manifest: Record<string, unknown>,
  css = "a{color:red}",
): Uint8Array {
  return buildTestZip([
    { name: "theme.json", content: JSON.stringify(manifest) },
    { name: "templates/index.json", content: JSON.stringify({ blocks: [] }) },
    { name: "styles/main.css", content: css },
    { name: "locales/en.json", content: "{}" },
  ]);
}

function strictPlugin(
  id: string,
  version = "1.0.0",
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    name: id,
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
    settings: [{ key: "title", label: "Title", kind: "text", default: "T" }],
    i18n: { en: { title: "Title" }, bn: { title: "শিরোনাম" } },
    budget: { jsKb: 10, mainThreadMs: 5 },
    ...extra,
  };
}

function pluginZip(
  manifest: Record<string, unknown>,
  icon = "icon-bytes",
): Uint8Array {
  return buildTestZip([
    { name: "plugin.json", content: JSON.stringify(manifest) },
    { name: "assets/icon.png", content: icon },
  ]);
}

/* ------------------------------------------- official theme fixture (seam) */

function officialEntry(key: "songoskriti", version = "1.0.0") {
  const bytes = themeZip(strictTheme(key, version), "official-css");
  return {
    key,
    nameEn: "Songoskriti",
    nameBn: "সংস্কৃতি",
    summaryEn: "Songoskriti official theme",
    summaryBn: "",
    category: "general",
    version,
    artifact: {
      checksum: createHash("sha256").update(bytes).digest("hex"),
      version,
      fileName: `${key}.zip`,
      pinned: `official:${key}`,
    },
    bytes,
  };
}

function serveOfficialSongoskriti() {
  const entry = officialEntry("songoskriti", "1.0.0");
  __setOfficialArtifactProviderForTests(async (serveKey) =>
    serveKey === "songoskriti" ? entry : null,
  );
  return entry;
}

beforeEach(() => {
  recorder.reset();
  __setOfficialArtifactProviderForTests(null);
});

/* --------------------------------------- custom theme: full pipeline chain */

describe("LIFECYCLE custom theme: upload → preview → activate → update → rollback → delete", () => {
  it("walks the whole pipeline on one package line", async () => {
    const db = lifecycleDb();

    // 1. Upload: raw ZIP bytes enter the pipeline as a new package line.
    const v1 = await installPackage(
      db.asClient(),
      MERCHANT_A,
      {
        kind: "theme",
        fileName: "lifecycle-custom.zip",
        bytes: themeZip(strictTheme("lifecycle-custom", "1.0.0")),
        idempotencyKey: key(),
      },
      ACTOR,
    );
    expect(v1.alreadyInstalled).toBe(false);
    expect(v1.updated).toBe(false);
    expect(v1.versionNumber).toBe(1);

    // 2. Preview: payload readable, live pointer untouched (inert install).
    const preview = await previewPackage(
      db.asClient(),
      MERCHANT_A,
      v1.versionId,
    );
    expect(preview.packageId).toBe(v1.packageId);
    expect(preview.assets.length).toBeGreaterThan(0);
    expect(
      db.rows("store_themes").find((r) => r.id === v1.packageId)?.is_active,
    ).toBe(false);

    // 3. Activate: the version goes live.
    const active = await activatePackage(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      v1.versionId,
      ACTOR,
    );
    expect(active.versionId).toBe(v1.versionId);
    expect(
      db.rows("store_themes").find((r) => r.id === v1.packageId),
    ).toMatchObject({ is_active: true, published_version_id: v1.versionId });

    // 4. Update: v2 bytes land on the SAME package line, namespaced apart.
    const v2 = await installPackage(
      db.asClient(),
      MERCHANT_A,
      {
        kind: "theme",
        fileName: "lifecycle-custom.zip",
        bytes: themeZip(
          strictTheme("lifecycle-custom", "1.1.0"),
          "b{color:blue}",
        ),
        idempotencyKey: key(),
      },
      ACTOR,
    );
    expect(v2.packageId).toBe(v1.packageId);
    expect(v2.updated).toBe(true);
    expect(v2.versionNumber).toBe(2);
    await activatePackage(
      db.asClient(),
      MERCHANT_A,
      v2.packageId,
      v2.versionId,
      ACTOR,
    );

    // 5. Rollback: a NEW version carrying v1 content goes live (append-only).
    const rolled = await rollbackPackage(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      v1.versionId,
      ACTOR,
    );
    expect(rolled.versionNumber).toBe(3);
    const versions = db.rows("theme_versions");
    const v3row = versions.find((v) => v.id === rolled.versionId)!;
    const v1row = versions.find((v) => v.id === v1.versionId)!;
    expect(v3row.rollback_of).toBe(v1.versionId);
    expect(v3row.templates).toEqual(v1row.templates);
    expect(
      db.rows("store_themes").find((r) => r.id === v1.packageId)
        ?.published_version_id,
    ).toBe(rolled.versionId);

    // 6. Delete: activate a spare line first (active packages are refused),
    // then the whole line — versions, drafts, namespaced assets — is gone.
    const spare = await installPackage(
      db.asClient(),
      MERCHANT_A,
      {
        kind: "theme",
        fileName: "spare.zip",
        bytes: themeZip(strictTheme("lifecycle-spare", "1.0.0")),
        idempotencyKey: key(),
      },
      ACTOR,
    );
    await activatePackage(
      db.asClient(),
      MERCHANT_A,
      spare.packageId,
      spare.versionId,
      ACTOR,
    );
    const out = await uninstallPackage(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      ACTOR,
    );
    expect(out.ok).toBe(true);
    expect(out.removedAssets).toBeGreaterThan(0);
    expect(
      db.rows("store_themes").find((r) => r.id === v1.packageId),
    ).toBeUndefined();
    expect(
      db.rows("theme_versions").filter((v) => v.theme_id === v1.packageId),
    ).toHaveLength(0);
    // The spare line is fully intact; other tenants never shared the line.
    expect(db.rows("store_themes").map((r) => r.id)).toEqual([spare.packageId]);
    expect(
      db
        .rows("marketplace_installs")
        .find((r) => r.listing_slug === "lifecycle-spare")?.status,
    ).toBe("installed");
  });
});

/* ----------------- official theme: pipeline install, console operate chain */

describe("LIFECYCLE official theme: pipeline install → console activate/preview/delete + update/rollback", () => {
  it("installs through the normal pipeline and the admin fns operate those rows", async () => {
    const db = lifecycleDb();
    serveOfficialSongoskriti();

    // 1. Official install: pipeline rows + official provenance pin.
    const v1 = await installOfficialTheme(
      db.asClient(),
      MERCHANT_A,
      "songoskriti",
      ACTOR,
    );
    expect(v1.alreadyInstalled).toBe(false);
    expect(v1.version).toBe("1.0.0");
    const ledger = db.rows("marketplace_installs");
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      kind: "theme",
      listing_slug: "songoskriti",
      status: "installed",
      artifact_pinned: "official:songoskriti",
    });

    // 2. Preview through the pipeline: inert until activated.
    const preview = await previewPackage(
      db.asClient(),
      MERCHANT_A,
      v1.versionId,
    );
    expect(preview.packageId).toBe(v1.packageId);
    expect(
      db.rows("store_themes").find((r) => r.id === v1.packageId)?.is_active,
    ).toBe(false);

    // 3. Activate through the ADMIN fn (the console path), not the pipeline
    // fn — the UI must operate pipeline rows.
    const activated = await activateTheme(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      ACTOR,
    );
    expect(activated.id).toBe(v1.packageId);
    expect(
      db.rows("store_themes").find((r) => r.id === v1.packageId)?.is_active,
    ).toBe(true);

    // 4. Update: v2 bytes on the same official line (same slug, new key).
    const v2 = await installPackage(
      db.asClient(),
      MERCHANT_A,
      {
        kind: "theme",
        fileName: "songoskriti.zip",
        bytes: themeZip(strictTheme("songoskriti", "1.1.0"), "official-v2"),
        idempotencyKey: key(),
      },
      ACTOR,
    );
    expect(v2.packageId).toBe(v1.packageId);
    expect(v2.updated).toBe(true);
    await activatePackage(
      db.asClient(),
      MERCHANT_A,
      v2.packageId,
      v2.versionId,
      ACTOR,
    );

    // 5. Rollback to the official v1 content as a new live version.
    const rolled = await rollbackPackage(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      v1.versionId,
      ACTOR,
    );
    const v3row = db
      .rows("theme_versions")
      .find((v) => v.id === rolled.versionId)!;
    expect(v3row.rollback_of).toBe(v1.versionId);
    expect(
      db.rows("theme_audit").filter((a) => a.action === "package.rolled_back"),
    ).toHaveLength(1);

    // 6. Delete through the ADMIN fn: row gone, pipeline ledger retired by
    // the install-id link (never a slug sweep).
    const spare = await installPackage(
      db.asClient(),
      MERCHANT_A,
      {
        kind: "theme",
        fileName: "spare.zip",
        bytes: themeZip(strictTheme("lifecycle-second", "1.0.0")),
        idempotencyKey: key(),
      },
      ACTOR,
    );
    await activatePackage(
      db.asClient(),
      MERCHANT_A,
      spare.packageId,
      spare.versionId,
      ACTOR,
    );
    const deleted = await deleteTheme(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      ACTOR,
    );
    expect(deleted.id).toBe(v1.packageId);
    expect(
      db.rows("store_themes").find((r) => r.id === v1.packageId),
    ).toBeUndefined();
    expect(ledger[0]?.status).toBe("removed");
    expect(
      db.rows("theme_audit").filter((a) => a.action === "theme.deleted"),
    ).toHaveLength(1);
    // Spare line untouched.
    expect(db.rows("store_themes").map((r) => r.id)).toEqual([spare.packageId]);
  });
});

/* ---------------------------------------- official plugin: full pipeline chain */

describe("LIFECYCLE official plugin: install → enable → render → update → rollback → delete", () => {
  it("walks the whole plugin pipeline with the real official artifact", async () => {
    const db = lifecycleDb();

    // 1. Official install through the NORMAL pipeline (real in-repo bytes).
    const v1 = await installOfficialPlugin(
      db.asClient(),
      MERCHANT_A,
      "product-reviews",
      ACTOR,
    );
    expect(v1.alreadyInstalled).toBe(false);
    expect(v1.version).toBe("2.1.0");
    const row1 = db
      .rows("marketplace_installs")
      .find((r) => r.id === v1.packageId)!;
    expect(row1).toMatchObject({
      kind: "widget",
      listing_slug: "product-reviews",
      status: "installed",
      artifact_pinned: "official:product-reviews",
    });

    // 2. Disable/enable flips the pipeline ledger row (the preview gate:
    // a paused plugin renders nothing until enabled).
    const paused = await setPluginPackageEnabled(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      false,
      ACTOR,
    );
    expect(paused.status).toBe("paused");
    const reenabled = await setPluginPackageEnabled(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      true,
      ACTOR,
    );
    expect(reenabled.status).toBe("installed");

    // 3. Render proof through the host projection (the plugin "preview":
    // installed + projected + resolvable widget).
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

    // 4. Update: v2 bytes, same slug = new ledger row on the same line.
    const { exportPluginManifestZip } = await import("./plugin-package");
    const { officialPluginSource } = await import("./official-plugins");
    const source = officialPluginSource("product-reviews")!;
    const v2bytes = exportPluginManifestZip({
      ...(source.manifest as Record<string, unknown>),
      version: "2.2.0",
    } as never);
    const v2 = await installPackage(
      db.asClient(),
      MERCHANT_A,
      {
        kind: "plugin",
        fileName: "product-reviews.zip",
        bytes: v2bytes,
        idempotencyKey: key(),
      },
      ACTOR,
    );
    expect(v2.version).toBe("2.2.0");
    expect(
      db
        .rows("marketplace_installs")
        .filter(
          (r) =>
            r.listing_slug === "product-reviews" && r.status === "installed",
        ),
    ).toHaveLength(2);

    // 5. Rollback: v1 artifact restored as the single live row with an
    // explicit rollback record (never just an enable flip).
    const rb = await rollbackPluginPackage(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      ACTOR,
      { idempotencyKey: key() },
    );
    expect(rb.rollbackOf).toBe(v1.packageId);
    expect(rb.artifactId).toBe(row1.artifact_checksum);
    const live = db
      .rows("marketplace_installs")
      .filter(
        (r) => r.listing_slug === "product-reviews" && r.status === "installed",
      );
    expect(live).toHaveLength(1);
    expect(live[0]!.previous_snapshot.rollback_of).toBe(v1.packageId);
    expect(
      db.rows("theme_audit").filter((a) => a.action === "package.rolled_back"),
    ).toHaveLength(1);

    // 6. Delete every row on the line: namespaces wiped, siblings/tenants
    // intact, ledger terminal.
    const sib = await installPackage(
      db.asClient(),
      MERCHANT_A,
      {
        kind: "plugin",
        fileName: "sibling.zip",
        bytes: pluginZip(strictPlugin("sibling-widget", "1.0.0"), "sib"),
        idempotencyKey: key(),
      },
      ACTOR,
    );
    const sibPrefix = `plugins/sibling-widget/${sib.artifactId.slice(0, 8)}/`;
    for (const target of [rb.packageId, v1.packageId, v2.packageId]) {
      const done = await uninstallPluginPackage(
        db.asClient(),
        MERCHANT_A,
        target,
        ACTOR,
      );
      expect(done.ok).toBe(true);
    }
    expect(
      db
        .rows("theme_assets")
        .some((a) => (a.name as string).startsWith(sibPrefix)),
    ).toBe(true);
    expect(
      db
        .rows("marketplace_installs")
        .filter((r) => r.listing_slug === "product-reviews")
        .every((r) => r.status === "removed"),
    ).toBe(true);
    expect(
      db.rows("marketplace_installs").find((r) => r.id === sib.packageId)
        ?.status,
    ).toBe("installed");
  });
});

/* ----------------------------------------- custom plugin: full pipeline chain */

describe("LIFECYCLE custom plugin: upload → disable → render → enable → update → rollback → delete", () => {
  it("walks the whole plugin pipeline on uploaded bytes", async () => {
    const db = lifecycleDb();

    // 1. Upload: merchant ZIP bytes enter the pipeline.
    const v1 = await installPackage(
      db.asClient(),
      MERCHANT_A,
      {
        kind: "plugin",
        fileName: "acme.zip",
        bytes: pluginZip(strictPlugin("acme-reviews", "1.0.0"), "icon-v1"),
        idempotencyKey: key(),
      },
      ACTOR,
    );
    expect(v1.alreadyInstalled).toBe(false);
    expect(v1.artifactId).toHaveLength(64);
    const prefix1 = `plugins/acme-reviews/${v1.artifactId.slice(0, 8)}/`;
    expect(
      db
        .rows("theme_assets")
        .some((a) => (a.name as string).startsWith(prefix1)),
    ).toBe(true);

    // 2. Disable/enable on the PIPELINE ledger plane (paused installs are
    // inert at the ledger level), then project + resolve on the host plane
    // (`listInstalledPlugins.enabled` reads plugin_state, never the ledger —
    // the two planes are intentionally separate).
    await setPluginPackageEnabled(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      false,
      ACTOR,
    );
    expect(
      db.rows("marketplace_installs").find((r) => r.id === v1.packageId)
        ?.status,
    ).toBe("paused");
    await upsertPlugin(db.asClient() as never, MERCHANT_A, {
      manifest: strictPlugin("acme-reviews", "1.0.0"),
      grantedScopes: ["read_shop", "render_storefront"],
      actorId: ACTOR,
    });
    await setPluginPackageEnabled(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      true,
      ACTOR,
    );
    expect(
      db.rows("marketplace_installs").find((r) => r.id === v1.packageId)
        ?.status,
    ).toBe("installed");
    const after = await listInstalledPlugins(
      db.asClient() as never,
      MERCHANT_A,
    );
    const rendered = after.find((p) => p.manifest.id === "acme-reviews")!;
    expect(rendered.enabled).toBe(true);
    expect(resolvePluginWidget("plugin:acme-reviews/reviews", after).ok).toBe(
      true,
    );

    // 3. Update: v1.1.0 bytes = second ledger row on the same slug.
    const v2 = await installPackage(
      db.asClient(),
      MERCHANT_A,
      {
        kind: "plugin",
        fileName: "acme.zip",
        bytes: pluginZip(strictPlugin("acme-reviews", "1.1.0"), "icon-v2"),
        idempotencyKey: key(),
      },
      ACTOR,
    );
    expect(v2.version).toBe("1.1.0");
    expect(v2.packageId).not.toBe(v1.packageId);

    // 4. Rollback restores the v1 artifact as the single live row.
    const rb = await rollbackPluginPackage(
      db.asClient(),
      MERCHANT_A,
      v1.packageId,
      ACTOR,
      {
        idempotencyKey: key(),
      },
    );
    expect(rb.artifactId).toBe(v1.artifactId);
    const live = db
      .rows("marketplace_installs")
      .filter(
        (r) => r.listing_slug === "acme-reviews" && r.status === "installed",
      );
    expect(live).toHaveLength(1);
    expect(live[0]!.artifact_checksum).toBe(v1.artifactId);

    // 5. Delete: namespaces wiped per row, cross-tenant rows never matched.
    db.rows("theme_assets").push({
      id: "seed-tenant-b-asset",
      merchant_id: MERCHANT_B,
      theme_id: null,
      kind: "json",
      name: "plugins/acme-reviews/deadbeef/assets/widget.js",
      content: null,
      url: null,
      bytes: 3,
      enabled: true,
    });
    for (const target of [rb.packageId, v1.packageId, v2.packageId]) {
      expect(
        (await uninstallPluginPackage(db.asClient(), MERCHANT_A, target, ACTOR))
          .ok,
      ).toBe(true);
    }
    expect(
      db
        .rows("theme_assets")
        .filter(
          (a) =>
            a.merchant_id === MERCHANT_A &&
            (a.name as string).startsWith("plugins/acme-reviews/"),
        ),
    ).toHaveLength(0);
    expect(
      db.rows("theme_assets").filter((a) => a.merchant_id === MERCHANT_B),
    ).toHaveLength(1);
  });
});

/* ----------------- uploaded shell: the drop-zone server target, end to end */

describe("LIFECYCLE uploaded theme shell: upload → preview → activate → delete", () => {
  it("lands an inert row the console can preview, activate and delete", async () => {
    const db = lifecycleDb();
    const toB64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
    const shellZip = () =>
      buildTestZip([
        {
          name: "theme.json",
          content: JSON.stringify({ name: "My Shop", version: "1.0.0" }),
        },
      ]);

    // 1. Upload (what the wired drop-zone now calls): inert row + ledger.
    const uploadKey = key();
    const first = await installUploadedTheme(
      db.asClient(),
      MERCHANT_A,
      {
        fileName: "my-shop.zip",
        fileBase64: toB64(shellZip()),
        idempotencyKey: uploadKey,
      },
      ACTOR,
    );
    expect(first.alreadyInstalled).toBe(false);
    const row = db.rows("store_themes").find((r) => r.id === first.id)!;
    expect(row).toMatchObject({ merchant_id: MERCHANT_A, is_active: false });

    // 2. Replay: same key returns the original row, never a duplicate.
    const replay = await installUploadedTheme(
      db.asClient(),
      MERCHANT_A,
      {
        fileName: "my-shop.zip",
        fileBase64: toB64(shellZip()),
        idempotencyKey: uploadKey,
      },
      ACTOR,
    );
    expect(replay.alreadyInstalled).toBe(true);
    expect(replay.id).toBe(first.id);
    expect(db.rows("store_themes")).toHaveLength(1);

    // 3. Preview the published shell version without going live.
    const shellVersion = db
      .rows("theme_versions")
      .find((v) => v.theme_id === first.id)!;
    const preview = await previewPackage(
      db.asClient(),
      MERCHANT_A,
      shellVersion.id,
    );
    expect(preview.packageId).toBe(first.id);
    expect(
      db.rows("store_themes").find((r) => r.id === first.id)?.is_active,
    ).toBe(false);

    // 4. Activate + delete through the ADMIN fns (console path).
    await activateTheme(db.asClient(), MERCHANT_A, first.id, ACTOR);
    expect(
      db.rows("store_themes").find((r) => r.id === first.id)?.is_active,
    ).toBe(true);
    const second = await installUploadedTheme(
      db.asClient(),
      MERCHANT_A,
      {
        fileName: "other.zip",
        fileBase64: toB64(shellZip()),
        idempotencyKey: key(),
      },
      ACTOR,
    );
    await activateTheme(db.asClient(), MERCHANT_A, second.id, ACTOR);
    const deleted = await deleteTheme(
      db.asClient(),
      MERCHANT_A,
      first.id,
      ACTOR,
    );
    expect(deleted.id).toBe(first.id);
    expect(
      db.rows("store_themes").find((r) => r.id === first.id),
    ).toBeUndefined();
    expect(
      db
        .rows("marketplace_installs")
        .find((r) => r.id === row.source_install_id)?.status,
    ).toBe("removed");
  });
});
