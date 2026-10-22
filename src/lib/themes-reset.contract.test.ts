/**
 * Batch C fix round — the RESET contract.
 *
 * The reset is the most destructive affordance the builder ships: it
 * REPLACES one template with the theme's own default and writes a new
 * version. It shipped with **no test at all** — `grep -rn
 * "resetTemplateToDefault" src/` found only the definition and its
 * server-fn wrapper — so an unverified destructive path was in the tree.
 *
 * This suite drives the REAL `resetTemplateToDefault` through the REAL
 * `fakeDb` and pins the five properties the affordance promises:
 *
 *  1. **Exactly ONE key is replaced.** Every other key — the other
 *     variants included — is BYTE-IDENTICAL to what the merchant had.
 *  2. **A NEW version is written.** `theme_commit` runs once and
 *     `theme_publish` NEVER runs: the reset is a draft action, and
 *     publishing stays the merchant's explicit second step.
 *  3. **The draft revision advances**, so an in-flight editor autosave
 *     (which carries an older revision) cannot put the discarded body back.
 *  4. **An unknown key is refused**, before anything is written.
 *  5. **A VARIANT reset restores the theme's AUTHORED variant body.**
 *     This is the case the review found broken: the preset bag carried
 *     only `preview.templates` and dropped `preview.variants`, so the
 *     reset of `blog_listing` found no authored body and wrote the EMPTY
 *     AST — erasing Songoskriti's own `blog_listing` composition.
 *
 * The suite is self-contained: the server module is imported through the
 * same `vi.mock` seam the neighbouring suites use (`observability.server`
 * and `rate-limit.server`), so the reset's own metric and rate-limit calls
 * never touch Redis.
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

const { resetTemplateToDefault } = await import("./themes.server");
const { DEFAULT_TOKENS, TEMPLATE_KEYS, parseTemplates } =
  await import("./builder-ast");
const { TEMPLATE_VARIANT_KEYS } = await import("./template-variants");
const { resolveThemePreview } = await import("./theme-preview-nav");

const MERCHANT = "33333333-3333-4333-8333-333333333333";
const THEME = "44444444-4444-4444-8444-444444444444";

/** A tiny authored body — one section, so it is not the empty AST. */
function body(type: string, id: string) {
  return {
    header: [],
    main: [{ id, type, props: {} }],
    footer: [],
  };
}

/**
 * A merchant's WHOLE map: every base key the platform knows and every
 * variant of the closed vocabulary, each with the merchant's OWN body (so
 * a reset of any one of them is observable).
 */
function merchantMap() {
  const map: Record<string, unknown> = {};
  for (const key of TEMPLATE_KEYS) map[key] = body("heading", `${key}-mine`);
  for (const variant of TEMPLATE_VARIANT_KEYS) {
    map[variant] = body("heading", `${variant}-mine`);
  }
  return map;
}

/** The exact bytes of one key, as the storage layer sees them. */
function bytes(value: unknown): string {
  return JSON.stringify(value);
}

/** The merchant's map as the storage layer holds it. */
function storedBaseline(map: Record<string, unknown>) {
  return parseTemplates(JSON.parse(JSON.stringify(map)));
}

/**
 * A workspace with the merchant's draft, ready for a reset.
 *
 * The theme's `source_listing_slug` is `songoskriti`, so the reset resolves
 * the theme's OWN authored default — the same source the editor previews.
 */
function resetDb(draft: Record<string, unknown>, revision = 3) {
  return fakeDb({
    tables: {
      store_themes: [
        {
          id: THEME,
          merchant_id: MERCHANT,
          name: "Songoskriti",
          is_active: true,
          created_at: "2026-01-01T00:00:00.000Z",
          source_listing_slug: "songoskriti",
        },
      ],
      theme_drafts: [
        {
          id: "draft-1",
          theme_id: THEME,
          merchant_id: MERCHANT,
          revision,
          templates: draft,
          tokens: { ...DEFAULT_TOKENS },
          updated_at: "2026-01-02T00:00:00.000Z",
        },
      ],
      theme_versions: [
        {
          id: "version-live",
          theme_id: THEME,
          merchant_id: MERCHANT,
          version: 1,
          status: "published",
          templates: {},
          tokens: { ...DEFAULT_TOKENS },
        },
      ],
      theme_custom_code: [],
      theme_audit: [],
      theme_schedules: [],
    },
    rpc: (fn) => {
      if (fn === "theme_commit") return { data: "version-new", error: null };
      if (fn === "theme_autosave") {
        return { data: { revision: 4, applied: true }, error: null };
      }
      // `theme_publish` is stubbed so a CALL to it is observable — the
      // reset must never make one.
      if (fn === "theme_publish") return { data: null, error: null };
      return { data: null, error: { message: `rpc_not_stubbed:${fn}` } };
    },
  });
}

