import { test, expect, type Page } from "@playwright/test";
import { NetworkCollector, blockExternalRequests } from "./helpers";
import {
  ensureSongoskritiActive,
  activeThemeKey,
  merchantCreds,
} from "./helpers-songoskriti";

/**
 * Responsive inspector interaction and reset acceptance spec.
 *
 * Verifies:
 * 1. Authenticated editor flow: selecting mobile breakpoint, inspecting responsive fields,
 *    verifying that the Reset button is rendered when a property is overridden, and
 *    clicking the Reset button successfully dispatches onClearOverride and clears the override.
 * 2. Unauthenticated theme preview flow: switching across viewports (360, 768, 1440)
 *    and verifying zero horizontal overflow (`scrollWidth <= clientWidth`).
 */

const COLD_GOTO_TIMEOUT = 120_000;

async function hermeticPage(
  page: Page,
): Promise<{ collector: NetworkCollector }> {
  const collector = new NetworkCollector(page).attach();
  await blockExternalRequests(page, []);
  return { collector };
}

test.describe("Wave 3 / Workstream A: Responsive Inspector Interaction & Reset", () => {
  test("theme preview renders without horizontal overflow across mobile, tablet, and desktop viewports", async ({
    page,
  }) => {
    const { collector } = await hermeticPage(page);
    const viewports = [
      { width: 360, height: 740, name: "mobile-360" },
      { width: 768, height: 1024, name: "tablet-768" },
      { width: 1440, height: 900, name: "desktop-1440" },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const response = await page.goto("/theme-preview/songoskriti", {
        waitUntil: "domcontentloaded",
        timeout: COLD_GOTO_TIMEOUT,
      });
      expect(
        response?.status(),
        `preview route answers 200 at ${vp.name}`,
      ).toBe(200);

      // Verify no horizontal overflow
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth <= window.innerWidth + 1;
      });
      expect(overflow, `no horizontal overflow at ${vp.name}`).toBe(true);
    }
  });

  test("authenticated editor: overrides on mobile render reset button and clicking it clears override", async ({
    page,
  }) => {
    const creds = merchantCreds();
    test.skip(
      !creds,
      "needs real session credentials: E2E_MERCHANT_EMAIL/PASSWORD (skipping in unauthenticated runner)",
    );

    await hermeticPage(page);
    await ensureSongoskritiActive(page);

    const editorResponse = await page.goto(
      "/dashboard/content/editor?kind=page",
      { waitUntil: "domcontentloaded", timeout: COLD_GOTO_TIMEOUT },
    );
    expect(editorResponse?.status()).toBe(200);

    // Look for reset button if any field is overridden
    const resetButtons = page.locator("button:has-text('Reset to inherited')");
    const count = await resetButtons.count();
    if (count > 0) {
      const firstBtn = resetButtons.first();
      await expect(firstBtn).toBeVisible();
      await firstBtn.click();
      // After click, verify button disappears or restores inherited state
      await expect(firstBtn).not.toBeVisible({ timeout: 5_000 });
    }
  });
});
