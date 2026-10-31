/**
 * Task 1 fix round — the SEED MERGE (`installRegistryTheme`).
 *
 * The merge is the one place where an install touches a merchant's own
 * work, so it is pinned HERE — through the real install path (the fake DB
 * and the REAL argument the RPC received), not through a helper.
 *
 * Two properties:
 *
 *  1. **The merchant's keys survive.** A key the merchant's map already
 *     carries is never overwritten, and a key it carries that the package
 *     does not — their **variant** keys (`archive_category`,
 *     `blog_article`) — is never dropped. The package's map carries only
 *     the base keys, so handing the RPC the package's map instead of the
 *     merged one would silently delete the merchant's variants on every
 *     install, which contradicts the merge's own rule ("a key the
 *     merchant's map already carries is NEVER overwritten").
 *  2. **Two themes are never mixed.** The merge reads the ACTIVE theme's
 *     draft, so it is applied ONLY when that theme's source key IS the key
 *     being installed. The RPC replaces the draft's map VERBATIM, so a
 *     foreign body's sections would be published under the new theme's
 *     name.
 *
 * The suite is self-contained: it imports the server module through the
 * same `vi.mock` seam the neighbouring suites use (`observability.server`
 * and `rate-limit.server`), so the install's own rate-limit and metric
 * calls never touch Redis.
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

const { installRegistryTheme, registryPackage } =
  await import("./themes.server");

const MERCHANT = "33333333-3333-4333-8333-333333333333";
const THEME_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_THEME_ID = "55555555-5555-4555-8555-555555555555";

/** The base keys the official package's own map carries. */
const PACKAGE_KEYS = Object.keys(registryPackage("songoskriti").templates);

/** A tiny authored body — one section, so it is not the empty AST. */
function body(type: string) {
  return {
    header: [],
    main: [{ id: `${type}-1`, type, props: {} }],
    footer: [],
  };
}

function sectionTypes(ast: unknown): string[] {
  const main = (ast as { main: { type: string }[] }).main;
  return main.map((s) => s.type);
}

function sectionIds(ast: unknown): string[] {
  const main = (ast as { main: { id: string }[] }).main;
  return main.map((s) => s.id);
}

/**
 * The merchant's ACTIVE theme, its draft, and the version row that records
 * the registry key the theme was installed from.
 */
function installDb(opts: {
  sourceKey: string | null;
  draft: Record<string, unknown>;
  listingSlug?: string | null;
  activeThemeId?: string;
}) {
  const themeId = opts.activeThemeId ?? THEME_ID;
  return fakeDb({
    tables: {
      store_themes: [
        {
          id: themeId,
          merchant_id: MERCHANT,
          name: "Songoskriti",
          is_active: true,
          created_at: "2026-01-01T00:00:00.000Z",
          source_listing_slug: opts.listingSlug ?? null,
        },
      ],
      theme_drafts: [
        {
          id: "draft-1",
          theme_id: themeId,
          merchant_id: MERCHANT,
          revision: 3,
          templates: opts.draft,
          tokens: {},
        },
      ],
      theme_versions: opts.sourceKey
        ? [
            {
              id: "version-1",
              theme_id: themeId,
              merchant_id: MERCHANT,
              version: 1,
              status: "draft",
              source_registry_key: opts.sourceKey,
              templates: {},
              tokens: {},
            },
          ]
        : [],
      theme_registry: [],
      seo_templates: [],
      theme_audit: [],
    },
    rpc: (fn) =>
      fn === "theme_install_preset"
        ? { data: "installed-version-id", error: null }
        : { data: null, error: { message: `rpc_not_stubbed:${fn}` } },
  });
}

/** The template map the install's RPC actually received. */
function installedTemplates(db: ReturnType<typeof fakeDb>) {
  const call = db.rpcCalls("theme_install_preset")[0];
  expect(call, "the install must call theme_install_preset").toBeDefined();
  const preset = (
    call!.args as { _preset: { templates: Record<string, unknown> } }
  )._preset;
  return preset.templates;
}

describe("the seed merge — the merchant's own work", () => {
  it("keeps the merchant's variant key when their map already carries every base key", async () => {
    // The exact shape that used to break: the merchant's map carries every
    // key the package's map carries — so the merge changed NOTHING — and a
    // VARIANT key the package does not carry. The old code returned the
    // PACKAGE's map in that case, which deleted the merchant's variant key
    // and replaced every one of their bodies with the package's.
    const draft: Record<string, unknown> = {};
    for (const key of PACKAGE_KEYS) draft[key] = body("blog_archive");
    draft.archive_category = body("blog_archive");
    draft.blog_article = body("rich_text");
    const db = installDb({ sourceKey: "songoskriti", draft });
    await installRegistryTheme(db.asClient(), MERCHANT, "songoskriti", true);
    const templates = installedTemplates(db);
    // The merchant's VARIANT keys survive the install.
    expect(templates.archive_category).toBeDefined();
    expect(sectionTypes(templates.archive_category)).toEqual(["blog_archive"]);
    expect(templates.blog_article).toBeDefined();
    // …and every base key is still THEIRS, not the package's.
    expect(sectionIds(templates.index)).toEqual(["blog_archive-1"]);
    expect(sectionIds(templates.archive)).toEqual(["blog_archive-1"]);
  });

  it("fills the package's new base key beside the merchant's own bodies", async () => {
    const db = installDb({
      sourceKey: "songoskriti",
      draft: {
        index: body("hero_carousel"),
        archive_category: body("blog_archive"),
      },
    });
    await installRegistryTheme(db.asClient(), MERCHANT, "songoskriti", true);
    const templates = installedTemplates(db);
    // The merchant's VARIANT key survives the install.
    expect(templates.archive_category).toBeDefined();
    expect(sectionTypes(templates.archive_category)).toEqual(["blog_archive"]);
    // …and the package's NEW base key is filled in beside it.
    expect(templates.archive).toBeDefined();
    // …and the merchant's own body of a key they DID author is untouched.
    expect(sectionIds(templates.index)).toEqual(["hero_carousel-1"]);
  });

  it("never overwrites a key the merchant's map already carries", async () => {
    const db = installDb({
      sourceKey: "songoskriti",
      draft: {
        index: body("hero_carousel"),
        blog: body("blog_archive"),
      },
    });
    await installRegistryTheme(db.asClient(), MERCHANT, "songoskriti", true);
    const templates = installedTemplates(db);
    expect(sectionIds(templates.index)).toEqual(["hero_carousel-1"]);
    expect(sectionIds(templates.blog)).toEqual(["blog_archive-1"]);
    // The keys the merchant does not carry come from the package.
    expect(templates.archive).toBeDefined();
    expect(templates.collection).toBeDefined();
  });
});

