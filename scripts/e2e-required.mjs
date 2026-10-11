#!/usr/bin/env node
/**
 * E2E harness-required gate (fail-closed).
 *
 * The old `e2e-critical` job treated a missing Playwright harness as a pass
 * ("passing by design"), which reads as verified in any security-acceptance
 * interpretation. This gate inverts that: if `.e2e/playwright.config.ts` is
 * absent (or a placeholder stub), it writes an unmistakable
 * HARNESS-MISSING-NOT-VERIFIED marker and exits non-zero, so the job fails
 * loudly instead of passing silently.
 *
 * When the harness exists this script passes and CI proceeds to install
 * browsers and run `e2e:critical` as separate steps.
 *
 * Usage: node scripts/e2e-required.mjs [--config .e2e/playwright.config.ts]
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const CONFIG = flag("config", ".e2e/playwright.config.ts");
/** A real Playwright config is never smaller than this; below it is a stub. */
const MIN_BYTES = 200;
const MARKER = join(".artifacts", "e2e", "HARNESS-MISSING-NOT-VERIFIED.marker");

let size = 0;
try {
  if (existsSync(join(ROOT, CONFIG)) && statSync(join(ROOT, CONFIG)).isFile()) {
    size = statSync(join(ROOT, CONFIG)).size;
  }
} catch {
  size = 0;
}

if (size < MIN_BYTES) {
  mkdirSync(join(ROOT, ".artifacts", "e2e"), { recursive: true });
  const body = [
    "HARNESS-MISSING-NOT-VERIFIED",
    `config: ${CONFIG} (${size === 0 ? "absent" : `only ${size}B — stub`})`,
    "date: " + new Date().toISOString(),
    "",
    "The E2E harness is missing, so no end-to-end suite ran.",
    "This marker MUST NOT be read as a pass: treat the e2e-critical job",
    "as NOT VERIFIED. Land the Playwright harness to clear this gate.",
  ].join("\n");
  writeFileSync(join(ROOT, MARKER), body);
  console.error(
    "\nHARNESS-MISSING-NOT-VERIFIED — no E2E suite ran and this is NOT a pass.\n" +
      `Expected a real config at ${CONFIG} (>= ${MIN_BYTES}B).\n` +
      `Marker written to ${MARKER}.\n` +
      "Land the Playwright harness (.e2e/playwright.config.ts + suites) to clear this gate.\n",
  );
  process.exit(1);
}

console.log(`e2e harness check passed — ${CONFIG} present (${size}B).`);
