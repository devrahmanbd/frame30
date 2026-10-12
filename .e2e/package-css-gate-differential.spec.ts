import { test, expect, type Page } from "@playwright/test";
import { NetworkCollector, blockExternalRequests } from "./helpers";
import { gatePackageCss } from "../src/lib/package-css-gate";

/**
 * Package-CSS-gate browser differential (frame30).
 *
 * The gate (`src/lib/package-css-gate.ts`) is a string/regex parser whose
 * verdict must match what a real browser interprets. This spec closes the
 * loop: every stylesheet the gate PASSES is injected as a `<style>` element
 * into a blank harness page built HERE (about:blank + setContent — no app
 * surface is ever navigated), and Chromium itself is asked what happened:
 *
 * - computed styles must match the gate's model (scope prefixing, :root
 *   mapping, token-use allowed, bare fixed dropped, opt-in fixed kept,
 *   @media honored);
 * - zero non-loopback responses (externals are blocked before the network;
 *   any completed external response fails);
 * - window.__pwned stays undefined (in particular: scripts smuggled inside a
 *   gate-allowed data:image/svg+xml background are inert image context).
 *
 * Hostile parser-differential vectors (CSS escapes, comment-split tokens,
 * escaped/dropped at-rule wrappers) must be gate-REJECTED: they never reach
 * the DOM. Any vector the gate passes here is a gate bug — the fix belongs
 * in the gate (reject ambiguous inputs), never in this spec.
 */

const PWNED = "__pwned";

