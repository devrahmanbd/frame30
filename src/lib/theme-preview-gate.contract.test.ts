/**
 * System-domain-only theme preview — wiring contract gate (Sept 2026 fix).
 *
 * Pins the two enforcement points plus the legitimate flows that must keep
 * working: builder-internal `?preview_theme_id=` (dashboard-authenticated)
 * and the HMAC-signed `preview_token` split preview (system-domain path
 * URL, merchant-bound, fail-closed to published).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("theme-preview gate wiring", () => {
  it("server.ts 404s merchant-host /theme-preview/* before SSR", () => {
    const src = readFileSync("src/server.ts", "utf8");
    expect(src).toContain("isBlockedThemePreview");
    expect(src).toContain("framique_theme_preview_blocked_total");
  });

  it("the preview route loader denies non-system hosts with notFound()", () => {
    const src = readFileSync("src/routes/theme-preview.$key.tsx", "utf8");
    expect(src).toContain("themePreviewHostGateFn");
    expect(src).toContain("throw notFound()");
    // Never a login redirect from a storefront path.
    expect(src).not.toContain("redirect(");
  });

  it("the gate server fn exists on the RPC boundary", () => {
    const src = readFileSync("src/lib/storefront.functions.ts", "utf8");
    expect(src).toContain("themePreviewHostGateFn");
    expect(src).toContain("isThemePreviewHostAllowed");
  });
});

describe("legitimate preview flows preserved", () => {
  it("signed split preview still verifies HMAC tokens merchant-bound", () => {
    const src = readFileSync("src/lib/storefront.functions.ts", "utf8");
    expect(src).toContain("verifyPreviewToken");
    const store = readFileSync("src/routes/store.$slug.index.tsx", "utf8");
    expect(store).toContain("preview_token");
  });

  it("builder-internal preview entry still navigates with preview_theme_id", () => {
    const src = readFileSync(
      "src/components/admin/themes/ThemesScreen.tsx",
      "utf8",
    );
    expect(src).toContain("preview_theme_id");
  });

  it("platform-host /p/* fallback redirect to the (system-side) preview stays", () => {
    const src = readFileSync("src/routes/p.$productSlug.tsx", "utf8");
    expect(src).toContain("/theme-preview/$key");
  });
});
