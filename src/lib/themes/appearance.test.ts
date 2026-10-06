import { describe, expect, it } from "vitest";
import {
  EMPTY_SELECTION,
  OFFICIAL_THEME_KEYS,
  catalogView,
  filterCatalog,
  formatBytes,
  galleryKeys,
  isNewerVersion,
  isOfficialThemeKey,
  neighbourTheme,
  officialArtifactRef,
  officialPinFor,
  orderInstalled,
  previewUrl,
  screenshotPlate,
  searchCatalog,
  searchInstalled,
  sectionCatalogue,
  selectionCount,
  sortCatalog,
  themeInitials,
  toggleFeature,
  validateThemeUpload,
  visibleCatalogue,
  visibleInstalled,
  type CatalogTheme,
  type InstalledTheme,
} from "./appearance";

function cat(overrides: Partial<CatalogTheme> & { key: string }): CatalogTheme {
  return {
    name: overrides.key,
    summary: "",
    author: "Framique",
    category: "general",
    version: "1.0.0",
    screenshotUrl: null,
    tags: [],
    subjects: [],
    features: [],
    layouts: [],
    rating: 4,
    installs: 0,
    installed: false,
    active: false,
    favourite: false,
    provenance: "community",
    ...overrides,
  };
}

function inst(
  overrides: Partial<InstalledTheme> & { id: string },
): InstalledTheme {
  return {
    key: null,
    name: overrides.id,
    author: "Framique",
    description: "",
    version: "1.0.0",
    tags: [],
    screenshotUrl: null,
    isActive: false,
    autoUpdate: true,
    favourite: false,
    installedAt: "2026-01-01T00:00:00.000Z",
    updateAvailable: null,
    ...overrides,
  };
}

describe("search", () => {
  const themes = [
    cat({
      key: "atelier",
      name: "Atelier",
      summary: "Editorial fashion",
      tags: ["fashion", "minimal"],
    }),
    cat({
      key: "voltage",
      name: "Voltage",
      summary: "Electronics megastore",
      tags: ["electronics"],
    }),
  ];

  it("matches on every term", () => {
    expect(
      searchCatalog(themes, "editorial fashion").map((t) => t.key),
    ).toEqual(["atelier"]);
    expect(searchCatalog(themes, "editorial electronics")).toHaveLength(0);
  });

  it("returns everything for a blank query", () => {
    expect(searchCatalog(themes, "   ")).toHaveLength(2);
  });

  it("searches installed themes on name, author and tags", () => {
    const installed = [
      inst({ id: "a", name: "Atelier", tags: ["fashion"] }),
      inst({ id: "b", name: "Voltage" }),
    ];
    expect(searchInstalled(installed, "fashion").map((t) => t.id)).toEqual([
      "a",
    ]);
    expect(searchInstalled(installed, "")).toHaveLength(2);
  });
});

describe("feature filter", () => {
  const themes = [
    cat({
      key: "a",
      subjects: ["fashion"],
      features: ["wishlist", "dark mode"],
      layouts: ["grid"],
    }),
    cat({
      key: "b",
      subjects: ["fashion", "beauty"],
      features: ["wishlist"],
      layouts: ["list"],
    }),
  ];

  it("ANDs every selected option", () => {
    const selection = {
      ...EMPTY_SELECTION,
      subjects: ["fashion"],
      features: ["wishlist", "dark mode"],
    };
    expect(filterCatalog(themes, selection).map((t) => t.key)).toEqual(["a"]);
  });

  it("passes everything through when nothing is selected", () => {
    expect(filterCatalog(themes, EMPTY_SELECTION)).toHaveLength(2);
  });

  it("toggles options on and off and counts them", () => {
    let selection = toggleFeature(EMPTY_SELECTION, "features", "wishlist");
    expect(selectionCount(selection)).toBe(1);
    selection = toggleFeature(selection, "features", "wishlist");
    expect(selectionCount(selection)).toBe(0);
  });
});

