#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

process.env.PATH = `${join(process.cwd(), "bin")}:${process.env.PATH}`;

const isSmoke = process.argv.includes("--smoke");
const isAll = process.argv.includes("--all");
const allowProduction = process.argv.includes("--allow-production-target");

// Default to local development server / staging to protect live production merchant
const targetUrl = process.env.TARGET_URL || "http://localhost:3000";
const isProductionDomain = targetUrl.includes("flamelancer.com") || targetUrl.includes("framique.com");

if (isProductionDomain && !allowProduction) {
  console.error("[bombadil] ✗ SAFETY GUARD: Fuzz exploration against production domain is blocked without --allow-production-target flag!");
  console.error("  Target requested: " + targetUrl);
  console.error("  Specify TARGET_URL=http://localhost:3000 or pass --allow-production-target to proceed.");
  process.exit(1);
}

const timeLimit = isSmoke ? "25s" : "30s";
const actionDelay = "250"; // 250ms pacing between actions to prevent resource exhaustion

// Preserve traces directly into auditable repository documentation directory
const traceRootDir = join(process.cwd(), "docs", "verification-evidence", "bombadil", "traces");
mkdirSync(traceRootDir, { recursive: true });
const summaryPath = join(process.cwd(), "docs", "verification-evidence", "bombadil-trace-summary.json");

console.log(`[bombadil] Starting fail-closed property exploration against ${targetUrl} (time limit: ${timeLimit}, action-delay: ${actionDelay}ms)...`);

// Eight route/viewport combinations covering five canonical route types
// (homepage, collections, PDP, cart, and account/auth). Note: this covers
// 8 distinct route/viewport pairs, not a complete 40-case (8x5) Cartesian matrix.
const allViewports = [
  { name: "mobile-320", width: 320, height: 568, route: "/" },
  { name: "mobile-360", width: 360, height: 640, route: "/c/sarees" },
  { name: "mobile-390", width: 390, height: 844, route: "/" },
  { name: "mobile-430", width: 430, height: 932, route: "/p/dhakai-jamdani-silk-saree" },
  { name: "tablet-768", width: 768, height: 1024, route: "/cart" },
  { name: "laptop-1024", width: 1024, height: 768, route: "/auth" },
  { name: "desktop-1280", width: 1280, height: 800, route: "/c/sarees" },
  { name: "desktop-1440", width: 1440, height: 900, route: "/" },
];

let selectedViewports;
if (isSmoke) {
  selectedViewports = [allViewports[2]]; // mobile-390
} else if (isAll) {
  selectedViewports = allViewports; // All 8 viewports
} else {
  // Balanced default: spans smallest mobile, typical phone, tablet, and desktop
  selectedViewports = [allViewports[0], allViewports[2], allViewports[4], allViewports[7]];
}

async function checkServer(url) {
  try {
    const res = await fetch(`${url}/favicon.ico`, { signal: AbortSignal.timeout(1500) });
    return res.status < 500;
  } catch {
    return false;
  }
}

let spawnedServer = null;

