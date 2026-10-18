import { test, expect, type Page } from "@playwright/test";
import { NetworkCollector, blockExternalRequests } from "./helpers";
import {
  ensureSongoskritiActive,
  setActiveTheme,
  activeThemeKey,
  merchantCreds,
} from "./helpers-songoskriti";

/**
 * Songoskriti editor journey — the cycle's acceptance bar, through the REAL
 * editor (EditorShell → StudioBuilder → StudioCanvas), no auth stubbing:
 *
 *  1. real /auth login → merchant session; ensureSongoskritiActive → theme
 *     shown active
 *  2. open /dashboard/content/editor?kind=page (status 200)
 *  3. tray shows the theme-owned ornament row ("Songoskriti ornament",
 *     def theme:songoskriti/ornament, src/lib/themes/songoskriti/ornament-def.ts)
 *  4. mint a unique doc title → URL carries id= → autosave settle
 *  5. click the ornament row (bounded retry loop) → inspector opens
 *  6. schema-generated inspector fields: Eyebrow textbox + Motif/Rule selects
 *  7. edit Eyebrow to a unique stamp; control holds it
 *  8. Save draft (topbar) → poll server truth (editorLoadFn) for the stamp
 *  9. reload the editor doc → [data-ornament="songoskriti"] persists with the
 *     stamp (canonicalization re-validation passed)
 * 10. "Preview changes" → [data-ornament="songoskriti"] renders with the stamp
 * 11. setActiveTheme("somvabona") → reopen the doc: tray row PRESENT (count 1 —
 *     the widget is universal and insertable under every theme) + the saved
 *     instance re-renders as the universal generic body
 *     ([data-ornament="generic"]) carrying the stamp; no "Widget preview
 *     unavailable" placeholder; no owner dress ([data-ornament="songoskriti"])
 * 12. setActiveTheme("songoskriti") → reload → owner dress render returns with
 *     the stamp
 * 13. hygiene: no external network responses
 *
 * Mode B only: the loopback auth stack (docs/15-e2e/loopback-auth-setup.md)
 * plus E2E_MERCHANT_EMAIL/E2E_MERCHANT_PASSWORD (creds.env is authoritative).
 * Absent creds ⇒ skip, never fake a session. Mirrors
 * .e2e/plugin-authenticated-journey.spec.ts patterns (hermeticPage, cold
 * goto budget, tray-click retry loop, server-truth polling).
 *
 * Splitting into two tests (1-10 / 11-13) is allowed; this file keeps the
 * single continuous flow so every assertion runs in journey order.
 */

const COLD_GOTO_TIMEOUT = 120_000;

test.setTimeout(600_000);

/** Fill that survives a dev-server remount: verify the value stuck. */
async function fillVerified(
  locator: ReturnType<Page["locator"]>,
  value: string,
  field: string,
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await locator.fill(value);
    await locator.page().waitForTimeout(1_000);
    if ((await locator.inputValue().catch(() => null)) === value) return;
  }
  throw new Error(`fill did not stick for ${field}`);
}

/** Server truth via the REAL load path: does the doc body carry `needle`? */
async function bodyIncludes(
  page: Page,
  id: string,
  needle: string,
): Promise<boolean> {
  return page
    .evaluate(
      async (args: { id: string; needle: string }) => {
        const ef =
          (await import("/src/lib/editor/editor.functions.ts")) as unknown as {
            editorLoadFn: (query: unknown) => Promise<{
              doc?: { body?: string };
            }>;
          };
        const loaded = await ef.editorLoadFn({
          data: { kind: "page", id: args.id },
        });
        return (loaded.doc?.body ?? "").includes(args.needle);
      },
      { id, needle },
    )
    .catch(() => false);
}

async function hermeticPage(
  page: Page,
): Promise<{ collector: NetworkCollector }> {
  const collector = new NetworkCollector(page).attach();
  await blockExternalRequests(page, []);
  return { collector };
}

