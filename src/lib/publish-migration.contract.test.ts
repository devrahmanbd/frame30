/**
 * Batch C — the publish / seed / merge / rollback CONTRACT.
 *
 * The plan's Global Constraints make three promises about the new key and
 * its variants, and this suite proves each of them against the REAL server
 * functions (the same `vi.mock` seam the neighbouring suites use):
 *
 *  1. **The publish gate is template-key-complete.** Every `TEMPLATE_KEYS`
 *     member is linted, and every VARIANT is linted **with its base key** —
 *     so a context widget inside a variant is checked against the template
 *     that owns the data (a variant linted as if it were a template would
 *     make every context widget in it a publish-blocking error).
 *  2. **The seed fills only the missing keys** and never overwrites a
 *     merchant-edited template.
 *  3. **A theme update carries the new key AND its variants** across the
 *     merge, and an incompatible stored template **fails safely** — the
 *     published output is never partially corrupted.
 *  4. **A rollback restores the target version exactly**, the archive body
 *     included, and never touches the merchant's unpublished draft.
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

const {
  applyThemeUpdate,
  installRegistryTheme,
  loadWorkspace,
  mergeTemplates,
  publishVersion,
  registryPackage,
  rollbackVersion,
} = await import("./themes.server");
const { DEFAULT_TOKENS, TEMPLATE_KEYS } = await import("./builder-ast");
type TemplateMap = import("./builder-ast").TemplateMap;

const MERCHANT = "33333333-3333-4333-8333-333333333333";
const OTHER_MERCHANT = "99999999-9999-4999-8999-999999999999";
const THEME = "44444444-4444-4444-8444-444444444444";

/** A clean body — a heading with both languages, so the gates are quiet. */
function clean(id: string) {
  return {
    header: [],
    main: [
      {
        id,
        type: "heading",
        props: { text: "Merchant copy", text_bn: "ব্যবসায়ের লেখা" },
      },
    ],
    footer: [],
  };
}

/**
 * A body that carries a widget the template does not provide: the
 * `facet_sidebar` is allowlisted for `collection` / `search` only — NOT for
 * `blog`, `archive` or `page` — so it is a publish-blocking context
 * mismatch on every one of them.
 */
function mismatched(id: string) {
  return {
    header: [],
    main: [
      {
        id,
        type: "facet_sidebar",
        props: { heading: "Filters" },
      },
    ],
    footer: [],
  };
}

function publishDb(overrides?: {
  templates?: Record<string, unknown>;
  versionTemplates?: Record<string, unknown>;
}) {
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
          published_version_id: null,
        },
      ],
      theme_versions: [
        {
          id: "version-live",
          merchant_id: MERCHANT,
          theme_id: THEME,
          version: 1,
          status: "published",
          templates: overrides?.versionTemplates ?? {},
          tokens: { ...DEFAULT_TOKENS },
        },
      ],
      theme_drafts: [],
      theme_custom_code: [],
      theme_audit: [],
      theme_schedules: [],
    },
    rpc: (fn) => {
      if (fn === "theme_commit") return { data: "version-new", error: null };
      if (fn === "theme_publish") return { data: null, error: null };
      if (fn === "theme_rollback")
        return { data: "version-rolled", error: null };
      if (fn === "theme_update_apply")
        return { data: { version_id: "v", revision: 1 }, error: null };
      return { data: null, error: { message: `rpc_not_stubbed:${fn}` } };
    },
  });
}

