import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NetworkCollector, blockExternalRequests } from "./helpers";

/**
 * Extension workflow — browser half (hermetic, loopback-only).
 *
 * The unit half (`src/lib/widget-e2e-workflow.test.ts`) proves steps 01–16
 * through the REAL pipeline/registry/insert/validate units. This spec covers
 * the browser side honestly: the editor (palette → insert → controls →
 * canvas → duplicate → save → reload → publish) lives under the
 * `_authenticated` route tree, whose `beforeLoad` throws `redirect({ to:
 * "/auth" })` when `supabase.auth.getSession()` finds no session. There is
 * no hermetic session issuer on loopback, so no authenticated editor state
 * can be produced here — and per the task, auth is NOT stubbed.
 *
 * Therefore this spec:
 *  1. Pins the exact auth gap at runtime: the editor + sibling editor
 *     routes land on `/auth` unauthenticated and the builder UI never
 *     mounts (palette/insert/controls/canvas/duplicate/save/reload/publish
 *     are all behind that gate).
 *  2. Pins the wiring statically (read-only source reads): the palette
 *     lists installed plugin widgets, insert builds canonical extension
 *     nodes, the inspector generates controls from schemas, the canvas
 *     renders + duplicates, the publish modal exists.
 *  3. Proves what IS provable unauthenticated at runtime: public preview
 *     renders with extension-shaped hostile input inert (nothing executes),
 *     and the storefront degrades gracefully without a publish (no values
 *     leak, no crash).
 *  4. Hermetic throughout: every external request is aborted before the
 *     network and zero external responses may complete.
 *
 * Cleanup: collectors are disposed in afterAll; the dev server is owned by
 * the Playwright webServer entry (see README.md). No processes spawned here.
 */

function srcPath(rel: string): string {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
}

function src(rel: string): string {
  return readFileSync(srcPath(rel), "utf8");
}

let collectors: NetworkCollector[] = [];

test.afterAll(() => {
  for (const c of collectors) c.dispose();
  collectors = [];
});

async function hermeticPage(
  page: Page,
): Promise<{ collector: NetworkCollector; blocked: string[] }> {
  const collector = new NetworkCollector(page).attach();
  collectors.push(collector);
  const blocked: string[] = [];
  await blockExternalRequests(page, blocked);
  return { collector, blocked };
}

test("editor requires a session: /dashboard/builder lands on /auth", async ({
  page,
}) => {
  const { collector } = await hermeticPage(page);
  const response = await page.goto("/dashboard/builder", {
    waitUntil: "domcontentloaded",
    // Cold-sensitive: first hit compiles the builder route graph; the
    // redirect assertion below uses the suite's cold-aware budget.
    timeout: 180_000,
  });
  // The shell serves (ssr:false route) — the gate is the client-side
  // beforeLoad redirect, so the HTTP status stays 200 either way.
  expect(response?.status()).toBe(200);
  // No Supabase session on loopback ⇒ beforeLoad throws redirect to /auth.
  // Cold-aware budget (same as the sibling test below): the builder route's
  // client chunk compiles after DOM-ready, and the first compile can exceed
  // 30 s on a fresh dev server. The gate assertion itself is unchanged.
  await expect(page, "unauthenticated editor redirects to /auth").toHaveURL(
    /\/auth/,
    { timeout: 90_000 },
  );
  await expect(page).toHaveTitle(/Authentication/, { timeout: 15_000 });
  // The builder UI never mounts behind the gate: no canvas, no tray.
  await expect(
    page.locator("text=Builder studio"),
    "no builder canvas without a session",
  ).toHaveCount(0);
  expect(collector.externalResponses()).toEqual([]);
});

