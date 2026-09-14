import { describe, expect, it } from "vitest";
import {
  EMPTY_SELECTION,
  catalogView,
  filterCatalog,
  formatBytes,
  isNewerVersion,
  neighbourTheme,
  orderInstalled,
  previewUrl,
  screenshotPlate,
  searchCatalog,
  searchInstalled,
  selectionCount,
  sortCatalog,
  themeInitials,
  toggleFeature,
  validateThemeUpload,
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
    ...overrides,
  };
}

function inst(overrides: Partial<InstalledTheme> & { id: string }): InstalledTheme {
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
    expect(searchCatalog(themes, "editorial fashion").map((t) => t.key)).toEqual(["atelier"]);
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
    expect(searchInstalled(installed, "fashion").map((t) => t.id)).toEqual(["a"]);
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
    cat({ key: "b", subjects: ["fashion", "beauty"], features: ["wishlist"], layouts: ["list"] }),
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
    cat({ key: "b", name: "B", installs: 90, rating: 5, version: "1.10.0", favourite: true }),
    cat({ key: "c", name: "C", installs: 90, rating: 3, version: "2.0.0" }),
  ];

  it("orders popular by installs then rating", () => {
    expect(sortCatalog(themes, "popular").map((t) => t.key)).toEqual(["b", "c", "a"]);
  });

  it("orders latest by semantic version, not string order", () => {
    expect(sortCatalog(themes, "latest").map((t) => t.key)).toEqual(["c", "b", "a"]);
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
      inst({ id: "fav", favourite: true, installedAt: "2026-02-01T00:00:00.000Z" }),
      inst({ id: "active", isActive: true, installedAt: "2025-01-01T00:00:00.000Z" }),
    ];
    expect(orderInstalled(list).map((t) => t.id)).toEqual(["active", "fav", "new", "old"]);
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
    expect(validateThemeUpload({ name: "atelier.tar", size: 10 }).ok).toBe(false);
    expect(validateThemeUpload({ name: "atelier.zip", size: 0 }).ok).toBe(false);
    expect(validateThemeUpload({ name: "atelier.zip", size: 40 * 1024 * 1024 }).ok).toBe(false);
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

  it("builds a preview url with device and theme", () => {
    expect(previewUrl("cloudman", "atelier", "mobile")).toBe(
      "/store/cloudman?preview_device=mobile&preview_theme=atelier",
    );
    expect(previewUrl("cloudman", null, "desktop")).toBe("/store/cloudman?preview_device=desktop");
  });
});
