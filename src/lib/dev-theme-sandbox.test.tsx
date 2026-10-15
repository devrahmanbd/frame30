/**
 * Level B sandbox execution harness — TDD vectors.
 *
 * Proves the end-to-end claim: a bundled animation/3D-capable theme
 * (assembled through `assembleDevThemeBundle`, reviewed, published,
 * activation-bound) executes EXCLUSIVELY through the sandboxed `ThemeRuntime`
 * frame — version-pinned URL, `allow-scripts`-only sandboxing, restrictive
 * frame CSP — and never in the page DOM.
 *
 * The harness renders the host shell (`renderToStaticMarkup`, no window
 * needed) and asserts on the emitted iframe: the theme's own code (GSAP
 * timeline, Three.js scene) must be ABSENT from host HTML while the frame
 * URL carries the approved name+version.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assembleDevThemeBundle } from "./dev-theme-bundle-assemble";
import { createDevThemeReleaseStore } from "./dev-theme-review";
import { DEV_THEME_RUNTIME_VERSION } from "./dev-theme-manifest";
import {
  bindDevThemeRuntime,
  resolveDevThemeActivation,
} from "./dev-theme-activate";
import {
  THEME_SANDBOX,
  ThemeRuntime,
  buildThemeFrameUrl,
  themeFrameCSP,
} from "../components/theme-runtime/ThemeRuntime";

const ORIGIN = "https://themes.example-cdn.com";
const MOD = { id: "reviewer-1", role: "moderator" } as const;
const T0 = "2026-10-01T00:00:00.000Z";
const T1 = "2026-10-02T00:00:00.000Z";

const THREE_DEP = {
  name: "three",
  version: "0.186.1",
  license: "MIT",
  integrity:
    "sha512-blFeqb49wRCSGUGj7gtpfnSGHy2lwDk94RhUmS1c/hTby70kvChbWpkJ4Pm1390LqzzvTmzgXKHPEafJwCb8jA==",
};
const GSAP_DEP = {
  name: "gsap",
  version: "3.15.0",
  license: "MIT",
  integrity: "sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

function manifest() {
  return {
    id: "aurora-lookbook",
    version: "1.4.0",
    runtime: DEV_THEME_RUNTIME_VERSION,
    name: "Aurora Lookbook",
    publisher: "Studio Framique",
    capabilities: [
      "presentation",
      "animation",
      "webgl",
      "commerce-read",
      "cart-write",
    ],
    dependencies: [{ ...GSAP_DEP }, { ...THREE_DEP }],
    sections: [
      { key: "hero", slot: "main", component: "HeroCanvas" },
      { key: "webgl-scene", slot: "main", component: "WebglScene" },
    ],
    settings: [
      { key: "headline", label: "Headline", type: "text" },
      { key: "motion", label: "Motion", type: "animation" },
    ],
  };
}

const HERO_JS = `import { gsap } from "gsap";
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export function HeroCanvas(el, props) {
  if (reduce) { el.textContent = props.headline; return; }
  gsap.from(el, { opacity: 0, y: 24, duration: 0.6 });
}`;

const WEBGL_JS = `import * as THREE from "three";
export function WebglScene(el) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: el.querySelector("canvas"), antialias: true });
  } catch {
    el.querySelector("[data-fallback]").hidden = false;
    return;
  }
  renderer.render(new THREE.Scene(), new THREE.PerspectiveCamera());
}`;

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Assemble → submit → approve → publish → activate → bind. */
function boundRuntime() {
  const m = manifest();
  const assembled = assembleDevThemeBundle({
    manifestJson: m,
    files: [
      { path: "dev.theme.json", bytes: bytes(JSON.stringify(m)) },
      { path: "components/Hero.js", bytes: bytes(HERO_JS) },
      { path: "sections/webgl-scene.js", bytes: bytes(WEBGL_JS) },
      { path: "styles/main.css", bytes: bytes(".hero{color:red}") },
      {
        path: "locales/en.json",
        bytes: bytes(JSON.stringify({ headline: "Hello" })),
      },
      {
        path: "locales/bn.json",
        bytes: bytes(JSON.stringify({ headline: "হ্যালো" })),
      },
    ],
  });
  expect(assembled.ok).toBe(true);
  if (!assembled.ok) throw new Error("fixture bundle refused");
  const store = createDevThemeReleaseStore();
  const { release: submitted } = store.submit({
    merchantId: "seller-1",
    themeId: "aurora-lookbook",
    manifest: assembled.manifest,
    files: assembled.files,
    fingerprint: assembled.fingerprint,
    submittedBy: "dev-1",
    submittedAt: T0,
  });
  store.review({
    releaseId: submitted.id,
    merchantId: "seller-1",
    reviewer: { ...MOD },
    decision: "approve",
    reason: "animation budget + webgl fallback proof attached",
    reviewedAt: T1,
  });
  const { release } = store.publish({
    releaseId: submitted.id,
    merchantId: "seller-1",
    actor: { ...MOD },
    expectedFingerprint: assembled.fingerprint,
    publishedAt: T1,
  });
  const activation = resolveDevThemeActivation({
    release,
    expectedFingerprint: assembled.fingerprint,
    expectedThemeId: "aurora-lookbook",
  });
  return bindDevThemeRuntime(activation, { assetOrigin: ORIGIN });
}

