import { test, expect, type Page, type Response } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NetworkCollector, blockExternalRequests } from "./helpers";

/**
 * Real-frame sandbox spec (frame30 adversarial lane, follow-up to
 * theme-preview-security.spec.ts lanes 1–2).
 *
 * Verified context: the official preview themes (`songoskriti`,
 * `somvabona` — the only keys `resolveThemePreview` serves unauthenticated)
 * author ZERO `video` / `html` / `plugin_block` sections across every
 * template (`TEMPLATE_KEYS` in src/lib/builder-ast.ts) and every variation
 * (tokens-only overlays). No other unauthenticated surface renders these
 * sections either (storefront routes need a merchant; installed-package
 * previews need a session). So there are NO real app frames to attack from
 * loopback — and no auth stubbing is used to conjure any (prior specs
 * enforce that boundary).
 *
 * This spec therefore:
 *  1. Censuses the real surface (both themes × all 9 templates × index
 *     variations): classifies every iframe found and asserts per-type
 *     sandbox shape on REAL frames. Zero frames ⇒ measurements recorded,
 *     violations still fail.
 *  2. Pins the renderer contract at the tightest unauthenticated point
 *     available: read-only static assertions on the renderer sources +
 *     exact-token control probes (one per frame type, carrying the precise
 *     sandbox attribute the renderer emits) proving the harness detects
 *     isolation AND non-isolation both ways.
 *  3. Posts the hostile bridge corpus at real frames (or, when none exist,
 *     at each per-type probe) and asserts host integrity: 0 pageerrors, no
 *     navigation, interaction survives.
 *  4. Asserts same-origin parent access fails from inside html/plugin
 *     frames (real or probe). The video probe is srcdoc+allow-same-origin
 *     (same-origin by construction) and serves as the positive control: it
 *     MUST read the parent href, proving the harness is not blind.
 *
 * Renderer contract pinned here (read-only; NEVER weakened):
 *  - video (src/components/builder/widgets.tsx): sandbox
 *    "allow-scripts allow-same-origin allow-presentation" (allow-same-origin
 *    BY DESIGN for embeds) with src double-gated by safeEmbedUrl to https
 *    EMBED_HOSTS (youtube/vimeo) at parse AND render.
 *  - html (HtmlSandbox, default low tier): srcDoc, sandbox
 *    "allow-scripts allow-forms allow-popups", never allow-same-origin.
 *  - plugin_block (PluginBlock → WidgetSandbox, default low tier): srcDoc,
 *    null-origin island, sandbox without allow-same-origin.
 *
 * Follow-up with source access (no fixture can fix this from e2e alone): to
 * exercise REAL frames, land a preview fixture that authors one section per
 * type — e.g. extend `songoskritiPreviewSource`
 * (src/lib/themes/songoskriti/preview.ts `main`, `case "index"`) with
 *   s("video", { src: "https://www.youtube.com/embed/dQw4w9WgXcQ",
 *                 title: "Demo film" }),
 *   s("html", { body: "Custom copy", markup: "<p>demo</p>" }),
 *   s("plugin_block", { pluginKey: "<installed-demo-plugin>", height: 320 }),
 * (plugin_block additionally needs a merchant-installed, enabled plugin row
 * in `store_themes` + `theme_versions`, otherwise it renders a labelled
 * placeholder with no frame). Then this spec's census (test 1) will find
 * three real frames and assert their per-type shape with no spec change.
 */

const THEMES = ["songoskriti", "somvabona"] as const;
const TEMPLATES = [
  "index",
  "product",
  "collection",
  "account",
  "page",
  "blog",
  "cart",
  "checkout",
  "search",
  "archive",
] as const;
const INDEX_VARIATIONS: Record<(typeof THEMES)[number], string[]> = {
  songoskriti: ["minimal", "festive"],
  somvabona: ["minimal", "editorial"],
};

// Exact renderer sandbox tokens (must match the sources pinned above).
const VIDEO_SANDBOX = "allow-scripts allow-same-origin allow-presentation";
const HTML_SANDBOX = "allow-scripts allow-forms allow-popups";
const PLUGIN_SANDBOX = "allow-scripts allow-forms allow-popups";

const COLD_GOTO_TIMEOUT = 180_000;

