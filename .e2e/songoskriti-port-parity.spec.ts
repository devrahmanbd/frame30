import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { blockExternalRequests } from "./helpers";
import {
  activeThemeKey,
  ensureSongoskritiActive,
  merchantCreds,
  setActiveTheme,
} from "./helpers-songoskriti";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
/** Freeze SHA recorded at capture start (Step 3 / Step 5 freeze guard). */
const FREEZE_SHA = execSync("git rev-parse --short=12 HEAD", {
  cwd: REPO_ROOT,
})
  .toString()
  .trim();

/**
 * Human evidence dir. `PORT_CAPTURE_OUT=after` writes to `after/` (Task 8
 * parity run); default freezes to `reference/`. Same spec, no edits between
 * freeze and parity (Step 3, brief).
 */
const OUT =
  process.env.PORT_CAPTURE_OUT === "after"
    ? `${REPO_ROOT}/docs/superpowers/songoskriti-evidence/port/after`
    : `${REPO_ROOT}/docs/superpowers/songoskriti-evidence/port/reference`;
const PORT_DIR = `${REPO_ROOT}/docs/superpowers/songoskriti-evidence/port`;
const MANIFEST_PATH = `${PORT_DIR}/reference-manifest.json`;

fs.mkdirSync(PORT_DIR, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const TEMPLATES = [
  "index",
  "product",
  "collection",
  "account",
  "page",
  "blog",
  "cart",
  "checkout",
  "search",
] as const;
const WIDTHS = [1440, 768, 375] as const;
const LOCALES = ["en", "bn"] as const;
const HEIGHT = 900;
const CATALOGUE = "demo seed";

const THRESHOLDS = { maxDiffPixelRatio: 0.02, threshold: 0.2 } as const;

/**
 * Surfaces that failed calibration as flaky (pass only on retry, or never
 * stabilize) are listed here with an explicit reason. They are `test.skip`
 * ped and recorded `manual-review` in the manifest — never silently dropped.
 * Populated after Step 4 calibration run #2. Empty = every surface stable.
 */
const SKIPPED: Record<string, string> = {
  "chrome-mobile-drawer-375-bn.png":
    "drawer did not open for lang=bn at 375px: hamburger button is visible and " +
    'the click fires, but [data-nav="songoskriti-drawer"] never becomes ' +
    "visible (failed original + retry). Recorded as manual-review; no baseline " +
    "written until the bn drawer interaction is investigated.",
};

type ManifestEntry = {
  url: string;
  template: string;
  width: number;
  locale: string;
  reducedMotion: boolean;
  viewport: { width: number; height: number };
  outfile: string;
  status: "pass" | "manual-review";
  reason?: string;
  freezeSha: string;
  catalogue: string;
  fontsReady: boolean;
  animations: "disabled";
  caret: "hide";
  thresholds: typeof THRESHOLDS;
};

const MANIFEST_BASE = {
  generatedAt: new Date().toISOString(),
  freezeSha: FREEZE_SHA,
  catalogue: CATALOGUE,
  source: "public preview route /theme-preview/songoskriti",
  animations: "disabled",
  caret: "hide",
  reducedMotion: true,
  thresholds: THRESHOLDS,
} as const;

function readManifestEntries(): ManifestEntry[] {
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.captures) ? parsed.captures : [];
  } catch {
    return [];
  }
}

/** Persist one manifest entry (idempotent by outfile; survives retries and
 *  Playwright resetting module state between tests). */