describe("dev-theme sandbox harness — bundled animation/3D through the frame", () => {
  it("assembles an animation+webgl bundle with bn locale and a stable fingerprint", () => {
    const binding = boundRuntime();
    expect(binding.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(binding.granted).toEqual(
      expect.arrayContaining([
        "theme:storefront:read",
        "theme:variant:select",
        "theme:cart:add",
      ]),
    );
  });

  it("renders the approved theme through the ThemeRuntime iframe shell", () => {
    const binding = boundRuntime();
    const html = renderToStaticMarkup(
      createElement(ThemeRuntime, {
        title: "Aurora Lookbook",
        assetOrigin: binding.assetOrigin,
        theme: binding.theme,
        granted: binding.granted,
        navigateAllowlist: binding.navigateAllowlist,
        onCall: async () => ({ ok: true }),
      }),
    );
    expect(html).toContain("<iframe");
    expect(html).toContain(`${ORIGIN}/t/aurora-lookbook/1.4.0/index.html`);
    expect(html).toContain('sandbox="allow-scripts"');
  });

  it("grants scripts inside the frame and nothing else (no page-DOM execution)", () => {
    const binding = boundRuntime();
    const html = renderToStaticMarkup(
      createElement(ThemeRuntime, {
        title: "Aurora Lookbook",
        assetOrigin: binding.assetOrigin,
        theme: binding.theme,
        granted: binding.granted,
        navigateAllowlist: binding.navigateAllowlist,
        onCall: async () => ({ ok: true }),
      }),
    );
    expect(THEME_SANDBOX).toBe("allow-scripts");
    expect(html).not.toContain("allow-same-origin");
    expect(html).not.toContain("allow-top-navigation");
    expect(html).not.toContain("allow-popups");
    expect(html).not.toContain("allow-forms");
    // Theme code is never inlined: no srcdoc, no bundled identifiers leak.
    expect(html).not.toContain("srcdoc");
    expect(html).not.toContain("HeroCanvas");
    expect(html).not.toContain("WebglScene");
    expect(html).not.toContain("prefers-reduced-motion");
  });

  it("pins the binding URL and CSP to the ThemeRuntime contract", () => {
    const binding = boundRuntime();
    expect(binding.url).toBe(
      buildThemeFrameUrl(ORIGIN, { name: "aurora-lookbook", version: "1.4.0" }),
    );
    expect(binding.csp).toBe(themeFrameCSP(ORIGIN));
    expect(binding.csp.startsWith("default-src 'none'")).toBe(true);
    expect(binding.csp).toContain("connect-src 'none'");
    expect(binding.csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it("an unapproved bundle never reaches the frame (no binding, no iframe)", () => {
    const store = createDevThemeReleaseStore();
    const m = manifest();
    const assembled = assembleDevThemeBundle({
      manifestJson: m,
      files: [
        { path: "dev.theme.json", bytes: bytes(JSON.stringify(m)) },
        { path: "components/Hero.js", bytes: bytes(HERO_JS) },
        { path: "sections/webgl-scene.js", bytes: bytes(WEBGL_JS) },
        { path: "styles/main.css", bytes: bytes(".hero{color:red}") },
        {
          path: "locales/en.json",
          bytes: bytes(JSON.stringify({ headline: "Hi" })),
        },
        {
          path: "locales/bn.json",
          bytes: bytes(JSON.stringify({ headline: "হাই" })),
        },
      ],
    });
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    const { release } = store.submit({
      merchantId: "seller-1",
      themeId: "aurora-lookbook",
      manifest: assembled.manifest,
      files: assembled.files,
      fingerprint: assembled.fingerprint,
      submittedBy: "dev-1",
      submittedAt: T0,
    });
    // Never reviewed: activation refuses, so no binding exists to render.
    expect(() =>
      resolveDevThemeActivation({
        release,
        expectedFingerprint: assembled.fingerprint,
      }),
    ).toThrow(/unapproved/);
  });
});