test("sibling editor routes share the same session gate", async ({ page }) => {
  const { collector } = await hermeticPage(page);
  for (const path of [
    "/dashboard/builder-saved",
    "/dashboard/content/editor",
  ]) {
    const response = await page.goto(path, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    expect(response?.status()).toBeLessThan(500);
    // Cold-aware budget: first compile of the builder chunk can exceed 30s.
    await expect(page, `unauthenticated ${path} redirects to /auth`).toHaveURL(
      /\/auth/,
      { timeout: 90_000 },
    );
  }
  expect(collector.externalResponses()).toEqual([]);
});

test("static wiring: palette/insert/controls/canvas/duplicate/publish chain", () => {
  // Palette shows installed plugin widgets (one-registry: the tray reads the
  // route-threaded registry, falling back to buildTrayRegistry over installed
  // rows when no registry is injected).
  const tray = src("src/components/builder/WidgetTray.tsx");
  expect(tray.includes("buildTrayRegistry(plugins)")).toBe(true);
  expect(tray.includes("onAddExtension")).toBe(true);

  // Insert builds the canonical extension node with schema-cleaned defaults.
  const insert = src("src/components/builder/studio/plugin-tray.ts");
  expect(insert.includes("buildExtensionInsert")).toBe(true);
  expect(insert.includes("initialExtensionProps")).toBe(true);
  expect(insert.includes('type: "extension"')).toBe(true);

  // Generated controls validate through the shared value layer.
  const inspector = src("src/components/builder/SectionInspector.tsx");
  expect(inspector.includes("validateProps")).toBe(true);
  expect(inspector.includes("controlStatus")).toBe(true);
  expect(inspector.includes("defaultsFor")).toBe(true);

  // Editor shell mounts palette + controls + canvas + publish together;
  // duplicate runs through the shared clone helper.
  const builder = src("src/routes/_authenticated/dashboard/builder.tsx");
  for (const token of [
    "WidgetTray",
    "SectionInspector",
    "PublishModal",
    "SectionRenderer",
    "useBuilderEditor",
    "cloneNodes",
    "PluginProvider",
  ]) {
    expect(builder.includes(token), `builder mounts ${token}`).toBe(true);
  }

  // Data-binding affordance exists as a reference-only picker (never wired
  // into this workflow by the unit half).
  const picker = src("src/components/builder/DynamicTagPicker.tsx");
  expect(picker.includes("insertDynamicTag")).toBe(true);
  expect(picker.includes("data-dynamic-tag-picker")).toBe(true);
});

test("public preview keeps extension-shaped hostile input inert", async ({
  page,
}) => {
  const { collector } = await hermeticPage(page);
  const marker = "__e2e_ext_workflow";
  const hostile =
    "/theme-preview/songoskriti" +
    `?widgetKey=plugin:e2e-widgets/simple_card` +
    `&title=<script>window.${marker}="title"</script>` +
    `&accent="><img src=x onerror="window.${marker}='accent'">` +
    `&items=<svg onload="window.${marker}='items'">`;
  const response = await page.goto(hostile, {
    waitUntil: "domcontentloaded",
    timeout: 180_000,
  });
  expect(response?.status()).toBe(200);
  await expect(page.locator("img").first(), "preview renders").toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.locator("script", { hasText: marker }),
    "no script element may contain the hostile marker",
  ).toHaveCount(0);
  await expect(
    page.locator(`[onerror*="${marker}"], [onload*="${marker}"]`),
    "no handler attribute may contain the hostile marker",
  ).toHaveCount(0);
  const executed = await page.evaluate(
    (key) => (window as unknown as Record<string, unknown>)[key] ?? null,
    marker,
  );
  expect(executed).toBeNull();
  expect(collector.externalResponses()).toEqual([]);
});

test("storefront without a publish degrades gracefully, never leaks", async ({
  page,
}) => {
  const { collector } = await hermeticPage(page);
  const response = await page.goto("/store/zz-e2e-no-publish/", {
    waitUntil: "domcontentloaded",
    timeout: 180_000,
  });
  expect(response).toBeTruthy();
  // No merchant publish can exist behind the auth gate, so no widget values
  // may render here — the route must degrade to its not-found/retry copy.
  await expect(page.locator("main").first()).toContainText(
    /(Store not found|দোকান পাওয়া যায়নি|This storefront is not published|Couldn.t load this storefront|এই দোকানটি লোড করা যায়নি|Try again|আবার চেষ্টা করুন)/,
    { timeout: 20_000 },
  );
  const body = (await page.locator("body").textContent()) ?? "";
  expect(body).not.toContain("Hello from E2E");
  expect(body).not.toContain("plugin:e2e-widgets");
  expect(collector.externalResponses()).toEqual([]);
});
