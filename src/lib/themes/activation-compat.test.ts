/**
 * Frame30 swap-in 3 — activation compatibility gate (TDD).
 *
 * - New path engages: `collectActivationWidgetIds` extracts extension,
 *   plugin_block and builtin ids (nested included); a foreign/unknown widget
 *   refuses activation with a recoverable `theme.incompatible_widgets` error
 *   BEFORE any flag flips.
 * - Old path byte-identical when inactive: empty templates and compatible
 *   builtin pages activate exactly as before (existing activation suites are
 *   the legacy proof — this file only adds the blocking case).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "../__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "../__fixtures__/test-doubles";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("../observability.server", () => rec.holder!.observability);
vi.mock("../rate-limit.server", () => allowAllRateLimits());

const { activateTheme, ThemeDeskError, collectActivationWidgetIds } =
  await import("./appearance.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const THEME = "44444444-4444-4444-4444-444444444444";
const OTHER = "77777777-7777-7777-7777-777777777777";

beforeEach(() => recorder.reset());

function dbWithTemplates(templates: unknown) {
  const versionId = "v-published";
  return fakeDb({
    tables: {
      store_themes: [
        {
          id: THEME,
          merchant_id: MERCHANT,
          name: "Target",
          is_active: false,
          published_version_id: versionId,
          source_listing_slug: null,
        },
        { id: OTHER, merchant_id: MERCHANT, name: "Live", is_active: true },
      ],
      theme_versions: [
        {
          id: versionId,
          merchant_id: MERCHANT,
          theme_id: THEME,
          version: 1,
          status: "published",
          templates,
          tokens: {},
        },
      ],
      theme_drafts: [],
      theme_audit: [],
    },
  });
}

describe("collectActivationWidgetIds", () => {
  it("extracts extension, plugin_block and builtin ids including children", () => {
    const ids = collectActivationWidgetIds({
      index: {
        header: [],
        main: [
          {
            id: "e1",
            type: "extension",
            widgetKey: "plugin:acme/reviews",
            props: {},
          },
          {
            id: "p1",
            type: "plugin_block",
            props: { pluginKey: "plugin:acme/other" },
          },
          { id: "h1", type: "hero", props: {} },
          {
            id: "c1",
            type: "container",
            props: {},
            children: [
              {
                id: "e2",
                type: "extension",
                widgetKey: "builtin:faq",
                props: {},
              },
            ],
          },
        ],
        footer: [],
      },
    });
    expect(ids).toContain("plugin:acme/reviews");
    expect(ids).toContain("plugin:acme/other");
    expect(ids).toContain("hero");
    expect(ids).toContain("builtin:faq");
  });

  it("skips unpointed app blocks and hostile shapes", () => {
    expect(
      collectActivationWidgetIds({
        index: {
          header: [],
          main: [{ id: "p0", type: "plugin_block", props: {} }],
          footer: [],
        },
      }),
    ).toEqual([]);
    expect(collectActivationWidgetIds(null)).toEqual([]);
    expect(collectActivationWidgetIds({ index: null })).toEqual([]);
  });
});

describe("activation compatibility gate", () => {
  it("blocks a foreign theme widget with a recoverable listing, flipping nothing", async () => {
    const templates = {
      index: {
        header: [],
        main: [
          {
            id: "ext-foreign",
            type: "extension",
            widgetKey: "theme:other-party/secret",
            props: { title: "Kept" },
          },
        ],
        footer: [],
      },
    };
    const db = dbWithTemplates(templates);
    const err = await activateTheme(db.asClient(), MERCHANT, THEME).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ThemeDeskError);
    expect(err?.code).toBe("theme.incompatible_widgets");
    expect(String(err?.message)).toContain("theme:other-party/secret");
    // Refusal flips nothing and audits nothing.
    expect(db.rows("store_themes").find((r) => r.id === THEME)!.is_active).toBe(
      false,
    );
    expect(
      db.rows("theme_audit").filter((r) => r.action === "theme.activated"),
    ).toHaveLength(0);
  });

  it("lets an empty page through untouched (legacy pass-through)", async () => {
    const db = dbWithTemplates({ index: { header: [], main: [], footer: [] } });
    const out = await activateTheme(db.asClient(), MERCHANT, THEME);
    expect(out.id).toBe(THEME);
    expect(db.rows("store_themes").find((r) => r.id === THEME)!.is_active).toBe(
      true,
    );
  });
});
