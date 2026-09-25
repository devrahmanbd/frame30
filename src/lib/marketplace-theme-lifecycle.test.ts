/**
 * WordPress-parity theme ledger lifecycle (TDD): theme install rows are not
 * dead rows. Pause/resume/delete reach a real server path — pause and delete
 * refuse while the theme is the live one (never strand the storefront), a
 * delete cascades the linked store_themes row to a terminal ledger status,
 * and nothing here ever writes plugin_state.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({
  holder: null as { observability: unknown } | null,
}));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock(
  "./observability.server",
  () => rec.holder!.observability as typeof import("./observability.server"),
);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { bulkInstallStatus } = await import("./marketplace-install.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const INSTALL = "33333333-3333-3333-3333-333333333333";
const THEME = "44444444-4444-4444-4444-444444444444";
const DRAFT = { index: { header: [], main: [], footer: [] } };

function themeDb(opts: { live: boolean; linked?: boolean; status?: string }) {
  return fakeDb({
    tables: {
      marketplace_installs: [
        {
          id: INSTALL,
          kind: "theme",
          listing_slug: "supershope",
          listing_name: "Supershope",
          status: opts.status ?? "installed",
          is_trial: false,
          merchant_id: MERCHANT,
        },
      ],
      store_themes:
        opts.linked === false
          ? []
          : [
              {
                id: THEME,
                merchant_id: MERCHANT,
                name: "Supershope",
                is_active: opts.live,
                source_install_id: INSTALL,
                source_listing_slug: "supershope",
                published_version_id: null,
              },
            ],
      theme_versions:
        opts.linked === false
          ? []
          : [
              {
                id: "v-1",
                merchant_id: MERCHANT,
                theme_id: THEME,
                version: 1,
                status: "draft",
              },
            ],
      theme_drafts:
        opts.linked === false
          ? []
          : [
              {
                merchant_id: MERCHANT,
                theme_id: THEME,
                revision: 1,
                templates: DRAFT,
                tokens: {},
              },
            ],
      plugin_state: [],
      activity_log: [],
      theme_audit: [],
    },
  });
}

beforeEach(() => recorder.reset());

describe("theme install rows", () => {
  it("pauses and resumes an inactive theme row without touching plugin_state", async () => {
    const db = themeDb({ live: false });
    const paused = await bulkInstallStatus(
      db.asClient(),
      MERCHANT,
      ACTOR,
      [INSTALL],
      "pause",
    );
    expect(paused.results[0]).toMatchObject({ installId: INSTALL, ok: true });
    expect(
      db.rows("marketplace_installs").find((r) => r.id === INSTALL)!.status,
    ).toBe("paused");
    // Audited with the actor; plugin_state is widget-only and stays empty.
    const log = db.rows("activity_log");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      merchant_id: MERCHANT,
      actor: ACTOR,
      action: "market.paused",
    });
    expect(db.rows("plugin_state")).toHaveLength(0);

    const resumed = await bulkInstallStatus(
      db.asClient(),
      MERCHANT,
      ACTOR,
      [INSTALL],
      "enable",
    );
    expect(resumed.results[0].ok).toBe(true);
    expect(
      db.rows("marketplace_installs").find((r) => r.id === INSTALL)!.status,
    ).toBe("installed");
    expect(db.rows("plugin_state")).toHaveLength(0);
  });

  it("deny: pausing the live theme is refused so the storefront never goes dark", async () => {
    const db = themeDb({ live: true });
    const out = await bulkInstallStatus(
      db.asClient(),
      MERCHANT,
      ACTOR,
      [INSTALL],
      "pause",
    );
    expect(out.results[0]).toMatchObject({
      installId: INSTALL,
      ok: false,
      error: "market_theme_active",
    });
    expect(
      db.rows("marketplace_installs").find((r) => r.id === INSTALL)!.status,
    ).toBe("installed");
    expect(db.rows("store_themes").find((r) => r.id === THEME)!.is_active).toBe(
      true,
    );
    expect(db.rows("activity_log")).toHaveLength(0);
    expect(db.rows("plugin_state")).toHaveLength(0);
  });

  it("delete cascades the linked theme and retires the ledger row", async () => {
    const db = themeDb({ live: false });
    const out = await bulkInstallStatus(
      db.asClient(),
      MERCHANT,
      ACTOR,
      [INSTALL],
      "delete",
    );
    expect(out.results[0]).toMatchObject({ installId: INSTALL, ok: true });
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("theme_versions")).toHaveLength(0);
    expect(db.rows("theme_drafts")).toHaveLength(0);
    expect(
      db.rows("marketplace_installs").find((r) => r.id === INSTALL)!.status,
    ).toBe("removed");
    const audit = db.rows("theme_audit");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      theme_id: THEME,
      actor: ACTOR,
      action: "theme.deleted",
    });
  });

  it("deny: deleting the live theme's install row is refused", async () => {
    const db = themeDb({ live: true });
    const out = await bulkInstallStatus(
      db.asClient(),
      MERCHANT,
      ACTOR,
      [INSTALL],
      "delete",
    );
    expect(out.results[0].ok).toBe(false);
    expect(String(out.results[0].error)).toMatch(/activate another theme/i);
    expect(db.rows("store_themes")).toHaveLength(1);
    expect(db.rows("theme_versions")).toHaveLength(1);
    expect(
      db.rows("marketplace_installs").find((r) => r.id === INSTALL)!.status,
    ).toBe("installed");
  });

  it("deletes a ledger-only theme install (never materialized) with an audit", async () => {
    const db = themeDb({ live: false, linked: false });
    const out = await bulkInstallStatus(
      db.asClient(),
      MERCHANT,
      ACTOR,
      [INSTALL],
      "delete",
    );
    expect(out.results[0].ok).toBe(true);
    expect(
      db.rows("marketplace_installs").find((r) => r.id === INSTALL)!.status,
    ).toBe("removed");
    const log = db.rows("activity_log");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      merchant_id: MERCHANT,
      actor: ACTOR,
      action: "market.removed",
    });
  });

  it("replay: deleting an already-removed theme row is a no-op, not an error", async () => {
    const db = themeDb({ live: false, status: "removed" });
    const out = await bulkInstallStatus(
      db.asClient(),
      MERCHANT,
      ACTOR,
      [INSTALL],
      "delete",
    );
    expect(out.results[0]).toMatchObject({ installId: INSTALL, ok: true });
    expect(
      db.rows("marketplace_installs").find((r) => r.id === INSTALL)!.status,
    ).toBe("removed");
    expect(db.rows("activity_log")).toHaveLength(0);
    expect(db.rows("theme_audit")).toHaveLength(0);
  });

  it("deny: a foreign merchant's theme install row is untouched", async () => {
    const db = themeDb({ live: false });
    const out = await bulkInstallStatus(
      db.asClient(),
      "11111111-1111-4111-8111-111111111111",
      ACTOR,
      [INSTALL],
      "delete",
    );
    expect(out.results[0]).toMatchObject({
      ok: false,
      error: "market_install_not_found",
    });
    expect(db.rows("store_themes")).toHaveLength(1);
    expect(
      db.rows("marketplace_installs").find((r) => r.id === INSTALL)!.status,
    ).toBe("installed");
  });
});
