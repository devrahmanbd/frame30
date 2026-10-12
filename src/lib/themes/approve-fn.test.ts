/**
 * Threat-defense approval server fn (TDD).
 *
 * `themeApproveFn` exposes the existing `approveThemeVersion`
 * (`appearance.server.ts`, a read-only neighbour) through TanStack Start so
 * the themes desk can record explicit merchant approval of flagged content.
 * The fn is a thin delegate: permission + input shape live here, approval
 * logic stays in the server module. Errors propagate as-is so
 * `ThemeDeskError.code` survives to the caller.
 *
 * NOTE(deviation from brief): no test in this repo invokes a TanStack Start
 * server fn directly — grep finds zero tests referencing `themeActivateFn`
 * or `pluginToggleFn`, and no harness faking `{ context: { supabase, userId
 * } }`. The wiring half is therefore pinned by source assertions (the
 * `official-plugins-frame30.test.ts` precedent); the behaviour half drives
 * the delegated server function on `fakeDb`.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import { createHash } from "node:crypto";
import { fakeDb } from "../__fixtures__/fake-db";

const { themeApproveFn } = await import("./appearance.functions");
const { approveThemeVersion, ThemeDeskError } =
  await import("./appearance.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const THEME = "44444444-4444-4444-4444-444444444444";
const VERSION = "55555555-5555-4555-8555-555555555555";
const UNKNOWN_VERSION = "66666666-6666-4666-8666-666666666666";
const ACTOR = "99999999-9999-4999-8999-999999999999";

const FUNCTIONS_SRC = "/opt/frame28/src/lib/themes/appearance.functions.ts";

const SECRET = "sk-" + "abcdefghij0123456789ABCDEFGH0123";

/** Secret-bearing templates: Tier-0, never merchant-approvable. */
const SECRET_TEMPLATES = {
  index: {
    header: [],
    main: [{ id: "m1", type: "heading", props: { text: `leaked ${SECRET}` } }],
    footer: [],
  },
};

/**
 * Flaggable-but-approvable templates (Tier-1): a 1x1 tracking pixel flags
 * `no-plugin-territory.tracking-pixel` (high) with no `secret` finding.
 */
const PIXEL_TEMPLATES = {
  index: {
    header: [],
    main: [
      {
        id: "p1",
        type: "html",
        props: {
          body: '<img src="https://cdn.example.com/p.gif" width="1" height="1">',
        },
      },
    ],
    footer: [],
  },
};

function approveDb() {
  return fakeDb({
    tables: {
      store_themes: [
        {
          id: THEME,
          merchant_id: MERCHANT,
          name: "Target",
          is_active: false,
        },
      ],
      theme_versions: [
        {
          id: VERSION,
          merchant_id: MERCHANT,
          theme_id: THEME,
          version: 2,
          status: "draft",
          templates: { index: { header: [], main: [], footer: [] } },
          tokens: {},
        },
      ],
      theme_audit: [],
    },
  });
}

describe("themeApproveFn wiring", () => {
  it("is exported from the themes functions module", () => {
    expect(typeof themeApproveFn).toBe("function");
  });

  it("sits behind themes.update and delegates to approveThemeVersion", () => {
    const src = fs.readFileSync(FUNCTIONS_SRC, "utf8");
    expect(src).toContain("themeApproveFn");
    expect(src).toContain('requirePermission("themes.update")');
    expect(src).toContain("approveThemeVersion");
  });

  it("validates { themeId, versionId } uuid inputs", () => {
    const src = fs.readFileSync(FUNCTIONS_SRC, "utf8");
    expect(src).toMatch(/themeApproveFn[\s\S]*?themeId[\s\S]*?versionId/);
    // Same uuid shape the other theme fns use.
    expect(src).toContain("z.string().uuid()");
  });
});

