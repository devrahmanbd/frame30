/**
 * WordPress-parity activation honesty (TDD).
 * - Activate flips the pointer. It never rewrites draft content.
 * - Theme installs were retired in the Sept 2026 purge: the marketplace is
 *   plugins only, so `installListing` with `kind: "theme"` throws
 *   `market_theme_removed` before any write, regardless of manifest shape.
 * - The live paths are plugin (widget-kind) installs, uninstalls, and
 *   activation of themes that have a published version. Draft-only themes
 *   are refused with `theme.unpublished` — drafts are never auto-published
 *   by activation.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({ holder: null as any }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { activateTheme, ThemeDeskError } = await import(
  "./themes/appearance.server"
);
const { installListing, uninstallWidgetInstall } = await import(
  "./marketplace-install.server"
);

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const THEME = "44444444-4444-4444-4444-444444444444";
const LISTING = "55555555-5555-4555-8555-555555555555";
const PLUGIN_LISTING = "66666666-6666-4666-8666-666666666666";
const INSTALL = "33333333-3333-3333-3333-333333333333";

const CUSTOM = { index: { header: [], main: [{ id: "mine" }], footer: [] } };

beforeEach(() => recorder.reset());

describe("activateTheme honesty", () => {
  it("flips is_active without rewriting the merchant's draft", async () => {
    const db = fakeDb({
      tables: {
        store_themes: [
          { id: THEME, merchant_id: MERCHANT, name: "Mine", is_active: false },
          { id: "other", merchant_id: MERCHANT, name: "Live", is_active: true },
        ],
        theme_drafts: [
          {
            theme_id: THEME,
            merchant_id: MERCHANT,
            templates: CUSTOM,
            tokens: {},
            revision: 3,
          },
        ],
        theme_audit: [],
      },
    });
    const out: any = await activateTheme(
      db.asClient(),
      MERCHANT,
      THEME,
      "user-9",
    );
    expect(out.id).toBe(THEME);
    expect(out.applied).toBe(false);
    const themes = db.rows("store_themes");
    expect(themes.find((r) => r.id === THEME)!.is_active).toBe(true);
    expect(themes.find((r) => r.id === "other")!.is_active).toBe(false);
    const drafts = db.rows("theme_drafts");
    expect(drafts).toHaveLength(1);
    expect(drafts[0].templates).toEqual(CUSTOM);
    expect(drafts[0].revision).toBe(3);
  });
});

describe("retired theme installs (Sept 2026 purge)", () => {
  function sellerDb(manifest: Record<string, unknown>) {
    return fakeDb({
      tables: {
        marketplace_themes: [
          {
            id: LISTING,
            name: "Seller theme",
            slug: "seller-theme",
            version: "1.0.0",
            status: "active",
            seller_merchant_id: "seller",
            price_minor_int: 0,
            currency_code: "BDT",
            trial_allowed: false,
            compatible_versions: [],
            manifest,
          },
        ],
        marketplace_versions: [],
        marketplace_installs: [],
        store_themes: [],
        theme_versions: [],
        theme_drafts: [],
      },
    });
  }

  const AST_MANIFEST = {
    templates: { index: { header: [], main: [], footer: [] } },
    tokens: {},
  };

  it("refuses AST-bearing theme installs with market_theme_removed and writes nothing", async () => {
    const db = sellerDb(AST_MANIFEST);
    await expect(
      installListing(db.asClient(), MERCHANT, {
        kind: "theme",
        listingId: LISTING,
        trial: false,
        idempotencyKey: "k-1",
        versionId: null,
        grantedScopes: ["render_storefront"],
        consentedBy: null,
      }),
    ).rejects.toThrow("market_theme_removed");
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("theme_versions")).toHaveLength(0);
    expect(db.rows("theme_drafts")).toHaveLength(0);
  });

  it("refuses ledger-only theme installs too — the guard fires before manifest inspection", async () => {
    const db = sellerDb({ breaking_nodes: [] });
    await expect(
      installListing(db.asClient(), MERCHANT, {
        kind: "theme",
        listingId: LISTING,
        trial: false,
        idempotencyKey: "k-2",
        versionId: null,
        grantedScopes: ["render_storefront"],
        consentedBy: null,
      }),
    ).rejects.toThrow("market_theme_removed");
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });
});

describe("live plugin install path", () => {
  function pluginDb() {
    return fakeDb({
      tables: {
        marketplace_installs: [],
        marketplace_widgets: [
          {
            id: PLUGIN_LISTING,
            name: "Sticky cart",
            slug: "sticky-cart",
            version: "1.0.0",
            status: "active",
            seller_merchant_id: "seller",
            price_minor_int: 0,
            currency_code: "BDT",
            trial_allowed: false,
            compatible_versions: [],
            manifest: {
              entry: "framique.mount()",
              permissions: ["render_storefront"],
            },
          },
        ],
        activity_log: [],
        plugin_state: [],
      },
    });
  }

  it("installs a widget-kind listing on the ledger", async () => {
    const db = pluginDb();
    const out: any = await installListing(db.asClient(), MERCHANT, {
      kind: "widget",
      listingId: PLUGIN_LISTING,
      trial: false,
      idempotencyKey: "k-plugin-1",
      versionId: null,
      grantedScopes: ["render_storefront"],
      consentedBy: null,
    });
    expect(out.replayed).toBe(false);
    expect(out.installId).toBeTruthy();
    const installs = db.rows("marketplace_installs");
    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({
      merchant_id: MERCHANT,
      kind: "widget",
      status: "installed",
    });
  });

  it("deletes a widget install by parking the ledger and queueing the purge", async () => {
    const db = fakeDb({
      tables: {
        marketplace_installs: [
          {
            id: INSTALL,
            kind: "widget",
            listing_slug: "sticky-cart",
            status: "installed",
            merchant_id: MERCHANT,
          },
        ],
        plugin_state: [
          {
            id: "p-1",
            merchant_id: MERCHANT,
            plugin_id: "sticky-cart",
            enabled: true,
          },
        ],
      },
    });
    const out: any = await uninstallWidgetInstall(
      db.asClient(),
      MERCHANT,
      INSTALL,
      "user-9",
    );
    expect(out.ok).toBe(true);
    expect(out.purging).toBe(true);
    expect(db.rows("marketplace_installs")[0].status).toBe("uninstalling");
    // State row survives uninstall — the purge handler deletes it.
    expect(db.rows("plugin_state")).toHaveLength(1);
  });
});

describe("activateTheme publish guard", () => {
  it("refuses draft-only versions with theme.unpublished instead of auto-publishing", async () => {
    const db = fakeDb({
      tables: {
        store_themes: [
          {
            id: THEME,
            merchant_id: MERCHANT,
            name: "Mine",
            is_active: false,
            published_version_id: null,
          },
          { id: "other", merchant_id: MERCHANT, name: "Live", is_active: true },
        ],
        theme_drafts: [
          {
            theme_id: THEME,
            merchant_id: MERCHANT,
            templates: CUSTOM,
            tokens: {},
            revision: 1,
          },
        ],
        theme_versions: [
          {
            id: "v-draft",
            merchant_id: MERCHANT,
            theme_id: THEME,
            version: 1,
            status: "draft",
          },
        ],
        theme_audit: [],
      },
    });
    const err: unknown = await activateTheme(
      db.asClient(),
      MERCHANT,
      THEME,
      "user-9",
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ThemeDeskError);
    expect((err as { code: string }).code).toBe("theme.unpublished");
    // Refusal flips nothing: the merchant stays on the live theme.
    expect(
      db.rows("store_themes").find((r) => r.id === THEME)!.is_active,
    ).toBe(false);
    expect(
      db.rows("store_themes").find((r) => r.id === "other")!.is_active,
    ).toBe(true);
  });

  it("activates when a published version exists (live path)", async () => {
    const db = fakeDb({
      tables: {
        store_themes: [
          {
            id: THEME,
            merchant_id: MERCHANT,
            name: "Mine",
            is_active: false,
            published_version_id: "v-pub",
          },
          { id: "other", merchant_id: MERCHANT, name: "Live", is_active: true },
        ],
        theme_drafts: [
          {
            theme_id: THEME,
            merchant_id: MERCHANT,
            templates: CUSTOM,
            tokens: {},
            revision: 1,
          },
        ],
        theme_versions: [
          {
            id: "v-pub",
            merchant_id: MERCHANT,
            theme_id: THEME,
            version: 1,
            status: "published",
          },
        ],
        theme_audit: [],
      },
    });
    const out: any = await activateTheme(
      db.asClient(),
      MERCHANT,
      THEME,
      "user-9",
    );
    expect(out.id).toBe(THEME);
    expect(db.rows("store_themes").find((r) => r.id === THEME)!.is_active).toBe(
      true,
    );
    expect(db.rows("store_themes").find((r) => r.id === "other")!.is_active).toBe(
      false,
    );
  });
});