describe("the seed merge — two themes are never mixed", () => {
  it("does not merge a DIFFERENT theme's draft into the install", async () => {
    // The merchant's active theme was installed from `acme-pack`; the
    // install is for `songoskriti`. The two themes' bodies must never end
    // up in one version.
    const db = installDb({
      sourceKey: "acme-pack",
      draft: {
        index: body("hero_carousel"),
        archive_category: body("blog_archive"),
      },
    });
    await installRegistryTheme(db.asClient(), MERCHANT, "songoskriti", true);
    const templates = installedTemplates(db);
    // The other theme's bodies are NOT in the installed map.
    expect(templates.archive_category).toBeUndefined();
    expect(sectionIds(templates.index)).not.toEqual(["hero_carousel-1"]);
    // The installed theme's own package map is what is written.
    expect(templates.archive).toBeDefined();
  });

  it("does not merge when the active theme records no source key at all", async () => {
    // A merchant's own hand-made theme has no upstream: "no source" is not
    // "any source", so the package's map is written as it stands.
    const db = installDb({
      sourceKey: null,
      draft: {
        index: body("hero_carousel"),
        archive_category: body("blog_archive"),
      },
    });
    await installRegistryTheme(db.asClient(), MERCHANT, "songoskriti", true);
    const templates = installedTemplates(db);
    expect(templates.archive_category).toBeUndefined();
    expect(templates.archive).toBeDefined();
  });

  it("accepts a marketplace install whose source key is the theme row's slug", async () => {
    // A marketplace install names its registry key on the theme row, not on
    // a version — the gate must read that shape too.
    const db = installDb({
      sourceKey: null,
      listingSlug: "songoskriti",
      draft: {
        index: body("hero_carousel"),
        archive_category: body("blog_archive"),
      },
    });
    await installRegistryTheme(db.asClient(), MERCHANT, "songoskriti", true);
    const templates = installedTemplates(db);
    expect(templates.archive_category).toBeDefined();
    expect(sectionIds(templates.index)).toEqual(["hero_carousel-1"]);
    expect(templates.archive).toBeDefined();
  });

  it("reads ONE theme's draft — the theme it selected — and never another theme's", async () => {
    // Two theme rows for the same merchant, each with its own draft. The
    // read is scoped to a single theme (the one the RPC writes to), so the
    // other theme's draft — and its variant key — must not leak in.
    //
    // (The fake DB applies the LAST `.order()` only, so the row it selects
    // is the OLDEST; the assertion below is about the SCOPE of the read,
    // which is the property under test.)
    const db = fakeDb({
      tables: {
        store_themes: [
          {
            id: THEME_ID,
            merchant_id: MERCHANT,
            name: "Songoskriti",
            is_active: true,
            created_at: "2025-01-01T00:00:00.000Z",
            source_listing_slug: "songoskriti",
          },
          {
            id: OTHER_THEME_ID,
            merchant_id: MERCHANT,
            name: "Acme Pack",
            is_active: false,
            created_at: "2026-01-01T00:00:00.000Z",
            source_listing_slug: "acme-pack",
          },
        ],
        theme_drafts: [
          {
            id: "draft-selected",
            theme_id: THEME_ID,
            merchant_id: MERCHANT,
            revision: 3,
            templates: { index: body("hero_carousel") },
            tokens: {},
          },
          {
            id: "draft-other",
            theme_id: OTHER_THEME_ID,
            merchant_id: MERCHANT,
            revision: 1,
            templates: {
              index: body("old_widget"),
              archive_category: body("blog_archive"),
            },
            tokens: {},
          },
        ],
        theme_versions: [],
        theme_registry: [],
        seo_templates: [],
        theme_audit: [],
      },
      rpc: (fn) =>
        fn === "theme_install_preset"
          ? { data: "installed-version-id", error: null }
          : { data: null, error: { message: `rpc_not_stubbed:${fn}` } },
    });
    await installRegistryTheme(db.asClient(), MERCHANT, "songoskriti", true);
    const templates = installedTemplates(db);
    // The selected theme's body is the one that is merged …
    expect(sectionIds(templates.index)).toEqual(["hero_carousel-1"]);
    // … and the OTHER theme's draft — its body and its variant key — is not.
    expect(templates.archive_category).toBeUndefined();
    expect(sectionIds(templates.index)).not.toEqual(["old_widget-1"]);
  });
});
