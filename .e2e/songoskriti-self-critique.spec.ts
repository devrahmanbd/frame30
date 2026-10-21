import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { blockExternalRequests } from "./helpers";

/**
 * The self-critique capture — the seven storefront surfaces, captured at the
 * six widths the brief names, in BOTH locales, into a **scratch** directory.
 *
 * **Never into `reference/`** — that is the owner's re-freeze (Decision Gate
 * G3) and this script has no business writing there. The scratch root is
 * `/tmp/opencode/frame30-self-critique` by default and can be moved with
 * `SELF_CRITIQUE_DIR`.
 *
 * ```
 * SELF_CRITIQUE_PASS=first   node_modules/.bin/playwright test -c .e2e/playwright.config.ts songoskriti-self-critique
 * SELF_CRITIQUE_PASS=second  node_modules/.bin/playwright test -c .e2e/playwright.config.ts songoskriti-self-critique
 * ```
 *
 * The first pass writes `first/<surface>-<width>-<locale>.png` (7 × 6 × 2 =
 * **84** stills) plus `manifest.json`, which names every surface, width and
 * locale. The second pass writes `second/…` and COMPARES each still against
 * the first pass with the parity harness's own thresholds
 * (`maxDiffPixelRatio: 0.02`, `threshold: 0.2` — read out of
 * `.e2e/songoskriti-port-parity.spec.ts` at run time, so the two can never
 * drift) and writes `diff-report.json`.
 *
 * **The comparator.** The diff is computed in the BROWSER, on decoded pixels,
 * with pixelmatch's own colour-delta semantics (the YIQ delta, compared
 * against `35215 × threshold²`) — the same rule Playwright's `toHaveScreenshot`
 * uses — and the ratio is compared against the same `maxDiffPixelRatio`. A
 * capture whose size changed counts as a full-surface difference.
 *
 * **One test per surface**, so a slow surface can never eat the whole run's
 * budget, and the comparison runs last.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRATCH =
  process.env["SELF_CRITIQUE_DIR"]?.trim() ||
  "/tmp/opencode/frame30-self-critique";
const PASS = process.env["SELF_CRITIQUE_PASS"]?.trim() || "first";
/**
 * An optional filter — `SELF_CRITIQUE_ONLY=page:390:en` (comma separated) —
 * that captures ONLY the named captures. It exists for the ONE case the plan
 * needs: a capture that came back BLANK (the surface had not painted) can be
 * re-taken without re-shooting the other 83.
 */