describe("sorting", () => {
  const themes = [
    cat({ key: "a", name: "A", installs: 10, rating: 4, version: "1.2.0" }),
    cat({
      key: "b",
      name: "B",
      installs: 90,
      rating: 5,
      version: "1.10.0",
      favourite: true,
    }),
    cat({ key: "c", name: "C", installs: 90, rating: 3, version: "2.0.0" }),
  ];

  it("orders popular by installs then rating", () => {
    expect(sortCatalog(themes, "popular").map((t) => t.key)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("orders latest by semantic version, not string order", () => {
    expect(sortCatalog(themes, "latest").map((t) => t.key)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("shows only favourites on the favourites tab", () => {
    expect(sortCatalog(themes, "favourites").map((t) => t.key)).toEqual(["b"]);
  });

  it("compares versions numerically", () => {
    expect(isNewerVersion("1.10.0", "1.9.9")).toBe(true);
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
  });

  it("composes search, filter and sort", () => {
    const view = catalogView(themes, { query: "b", tab: "popular" });
    expect(view.map((t) => t.key)).toEqual(["b"]);
  });
});

describe("installed ordering", () => {
  it("puts the active theme first, then favourites, then newest", () => {
    const list = [
      inst({ id: "old", installedAt: "2026-01-01T00:00:00.000Z" }),
      inst({ id: "new", installedAt: "2026-05-01T00:00:00.000Z" }),
      inst({
        id: "fav",
        favourite: true,
        installedAt: "2026-02-01T00:00:00.000Z",
      }),
      inst({
        id: "active",
        isActive: true,
        installedAt: "2025-01-01T00:00:00.000Z",
      }),
    ];
    expect(orderInstalled(list).map((t) => t.id)).toEqual([
      "active",
      "fav",
      "new",
      "old",
    ]);
  });

  it("tolerates legacy rows with a null install timestamp", () => {
    // Live rows written before installed_at was stamped (NULL) once threw
    // inside the comparator and blanked the whole themes screen.
    const list = [
      inst({ id: "legacy", installedAt: null }),
      inst({ id: "new", installedAt: "2026-05-01T00:00:00.000Z" }),
      inst({
        id: "active",
        isActive: true,
        installedAt: "2025-01-01T00:00:00.000Z",
      }),
    ];
    expect(orderInstalled(list).map((t) => t.id)).toEqual([
      "active",
      "new",
      "legacy",
    ]);
  });
});

describe("uploads", () => {
  it("accepts a reasonable zip", () => {
    expect(validateThemeUpload({ name: "atelier.zip", size: 2048 })).toEqual({
      ok: true,
      name: "atelier.zip",
    });
  });

  it("rejects the wrong extension, empty and oversized files", () => {
    expect(validateThemeUpload({ name: "atelier.tar", size: 10 }).ok).toBe(
      false,
    );
    expect(validateThemeUpload({ name: "atelier.zip", size: 0 }).ok).toBe(
      false,
    );
    expect(
      validateThemeUpload({ name: "atelier.zip", size: 40 * 1024 * 1024 }).ok,
    ).toBe(false);
  });

  it("formats byte counts", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("presentation helpers", () => {
  it("derives stable initials", () => {
    expect(themeInitials("Atelier")).toBe("AT");
    expect(themeInitials("Voltage Pro")).toBe("VP");
    expect(themeInitials("   ")).toBe("TH");
  });

  it("derives a stable gradient per seed", () => {
    expect(screenshotPlate("atelier")).toEqual(screenshotPlate("atelier"));
    expect(screenshotPlate("atelier")).not.toEqual(screenshotPlate("voltage"));
  });

  it("wraps around when stepping between themes", () => {
    const list = [cat({ key: "a" }), cat({ key: "b" })];
    expect(neighbourTheme(list, list[0]!, -1)?.key).toBe("b");
    expect(neighbourTheme(list, list[1]!, 1)?.key).toBe("a");
    expect(neighbourTheme([list[0]!], list[0]!, 1)).toBeNull();
  });

  it("points live preview at the public blueprint route (store paths 404)", () => {
    expect(previewUrl("cloudman", "atelier", "mobile")).toBe(
      "/theme-preview/atelier?preview_device=mobile",
    );
    expect(previewUrl("cloudman", null, "desktop")).toBe(
      "/store/cloudman?preview_device=desktop",
    );
  });
});

describe("catalogue honesty (no-fabrication rule)", () => {
  it("ships zero installs and zero ratings until real marketplace data exists", async () => {
    const { CATALOG_META } = await import("./catalog-meta");
    const entries = Object.entries(CATALOG_META);
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, meta] of entries) {
      expect(meta.installs, key).toBe(0);
      expect(meta.rating, key).toBe(0);
    }
  });
});

describe("B2 catalogue sections (Official / Community / Upload)", () => {
  it("names exactly the two built themes — no third vapor theme", () => {
    expect([...OFFICIAL_THEME_KEYS]).toEqual(["songoskriti", "somvabona"]);
    expect(isOfficialThemeKey("songoskriti")).toBe(true);
    expect(isOfficialThemeKey("somvabona")).toBe(true);
    expect(isOfficialThemeKey("vapor")).toBe(false);
    expect(isOfficialThemeKey("classic")).toBe(false);
    expect(isOfficialThemeKey("")).toBe(false);
  });

  it("pins official artifacts as official:<key>", () => {
    expect(officialPinFor("songoskriti")).toBe("official:songoskriti");
    expect(
      officialArtifactRef("somvabona", "1.0.0", "ab".repeat(32)),
    ).toMatchObject({
      version: "1.0.0",
      fileName: "somvabona.zip",
      pinned: "official:somvabona",
    });
  });

  it("splits official first (curated order) then community", () => {
    const themes = [
      cat({ key: "acme-pack", provenance: "community" }),
      cat({ key: "somvabona", provenance: "official" }),
      cat({ key: "songoskriti", provenance: "official" }),
    ];
    const sections = sectionCatalogue(themes);
    expect(sections.official.map((t) => t.key)).toEqual([
      "songoskriti",
      "somvabona",
    ]);
    expect(sections.community.map((t) => t.key)).toEqual(["acme-pack"]);
  });

  it("leaves either section empty without throwing (unbuilt official)", () => {
    expect(sectionCatalogue([])).toEqual({ official: [], community: [] });
    const onlyCommunity = sectionCatalogue([cat({ key: "acme-pack" })]);
    expect(onlyCommunity.official).toEqual([]);
    expect(onlyCommunity.community.map((t) => t.key)).toEqual(["acme-pack"]);
  });

  it("installed grid keeps every installed row (never strand)", () => {
    const themes = [
      inst({ id: "a", key: "songoskriti" }),
      inst({ id: "b", key: "classic" }),
      inst({ id: "c", key: null }),
      inst({ id: "live", key: null, isActive: true }),
    ];
    expect(visibleInstalled(themes).map((t) => t.id)).toEqual([
      "a",
      "b",
      "c",
      "live",
    ]);
  });

  it("catalogue passes official + community through (no allowlist hole)", () => {
    const themes = [
      cat({ key: "songoskriti", provenance: "official" }),
      cat({ key: "acme-pack", provenance: "community" }),
    ];
    expect(visibleCatalogue(themes).map((t) => t.key)).toEqual([
      "songoskriti",
      "acme-pack",
    ]);
  });
});

describe("gallery keys (installed packages listed alongside source keys)", () => {
  it("unions installed-only keys after catalogue keys, in order", () => {
    expect(
      galleryKeys(["songoskriti", "somvabona"], [{ key: "acme-pack" }]),
    ).toEqual(["songoskriti", "somvabona", "acme-pack"]);
  });

  it("accepts bare slugs and keyed rows in either list, without duplicating", () => {
    expect(
      galleryKeys(["songoskriti", { key: "somvabona" }], [
        "songoskriti",
        { key: "somvabona" },
        { key: "acme-pack" },
      ]),
    ).toEqual(["songoskriti", "somvabona", "acme-pack"]);
  });

  it("removal disappears from the list (uninstalled rows are simply not passed)", () => {
    expect(galleryKeys(["songoskriti"], [{ key: "acme-pack" }])).toContain(
      "acme-pack",
    );
    expect(galleryKeys(["songoskriti"], [])).not.toContain("acme-pack");
    expect(galleryKeys(["songoskriti"], [])).toEqual(["songoskriti"]);
  });

  it("never throws on malformed rows or containers", () => {
    const garbage = [null, undefined, "", "   ", 42, {}, { key: 7 }] as never[];
    expect(galleryKeys(garbage, garbage)).toEqual([]);
    expect(galleryKeys(null, undefined)).toEqual([]);
    expect(galleryKeys("nope" as never, 42 as never)).toEqual([]);
    expect(galleryKeys(["  songoskriti  "], [{ key: " " }])).toEqual([
      "songoskriti",
    ]);
  });
});
