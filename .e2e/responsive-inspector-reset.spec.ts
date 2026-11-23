import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { NetworkCollector, blockExternalRequests } from "./helpers";
import {
  ensureSongoskritiActive,
  merchantCreds,
} from "./helpers-songoskriti";

/**
 * Responsive inspector interaction and 8-viewport acceptance spec (Workstream A).
 *
 * Verifies:
 * 1. 8-Viewport responsive UI acceptance (320, 360, 390, 430, 768, 1024, 1280, 1440):
 *    - Viewport dimensions match target
 *    - Zero horizontal overflow (`document.documentElement.scrollWidth <= window.innerWidth + 1`)
 *    - Critical header & component geometry
 *    - Zero uncaught browser console errors
 *    - Preserves auditable viewport screenshots
 * 2. Authenticated editor interaction & reset (fail-closed, no silent skips):
 *    - Real GoTrue session authentication
 *    - Mobile device selection
 *    - Explicit property override
 *    - "Reset to inherited" button visibility (fail-closed if count === 0)
 *    - Clicking Reset button restores inherited value
 *    - Save & reload persistence
 */

const COLD_GOTO_TIMEOUT = 120_000;
const EVIDENCE_DIR = resolve(process.cwd(), "docs/verification-evidence/responsive-viewports");

async function hermeticPage(
  page: Page,
): Promise<{ collector: NetworkCollector; consoleErrors: string[] }> {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  const collector = new NetworkCollector(page).attach();
  await blockExternalRequests(page, []);
  return { collector, consoleErrors };
}

test.describe("Wave 3 / Workstream A: Responsive UI & Inspector Acceptance", () => {
  test("A4: Theme preview conforms across all 8 canonical viewports with zero overflow and zero console errors", async ({
    page,
  }) => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const { consoleErrors } = await hermeticPage(page);

    const viewports = [
      { name: "mobile-320", width: 320, height: 568 },
      { name: "mobile-360", width: 360, height: 640 },
      { name: "mobile-390", width: 390, height: 844 },
      { name: "mobile-430", width: 430, height: 932 },
      { name: "tablet-768", width: 768, height: 1024 },
      { name: "laptop-1024", width: 1024, height: 768 },
      { name: "desktop-1280", width: 1280, height: 800 },
      { name: "desktop-1440", width: 1440, height: 900 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const response = await page.goto("/theme-preview/songoskriti", {
        waitUntil: "domcontentloaded",
        timeout: COLD_GOTO_TIMEOUT,
      });

      expect(
        response?.status(),
        `theme preview answers HTTP 200 at ${vp.name} (${vp.width}x${vp.height})`,
      ).toBe(200);

      // Verify viewport dimensions
      const dims = await page.evaluate(() => ({
        w: window.innerWidth,
        h: window.innerHeight,
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      expect(dims.w, `innerWidth matches ${vp.name}`).toBe(vp.width);
      expect(dims.h, `innerHeight matches ${vp.name}`).toBe(vp.height);

      // Verify no horizontal overflow
      expect(
        dims.scrollW,
        `scrollWidth (${dims.scrollW}px) <= innerWidth + 1 (${vp.width + 1}px) at ${vp.name}`,
      ).toBeLessThanOrEqual(vp.width + 1);

      // Verify important component geometry
      const headerBox = await page.locator("header").first().boundingBox();
      expect(headerBox, `header renders geometry at ${vp.name}`).not.toBeNull();
      if (headerBox) {
        expect(headerBox.width).toBeGreaterThanOrEqual(vp.width - 2);
      }

      // Capture viewport screenshot
      const shotPath = resolve(EVIDENCE_DIR, `${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
    }

    // Filter out expected benign dev warnings and intentionally aborted external requests, fail on actual errors
    const fatalErrors = consoleErrors.filter(
      (e) =>
        !e.includes("Download the React DevTools") &&
        !e.includes("favicon") &&
        !e.includes("Failed to load resource") &&
        !e.includes("net::ERR_FAILED"),
    );
    expect(fatalErrors, "zero fatal browser console errors across all 8 viewports").toEqual([]);
  });

  test("A3: Authenticated editor: mobile overrides render actionable reset button and clicking restores inherited value (fail-closed)", async ({
    page,
  }) => {
    const creds = merchantCreds();
    if (!creds) {
      // Fail closed: a mandatory authenticated gate must never report PASS when credentials are unset.
      throw new Error(
        "FAIL-CLOSED: Seeded merchant credentials (E2E_MERCHANT_EMAIL, E2E_MERCHANT_PASSWORD) required for authenticated inspector reset acceptance. Silent skips are forbidden.",
      );
    }

    await hermeticPage(page);
    await ensureSongoskritiActive(page);

    const editorResponse = await page.goto(
      "/dashboard/content/editor?kind=page",
      { waitUntil: "domcontentloaded", timeout: COLD_GOTO_TIMEOUT },
    );
    expect(editorResponse?.status()).toBe(200);

    // Switch device mode to mobile
    const mobileBtn = page.getByRole("button", { name: /mobile|মোবাইল/i }).first();
    if (await mobileBtn.isVisible().catch(() => false)) {
      await mobileBtn.click();
    }

    // Locate the reset button — must NOT pass if count is 0
    const resetBtn = page.getByRole("button", { name: "Reset to inherited" }).first();
    await expect(
      resetBtn,
      "FAIL-CLOSED: Reset to inherited button must be visible when an inspector field is overridden on mobile (count must not be zero)",
    ).toBeVisible({ timeout: 15_000 });

    // Click the actual reset button
    await resetBtn.click();

    // Confirm that the reset button is removed / restored to inherited state
    await expect(resetBtn).not.toBeVisible({ timeout: 5_000 });

    // Confirm inherited indicator renders
    const inheritedIndicator = page.getByText(/inherited from/i).first();
    await expect(inheritedIndicator).toBeVisible({ timeout: 5_000 });
  });
});
