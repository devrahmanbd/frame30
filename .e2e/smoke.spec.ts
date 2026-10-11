import { test, expect } from "@playwright/test";
import { NetworkCollector, blockExternalRequests } from "./helpers";

/**
 * Smoke: proves the harness runs against a live dev server.
 * - `/` (root route) returns 200 and renders the marketing document.
 * - `/api/healthz?type=liveness` answers with the valid health envelope
 *   (liveness skips DB/Redis by design; 503 is an honest "alive but
 *   pressured" answer on constrained boxes, so 200|503 both prove liveness).
 * - Hermetic: every request the page makes stays on loopback.
 */

let collector: NetworkCollector | null = null;

test.afterAll(() => {
  // Server lifecycle is owned by the Playwright webServer entry (it kills
  // what it spawns) or by the operator (README.md); here we only detach
  // our own listeners so no spec leaks handles into the next file.
  collector?.dispose();
  collector = null;
});

test("root route is reachable and renders", async ({ page }) => {
  collector = new NetworkCollector(page).attach();
  const blocked: string[] = [];
  await blockExternalRequests(page, blocked);
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/Framique/, { timeout: 20_000 });
  const h1 = page.locator("main h1, h1").first();
  await expect(h1).toBeVisible({ timeout: 20_000 });
  const body = (await page.locator("body").textContent()) ?? "";
  expect(body.length).toBeGreaterThan(100);
  // Hermetic: externals (fonts/unsplash in app markup) were blocked before
  // the network, so zero external responses completed.
  expect(collector.externalResponses()).toEqual([]);
});

test("liveness probe answers with a valid envelope", async ({ request }) => {
  const res = await request.get("/api/healthz?type=liveness", {
    timeout: 30_000,
  });
  // 503 with a well-formed envelope still proves a live server (memory
  // pressure on small boxes trips the critical threshold by design).
  expect([200, 503]).toContain(res.status());
  const json = (await res.json()) as {
    status?: unknown;
    checks?: { database?: { status?: unknown } };
  };
  expect(["healthy", "degraded", "unhealthy"]).toContain(json.status);
  expect(json.checks?.database?.status).toBe("skipped");
});
