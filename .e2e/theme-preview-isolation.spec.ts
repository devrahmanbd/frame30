import { test, expect } from "@playwright/test";
import {
  NetworkCollector,
  blockExternalRequests,
  documentImageUrls,
} from "./helpers";

/**
 * Theme-preview isolation spec (b).
 *
 * Loads /theme-preview/songoskriti (public, unauthenticated on loopback)
 * and asserts asset integrity from the browser's point of view:
 * - every image in the rendered document returns 200;
 * - zero `assets/`-relative 404s occur (failed requests AND error
 *   responses are both collected via requestfailed/response events);
 * - hermetic: no request leaves loopback.
 *
 * Cleanup: the collector is disposed in afterAll; the dev server is owned
 * by the Playwright webServer entry (auto-killed) or the operator README.
 */

let collector: NetworkCollector | null = null;

test.afterAll(() => {
  collector?.dispose();
  collector = null;
});

test("songoskriti preview serves every image with zero assets/ 404s", async ({
  page,
  request,
}) => {
  collector = new NetworkCollector(page).attach();
  const blocked: string[] = [];
  await blockExternalRequests(page, blocked);
  const response = await page.goto("/theme-preview/songoskriti", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);

  // The preview frame renders real theme imagery, not an empty shell.
  await expect(page.locator("img").first(), "preview renders images").toBeVisible({
    timeout: 20_000,
  });
  try {
    await page.waitForLoadState("networkidle", { timeout: 30_000 });
  } catch {
    // Late third-party-free beacons must not fail the suite; the response
    // map below is the source of truth either way.
  }
  const imgCount = await page.locator("img").count();
  expect(imgCount).toBeGreaterThanOrEqual(8);

  // No `assets/`-relative 404s — neither as failed requests nor as error
  // responses.
  const failedAssets = (collector?.failed ?? []).filter((u) =>
    u.includes("assets/"),
  );
  expect(failedAssets, "no failed assets/ requests").toEqual([]);
  const asset404s = (collector?.responses ?? []).filter(
    (r) => r.status === 404 && r.url.includes("assets/"),
  );
  expect(asset404s, "no assets/ 404 responses").toEqual([]);

  // Every rendered image resolves to 200 (re-fetched through the same
  // local baseURL so late-lazy images are covered too).
  const urls = await documentImageUrls(page);
  expect(urls.length).toBeGreaterThanOrEqual(8);
  const failures: string[] = [];
  for (const url of urls) {
    const res = await request.get(url, { timeout: 30_000 });
    if (res.status() !== 200) failures.push(`${res.status()} ${url}`);
  }
  expect(failures, "all preview images return 200").toEqual([]);

  // Hermetic: externals were blocked before the network, so nothing
  // outside loopback completed (fonts ship in app markup; they must not
  // be needed for the assertions above to hold).
  expect(collector?.externalResponses() ?? []).toEqual([]);
});
