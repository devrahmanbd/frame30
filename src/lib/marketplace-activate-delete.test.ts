/**
 * WordPress-parity activation honesty (TDD).
 * - Activate flips the pointer. It never rewrites draft content.
 * - Third-party installs with AST-bearing manifests materialize a theme row.
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

const { activateTheme } = await import("./themes/appearance.server");
const { installListing } = await import("./marketplace-install.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const THEME = "44444444-4444-4444-4444-444444444444";
const LISTING = "55555555-5555-4555-8555-555555555555";

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

describe("third-party install materialization", () => {
  function sellerDb() {
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
            manifest: {
              templates: { index: { header: [], main: [], footer: [] } },
              tokens: {},
            },
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

  it("creates an inactive theme row linked to the install", async () => {
    const db = sellerDb();
    const out: any = await installListing(db.asClient(), MERCHANT, {
      kind: "theme",
      listingId: LISTING,
      trial: false,
      idempotencyKey: "k-1",
      versionId: null,
      grantedScopes: ["render_storefront"],
      consentedBy: null,
    });
    expect(out.replayed).toBe(false);
    const themes = db.rows("store_themes");
    expect(themes).toHaveLength(1);
    expect(themes[0]).toMatchObject({
      merchant_id: MERCHANT,
      is_active: false,
    });
    const install = db.rows("marketplace_installs")[0];
    expect(themes[0].source_install_id).toBe(install.id);
    expect(db.rows("theme_versions")).toHaveLength(1);
    expect(db.rows("theme_drafts")).toHaveLength(1);
  });

  it("leaves ledger-only installs alone when the manifest has no AST", async () => {
    const db = sellerDb();
    db.rows("marketplace_themes")[0].manifest = { breaking_nodes: [] };
    const out: any = await installListing(db.asClient(), MERCHANT, {
      kind: "theme",
      listingId: LISTING,
      trial: false,
      idempotencyKey: "k-2",
      versionId: null,
      grantedScopes: ["render_storefront"],
      consentedBy: null,
    });
    expect(out.replayed).toBe(false);
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("marketplace_installs")).toHaveLength(1);
  });
});

describe("activateTheme with draft-only versions", () => {
  it("materializes from the draft instead of refusing with theme.unpublished", async () => {
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
  });
});