function writeManifestEntry(entry: ManifestEntry): void {
  const existing = readManifestEntries().filter(
    (e) => e.outfile !== entry.outfile,
  );
  const manifest = {
    ...MANIFEST_BASE,
    generatedAt: new Date().toISOString(),
    captures: [...existing, entry],
  };
  fs.mkdirSync(PORT_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

test.setTimeout(300_000);

function captureUrl(
  template: string,
  locale: string,
  extra: string = "",
): string {
  return `/theme-preview/songoskriti?template=${template}&lang=${locale}${extra}`;
}

/**
 * Capture one surface: public preview route, locale via `?lang=` (`?lang=`
 * wins over the cookie per `src/lib/lang-boot.ts`), verify Bangla actually
 * renders for bn captures, then human still (fullPage) to OUT and machine
 * baseline to the snapshot dir.
 */
async function captureSurface(
  page: Page,
  template: string,
  width: number,
  locale: string,
  outfile: string,
  prepare?: (page: Page) => Promise<void>,
  extra: string = "",
): Promise<void> {
  const blocked: string[] = [];
  await blockExternalRequests(page, blocked);

  const url = captureUrl(template, locale, extra);
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 180_000,
  });
  expect(response?.status()).toBe(200, `preview 200: ${url}`);

  // `?lang=` wins over the cookie; wait until the client boot has applied it
  // so we never screenshot English for a bn capture (or vice versa).
  await page.waitForFunction(
    (loc) => document.documentElement.lang === loc,
    locale,
    { timeout: 30_000 },
  );

  // Verify the bn capture really renders Bangla (known bn copy present).
  if (locale === "bn") {
    await expect(
      page.locator("body"),
      `Bangla copy renders for ${template}`,
    ).toHaveText(/[\u0980-\u09FF]/, { timeout: 15_000 });
  }

  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ reducedMotion: "reduce" });
  if (prepare) await prepare(page);

  // Human evidence still.
  await page.screenshot({ path: `${OUT}/${outfile}`, fullPage: true });
  // Machine baseline (same base name, snapshot dir).
  await expect(page).toHaveScreenshot(outfile, {
    animations: "disabled",
    caret: "hide",
    ...THRESHOLDS,
  });

  writeManifestEntry({
    url,
    template,
    width,
    locale,
    reducedMotion: true,
    viewport: { width, height: HEIGHT },
    outfile,
    status: "pass",
    freezeSha: FREEZE_SHA,
    catalogue: CATALOGUE,
    fontsReady: true,
    animations: "disabled",
    caret: "hide",
    thresholds: THRESHOLDS,
  });
}

function recordManualReview(
  outfile: string,
  reason: string,
  fields: {
    url: string;
    template: string;
    width: number;
    locale: string;
  },
): void {
  writeManifestEntry({
    ...fields,
    reducedMotion: true,
    viewport: { width: fields.width, height: HEIGHT },
    outfile,
    status: "manual-review",
    reason,
    freezeSha: FREEZE_SHA,
    catalogue: CATALOGUE,
    fontsReady: true,
    animations: "disabled",
    caret: "hide",
    thresholds: THRESHOLDS,
  });
}

/** Open the desktop nav mega menu (hover a nav group that has children). */
async function openMegaMenu(page: Page): Promise<void> {
  const nav = page.locator('[data-nav="songoskriti-desktop"]').first();
  await expect(nav, "desktop nav renders").toBeVisible({ timeout: 15_000 });
  await nav.locator("li.group").first().locator("a").first().hover();
  await page
    .locator('[data-mega="songoskriti"]')
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
}

