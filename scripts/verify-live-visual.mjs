#!/usr/bin/env node
/**
 * Live visual verification gate.
 *
 * The release gates can prove the local suite and the local build. This gate
 * proves the DEPLOYED result: the public theme-preview documents carry one
 * coherent per-request CSP nonce, and the real pages render in a real browser
 * without page errors, console errors or CSP violations.
 *
 * What it does:
 *
 *   CHECK 1 — fetch every template key the preview route accepts and assert,
 *   per document: HTTP 200; the response's `x-csp-nonce` header equals BOTH
 *   `meta[name="csp-nonce"]` and TanStack's `meta[property="csp-nonce"]`
 *   mirror; and every nonce-bearing `<script>` uses that same value. The key
 *   list is DERIVED from the source (`TEMPLATE_KEYS` plus the closed
 *   `TEMPLATE_VARIANTS` vocabulary), never hard-coded here.
 *
 *   CHECK 2 — open the real preview route at 1280 / 768 / 390 and the public
 *   `/`, `/cart` and `/account` surfaces at 1280 in headless Chromium,
 *   screenshot each, and fail on `pageerror`, `console.error`, a
 *   `securitypolicyviolation` event, a non-200 preview, or a preview that
 *   does not render its stable theme marker and authored widget tree.
 *
 * Outputs `screenshots/`, `summary.json` and `summary.md` under `--out`, and
 * exits 1 on any failure. Every request is a read-only GET; nothing is
 * written to the target.
 *
 * Usage:
 *   node scripts/verify-live-visual.mjs
 *   node scripts/verify-live-visual.mjs --base-url https://framique.qubickle.com \
 *     --store-base-url https://flamelancer.com \
 *     --out /tmp/opencode/live-visual-2026-10-28
 *
 * `--base-url` carries the preview legs (preview is blocked on merchant
 * hosts, and the preview host has no themed storefront); `--store-base-url`
 * carries the `/`, `/cart` and `/account` storefront legs and defaults to
 * `--base-url` when the deployment serves both on one origin.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = args[i + 1];
  if (value === undefined || value.startsWith("--"))
    throw new Error(`--${name} needs a value`);
  return value;
};

const RUN_STARTED = new Date();
const BASE_URL = (() => {
  const raw = arg(
    "base-url",
    process.env["LIVE_VISUAL_BASE_URL"] ?? "https://framique.qubickle.com",
  );
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`--base-url is not a URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error(`--base-url must be http(s): ${raw}`);
  return url.toString().replace(/\/+$/, "");
})();

/**
 * Storefront legs can run against a different origin than the preview legs:
 * `/theme-preview/*` is deliberately blocked on merchant hosts and the
 * preview host deliberately has no themed storefront (its `/cart` 307s to a
 * store slug that carries no published theme). Defaults to --base-url.
 */
