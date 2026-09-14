#!/usr/bin/env node
/** Cross-engine storefront journey and failed-JS floor for Phase 6. */
import { chromium, firefox, webkit } from "playwright";

const base = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const storeSlug = process.env.E2E_STORE_SLUG;
const failures = [];

if (!storeSlug) {
  console.error(
    "Browser support gate requires E2E_STORE_SLUG for a seeded storefront with at least one in-stock product.",
  );
  process.exit(2);
}

function report(engine, step, details = {}) {
  console.log(JSON.stringify({ gate: "browser-support", engine, step, ...details }));
}

async function openWithRetry(page, url, engine) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      if (!response || response.status() >= 400) throw new Error(`HTTP ${response?.status() ?? "no response"}`);
      return;
    } catch (error) {
      lastError = error;
      report(engine, "navigation-retry", { attempt, message: error instanceof Error ? error.message : String(error) });
    }
  }
  throw lastError;
}

for (const [name, browserType] of Object.entries({ chromium, firefox, webkit })) {
  let browser;
  try {
    browser = await browserType.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
    const page = await context.newPage();
    await openWithRetry(page, `${base}/store/${storeSlug}`, name);
    await page.locator("main h1").first().waitFor({ state: "visible", timeout: 10_000 });
    report(name, "home");

    const collection = page.getByRole("group", { name: "Filter by collection" }).getByRole("button").nth(1);
    if (await collection.count()) {
      await collection.click();
      report(name, "collection-filter");
    } else report(name, "collection-filter-unavailable");

    const product = page.locator('a[href*="/p/"]').first();
    await product.waitFor({ state: "visible", timeout: 10_000 });
    await product.click();
    await page.getByRole("heading", { level: 1 }).waitFor({ state: "visible" });
    report(name, "product");

    await page.getByRole("button", { name: /Add to cart|কার্টে যোগ করুন/i }).click();
    await page.getByText(/Added to cart|কার্টে যোগ হয়েছে/i).waitFor({ state: "visible" });
    await page.getByRole("link", { name: /Checkout|চেকআউট/i }).last().click();
    await page.getByRole("heading", { level: 1, name: /Checkout|চেকআউট/i }).waitFor({ state: "visible" });
    report(name, "cart-checkout", { outcome: "passed" });
    await context.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    report(name, "failed", { message });
  } finally {
    await browser?.close();
  }
}

let noJsBrowser;
try {
  noJsBrowser = await chromium.launch();
  const context = await noJsBrowser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 1800 } });
  const page = await context.newPage();
  await openWithRetry(page, `${base}/store/${storeSlug}`, "chromium-no-js");
  const h1 = await page.locator("main h1").first().textContent();
  const links = await page.locator("main a[href]").count();
  if (!h1?.trim() || links < 1) throw new Error(`SSR floor missing content (h1=${Boolean(h1?.trim())}, links=${links})`);
  report("chromium-no-js", "readable-and-navigable", { links, outcome: "passed" });
  await context.close();
} catch (error) {
  failures.push(`no-js: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await noJsBrowser?.close();
}

if (failures.length) {
  console.error(`Browser support gate failed:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}
