/**
 * R2-1: consent evidence — granted subset + reject unknown/superset.
 *
 * Subset semantics (user-confirmed Option A): a partial grant is valid;
 * only scopes outside `manifest.permissions` are refused with
 * `plugin_consent_required`. Consent evidence lands on `plugin_state`
 * (`consented_by`, `manifest_version`) and `marketplace_installs`
 * (`granted_scopes`, `consented_by`), plus a `plugin.scopes_granted` audit.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { upsertPlugin } = await import("./plugins.server");
const { installListing } = await import("./marketplace-install.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const SELLER = "11111111-1111-1111-1111-111111111111";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const LISTING = "listing-consent-1";

const MANIFEST = {
  id: "loyalty-lite",
  name: "Loyalty Lite",
  version: "1.2.0",
  api: "^3.0.0",
  permissions: ["read_shop", "render_storefront"],
  widgets: [],
  hooks: [],
  settings: [],
  i18n: { en: {}, bn: {} },
};

beforeEach(() => recorder.reset());

function pluginDb() {
  return fakeDb({ tables: { plugin_state: [], activity_log: [] } });
}

describe("R2-1 consent evidence (upsertPlugin)", () => {
  it("refuses a superset/unknown grant with plugin_consent_required and writes nothing", async () => {
    const db = pluginDb();
    await expect(
      upsertPlugin(db.asClient(), MERCHANT, {
        manifest: MANIFEST,
        grantedScopes: [...MANIFEST.permissions, "drain_wallet"],
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/plugin_consent_required/);
    expect(db.callsOf("upsert")).toHaveLength(0);
    expect(db.rows("plugin_state")).toHaveLength(0);
    expect(db.rows("activity_log")).toHaveLength(0);
  });

  it("stores only the granted subset and records consent evidence", async () => {
    const db = pluginDb();
    await upsertPlugin(db.asClient(), MERCHANT, {
      manifest: MANIFEST,
      grantedScopes: ["read_shop"],
      actorId: ACTOR,
    });
    const row = db.rows("plugin_state")[0]!;
    expect(row.scopes).toEqual(["read_shop"]);
    expect(row.consented_by).toBe(ACTOR);
    expect(row.manifest_version).toBe("1.2.0");
  });

  it("allows an empty grant (empty set is a valid subset)", async () => {
    const db = pluginDb();
    await upsertPlugin(db.asClient(), MERCHANT, {
      manifest: MANIFEST,
      grantedScopes: [],
      actorId: ACTOR,
    });
    expect(db.rows("plugin_state")[0]!.scopes).toEqual([]);
  });

  it("writes a plugin.scopes_granted audit with manifest_version", async () => {
    const db = pluginDb();
    await upsertPlugin(db.asClient(), MERCHANT, {
      manifest: MANIFEST,
      grantedScopes: ["read_shop", "render_storefront"],
      actorId: ACTOR,
    });
    const actions = db
      .rows("activity_log")
      .map((r: { action?: string }) => r.action);
    expect(actions).toContain("plugin.installed");
    expect(actions).toContain("plugin.scopes_granted");
    const grant = db
      .rows("activity_log")
      .find((r: { action?: string }) => r.action === "plugin.scopes_granted")!;
    expect(grant.actor).toBe(ACTOR);
    expect(grant.changed).toMatchObject({
      plugin: "loyalty-lite",
      scopes: ["read_shop", "render_storefront"],
      manifest_version: "1.2.0",
    });
  });
});

describe("R2-1 consent evidence (installListing)", () => {
  function installDb() {
    return fakeDb({
      tables: {
        marketplace_installs: [],
        marketplace_widgets: [
          {
            id: LISTING,
            name: "Sticky cart",
            slug: "sticky-cart",
            version: "1.0.0",
            status: "active",
            seller_merchant_id: SELLER,
            price_minor_int: 0,
            currency_code: "BDT",
            trial_allowed: false,
            compatible_versions: [],
            manifest: {
              entry: "framique.mount()",
              permissions: ["read_shop"],
            },
          },
        ],
        activity_log: [],
        plugin_state: [],
      },
    });
  }

  it("rejects an unknown scope with plugin_consent_required and writes nothing", async () => {
    const db = installDb();
    await expect(
      installListing(db.asClient(), MERCHANT, {
        kind: "widget",
        listingId: LISTING,
        trial: false,
        idempotencyKey: "consent-key-evil",
        grantedScopes: ["read_shop", "drain_wallet"],
        consentedBy: ACTOR,
      }),
    ).rejects.toThrow(/plugin_consent_required:drain_wallet/);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });

  it("persists granted_scopes and consented_by on the install row", async () => {
    const db = installDb();
    await installListing(db.asClient(), MERCHANT, {
      kind: "widget",
      listingId: LISTING,
      trial: false,
      idempotencyKey: "consent-key-1",
      grantedScopes: ["read_shop"],
      consentedBy: ACTOR,
    });
    const row = db.rows("marketplace_installs")[0]!;
    expect(row.granted_scopes).toEqual(["read_shop"]);
    expect(row.consented_by).toBe(ACTOR);
  });
});

describe("CONSENT lane — server-side consent record checked on update", () => {
  const V1 = { ...MANIFEST, version: "1.2.0" };
  const V1_PATCH = { ...MANIFEST, version: "1.2.1" };
  const WIDENED = {
    ...MANIFEST,
    version: "1.3.0",
    permissions: ["read_shop", "render_storefront", "read_products"],
  };
  const FULL_GRANT = ["read_shop", "render_storefront"];

  async function installedV1() {
    const db = pluginDb();
    await upsertPlugin(db.asClient(), MERCHANT, {
      manifest: V1,
      grantedScopes: FULL_GRANT,
      actorId: ACTOR,
    });
    return db;
  }

  it("stamps the consent record (version + granted set + timestamp) on install", async () => {
    const db = await installedV1();
    const row = db.rows("plugin_state")[0]!;
    expect(row.scopes).toEqual(["read_shop", "render_storefront"]);
    expect(row.manifest_version).toBe("1.2.0");
    expect(row.consented_by).toBe(ACTOR);
    expect(typeof row.consented_at).toBe("string");
  });

  it("refuses a widening update without fresh consent and leaves the record untouched", async () => {
    const db = await installedV1();
    await expect(
      upsertPlugin(db.asClient(), MERCHANT, {
        manifest: WIDENED,
        grantedScopes: FULL_GRANT,
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/plugin_consent_required:read_products/);
    const row = db.rows("plugin_state")[0]!;
    expect(row.scopes).toEqual(["read_shop", "render_storefront"]);
    expect(row.manifest_version).toBe("1.2.0");
  });

  it("refuses a widening update whose re-consent still grants only the old subset", async () => {
    const db = await installedV1();
    await expect(
      upsertPlugin(db.asClient(), MERCHANT, {
        manifest: WIDENED,
        grantedScopes: FULL_GRANT,
        reconsented: true,
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/plugin_consent_required:read_products/);
    expect(db.rows("plugin_state")[0]!.manifest_version).toBe("1.2.0");
  });

  it("accepts a widening update with a fresh grant covering the new scopes", async () => {
    const db = await installedV1();
    await upsertPlugin(db.asClient(), MERCHANT, {
      manifest: WIDENED,
      grantedScopes: ["read_shop", "render_storefront", "read_products"],
      reconsented: true,
      actorId: ACTOR,
    });
    const row = db.rows("plugin_state")[0]!;
    expect(row.scopes).toEqual([
      "read_products",
      "read_shop",
      "render_storefront",
    ]);
    expect(row.manifest_version).toBe("1.3.0");
    expect(row.consented_by).toBe(ACTOR);
    expect(typeof row.consented_at).toBe("string");
  });

  it("allows a non-widening update (patch version, narrowed grant) without reconsent", async () => {
    const db = await installedV1();
    await upsertPlugin(db.asClient(), MERCHANT, {
      manifest: V1_PATCH,
      grantedScopes: ["read_shop"],
      actorId: ACTOR,
    });
    const row = db.rows("plugin_state")[0]!;
    expect(row.manifest_version).toBe("1.2.1");
    expect(row.scopes).toEqual(["read_shop"]);
  });
});
