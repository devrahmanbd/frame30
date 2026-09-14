#!/usr/bin/env bun
/**
 * Phase 10.5 — captures the UI stills the marketing pages show (§10.5 bullet 1).
 *
 * "2x crops of the real admin" is a content rule, not a design flourish: a
 * hand-drawn mock of an admin we have not built is a lie, and a 1x screenshot on
 * a 2x screen reads as a screenshot of a screenshot. So each still in
 * `UI_STILLS` carries a recipe (real in-app path, element selector, viewport)
 * and this script executes it in Chromium at `STILLS.dpr`, then encodes AVIF and
 * WebP siblings with ffmpeg (no native image addon needed, and ffmpeg is already
 * a build dependency here).
 *
 * Honesty about failure is the whole point of the operational code below:
 *   • an admin still needs a signed-in session. When none is available the still
 *     is reported as SKIP with the reason, and the run stays green unless
 *     `--require-auth` is passed. It is never replaced with a placeholder file,
 *     because a placeholder is indistinguishable from a real capture once it is
 *     on disk.
 *   • PII is blurred from the recipe's `redact` selectors before the shot.
 *   • per-still retries with jittered backoff, bounded concurrency, per-format
 *     byte budgets, and a written manifest so the gate can attribute a file to a
 *     capture run.
 *   • exit 0 clean, 1 contract failure (a required still could not be produced,
 *     or a file blew its budget), 2 harness failure.
 *
 * Session: reads the injected Supabase session
 * (`BROWSER_SUPABASE_*`) or a minted session file
 * and restores it into localStorage/cookies on the app origin only. Tokens are
 * never logged.
 *
 * Usage:
 *   bun scripts/capture-ui-stills.mjs
 *   bun scripts/capture-ui-stills.mjs --only admin-orders --base http://localhost:8080
 *   bun scripts/capture-ui-stills.mjs --require-auth --json /tmp/stills.json
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
};
const BASE = String(flag("base", process.env.STILLS_BASE ?? "http://localhost:8080")).replace(/\/$/, "");
const ONLY = flag("only", null);
const REQUIRE_AUTH = argv.includes("--require-auth");
const DRY = argv.includes("--dry-run");
const CONCURRENCY = Math.max(1, Number.parseInt(String(flag("concurrency", "2")), 10) || 2);
const ATTEMPTS = Math.max(1, Number.parseInt(String(flag("attempts", "2")), 10) || 2);
const JSON_OUT = flag("json", null);
const ROOT = resolve(import.meta.dirname, "..");
const WORK = join(tmpdir(), `fq-stills-${process.pid}`);

const log = (level, event, fields = {}) =>
  process.stderr.write(
    `${JSON.stringify({ ts: new Date().toISOString(), level, gate: "stills", event, ...fields })}\n`,
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------------- */
/* ffmpeg encoding                                                            */
/* -------------------------------------------------------------------------- */

