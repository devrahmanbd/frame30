/**
 * Task 2 — marketplace/appearance theme lifecycle purge contract (TDD).
 *
 * The themeless storefront keeps plugin/widget flows only. Every theme-only
 * module, route, card and lifecycle entry point below must be gone; widget
 * flows must remain wired.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function exists(relPath: string): boolean {
  return existsSync(resolve(process.cwd(), relPath));
}

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf-8");
}

const DELETED_PATHS = [
  // appearance pure + server + RPC layers
  "src/lib/themes/appearance.ts",
  "src/lib/themes/appearance.server.ts",
  "src/lib/themes/appearance.functions.ts",
  "src/lib/themes/appearance.test.ts",
  // theme-only admin screens/cards
  "src/components/admin/themes/ThemeCard.tsx",
  "src/components/admin/themes/ThemesScreen.tsx",
  "src/components/admin/themes/ThemePreviewSplit.tsx",
  "src/components/admin/themes/AddThemeScreen.tsx",
  "src/components/admin/themes/ThemeDetailsModal.tsx",
  "src/components/admin/themes/ThemeScreenshot.tsx",
  "src/components/admin/themes/FeatureFilterDrawer.tsx",
  "src/components/admin/themes/ThemeAssetsPanel.tsx",
  "src/components/admin/themes/import-demo-data.tsx",
  // theme-only routes + preview frame
  "src/routes/_authenticated/dashboard/content/themes.tsx",
  "src/routes/theme-preview.$key.tsx",
  "src/components/store/ThemePreviewFrame.tsx",
  // theme-card badge helper (no theme cards remain)
  "src/lib/marketplace-badges.ts",
  "src/lib/marketplace-badges.test.ts",
  // theme lifecycle tests leave with their modules
  "src/lib/themes-install-catalog.test.ts",
  "src/lib/marketplace-activate-delete.test.ts",
  "src/lib/marketplace-lifecycle.test.ts",
  "src/lib/marketplace-bridge.test.ts",
  "src/lib/themes/activation-guard.test.ts",
  "src/lib/themes/activation-latency.test.ts",
];

describe("theme purge: deleted modules stay deleted", () => {
  it.each(DELETED_PATHS)("removes %s", (relPath) => {
    expect(exists(relPath), relPath).toBe(false);
  });
});

describe("theme purge: no theme lifecycle in marketplace server", () => {
  it("marketplace.server.ts buyer catalog has no theme offer or registry reads", () => {
    const src = read("src/lib/marketplace.server.ts");
    expect(src).not.toContain("VISIBLE_THEME_KEYS");
    expect(src).not.toContain("builtinThemes");
    expect(src).not.toContain("THEME_PRESETS");
    expect(src).not.toContain("catalogMeta");
    expect(src).not.toContain("store_themes");
    expect(src).not.toContain("themeStates");
    // listCatalog (buyer offer) reads widgets + ledger only. Seller
    // inventory (listMine) and moderation keep their shape for Task 5.
    const start = src.indexOf("export async function listCatalog");
    const end = src.indexOf("export async function listMine");
    expect(start).toBeGreaterThan(-1);
    const catalog = src.slice(start, end === -1 ? undefined : end);
    expect(catalog).not.toContain("marketplace_themes");
    expect(catalog).toContain("marketplace_widgets");
  });

  it("marketplace-install.server.ts keeps widget flows, drops theme lifecycle", () => {
    const src = read("src/lib/marketplace-install.server.ts");
    expect(src).not.toContain("installBuiltinTheme");
    expect(src).not.toContain("uninstallBuiltinTheme");
    expect(src).not.toContain("materializeListingTheme");
    expect(src).not.toContain("market_apply_theme_install");
    expect(src).not.toContain("market_revert_theme_install");
    expect(src).not.toContain("themes/appearance.server");
    expect(src).not.toContain("builder-ast");
    // widget flows untouched
    expect(src).toContain("uninstallWidgetInstall");
    expect(src).toContain("plugin_state");
    expect(src).toContain("bulkInstallStatus");
  });

  it("marketplace.functions.ts drops theme preview/uninstall RPCs", () => {
    const src = read("src/lib/marketplace.functions.ts");
    expect(src).not.toContain("marketPreviewTokenFn");
    expect(src).not.toContain("marketUninstallThemeFn");
    expect(src).not.toContain("themes/appearance.functions");
    // widget flows untouched
    expect(src).toContain("marketUninstallWidgetFn");
    expect(src).toContain("marketInstallFn");
  });
});

describe("theme purge: no theme UI in dashboard", () => {
  it("marketplace index is widget-only", () => {
    const src = read(
      "src/routes/_authenticated/dashboard/marketplace/index.tsx",
    );
    expect(src).not.toContain("ThemePreviewSplit");
    expect(src).not.toContain("ThemeScreenshot");
    expect(src).not.toContain("themeActivateFn");
    expect(src).not.toContain("themeDeleteFn");
    expect(src).not.toContain("marketPreviewTokenFn");
    expect(src).not.toContain("marketUninstallThemeFn");
    expect(src).not.toContain("builderDemoImportFn");
    expect(src).not.toContain("resolveThemeBadge");
    expect(src).not.toContain("themeStateBySlug");
    expect(src).not.toContain("data.themes");
    // widget flows untouched
    expect(src).toContain("marketUninstallWidgetFn");
    expect(src).toContain("InstalledApps");
    expect(src).toContain("idempotencyKey: stableKey");
  });

  it("console nav drops theme entries, keeps plugin entries", () => {
    const src = read("src/lib/console-nav.ts");
    expect(src).not.toContain("/dashboard/content/themes");
    expect(src).not.toContain('tab: "theme"');
    expect(src).toContain('tab: "plugin"');
    expect(src).toContain("/dashboard/plugins");
  });

  it("generated route tree drops theme routes, keeps theme cron (Task 5 scope)", () => {
    const src = read("src/routeTree.gen.ts");
    expect(src).not.toContain("theme-preview/$key");
    expect(src).not.toContain("dashboard/content/themes");
    expect(src).toContain("/api/public/cron/themes");
  });
});