const STORE_BASE_URL = (() => {
  const raw = arg(
    "store-base-url",
    process.env["LIVE_VISUAL_STORE_BASE_URL"] ?? BASE_URL,
  );
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`--store-base-url is not a URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error(`--store-base-url must be http(s): ${raw}`);
  return url.toString().replace(/\/+$/, "");
})();

const OUT_DIR = resolve(
  arg(
    "out",
    process.env["LIVE_VISUAL_OUT"] ??
      `/tmp/opencode/live-visual-${RUN_STARTED.toISOString().replace(/[:.]/g, "-")}`,
  ),
);
const SHOT_DIR = join(OUT_DIR, "screenshots");
mkdirSync(SHOT_DIR, { recursive: true });

const SOURCE_FILES = {
  templateKeys: join(REPO_ROOT, "src/lib/builder-ast.ts"),
  templateVariants: join(REPO_ROOT, "src/lib/template-variants.ts"),
  preview: join(REPO_ROOT, "src/lib/themes/songoskriti/preview.ts"),
  route: join(REPO_ROOT, "src/routes/theme-preview.$key.tsx"),
};

const VIEWPORTS = {
  1280: { width: 1280, height: 900 },
  768: { width: 768, height: 1024 },
  390: { width: 390, height: 844 },
};

const failures = [];
const setupErrors = [];
let setup = null;
let check1 = {
  passed: 0,
  total: 0,
  keys: [],
};
let check2 = {
  passed: 0,
  total: 0,
  browserVersion: null,
  targets: [],
};

const readSource = (path) => readFileSync(path, "utf8");

const stripLineComments = (line) => {
  const i = line.indexOf("//");
  return i === -1 ? line : line.slice(0, i);
};

/** Parse a literal `export const NAME = ["a", "b"] as const;` block. */
function parseStringArray(source, name, file) {
  const match = new RegExp(
    `export\\s+const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const`,
  ).exec(source);
  if (!match)
    throw new Error(`could not find ${name} in ${file}`);
  const values = [];
  for (const rawLine of match[1].split("\n")) {
    const line = stripLineComments(rawLine).trim();
    if (!line) continue;
    const value = /^"([^"]+)"[,]?$/.exec(line)?.[1];
    if (value) values.push(value);
  }
  if (values.length === 0)
    throw new Error(`${name} in ${file} contains no keys`);
  return [...new Set(values)];
}

/** Parse the closed `TEMPLATE_VARIANTS = { base: ["suffix"] }` table. */
function parseTemplateVariants(source, file) {
  const match =
    /export\s+const\s+TEMPLATE_VARIANTS\s*=\s*\{([\s\S]*?)\}\s*as\s+const/.exec(
      source,
    );
  if (!match)
    throw new Error(`could not find TEMPLATE_VARIANTS in ${file}`);
  const variants = [];
  for (const rawLine of match[1].split("\n")) {
    const line = stripLineComments(rawLine).trim();
    if (!line) continue;
    const entry = /^([A-Za-z0-9_]+)\s*:\s*\[([^\]]*)\]/.exec(line);
    if (!entry) continue;
    for (const suffix of entry[2].matchAll(/"([^"]+)"/g))
      variants.push(`${entry[1]}_${suffix[1]}`);
  }
  if (variants.length === 0)
    throw new Error(`TEMPLATE_VARIANTS in ${file} contains no variants`);
  return [...new Set(variants)];
}

/** Read the route + theme identity from code instead of guessing either. */
function loadSetup() {
  const templateSource = readSource(SOURCE_FILES.templateKeys);
  const variantsSource = readSource(SOURCE_FILES.templateVariants);
  const previewSource = readSource(SOURCE_FILES.preview);
  const routeSource = readSource(SOURCE_FILES.route);

  const baseKeys = parseStringArray(
    templateSource,
    "TEMPLATE_KEYS",
    SOURCE_FILES.templateKeys,
  );
  const variantKeys = parseTemplateVariants(
    variantsSource,
    SOURCE_FILES.templateVariants,
  );

  const routeMatch = /createFileRoute\(\s*["']([^"']+)["']\s*\)/.exec(
    routeSource,
  );
  if (!routeMatch)
    throw new Error(
      `could not find createFileRoute(...) in ${SOURCE_FILES.route}`,
    );
  const routeTemplate = routeMatch[1];

  const identity =
    /return\s*\{\s*key:\s*"([^"]+)",\s*themeName:\s*"([^"]+)",\s*author:\s*"([^"]+)"/.exec(
      previewSource,
    );
  if (!identity)
    throw new Error(
      `could not find the preview source identity in ${SOURCE_FILES.preview}`,
    );
  const [, themeKey, themeName, themeAuthor] = identity;
  if (
    routeTemplate !== "/theme-preview/$key" &&
    !routeTemplate.includes("$key")
  )
    throw new Error(
      `route template "${routeTemplate}" does not carry a $key segment`,
    );
  const routePath = routeTemplate.replace(/\$key\b/g, themeKey);

  const seen = new Set();
  const templateKeys = [];
  for (const key of baseKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    templateKeys.push({ key, kind: "template" });
  }
  for (const key of variantKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    templateKeys.push({ key, kind: "variant" });
  }

  return {
    baseUrl: BASE_URL,
    storeBaseUrl: STORE_BASE_URL,
    outDir: OUT_DIR,
    routePath,
    routeTemplate,
    theme: {
      key: themeKey,
      name: themeName,
      author: themeAuthor,
      marker: themeName,
      previewSource: SOURCE_FILES.preview,
    },
    templateKeys,
    sourceFiles: SOURCE_FILES,
  };
}

const attr = (tag, name) => {
  const match = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "i",
  ).exec(tag);
  return match ? (match[1] ?? match[2] ?? null) : null;
};

const unique = (values) => [...new Set(values)];
const shortNonce = (nonce) =>
  nonce ? `${nonce.slice(0, 10)}…` : "missing";

/** Check 1 — per-document nonce coherence on every preview template key. */
async function runCheck1(config) {
  console.log(
    `\nCHECK 1 — ${config.templateKeys.length} theme-preview keys on ${config.baseUrl}${config.routePath}`,
  );
  for (const entry of config.templateKeys) {
    const url = `${config.baseUrl}${config.routePath}?template=${encodeURIComponent(entry.key)}`;
    const result = {
      key: entry.key,
      kind: entry.kind,
      url,
      status: null,
      httpOk: false,
      nonceHeader: null,
      cspNonce: null,
      nameMeta: null,
      propertyMeta: null,
      nameMetaCount: 0,
      propertyMetaCount: 0,
      scriptNonceCount: 0,
      scriptNonces: [],
      noncesConsistent: false,
      failures: [],
      ok: false,
    };

    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "framique-live-visual/1.0",
        },
      });
      const html = await response.text();
      result.status = response.status;
      result.httpOk = response.status === 200;

      const nonceHeader = (response.headers.get("x-csp-nonce") ?? "").trim();
      result.nonceHeader = nonceHeader || null;

      const csp = response.headers.get("content-security-policy") ?? "";
      const cspNonces = unique(
        [...csp.matchAll(/'nonce-([^']+)'/g)].map((match) => match[1]),
      );
      result.cspNonce = cspNonces.length === 1 ? cspNonces[0] : null;

      const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
      const nameMetaTags = metaTags.filter(
        (tag) => (attr(tag, "name") ?? "").toLowerCase() === "csp-nonce",
      );
      const propertyMetaTags = metaTags.filter(
        (tag) => (attr(tag, "property") ?? "").toLowerCase() === "csp-nonce",
      );
      result.nameMetaCount = nameMetaTags.length;
      result.propertyMetaCount = propertyMetaTags.length;
      result.nameMeta = nameMetaTags.length
        ? (attr(nameMetaTags[0], "content") ?? "").trim() || null
        : null;
      result.propertyMeta = propertyMetaTags.length
        ? (attr(propertyMetaTags[0], "content") ?? "").trim() || null
        : null;

      const scriptNonces = [];
      for (const match of html.matchAll(
        /<script\b[^>]*\bnonce\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi,
      )) {
        const value = (match[1] ?? match[2] ?? "").trim();
        if (value) scriptNonces.push(value);
      }
      result.scriptNonces = unique(scriptNonces);
      result.scriptNonceCount = result.scriptNonces.length;

      const { nameMeta, propertyMeta, nonceHeader: header } = result;
      const scriptNonce =
        result.scriptNonces.length === 1 ? result.scriptNonces[0] : null;
      result.noncesConsistent =
        result.nameMetaCount === 1 &&
        result.propertyMetaCount === 1 &&
        result.scriptNonceCount === 1 &&
        Boolean(nameMeta) &&
        nameMeta === propertyMeta &&
        nameMeta === scriptNonce &&
        Boolean(result.cspNonce) &&
        result.cspNonce === nameMeta;

      if (!result.httpOk)
        result.failures.push(`HTTP ${response.status} (expected 200)`);
      if (!result.cspNonce)
        result.failures.push(
          "CSP response header carries no single 'nonce-…' source",
        );
      if (result.nameMetaCount !== 1)
        result.failures.push(
          `meta[name="csp-nonce"] count ${result.nameMetaCount} (expected 1)`,
        );
      if (result.propertyMetaCount !== 1)
        result.failures.push(
          `meta[property="csp-nonce"] count ${result.propertyMetaCount} (expected 1)`,
        );
      if (!nameMeta) result.failures.push("meta[name] content is empty");
      if (!propertyMeta)
        result.failures.push("meta[property] content is empty");
      if (result.scriptNonceCount !== 1)
        result.failures.push(
          `distinct script nonces ${result.scriptNonceCount} (expected 1)`,
        );
      if (header && nameMeta && header !== nameMeta)
        result.failures.push("x-csp-nonce != meta[name=csp-nonce]");
      if (header && propertyMeta && header !== propertyMeta)
        result.failures.push("x-csp-nonce != meta[property=csp-nonce]");
      if (header && scriptNonce && header !== scriptNonce)
        result.failures.push("x-csp-nonce != script nonce");
      if (nameMeta && propertyMeta && nameMeta !== propertyMeta)
        result.failures.push(
          "meta[name=csp-nonce] != meta[property=csp-nonce]",
        );
      if (nameMeta && scriptNonce && nameMeta !== scriptNonce)
        result.failures.push("meta[name=csp-nonce] != script nonce");
      if (cspNonces.length !== 1)
        result.failures.push(
          `CSP header nonces ${cspNonces.length} (expected 1)`,
        );
      if (result.cspNonce && nameMeta && result.cspNonce !== nameMeta)
        result.failures.push("CSP header nonce != meta[name=csp-nonce]");
    } catch (error) {
      result.failures.push(
        `request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    result.ok = result.failures.length === 0;
    if (result.ok) check1.passed += 1;
    for (const failure of result.failures)
      failures.push(`CHECK 1 ${result.key}: ${failure}`);
    check1.keys.push(result);
    check1.total += 1;

    const suffix = result.failures.length
      ? ` — ${result.failures.join("; ")}`
      : " — name=property=script=header";
    console.log(
      `${result.ok ? "PASS" : "FAIL"}  ${result.key.padEnd(18)} ${result.kind.padEnd(9)} HTTP ${String(result.status ?? "ERR").padEnd(4)} nonce=${shortNonce(result.nonceHeader)}${suffix}`,
    );
  }
  console.log(`CHECK 1 ${check1.passed}/${check1.total} keys passed`);
}