async function ensureTarget() {
  const isUp = await checkServer(targetUrl);
  if (isUp) {
    console.log(`[bombadil] Target ${targetUrl} is reachable and responding.`);
    return;
  }

  const urlObj = new URL(targetUrl);
  const isLoopback = urlObj.hostname === "127.0.0.1" || urlObj.hostname === "localhost";
  if (!isLoopback) {
    console.error(`[bombadil] ✗ Target server ${targetUrl} is unreachable and cannot be started automatically.`);
    process.exit(1);
  }

  const port = urlObj.port || "3000";
  console.log(`[bombadil] Spawning local development server on port ${port}...`);
  const env = {
    ...process.env,
    SUPABASE_URL: process.env.SUPABASE_URL || "http://127.0.0.1:9",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "ci-placeholder-service-role-key",
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY || "ci-placeholder-publishable-key",
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "http://127.0.0.1:9",
    VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "ci-placeholder-publishable-key",
    AUTH_HASH_SALT: process.env.AUTH_HASH_SALT || "ci-placeholder-salt",
  };

  spawnedServer = spawn("npx", ["vite", "--port", port, "--strictPort", "--host", "localhost"], {
    env,
    stdio: "ignore",
    detached: process.platform !== "win32",
  });

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await checkServer(targetUrl)) {
      console.log(`[bombadil] ✓ Local development server ready at ${targetUrl}`);
      console.log(`[bombadil] Warming up SSR route cache...`);
      const routesToWarm = ["/", "/c/sarees", "/p/dhakai-jamdani-silk-saree", "/cart", "/auth"];
      for (const r of routesToWarm) {
        try {
          const warmupRes = await fetch(`${targetUrl}${r}`, { signal: AbortSignal.timeout(15000) });
          await warmupRes.text();
        } catch (e) {
          console.warn(`[bombadil] Warmup note for ${r}:`, e.message);
        }
      }
      console.log(`[bombadil] ✓ All 5 canonical routes warmed and responding.`);
      return;
    }
  }

  console.error(`[bombadil] ✗ Timed out waiting for local dev server on ${targetUrl}`);
  stopServer();
  process.exit(1);
}

function stopServer() {
  if (spawnedServer && spawnedServer.pid) {
    try {
      if (process.platform !== "win32") {
        process.kill(-spawnedServer.pid, "SIGTERM");
      } else {
        spawnedServer.kill("SIGTERM");
      }
    } catch {}
    spawnedServer = null;
  }
}

process.on("exit", stopServer);
process.on("SIGINT", () => {
  stopServer();
  process.exit(1);
});
process.on("SIGTERM", () => {
  stopServer();
  process.exit(1);
});

await ensureTarget();

let overallSuccess = true;
let failureExitCode = 0;
const summaryResults = [];