const ONLY = (process.env["SELF_CRITIQUE_ONLY"]?.trim() || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
/** Compare only: skip the capture and compare the 84 captures the manifest names. */
const COMPARE_ONLY = process.env["SELF_CRITIQUE_COMPARE_ONLY"] === "1";

/** The parity harness's own thresholds — read from its source, not copied. */
function parityThresholds(): {
  maxDiffPixelRatio: number;
  threshold: number;
} {
  const source = fs.readFileSync(
    `${REPO_ROOT}/.e2e/songoskriti-port-parity.spec.ts`,
    "utf8",
  );
  const match = source.match(
    /const THRESHOLDS = \{ maxDiffPixelRatio: ([\d.]+), threshold: ([\d.]+) \}/,
  );
  if (!match) {
    throw new Error(
      "the parity harness's THRESHOLDS could not be read — the self-critique " +
        "comparator must use the parity spec's own thresholds",
    );
  }
  return {
    maxDiffPixelRatio: Number(match[1]),
    threshold: Number(match[2]),
  };
}

const THRESHOLDS = parityThresholds();

/** The disposable merchant on the throwaway stack (never production). */
const STORE = process.env["E2E_STORE_SLUG"]?.trim() || "frame19-demo";
/** The disposable CMS page on the throwaway stack. */
const PAGE_SLUG = process.env["E2E_PAGE_SLUG"]?.trim() || "our-story";
/** The disposable blog term on the throwaway stack. */
const TERM_SLUG = process.env["E2E_TERM_SLUG"]?.trim() || "handloom-heritage";

/** The seven surfaces — the plan's list, one URL each.
 *
 * `marker` is the surface's OWN content, the text that proves the surface has
 * actually rendered. A capture that runs before the surface paints is a WHITE
 * IMAGE, and a white image is not evidence of anything — so the capture waits
 * for the marker (and for the DOM to stop changing) before it screenshots.
 */
const SURFACES = [
  { key: "search", url: `/store/${STORE}/search?q=saree`, marker: "Results" },
  { key: "cart", url: `/store/${STORE}/cart`, marker: "Order summary" },
  {
    key: "account",
    url: `/store/${STORE}/account`,
    // The platform's copy is LOCALISED: the marker must match the locale
    // under capture, or the bn capture waits for text the page never shows.
    marker: ["Track Your Order", "আপনার অর্ডার খুঁজুন"],
  },
  { key: "blog", url: `/store/${STORE}/blog`, marker: "From the journal" },
  {
    key: "checkout",
    url: `/store/${STORE}/checkout`,
    marker: ["Place Order", "অর্ডার কনফার্ম করুন"],
  },
  {
    key: "archive",
    url: `/blog/category/${TERM_SLUG}`,
    marker: "Handloom Heritage",
  },
  {
    key: "page",
    url: `/store/${STORE}/pages/${PAGE_SLUG}`,
    marker: "Our Story",
  },
] as const;

type Surface = (typeof SURFACES)[number];

const WIDTHS = [1440, 1280, 768, 430, 390, 375] as const;
const LOCALES = ["en", "bn"] as const;
const HEIGHT = 900;

test.setTimeout(600_000);

const captured: {
  file: string;
  surface: string;
  width: number;
  locale: string;
}[] = [];

function outDir(pass: string): string {
  const dir = `${SCRATCH}/${pass}`;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Capture one surface at one width in one locale. */
async function capture(
  page: Page,
  surface: Surface,
  width: number,
  locale: string,
): Promise<string> {
  const url = `${surface.url}${surface.url.includes("?") ? "&" : "?"}lang=${locale}`;
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  expect(response?.status(), `the ${surface.key} surface answers 200`).toBe(
    200,
  );
  // `?lang=` wins over the cookie: wait until the client boot applied it, so
  // a bn capture is never an English page.
  await page.waitForFunction(
    (loc) => document.documentElement.lang === loc,
    locale,
    { timeout: 30_000 },
  );
  // The surface's OWN content must be on the page: a capture taken before the
  // surface paints is a blank white image. The marker may be a LIST (the
  // platform's copy is localised, so the bn capture needs the bn text).
  const markers = Array.isArray(surface.marker)
    ? surface.marker
    : [surface.marker];
  await expect
    .poll(
      async () => {
        for (const marker of markers) {
          const count = await page.getByText(marker, { exact: false }).count();
          if (count > 0) return true;
        }
        return false;
      },
      { timeout: 60_000, intervals: [250] },
    )
    .toBe(true);
  // ...and the DOM must have stopped changing (the client fills the surface in).
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __len?: number; __stable?: number };
      const len = document.body.innerText.length;
      if (w.__len === len) {
        w.__stable = (w.__stable ?? 0) + 1;
      } else {
        w.__stable = 0;
      }
      w.__len = len;
      return (w.__stable ?? 0) >= 2;
    },
    undefined,
    { timeout: 30_000, polling: 300 },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(600);
  const file = `${surface.key}-${width}-${locale}.png`;
  await page.screenshot({ path: `${outDir(PASS)}/${file}`, fullPage: true });
  return file;
}

/**
 * The pixel diff between two PNGs, computed on decoded pixels with
 * pixelmatch's own colour-delta rule. Returns the ratio of DIFFERING pixels
 * (1.0 = every pixel differs); a size change is reported as 1.
 */
async function diffRatio(
  page: Page,
  before: Buffer,
  after: Buffer,
): Promise<number> {
  return page.evaluate(
    async ([a, b, threshold]) => {
      const load = (b64: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("decode failed"));
          img.src = `data:image/png;base64,${b64}`;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return 1;
      const w = ia.width;
      const h = ia.height;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return 1;
      ctx.drawImage(ia, 0, 0);
      const pa = ctx.getImageData(0, 0, w, h).data;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(ib, 0, 0);
      const pb = ctx.getImageData(0, 0, w, h).data;
      const blend = (c: number, a: number) => c + a * (255 - c);
      const rgb2y = (r: number, g: number, b: number) =>
        r * 0.29889531 + g * 0.58662247 + b * 0.11448223;
      const rgb2i = (r: number, g: number, b: number) =>
        r * 0.59597799 - g * 0.2741761 - b * 0.32180189;
      const rgb2q = (r: number, g: number, b: number) =>
        r * 0.21147017 - g * 0.52261711 + b * 0.31114694;
      const maxDelta = 35215 * threshold * threshold;
      let diff = 0;
      for (let i = 0; i < pa.length; i += 4) {
        let r1 = pa[i];
        let g1 = pa[i + 1];
        let b1 = pa[i + 2];
        const a1 = pa[i + 3];
        let r2 = pb[i];
        let g2 = pb[i + 1];
        let b2 = pb[i + 2];
        const a2 = pb[i + 3];
        if (a1 === a2 && r1 === r2 && g1 === g2 && b1 === b2) continue;
        if (a1 < 255) {
          const alpha = a1 / 255;
          r1 = blend(r1, alpha);
          g1 = blend(g1, alpha);
          b1 = blend(b1, alpha);
        }
        if (a2 < 255) {
          const alpha = a2 / 255;
          r2 = blend(r2, alpha);
          g2 = blend(g2, alpha);
          b2 = blend(b2, alpha);
        }
        const y = Math.abs(rgb2y(r1, g1, b1) - rgb2y(r2, g2, b2));
        const di = rgb2i(r1, g1, b1) - rgb2i(r2, g2, b2);
        const dq = rgb2q(r1, g1, b1) - rgb2q(r2, g2, b2);
        const delta = 0.5053 * y * y + 0.299 * di * di + 0.1957 * dq * dq;
        if (delta > maxDelta) diff += 1;
      }
      return diff / (w * h);
    },
    [before.toString("base64"), after.toString("base64"), THRESHOLDS.threshold],
  );
}

