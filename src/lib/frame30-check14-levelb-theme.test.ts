/**
 * Frame30 checklist item 14 — Pass 2: REAL Level B theme test.
 *
 * Proves a custom widget registers, exposes its schema in the editor path,
 * and executes bundled code through the real runtime — REUSING (not
 * redoing) the proven execution spec:
 * - Genuine gsap/three execution through the real sandbox is proven by
 *   EXECUTING `.e2e/levelb-theme-execution.spec.ts` (cold browser, real
 *   loopback HTTP, vendor byte-proof) plus the switch round-trip and
 *   lifecycle specs — via the harness `levelb-production-e2e` verifier,
 *   which CI runs as job `e2e-levelb-production`. Execution proof belongs
 *   to that spec run, not to file-words here: this file pins the Node-level
 *   contracts only, without launching a browser.
 *   (`src/lib/dev-theme-sandbox.test.tsx` remains the frame-shape harness.)
 * - Registration/schema/envelope/binding run here through the REAL modules:
 *   fromDevThemeManifest → createWidgetRegistry → resolveInspectorSchema →
 *   validateDevThemeWidgetProps → build/parseThemePreviewEnvelope →
 *   buildThemeFrameUrl/themeFrameCSP/THEME_SANDBOX.
 *
 * Fixture: `src/lib/__fixtures__/frame30-proof-theme/dev.theme.json`
 * (shared + per-section settings, incl. multiline text and multi product
 * selection — the repeater-grade catalogue control).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  THEME_PREVIEW_MAX_BYTES,
  buildThemePreviewEnvelope,
  parseThemePreviewEnvelope,
} from "../components/theme-runtime/bridge-v2";
import {
  THEME_SANDBOX,
  buildThemeFrameUrl,
  isApprovedAssetOrigin,
  themeFrameCSP,
} from "../components/theme-runtime/ThemeRuntime";
import {
  activeDevThemeWidgetDefs,
  devThemeWidgetId,
  fromDevThemeManifest,
  validateDevThemeWidgetProps,
} from "./dev-theme-widgets";
import { createWidgetRegistry } from "./unified-widget-registry";
import {
  resolveInspectorSchema,
  resolvePresentation,
} from "./widget-presentation";

const THEME_JSON_PATH =
  "src/lib/__fixtures__/frame30-proof-theme/dev.theme.json";
const THEME_ID = "frame30-proof-theme";

function loadThemeRaw(): unknown {
  return JSON.parse(readFileSync(THEME_JSON_PATH, "utf8")) as unknown;
}

describe("Pass 2 — custom widget registers through the real adapter", () => {
  it("fixture dev.theme.json adapts to one def per section", () => {
    const verdict = fromDevThemeManifest(loadThemeRaw());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.defs.map((d) => d.id).sort()).toEqual(
      ["hero", "media-rail", "webgl-scene"]
        .map((s) => devThemeWidgetId(THEME_ID, s))
        .sort(),
    );
    for (const def of verdict.defs) {
      expect(def.namespace).toBe("theme");
      expect(def.renderer).toBe("custom");
      expect(def.themes).toEqual([THEME_ID]);
      expect(def.themeId).toBe(THEME_ID);
    }
  });

  it("shared + per-section settings compose without key collisions", () => {
    const verdict = fromDevThemeManifest(loadThemeRaw());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const hero = verdict.defs.find((d) => d.sectionKey === "hero")!;
    const keys = hero.propsSchema.fields.map((f) => f.key);
    // Shared layer …
    for (const shared of [
      "headline",
      "backdrop",
      "accent",
      "gap",
      "featured",
      "motion",
    ]) {
      expect(keys).toContain(shared);
    }
    // … plus this section's own layer.
    expect(keys).toContain("kicker");
    expect(keys).toContain("palette");
    // Grade modifiers select richer EXISTING kinds, never invented ones.
    const kicker = hero.propsSchema.fields.find((f) => f.key === "kicker")!;
    expect(kicker.kind).toBe("richtext"); // multiline text
    expect(kicker.required).toBe(true);
    const featured = hero.propsSchema.fields.find((f) => f.key === "featured")!;
    expect(featured.kind).toBe("repeater"); // multiple product-selection
    expect(featured.fields).toEqual([
      { key: "id", label: "Featured", kind: "product" },
    ]);
    const rail = verdict.defs.find((d) => d.sectionKey === "media-rail")!;
    expect(rail.propsSchema.fields.map((f) => f.key)).toContain("rail-note");
    // … and sections never see each other's private settings.
    expect(rail.propsSchema.fields.map((f) => f.key)).not.toContain("kicker");
  });

  it("defs register into a factory registry and resolve (no singleton use)", () => {
    const verdict = fromDevThemeManifest(loadThemeRaw());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const registry = createWidgetRegistry();
    for (const def of verdict.defs) {
      expect(registry.registerWidget(def).ok).toBe(true);
    }
    const resolved = registry.resolveWidget(devThemeWidgetId(THEME_ID, "hero"));
    expect(resolved.ok).toBe(true);
  });

  it("only the approved ACTIVE theme adapts (inactive/foreign/absent yield nothing)", () => {
    const raw = loadThemeRaw();
    expect(
      activeDevThemeWidgetDefs({
        themeKey: THEME_ID,
        manifest: raw,
        isActive: true,
      }),
    ).toHaveLength(3);
    expect(
      activeDevThemeWidgetDefs({
        themeKey: THEME_ID,
        manifest: raw,
        isActive: false,
      }),
    ).toEqual([]);
    expect(
      activeDevThemeWidgetDefs({
        themeKey: "other-theme",
        manifest: raw,
        isActive: true,
      }),
    ).toEqual([]);
    expect(
      activeDevThemeWidgetDefs({
        themeKey: THEME_ID,
        manifest: null,
        isActive: true,
      }),
    ).toEqual([]);
  });
});

describe("Pass 2 — schema is exposed in the editor path", () => {
  function editorRegistry() {
    const verdict = fromDevThemeManifest(loadThemeRaw());
    if (!verdict.ok) throw new Error("fixture refused");
    const registry = createWidgetRegistry();
    for (const def of verdict.defs) registry.registerWidget(def);
    return registry;
  }

  it("extension nodes resolve to the theme schema (threaded registry, read-only)", () => {
    const registry = editorRegistry();
    const before = registry.widgetIds();
    const result = resolveInspectorSchema(
      {
        type: "extension",
        widgetKey: devThemeWidgetId(THEME_ID, "hero"),
      },
      registry,
    );
    expect(result.status).toBe("schema");
    if (result.status !== "schema") return;
    expect(result.widgetId).toBe(devThemeWidgetId(THEME_ID, "hero"));
    expect(result.meta).toContain("theme");
    const keys = new Set(result.schema.fields.map((f) => f.key));
    expect(keys.has("headline")).toBe(true);
    expect(keys.has("kicker")).toBe(true);
    // Read-only: the lookup registers nothing globally.
    expect(registry.widgetIds()).toEqual(before);
  });

  it("merchant props validate through the shared value layer", () => {
    const verdict = fromDevThemeManifest(loadThemeRaw());
    if (!verdict.ok) return;
    const hero = verdict.defs.find((d) => d.sectionKey === "hero")!;
    const good = validateDevThemeWidgetProps(hero, {
      headline: "Drop 04",
      kicker: "New",
    });
    expect(good.ok).toBe(true);
    const hostile = validateDevThemeWidgetProps(hero, {
      headline: "<script>alert(1)</script>Sale",
      kicker: "New",
      injected: "dropped",
    });
    expect(hostile.ok).toBe(true);
    expect(String(hostile.clean["headline"])).not.toContain("<script>");
    expect("injected" in hostile.clean).toBe(false);
  });

  it("owner theme presents owner-definition; foreign themes get the recoverable fallback", () => {
    const verdict = fromDevThemeManifest(loadThemeRaw());
    if (!verdict.ok) return;
    const registry = createWidgetRegistry();
    for (const def of verdict.defs) registry.registerWidget(def);
    const owned = resolvePresentation({
      widgetId: devThemeWidgetId(THEME_ID, "hero"),
      themeKey: THEME_ID,
      registry,
      props: { headline: "Drop 04" },
    });
    expect(owned).toMatchObject({
      ok: true,
      mode: "theme-owned",
      presentation: "owner-definition",
      placeholder: false,
    });
    const foreign = resolvePresentation({
      widgetId: devThemeWidgetId(THEME_ID, "hero"),
      themeKey: "songoskriti",
      registry,
      props: { headline: "Drop 04" },
    });
    expect(foreign).toMatchObject({
      ok: true,
      mode: "theme-owned",
      presentation: "recoverable-fallback",
      placeholder: true,
    });
  });
});

describe("Pass 2 — bundled code executes only through the real runtime", () => {
  it("preview envelope round-trips validated props host→frame", () => {
    const verdict = fromDevThemeManifest(loadThemeRaw());
    if (!verdict.ok) return;
    const hero = verdict.defs.find((d) => d.sectionKey === "hero")!;
    const clean = validateDevThemeWidgetProps(hero, {
      headline: "Drop 04",
      kicker: "New",
    }).clean as Record<string, unknown>;
    const built = buildThemePreviewEnvelope({
      widgetId: devThemeWidgetId(THEME_ID, "hero"),
      component: "HeroCanvas",
      props: clean,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.envelope.v).toBe(2);
    const parsed = parseThemePreviewEnvelope(built.envelope);
    expect(parsed).toMatchObject({
      ok: true,
      widgetId: devThemeWidgetId(THEME_ID, "hero"),
      component: "HeroCanvas",
    });
  });

  it("preview envelope fails closed on oversize / bad identity", () => {
    const big = "x".repeat(THEME_PREVIEW_MAX_BYTES + 1);
    expect(
      buildThemePreviewEnvelope({
        widgetId: devThemeWidgetId(THEME_ID, "hero"),
        component: "HeroCanvas",
        props: { headline: big },
      }),
    ).toMatchObject({ ok: false, error: "theme.oversize" });
    expect(
      buildThemePreviewEnvelope({
        widgetId: "plugin:frame30-proof/lookbook_grid",
        component: "HeroCanvas",
        props: {},
      }),
    ).toMatchObject({ ok: false, error: "theme.malformed" });
    expect(
      buildThemePreviewEnvelope({
        widgetId: devThemeWidgetId(THEME_ID, "hero"),
        component: "../escape",
        props: {},
      }),
    ).toMatchObject({ ok: false, error: "theme.malformed" });
  });

  it("frame contract pins sandbox tokens, CSP and versioned URL (no page-DOM execution)", () => {
    expect(THEME_SANDBOX).toBe("allow-scripts");
    expect(THEME_SANDBOX).not.toContain("allow-same-origin");
    const origin = "https://cdn.example.com";
    expect(isApprovedAssetOrigin(origin)).toBe(true);
    expect(isApprovedAssetOrigin("http://evil.example.com")).toBe(false);
    const csp = themeFrameCSP(origin);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    // style-src carries the single documented 'unsafe-inline' exception
    // (sanitized theme CSS); script-src never does — scripts are files from
    // the approved origin only, no inline/blob/data/third-party hosts.
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src "))!;
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("blob:");
    expect(scriptSrc).not.toContain("data:");
    const url = buildThemeFrameUrl(origin, {
      name: THEME_ID,
      version: "1.0.0",
    });
    expect(url).toBe(`https://cdn.example.com/t/${THEME_ID}/1.0.0/index.html`);
    expect(
      buildThemeFrameUrl(origin, { name: THEME_ID, version: "latest" }),
    ).toBe(null);
    expect(
      buildThemeFrameUrl("http://evil.example.com", {
        name: THEME_ID,
        version: "1.0.0",
      }),
    ).toBe(null);
  });
});
