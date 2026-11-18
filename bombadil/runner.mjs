#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

process.env.PATH = `${join(process.cwd(), "bin")}:${process.env.PATH}`;

const isSmoke = process.argv.includes("--smoke");
const isAll = process.argv.includes("--all");
const allowProduction = process.argv.includes("--allow-production-target");

// Default to local development server / staging to protect live production merchant
const targetUrl = process.env.TARGET_URL || "http://127.0.0.1:3000";
const isProductionDomain = targetUrl.includes("flamelancer.com") || targetUrl.includes("framique.com");

if (isProductionDomain && !allowProduction) {
  console.error("[bombadil] ✗ SAFETY GUARD: Fuzz exploration against production domain is blocked without --allow-production-target flag!");
  console.error("  Target requested: " + targetUrl);
  console.error("  Specify TARGET_URL=http://127.0.0.1:3000 or pass --allow-production-target to proceed.");
  process.exit(1);
}

const timeLimit = isSmoke ? "10s" : "20s";
const actionDelay = "250"; // 250ms pacing between actions to prevent resource exhaustion

// Preserve traces directly into auditable repository documentation directory
const traceRootDir = join(process.cwd(), "docs", "verification-evidence", "bombadil", "traces");
mkdirSync(traceRootDir, { recursive: true });

console.log(`[bombadil] Starting fail-closed property exploration against ${targetUrl} (time limit: ${timeLimit}, action-delay: ${actionDelay}ms)...`);

// Full 8-viewport responsive matrix spanning mobile, phablet, tablet, and high-DPI desktop
const allViewports = [
  { name: "mobile-320", width: 320, height: 568 },
  { name: "mobile-360", width: 360, height: 640 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1024", width: 1024, height: 768 },
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "desktop-1440", width: 1440, height: 900 },
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

let overallSuccess = true;
let failureExitCode = 0;

async function runViewport(vp) {
  const vpOut = join(traceRootDir, vp.name);
  mkdirSync(vpOut, { recursive: true });

  console.log(`\n[bombadil] Exploring viewport ${vp.name} (${vp.width}x${vp.height})...`);

  const args = [
    "bombadil", "browser", "test",
    "--headless",
    "--width", String(vp.width),
    "--height", String(vp.height),
    "--time-limit", timeLimit,
    "--action-delay", actionDelay,
    "--exit-on-violation",
    "--output-path-overwrite",
    "--output-path", vpOut,
    targetUrl,
    "bombadil/specification.ts",
  ];

  return new Promise((resolve) => {
    const child = spawn("bunx", args, { stdio: "inherit" });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`[bombadil] ✓ Viewport ${vp.name} completed with 0 property violations.`);
      } else {
        overallSuccess = false;
        failureExitCode = code || 1;
        console.error(`[bombadil] ✗ Viewport ${vp.name} failed with exit code ${code}`);
      }
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

for (const vp of selectedViewports) {
  await runViewport(vp);
}

if (!overallSuccess) {
  console.error(`\n[bombadil] ✗ Exploration suite failed with exit code ${failureExitCode}. Terminating process.`);
  process.exit(failureExitCode);
}

console.log("\n[bombadil] ✓ All viewports passed with 0 property violations. Traces saved in docs/verification-evidence/bombadil/traces/\n");