const targetLabel = (target) => `${target.name}@${target.width}`;

/** Check 2 — browser render, console, CSP and screenshot sweep. */
async function runCheck2(config) {
  const targets = [
    ...Object.keys(VIEWPORTS).map((width) => {
      const viewport = VIEWPORTS[width];
      return {
        name: "theme-preview",
        path: config.routePath,
        width: viewport.width,
        height: viewport.height,
        requireMarker: true,
        expectedPath: config.routePath,
        screenshot: `theme-preview-${viewport.width}.png`,
      };
    }),
    {
      name: "home",
      path: "/",
      baseUrl: STORE_BASE_URL,
      ...VIEWPORTS[1280],
      requireMarker: false,
      expectedPath: "/",
      screenshot: "home-1280.png",
    },
    {
      name: "cart",
      path: "/cart",
      baseUrl: STORE_BASE_URL,
      ...VIEWPORTS[1280],
      requireMarker: false,
      expectedPath: null,
      screenshot: "cart-1280.png",
    },
    {
      name: "account",
      path: "/account",
      baseUrl: STORE_BASE_URL,
      ...VIEWPORTS[1280],
      requireMarker: false,
      expectedPath: null,
      screenshot: "account-1280.png",
    },
  ];

  console.log(
    `\nCHECK 2 — chromium render on ${config.baseUrl} (storefront ${config.storeBaseUrl}) (${targets.length} surfaces)`,
  );

  let browser;
  try {
    browser = await chromium.launch();
    check2.browserVersion = browser.version();
  } catch (error) {
    const message = `chromium launch failed: ${error instanceof Error ? error.message : String(error)}`;
    failures.push(`CHECK 2 ${message}`);
    console.error(`FAIL  ${message}`);
    return;
  }

  try {
    for (const target of targets) {
      const result = await runTarget(browser, config, target);
      check2.targets.push(result);
      check2.total += 1;
      if (result.ok) check2.passed += 1;
      for (const failure of result.failures)
        failures.push(`CHECK 2 ${targetLabel(target)}: ${failure}`);
      const detail = [
        `${result.metrics?.textLength ?? 0} chars`,
        `${result.metrics?.widgets ?? 0} widgets`,
        `${result.metrics?.images ?? 0} imgs`,
        `${result.consoleErrors.length} console`,
        `${result.cspViolations.length} CSP`,
      ].join(" · ");
      console.log(
        `${result.ok ? "PASS" : "FAIL"}  ${targetLabel(target).padEnd(22)} HTTP ${String(result.status ?? "ERR").padEnd(4)} ${detail}${result.failures.length ? ` — ${result.failures.join("; ")}` : ""}`,
      );
    }
  } finally {
    await browser.close();
  }
  console.log(`CHECK 2 ${check2.passed}/${check2.total} surfaces passed`);
}

