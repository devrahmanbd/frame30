import { defineConfig, devices } from "@playwright/test";
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

export default defineConfig({
  testDir: "./",
  testMatch: "*.spec.ts",
  timeout: 60_000,
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
        // Static-asset probe: proves vite is serving without paying for
        // (or depending on) an SSR compile or any DB-backed loader.
        // Page specs assert SSR/health separately.
        url: `${baseURL}/favicon.ico`,
        reuseExistingServer: true,
        // Cold-start budget: a fresh checkout re-optimizes the whole
        // dependency graph before serving (~1-4 min on CI executors;
        // observed >180s on a loaded dev box). Warm runs serve in seconds.
        timeout: 300_000,
      },
});
