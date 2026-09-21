/**
 * T3+I4 activation guard (TDD).
 * - Activating a draft-only theme must refuse with a clear error, never go
 *   live with an empty (pointer-less) storefront or auto-publish unreviewed
 *   drafts.
 * - Activation adopts the reviewed *published* version, never MAX(version).
 * - A valid published pointer is kept as-is; activation never rewrites it.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "../__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "../__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({ holder: null as any }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("../observability.server", () => rec.holder!.observability);
vi.mock("../rate-limit.server", () => allowAllRateLimits());

const { activateTheme } = await import("./appearance.server");
const { ThemeDeskError } = await import("./appearance.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const THEME = "44444444-4444-4444-4444-444444444444";
const OTHER = "77777777-7777-7777-7777-777777777777";

beforeEach(() => recorder.reset());

function guardDb(opts: {
  pointer?: string | null;
  versions?: Array<{ id: string; version: number; status: string }>;
  draft?: boolean;
}) {
  return fakeDb({
    tables: {
      store_themes: [
        {
          id: THEME,
          merchant_id: MERCHANT,
          name: "Target",
          is_active: false,
          published_version_id: opts.pointer ?? null,
        },
        { id: OTHER, merchant_id: MERCHANT, name: "Live", is_active: true },
      ],
      theme_versions: (opts.versions ?? []).map((v) => ({
        id: v.id,
        merchant_id: MERCHANT,
        theme_id: THEME,
        version: v.version,
        status: v.status,
        templates: { index: { header: [], main: [], footer: [] } },
        tokens: {},
      })),
      theme_drafts: opts.draft
        ? [
            {
              theme_id: THEME,
              merchant_id: MERCHANT,
              templates: { index: { header: [], main: [], footer: [] } },
              tokens: {},
              revision: 1,
            },
          ]
        : [],
      theme_audit: [],
    },
  });
}

describe("activation guard", () => {
  it("refuses a draft-only theme instead of going live empty", async () => {
    const db = guardDb({
      pointer: null,
      versions: [{ id: "v-draft", version: 1, status: "draft" }],
      draft: true,
    });
    const err = await activateTheme(db.asClient(), MERCHANT, THEME).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ThemeDeskError);
    expect(String(err?.message)).toMatch(/no published version/i);
    // Refused activation must not strand the merchant on an empty theme…
    const themes = db.rows("store_themes");
    expect(themes.find((r) => r.id === THEME)!.is_active).toBe(false);
    expect(themes.find((r) => r.id === OTHER)!.is_active).toBe(true);
    expect(themes.find((r) => r.id === THEME)!.published_version_id).toBeNull();
    // …must not auto-publish the unreviewed draft…
    expect(
      db.rows("theme_versions").find((r) => r.id === "v-draft")!.status,
    ).toBe("draft");
    // …and must not record a phantom activation.
    expect(
      db.rows("theme_audit").filter((r) => r.action === "theme.activated"),
    ).toHaveLength(0);
  });

  it("adopts the reviewed published version, not MAX(version)", async () => {
    const db = guardDb({
      pointer: null,
      versions: [
        { id: "v-reviewed", version: 1, status: "published" },
        { id: "v-unreviewed", version: 2, status: "draft" },
      ],
      draft: true,
    });
    const out: any = await activateTheme(db.asClient(), MERCHANT, THEME);
    expect(out.id).toBe(THEME);
    const themes = db.rows("store_themes");
    expect(themes.find((r) => r.id === THEME)!.is_active).toBe(true);
    expect(themes.find((r) => r.id === THEME)!.published_version_id).toBe(
      "v-reviewed",
    );
    expect(
      db.rows("theme_versions").find((r) => r.id === "v-unreviewed")!.status,
    ).toBe("draft");
  });

  it("keeps a valid published pointer and never promotes MAX", async () => {
    const db = guardDb({
      pointer: "v-reviewed",
      versions: [
        { id: "v-reviewed", version: 1, status: "published" },
        { id: "v-unreviewed", version: 2, status: "draft" },
      ],
    });
    const out: any = await activateTheme(db.asClient(), MERCHANT, THEME);
    expect(out.id).toBe(THEME);
    expect(
      db.rows("store_themes").find((r) => r.id === THEME)!
        .published_version_id,
    ).toBe("v-reviewed");
    expect(
      db.rows("theme_versions").find((r) => r.id === "v-unreviewed")!.status,
    ).toBe("draft");
    // Activation must not rewrite version rows at all on this path.
    expect(db.callsOf("update").filter((c) => c.table === "theme_versions"))
      .toHaveLength(0);
  });

  it("refuses when nothing publishable exists at all", async () => {
    const db = guardDb({ pointer: null, versions: [], draft: false });
    await expect(
      activateTheme(db.asClient(), MERCHANT, THEME),
    ).rejects.toThrow(/no published version/i);
    expect(
      db.rows("store_themes").find((r) => r.id === THEME)!.is_active,
    ).toBe(false);
  });
});
