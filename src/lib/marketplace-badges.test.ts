/**
 * T9 — ledger-active / row-inactive divergence.
 *
 * The Active badge must come from the `store_themes` row (`is_active` via
 * themeStates). A live `marketplace_installs` row with an inactive theme row
 * is "Installed", never "Active". The ledger is fallback for Installed only.
 */
import { describe, expect, it } from "vitest";
import { isLiveInstallStatus, resolveThemeBadge } from "./marketplace-badges";

const LIVE = "installed";

describe("resolveThemeBadge", () => {
  it("marks ledger-live + row-inactive as installed, never active", () => {
    expect(
      resolveThemeBadge("classic", {
        themeStates: [{ slug: "classic", themeId: "t1", isActive: false }],
        installs: [{ theme_id: "listing-1", status: LIVE }],
        listingId: "listing-1",
      }),
    ).toBe("installed");
  });

  it("marks the row-active theme active even when the ledger is terminal", () => {
    expect(
      resolveThemeBadge("classic", {
        themeStates: [{ slug: "classic", themeId: "t1", isActive: true }],
        installs: [{ theme_id: "listing-1", status: "removed" }],
        listingId: "listing-1",
      }),
    ).toBe("active");
  });

  it("marks the row-active theme active with no ledger row at all", () => {
    expect(
      resolveThemeBadge("classic", {
        themeStates: [{ slug: "classic", themeId: "t1", isActive: true }],
        installs: [],
        listingId: "listing-1",
      }),
    ).toBe("active");
  });

  it("falls back to the ledger for installed when no theme row exists", () => {
    expect(
      resolveThemeBadge("classic", {
        themeStates: [],
        installs: [{ theme_id: "listing-1", status: LIVE }],
        listingId: "listing-1",
      }),
    ).toBe("installed");
  });

  it("returns null when neither row nor live ledger exists", () => {
    expect(
      resolveThemeBadge("classic", {
        themeStates: [],
        installs: [{ theme_id: "listing-1", status: "removed" }],
        listingId: "listing-1",
      }),
    ).toBeNull();
    expect(
      resolveThemeBadge("classic", {
        themeStates: [],
        installs: [],
        listingId: "listing-1",
      }),
    ).toBeNull();
  });

  it("keeps an inactive row installed with no ledger row", () => {
    expect(
      resolveThemeBadge("classic", {
        themeStates: [{ slug: "classic", themeId: "t1", isActive: false }],
        installs: [],
        listingId: "listing-1",
      }),
    ).toBe("installed");
  });

  it("matches builtin listings by listing_slug", () => {
    expect(
      resolveThemeBadge("classic", {
        themeStates: [{ slug: "classic", themeId: "t1", isActive: false }],
        installs: [{ listing_slug: "classic", status: "trial" }],
        builtin: true,
      }),
    ).toBe("installed");
  });
});

describe("isLiveInstallStatus", () => {
  it("treats installed/trial/paused as live, terminal states as not", () => {
    expect(isLiveInstallStatus("installed")).toBe(true);
    expect(isLiveInstallStatus("trial")).toBe(true);
    expect(isLiveInstallStatus("paused")).toBe(true);
    expect(isLiveInstallStatus("removed")).toBe(false);
    expect(isLiveInstallStatus("rolled_back")).toBe(false);
  });

  it("treats uninstalling/purged as terminal (never an Installed badge)", () => {
    expect(isLiveInstallStatus("uninstalling")).toBe(false);
    expect(isLiveInstallStatus("purged")).toBe(false);
  });
});

describe("B2 badge tails (paused dispute + source divergence)", () => {
  it("paused ledger + no row resolves to installed, never active (WP parity: paused = present-but-inactive)", () => {
    expect(
      resolveThemeBadge("classic", {
        themeStates: [],
        installs: [{ theme_id: "listing-1", status: "paused" }],
        listingId: "listing-1",
      }),
    ).toBe("installed");
  });

  it("catalog installs write theme_id NULL — a slug-matching live ledger row still counts as installed", () => {
    expect(
      resolveThemeBadge("classic", {
        themeStates: [],
        installs: [
          { theme_id: null, listing_slug: "classic", status: "installed" },
        ],
        listingId: "catalog-row-id-that-never-matches-theme-id",
      }),
    ).toBe("installed");
  });
});