function harness(css: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="pkg-scope" id="scope"><p id="in-probe" class="probe">in</p><div id="box" class="box">box</div><p id="fixed-probe" class="fq-allow-fixed">fixed</p></div><p id="out-probe" class="probe">out</p></body></html>`;
}

async function styledPage(
  page: Page,
  css: string,
): Promise<{ collector: NetworkCollector; blocked: string[] }> {
  const blocked: string[] = [];
  await blockExternalRequests(page, blocked);
  const collector = new NetworkCollector(page).attach();
  await page.goto("about:blank");
  await page.setContent(harness(css));
  return { collector, blocked };
}

async function computed(
  page: Page,
  sel: string,
  prop: string,
): Promise<string> {
  return page
    .locator(sel)
    .evaluate(
      (el, p) => getComputedStyle(el as Element).getPropertyValue(p),
      prop,
    );
}

async function pwned(page: Page): Promise<unknown> {
  return page.evaluate(
    (key) => (window as unknown as Record<string, unknown>)[key] ?? null,
    PWNED,
  );
}

test.afterAll(() => {
  // This file opens no servers/handles of its own; per-test collectors are
  // disposed inside each test. Nothing global to clean up.
});

test("1 — gate-passed theme CSS renders exactly as the gate models", async ({
  page,
}) => {
  const r = gatePackageCss(
    `.probe{color:rgb(255,0,0);margin-top:11px}.box{background-color:rgb(0,0,255)}`,
  );
  expect(r.ok, `benign battery must pass: ${r.errors}`).toBe(true);
  const css = r.sanitizedCss ?? "";
  // The gate's model, in its own output: everything namespaced under the
  // scope class, declarations normalized.
  expect(css).toContain(".pkg-scope .probe");
  expect(css).toContain(".pkg-scope .box");
  const { collector, blocked } = await styledPage(page, css);
  try {
    expect(await computed(page, "#in-probe", "color")).toBe("rgb(255, 0, 0)");
    expect(await computed(page, "#in-probe", "margin-top")).toBe("11px");
    expect(await computed(page, "#box", "background-color")).toBe(
      "rgb(0, 0, 255)",
    );
    // Outside the scope element the same selectors must not apply.
    expect(await computed(page, "#out-probe", "color")).not.toBe(
      "rgb(255, 0, 0)",
    );
    // Token USE is allowed (read-only, never redefined): the fallback
    // renders because no token value is defined on the blank harness.
    const t = gatePackageCss(`a{color:var(--theme-ink, rgb(0, 128, 0))}`);
    expect(t.ok).toBe(true);
    await page.setContent(harness(t.sanitizedCss ?? ""));
    expect(await computed(page, "#in-probe", "color")).not.toBe(
      "rgb(0, 128, 0)",
    );
    const t2 = gatePackageCss(`.probe{color:var(--theme-ink, rgb(0, 128, 0))}`);
    expect(t2.ok).toBe(true);
    await page.setContent(harness(t2.sanitizedCss ?? ""));
    expect(await computed(page, "#in-probe", "color")).toBe("rgb(0, 128, 0)");
    // :root maps to the scope root: inside inherits, outside is unaffected.
    const z = gatePackageCss(`:root{color:rgb(0, 100, 0)}`);
    expect(z.ok).toBe(true);
    expect(z.sanitizedCss ?? "").not.toMatch(/(^|[\s,{]):root/);
    await page.setContent(harness(z.sanitizedCss ?? ""));
    expect(await computed(page, "#in-probe", "color")).toBe("rgb(0, 100, 0)");
    expect(await computed(page, "#out-probe", "color")).not.toBe(
      "rgb(0, 100, 0)",
    );
    expect(await pwned(page)).toBeNull();
    expect(blocked).toEqual([]);
    expect(collector.externalResponses()).toEqual([]);
  } finally {
    collector.dispose();
  }
});

test("2 — gate-allowed data: payloads cause no egress and no execution", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e?.message ?? e)));
  // Scripts inside an image-context SVG are inert by browser construction;
  // the gate's font/image data: allowlist intentionally covers svg+xml. The
  // payload is double-quoted (valid CSS): an unquoted url() containing quotes
  // is a browser parse error (declaration dropped — safe direction), while
  // the quoted form is genuinely loaded as an image, which is the differential
  // that matters here.
  const svg = gatePackageCss(
    `a{background:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><script>window.${PWNED}='svg-css'</script></svg>")}`,
  );
  expect(svg.ok, `svg+xml image must pass: ${svg.errors}`).toBe(true);
  const png = gatePackageCss(
    `.box{background:url(data:image/png;base64,iVBORw0KGgo=)}`,
  );
  expect(png.ok).toBe(true);
  const css = `${svg.sanitizedCss ?? ""}\n${png.sanitizedCss ?? ""}`;
  const { collector, blocked } = await styledPage(page, css);
  try {
    await page.waitForTimeout(500);
    // The browser really loaded the payloads as images …
    expect(await computed(page, "#box", "background-image")).toContain(
      "data:image/png",
    );
    // … and nothing executed.
    expect(await pwned(page), "window.__pwned stays undefined").toBeNull();
    expect(pageErrors).toEqual([]);
    expect(blocked).toEqual([]);
    expect(collector.externalResponses()).toEqual([]);
  } finally {
    collector.dispose();
  }
});