describe("theme approval delegation", () => {
  it("records the approval audit and returns ok", async () => {
    const db = approveDb();
    const out = await approveThemeVersion(
      db.asClient(),
      MERCHANT,
      THEME,
      VERSION,
      ACTOR,
    );
    expect(out).toEqual({ ok: true });
    const rows = db.rows("theme_audit");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      merchant_id: MERCHANT,
      theme_id: THEME,
      actor: ACTOR,
      action: "theme.approved",
    });
    expect((rows[0].after as { version_id: string }).version_id).toBe(VERSION);
  });

  it("rethrows ThemeDeskError with .code for another merchant's theme", async () => {
    const db = approveDb();
    const err = await approveThemeVersion(
      db.asClient(),
      OTHER,
      THEME,
      VERSION,
      ACTOR,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ThemeDeskError);
    expect((err as InstanceType<typeof ThemeDeskError>).code).toBe(
      "theme.missing",
    );
    expect(db.rows("theme_audit")).toHaveLength(0);
  });

  it("rethrows ThemeDeskError with .code for an unknown version", async () => {
    const db = approveDb();
    const err = await approveThemeVersion(
      db.asClient(),
      MERCHANT,
      THEME,
      UNKNOWN_VERSION,
      ACTOR,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ThemeDeskError);
    expect((err as InstanceType<typeof ThemeDeskError>).code).toBe(
      "theme.version_missing",
    );
    expect(db.rows("theme_audit")).toHaveLength(0);
  });

  function flaggedDb(templates: unknown) {
    return fakeDb({
      tables: {
        store_themes: [
          {
            id: THEME,
            merchant_id: MERCHANT,
            name: "Target",
            is_active: false,
          },
        ],
        theme_versions: [
          {
            id: VERSION,
            merchant_id: MERCHANT,
            theme_id: THEME,
            version: 2,
            status: "draft",
            templates,
            tokens: {},
          },
        ],
        theme_audit: [],
      },
    });
  }

  it("refuses secret-flagged content with theme.approval_forbidden and writes no audit", async () => {
    const db = flaggedDb(SECRET_TEMPLATES);
    const err = await approveThemeVersion(
      db.asClient(),
      MERCHANT,
      THEME,
      VERSION,
      ACTOR,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ThemeDeskError);
    expect((err as InstanceType<typeof ThemeDeskError>).code).toBe(
      "theme.approval_forbidden",
    );
    expect(db.rows("theme_audit")).toHaveLength(0);
  });

  it("still approves flaggable-but-approvable content (tracking pixel, no secret)", async () => {
    const db = flaggedDb(PIXEL_TEMPLATES);
    const out = await approveThemeVersion(
      db.asClient(),
      MERCHANT,
      THEME,
      VERSION,
      ACTOR,
    );
    expect(out).toEqual({ ok: true });
    expect(
      db.rows("theme_audit").filter((r) => r.action === "theme.approved"),
    ).toHaveLength(1);
  });

  it("activation still refuses secret content covered by a legacy approval", async () => {
    const { activateTheme } = await import("./appearance.server");
    const contentHash = createHash("sha256")
      .update(JSON.stringify(SECRET_TEMPLATES))
      .digest("hex");
    const db = fakeDb({
      tables: {
        store_themes: [
          {
            id: THEME,
            merchant_id: MERCHANT,
            name: "Target",
            is_active: false,
            published_version_id: VERSION,
          },
        ],
        theme_versions: [
          {
            id: VERSION,
            merchant_id: MERCHANT,
            theme_id: THEME,
            version: 2,
            status: "published",
            templates: SECRET_TEMPLATES,
            tokens: {},
          },
        ],
        // Pre-policy approval row: must not unlock Tier-0 content.
        theme_audit: [
          {
            merchant_id: MERCHANT,
            theme_id: THEME,
            actor: ACTOR,
            action: "theme.approved",
            before: null,
            after: { version_id: VERSION, content_hash: contentHash },
          },
        ],
      },
    });
    const err = await activateTheme(db.asClient(), MERCHANT, THEME, ACTOR).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ThemeDeskError);
    expect((err as InstanceType<typeof ThemeDeskError>).code).toBe(
      "theme.approval_forbidden",
    );
    expect(
      db.rows("store_themes").find((r) => r.id === THEME)?.is_active,
    ).toBe(false);
  });
});
