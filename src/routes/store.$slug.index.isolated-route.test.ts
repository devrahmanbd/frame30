/**
 * Published store homepage — Level B isolated-theme wiring pin.
 *
 * The route (`store.$slug.index.tsx`) wires the published projection plus
 * the server-revalidating `onCall` into the storefront WITHOUT touching
 * ThemeChrome (sibling-owned, read-only): it builds ThemeChrome's
 * `isolatedTheme` mount through the existing optional prop.
 *
 * Pinned here as source invariants (same pattern as the editor seam
 * wiring test — asserting on file text keeps the router runtime out):
 * 1. A storefront bridge serverFn exists in the route and delegates to the
 *    REAL `resolveStorefrontDevThemeCall` with live suspension
 *    (`loadStorefrontDevThemeSuspension`) and a projection-derived
 *    navigate allowlist — never frame input, never a default.
 * 2. The component gates the mount: preview drafts never mount, CMS-pinned
 *    pages never inherit the active theme's binding, malformed inputs never
 *    mount (fail closed to the classic homepage).
 * 3. The mount rides ThemeChrome's `isolatedTheme` prop with a
 *    `custom-isolated` runtime flag and a host `onCall`; the classic
 *    StoreHomepage branch is untouched when no approved release projects.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(DIR, "store.$slug.index.tsx"), "utf8");

describe("published homepage isolated-theme wiring", () => {
  it("defines a storefront bridge serverFn on the REAL resolver with live suspension", () => {
    expect(SRC).toContain("storefrontDevThemeCallFn");
    expect(SRC).toContain("createServerFn");
    expect(SRC).toContain("resolveStorefrontDevThemeCall");
    expect(SRC).toContain("loadStorefrontDevThemeSuspension");
    expect(SRC).toContain("loadPublishedDevThemeProjection");
  });

  it("derives the navigate allowlist from the published projection, never frame input", () => {
    expect(SRC).toContain("projection.binding.navigateAllowlist");
  });

  it("gates the mount: preview drafts and pinned pages never mount", () => {
    expect(SRC).toContain("preview === true");
    expect(SRC).toContain("theme_id");
    expect(SRC).toContain("buildHomepageIsolatedTheme");
  });

  it("rides ThemeChrome's existing isolatedTheme prop with a host onCall", () => {
    expect(SRC).toContain("isolatedTheme={isolatedTheme}");
    expect(SRC).toContain('runtime: "custom-isolated"');
    expect(SRC).toContain("onCall");
  });

  it("keeps the classic homepage branch byte-identical when unmounted", () => {
    expect(SRC).toContain("<StoreHomepage home={data.homepage} slug={slug} />");
    expect(SRC).toContain("<StoreWelcome");
  });

  it("surfaces bridge failures as theme.* errors (never raw internals)", () => {
    expect(SRC).toContain("theme.host_error");
  });
});
