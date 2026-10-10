/**
 * Frame30 — official catalogue semantics (Official / Community).
 *
 * Official entries (Songoskriti, Somvabona) come from the single built-in
 * source registry — no build lane, no provider seam, no checked-in bundle.
 * Official Install initializes the merchant's records from the registered
 * source definition (same row-creation as catalogue installs, with the
 * `official:<key>` ledger pin). No ZIP is constructed; custom merchant ZIPs
 * keep the `installPackage` pipeline exclusively (covered by
 * `package-zip` / `package-install` / `themes-install-catalog` suites).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb, type FakeDb } from "./__fixtures__/fake-db";
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
} = await import("./themes/appearance.server");
const { previewTheme } = await import("./themes.server");
const { sectionCatalogue } = await import("./themes/appearance");

const MERCHANT = "33333333-3333-4333-8333-333333333333";
const OTHER_MERCHANT = "55555555-5555-4555-8555-555555555555";
const ACTOR = "user-official-1";

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
          // A registry row colliding with an official key must not double up:
          // the official section is source-defined.
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
  const { invalidate } = await import("./cache.server");
  await invalidate("theme-registry");
});

/* ------------------------------------------------------- catalogue shape */

describe("Frame30 official catalogue shape", () => {
  it("lists official entries first with provenance, then community, no dupes", async () => {
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

  it("names exactly the built-in registry keys (no vapor)", async () => {
    const entries = await listOfficialCatalog();
    expect(entries.map((e) => e.key)).toEqual(["songoskriti", "somvabona"]);
    for (const entry of entries) {
      expect(entry.artifact.pinned).toBe(`official:${entry.key}`);
    }
  });

  it("official section is source-defined with no build step", async () => {
    // No provider, no bundle, no registry rows needed: source alone fills
    // the section, community rows stay intact, colliding rows stay skipped.
    const db = workspaceDb();
    const workspace = await loadThemesWorkspace(db.asClient(), MERCHANT);
    const sections = sectionCatalogue(workspace.catalogue);
    expect(sections.official.map((t) => t.key)).toEqual([
      "songoskriti",
      "somvabona",
    ]);
    for (const entry of sections.official) {
      expect(entry).toMatchObject({ provenance: "official", version: "1.0.0" });
    }
    expect(sections.community.map((t) => t.key)).toEqual(["acme-pack"]);
  });
});

/* --------------------------- official install = source init */

describe("Frame30 official install initializes from source", () => {
  it("writes theme + version + draft + ledger + audit with the official pin", async () => {
    const db = installDb();
    const out = await installOfficialTheme(
      db.asClient(),
      MERCHANT,
      "songoskriti",
      ACTOR,
    );
    expect(out.alreadyInstalled).toBe(false);

    const themes = db.rows("store_themes");
    expect(themes).toHaveLength(1);
    expect(themes[0]).toMatchObject({
      merchant_id: MERCHANT,
      name: "Songoskriti",
      source_listing_slug: "songoskriti",
      source_version: "1.0.0",
      is_active: false,
    });
    const versions = db.rows("theme_versions");
    expect(versions).toHaveLength(1);
    // Source-form templates: servable /ph/ URLs, never package refs.
    expect(JSON.stringify(versions[0])).toContain("/ph/songoskriti/");
    expect(db.rows("theme_drafts")).toHaveLength(1);
    const installs = db.rows("marketplace_installs");
    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({
      kind: "theme",
      listing_slug: "songoskriti",
      status: "installed",
      idempotency_key: `official:${MERCHANT}:songoskriti`,
      artifact_pinned: "official:songoskriti",
    });
    expect(themes[0].source_install_id).toBe(installs[0].id);
    const audit = db.rows("theme_audit");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "theme.installed",
      after: { key: "songoskriti", via: "official" },
    });
  });

  it("replays the ledger key instead of stacking rows", async () => {
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
    expect(second.id).toBe(first.id);
    expect(db.rows("store_themes")).toHaveLength(1);
    expect(db.rows("theme_versions")).toHaveLength(1);
    expect(db.rows("marketplace_installs")).toHaveLength(1);
  });

  it("refuses unknown keys without writing anything", async () => {
    const db = installDb();
    await expect(
      installOfficialTheme(db.asClient(), MERCHANT, "vapor", ACTOR),
    ).rejects.toThrow();
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });

  it("the catalog path installs official keys from source (no fork)", async () => {
    const db = installDb();
    const out = await installCatalogTheme(
      db.asClient(),
      MERCHANT,
      "somvabona",
      ACTOR,
    );
    expect(out.alreadyInstalled).toBe(false);
    expect(db.rows("store_themes")).toHaveLength(1);
    const installs = db.rows("marketplace_installs");
    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({
      listing_slug: "somvabona",
      artifact_pinned: "official:somvabona",
    });
  });

  it("somvabona installs with source row shapes, never pipeline shapes", async () => {
    const db = installDb();
    await installOfficialTheme(db.asClient(), MERCHANT, "somvabona", ACTOR);
    // Source init: published v1 labeled by key — not a draft pipeline row.
    const versions = db.rows("theme_versions");
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      status: "published",
      label: "somvabona",
    });
    expect(JSON.stringify(versions[0])).toContain("/ph/somvabona/");
    // No pipeline columns: no checksums, no blobs, no package audit action.
    for (const row of [...versions, ...db.rows("marketplace_installs")]) {
      expect("artifact_checksum" in row).toBe(false);
      expect("artifactId" in row).toBe(false);
    }
    expect(db.rows("theme_audit").map((a) => a.action)).toEqual([
      "theme.installed",
    ]);
  });

  it("reinstall never overwrites merchant draft edits", async () => {
    const db = installDb();
    const first = await installOfficialTheme(
      db.asClient(),
      MERCHANT,
      "songoskriti",
      ACTOR,
    );
    // Merchant customizes: draft diverges from source.
    const edited = {
      index: {
        header: [],
        main: [{ id: "mine", type: "heading", props: {} }],
        footer: [],
      },
    };
    await db
      .asClient<FakeDb>()
      .from("theme_drafts")
      .update({ templates: edited } as never)
      .eq("theme_id", first.id);
    const second = await installOfficialTheme(
      db.asClient(),
      MERCHANT,
      "songoskriti",
      ACTOR,
    );
    expect(second).toMatchObject({ id: first.id, alreadyInstalled: true });
    expect(db.rows("store_themes")).toHaveLength(1);
    expect(db.rows("theme_versions")).toHaveLength(1);
    const drafts = db.rows("theme_drafts");
    expect(drafts).toHaveLength(1);
    expect((drafts[0] as { templates: unknown }).templates).toEqual(edited);
  });

  it("merchant preview reads the installed draft; foreigners get null", async () => {
    const db = installDb();
    const out = await installOfficialTheme(
      db.asClient(),
      MERCHANT,
      "songoskriti",
      ACTOR,
    );
    const preview = await previewTheme(db.asClient(), MERCHANT, out.id);
    expect(preview).not.toBeNull();
    expect(preview!.themeKey).toBe("songoskriti");
    expect(JSON.stringify(preview!.templates)).toContain("/ph/songoskriti/");
    expect(
      await previewTheme(db.asClient(), OTHER_MERCHANT, out.id),
    ).toBeNull();
  });
});
