/**
 * B2 — official catalogue semantics (Official / Community / Upload).
 *
 * Catalogue lists official entries from internally-built artifacts (with a
 * graceful empty-state when the build hasn't run) plus community rows, and
 * official Install runs the NORMAL `installPackage` pipeline — same
 * validators, same ledger, same version rows as merchant uploads — against
 * the internally-built artifact. No separate official install path.
 *
 * The artifact-build lane hasn't landed, so these cases inject fixture
 * bytes through the documented provider seam
 * (`__setOfficialArtifactProviderForTests`): official provenance marker
 * (`official:<key>`) + version rows. No network, no real database.
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
  installCatalogTheme,
  installOfficialTheme,
  listOfficialCatalog,
  loadThemesWorkspace,
  __setOfficialArtifactProviderForTests,
} = await import("./themes/appearance.server");
const { installPackage } = await import("./package-install.server");
const { sectionCatalogue } = await import("./themes/appearance");

const MERCHANT = "33333333-3333-4333-8333-333333333333";
const MERCHANT_B = "44444444-4444-4434-8444-444444444444";
const ACTOR = "user-official-1";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Minimal strict-shape (PKG-1) official manifest for a fixture key. */
function officialManifest(key: string, version = "1.0.0") {
  return {
    key,
    name: key === "songoskriti" ? "Songoskriti" : "Somvabona",
    nameBn: key === "songoskriti" ? "সংস্কৃতি" : "সম্ভাবনা",
    version,
    api: "^3.0.0",
    templates: ["index"],
    presentationSurfaces: ["widget"],
    locales: ["en"],
    capabilities: ["render_storefront"],
  };
}

function officialZip(key: string, version = "1.0.0"): Uint8Array {
  return buildTestZip([
    { name: "theme.json", content: JSON.stringify(officialManifest(key, version)) },
    { name: "templates/index.json", content: JSON.stringify({ blocks: [] }) },
    { name: "locales/en.json", content: "{}" },
  ]);
}

function officialEntry(key: "songoskriti" | "somvabona", version = "1.0.0") {
  const bytes = officialZip(key, version);
  return {
    key,
    nameEn: officialManifest(key, version).name,
    nameBn: officialManifest(key, version).nameBn,
    summaryEn: `${officialManifest(key, version).name} official theme`,
    summaryBn: "",
    category: "general",
    version,
    artifact: {
      checksum: sha256(bytes),
      version,
      fileName: `${key}.zip`,
      pinned: `official:${key}`,
    },
    bytes,
  };
}

function serveOfficial(
  keys: ("songoskriti" | "somvabona")[] = ["songoskriti", "somvabona"],
) {
  const served = new Map(keys.map((key) => [key, officialEntry(key)]));
  const requested: string[] = [];
  __setOfficialArtifactProviderForTests(async (key) => {
    requested.push(key);
    return served.get(key) ?? null;
  });
  return { served, requested };
}

function workspaceDb() {
  return fakeDb({
    tables: {
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      theme_assets: [],
      marketplace_installs: [],
      theme_audit: [],
      theme_catalog_favourites: [],
      theme_registry: [
        {
          key: "acme-pack",
          name_en: "Acme Pack",
          name_bn: "অ্যাকমি",
          summary_en: "A community theme",
          summary_bn: "",
          category: "general",
          version: "2.0.0",
          preset: { tokens: {}, templates: {} },
          active: true,
          sort_order: 1,
        },
        {
          // A registry row colliding with an official key must not double up.
          key: "songoskriti",
          name_en: "Songoskriti (legacy registry row)",
          name_bn: "",
          summary_en: "Stale registry copy",
          summary_bn: "",
          category: "general",
          version: "0.1.0",
          preset: { tokens: {}, templates: {} },
          active: true,
          sort_order: 2,
        },
      ],
    },
  });
}

function installDb() {
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
    },
  });
}

beforeEach(async () => {
  recorder.reset();
  __setOfficialArtifactProviderForTests(null);
  const { invalidate } = await import("./cache.server");
  await invalidate("theme-registry");
});

/* ------------------------------------------------------- catalogue shape */

describe("B2 official catalogue shape", () => {
  it("lists official entries first with provenance, then community, no dupes", async () => {
    serveOfficial();
    const db = workspaceDb();
    const workspace = await loadThemesWorkspace(db.asClient(), MERCHANT);
    expect(workspace.catalogue.map((t) => t.key)).toEqual([
      "songoskriti",
      "somvabona",
      "acme-pack",
    ]);
    const sections = sectionCatalogue(workspace.catalogue);
    expect(sections.official.map((t) => t.key)).toEqual([
      "songoskriti",
      "somvabona",
    ]);
    expect(sections.community.map((t) => t.key)).toEqual(["acme-pack"]);
    const songo = sections.official[0]!;
    expect(songo).toMatchObject({
      name: "Songoskriti",
      version: "1.0.0",
      provenance: "official",
      installed: false,
      active: false,
    });
    expect(sections.community[0]).toMatchObject({ provenance: "community" });
    // No third official theme, no duplicate Install targets.
    expect(
      workspace.catalogue.filter((t) => t.provenance === "official"),
    ).toHaveLength(2);
  });

  it("only ever asks the build for the two official keys (no vapor)", async () => {
    const { requested } = serveOfficial();
    await listOfficialCatalog();
    expect(requested).toEqual(["songoskriti", "somvabona"]);
  });

  it("graceful empty-state when the build hasn't run: official empty, community intact", async () => {
    __setOfficialArtifactProviderForTests(null);
    expect(await listOfficialCatalog()).toEqual([]);
    const db = workspaceDb();
    const workspace = await loadThemesWorkspace(db.asClient(), MERCHANT);
    const sections = sectionCatalogue(workspace.catalogue);
    expect(sections.official).toEqual([]);
    // Registry rows (minus official collisions, which need artifacts) stay.
    expect(sections.community.map((t) => t.key)).toEqual([
      "acme-pack",
      "songoskriti",
    ]);
    expect(sections.community[1]).toMatchObject({ provenance: "community" });
  });

  it("a broken build for one key hides that key, never the section", async () => {
    __setOfficialArtifactProviderForTests(async (key) => {
      if (key === "somvabona") throw new Error("build exploded");
      return officialEntry(key);
    });
    const entries = await listOfficialCatalog();
    expect(entries.map((e) => e.key)).toEqual(["songoskriti"]);
  });
});