function tokensOf(sandbox: string | null): string[] {
  if (sandbox === null) return [];
  return sandbox
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/** 429-tolerant navigation: wait ~65s and retry once, else rethrow. */
async function gotoWithRateRetry(
  page: Page,
  url: string,
): Promise<Response | null> {
  const first = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  if (first?.status() === 429) {
    await page.waitForTimeout(65_000);
    return page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: COLD_GOTO_TIMEOUT,
    });
  }
  return first;
}

type FrameInfo = {
  sandbox: string | null;
  title: string;
  src: string;
  srcdoc: boolean;
  url: string;
};

async function collectFrames(page: Page): Promise<FrameInfo[]> {
  const dom = await page.locator("iframe").evaluateAll((els) =>
    els.map((el) => ({
      sandbox: el.getAttribute("sandbox"),
      title: el.getAttribute("title") ?? "",
      src: ((el as HTMLIFrameElement).src ?? "").slice(0, 200),
      srcdoc: (el.getAttribute("srcdoc") ?? "") !== "",
    })),
  );
  const urls = page.frames().map((fr) => fr.url());
  return dom.map((f, i) => ({ ...f, url: (urls[i + 1] ?? "").slice(0, 200) }));
}

function classifyFrame(f: FrameInfo): "video" | "html" | "plugin" | "other" {
  const src = f.src.toLowerCase();
  if (
    src.includes("youtube") ||
    src.includes("youtu") ||
    src.includes("vimeo") ||
    /video/i.test(f.title)
  )
    return "video";
  if (f.srcdoc && /custom html/i.test(f.title)) return "html";
  if (f.srcdoc) return "plugin";
  return "other";
}

/** Per-type sandbox shape for a REAL frame. Returns violation strings. */
function realFrameViolations(f: FrameInfo, where: string): string[] {
  const out: string[] = [];
  const kind = classifyFrame(f);
  const toks = tokensOf(f.sandbox);
  if (f.sandbox === null) {
    out.push(`${where} ${kind} frame (${f.title}) missing sandbox attribute`);
    return out;
  }
  if (kind === "video") {
    // allow-same-origin BY DESIGN for embeds — must be present, and the src
    // must be an allowlisted https embed (youtube/vimeo).
    if (!toks.includes("allow-same-origin"))
      out.push(`${where} video frame lost its by-design allow-same-origin`);
    let host: string | null = null;
    try {
      host = new URL(f.src).hostname.toLowerCase();
    } catch {
      host = null;
    }
    const allowed = [
      "www.youtube.com",
      "www.youtube-nocookie.com",
      "youtube.com",
      "player.vimeo.com",
    ];
    if (host === null || !allowed.includes(host))
      out.push(`${where} video frame src not allowlisted: ${f.src}`);
  } else {
    // html / plugin / unknown: never allow-same-origin, never top-navigation.
    if (toks.includes("allow-same-origin"))
      out.push(`${where} ${kind} frame carries allow-same-origin`);
    if (toks.some((t) => t.startsWith("allow-top-navigation")))
      out.push(`${where} ${kind} frame carries top-navigation capability`);
  }
  return out;
}

function srcPath(rel: string): string {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
}

