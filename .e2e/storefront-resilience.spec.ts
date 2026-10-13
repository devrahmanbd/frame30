import { test, expect, type Page } from "@playwright/test";
import { NetworkCollector, blockExternalRequests } from "./helpers";

/**
 * Frame30 storefront resilience (hermetic, loopback-only).
 *
 * - Unknown slugs keep rendering each route's localized `notFoundComponent`
 *   (genuine 404 path preserved — no retry confusion).
 * - A loader throw (deterministic trigger: malformed order id fails server-fn
 *   input validation before any backend read) renders the shared
 *   `StorefrontError` boundary with a loader-invalidating retry button —
 *   never a blank crash.
 * - When the backend itself is unreachable, the same unknown-slug pages must
 *   still degrade to the retry boundary, so assertions accept either outcome.
 *
 * Specs start no processes; `afterAll` disposes exactly what this file opened
 * (network listeners). Server lifecycle is owned by the Playwright webServer
 * entry (see README.md).
 */

let collector: NetworkCollector | null = null;

test.afterAll(() => {
  collector?.dispose();
  collector = null;
});

async function gotoHermetic(page: Page, path: string) {
  collector = new NetworkCollector(page).attach();
  const blocked: string[] = [];
  await blockExternalRequests(page, blocked);
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response).toBeTruthy();
}

function expectHermetic() {
  // Externals referenced by app markup (fonts) are blocked before the
  // network, so zero external responses may complete.
  expect(collector?.externalResponses() ?? []).toEqual([]);
}

test("unknown storefront degrades gracefully (404 when backend answers, retry when it does not)", async ({
  page,
}) => {
  const slug = "zz-no-such-store-404";
  for (const path of [
    `/store/${slug}/`,
    `/store/${slug}/cart`,
    `/store/${slug}/checkout`,
  ]) {
    await gotoHermetic(page, path);
    await expect(page.locator("main").first()).toContainText(
      /(Store not found|দোকান পাওয়া যায়নি|This storefront is not published|Couldn.t load this storefront|এই দোকানটি লোড করা যায়নি|Try again|আবার চেষ্টা করুন)/,
      { timeout: 20_000 },
    );
    expectHermetic();
  }
});

test("malformed order id renders the retryable error boundary, not a crash", async ({
  page,
}) => {
  await gotoHermetic(page, "/store/demo/order/not-a-valid-uuid");
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible({ timeout: 20_000 });
  await expect(alert).toContainText(/(Try again|আবার চেষ্টা করুন)/);
  expectHermetic();
});

test("unknown order degrades to not-found or retry, never a blank page", async ({
  page,
}) => {
  await gotoHermetic(
    page,
    "/store/demo/order/11111111-2222-3333-4444-555555555555",
  );
  await expect(page.locator("main").first()).toContainText(
    /(Order not found|অর্ডার পাওয়া যায়নি|Couldn.t load this storefront|এই দোকানটি লোড করা যায়নি|Try again|আবার চেষ্টা করুন)/,
    { timeout: 20_000 },
  );
  expectHermetic();
});
