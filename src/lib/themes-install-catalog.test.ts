/**
 * WF-01 follow-through (TDD): the catalogue install path creates the FULL
 * install shape — theme row + version + draft + ledger linkage + audit —
 * never a bare theme shell invisible to the marketplace.
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

const { installCatalogTheme } = await import("./themes/appearance.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";

function catalogDb() {
  return fakeDb({
    tables: {
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      theme_registry: [
        {
          key: "classic",
          name_en: "Classic",
          name_bn: "ক্লাসিক",
          summary_en: "Classic theme",
          summary_bn: "ক্লাসিক থিম",
          category: "general",
          version: "1.0.0",
          preset: { tokens: {}, templates: {} },
          active: true,
          sort_order: 1,
        },
      ],
      marketplace_installs: [],
      theme_audit: [],
    },
  });
}

beforeEach(() => recorder.reset());

describe("installCatalogTheme completeness", () => {
  it("creates version, draft, ledger linkage and audit row", async () => {
    const db = catalogDb();
    const out: any = await installCatalogTheme(
      db.asClient(),
      MERCHANT,
      "classic",
      "user-9",
    );
    expect(out.alreadyInstalled).toBe(false);
    expect(db.rows("theme_versions")).toHaveLength(1);
    expect(db.rows("theme_drafts")).toHaveLength(1);
    const installs = db.rows("marketplace_installs");
    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({
      kind: "theme",
      listing_slug: "classic",
      status: "installed",
    });
    const themes = db.rows("store_themes");
    expect(themes[0].source_install_id).toBe(installs[0].id);
    const audit = db.rows("theme_audit");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "theme.installed",
      actor: "user-9",
    });
  });

  it("replays the existing row instead of duplicating", async () => {
    const db = catalogDb();
    const first: any = await installCatalogTheme(
      db.asClient(),
      MERCHANT,
      "classic",
      "user-9",
    );
    const out: any = await installCatalogTheme(
      db.asClient(),
      MERCHANT,
      "classic",
      "user-9",
    );
    expect(out.alreadyInstalled).toBe(true);
    expect(out.id).toBe(first.id);
    expect(db.rows("store_themes")).toHaveLength(1);
    expect(db.rows("theme_versions")).toHaveLength(1);
  });

  it("refuses unknown catalogue keys without writing anything", async () => {
    const db = catalogDb();
    await expect(
      installCatalogTheme(db.asClient(), MERCHANT, "nope", "user-9"),
    ).rejects.toThrow();
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });
});