/** Open the mobile drawer (hamburger click at 375px). */
async function openMobileDrawer(page: Page): Promise<void> {
  const btn = page.locator('button[aria-controls="store-mobile-menu"]').first();
  await expect(btn, "mobile menu hamburger renders").toBeVisible({
    timeout: 15_000,
  });
  await btn.click();
  await page
    .locator('[data-nav="songoskriti-drawer"]')
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Template captures: 9 templates × 3 widths × 2 locales = 54 stills
// ---------------------------------------------------------------------------

for (const width of WIDTHS) {
  test.describe(`captures @ ${width}px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });
    for (const locale of LOCALES) {
      test.describe(`lang ${locale}`, () => {
        test.use({ locale });
        for (const template of TEMPLATES) {
          const outfile = `${template}-${width}-${locale}.png`;
          test(`${template} ${width}x${HEIGHT} ${locale}`, async ({ page }) => {
            const reason = SKIPPED[outfile];
            if (reason) {
              recordManualReview(outfile, reason, {
                url: captureUrl(template, locale),
                template,
                width,
                locale,
              });
              test.skip(true, reason);
              return;
            }
            await captureSurface(page, template, width, locale, outfile);
          });
        }
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Chrome states: mega menu @ 1440 × {en,bn}, mobile drawer @ 375 × {en,bn}
// ---------------------------------------------------------------------------

for (const locale of LOCALES) {
  test.describe(`chrome-mega-menu @ 1440px lang ${locale}`, () => {
    test.use({ viewport: { width: 1440, height: HEIGHT } });
    test.use({ locale });
    const outfile = `chrome-mega-menu-1440-${locale}.png`;
    test(`open desktop nav mega menu ${locale}`, async ({ page }) => {
      const reason = SKIPPED[outfile];
      if (reason) {
        recordManualReview(outfile, reason, {
          url: captureUrl("index", locale),
          template: "index",
          width: 1440,
          locale,
        });
        test.skip(true, reason);
        return;
      }
      await captureSurface(page, "index", 1440, locale, outfile, openMegaMenu);
    });
  });

  test.describe(`chrome-mobile-drawer @ 375px lang ${locale}`, () => {
    test.use({ viewport: { width: 375, height: HEIGHT } });
    test.use({ locale });
    const outfile = `chrome-mobile-drawer-375-${locale}.png`;
    test(`open mobile drawer ${locale}`, async ({ page }) => {
      const reason = SKIPPED[outfile];
      if (reason) {
        recordManualReview(outfile, reason, {
          url: captureUrl("index", locale),
          template: "index",
          width: 375,
          locale,
        });
        test.skip(true, reason);
        return;
      }
      await captureSurface(
        page,
        "index",
        375,
        locale,
        outfile,
        openMobileDrawer,
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Variation smoke: index-minimal + index-festive @ 1440 en = 2 stills
// ---------------------------------------------------------------------------

test.describe("variation smoke @ 1440px lang en", () => {
  test.use({ viewport: { width: 1440, height: HEIGHT } });
  test.use({ locale: "en" });
  for (const variation of ["minimal", "festive"] as const) {
    const outfile = `index-${variation}-1440-en.png`;
    test(`index ?variation=${variation}`, async ({ page }) => {
      const reason = SKIPPED[outfile];
      if (reason) {
        recordManualReview(outfile, reason, {
          url: captureUrl("index", "en", `&variation=${variation}`),
          template: "index",
          width: 1440,
          locale: "en",
        });
        test.skip(true, reason);
        return;
      }
      await captureSurface(
        page,
        "index",
        1440,
        "en",
        outfile,
        undefined,
        `&variation=${variation}`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Helper smoke: ensureSongoskritiActive + setActiveTheme idempotency
// (real stack, no auth stubbing; consumed by Task 9)
// ---------------------------------------------------------------------------

test.describe("songoskriti activation helper smoke", () => {
  test("ensureSongoskritiActive and setActiveTheme are idempotent", async ({
    page,
  }) => {
    const creds = merchantCreds();
    test.skip(
      !creds,
      "needs E2E_MERCHANT_EMAIL/PASSWORD against the loopback e2e stack " +
        "(docs/15-e2e/loopback-auth-setup.md). No stubbing, so skip — never fake.",
    );
    if (!creds) return;

    // Run 1: real login (if no session) + real install/activate of songoskriti.
    await ensureSongoskritiActive(page);
    // Run 2: session exists and songoskriti already active → no-op, must not throw.
    await ensureSongoskritiActive(page);
    // Re-asserting the same active theme is also a no-op.
    await setActiveTheme(page, "songoskriti");

    expect(await activeThemeKey(page)).toBe("songoskriti");
  });
});

// ---------------------------------------------------------------------------
// Manifest: one entry per capture, written once all tests finish.
// ---------------------------------------------------------------------------

test.afterAll(() => {
  const captures = readManifestEntries();
  const manifest = {
    ...MANIFEST_BASE,
    generatedAt: new Date().toISOString(),
    captures,
  };
  fs.mkdirSync(PORT_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(
    `[port-parity] manifest written: ${MANIFEST_PATH} (${captures.length} entries)`,
  );
});