/* --------------------------------- official install = normal pipeline */

describe("B2 official install runs the normal installPackage pipeline", () => {
  it("writes theme + version + draft + ledger + audit with the official pin", async () => {
    serveOfficial();
    const db = installDb();
    const out = await installOfficialTheme(
      db.asClient(),
      MERCHANT,
      "songoskriti",
      ACTOR,
    );
    expect(out.alreadyInstalled).toBe(false);
    expect(out.version).toBe("1.0.0");
    expect(out.artifactId).toHaveLength(64);

    const themes = db.rows("store_themes");
    expect(themes).toHaveLength(1);
    expect(themes[0]).toMatchObject({
      merchant_id: MERCHANT,
      name: "Songoskriti",
      source_listing_slug: "songoskriti",
      source_version: "1.0.0",
      is_active: false,
    });
    expect(db.rows("theme_versions")).toHaveLength(1);
    expect(db.rows("theme_drafts")).toHaveLength(1);
    const installs = db.rows("marketplace_installs");
    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({
      kind: "theme",
      listing_slug: "songoskriti",
      status: "installed",
      // The pipeline hashed the exact official bytes…
      artifact_checksum: sha256(officialZip("songoskriti")),
      artifact_version: "1.0.0",
      // …stamped with the official provenance marker, not `upload`.
      artifact_pinned: "official:songoskriti",
    });
    expect(themes[0].source_install_id).toBe(installs[0].id);
    const audit = db.rows("theme_audit");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "package.installed" });
  });

  it("shares the pipeline with merchant uploads: identical rows except the pin", async () => {
    serveOfficial();
    const db = installDb();
    const bytes = officialZip("somvabona");
    await installOfficialTheme(db.asClient(), MERCHANT, "somvabona", ACTOR);
    // Upload-equivalent: the same bytes through installPackage directly.
    await installPackage(
      db.asClient(),
      MERCHANT_B,
      {
        kind: "theme",
        fileName: "somvabona.zip",
        bytes,
        idempotencyKey: "upload-equivalent-key",
      },
      ACTOR,
    );
    expect(db.rows("store_themes")).toHaveLength(2);
    expect(db.rows("theme_versions")).toHaveLength(2);
    expect(db.rows("theme_drafts")).toHaveLength(2);
    expect(db.rows("theme_audit")).toHaveLength(2);
    // Same audit action, same version-row shape.
    for (const row of db.rows("theme_audit")) {
      expect(row).toMatchObject({ action: "package.installed" });
    }
    for (const row of db.rows("theme_versions")) {
      expect(row).toMatchObject({ status: "draft" });
      expect(String(row.label)).toBe("somvabona@1.0.0");
    }
    // Same ledger shape; only the provenance marker differs.
    const pins = db.rows("marketplace_installs").map((r) => r.artifact_pinned);
    expect(pins).toContain("official:somvabona");
    expect(pins).toContain("upload");
    const checksums = db
      .rows("marketplace_installs")
      .map((r) => r.artifact_checksum);
    expect(checksums[0]).toBe(checksums[1]);
  });

  it("replays the ledger key instead of stacking rows", async () => {
    serveOfficial();
    const db = installDb();
    const first = await installOfficialTheme(
      db.asClient(),
      MERCHANT,
      "songoskriti",
      ACTOR,
    );
    const second = await installOfficialTheme(
      db.asClient(),
      MERCHANT,
      "songoskriti",
      ACTOR,
    );
    expect(second.alreadyInstalled).toBe(true);
    expect(second.packageId).toBe(first.packageId);
    expect(db.rows("store_themes")).toHaveLength(1);
    expect(db.rows("theme_versions")).toHaveLength(1);
    expect(db.rows("marketplace_installs")).toHaveLength(1);
  });

  it("refuses when the build hasn't run, writing nothing", async () => {
    __setOfficialArtifactProviderForTests(null);
    const db = installDb();
    const err = await installOfficialTheme(
      db.asClient(),
      MERCHANT,
      "songoskriti",
      ACTOR,
    ).catch((e) => e);
    expect(err?.code ?? err?.message).toMatch(/official_unavailable/);
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("theme_versions")).toHaveLength(0);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("theme_audit")).toHaveLength(0);
  });

  it("refuses unknown keys without writing anything", async () => {
    serveOfficial();
    const db = installDb();
    await expect(
      installOfficialTheme(db.asClient(), MERCHANT, "vapor", ACTOR),
    ).rejects.toThrow();
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });

  it("the legacy catalog path refuses official keys (no fork)", async () => {
    serveOfficial();
    const db = installDb();
    const err = await installCatalogTheme(
      db.asClient(),
      MERCHANT,
      "songoskriti",
      ACTOR,
    ).catch((e) => e);
    expect(err?.code).toBe("theme.official_path");
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });
});