async function runTarget(browser, config, target) {
  const origin = target.baseUrl ?? config.baseUrl;
  const url = `${origin}${target.path}`;
  const result = {
    name: target.name,
    path: target.path,
    origin,
    width: target.width,
    height: target.height,
    url,
    finalUrl: null,
    status: null,
    screenshot: `screenshots/${target.screenshot}`,
    screenshotBytes: null,
    metrics: null,
    pageErrors: [],
    consoleErrors: [],
    cspViolations: [],
    failures: [],
    ok: false,
  };

  const context = await browser.newContext({
    viewport: { width: target.width, height: target.height },
    deviceScaleFactor: 1,
  });

  // The event-based collector catches the browser's own CSP enforcement even
  // when the violation never reaches console.error (e.g. a blocked beacon).
  await context.addInitScript(() => {
    window.__liveVisualCspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__liveVisualCspViolations.push({
        blockedURI: event.blockedURI,
        violatedDirective: event.violatedDirective,
        effectiveDirective: event.effectiveDirective,
        sourceFile: event.sourceFile,
        lineNumber: event.lineNumber,
        columnNumber: event.columnNumber,
        disposition: event.disposition,
      });
    });
  });

  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const cspConsoleErrors = [];

  page.on("pageerror", (error) => {
    pageErrors.push({
      message: error.message,
      stack: error.stack ?? null,
    });
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const location = message.location();
    const entry = {
      text,
      url: location.url ?? null,
      lineNumber: location.lineNumber ?? null,
      columnNumber: location.columnNumber ?? null,
    };
    if (
      /content security policy|refused to (?:load|execute|apply|connect|frame|run)/i.test(
        text,
      )
    )
      cspConsoleErrors.push(entry);
    else consoleErrors.push(entry);
  });

  let navigationError = null;
  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    result.status = response?.status() ?? null;
    result.finalUrl = page.url();

    if (target.requireMarker) {
      // The marker is authored in the theme's preview source; waiting for it
      // separates a slow data island from a document that rendered nothing.
      await page
        .waitForFunction(
          (marker) => (document.body?.innerText ?? "").includes(marker),
          config.theme.marker,
          { timeout: 20_000 },
        )
        .catch(() => {});
    }
    await page.waitForLoadState("load", { timeout: 30_000 }).catch(() => {});
    await page
      .evaluate(async () => {
        const timeout = new Promise((done) => setTimeout(done, 3_000));
        await Promise.race([
          document.fonts ? document.fonts.ready : Promise.resolve(),
          timeout,
        ]);
      })
      .catch(() => {});
    // Let hydration, data islands and any late CSP failures settle before
    // the evidence read. Production previews settle in < 1.5 s.
    await page.waitForTimeout(1_500);

    const marker = config.theme.marker;
    result.metrics = await page.evaluate((markerText) => {
      const visible = (el) => {
        const style = getComputedStyle(el);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0
        )
          return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const text = document.body?.innerText ?? "";
      const escapedMarker = markerText.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      return {
        title: document.title,
        finalUrl: location.href,
        textLength: text.trim().length,
        markerCount: (text.match(new RegExp(escapedMarker, "g")) ?? []).length,
        h1: [...document.querySelectorAll("h1")]
          .map((el) => (el.innerText ?? "").trim())
          .filter(Boolean),
        images: [...document.querySelectorAll("img")].filter(visible).length,
        links: [...document.querySelectorAll("a[href]")].filter(visible)
          .length,
        widgets: document.querySelectorAll("[data-widget], [data-island]")
          .length,
        dialogs: [...document.querySelectorAll('[role="dialog"]')].map(
          (el) => el.getAttribute("aria-label"),
        ),
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        cspViolations:
          window.__liveVisualCspViolations ??
          [],
      };
    }, marker);
  } catch (error) {
    navigationError = error instanceof Error ? error.message : String(error);
  }

  result.pageErrors = pageErrors;
  result.consoleErrors = consoleErrors;
  result.cspViolations = [
    ...(result.metrics?.cspViolations ?? []),
    ...cspConsoleErrors.map((entry) => ({
      blockedURI: entry.url,
      violatedDirective: "console",
      sourceFile: entry.url,
      lineNumber: entry.lineNumber,
      disposition: "enforce",
      text: entry.text,
    })),
  ];

  try {
    await page.screenshot({
      path: join(OUT_DIR, target.screenshot),
      fullPage: true,
    });
    result.screenshotBytes = statSync(join(OUT_DIR, target.screenshot)).size;
  } catch (error) {
    result.failures.push(
      `screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (navigationError) result.failures.push(`navigation failed: ${navigationError}`);
  if (result.status === null) result.failures.push("no HTTP response");
  else if (target.requireMarker && result.status !== 200)
    result.failures.push(`HTTP ${result.status} (expected 200)`);
  else if (!target.requireMarker && result.status >= 400)
    result.failures.push(`HTTP ${result.status} (expected < 400)`);

  if (target.expectedPath && result.finalUrl) {
    const finalPath = new URL(result.finalUrl).pathname.replace(/\/+$/, "") || "/";
    const expected =
      target.expectedPath.replace(/\/+$/, "") || "/";
    if (finalPath !== expected)
      result.failures.push(
        `landed on ${finalPath} (expected ${expected})`,
      );
  }

  if (result.pageErrors.length)
    result.failures.push(
      `${result.pageErrors.length} pageerror(s): ${result.pageErrors
        .map((error) => error.message)
        .slice(0, 3)
        .join(" | ")}`,
    );
  if (result.consoleErrors.length)
    result.failures.push(
      `${result.consoleErrors.length} console error(s): ${result.consoleErrors
        .map((error) => error.text)
        .slice(0, 3)
        .join(" | ")}`,
    );
  if (result.cspViolations.length)
    result.failures.push(
      `${result.cspViolations.length} CSP violation(s): ${result.cspViolations
        .map(
          (violation) =>
            `${violation.violatedDirective ?? "unknown"} ${violation.blockedURI ?? ""}`.trim(),
        )
        .slice(0, 3)
        .join(" | ")}`,
    );

  if (target.requireMarker) {
    if ((result.metrics?.markerCount ?? 0) < 1)
      result.failures.push(
        `stable marker "${marker}" not found in rendered text`,
      );
    if ((result.metrics?.textLength ?? 0) < 500)
      result.failures.push(
        `rendered text length ${result.metrics?.textLength ?? 0} (expected >= 500)`,
      );
    if ((result.metrics?.widgets ?? 0) < 1)
      result.failures.push("no authored [data-widget]/[data-island] sections");
    if ((result.metrics?.images ?? 0) < 1)
      result.failures.push("no visible image");
    if ((result.metrics?.h1?.length ?? 0) < 1)
      result.failures.push("no rendered h1");
  } else if ((result.metrics?.textLength ?? 0) < 100) {
    result.failures.push(
      `rendered text length ${result.metrics?.textLength ?? 0} (expected >= 100)`,
    );
  }

  result.ok = result.failures.length === 0;
  await context.close();
  return result;
}

const md = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  return `\`${String(value).replace(/\|/g, "\\|").replace(/\n/g, " ")}\``;
};
const mdText = (value) => String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");

function renderMarkdown(summary) {
  const lines = [];
  lines.push(`# Live visual verification — ${summary.baseUrl}`);
  lines.push("");
  lines.push(`- **Run:** ${summary.startedAt} → ${summary.finishedAt}`);
  lines.push(`- **Result:** ${summary.ok ? "PASS" : "FAIL"}`);
  lines.push(`- **Route:** \`${summary.route.path}\` (from \`${summary.route.source}\`)`);
  lines.push(
    `- **Origins:** preview \`${summary.baseUrl}\` · storefront \`${summary.storeBaseUrl}\``,
  );
  lines.push(
    `- **Theme:** ${summary.theme.name} (\`${summary.theme.key}\`), marker \`${summary.theme.marker}\` from \`${summary.theme.markerSource}\``,
  );
  lines.push(
    `- **Keys:** ${summary.check1.total} (${summary.check1.keys.filter((key) => key.kind === "template").length} template + ${summary.check1.keys.filter((key) => key.kind === "variant").length} variant), derived from \`${summary.keysSource}\``,
  );
  lines.push(`- **Screenshots:** \`screenshots/\``);
  lines.push("");

  lines.push(`## CHECK 1 — theme-preview keys (${summary.check1.passed}/${summary.check1.total} passed)`);
  lines.push("");
  lines.push(
    "| key | kind | HTTP | response nonce | meta[name] | meta[property] | script nonce | CSP nonce | result |",
  );
  lines.push(
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const key of summary.check1.keys) {
    lines.push(
      `| ${mdText(key.key)} | ${key.kind} | ${key.status ?? "ERR"} | ${md(key.nonceHeader ?? key.cspNonce)} | ${md(key.nameMeta)} | ${md(key.propertyMeta)} | ${md(key.scriptNonces.join(", "))} | ${md(key.cspNonce)} | ${key.ok ? "PASS" : `FAIL: ${mdText(key.failures.join("; "))}`} |`,
    );
  }
  lines.push("");

  lines.push(`## CHECK 2 — browser surfaces (${summary.check2.passed}/${summary.check2.total} passed)`);
  lines.push("");
  lines.push(
    "| surface | width | HTTP | final URL | text | widgets | images | console | CSP | screenshot | result |",
  );
  lines.push(
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const target of summary.check2.targets) {
    const metrics = target.metrics ?? {};
    lines.push(
      `| ${mdText(target.name)} | ${target.width} | ${target.status ?? "ERR"} | ${mdText(target.finalUrl ?? "—")} | ${metrics.textLength ?? 0} | ${metrics.widgets ?? 0} | ${metrics.images ?? 0} | ${target.consoleErrors.length} | ${target.cspViolations.length} | [\`${target.screenshot}\`](${target.screenshot}) | ${target.ok ? "PASS" : `FAIL: ${mdText(target.failures.join("; "))}`} |`,
    );
  }
  lines.push("");

  lines.push(`## Failures (${summary.failures.length})`);
  lines.push("");
  if (summary.failures.length === 0) {
    lines.push("None.");
  } else {
    for (const failure of summary.failures) lines.push(`- ${failure}`);
  }
  lines.push("");

  const missingHeaders = summary.check1.keys.filter(
    (key) => !key.nonceHeader && key.noncesConsistent,
  ).length;
  if (missingHeaders > 0) {
    lines.push("## Notes");
    lines.push("");
    lines.push(
      `${missingHeaders}/${summary.check1.total} documents matched the CSP response-header nonce, \`meta[name="csp-nonce"]\`, \`meta[property="csp-nonce"]\` and every script nonce. The separate \`x-csp-nonce\` response header is not emitted (\`src/server.ts\` sets it on the REQUEST for SSR); when a deployment does emit it, CHECK 1 additionally requires equality.`,
    );
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function writeSummary() {
  const finishedAt = new Date();
  const summaryFailures = [...failures];
  const ok =
    setupErrors.length === 0 &&
    summaryFailures.length === 0 &&
    check1.passed === check1.total &&
    check2.passed === check2.total &&
    check2.total > 0;

  const summary = {
    schemaVersion: 1,
    startedAt: RUN_STARTED.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - RUN_STARTED.getTime(),
    baseUrl: BASE_URL,
    storeBaseUrl: STORE_BASE_URL,
    outDir: OUT_DIR,
    ok,
    route: setup
      ? {
          template: setup.routeTemplate,
          path: setup.routePath,
          source: SOURCE_FILES.route,
        }
      : { template: null, path: null, source: SOURCE_FILES.route },
    theme: setup
      ? {
          key: setup.theme.key,
          name: setup.theme.name,
          author: setup.theme.author,
          marker: setup.theme.marker,
          markerSource: setup.theme.previewSource,
        }
      : null,
    keysSource: `${SOURCE_FILES.templateKeys} (TEMPLATE_KEYS) + ${SOURCE_FILES.templateVariants} (TEMPLATE_VARIANTS)`,
    nonceHeader: "content-security-policy (authoritative); x-csp-nonce (optional)",
    setupErrors,
    check1,
    check2,
    failures: summaryFailures,
  };

  writeFileSync(
    join(OUT_DIR, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  writeFileSync(join(OUT_DIR, "summary.md"), renderMarkdown(summary));

  console.log(`\nScreenshots: ${SHOT_DIR}`);
  console.log(`Summary:    ${join(OUT_DIR, "summary.md")}`);
  console.log(`JSON:       ${join(OUT_DIR, "summary.json")}`);
  if (summaryFailures.length > 0) {
    console.error(`\nLive visual verification FAILED — ${summaryFailures.length} failure(s):`);
    for (const failure of summaryFailures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(
      `\nLive visual verification PASSED — ${check1.passed}/${check1.total} preview keys, ${check2.passed}/${check2.total} browser surfaces.`,
    );
  }
}

try {
  setup = loadSetup();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  setupErrors.push(`setup: ${message}`);
  failures.push(`setup: ${message}`);
  console.error(`\nSETUP FAILED: ${message}`);
}

if (setup) {
  await runCheck1(setup);
  await runCheck2(setup);
}

writeSummary();
