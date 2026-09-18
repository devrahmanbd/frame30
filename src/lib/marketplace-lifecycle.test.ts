/**
 * WordPress-parity theme lifecycle on the marketplace (TDD).
 *
 * WP semantics: Install adds a NEW INACTIVE theme (never rewrites the
 * active draft), Activate flips is_active, Delete removes inactive themes.
 * The installs ledger stays coherent through source_install_id linkage.
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

const { listCatalog } = await import("./marketplace.server");
const { installBuiltinTheme, uninstallBuiltinTheme } =
  await import("./marketplace-install.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const INSTALL = "33333333-3333-3333-3333-333333333333";
const THEME = "44444444-4444-4444-4444-444444444444";

function emptyCatalogDb() {
  return fakeDb({
    tables: {
      marketplace_themes: [],
      marketplace_widgets: [],
      marketplace_installs: [],
      store_themes: [],
    },
  });
}

beforeEach(() => recorder.reset());

describe("listCatalog theme states", () => {
  it("maps installed listings to their theme rows and active flags", async () => {
    const db = fakeDb({
      tables: {
        marketplace_themes: [],
        marketplace_widgets: [],
        marketplace_installs: [
          {
            id: INSTALL,
            kind: "theme",
            listing_slug: "classic",
            status: "installed",
            merchant_id: MERCHANT,
          },
        ],
        store_themes: [
          {
            id: THEME,
            merchant_id: MERCHANT,
            is_active: false,
            source_install_id: INSTALL,
          },
        ],
      },
    });
    const catalog = await listCatalog(db.asClient(), MERCHANT);
    expect(catalog.themeStates).toEqual([
      { slug: "classic", themeId: THEME, isActive: false },
    ]);
  });

  it("reports an empty map when nothing is installed", async () => {
    const catalog = await listCatalog(emptyCatalogDb().asClient(), MERCHANT);
    expect(catalog.themeStates).toEqual([]);
  });
});

describe("installBuiltinTheme", () => {
  it("refuses an unknown preset key without touching the database", async () => {
    const db = emptyCatalogDb();
    await expect(
      installBuiltinTheme(db.asClient(), MERCHANT, "nope", "key-1"),
    ).rejects.toThrow("market_listing_not_found");
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("store_themes")).toHaveLength(0);
  });

  it("creates the ledger row and links the new theme back to it", async () => {
    const db = fakeDb({
      tables: {
        marketplace_installs: [],
        // The marketplace_install_preset RPC created this row moments earlier.
        store_themes: [
          {
            id: THEME,
            merchant_id: MERCHANT,
            is_active: false,
            source_install_id: null,
          },
        ],
      },
      rpc: (fn: string) => {
        if (fn !== "marketplace_install_preset")
          return { data: null, error: { message: "unexpected" } };
        return { data: { theme_id: THEME, version_id: "v-1" }, error: null };
      },
    });
    const out: any = await installBuiltinTheme(
      db.asClient(),
      MERCHANT,
      "classic",
      "key-1",
    );
    expect(out.themeId).toBe(THEME);
    const ledger = db.rows("marketplace_installs");
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      merchant_id: MERCHANT,
      kind: "theme",
      listing_slug: "classic",
      status: "installed",
    });
    const themes = db.rows("store_themes");
    expect(themes).toHaveLength(1);
    expect(themes[0]).toMatchObject({
      id: THEME,
      source_install_id: ledger[0].id,
    });
  });
});

describe("uninstallBuiltinTheme", () => {
  it("refuses to delete the active theme", async () => {
    const db = fakeDb({
      tables: {
        marketplace_installs: [
          {
            id: INSTALL,
            kind: "theme",
            listing_slug: "classic",
            status: "installed",
            merchant_id: MERCHANT,
          },
        ],
        store_themes: [
          {
            id: THEME,
            merchant_id: MERCHANT,
            is_active: true,
            source_install_id: INSTALL,
          },
        ],
      },
    });
    await expect(
      uninstallBuiltinTheme(db.asClient(), MERCHANT, INSTALL),
    ).rejects.toThrow();
    expect(db.rows("store_themes")).toHaveLength(1);
  });

  it("deletes an inactive theme and retires its ledger row", async () => {
    const db = fakeDb({
      tables: {
        marketplace_installs: [
          {
            id: INSTALL,
            kind: "theme",
            listing_slug: "classic",
            status: "installed",
            merchant_id: MERCHANT,
          },
        ],
        store_themes: [
          {
            id: THEME,
            merchant_id: MERCHANT,
            is_active: false,
            source_install_id: INSTALL,
          },
        ],
      },
    });
    const out: any = await uninstallBuiltinTheme(
      db.asClient(),
      MERCHANT,
      INSTALL,
    );
    expect(out.ok).toBe(true);
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("marketplace_installs")[0].status).toBe("removed");
  });
});
