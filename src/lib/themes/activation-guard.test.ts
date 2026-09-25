/**
 * T3+I4 activation guard (TDD).
 * - Activating a draft-only theme materializes a separate published version
 *   from the merchant's draft: the UI offers Activate with no Publish action,
 *   so refusing was an undead end (636b5cb). It never goes live with an empty
 *   (pointer-less) storefront, never promotes the unreviewed draft row in
 *   place, and still refuses when there is nothing to seed from.
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
  it("materializes a draft-only theme instead of going live empty", async () => {
    const db = guardDb({
      pointer: null,
      versions: [{ id: "v-draft", version: 1, status: "draft" }],
      draft: true,
    });
    const out = await activateTheme(db.asClient(), MERCHANT, THEME, "user-9");
    expect(out.id).toBe(THEME);
    const themes = db.rows("store_themes");
    expect(themes.find((r) => r.id === THEME)!.is_active).toBe(true);
    // Mutual exclusion: activating one theme deactivates the other.
    expect(themes.find((r) => r.id === OTHER)!.is_active).toBe(false);
    // The unreviewed draft version row is never promoted in place…
    expect(
      db.rows("theme_versions").find((r) => r.id === "v-draft")!.status,
    ).toBe("draft");
    // …the pointer lands on a separate published v1 seeded from the merchant
    // draft, so the storefront is never active-but-empty.
    const pointer = themes.find((r) => r.id === THEME)!.published_version_id;
    expect(pointer).toBeTruthy();
    expect(pointer).not.toBe("v-draft");
    const pointed = db.rows("theme_versions").find((r) => r.id === pointer);
    expect(pointed?.status).toBe("published");
    expect(pointed?.templates).toEqual({
      index: { header: [], main: [], footer: [] },
    });
    // Exactly one real activation is audited.
    expect(
      db.rows("theme_audit").filter((r) => r.action === "theme.activated"),
    ).toHaveLength(1);
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
    const out = await activateTheme(db.asClient(), MERCHANT, THEME);
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
    const out = await activateTheme(db.asClient(), MERCHANT, THEME);
    expect(out.id).toBe(THEME);
    expect(
      db.rows("store_themes").find((r) => r.id === THEME)!.published_version_id,
    ).toBe("v-reviewed");
    expect(
      db.rows("theme_versions").find((r) => r.id === "v-unreviewed")!.status,
    ).toBe("draft");
    // Activation must not rewrite version rows at all on this path.
    expect(
      db.callsOf("update").filter((c) => c.table === "theme_versions"),
    ).toHaveLength(0);
  });

  it("refuses when nothing publishable exists at all", async () => {
    const db = guardDb({ pointer: null, versions: [], draft: false });
    const err = await activateTheme(db.asClient(), MERCHANT, THEME).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ThemeDeskError);
    expect(String(err?.message)).toMatch(/no published version/i);
    expect(db.rows("store_themes").find((r) => r.id === THEME)!.is_active).toBe(
      false,
    );
    expect(
      db.rows("theme_audit").filter((r) => r.action === "theme.activated"),
    ).toHaveLength(0);
  });
});