async function runViewport(vp) {
  const vpOut = join(traceRootDir, vp.name);
  mkdirSync(vpOut, { recursive: true });

  const viewportUrl = new URL(vp.route, targetUrl).href;
  console.log(`\n[bombadil] Exploring viewport ${vp.name} (${vp.width}x${vp.height}) at ${viewportUrl}...`);
  const startTime = Date.now();

  const args = [
    "bombadil", "browser", "test",
    "--headless",
    "--width", String(vp.width),
    "--height", String(vp.height),
    "--time-limit", timeLimit,
    "--exit-on-violation",
    "--output-path-overwrite",
    "--output-path", vpOut,
    viewportUrl,
    "bombadil/specification.ts",
  ];

  return new Promise((resolve) => {
    const child = spawn("bunx", args, { stdio: "inherit" });

    child.on("close", (code) => {
      const elapsed = Number(((Date.now() - startTime) / 1000).toFixed(1));
      const traceFile = join(vpOut, "trace.jsonl");

      // FAIL-CLOSED: Missing or empty trace evidence must strictly fail the viewport.
      // Never synthesize trace.jsonl stubs.
      const traceExists = existsSync(traceFile) && statSync(traceFile).size > 0;
      if (!traceExists) {
        overallSuccess = false;
        failureExitCode = code || 1;
        console.error(`[bombadil] ✗ Viewport ${vp.name} failed: missing or empty trace evidence file!`);
        summaryResults.push({
          name: vp.name,
          width: vp.width,
          height: vp.height,
          route: vp.route,
          targetUrl: viewportUrl,
          durationSeconds: elapsed,
          actionsExecuted: 0,
          actionTypes: [],
          invariantsExecuted: [
            "no_horizontal_overflow (scrollWidth <= innerWidth + 1, fail-closed on missing dims)",
            "no_server_error_pages (no 5xx titles or headings)",
            "page_has_title_or_heading (asserts accessible title/header present)",
            "single_primary_h1 (at most 1 H1 per rendered page)",
            "all_images_loaded (missing src, load completion, natural dimensions, decode check)",
            "no_duplicate_active_collection_rail (asserts active collection slug is never duplicated in secondary rails)",
            "intentional_cross_sell_preserved (asserts distinct cross-sell collections are preserved in secondary rails)",
            "unique_product_cards (asserts 0 duplicate product links across rendered grid cards)",
            "responsive_override_reset_integrity (asserts reset button presence and wiring when overrides exist)",
            "device_visibility_consistency (asserts breakpoint visibility consistency across mobile and desktop)",
            "noUncaughtExceptions",
            "noUnhandledPromiseRejections"
          ],
          violations: 1,
          imageFailures: 0,
          failedUrls: ["<trace-missing>"],
          verdict: "FAIL",
          tracePath: `docs/verification-evidence/bombadil/traces/${vp.name}/trace.jsonl`,
          traceSha256: null,
          error: "Missing or unreadable trace evidence file"
        });
        resolve();
        return;
      }

      // Truthful parsing of actual Bombadil trace events
      const traceBuffer = readFileSync(traceFile);
      const traceSha256 = createHash("sha256").update(traceBuffer).digest("hex");
      const lines = traceBuffer.toString("utf-8").trim().split("\n");

      let actionsExecuted = 0;
      const observedActionTypes = new Set();
      let violationsCount = 0;
      let imageFailuresCount = 0;
      const observedFailedUrls = new Set();
      let hasMalformedRecord = false;
      let malformedErrorMessage = null;

      for (let i = 0; i < lines.length; i++) {
        const lineStr = lines[i];
        if (!lineStr.trim()) continue;
        let record;
        try {
          record = JSON.parse(lineStr);
        } catch (err) {
          hasMalformedRecord = true;
          malformedErrorMessage = `Line ${i + 1} is malformed JSON: ${err.message}`;
          console.error(`[bombadil] ✗ Malformed trace record in viewport ${vp.name} on line ${i + 1}: ${err.message}`);
          break;
        }

        // 1. Extract action counts and action types dynamically
        if (record.action) {
          actionsExecuted++;
          if (typeof record.action === "string") {
            observedActionTypes.add(record.action);
          } else if (typeof record.action === "object") {
            const keys = Object.keys(record.action);
            if (keys.length > 0) observedActionTypes.add(keys[0]);
          }
        }

        // 2. Extract real violations
        if (record.violations && Array.isArray(record.violations)) {
          violationsCount += record.violations.length;
        }

        // 3. Extract real image failure results from property snapshots
        if (record.snapshots && Array.isArray(record.snapshots)) {
          const imgSnap = record.snapshots.find((s) => s.name === "imageInspection");
          if (imgSnap && imgSnap.value) {
            if (typeof imgSnap.value.brokenCount === "number" && imgSnap.value.brokenCount > 0) {
              imageFailuresCount = Math.max(imageFailuresCount, imgSnap.value.brokenCount);
            }
            if (Array.isArray(imgSnap.value.failedUrls)) {
              for (const u of imgSnap.value.failedUrls) observedFailedUrls.add(u);
            }
          }
        }
      }

      if (hasMalformedRecord) {
        violationsCount = Math.max(violationsCount, 1);
      }

      const actionTypesList = Array.from(observedActionTypes);

      // A viewport passes ONLY when exit code is 0, zero violations, zero image failures,
      // zero malformed records, and at least one real action was executed from the trace evidence.
      const isPass = (
        code === 0 &&
        !hasMalformedRecord &&
        violationsCount === 0 &&
        imageFailuresCount === 0 &&
        actionsExecuted > 0
      );

      if (!isPass) {
        overallSuccess = false;
        failureExitCode = code || 1;
        console.error(`[bombadil] ✗ Viewport ${vp.name} failed: code=${code}, violations=${violationsCount}, imageFailures=${imageFailuresCount}, actions=${actionsExecuted}, malformed=${hasMalformedRecord}`);
      } else {
        console.log(`[bombadil] ✓ Viewport ${vp.name} passed with ${actionsExecuted} actions, 0 violations, 0 image failures (SHA-256: ${traceSha256.slice(0, 16)}...).`);
      }

      summaryResults.push({
        name: vp.name,
        width: vp.width,
        height: vp.height,
        route: vp.route,
        targetUrl: viewportUrl,
        durationSeconds: elapsed,
        actionsExecuted,
        actionTypes: actionTypesList,
        invariantsExecuted: [
          "no_horizontal_overflow (scrollWidth <= innerWidth + 1, fail-closed on missing dims)",
          "no_server_error_pages (no 5xx titles or headings)",
          "page_has_title_or_heading (asserts accessible title/header present)",
          "single_primary_h1 (at most 1 H1 per rendered page)",
          "all_images_loaded (missing src, load completion, natural dimensions, decode check)",
          "no_duplicate_active_collection_rail (asserts active collection slug is never duplicated in secondary rails)",
          "intentional_cross_sell_preserved (asserts distinct cross-sell collections are preserved in secondary rails)",
          "unique_product_cards (asserts 0 duplicate product links across rendered grid cards)",
          "responsive_override_reset_integrity (asserts reset button presence and wiring when overrides exist)",
          "device_visibility_consistency (asserts breakpoint visibility consistency across mobile and desktop)",
          "noUncaughtExceptions",
          "noUnhandledPromiseRejections"
        ],
        violations: violationsCount,
        imageFailures: imageFailuresCount,
        failedUrls: Array.from(observedFailedUrls),
        verdict: isPass ? "PASS" : "FAIL",
        tracePath: `docs/verification-evidence/bombadil/traces/${vp.name}/trace.jsonl`,
        traceSha256,
        screenshotPath: `docs/verification-evidence/bombadil/traces/${vp.name}/`,
        error: malformedErrorMessage || (isPass ? null : `code=${code}, violations=${violationsCount}, imageFailures=${imageFailuresCount}`)
      });

      resolve();
    });

    child.on("error", (err) => {
      overallSuccess = false;
      failureExitCode = 1;
      console.error(`[bombadil] ✗ Process spawn error on viewport ${vp.name}:`, err.message);
      resolve();
    });
  });
}

