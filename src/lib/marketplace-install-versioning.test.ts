/**
 * Frame30 item 13 (extension versioning + recovery) — Pass 3: version lies
 * at marketplace install (RED first).
 *
 * A pinned vault row whose recorded version differs from the installed
 * artifact's manifest version is a version lie: the install fails closed
 * with `market_version_mismatch`, compensating assets + ledger, and the
 * ledger never claims a version the bytes do not carry.
 */
import { describe, expect, it } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import { installListing } from "./marketplace-install.server";

const MERCHANT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LISTING = "11111111-1111-1111-1111-111111111111";
const VERSION = "22222222-2222-2222-2222-222222222222";

let keySeq = 0;
const key = () => `mkt-v13-${(keySeq += 1)}`;

function pluginManifest(version = "1.0.0"): Record<string, unknown> {
  return {
    id: "acme-reviews",
    name: "Acme Reviews",
    version,
    api: "^3.0.0",
    permissions: ["read_shop", "render_storefront"],
    widgets: [
      {
        key: "reviews",
        label: "Customer Reviews",
        slots: ["main"],
        entry: "framique.mount(document.createElement('div'))",
      },
    ],
    hooks: [],
    settings: [],
    i18n: { en: {}, bn: {} },
    budget: { jsKb: 10, mainThreadMs: 5 },
  };
}

function marketDb(pinnedVersion: string) {
  return fakeDb({
    tables: {
      marketplace_widgets: [
        {
          id: LISTING,
          slug: "acme-reviews",
          name: "Acme Reviews",
          version: "1.0.0",
          status: "active",
          seller_merchant_id: MERCHANT,
          price_minor_int: 0,
          currency_code: "BDT",
          trial_allowed: false,
          compatible_versions: [],
          install_count: 0,
          manifest: pluginManifest("1.0.0"),
        },
      ],
      marketplace_themes: [],
      marketplace_versions: [
        {
          id: VERSION,
          listing_id: LISTING,
          kind: "widget",
          version: pinnedVersion,
          scopes: ["read_shop", "render_storefront"],
          status: "active",
          source: pluginManifest("1.0.0"),
        },
      ],
      marketplace_installs: [],
      theme_assets: [],
      theme_audit: [],
      activity_log: [],
      plugin_state: [],
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
    },
  });
}

function input() {
  return {
    kind: "widget" as const,
    listingId: LISTING,
    trial: false,
    idempotencyKey: key(),
    versionId: VERSION,
    grantedScopes: ["read_shop", "render_storefront"],
    consentedBy: null,
  };
}

describe("marketplace pinned-version truth", () => {
  it("installs when the pinned version matches the artifact bytes", async () => {
    const db = marketDb("1.0.0");
    const out = await installListing(db.asClient(), MERCHANT, input());
    expect(out.replayed).toBe(false);
    expect(out.artifact?.version).toBe("1.0.0");
    const rows = db.rows("marketplace_installs");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.version).toBe("1.0.0");
  });

  it("fails closed on a pinned/artifact version lie, compensating everything", async () => {
    const db = marketDb("9.9.9");
    let message = "no_throw";
    try {
      await installListing(db.asClient(), MERCHANT, input());
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toMatch(/^market_version_mismatch/);
    // Nothing stands: no ledger row claims the lied version, no orphan bytes.
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("theme_assets")).toHaveLength(0);
  });
});