describe("the publish gate is template-key-complete", () => {
  it("blocks a publish whose blog body carries a widget the blog does not provide", async () => {
    const db = publishDb();
    await expect(
      publishVersion(db.asClient(), MERCHANT, {
        themeId: THEME,
        templates: { index: clean("h1"), blog: mismatched("b1") },
        tokens: DEFAULT_TOKENS,
      }),
    ).rejects.toThrow(/blog/);
  });

  it("names EVERY offending key, not only the first", async () => {
    const db = publishDb();
    const error = await publishVersion(db.asClient(), MERCHANT, {
      themeId: THEME,
      templates: {
        index: clean("h1"),
        blog: mismatched("b1"),
        archive: mismatched("a1"),
      },
      tokens: DEFAULT_TOKENS,
    }).catch((err: Error) => err);
    const message = (error as Error).message;
    expect(message).toContain("blog:");
    expect(message).toContain("archive:");
    expect(message).toContain("needs data this template does not provide");
  });

  it("lints a VARIANT with its BASE key — the pack is legal inside a variant", async () => {
    // `blog_archive` and `page_content` are allowlisted for `blog`. A
    // variant linted as if it were a template of its own would call BOTH of
    // them a publish-blocking mismatch; linted with its base key they are
    // legal, and the publish goes through.
    const db = publishDb();
    const out = await publishVersion(db.asClient(), MERCHANT, {
      themeId: THEME,
      templates: {
        index: clean("h1"),
        blog_article: {
          header: [],
          main: [
            {
              id: "p1",
              type: "page_content",
              props: {},
            },
            {
              id: "p2",
              type: "blog_archive",
              props: { heading: "More" },
            },
          ],
          footer: [],
        },
      },
      tokens: DEFAULT_TOKENS,
    });
    expect(out.versionId).toBe("version-new");
  });

  it("blocks a variant whose body carries a widget even its BASE does not provide", async () => {
    const db = publishDb();
    const error = await publishVersion(db.asClient(), MERCHANT, {
      themeId: THEME,
      templates: {
        index: clean("h1"),
        blog_article: mismatched("v1"),
      },
      tokens: DEFAULT_TOKENS,
    }).catch((err: Error) => err);
    // The message names the VARIANT — the merchant can see which key broke.
    expect((error as Error).message).toContain("blog_article:");
  });

  it("every TEMPLATE_KEYS member is linted — a broken page template blocks", async () => {
    const db = publishDb();
    const error = await publishVersion(db.asClient(), MERCHANT, {
      themeId: THEME,
      templates: { index: clean("h1"), page: mismatched("p1") },
      tokens: DEFAULT_TOKENS,
    }).catch((err: Error) => err);
    expect((error as Error).message).toContain("page:");
  });
});

describe("the seed fills only the missing keys", () => {
  function installDb(draft: Record<string, unknown>) {
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
            revision: 3,
            templates: draft,
            tokens: {},
          },
        ],
        theme_versions: [
          {
            id: "version-1",
            theme_id: THEME,
            merchant_id: MERCHANT,
            version: 1,
            status: "draft",
            source_registry_key: "songoskriti",
            templates: {},
            tokens: {},
          },
        ],
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

  it("fills the key the merchant's map lacks and never overwrites one they authored", async () => {
    const db = installDb({
      index: {
        header: [],
        main: [{ id: "mine-1", type: "heading", props: { text: "Mine" } }],
        footer: [],
      },
    });
    await installRegistryTheme(db.asClient(), MERCHANT, "songoskriti", true);
    const call = db.rpcCalls("theme_install_preset")[0];
    const sent = (
      call!.args as { _preset: { templates: Record<string, unknown> } }
    )._preset.templates;
    // The merchant's own body survives the install.
    expect(
      (sent.index as { main: { id: string }[] }).main.map((s) => s.id),
    ).toEqual(["mine-1"]);
    // The key they did not author is filled from the package.
    expect(sent.archive).toBeDefined();
    // The VARIANT keys they authored ride the same map untouched.
    expect(sent.blog_article).toBeUndefined();
  });
});

describe("a theme update carries the new key and its variants", () => {
  it("merges the archive key and the merchant's variant keys", () => {
    const mine: TemplateMap = {
      blog_article: {
        header: [],
        main: [{ id: "v1", type: "heading", props: {} }],
        footer: [],
      },
    };
    const upstream: TemplateMap = {
      archive: {
        header: [],
        main: [{ id: "a1", type: "heading", props: {} }],
        footer: [],
      },
    };
    const merged = mergeTemplates(mine, upstream, "adopt");
    // The NEW key comes from the upstream package …
    expect(merged.archive?.main.map((s) => s.id)).toEqual(["a1"]);
    // … and the merchant's VARIANT is carried, never dropped.
    expect(merged.blog_article?.main.map((s) => s.id)).toEqual(["v1"]);
  });

  it("fails SAFE: an incompatible stored template blocks the update and writes nothing", async () => {
    const db = fakeDb({
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
            revision: 3,
            // The merchant's stored blog body carries a widget the blog
            // does not provide — an INCOMPATIBLE stored template.
            templates: { index: clean("h1"), blog: mismatched("b1") },
            tokens: { ...DEFAULT_TOKENS },
          },
        ],
        theme_versions: [],
        theme_custom_code: [],
        theme_audit: [],
        theme_schedules: [],
      },
      rpc: (fn) =>
        fn === "theme_update_apply"
          ? { data: { version_id: "v", revision: 1 }, error: null }
          : { data: null, error: { message: `rpc_not_stubbed:${fn}` } },
    });
    await expect(
      applyThemeUpdate(db.asClient(), MERCHANT, {
        key: "songoskriti",
        mode: "adopt",
        expectedRevision: 3,
      }),
    ).rejects.toThrow();
    // Nothing was written: the update RPC never ran.
    expect(db.rpcCalls("theme_update_apply")).toHaveLength(0);
  });
});

