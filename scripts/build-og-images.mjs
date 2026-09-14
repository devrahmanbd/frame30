#!/usr/bin/env bun
/**
 * Phase 10.5 — renders one Open Graph card per marketing route (§10.5 bullet 3).
 *
 * Why render rather than hand-design: the card's headline is the route's own
 * SEO title, and the SEO title lives in `MARKETING_ROUTES`. Hand-made cards go
 * stale the first time a title is edited and nobody notices for a quarter,
 * because nobody looks at their own share cards. Here the card is a pure
 * function of the registry, so a title edit plus one script run keeps them in
 * step, and `--check` fails CI when they drift.
 *
 * How: a local dark-canvas HTML template is rendered in headless Chromium at
 * exactly 1200×630 and screenshotted as PNG. PNG on purpose — every scraper
 * decodes it, whereas AVIF cards silently fail on several. The template uses
 * the same visual grammar as `.fq-site` (near-black canvas, one scarce chroma
 * bloom, edge-light hairline, display type) but is self-contained: pulling in
 * the app stylesheet would couple card rendering to Tailwind's build.
 *
 * Operational behaviour:
 *   • per-card retry with backoff, bounded concurrency, one browser;
 *   • byte budget enforced from `OG.maxBytes`, dimensions asserted from the
 *     written file's PNG header rather than trusted from the screenshot call;
 *   • `--check` compares dimensions + presence and exits 1 on drift;
 *   • `--only home,pricing` for a single card; `--locale bn` for a Bangla set;
 *   • JSONL logs on stderr, human summary on stdout, exit 0/1/2.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
};
const CHECK = argv.includes("--check");
const ONLY = flag("only", null);
const LOCALE = String(flag("locale", "en")) === "bn" ? "bn" : "en";
const CONCURRENCY = Math.max(1, Number.parseInt(String(flag("concurrency", "3")), 10) || 3);
const ATTEMPTS = Math.max(1, Number.parseInt(String(flag("attempts", "3")), 10) || 3);
const ROOT = resolve(import.meta.dirname, "..");

const log = (level, event, fields = {}) =>
  process.stderr.write(
    `${JSON.stringify({ ts: new Date().toISOString(), level, gate: "og", event, ...fields })}\n`,
  );

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Reads width/height straight out of the PNG IHDR chunk. Trust the file. */
function pngSize(path) {
  const buf = readFileSync(path);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function template({ eyebrow, headline, description, accent, footer, width, height, locale }) {
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8" />
<style>
  @page { margin: 0 }
  * { box-sizing: border-box; margin: 0 }
  html, body { width: ${width}px; height: ${height}px; }
  body {
    background: #08090c;
    color: #f4f6fb;
    font-family: "Manrope", "Noto Sans Bengali", "DejaVu Sans", system-ui, sans-serif;
    position: relative; overflow: hidden;
    padding: 84px 88px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  /* Exactly one chroma bloom — chroma is scarce (§10.3). */
  .bloom {
    position: absolute; inset: -30% -10% auto -20%; height: 130%;
    background:
      radial-gradient(58% 52% at 22% 8%, hsl(${accent} / 0.28), transparent 70%),
      radial-gradient(46% 42% at 88% 100%, hsl(${accent} / 0.12), transparent 72%);
    filter: blur(2px);
  }
  .grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px);
    background-size: 60px 60px;
    mask-image: radial-gradient(70% 60% at 30% 20%, #000 40%, transparent 100%);
  }
  .edge { position: absolute; inset: 0; border: 1px solid rgba(255,255,255,0.14); }
  .stack { position: relative; }
  .eyebrow {
    display: inline-flex; align-items: center; gap: 10px;
    font-size: 22px; letter-spacing: 0.12em; text-transform: uppercase;
    color: rgba(244,246,251,0.68); font-weight: 600;
  }
  .dot { width: 10px; height: 10px; border-radius: 999px; background: hsl(${accent}); }
  h1 {
    margin-top: 26px;
    font-size: ${headline.length > 46 ? 62 : 72}px;
    line-height: 1.08; letter-spacing: -0.022em; font-weight: 650;
    max-width: 960px;
  }
  p { margin-top: 24px; font-size: 27px; line-height: 1.45; color: rgba(244,246,251,0.7); max-width: 900px; }
  .foot { position: relative; display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 14px; font-size: 26px; font-weight: 650; letter-spacing: -0.01em; }
  .mark { width: 34px; height: 34px; border-radius: 10px; background: hsl(${accent}); box-shadow: 0 0 0 1px rgba(255,255,255,0.18) inset; }
  .url { font-size: 22px; color: rgba(244,246,251,0.55); }
  [lang="bn"] h1, [lang="bn"] p { letter-spacing: 0; line-height: 1.4; }
</style></head>
<body${locale === "bn" ? ' lang="bn"' : ""}>
  <div class="bloom"></div><div class="grid"></div><div class="edge"></div>
  <div class="stack">
    <span class="eyebrow"><span class="dot"></span>${esc(eyebrow)}</span>
    <h1>${esc(headline)}</h1>
    <p>${esc(description)}</p>
  </div>
  <div class="foot">
    <span class="brand"><span class="mark"></span>Framique</span>
    <span class="url">${esc(footer)}</span>
  </div>
</body></html>`;
}

async function main() {
  const assets = await import(`${ROOT}/src/lib/marketing-assets.ts`);
  const seo = await import(`${ROOT}/src/lib/marketing-seo.ts`);
  const { OG, OG_CARDS, ogAssetPath } = assets;

  const only = ONLY ? new Set(String(ONLY).split(",").map((s) => s.trim())) : null;
  const cards = OG_CARDS.filter((c) => !only || only.has(c.route));
  if (cards.length === 0) {
    console.error(`og cards FAILED: --only "${ONLY}" matched no registered route.`);
    process.exit(1);
  }

  const jobs = cards.map((card) => {
    const route = seo.marketingRoute(card.route);
    const path = ogAssetPath(card.route);
    return {
      id: card.route,
      target: resolve(ROOT, `public${path}`),
      publicPath: path,
      html: template({
        eyebrow: card.eyebrow[LOCALE] ?? card.eyebrow.en,
        headline: route.title[LOCALE] ?? route.title.en,
        description: seo.clampText(route.description[LOCALE] ?? route.description.en, 132),
        accent: card.accent,
        footer: `framique.com${route.path === "/" ? "" : route.path}`,
        width: OG.width,
        height: OG.height,
        locale: LOCALE,
      }),
    };
  });

  /* --check needs no browser: presence + dimensions + budget only. */
  if (CHECK) {
    const problems = [];
    for (const job of jobs) {
      if (!existsSync(job.target)) {
        problems.push(`${job.publicPath} is missing`);
        continue;
      }
      const size = pngSize(job.target);
      const bytes = statSync(job.target).size;
      if (!size || size.width !== OG.width || size.height !== OG.height) {
        problems.push(
          `${job.publicPath} is ${size ? `${size.width}×${size.height}` : "not a PNG"}, expected ${OG.width}×${OG.height}`,
        );
      }
      if (bytes > OG.maxBytes) {
        problems.push(`${job.publicPath} is ${Math.round(bytes / 1024)}KB over budget`);
      }
    }
    if (problems.length > 0) {
      log("error", "og.check_failed", { problems });
      console.error(`og cards FAILED:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
      process.exit(1);
    }
    console.log(`og cards up to date — ${jobs.length} cards at ${OG.width}×${OG.height}.`);
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: OG.width, height: OG.height },
    deviceScaleFactor: 1,
    // Cards must render the same on any machine; a system dark mode or a
    // reduced-motion preference must not leak into the raster.
    colorScheme: "dark",
    reducedMotion: "reduce",
  });

  const written = [];
  const failures = [];
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      const job = jobs[cursor++];
      if (!job) return;
      let lastError = null;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        const page = await context.newPage();
        try {
          await page.setContent(job.html, { waitUntil: "load" });
          await page.evaluate(() => document.fonts?.ready);
          const png = await page.screenshot({ type: "png" });
          mkdirSync(dirname(job.target), { recursive: true });
          writeFileSync(job.target, png);

          const size = pngSize(job.target);
          if (!size || size.width !== OG.width || size.height !== OG.height) {
            throw new Error(
              `written card is ${size ? `${size.width}×${size.height}` : "unreadable"}, expected ${OG.width}×${OG.height}`,
            );
          }
          const bytes = png.byteLength;
          if (bytes > OG.maxBytes) {
            // A card over budget is still better than no card: keep the file,
            // report it, and let the caller decide. Cards are rendered flat
            // colour, so this normally means the template gained a photo.
            log("warn", "og.oversize", { id: job.id, bytes, budget: OG.maxBytes });
          }
          written.push({ id: job.id, bytes, path: job.publicPath });
          log("info", "og.written", { id: job.id, bytes, attempt });
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          log("warn", "og.attempt_failed", {
            id: job.id,
            attempt,
            message: String(error?.message ?? error),
          });
          await sleep(150 * attempt + Math.random() * 100);
        } finally {
          await page.close().catch(() => {});
        }
      }
      if (lastError) failures.push({ id: job.id, message: String(lastError?.message ?? lastError) });
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  await context.close();
  await browser.close();

  for (const w of written.sort((a, b) => a.id.localeCompare(b.id))) {
    console.log(`  ${w.id.padEnd(12)} ${String(Math.round(w.bytes / 1024)).padStart(4)}KB  ${w.path}`);
  }
  if (failures.length > 0) {
    console.error(
      `\nog cards FAILED for ${failures.length} route(s):\n${failures
        .map((f) => `  - ${f.id}: ${f.message}`)
        .join("\n")}`,
    );
    process.exit(1);
  }
  console.log(`\nog cards written — ${written.length} at ${OG.width}×${OG.height} (${LOCALE}).`);
}

main().catch((error) => {
  log("error", "og.harness_failed", { message: String(error?.message ?? error) });
  console.error(`og card harness failed: ${error?.stack ?? error}`);
  process.exit(2);
});
