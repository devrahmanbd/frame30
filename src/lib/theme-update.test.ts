import { describe, expect, it } from "vitest";
import {
  diffTemplates,
  loadPublishArtifact,
  mergeTemplates,
  publishVersion,
  resolvePublishPayload,
} from "./themes.server";
import { fakeDb } from "./__fixtures__/fake-db";
import { DEFAULT_TOKENS, type ThemeTemplates } from "./builder-ast";

const section = (id: string, title = "a") => ({
  id,
  type: "heading" as const,
  props: { title },
});

const tree = (ids: [string, string][]): ThemeTemplates => ({
  index: {
    header: [],
    main: ids.map(([id, title]) => section(id, title)),
    footer: [],
  },
});

describe("theme update diff", () => {
  const mine = tree([
    ["hero-1", "mine"],
    ["custom-1", "mine"],
  ]);
  const upstream = tree([
    ["hero-1", "upstream"],
    ["promo-1", "upstream"],
  ]);

  it("classifies added, removed and changed sections", () => {
    const [entry] = diffTemplates(mine, upstream);
    expect(entry?.template).toBe("index");
    expect(entry?.added).toEqual(["promo-1"]);
    expect(entry?.removed).toEqual(["custom-1"]);
    expect(entry?.changed).toEqual(["hero-1"]);
  });

  it("adopt takes upstream order and keeps merchant-only sections", () => {
    const merged = mergeTemplates(mine, upstream, "adopt");
    expect(merged.index?.main.map((s) => s.id)).toEqual([
      "hero-1",
      "promo-1",
      "custom-1",
    ]);
    expect(merged.index?.main[0]?.props.title).toBe("upstream");
  });

  it("keep_mine preserves merchant sections and appends only new ones", () => {
    const merged = mergeTemplates(mine, upstream, "keep_mine");
    expect(merged.index?.main.map((s) => s.id)).toEqual([
      "hero-1",
      "custom-1",
      "promo-1",
    ]);
    expect(merged.index?.main[0]?.props.title).toBe("mine");
  });

  it("never drops a template the merchant has but upstream omits", () => {
    const withPage: ThemeTemplates = {
      ...mine,
      page: { header: [], main: [section("page-1")], footer: [] },
    };
    const merged = mergeTemplates(withPage, upstream, "adopt");
    expect(merged.page?.main.map((s) => s.id)).toEqual(["page-1"]);
  });
});

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const THEME = "44444444-4444-4444-4444-444444444444";

function publishedDb() {
  return fakeDb({
    tables: {
      store_themes: [
        {
          id: THEME,
          merchant_id: MERCHANT,
          source_listing_slug: "songoskriti",
          published_version_id: "version-live",
        },
      ],
      theme_versions: [
        {
          id: "version-live",
          merchant_id: MERCHANT,
          theme_id: THEME,
          version: 2,
          status: "published",
          templates: {
            index: {
              header: [],
              main: [
                {
                  id: "s1",
                  type: "heading",
                  props: { text: "Live home", text_bn: "লাইভ হোম" },
                },
              ],
              footer: [],
            },
          },
          tokens: { ...DEFAULT_TOKENS },
        },
        {
          id: "version-old",
          merchant_id: MERCHANT,
          theme_id: THEME,
          version: 1,
          status: "published",
          templates: {
            index: {
              header: [],
              main: [
                {
                  id: "s0",
                  type: "heading",
                  props: { text: "Old", text_bn: "পুরোনো" },
                },
              ],
              footer: [],
            },
          },
          tokens: { ...DEFAULT_TOKENS },
        },
      ],
      theme_drafts: [],
      theme_custom_code: [],
      theme_audit: [],
    },
  });
}

describe("publish payload resolution (installed artifact authoritative, K2)", () => {
  const artifact = {
    templates: { index: { header: [], main: [], footer: [] } },
    tokens: { ...DEFAULT_TOKENS },
  };

  it("explicit input wins over artifact", () => {
    const out = resolvePublishPayload(
      { templates: { index: null }, tokens: { surface: "#1" } },
      artifact,
    );
    expect(out.templates).toEqual({ index: null });
    expect(out.tokens).toEqual({ surface: "#1" });
    expect(out.origin).toBe("input");
  });

  it("omitted fields fall back to the artifact (never source)", () => {
    const out = resolvePublishPayload({}, artifact);
    expect(out.templates).toEqual(artifact.templates);
    expect(out.tokens).toEqual(artifact.tokens);
    expect(out.origin).toBe("artifact");
    const mixed = resolvePublishPayload({ templates: { index: null } }, artifact);
    expect(mixed.templates).toEqual({ index: null });
    expect(mixed.tokens).toEqual(artifact.tokens);
    expect(mixed.origin).toBe("input");
  });

  it("no usable artifact fails closed with an explicit reason (never source, never empty)", () => {
    try {
      resolvePublishPayload({}, null);
      expect.unreachable();
    } catch (err) {
      expect((err as { code?: string }).code).toBe("builder.artifact_missing");
      expect((err as Error).message).toMatch(/Install the theme first/);
    }
  });

  it("malformed artifact payloads fail closed, never fall back", () => {
    try {
      resolvePublishPayload({}, { templates: "nope", tokens: [1, 2] } as never);
      expect.unreachable();
    } catch (err) {
      expect((err as { code?: string }).code).toBe("builder.artifact_missing");
    }
  });
});

describe("loadPublishArtifact (newest installed version row)", () => {
  it("returns the newest version row plus the theme source key", async () => {
    const db = publishedDb();
    const out = await loadPublishArtifact(db.asClient(), MERCHANT, THEME);
    expect(out?.versionId).toBe("version-live");
    expect(out?.themeKey).toBe("songoskriti");
    expect(out?.tokens).toEqual({ ...DEFAULT_TOKENS });
  });

  it("returns null for a theme that is not this merchant's", async () => {
    const db = publishedDb();
    const out = await loadPublishArtifact(
      db.asClient(),
      "99999999-9999-4999-8999-999999999999",
      THEME,
    );
    expect(out).toBeNull();
  });

  it("a theme with no version rows carries null content, never a crash", async () => {
    const db = fakeDb({
      tables: {
        store_themes: [
          {
            id: THEME,
            merchant_id: MERCHANT,
            source_listing_slug: null,
            published_version_id: null,
          },
        ],
        theme_versions: [],
      },
    });
    const out = await loadPublishArtifact(db.asClient(), MERCHANT, THEME);
    expect(out?.versionId).toBeNull();
    expect(out?.templates).toBeNull();
    expect(out?.themeKey).toBeNull();
  });
});

describe("publishVersion consumes the installed artifact", () => {
  it("identical content replays the live version instead of stacking a duplicate", async () => {
    const seed = publishedDb().tables;
    const rpcCalls: string[] = [];
    const db = fakeDb({
      tables: seed,
      rpc: (fn) => {
        rpcCalls.push(fn);
        return {
          data: fn === "theme_commit" ? "version-new" : null,
          error: null,
        };
      },
    });
    const out = await publishVersion(db.asClient(), MERCHANT, {
      themeId: THEME,
    });
    expect(out.versionId).toBe("version-live");
    expect(out.replayed).toBe(true);
    expect(out.origin).toBe("artifact");
    expect(rpcCalls).not.toContain("theme_commit");
    const audit = db.rows("theme_audit");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "theme.published" });
    expect(
      (audit[0] as { after: { version_id: string; origin: string } }).after,
    ).toMatchObject({ version_id: "version-live", origin: "artifact:replay" });
  });
});