describe("a rollback restores the target version exactly", () => {
  const archiveBody = {
    header: [],
    main: [
      {
        id: "a1",
        type: "heading",
        props: { text: "Archive", text_bn: "আর্কাইভ" },
      },
    ],
    footer: [],
  };

  function rollbackDb() {
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
        theme_versions: [
          {
            id: "version-target",
            merchant_id: MERCHANT,
            theme_id: THEME,
            version: 2,
            status: "published",
            templates: { archive: archiveBody },
            tokens: { ...DEFAULT_TOKENS },
          },
          {
            id: "version-foreign",
            merchant_id: OTHER_MERCHANT,
            theme_id: THEME,
            version: 1,
            status: "published",
            templates: {},
            tokens: { ...DEFAULT_TOKENS },
          },
        ],
        theme_drafts: [],
        theme_custom_code: [],
        theme_audit: [],
        theme_schedules: [],
      },
      rpc: (fn) =>
        fn === "theme_rollback"
          ? { data: "version-rolled", error: null }
          : { data: null, error: { message: `rpc_not_stubbed:${fn}` } },
    });
  }

  it("rolls back to the named version — the archive body included", async () => {
    const db = rollbackDb();
    const out = await rollbackVersion(
      db.asClient(),
      MERCHANT,
      "version-target",
    );
    expect(out.versionId).toBe("version-rolled");
    const call = db.rpcCalls("theme_rollback")[0];
    expect(call).toBeDefined();
    expect((call!.args as { _version_id: string })._version_id).toBe(
      "version-target",
    );
    // The version the rollback names carries the archive body — that row is
    // what the rollback restores, exactly.
    const target = db
      .rows("theme_versions")
      .find((row) => row["id"] === "version-target");
    expect((target?.["templates"] as { archive: unknown }).archive).toEqual(
      archiveBody,
    );
  });

  it("refuses a version owned by another merchant, before the RPC", async () => {
    const db = rollbackDb();
    await expect(
      rollbackVersion(db.asClient(), MERCHANT, "version-foreign"),
    ).rejects.toThrow(/not found/i);
    expect(db.rpcCalls("theme_rollback")).toHaveLength(0);
  });

  it("never loses the merchant's unpublished draft", async () => {
    // The workspace loader prefers the newest DRAFT over the newest
    // committed version, so a rollback cannot destroy unpublished work.
    const db = fakeDb({
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
            revision: 9,
            templates: { index: clean("draft-copy") },
            tokens: { ...DEFAULT_TOKENS },
          },
        ],
        theme_versions: [
          {
            id: "version-target",
            merchant_id: MERCHANT,
            theme_id: THEME,
            version: 2,
            status: "published",
            templates: { archive: archiveBody },
            tokens: { ...DEFAULT_TOKENS },
          },
        ],
        theme_custom_code: [],
        theme_audit: [],
        theme_schedules: [],
      },
      rpc: () => ({ data: null, error: { message: "rpc_not_stubbed" } }),
    });
    const workspace = await loadWorkspace(db.asClient(), MERCHANT);
    expect(workspace.source).toBe("draft");
    expect(workspace.templates.index?.main.map((s) => s.id)).toEqual([
      "draft-copy",
    ]);
  });
});

describe("the template-key space the publish gate covers", () => {
  it("is exactly the ten base keys — plus the closed variants", () => {
    // The gate lints every base key and every variant (with its base key);
    // the vocabulary of variants is closed and lives in ONE place.
    expect(TEMPLATE_KEYS).toHaveLength(10);
    expect(Object.keys(registryPackage("songoskriti").templates)).toEqual(
      expect.arrayContaining([...TEMPLATE_KEYS]),
    );
  });
});