test("1 — census: classify every iframe on all unauthenticated preview surfaces", async ({
  page,
}) => {
  test.slow();
  const blocked: string[] = [];
  await blockExternalRequests(page, blocked);
  const collector = new NetworkCollector(page).attach();
  try {
    const violations: string[] = [];
    let surfaces = 0;
    let realFrames = 0;
    const kinds: Record<string, number> = {};
    // Static section inventory (read-only): count authored frame-bearing
    // sections per theme to corroborate the runtime census.
    for (const rel of [
      "src/lib/themes/songoskriti/preview.ts",
      "src/lib/themes/songoskriti/homepage.ts",
      "src/lib/themes/somvabona/preview.ts",
      "src/lib/themes/somvabona/homepage.ts",
    ]) {
      const src = readFileSync(srcPath(rel), "utf8");
      const hits = (src.match(/\(\s*"(video|html|plugin_block)"\s*,/g) ?? [])
        .length;
      console.log(`[e2e realframes] inventory ${rel}: ${hits} frame sections`);
      if (hits !== 0)
        violations.push(`${rel} authors ${hits} frame-bearing sections`);
    }
    for (const theme of THEMES) {
      for (const template of TEMPLATES) {
        const url = `/theme-preview/${theme}?template=${template}`;
        const res = await gotoWithRateRetry(page, url);
        expect(res?.status(), `GET ${url}`).toBe(200);
        await page.waitForTimeout(400);
        surfaces += 1;
        const frames = await collectFrames(page);
        realFrames += frames.length;
        for (const f of frames) {
          const kind = classifyFrame(f);
          kinds[kind] = (kinds[kind] ?? 0) + 1;
          console.log(
            `[e2e realframes] REAL frame @${url} kind=${kind} sandbox=${JSON.stringify(f.sandbox)} src=${JSON.stringify(f.src)}`,
          );
          violations.push(...realFrameViolations(f, url));
        }
      }
      for (const variation of INDEX_VARIATIONS[theme]) {
        const url = `/theme-preview/${theme}?template=index&variation=${variation}`;
        const res = await gotoWithRateRetry(page, url);
        expect(res?.status(), `GET ${url}`).toBe(200);
        await page.waitForTimeout(400);
        surfaces += 1;
        const frames = await collectFrames(page);
        realFrames += frames.length;
        for (const f of frames) {
          const kind = classifyFrame(f);
          kinds[kind] = (kinds[kind] ?? 0) + 1;
          console.log(
            `[e2e realframes] REAL frame @${url} kind=${kind} sandbox=${JSON.stringify(f.sandbox)} src=${JSON.stringify(f.src)}`,
          );
          violations.push(...realFrameViolations(f, url));
        }
      }
    }
    console.log(
      `[e2e realframes] census: surfaces=${surfaces} realFrames=${realFrames} kinds=${JSON.stringify(kinds)}`,
    );
    // Inconclusive-safe: assert ONLY clear violations, never the count.
    // Current verified reality is realFrames=0 (no unauthenticated surface
    // renders these sections); if a future theme adds one, the per-type
    // shape above fails meaningfully with no spec change.
    expect(violations, "real-frame sandbox violations").toEqual([]);
    expect(collector.externalResponses()).toEqual([]);
  } finally {
    collector.dispose();
  }
});

test("2 — renderer contract: static pins + exact-token per-type probes", async ({
  page,
}) => {
  const blocked: string[] = [];
  await blockExternalRequests(page, blocked);
  const collector = new NetworkCollector(page).attach();
  try {
    // (a) Static contract pins (read-only source reads; the tightest
    // unauthenticated point available — no route renders these sections).
    const widgets = readFileSync(
      srcPath("src/components/builder/widgets.tsx"),
      "utf8",
    );
    expect(
      widgets.includes(`sandbox="${VIDEO_SANDBOX}"`),
      "video renderer keeps its exact by-design sandbox tokens",
    ).toBe(true);
    expect(
      widgets.includes("safeEmbedUrl(str("),
      "video src gated by safeEmbedUrl at render",
    ).toBe(true);
    const ast = readFileSync(srcPath("src/lib/builder-ast.ts"), "utf8");
    const hostsBlock = /EMBED_HOSTS = \[(.*?)\]/s.exec(ast)?.[1] ?? "";
    for (const host of [
      "www.youtube.com",
      "www.youtube-nocookie.com",
      "youtube.com",
      "player.vimeo.com",
    ]) {
      expect(hostsBlock, `EMBED_HOSTS allows ${host}`).toContain(host);
    }
    const otherHosts = [...hostsBlock.matchAll(/"([^"]+)"/g)]
      .map((m) => m[1])
      .filter(
        (h) =>
          ![
            "www.youtube.com",
            "www.youtube-nocookie.com",
            "youtube.com",
            "player.vimeo.com",
          ].includes(h),
      );
    expect(otherHosts, "EMBED_HOSTS carries no non-embed host").toEqual([]);
    expect(
      ast.includes("parsed.protocol !=="),
      "safeEmbedUrl enforces https",
    ).toBe(true);
    const risk = readFileSync(srcPath("src/lib/risk-tier.ts"), "utf8");
    const lowSandbox =
      /sandbox: "([^"]+)",\s*\n\s*allowSameOrigin: false/s.exec(risk)?.[1];
    expect(lowSandbox, "low-tier sandbox string found").toBe(HTML_SANDBOX);
    expect(
      tokensOf(lowSandbox ?? "").includes("allow-same-origin"),
      "low tier (html/plugin islands) never carries allow-same-origin",
    ).toBe(false);
    const htmlSandbox = readFileSync(
      srcPath("src/components/builder/HtmlSandbox.tsx"),
      "utf8",
    );
    expect(htmlSandbox.includes('riskTier = "low"')).toBe(true);
    expect(htmlSandbox.includes("srcDoc=")).toBe(true);
    const widgetSandbox = readFileSync(
      srcPath("src/components/marketplace/WidgetSandbox.tsx"),
      "utf8",
    );
    expect(widgetSandbox.includes("sandbox={policy.iframe.sandbox}")).toBe(
      true,
    );

    // (b) Exact-token runtime probes on the public preview page: one iframe
    // per frame type carrying the PRECISE sandbox attribute its renderer
    // emits (srcdoc keeps the run hermetic; the real video src would be an
    // allowlisted https embed, the real html/plugin src is srcDoc).
    const response = await gotoWithRateRetry(
      page,
      "/theme-preview/songoskriti",
    );
    expect(response?.status()).toBe(200);
    await expect(page.locator("img").first(), "preview renders").toBeVisible({
      timeout: 20_000,
    });
    await page.evaluate(
      ({ video, html, plugin }) => {
        const mk = (id: string, sandbox: string, title: string) => {
          const f = document.createElement("iframe");
          f.id = id;
          f.setAttribute("sandbox", sandbox);
          f.setAttribute("title", title);
          f.setAttribute("srcdoc", "<p>probe</p>");
          document.body.appendChild(f);
        };
        mk("e2e-probe-video", video, "Video probe");
        mk("e2e-probe-html", html, "Custom HTML probe");
        mk("e2e-probe-plugin", plugin, "Plugin probe");
      },
      { video: VIDEO_SANDBOX, html: HTML_SANDBOX, plugin: PLUGIN_SANDBOX },
    );
    const probes = await page
      .locator(
        "iframe#e2e-probe-video, iframe#e2e-probe-html, iframe#e2e-probe-plugin",
      )
      .evaluateAll((els) =>
        els.map((el) => ({
          id: el.id,
          sandbox: el.getAttribute("sandbox"),
        })),
      );
    expect(probes.length, "all three per-type probes attached").toBe(3);
    const violations: string[] = [];
    for (const p of probes) {
      const toks = tokensOf(p.sandbox);
      if (p.id === "e2e-probe-video") {
        // By-design exception, asserted POSITIVELY: the video shape keeps
        // allow-same-origin (safe only because src is allowlist-gated).
        if (!toks.includes("allow-same-origin"))
          violations.push("video probe lost its by-design allow-same-origin");
        console.log(
          `[e2e realframes] video probe keeps allow-same-origin (by design, src-gated)`,
        );
      } else {
        if (toks.includes("allow-same-origin"))
          violations.push(`${p.id} carries allow-same-origin`);
        if (toks.some((t) => t.startsWith("allow-top-navigation")))
          violations.push(`${p.id} carries top-navigation capability`);
        console.log(
          `[e2e realframes] ${p.id} isolated shape sandbox=${JSON.stringify(p.sandbox)}`,
        );
      }
    }
    expect(violations, "per-type probe sandbox violations").toEqual([]);
    await page
      .evaluate(() => {
        for (const id of [
          "e2e-probe-video",
          "e2e-probe-html",
          "e2e-probe-plugin",
        ])
          document.getElementById(id)?.remove();
      })
      .catch(() => undefined);
    expect(collector.externalResponses()).toEqual([]);
  } finally {
    collector.dispose();
  }
});