function run(cmd, args, timeoutMs = 120_000) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 8_000) stderr = stderr.slice(-8_000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim().split("\n").slice(-3).join(" | ")}`));
    });
  });
}

/**
 * Encode ladder. AVIF via libaom still-picture (small, modern), WebP via
 * libwebp (universal fallback for the last five years of browsers), and the
 * captured PNG is kept as the final `<img src>` so a browser with neither still
 * sees the screenshot.
 */
async function encode(pngPath, outBase) {
  await run("ffmpeg", [
    "-y", "-loglevel", "error", "-i", pngPath,
    "-c:v", "libaom-av1", "-still-picture", "1", "-cpu-used", "6", "-crf", "34",
    "-pix_fmt", "yuv420p", `${outBase}.avif`,
  ]);
  await run("ffmpeg", [
    "-y", "-loglevel", "error", "-i", pngPath,
    "-c:v", "libwebp", "-pix_fmt", "yuv420p", "-quality", "82", "-compression_level", "6", `${outBase}.webp`,
  ]);
  await run("ffmpeg", [
    "-y", "-loglevel", "error", "-i", pngPath,
    "-vf", "scale=iw:ih", "-compression_level", "100", `${outBase}.png`,
  ]);
}

/* -------------------------------------------------------------------------- */
/* Session restore (tokens are read, never printed)                           */
/* -------------------------------------------------------------------------- */

function readSession() {
  const status = process.env.BROWSER_AUTH_STATUS ?? "unknown";
  const envJson = process.env.BROWSER_SUPABASE_SESSION_JSON;
  const envKey = process.env.BROWSER_SUPABASE_STORAGE_KEY;
  const envCookies = process.env.BROWSER_SUPABASE_COOKIES_JSON;
  if (envJson && envKey) {
    return { status, storageKey: envKey, session: envJson, cookies: envCookies ?? null };
  }
  const minted = join(homedir(), ".cache/framique-auth/session.json");
  if (existsSync(minted)) {
    try {
      const parsed = JSON.parse(readFileSync(minted, "utf8"));
      if (parsed?.storage_key && parsed?.session) {
        return {
          status: "minted",
          storageKey: parsed.storage_key,
          session: JSON.stringify(parsed.session),
          cookies: parsed.cookies ? JSON.stringify(parsed.cookies) : null,
        };
      }
    } catch (error) {
      log("warn", "stills.session_unreadable", { message: String(error?.message ?? error) });
    }
  }
  return null;
}

async function restore(context, page, session) {
  if (!session) return false;
  if (session.cookies) {
    try {
      const cookies = JSON.parse(session.cookies).map((c) => ({ ...c, url: BASE }));
      await context.addCookies(cookies);
    } catch (error) {
      log("warn", "stills.cookie_restore_failed", { message: String(error?.message ?? error) });
    }
  }
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [session.storageKey, session.session],
  );
  return true;
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main() {
  const { UI_STILLS, STILLS, STILL_DIR } = await import(`${ROOT}/src/lib/marketing-assets.ts`);
  const only = ONLY ? new Set(String(ONLY).split(",").map((s) => s.trim())) : null;
  const jobs = UI_STILLS.filter((s) => !only || only.has(s.id));
  if (jobs.length === 0) {
    console.error(`ui stills FAILED: --only "${ONLY}" matched nothing in UI_STILLS.`);
    process.exit(1);
  }

  if (DRY) {
    for (const s of jobs) {
      console.log(
        `${s.id.padEnd(20)} ${s.capture.auth.padEnd(7)} ${s.capture.path} ` +
          `${s.capture.viewport.width}x${s.capture.viewport.height} @${STILLS.dpr}x → ${STILL_DIR}/${s.file}.{avif,webp,png}`,
      );
    }
    return;
  }

  const session = readSession();
  const authStatus = process.env.BROWSER_AUTH_STATUS ?? (session ? "minted" : "absent");
  log("info", "stills.session", { status: authStatus, restored: Boolean(session) });

  mkdirSync(WORK, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      const spec = jobs[cursor++];
      if (!spec) return;
      const outBase = resolve(ROOT, `public${STILL_DIR}/${spec.file}`);
      mkdirSync(dirname(outBase), { recursive: true });

      let lastError = null;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        const context = await browser.newContext({
          viewport: spec.capture.viewport,
          deviceScaleFactor: STILLS.dpr,
          colorScheme: "dark",
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        try {
          if (spec.capture.auth === "admin") {
            const ok = await restore(context, page, session);
            if (!ok) throw Object.assign(new Error("no session available for an admin capture"), {
              skip: true,
            });
          }
          const url = `${BASE}${spec.capture.path}`;
          const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
          const status = response?.status() ?? 0;
          if (status >= 400) throw new Error(`${url} responded HTTP ${status}`);
          if (/\/auth(\?|$)/.test(page.url()) && spec.capture.auth === "admin") {
            throw Object.assign(new Error(`redirected to ${page.url()} — session was rejected`), {
              skip: true,
            });
          }
          if (spec.capture.waitFor) {
            await page
              .waitForSelector(spec.capture.waitFor, { timeout: 15_000 })
              .catch(() => log("warn", "stills.waitfor_absent", { id: spec.id, selector: spec.capture.waitFor }));
          }
          // Let fonts and any settled reveal finish; a half-entered card looks
          // like a rendering bug in a marketing screenshot.
          await page.evaluate(() => document.fonts?.ready);
          await page.waitForTimeout(700);

          for (const selector of spec.capture.redact ?? []) {
            await page
              .locator(selector)
              .evaluateAll((nodes) =>
                nodes.forEach((n) => {
                  n.style.filter = "blur(6px)";
                }),
              )
              .catch(() => {});
          }

          const target = page.locator(spec.capture.selector).first();
          const useElement = (await target.count()) > 0 && !/^(body|html|:root)$/i.test(spec.capture.selector);
          const raw = join(WORK, `${spec.id}.png`);
          /**
           * A page-level selector is captured through `page.screenshot` with an
           * explicit `clip`, never as an element shot.
           *
           * `clip` is a page-screenshot option: Playwright ignores it on an
           * element handle. `body` on `/` therefore produced the entire scroll
           * height — 780×18288 at 2x — which is not a "2x crop of the real UI"
           * and is also past libwebp's 16383px ceiling, so the WebP sibling
           * failed while an 18k-tall AVIF shipped beside it. Clipping to the
           * declared viewport is both the honest crop and a hard ceiling for the
           * encoders.
           */
          if (useElement) {
            await target.screenshot({ path: raw, animations: "disabled", scale: "device" });
          } else {
            await page.screenshot({
              path: raw,
              animations: "disabled",
              scale: "device",
              clip: {
                x: 0,
                y: 0,
                width: spec.capture.viewport.width,
                height: spec.capture.viewport.height,
              },
            });
          }

          await encode(raw, outBase);

          const files = STILLS.formats.map((format) => {
            const path = `${outBase}.${format}`;
            const bytes = statSync(path).size;
            return { format, bytes, budget: STILLS.maxBytes[format] };
          });
          const over = files.filter((f) => f.bytes > f.budget);
          results.push({ id: spec.id, state: "ok", files, over, attempt });
          log("info", "stills.captured", {
            id: spec.id,
            attempt,
            bytes: Object.fromEntries(files.map((f) => [f.format, f.bytes])),
          });
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          log(error?.skip ? "warn" : "warn", "stills.attempt_failed", {
            id: spec.id,
            attempt,
            skip: Boolean(error?.skip),
            message: String(error?.message ?? error),
          });
          if (error?.skip) break; // retrying will not conjure a session
          await sleep(300 * attempt + Math.random() * 200);
        } finally {
          await page.close().catch(() => {});
          await context.close().catch(() => {});
        }
      }
      if (lastError) {
        results.push({
          id: spec.id,
          state: lastError?.skip ? "skipped" : "failed",
          reason: String(lastError?.message ?? lastError),
        });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  await browser.close();
  rmSync(WORK, { recursive: true, force: true });

  const ok = results.filter((r) => r.state === "ok");
  const skipped = results.filter((r) => r.state === "skipped");
  const failed = results.filter((r) => r.state === "failed");
  const over = ok.flatMap((r) => r.over.map((o) => ({ id: r.id, ...o })));

  for (const r of results.sort((a, b) => a.id.localeCompare(b.id))) {
    if (r.state === "ok") {
      console.log(
        `  OK   ${r.id.padEnd(20)} ${r.files
          .map((f) => `${f.format} ${String(Math.round(f.bytes / 1024)).padStart(4)}KB`)
          .join("  ")}`,
      );
    } else {
      console.log(`  ${r.state === "skipped" ? "SKIP" : "FAIL"} ${r.id.padEnd(20)} ${r.reason}`);
    }
  }
  for (const o of over) {
    console.log(
      `  WARN ${o.id} ${o.format} is ${Math.round(o.bytes / 1024)}KB over its ${Math.round(
        o.budget / 1024,
      )}KB budget`,
    );
  }

  if (JSON_OUT && typeof JSON_OUT === "string") {
    writeFileSync(
      JSON_OUT,
      JSON.stringify({ base: BASE, authStatus, dpr: STILLS.dpr, results }, null, 2),
    );
  }
  // Manifest lives next to the assets so the gate and a reviewer can tell when
  // a still was last taken, and from which base URL.
  writeFileSync(
    resolve(ROOT, `public${STILL_DIR}/manifest.json`),
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        base: BASE,
        dpr: STILLS.dpr,
        stills: ok.map((r) => ({ id: r.id, files: r.files.map((f) => ({ format: f.format, bytes: f.bytes })) })),
        skipped: skipped.map((r) => ({ id: r.id, reason: r.reason })),
      },
      null,
      2,
    )}\n`,
  );

  /**
   * The bundle cannot stat `public/`, so the set of stills that actually exist
   * is emitted as a committed module. Without it, an uncaptured still renders a
   * `<picture>` on every marketing route and burns three 404s before `onError`
   * swaps in the fallback frame. Derived from disk rather than from this run's
   * results, so a `--only` run never drops the other ids.
   */
  const captured = UI_STILLS.filter((spec) =>
    STILLS.formats.every((format) =>
      existsSync(resolve(ROOT, `public${STILL_DIR}/${spec.file}.${format}`)),
    ),
  ).map((spec) => spec.id);
  captured.sort();
  const modulePath = resolve(ROOT, "src/lib/still-manifest.ts");
  const previous = existsSync(modulePath) ? readFileSync(modulePath, "utf8") : "";
  const header = previous.slice(0, previous.indexOf("export const CAPTURED_STILLS"));
  const body = [
    `${header}export const CAPTURED_STILLS: readonly string[] = ${JSON.stringify(captured)};`,
    "",
    "/** True when every declared format for `id` exists in `public/media/stills`. */",
    "export function stillCaptured(id: string): boolean {",
    "  return CAPTURED_STILLS.includes(id);",
    "}",
    "",
  ].join("\n");
  writeFileSync(modulePath, body);
  log("info", "stills.manifest_written", { captured: captured.length });

  console.log(
    `\nui stills — ${ok.length} captured, ${skipped.length} skipped, ${failed.length} failed, ${over.length} over budget.`,
  );
  if (failed.length > 0 || over.length > 0) process.exit(1);
  if (skipped.length > 0 && REQUIRE_AUTH) {
    console.error("--require-auth was passed and at least one still could not be captured.");
    process.exit(1);
  }
}

main().catch((error) => {
  log("error", "stills.harness_failed", { message: String(error?.message ?? error) });
  console.error(`ui still harness failed: ${error?.stack ?? error}`);
  process.exit(2);
});
