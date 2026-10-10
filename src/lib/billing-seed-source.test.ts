/**
 * Frame30 — provisioning seeds Songoskriti from source, never a ZIP.
 *
 * Trial-claim provisioning initializes the merchant's theme records from
 * the registered source definition (same source-init path as dashboard
 * installs). Idempotent, never throws, no artifact construction.
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

const { seedSongoskritiBestEffort } = await import("./billing.functions");

const MERCHANT = "77777777-7777-4777-8777-777777777777";

function seedDb() {
  return fakeDb({
    tables: {
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      theme_assets: [],
      marketplace_installs: [],
      theme_audit: [],
      theme_catalog_favourites: [],
      theme_registry: [],
    },
  });
}

beforeEach(() => recorder.reset());

describe("provisioning Songoskriti seed from source", () => {
  it("installs source rows on first claim", async () => {
    const db = seedDb();
    const out = await seedSongoskritiBestEffort(db.asClient(), MERCHANT);
    expect(out).toMatchObject({ ok: true, created: true });
    const themes = db.rows("store_themes");
    expect(themes).toHaveLength(1);
    expect(themes[0]).toMatchObject({
      merchant_id: MERCHANT,
      source_listing_slug: "songoskriti",
      is_active: false,
    });
    // Source-form templates land in the version row — never package refs.
    const versions = db.rows("theme_versions");
    expect(versions).toHaveLength(1);
    expect(JSON.stringify(versions[0])).toContain("/ph/songoskriti/");
    const installs = db.rows("marketplace_installs");
    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({
      artifact_pinned: "official:songoskriti",
    });
    expect(
      db.rows("theme_audit").filter((a) => a.action === "theme.installed"),
    ).toHaveLength(1);
  });

  it("replays without stacking rows and never throws", async () => {
    const db = seedDb();
    const first = await seedSongoskritiBestEffort(db.asClient(), MERCHANT);
    expect(first.ok).toBe(true);
    const second = await seedSongoskritiBestEffort(db.asClient(), MERCHANT);
    expect(second).toMatchObject({ ok: true, created: false });
    expect(db.rows("store_themes")).toHaveLength(1);
    expect(db.rows("marketplace_installs")).toHaveLength(1);
  });
});