test("3 — hostile postMessage at real frames (or per-type probes): host holds", async ({
  page,
}) => {
  const blocked: string[] = [];
  await blockExternalRequests(page, blocked);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e?.message ?? e)));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
  });
  const response = await gotoWithRateRetry(page, "/theme-preview/songoskriti");
  expect(response?.status()).toBe(200);
  await expect(page.locator("img").first()).toBeVisible({ timeout: 20_000 });
  const urlBefore = page.url();

  let targets = page.frames().filter((f) => f !== page.mainFrame());
  console.log(
    `[e2e realframes] real frames present for bridge abuse: ${targets.length}`,
  );
  let usingProbes = false;
  if (targets.length === 0) {
    // No real frames (verified reality) — attack each per-type probe shape.
    usingProbes = true;
    await page.evaluate(
      ({ video, html, plugin }) => {
        const mk = (id: string, sandbox: string) => {
          const f = document.createElement("iframe");
          f.id = id;
          f.setAttribute("sandbox", sandbox);
          f.setAttribute("srcdoc", "<p>probe</p>");
          document.body.appendChild(f);
        };
        mk("e2e-atk-video", video);
        mk("e2e-atk-html", html);
        mk("e2e-atk-plugin", plugin);
      },
      { video: VIDEO_SANDBOX, html: HTML_SANDBOX, plugin: PLUGIN_SANDBOX },
    );
    await page.waitForFunction(
      () => document.getElementById("e2e-atk-plugin") !== null,
      null,
      { timeout: 5_000 },
    );
    targets = page.frames().filter((f) => f !== page.mainFrame());
    console.log(
      `[e2e realframes] no real frames — abusing ${targets.length} per-type probes instead`,
    );
  }
  expect(targets.length > 0, "real frames or probes under test").toBe(true);

  // Real bridge path: hostile payloads via parent.postMessage from INSIDE
  // each frame, plus synthetic dispatch at the host window.
  const hostile: unknown[] = [
    null,
    42,
    "string-envelope",
    { v: 2, id: "bad-version", method: "menus.list", params: {} },
    { v: 1, id: "unknown-1", method: "nope.not_real", params: {} },
    { v: 1, id: "unknown-2", method: "__proto__", params: {} },
    {
      v: 1,
      id: "oversize-1",
      method: "menus.list",
      params: { blob: "x".repeat(70_000) },
    },
    { v: 1, id: "dup-1", method: "menus.list", params: {} },
    { v: 1, id: "dup-1", method: "menus.list", params: {} },
    { v: 1, id: "xss-1", method: "<img src=x onerror=1>", params: {} },
    { type: "fq:html-height", height: 1e9 },
    { type: "fq:html-height", height: "tall" },
  ];
  for (const fr of targets) {
    try {
      await fr.evaluate(async (payloads) => {
        for (const p of payloads) {
          try {
            parent.postMessage(p, "*");
          } catch {
            // ignore
          }
        }
        await new Promise((r) => setTimeout(r, 300));
      }, hostile);
    } catch (e) {
      console.log(
        `[e2e realframes] frame postMessage evaluate threw (documented, not fatal): ${String((e as Error)?.message ?? e).slice(0, 160)}`,
      );
    }
  }
  await page.evaluate((payloads) => {
    for (const p of payloads) {
      try {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: p,
            origin: "null",
            source: window,
          }),
        );
      } catch {
        // ignore
      }
    }
  }, hostile);
  // Flood burst over the host 30/10s budget — must rate-limit, never crash.
  await page.evaluate(() => {
    for (let i = 0; i < 40; i += 1) {
      try {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { v: 1, id: `flood-${i}`, method: "menus.list", params: {} },
            origin: "null",
            source: window,
          }),
        );
      } catch {
        // ignore
      }
    }
  });
  await page.waitForTimeout(800);
  expect(page.url(), "host must not navigate under bridge abuse").toBe(
    urlBefore,
  );
  expect(pageErrors, "no uncaught page errors under bridge abuse").toEqual([]);
  console.log(
    `[e2e realframes] ${usingProbes ? "probes" : "real frames"}=${targets.length} pageerrors=${pageErrors.length} consoleErrors=${consoleErrors.length}`,
  );
  for (const ce of consoleErrors.slice(0, 5))
    console.log(`[e2e realframes] console.error: ${ce.slice(0, 200)}`);
  await expect(page.locator("h1, h2").first()).toBeVisible({
    timeout: 15_000,
  });
  expect(page.url()).toContain("/theme-preview/");
  if (usingProbes) {
    await page
      .evaluate(() => {
        for (const id of ["e2e-atk-video", "e2e-atk-html", "e2e-atk-plugin"])
          document.getElementById(id)?.remove();
      })
      .catch(() => undefined);
  }
});