test.describe("the self-critique capture", () => {
  for (const surface of SURFACES) {
    test(`captures ${surface.key}`, async ({ page }) => {
      test.skip(COMPARE_ONLY, "the compare-only run does not capture");
      await blockExternalRequests(page, []);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: HEIGHT });
        for (const locale of LOCALES) {
          const file = `${surface.key}-${width}-${locale}.png`;
          if (
            ONLY.length &&
            !ONLY.includes(`${surface.key}:${width}:${locale}`)
          ) {
            continue;
          }
          await capture(page, surface, width, locale);
          captured.push({ file, surface: surface.key, width, locale });
        }
      }
      if (!ONLY.length) {
        expect(
          captured.filter((c) => c.surface === surface.key).length,
          `${surface.key} contributes 6 widths × 2 locales`,
        ).toBe(WIDTHS.length * LOCALES.length);
      }
    });
  }

  test("compares the second pass against the first", async ({ page }) => {
    test.skip(PASS !== "second", "the comparison runs on the second pass");
    await blockExternalRequests(page, []);

    const report: {
      thresholds: typeof THRESHOLDS;
      captures: {
        file: string;
        surface: string;
        width: number;
        locale: string;
        ratio: number;
        withinThreshold: boolean;
      }[];
      perSurface: Record<string, { max: number; mean: number }>;
    } = { thresholds: THRESHOLDS, captures: [], perSurface: {} };

    // The comparison walks the MANIFEST's captures (all 84) — not the ones
    // this run happened to shoot — so a re-take of a single capture and a
    // compare-only run measure the same set.
    const manifest = JSON.parse(
      fs.readFileSync(`${SCRATCH}/manifest.json`, "utf8"),
    ) as {
      captures: {
        file: string;
        surface: string;
        width: number;
        locale: string;
      }[];
    };
    for (const entry of manifest.captures) {
      const beforePath = `${SCRATCH}/first/${entry.file}`;
      const afterPath = `${SCRATCH}/second/${entry.file}`;
      expect(
        fs.existsSync(beforePath),
        `the first pass wrote ${entry.file}`,
      ).toBe(true);
      const ratio = await diffRatio(
        page,
        fs.readFileSync(beforePath),
        fs.readFileSync(afterPath),
      );
      report.captures.push({
        ...entry,
        ratio,
        withinThreshold: ratio <= THRESHOLDS.maxDiffPixelRatio,
      });
    }

    for (const surface of SURFACES) {
      const rows = report.captures.filter((c) => c.surface === surface.key);
      report.perSurface[surface.key] = {
        max: Math.max(...rows.map((r) => r.ratio)),
        mean: rows.reduce((sum, r) => sum + r.ratio, 0) / (rows.length || 1),
      };
    }

    fs.writeFileSync(
      `${SCRATCH}/diff-report.json`,
      JSON.stringify(report, null, 2),
    );
    console.log(
      `[self-critique] per-surface max diff ratio: ${JSON.stringify(
        report.perSurface,
      )}`,
    );
  });
});

test.afterAll(() => {
  if (PASS !== "first") return;
  const manifest = {
    pass: PASS,
    surfaces: SURFACES.map((s) => ({ key: s.key, url: s.url })),
    widths: [...WIDTHS],
    locales: [...LOCALES],
    thresholds: THRESHOLDS,
    captures: captured,
  };
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(
    `${SCRATCH}/manifest.json`,
    JSON.stringify(manifest, null, 2),
  );
  console.log(
    `[self-critique] ${captured.length} stills written to ${SCRATCH}/${PASS}`,
  );
});