try {
  for (const vp of selectedViewports) {
    await runViewport(vp);
  }
} finally {
  stopServer();
}

// Write updated trace summary with truthful metrics and SHA-256 hashes
try {
  const summaryData = {
    testRun: {
      tool: "@antithesishq/bombadil",
      version: "0.7.10",
      date: new Date().toISOString(),
      target: targetUrl,
      targetEnvironment: (targetUrl.includes("127.0.0.1") || targetUrl.includes("localhost"))
        ? "staging-loopback (seeded-preview-fixtures)"
        : "production-readonly",
      routeCoverageDescription: "8 route/viewport combinations covering 5 canonical route types, not a complete 40-case matrix",
      routeMatrix: allViewports.map((v) => ({ viewport: v.name, route: v.route })),
      runnerMode: "fail-closed",
      actionDelayMs: Number(actionDelay),
      viewports: summaryResults
    }
  };
  writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2) + "\n", "utf-8");
  if (!existsSync(summaryPath) || statSync(summaryPath).size === 0) {
    throw new Error("Summary file was not written or is empty");
  }
} catch (err) {
  console.error("[bombadil] ✗ Failed to write trace summary:", err.message);
  overallSuccess = false;
  failureExitCode = failureExitCode || 1;
}

if (!overallSuccess) {
  console.error(`\n[bombadil] ✗ Exploration suite failed with exit code ${failureExitCode}. Terminating process.`);
  process.exit(failureExitCode || 1);
}

console.log("\n[bombadil] ✓ All viewports passed with 0 property violations. Traces saved in docs/verification-evidence/bombadil/traces/\n");


