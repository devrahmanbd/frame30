/**
 * Frame30 I-1 — official update check resolves from source.
 *
 * A merchant who installed Songoskriti from source (no `theme_registry`
 * row — fresh environments never seed one) must still get an update
 * preview instead of `builder.registry_missing`.
 */
import { describe, expect, it } from "vitest";
import { previewThemeUpdate } from "./themes.server";
import { fakeDb } from "./__fixtures__/fake-db";

const MERCHANT = "55555555-5555-4555-8555-555555555555";
const THEME = "66666666-6666-4666-8666-666666666666";

function sourceDb() {
  return fakeDb({
    tables: {
      store_themes: [
        {
          id: THEME,
          merchant_id: MERCHANT,
          name: "Songoskriti",
          is_active: true,
          published_version_id: null,
          source_listing_slug: "songoskriti",
          source_version: "1.0.0",
        },
      ],
      theme_versions: [],
      theme_drafts: [
        {
          theme_id: THEME,
          templates: {},
          tokens: {},
          revision: 1,
          updated_at: null,
        },
      ],
      theme_schedules: [],
      theme_registry: [],
    },
  });
}

describe("Frame30 official update check from source", () => {
  it("previewThemeUpdate resolves official keys without a registry row", async () => {
    const db = sourceDb();
    const out = await previewThemeUpdate(db.asClient(), MERCHANT, "songoskriti");
    expect(out).not.toBeNull();
    expect(out!.key).toBe("songoskriti");
    expect(out!.latestVersion).toBe("1.0.0");
    expect(out!.available).toBe(false);
  });
});