/** The templates the commit RPC actually received. */
function committedTemplates(db: ReturnType<typeof fakeDb>) {
  const call = db.rpcCalls("theme_commit")[0];
  expect(call, "the reset must call theme_commit").toBeDefined();
  return (call!.args as { _templates: Record<string, unknown> })._templates;
}

describe("the reset replaces exactly ONE key", () => {
  it("replaces the selected key and leaves every other key byte-identical", async () => {
    const mine = merchantMap();
    const baseline = storedBaseline(mine);
    const db = resetDb(mine);
    const out = await resetTemplateToDefault(db.asClient(), MERCHANT, {
      themeId: THEME,
      template: "index",
    });
    expect(out.template).toBe("index");
    const saved = committedTemplates(db);
    // The reset key is the theme's OWN default — not the merchant's body.
    expect(bytes(saved["index"])).not.toBe(bytes(baseline["index"]));
    // Every other key rides the map untouched …
    for (const key of [...TEMPLATE_KEYS, ...TEMPLATE_VARIANT_KEYS]) {
      if (key === "index") continue;
      expect(bytes(saved[key]), `${key} must be untouched`).toBe(
        bytes(baseline[key]),
      );
    }
    // … and the map carries no key the merchant's map did not have.
    expect(Object.keys(saved).sort()).toEqual(
      [...TEMPLATE_KEYS, ...TEMPLATE_VARIANT_KEYS].sort(),
    );
  });

  it("writes a NEW version and NEVER publishes", async () => {
    const db = resetDb(merchantMap());
    const out = await resetTemplateToDefault(db.asClient(), MERCHANT, {
      themeId: THEME,
      template: "blog",
    });
    // A new, immutable version — the reset is itself rollback-able.
    expect(out.versionId).toBe("version-new");
    expect(db.rpcCalls("theme_commit")).toHaveLength(1);
    // Publishing stays the merchant's explicit second step.
    expect(db.rpcCalls("theme_publish")).toHaveLength(0);
  });

  it("advances the draft revision, so an in-flight autosave cannot undo it", async () => {
    const db = resetDb(merchantMap(), 3);
    await resetTemplateToDefault(db.asClient(), MERCHANT, {
      themeId: THEME,
      template: "blog",
    });
    const autosave = db.rpcCalls("theme_autosave")[0];
    expect(autosave, "the reset must advance the draft").toBeDefined();
    // The draft follows the reset with a HIGHER revision than it carried.
    expect((autosave!.args as { _revision: number })._revision).toBe(4);
  });

  it("refuses an unknown key — and writes nothing", async () => {
    const db = resetDb(merchantMap());
    await expect(
      resetTemplateToDefault(db.asClient(), MERCHANT, {
        themeId: THEME,
        template: "blog_bogus",
      }),
    ).rejects.toThrow(/Unknown template/);
    // Nothing was written: no version, no autosave, no publish.
    expect(db.rpcCalls("theme_commit")).toHaveLength(0);
    expect(db.rpcCalls("theme_autosave")).toHaveLength(0);
    expect(db.rpcCalls("theme_publish")).toHaveLength(0);
  });

  it("refuses a theme that is not the one the workspace holds — and writes nothing", async () => {
    // The workspace is the merchant's ACTIVE theme. A `themeId` for a
    // SECOND of the merchant's themes would otherwise receive the active
    // theme's templates.
    const mine = merchantMap();
    const db = resetDb(mine);
    await expect(
      resetTemplateToDefault(db.asClient(), MERCHANT, {
        themeId: "55555555-5555-4555-8555-555555555555",
        template: "index",
      }),
    ).rejects.toThrow(/is not the theme this workspace holds/);
    // Nothing was written: no version, no autosave, no publish.
    expect(db.rpcCalls("theme_commit")).toHaveLength(0);
    expect(db.rpcCalls("theme_autosave")).toHaveLength(0);
    expect(db.rpcCalls("theme_publish")).toHaveLength(0);
  });
});