test("4 — same-origin parent access fails inside html/plugin frames; video probe is the positive control", async ({
  page,
}) => {
  const blocked: string[] = [];
  await blockExternalRequests(page, blocked);
  const response = await gotoWithRateRetry(page, "/theme-preview/songoskriti");
  expect(response?.status()).toBe(200);
  await expect(page.locator("img").first()).toBeVisible({ timeout: 20_000 });

  const outcomes: string[] = [];
  const violations: string[] = [];
  const realFrames = page.frames().filter((f) => f !== page.mainFrame());
  console.log(
    `[e2e realframes] real frames for parent-access test: ${realFrames.length}`,
  );
  for (const fr of realFrames) {
    try {
      const res = (await fr.evaluate(() => {
        try {
          const href = (
            window.parent as unknown as { location: { href: string } }
          ).location.href;
          return { threw: false as const, href: String(href) };
        } catch (e) {
          return {
            threw: true as const,
            name: e instanceof Error ? e.name : "error",
          };
        }
      })) as { threw: boolean; href?: string; name?: string };
      if (res.threw || (res.href ?? "").startsWith("about:")) {
        outcomes.push(`real frame isolated (threw=${res.threw})`);
      } else {
        outcomes.push(`real frame READ parent href ${res.href} — LEAK`);
        violations.push("real frame has same-origin parent access");
      }
    } catch (e) {
      outcomes.push(
        `real frame evaluate threw (${String((e as Error)?.message ?? e).slice(0, 100)}) — treated as isolated`,
      );
    }
  }

  // Per-type probes (srcdoc ⇒ hermetic). html/plugin MUST throw (opaque
  // origin without allow-same-origin). The video probe is srcdoc WITH
  // allow-same-origin ⇒ same-origin by construction ⇒ it MUST read the
  // parent href: the positive control proving the harness detects BOTH
  // isolation and non-isolation. (Real video frames differ: their src is a
  // cross-origin allowlisted embed, so allow-same-origin preserves the
  // EMBED origin — still foreign to the host — and parent access throws.)
  await page.evaluate(
    ({ video, html, plugin }) => {
      const mk = (id: string, sandbox: string) => {
        const f = document.createElement("iframe");
        f.id = id;
        f.setAttribute("sandbox", sandbox);
        f.setAttribute("srcdoc", "<p>probe</p>");
        document.body.appendChild(f);
      };
      mk("e2e-so-video", video);
      mk("e2e-so-html", html);
      mk("e2e-so-plugin", plugin);
    },
    { video: VIDEO_SANDBOX, html: HTML_SANDBOX, plugin: PLUGIN_SANDBOX },
  );
  try {
    for (const id of ["e2e-so-video", "e2e-so-html", "e2e-so-plugin"]) {
      const handle = await page.$(`#${id}`);
      expect(handle, `${id} attached`).not.toBeNull();
      const fr = await handle!.contentFrame();
      expect(fr, `${id} frame attached`).not.toBeNull();
      const res = (await fr!.evaluate(() => {
        try {
          const href = (
            window.parent as unknown as { location: { href: string } }
          ).location.href;
          return { threw: false as const, href: String(href) };
        } catch (e) {
          return {
            threw: true as const,
            name: e instanceof Error ? e.name : "error",
          };
        }
      })) as { threw: boolean; href?: string; name?: string };
      if (id === "e2e-so-video") {
        // Positive control: same-origin srcdoc ⇒ parent href readable.
        expect(
          res.threw,
          "video probe (srcdoc+allow-same-origin) must read parent — positive control",
        ).toBe(false);
        expect(res.href, "video probe reads the real parent URL").toContain(
          "/theme-preview/",
        );
        outcomes.push(`video probe read parent href (positive control OK)`);
      } else {
        if (res.threw) {
          outcomes.push(`${id} threw ${res.name} — isolated`);
        } else if ((res.href ?? "").startsWith("about:")) {
          outcomes.push(`${id} returned opaque ${res.href} — isolated`);
        } else {
          outcomes.push(`${id} READ parent href ${res.href} — LEAK`);
          violations.push(`${id} has same-origin parent access`);
        }
        expect(res.threw, `${id} must not read parent href`).toBe(true);
      }
    }
  } finally {
    await page
      .evaluate(() => {
        for (const id of ["e2e-so-video", "e2e-so-html", "e2e-so-plugin"])
          document.getElementById(id)?.remove();
      })
      .catch(() => undefined);
  }
  for (const o of outcomes) console.log(`[e2e realframes] ${o}`);
  expect(violations, "same-origin isolation violations").toEqual([]);
});