test("3 — escaped sanitize-shapes hold in a live browser", async ({ page }) => {
  // Escaped bare position:fixed is dropped (not merely renamed): the
  // declaration never reaches the cascade.
  const f = gatePackageCss(`a{p\\6f sition:fixed}`);
  expect(f.ok).toBe(true);
  expect(f.sanitizedCss ?? "").not.toMatch(/fixed/i);
  // Escaped --theme-* redefinition is dropped while siblings survive.
  const v = gatePackageCss(`a{--the\\6d e-ink:red;color:rgb(0,0,255)}`);
  expect(v.ok).toBe(true);
  expect(v.sanitizedCss ?? "").not.toContain("--theme-");
  // The opt-in class keeps (escaped) fixed positioning.
  const k = gatePackageCss(`.fq-allow-fixed{p\\6f sition:fixed}`);
  expect(k.ok).toBe(true);
  expect(k.sanitizedCss ?? "").toMatch(/fixed/i);
  // An escaped @media wrapper is honored AS media (the browser decodes the
  // prelude identically), with inner rules scoped.
  const m = gatePackageCss(
    `@\\6d edia (min-width: 100px){.probe{color:rgb(255,0,0)}}`,
  );
  expect(m.ok).toBe(true);
  expect(m.sanitizedCss ?? "").toContain(".pkg-scope .probe");
  const css = [f.sanitizedCss, v.sanitizedCss, k.sanitizedCss, m.sanitizedCss]
    .filter(Boolean)
    .join("\n");
  const { collector, blocked } = await styledPage(page, css);
  try {
    expect(await computed(page, "#in-probe", "position")).toBe("static");
    expect(await computed(page, "#in-probe", "color")).toBe("rgb(255, 0, 0)");
    expect(await computed(page, "#fixed-probe", "position")).toBe("fixed");
    expect(await pwned(page)).toBeNull();
    expect(blocked).toEqual([]);
    expect(collector.externalResponses()).toEqual([]);
  } finally {
    collector.dispose();
  }
});

test("4 — hostile parser-differential corpus is gate-rejected", async () => {
  // No browser feed: rejection IS the assertion. If any of these passes,
  // the gate disagrees with the browser tokenizer — a gate bug, fixed in
  // src/lib/package-css-gate.ts, never by weakening this list.
  const hostile: [string, string][] = [
    ["escaped javascript:", `a{background:url(\\6a avascript:alert(1))}`],
    [
      "escaped url( function",
      `a{background:\\75 rl(http://evil.example/x.png)}`,
    ],
    ["escaped expression()", `a{width:\\65 xpression(alert(1))}`],
    [
      "escaped @import",
      `@\\69mport url("https://evil.example/x.css");a{color:red}`,
    ],
    [
      "comment-split @import",
      `@/*x*/import url("https://evil.example/x.css");a{color:red}`,
    ],
    [
      "comment-split javascript:",
      `a{background:url(java/*x*/script:alert(1))}`,
    ],
    ["escaped data:", `a{background:url(\\64 ata:text/html,<b>)}`],
    ["escaped remote", `a{background:url(\\68 ttp://evil.example/x.png)}`],
    [
      "escaped protocol-relative",
      `a{background:url(\\2f \\2f evil.example/x.png)}`,
    ],
    ["escaped -moz-binding", `a{-\\6d oz-binding:url(x.xml#x)}`],
    ["escaped behavior:", `a{beh\\61 vior:url(x.htc)}`],
    [
      "hostile inside escaped @media",
      `@\\6d edia screen{a{background:url(http://evil.example/x.png)}}`,
    ],
    [
      "hostile inside dropped @page",
      `@page{a{background:url(http://evil.example/x.png)}}`,
    ],
    [
      "data:application/javascript",
      `a{background:url(data:application/javascript,alert(1))}`,
    ],
  ];
  const passed: string[] = [];
  for (const [name, css] of hostile) {
    const r = gatePackageCss(css);
    if (r.ok) passed.push(name);
    else expect(r.sanitizedCss).toBeUndefined();
  }
  expect(passed, "gate must reject every hostile vector").toEqual([]);
});

test("5 — whitespace-url allow-shape fetches nothing in the browser", async ({
  page,
}) => {
  // `url (` with a space is not a url token (CSS Syntax): Chrome drops the
  // declaration, so the gate's pass is not a differential — proven here by
  // computed style (none) plus zero egress.
  const r = gatePackageCss(`.box{background:url (http://evil.example/x.png)}`);
  expect(r.ok).toBe(true);
  const { collector, blocked } = await styledPage(page, r.sanitizedCss ?? "");
  try {
    await page.waitForTimeout(500);
    expect(await computed(page, "#box", "background-image")).toBe("none");
    expect(await pwned(page)).toBeNull();
    expect(blocked).toEqual([]);
    expect(collector.externalResponses()).toEqual([]);
  } finally {
    collector.dispose();
  }
});
