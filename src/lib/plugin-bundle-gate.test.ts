/**
 * R2-7: validateBundle gates every install write path.
 *
 * Pure structural denials plus the two integration gates — upsertPlugin and
 * installListing must throw before any row is written (deny cases feed R2-8).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";
import { validateBundle } from "./marketplace-scopes";

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
const LISTING = "listing-gate-1";

beforeEach(() => recorder.reset());

describe("install-path bundle gate (R2-7)", () => {
  it("rejects oversized bundles (>512KB) with bundle.too_large", () => {
    const huge = { entry: "x".repeat(600_000) };
    const v = validateBundle(huge, ["read_shop"]);
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("bundle.too_large");
  });
  it("rejects dynamic_code in entry", () => {
    const v = validateBundle({ entry: "eval('x')" }, ["read_shop"]);
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("bundle.dynamic_code");
  });
  it("rejects empty scope lists", () => {
    const v = validateBundle({ entry: "framique.mount()" }, []);
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("bundle.no_scopes");
  });

  it("upsertPlugin refuses a no-scope manifest with plugin.bundle_rejected and writes nothing", async () => {
    const db = fakeDb({ tables: { plugin_state: [], activity_log: [] } });
    await expect(
      upsertPlugin(db.asClient(), MERCHANT, {
        manifest: {
          id: "bundle-gate-probe",
          name: "Bundle gate probe",
          version: "1.0.0",
          api: "^3.0.0",
          permissions: [],
        },
        grantedScopes: [],
      }),
    ).rejects.toThrow(/^plugin\.bundle_rejected:bundle\.no_scopes/);
    expect(db.callsOf("upsert")).toHaveLength(0);
    expect(db.rows("plugin_state")).toHaveLength(0);
    expect(db.rows("activity_log")).toHaveLength(0);
  });

  it("installListing refuses a dynamic-code bundle with market_bundle_rejected and writes nothing", async () => {
    const db = fakeDb({
      tables: {
        marketplace_installs: [],
        marketplace_widgets: [
          {
            id: LISTING,
            name: "Rogue widget",
            slug: "rogue-widget",
            version: "1.0.0",
            status: "active",
            seller_merchant_id: SELLER,
            price_minor_int: 0,
            currency_code: "BDT",
            trial_allowed: false,
            compatible_versions: [],
            manifest: { entry: "eval('x')" },
          },
        ],
      },
    });
    await expect(
      installListing(db.asClient(), MERCHANT, {
        kind: "widget",
        listingId: LISTING,
        trial: false,
        idempotencyKey: "bundle-gate-key-1",
        grantedScopes: ["read_products"],
      }),
    ).rejects.toThrow(/^market_bundle_rejected:bundle\.dynamic_code/);
    expect(
      db.callsOf("insert").filter((c) => c.table === "marketplace_installs"),
    ).toHaveLength(0);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });
});