describe("a STRAY variant key can be removed", () => {
  it("drops the key from the committed map, so the publish gate stops refusing it", async () => {
    // A key shaped `<known base>_<suffix>` whose suffix is NOT in the closed
    // vocabulary is a template nothing routes to. The publish gate refuses it
    // (`builder.unknown_variant`); the reset is the merchant's exit.
    const mine = merchantMap();
    mine["blog_anything"] = body("heading", "blog_anything-mine");
    const db = resetDb(mine);
    const out = await resetTemplateToDefault(db.asClient(), MERCHANT, {
      themeId: THEME,
      template: "blog_anything",
    });
    const saved = committedTemplates(db);
    // The key is GONE …
    expect(Object.keys(saved)).not.toContain("blog_anything");
    // … every other key is untouched …
    for (const key of [...TEMPLATE_KEYS, ...TEMPLATE_VARIANT_KEYS]) {
      expect(
        saved[key],
        `${key} must ride the removal untouched`,
      ).toBeDefined();
    }
    // … and the map that rides back no longer carries it either.
    expect(Object.keys(out.templates)).not.toContain("blog_anything");
  });

  it("still refuses the legacy `page_<slug>` shape — it is exempt, not stray", async () => {
    const mine = merchantMap();
    mine["page_about_us"] = body("heading", "page_about_us-mine");
    const db = resetDb(mine);
    // `page_about_us` is a legal persisted key of a third-party package: it
    // is neither a known key nor a stray one, so the reset refuses it rather
    // than silently deleting a package's own layout.
    await expect(
      resetTemplateToDefault(db.asClient(), MERCHANT, {
        themeId: THEME,
        template: "page_about_us",
      }),
    ).rejects.toThrow(/Unknown template/);
    expect(db.rpcCalls("theme_commit")).toHaveLength(0);
  });
});

describe("a VARIANT reset restores the theme's AUTHORED variant body", () => {
  it("writes the theme's own `blog_listing` body — not the empty AST", async () => {
    const mine = merchantMap();
    const db = resetDb(mine);
    const out = await resetTemplateToDefault(db.asClient(), MERCHANT, {
      themeId: THEME,
      template: "blog_listing",
    });
    const saved = committedTemplates(db);
    // The theme's authored variant body — the preset's own `variants` map.
    const authored =
      resolveThemePreview("songoskriti")!.variants["blog_listing"]!;
    expect(authored.main.length).toBeGreaterThan(0);
    // The reset wrote THAT body …
    expect(
      (saved["blog_listing"] as { main: { id: string }[] }).main.map(
        (s) => s.id,
      ),
    ).toEqual(authored.main.map((s) => s.id));
    // … and NOT the empty AST the broken preset bag produced.
    expect(
      (saved["blog_listing"] as { main: unknown[] }).main.length,
    ).toBeGreaterThan(0);
    // The merchant's own body was REPLACED, not kept.
    expect(
      (saved["blog_listing"] as { main: { id: string }[] }).main.map(
        (s) => s.id,
      ),
    ).not.toContain("blog_listing-mine");
    // The result carries the reset key, the version and the whole map.
    expect(out.template).toBe("blog_listing");
    expect(out.versionId).toBe("version-new");
    expect(Object.keys(out.templates)).toContain("blog_listing");
    // The map that rides back is the STORED shape — the same parse the
    // commit RPC received — so the editor's document and the stored
    // document are the same bytes.
    expect(JSON.stringify(out.templates)).toBe(
      JSON.stringify(committedTemplates(db)),
    );
  });

  it("leaves the base `blog` body and the other variant untouched", async () => {
    const mine = merchantMap();
    const baseline = storedBaseline(mine);
    const db = resetDb(mine);
    await resetTemplateToDefault(db.asClient(), MERCHANT, {
      themeId: THEME,
      template: "blog_listing",
    });
    const saved = committedTemplates(db);
    // The base is a DIFFERENT key: a variant never overwrites its base …
    expect(bytes(saved["blog"])).toBe(bytes(baseline["blog"]));
    // … and the sibling variant is untouched too.
    expect(bytes(saved["blog_article"])).toBe(bytes(baseline["blog_article"]));
  });
});
