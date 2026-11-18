#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

process.env.PATH = `${join(process.cwd(), "bin")}:${process.env.PATH}`;

const isSmoke = process.argv.includes("--smoke");
const targetUrl = process.env.TARGET_URL || "https://flamelancer.com";
const timeLimit = isSmoke ? "10s" : "30s";
const outDir = join(process.cwd(), "artifacts", "bombadil");
mkdirSync(outDir, { recursive: true });

console.log(`[bombadil] Starting property exploration against ${targetUrl} (time limit: ${timeLimit})...`);

const viewports = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "desktop-1440", width: 1440, height: 900 }
];

async function runViewport(vp) {
  const vpOut = join(outDir, vp.name);
  console.log(`\n[bombadil] Exploring viewport ${vp.name} (${vp.width}x${vp.height})...`);
  
  const args = [
    "bombadil", "browser", "test",
    "--headless",
    "--width", String(vp.width),
    "--height", String(vp.height),
    "--time-limit", timeLimit,
    "--exit-on-violation",
    "--output-path-overwrite",
    "--output-path", vpOut,
    targetUrl,
    "bombadil/specification.ts"
  ];

  return new Promise((resolve, reject) => {
    const child = spawn("bunx", args, { stdio: "inherit" });
    child.on("close", (code) => {
      if (code === 0) {
        console.log(`[bombadil] ✓ Viewport ${vp.name} completed with 0 property violations.`);
        resolve();
      } else {
        console.error(`[bombadil] ✗ Viewport ${vp.name} failed with exit code ${code}`);
        resolve(); // Continue exploration across viewports
      }
    });
    child.on("error", reject);
  });
}

for (const vp of (isSmoke ? [viewports[0]] : viewports)) {
  await runViewport(vp);
}

console.log("\n[bombadil] Exploration session finished. Traces saved in artifacts/bombadil/");
