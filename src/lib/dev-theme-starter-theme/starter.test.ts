/**
 * Frame30 starter theme — runnable proof through the REAL Level B pipeline.
 *
 * The starter lives on disk in this directory (manifest + sections +
 * components + styles + local assets + locales). Every vector below reads
 * those bytes and runs them through the real gates — never hand-built
 * approvals, never a parallel pipeline:
 *
 * - manifest gate (`parseDevThemeManifest`) + bundle gate
 *   (`validateDevThemeBundle`: executable allowlist, server/secrets/network
 *   screens, dependency-pin equality + confusion backstops, asset-manifest
 *   completeness) + deterministic assembler (`assembleDevThemeBundle`);
 * - moderator workflow (`createDevThemeReleaseStore`: submit → approve →
 *   publish, versioned updates, revoked-latest rollback to last-approved);
 * - fingerprint-bound activation per version (`resolveDevThemeActivation` +
 *   `bindDevThemeRuntime`) + version-pinned document synthesis
 *   (`buildDevThemeDocument`) with the serve-time re-check;
 * - editor widgets (`fromDevThemeManifest` + shared `validateProps`);
 * - genuine engines: real `gsap` + `gsap/ScrollTrigger` and real `three`
 *   dynamic imports, pinned to the manifest versions;
 * - video interaction (lazy gate, still fallback) + custom layout (CSS grid
 *   + data-layout hooks + local poster asset).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assembleDevThemeBundle } from "../dev-theme-bundle-assemble";
import {
  validateDevThemeBundle,
  type DevThemeBundleFile,
} from "../dev-theme-bundle";
import {
  parseDevThemeManifest,
  DEV_THEME_RUNTIME_VERSION,
} from "../dev-theme-manifest";
import {
  createDevThemeReleaseStore,
  type DevThemeRelease,
} from "../dev-theme-review";
import {
  bindDevThemeRuntime,
  resolveDevThemeActivation,
} from "../dev-theme-activate";
import { buildDevThemeDocument } from "../dev-theme-document";
import { fromDevThemeManifest } from "../dev-theme-widgets";
import { PROP_KINDS, validateProps } from "../widget-props";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): Uint8Array =>
  new Uint8Array(readFileSync(join(here, rel)));
const text = (rel: string): string => readFileSync(join(here, rel), "utf8");
const manifestJson = () => JSON.parse(text("dev.theme.json"));

const GSAP_PIN = "3.15.0";
const THREE_PIN = "0.186.1";
const MOD = { id: "reviewer-1", role: "moderator" } as const;
const T0 = "2026-10-01T00:00:00.000Z";
const T1 = "2026-10-02T00:00:00.000Z";
const ORIGIN = "https://themes.example-cdn.com";

function starterFiles(): DevThemeBundleFile[] {
  return [
    { path: "dev.theme.json", bytes: read("dev.theme.json") },
    { path: "sections/hero.js", bytes: read("sections/hero.js") },
    { path: "sections/webgl-scene.js", bytes: read("sections/webgl-scene.js") },
    { path: "sections/media-rail.js", bytes: read("sections/media-rail.js") },
    { path: "components/shared.js", bytes: read("components/shared.js") },
    { path: "styles/main.css", bytes: read("styles/main.css") },
    { path: "assets/poster.svg", bytes: read("assets/poster.svg") },
    { path: "assets/grain.png", bytes: read("assets/grain.png") },
    { path: "locales/en.json", bytes: read("locales/en.json") },
  ];
}

function approvedStarter() {
  const m = manifestJson();
  const store = createDevThemeReleaseStore();
  const assembled = assembleDevThemeBundle({
    manifestJson: m,
    files: starterFiles(),
    dependencies: m.dependencies,
    allowedNetworkHosts: [],
  });
  expect(assembled.ok).toBe(true);
  if (!assembled.ok) throw new Error("starter assemble refused");
  const v = validateDevThemeBundle({
    manifest: m,
    files: starterFiles(),
    dependencies: m.dependencies,
    allowedNetworkHosts: [],
  });
  expect(v.ok).toBe(true);
  const { release: submitted } = store.submit({
    merchantId: "seller-1",
    themeId: "frame30-starter",
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
    reason: "starter clean scan, fallbacks attached",
    reviewedAt: T1,
  });
  const { release } = store.publish({
    releaseId: submitted.id,
    merchantId: "seller-1",
    actor: { ...MOD },
    expectedFingerprint: assembled.fingerprint,
    publishedAt: T1,
  });
  return { store, release: release as DevThemeRelease, assembled, manifest: m };
}

describe("starter manifest + bundle (real gates only)", () => {
  it("the on-disk manifest passes the real manifest gate", () => {
    const parsed = parseDevThemeManifest(manifestJson());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.manifest.id).toBe("frame30-starter");
    expect(parsed.manifest.runtime).toBe(DEV_THEME_RUNTIME_VERSION);
    expect(parsed.manifest.capabilities).toEqual(
      expect.arrayContaining([
        "presentation",
        "animation",
        "webgl",
        "commerce-read",
        "cart-write",
      ]),
    );
  });

  it("assembles deterministically through the real pipeline with hashed outputs", () => {
    const m = manifestJson();
    const a = assembleDevThemeBundle({
      manifestJson: m,
      files: starterFiles(),
      dependencies: m.dependencies,
      allowedNetworkHosts: [],
    });
    const b = assembleDevThemeBundle({
      manifestJson: m,
      files: starterFiles(),
      dependencies: m.dependencies,
      allowedNetworkHosts: [],
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(b.releaseJson).toBe(a.releaseJson);
    expect(b.fingerprint).toBe(a.fingerprint);
    // Every area file is content-hashed; root manifest stays verbatim.
    const hashed = a.files.filter((f) => f.path.includes("/"));
    expect(hashed.length).toBeGreaterThanOrEqual(7);
    for (const f of hashed) {
      expect(f.path).toMatch(/\.[0-9a-f]{8}\.[a-z0-9]+$/);
    }
    expect(a.files.some((f) => f.path === "dev.theme.json")).toBe(true);
  });

  it("ships CSS + local assets, all hashed and present (asset completeness holds)", () => {
    const { assembled } = approvedStarter();
    const paths = assembled.files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith("styles/main."))).toBe(true);
    expect(paths.some((p) => p.includes("poster."))).toBe(true);
    expect(paths.some((p) => p.includes("grain."))).toBe(true);
    // The CSS poster reference resolves to a bundled asset (relative only).
    expect(text("styles/main.css")).toMatch(/url\(\.\.\/assets\/poster\.svg\)/);
  });
});

describe("starter widgets + schemas (new widgets, shared value layer)", () => {
  it("adapts three theme-owned defs with shared + per-widget settings", () => {
    const verdict = fromDevThemeManifest(manifestJson());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.defs.map((d) => d.id).sort()).toEqual([
      "theme:frame30-starter/hero",
      "theme:frame30-starter/media-rail",
      "theme:frame30-starter/webgl-scene",
    ]);
    const hero = verdict.defs.find((d) => d.sectionKey === "hero")!;
    const heroKeys = hero.propsSchema.fields.map((f) => f.key);
    for (const shared of [
      "headline",
      "backdrop",
      "accent",
      "gap",
      "featured",
      "motion",
    ]) {
      expect(heroKeys).toContain(shared);
    }
    // Per-widget extension lands only on its owner.
    expect(heroKeys).toContain("kicker");
    expect(heroKeys).toContain("palette");
    const rail = verdict.defs.find((d) => d.sectionKey === "media-rail")!;
    expect(rail.propsSchema.fields.map((f) => f.key)).toContain("rail-note");
    const scene = verdict.defs.find((d) => d.sectionKey === "webgl-scene")!;
    expect(scene.propsSchema.fields.map((f) => f.key)).not.toContain("kicker");
  });

  it("uses only existing prop kinds and defaults validate", () => {
    const verdict = fromDevThemeManifest(manifestJson());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const kinds = new Set(PROP_KINDS as readonly string[]);
    for (const def of verdict.defs) {
      for (const field of def.propsSchema.fields) {
        expect(kinds.has(field.kind)).toBe(true);
      }
      expect(validateProps(def.propsSchema, def.defaults).errors).toEqual([]);
    }
  });
});

describe("starter components (React-compatible, static-first)", () => {
  it("hero renders a custom-layout section with merchant settings", async () => {
    const hero = (await import("./sections/hero.js")) as {
      renderHeroSection: (input: unknown) => { html: string };
    };
    const { html } = hero.renderHeroSection({
      settings: {
        headline: "Hello",
        kicker: "New",
        gap: 24,
        motion: "standard",
      },
      chapters: [{ id: "c1", title: "Chapter one" }],
    });
    expect(html).toContain('data-starter="hero"');
    expect(html).toContain('data-layout="starter-grid"');
    expect(html).toContain("Hello");
    expect(html).toContain("Chapter one");
  });

  it("webgl renders a canvas placeholder plus the poster still (no GL needed)", async () => {
    const scene = (await import("./sections/webgl-scene.js")) as {
      renderStarterWebgl: (input: unknown) => { html: string };
    };
    const { html } = scene.renderStarterWebgl({
      settings: { caption: "Night glow", poster: "poster.svg" },
    });
    expect(html).toContain("data-webgl-canvas");
    expect(html).toContain("data-webgl-poster");
    expect(html).toContain("Night glow");
  });

  it("media rail gates video behind visibility with a still fallback", async () => {
    const rail = (await import("./sections/media-rail.js")) as {
      renderMediaRail: (input: unknown) => { html: string };
      createMediaGate: () => {
        markVisible: () => void;
        requestLoad: (
          index: number,
          slides: readonly { kind: string }[],
          loader: (slide: unknown) => void,
        ) => string;
      };
    };
    const slides = [
      { kind: "video", src: "clip.mp4", poster: "still.jpg", alt: "Clip" },
      { kind: "image", src: "photo.jpg", poster: "", alt: "Photo" },
    ];
    const hidden = rail.renderMediaRail({
      settings: { caption: "Rail" },
      slides,
      visible: false,
      supportsVideo: true,
    });
    expect(hidden.html).toContain("data-src");
    expect(hidden.html).not.toMatch(/<video src=/);
    const shown = rail.renderMediaRail({
      settings: { caption: "Rail" },
      slides,
      visible: true,
      supportsVideo: true,
    });
    expect(shown.html).toContain("<video src=");
    expect(shown.html).toContain("controls");
    const still = rail.renderMediaRail({
      settings: { caption: "Rail" },
      slides,
      visible: true,
      supportsVideo: false,
    });
    expect(still.html).toContain('data-fallback="image"');
    // The lazy gate stays silent until visible.
    const gate = rail.createMediaGate();
    let loads = 0;
    expect(gate.requestLoad(0, slides, () => loads++)).toBe("gated");
    expect(loads).toBe(0);
    gate.markVisible();
    expect(gate.requestLoad(0, slides, () => loads++)).toBe("loaded");
    expect(loads).toBe(1);
  });

  it("custom layout ships in CSS (grid + rail + poster still)", () => {
    const css = text("styles/main.css");
    expect(css).toContain('[data-layout="starter-grid"]');
    expect(css).toContain('[data-layout="starter-rail"]');
    expect(css).toContain("display: grid");
    expect(css).toContain("poster.svg");
  });
});

describe("starter engines (genuine GSAP/ScrollTrigger + Three.js)", () => {
  it("reaches the real gsap engine plus ScrollTrigger behind the manifest pin", async () => {
    const m = manifestJson();
    const pin = (m.dependencies as { name: string; version: string }[]).find(
      (d) => d.name === "gsap",
    )!;
    expect(pin.version).toBe(GSAP_PIN);
    const gsapMod = (await import("gsap")) as Record<string, unknown>;
    const engine = (gsapMod.gsap ?? gsapMod) as {
      timeline: (vars?: unknown) => unknown;
      version?: string;
    };
    expect(typeof engine.timeline).toBe("function");
    const pkg = JSON.parse(
      readFileSync(
        join(here, "..", "..", "..", "node_modules", "gsap", "package.json"),
        "utf8",
      ),
    ) as { version: string };
    expect(pkg.version).toBe(pin.version);
    const trigger = (await import("gsap/ScrollTrigger")) as Record<
      string,
      unknown
    >;
    expect(trigger.ScrollTrigger ?? trigger.default ?? trigger).toBeDefined();
    // The shipped hero reaches both through dynamic bare imports only.
    expect(text("sections/hero.js")).toMatch(
      /await\s+import\(\s*["']gsap["']\s*\)/,
    );
    expect(text("sections/hero.js")).toMatch(
      /await\s+import\(\s*["']gsap\/ScrollTrigger["']\s*\)/,
    );
    expect(text("sections/hero.js")).not.toMatch(
      /^\s*import\s+(?!type\b).*from\s*["']gsap["']/m,
    );
  });

  it("reaches the real three engine behind the manifest pin", async () => {
    const m = manifestJson();
    const pin = (m.dependencies as { name: string; version: string }[]).find(
      (d) => d.name === "three",
    )!;
    expect(pin.version).toBe(THREE_PIN);
    const three = (await import("three")) as Record<string, unknown>;
    for (const key of ["Scene", "PerspectiveCamera", "WebGLRenderer"]) {
      expect(typeof three[key], `three.${key}`).toBe("function");
    }
    const pkg = JSON.parse(
      readFileSync(
        join(here, "..", "..", "..", "node_modules", "three", "package.json"),
        "utf8",
      ),
    ) as { version: string };
    expect(pkg.version).toBe(pin.version);
    expect(text("sections/webgl-scene.js")).toMatch(
      /await\s+import\(\s*["']three["']\s*\)/,
    );
  });
});

describe("starter lifecycle (versioned updates + safe rollback + serve)", () => {
  it("publishes 1.0.0, updates to 1.0.1, revokes latest, and rolls back with audit", () => {
    const { store, release: r1, assembled: a1 } = approvedStarter();
    const fp1 = a1.fingerprint;
    // approvedStarter already published 1.0.0 — the pointer is live.
    // v1.0.1: same starter with a new headline (new bytes → new fingerprint).
    const m2 = { ...manifestJson(), version: "1.0.1" };
    const files2 = starterFiles().map((f) =>
      f.path === "dev.theme.json"
        ? { path: f.path, bytes: new TextEncoder().encode(JSON.stringify(m2)) }
        : f,
    );
    const a2 = assembleDevThemeBundle({
      manifestJson: m2,
      files: files2,
      dependencies: m2.dependencies,
      allowedNetworkHosts: [],
    });
    expect(a2.ok).toBe(true);
    if (!a2.ok) return;
    expect(a2.fingerprint).not.toBe(fp1);
    const { release: s2 } = store.submit({
      merchantId: "seller-1",
      themeId: "frame30-starter",
      manifest: a2.manifest,
      files: a2.files,
      fingerprint: a2.fingerprint,
      submittedBy: "dev-1",
      submittedAt: T1,
    });
    store.review({
      releaseId: s2.id,
      merchantId: "seller-1",
      reviewer: { ...MOD },
      decision: "approve",
      reason: "v2 ok",
      reviewedAt: T1,
    });
    const { release: r2 } = store.publish({
      releaseId: s2.id,
      merchantId: "seller-1",
      actor: { ...MOD },
      expectedFingerprint: a2.fingerprint,
      publishedAt: T1,
    });
    expect(store.published("seller-1", "frame30-starter")?.id).toBe(r2.id);
    // Compromised latest parks; prior approved restores as a new audited release.
    store.revoke({
      releaseId: r2.id,
      merchantId: "seller-1",
      actor: { ...MOD },
      reason: "v2 ships a skimmer",
      revokedAt: T1,
    });
    const rolled = store.rollback({
      merchantId: "seller-1",
      themeId: "frame30-starter",
      targetFingerprint: fp1,
      actor: { ...MOD },
      rolledBackAt: T1,
    });
    expect(rolled.release.fingerprint).toBe(fp1);
    expect(rolled.release.version).toBe("1.0.0");
    expect(rolled.release.rollbackOf).toBe(r1.id);
    expect(rolled.audit.action).toBe("dev_theme.rolled_back");
  });

  it("activates per version with least-privilege grants and serves a document", () => {
    const { store, release, assembled } = approvedStarter();
    const activation = resolveDevThemeActivation({
      release,
      expectedFingerprint: assembled.fingerprint,
      expectedThemeId: "frame30-starter",
      expectedVersion: "1.0.0",
      store,
    });
    expect(activation.version).toBe("1.0.0");
    const binding = bindDevThemeRuntime(activation, { assetOrigin: ORIGIN });
    expect(binding.url).toBe(`${ORIGIN}/t/frame30-starter/1.0.0/index.html`);
    expect(binding.granted).toEqual(
      expect.arrayContaining([
        "theme:storefront:read",
        "theme:variant:select",
        "theme:cart:add",
      ]),
    );
    const ns = "dev-themes/frame30-starter/1.0.0";
    const out = buildDevThemeDocument({
      themeId: "frame30-starter",
      version: "1.0.0",
      assetOrigin: ORIGIN,
      approvalRows: [
        {
          merchant_id: "m",
          name: `${ns}/.approval.json`,
          content: JSON.stringify(release),
        },
      ],
      mapRows: [
        {
          merchant_id: "m",
          name: `${ns}/release.json`,
          content: assembled.releaseJson,
        },
      ],
      store,
    });
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    const body = new TextDecoder().decode(out.body);
    expect(body).not.toMatch(/<script>/);
    expect(body).toMatch(/type="module"/);
    expect(out.refs.length).toBeGreaterThan(0);
  });
});