test("songoskriti editor journey: tray → schema → save → reload → switch", async ({
  page,
}) => {
  const creds = merchantCreds();
  test.skip(
    !creds,
    "needs a real session: E2E_MERCHANT_EMAIL/PASSWORD against the loopback " +
      "e2e stack (docs/15-e2e/loopback-auth-setup.md). No stubbing, so skip — never fake.",
  );
  const { collector } = await hermeticPage(page);

  // 1. Real login via the /auth form, then songoskriti is the active theme
  //    (verified against store_themes isActive).
  await ensureSongoskritiActive(page);
  await expect(
    activeThemeKey(page),
    "songoskriti is the active theme",
  ).resolves.toBe("songoskriti");

  // 2. Open the real content editor for a page.
  const editorResponse = await page.goto(
    "/dashboard/content/editor?kind=page",
    { waitUntil: "domcontentloaded", timeout: COLD_GOTO_TIMEOUT },
  );
  expect(editorResponse?.status(), "editor route serves 200").toBe(200);

  // The WidgetTray lives in the studio side panel's "Elements" tab (its
  // default). Select it explicitly — idempotent when already active — so a
  // panel that starts elsewhere (or a stray switch) can never hide the
  // tray: blindly taking the tablist's second tab lands on "SEO" and
  // unmounts the tray (observed flaky: pre-hydration clicks got swallowed,
  // post-hydration clicks switched the panel).
  const elementsTab = page.getByRole("tab", {
    name: "Elements",
    exact: true,
  });
  await expect(elementsTab, "editor Elements tab is present").toBeVisible({
    timeout: 30_000,
  });
  await elementsTab.click();

  // 3. The theme-owned tray row for "Songoskriti ornament" is insertable
  //    while songoskriti is active (discovered live locator: the Theme
  //    section's row button carrying the def label).
  const ornamentRow = page
    .locator('button:has-text("Songoskriti ornament")')
    .first();
  await expect(
    ornamentRow,
    "theme-owned Songoskriti ornament row is insertable in the tray",
  ).toBeVisible({ timeout: COLD_GOTO_TIMEOUT });

  // 4. Mint a unique doc (unique title ⇒ unique slug, no slug_taken
  //    collisions across runs) and let the title autosave settle.
  const stamp = Date.now().toString(36);
  const title = `E2E Songoskriti Journey ${stamp}`;
  const eyebrow = `E2E-orn-${stamp}`;
  await fillVerified(
    page.locator('textarea[placeholder="Add title"]').first(),
    title,
    "page title",
  );
  await expect(page, "title save mints the doc id").toHaveURL(/id=/, {
    timeout: 90_000,
  });
  const id = page.url().match(/id=([^&]+)/)?.[1];
  expect(id, "doc id captured from the URL").toBeTruthy();
  const editorUrl = page.url();
  // Let the title-save round-trip settle before inserting.
  await page.waitForTimeout(8_000);

  // 5. Insert the ornament row (3-attempt retry loop, like the plugin
  //    spec) until the inspector opens.
  const eyebrowBox = page.getByRole("textbox", {
    name: "Eyebrow",
    exact: true,
  });
  for (let attempt = 1; attempt <= 3; attempt++) {
    await ornamentRow.click();
    const opened = await eyebrowBox
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) break;
    if (attempt === 3) {
      throw new Error("inspector never opened for the inserted node");
    }
  }

  // 6. Schema-generated inspector fields (def propsSchema: Eyebrow text +
  //    Motif + Rule closed selects) are live.
  await expect(
    eyebrowBox,
    "inspector generates the Eyebrow textbox from the schema",
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Motif", exact: true }),
    "inspector generates the Motif select from the schema",
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Rule", exact: true }),
    "inspector generates the Rule select from the schema",
  ).toBeVisible();

  // 7. Edit Eyebrow to a unique stamp; the control holds it until save.
  await fillVerified(eyebrowBox, eyebrow, "schema eyebrow");
  await expect(eyebrowBox, "eyebrow edit survives until save").toHaveValue(
    eyebrow,
  );

  // 8. Save draft through the shell's real topbar button; the edit must
  //    reach server truth (the real load path, what a reload fetches).
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Save draft" })
    .click();
  await expect
    .poll(() => bodyIncludes(page, id!, eyebrow), {
      message: "merchant eyebrow edit reaches server truth",
      timeout: 90_000,
    })
    .toBe(true);

  // 9. Reload the editor doc: the node persists (canonicalization
  //    re-validation passed) with the edited eyebrow.
  await page.reload({
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  const canvas = page.locator('[data-ornament="songoskriti"]').first();
  await expect(
    canvas,
    "ornament node persists on the canvas after reload",
  ).toBeVisible({ timeout: 120_000 });
  await expect(
    canvas,
    "reloaded ornament carries the edited eyebrow",
  ).toContainText(eyebrow);

  // 10. Preview strips the editing chrome but keeps the widget render.
  await page
    .getByRole("button", { name: /^Preview changes/ })
    .first()
    .click();
  await expect(canvas, "preview keeps the ornament node").toBeVisible({
    timeout: 15_000,
  });
  await expect(canvas, "preview renders the edited eyebrow").toContainText(
    eyebrow,
  );

  // 11. Switch to a foreign theme (somvabona). Theme = dress, widget = body:
  //    the ornament row stays insertable under every theme, and the saved
  //    instance re-renders as the universal generic body ([data-ornament=
  //    "generic"]) with the stamp — not the owner dress, and not the retired
  //    "Widget preview unavailable" placeholder.
  await setActiveTheme(page, "somvabona");
  await page.goto(editorUrl, {
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  // Same explicit selection as step 3 — never a blind `.nth(1)` (that lands
  // on "SEO" and unmounts the tray, making tray assertions pass for the
  // wrong reason; Task 9 review finding).
  await elementsTab.click();
  await expect(
    page.locator('button:has-text("Songoskriti ornament")'),
    "ornament row stays insertable under the foreign theme (universal widget)",
  ).toHaveCount(1);
  const genericCanvas = page.locator('[data-ornament="generic"]').first();
  await expect(
    genericCanvas,
    "saved instance re-renders as the universal generic body under somvabona",
  ).toBeVisible({ timeout: COLD_GOTO_TIMEOUT });
  await expect(
    genericCanvas,
    "generic body carries the edited eyebrow stamp",
  ).toContainText(eyebrow);
  await expect(
    page.getByText("Widget preview unavailable", { exact: true }),
    "recoverable-fallback placeholder is retired for registered components",
  ).toHaveCount(0);
  await expect(
    page.locator('[data-ornament="songoskriti"]'),
    "no owner dress under the foreign theme",
  ).toHaveCount(0);

  // 12. Switch back to songoskriti: the owner dress returns with the eyebrow.
  await setActiveTheme(page, "songoskriti");
  await page.reload({
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  const restored = page.locator('[data-ornament="songoskriti"]').first();
  await expect(
    restored,
    "ornament full render returns under songoskriti",
  ).toBeVisible({ timeout: 120_000 });
  await expect(restored, "eyebrow survives the theme round-trip").toContainText(
    eyebrow,
  );

  // 13. Hygiene: nothing reached outside loopback during the flow.
  expect(collector.externalResponses()).toEqual([]);
});
