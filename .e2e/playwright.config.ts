import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { resolveBaseURL, resolvePort } from "./helpers";

/**
 * Framique E2E harness (fail-closed gate: scripts/e2e-required.mjs).
 *
 * - Browser: chromium only.
 * - baseURL: E2E_BASE_URL wins (repo convention, cf. scripts/*-gate.mjs);
 *   otherwise http://localhost:<E2E_PORT|3000> (vite.config.ts dev default).
 * - Server lifecycle: webServer starts `npx vite --port <port> --strictPort`
 *   (the repo dev server; `bun run dev` in AGENTS.md resolves to the same
 *   vite dev entry) and Playwright kills it when the run ends. When
 *   E2E_BASE_URL already responds, reuseExistingServer skips the spawn.
 *   Set E2E_NO_WEBSERVER=1 to manage the server yourself (see README.md).
 * - Hermetic: specs only touch baseURL (localhost). No external network,
 *   no production URLs.
 * - Timeouts are generous on first navigation (cold vite SSR compile can
 *   take tens of seconds) and strict afterwards; retries follow the
 *   docs/15-e2e standard (2 on CI, 1 locally); trace + screenshot + video
 *   are retained on failure.
 */

const baseURL = resolveBaseURL();
const port = resolvePort(baseURL);
// Repo root (parent of .e2e/): the spawned dev server must run from here.
// Playwright defaults webServer.cwd to the config file's directory, which
// would make `vite` serve .e2e/ as its root — instant 404s on every path,
// so the readiness probe below could never succeed (measured: favicon.ico
// answered empty-404 in <1 ms from a server spawned without cwd).
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  testDir: "./",
  testMatch: "*.spec.ts",
  // SSR warm-up runs here: .e2e/global-setup.ts polls the preview route
  // until it answers 200 (generous budget) BEFORE any spec asserts, so a
  // cold vite SSR compile cannot flake the first navigation.
  globalSetup: "./global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 2 : 1,
  outputDir: "../.artifacts/e2e/test-results",
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: "../.artifacts/e2e/playwright-report",
      },
    ],
  ],
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_NO_WEBSERVER
    ? undefined
    : {
        command: `npx vite --port ${port} --strictPort --host localhost`,
        // Run vite from the repo root (see repoRoot above): without this
        // it serves .e2e/ as root and every probe path 404s instantly.
        cwd: repoRoot,
        // Static-asset probe: proves vite is serving without paying for
        // (or depending on) an SSR compile or any DB-backed loader.
        // Page specs assert SSR/health separately.
        url: `${baseURL}/favicon.ico`,
        reuseExistingServer: true,
        // Cold-start budget: a fresh checkout re-optimizes the whole
        // dependency graph before serving (~1-4 min on CI executors;
        // observed >180s on a loaded dev box; allow headroom beyond the
        // old 300 s ceiling for a guaranteed-cold run under parallel
        // load). Warm runs serve in seconds; the extra ceiling costs
        // nothing when warm. The SSR warm-up in global-setup.ts runs
        // after this probe succeeds.
        timeout: 600_000,
      },
});
