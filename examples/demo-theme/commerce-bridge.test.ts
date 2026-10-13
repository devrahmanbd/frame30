/**
 * Demo theme fixture — commerce bridge + runtime proof.
 *
 * The section actions (`product-cards.ts` envelope builders) are validated
 * with the REAL bridge v2 gate (`authorizeThemeCall`, `answerThemeCall`,
 * `handleThemeMessage` — exported from
 * `src/components/theme-runtime/bridge-v2.ts`, used here, never mirrored)
 * under the fixture install grants (`fixture-bundles.ts`), and the sections
 * render through the ThemeRuntime SSR shell with fixture bundles — no app
 * mount needed. The executable-bundle mapping is asserted with the real
 * `validateDevThemeBundle` gate as well.
 * Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md` §2/§5/§8.
 *
 * Run: `npx vitest run --config examples/demo-theme/vitest.config.ts`
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  answerThemeCall,
  authorizeThemeCall,
  createThemeGuard,
  handleThemeMessage,
  isThemeError,
} from "../../src/components/theme-runtime/bridge-v2";
import { buildThemeGrants } from "../../src/components/theme-runtime/capabilities";
import {
  buildThemeFrameUrl,
  themeFrameCSP,
  THEME_SANDBOX,
  ThemeRuntime,
} from "../../src/components/theme-runtime/ThemeRuntime";
import { validateDevThemeBundle } from "../../src/lib/dev-theme-bundle";
import {
  DEMO_ASSET_ORIGIN,
  DEMO_THEME_IDENTITY,
  demoCarouselSlidesFixture,
  demoCommerceFixture,
  demoThemeGrants,
} from "./fixture-bundles";
import { demoManifest } from "./manifest";
import { renderMediaCarousel } from "./media-carousel";
import {
  buildCartAddEnvelope,
  buildVariantSelectEnvelope,
  renderProductCards,
} from "./product-cards";
import { renderStoryBlock } from "./story-block";

const here = dirname(fileURLToPath(import.meta.url));
const grants = demoThemeGrants();
const ctx = {
  granted: grants.granted,
  navigateAllowlist: grants.navigateAllowlist,
};

describe("demo bridge — install grants (default-deny base)", () => {
  it("the fixture install grants read + select + add + navigate", () => {
    expect(grants.granted).toEqual(
      expect.arrayContaining([
        "theme:storefront:read",
        "theme:variant:select",
        "theme:cart:add",
        "theme:navigate",
      ]),
    );
  });

  it("an empty install denies every demo method (scope_denied)", () => {
    const empty = buildThemeGrants();
    expect(
      authorizeThemeCall(
        { v: 2, id: "g-1", method: "storefront.read" },
        { granted: empty.granted },
      ),
    ).toEqual({
      allowed: false,
      reason: "scope_denied",
      method: "storefront.read",
    });
    expect(
      authorizeThemeCall(
        buildVariantSelectEnvelope("g-2", { variantId: "var-1a" }),
        { granted: empty.granted },
      ),
    ).toEqual({
      allowed: false,
      reason: "scope_denied",
      method: "variant.select",
    });
    expect(
      authorizeThemeCall(
        buildCartAddEnvelope("g-3", { variantId: "var-1a", quantity: 1 }),
        { granted: empty.granted },
      ),
    ).toEqual({ allowed: false, reason: "scope_denied", method: "cart.add" });
  });
});

describe("demo bridge — section envelopes conform to v2", () => {
  it("admits the builder variant.select envelope under the fixture grants", () => {
    expect(
      authorizeThemeCall(
        buildVariantSelectEnvelope("s-1", { variantId: "var-1a" }),
        ctx,
      ),
    ).toEqual({ allowed: true, method: "variant.select" });
  });

  it("admits the builder cart.add envelope under the fixture grants", () => {
    expect(
      authorizeThemeCall(
        buildCartAddEnvelope("s-2", { variantId: "var-3a", quantity: 2 }),
        ctx,
      ),
    ).toEqual({ allowed: true, method: "cart.add" });
  });

  it("delegates admitted calls with sanitized params", async () => {
    const seen: unknown[] = [];
    const out = await answerThemeCall(
      buildCartAddEnvelope("s-3", { variantId: "var-3a", quantity: 3 }),
      {
        ...ctx,
        onCall: async (method, params) => {
          seen.push([method, params]);
          return { lineId: "l-1" };
        },
      },
    );
    expect(out).toEqual({ result: { lineId: "l-1" } });
    expect(seen).toEqual([["cart.add", { variantId: "var-3a", quantity: 3 }]]);
  });

  it("rejects forged figure/identity/payment fields, never delegating", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    const forgeries: unknown[] = [
      {
        v: 2,
        id: "f-1",
        method: "cart.add",
        params: { variantId: "v", quantity: 1, price: 1 },
      },
      {
        v: 2,
        id: "f-2",
        method: "cart.add",
        params: { variantId: "v", quantity: 1, stock: 9 },
      },
      {
        v: 2,
        id: "f-3",
        method: "storefront.read",
        params: { tenantId: "other-shop" },
      },
      {
        v: 2,
        id: "f-4",
        method: "variant.select",
        params: { variantId: "v", paymentStatus: "paid" },
      },
    ];
    for (const forged of forgeries) {
      expect(authorizeThemeCall(forged, ctx)).toEqual(
        expect.objectContaining({
          allowed: false,
          reason: "forbidden_field",
        }),
      );
      const out = await answerThemeCall(forged, { ...ctx, onCall });
      expect(out).toEqual({ error: "theme.forbidden_field" });
      expect(isThemeError(out)).toBe(true);
    }
    expect(onCall).not.toHaveBeenCalled();
  });

  it("rejects invalid params, unknown methods, and v1 envelopes", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    expect(
      authorizeThemeCall(
        {
          v: 2,
          id: "p-1",
          method: "cart.add",
          params: { variantId: "v", quantity: 0 },
        },
        ctx,
      ),
    ).toEqual({
      allowed: false,
      reason: "invalid_params",
      method: "cart.add",
    });
    expect(
      await answerThemeCall(
        { v: 2, id: "p-2", method: "shop.delete" },
        { ...ctx, onCall },
      ),
    ).toEqual({ error: "theme.unknown_method" });
    expect(
      authorizeThemeCall({ v: 1, id: "p-3", method: "storefront.read" }, ctx),
    ).toEqual({ allowed: false, reason: "malformed" });
    expect(onCall).not.toHaveBeenCalled();
  });

  it("rejects oversize envelopes without touching onCall", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    const out = await answerThemeCall(
      {
        v: 2,
        id: "o-1",
        method: "storefront.read",
        params: { blob: "x".repeat(70 * 1024) },
      },
      { ...ctx, onCall },
    );
    expect(out).toEqual({ error: "theme.oversize" });
    expect(onCall).not.toHaveBeenCalled();
  });

  it("rejects duplicate ids and rate-limits floods per mount", async () => {
    const onCall = vi.fn(async () => ({ ok: true }));
    const guard = createThemeGuard();
    const first = await handleThemeMessage(
      { v: 2, id: "dup", method: "storefront.read" },
      { ...ctx, onCall, guard, now: 0 },
    );
    expect(first).toEqual({ result: { ok: true } });
    expect(
      await handleThemeMessage(
        { v: 2, id: "dup", method: "storefront.read" },
        { ...ctx, onCall, guard, now: 1 },
      ),
    ).toEqual({ error: "theme.duplicate_id" });
    expect(onCall).toHaveBeenCalledTimes(1);

    const storm = createThemeGuard();
    for (let i = 0; i < 30; i++) {
      const out = await handleThemeMessage(
        { v: 2, id: `storm-${i}`, method: "storefront.read" },
        { ...ctx, onCall, guard: storm, now: 0 },
      );
      expect(out).toEqual({ result: { ok: true } });
    }
    expect(
      await handleThemeMessage(
        { v: 2, id: "storm-over", method: "storefront.read" },
        { ...ctx, onCall, guard: storm, now: 0 },
      ),
    ).toEqual({ error: "theme.rate_limited" });
  });
});

describe("demo runtime — sections render through the fixture shell", () => {
  it("every manifest section key renders from fixture commerce data", () => {
    const commerce = demoCommerceFixture();
    const story = renderStoryBlock({
      settings: {},
      chapters: ["prod-1"],
      commerce,
      prefersReducedMotion: false,
    });
    const carousel = renderMediaCarousel({
      settings: {},
      slides: demoCarouselSlidesFixture(),
      visible: true,
      supportsVideo: true,
    });
    const cards = renderProductCards({
      settings: {},
      products: ["prod-1", "prod-3"],
      commerce,
    });
    const rendered = [story.html, carousel.html, cards.html];
    for (const section of demoManifest().sections) {
      expect(
        rendered.some((html) => html.includes(`data-demo="${section.key}"`)),
        `section ${section.key} renders`,
      ).toBe(true);
    }
  });

  it("the frame URL is immutable and pinned to the manifest identity", () => {
    const manifest = demoManifest();
    expect(DEMO_THEME_IDENTITY.name).toBe(manifest.id);
    expect(DEMO_THEME_IDENTITY.version).toBe(manifest.version);
    expect(
      buildThemeFrameUrl(DEMO_ASSET_ORIGIN, { ...DEMO_THEME_IDENTITY }),
    ).toBe(`${DEMO_ASSET_ORIGIN}/t/demo-atelier/0.1.0/index.html`);
  });

  it("the SSR shell isolates the bundle: scripts inside, nothing else", () => {
    expect(THEME_SANDBOX).toBe("allow-scripts");
    const html = renderToStaticMarkup(
      createElement(ThemeRuntime, {
        title: "Demo Atelier",
        assetOrigin: DEMO_ASSET_ORIGIN,
        theme: { ...DEMO_THEME_IDENTITY },
        granted: grants.granted,
        onCall: async () => ({ ok: true }),
      }),
    );
    expect(html).toContain("<iframe");
    expect(html).toContain(
      `${DEMO_ASSET_ORIGIN}/t/demo-atelier/0.1.0/index.html`,
    );
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain("allow-same-origin");
    expect(html).not.toContain("srcdoc");
  });

  it("the shell fails closed on a mutable identity (no render)", () => {
    const html = renderToStaticMarkup(
      createElement(ThemeRuntime, {
        title: "Demo Atelier",
        assetOrigin: DEMO_ASSET_ORIGIN,
        theme: { name: "demo-atelier", version: "latest" },
        granted: grants.granted,
        onCall: async () => ({ ok: true }),
      }),
    );
    expect(html).toBe("");
  });

  it("the frame CSP denies the frame its own network (bridge is the path)", () => {
    const csp = themeFrameCSP(DEMO_ASSET_ORIGIN);
    expect(csp.startsWith("default-src 'none'")).toBe(true);
    expect(csp).toContain("connect-src 'none'");
  });
});

describe("demo runtime — fixture bundle passes the real bundle gate", () => {
  const enc = new TextEncoder();
  const manifestJson = JSON.parse(
    readFileSync(join(here, "dev.theme.json"), "utf8"),
  ) as Record<string, unknown>;
  const fileBytes = (name: string) =>
    new Uint8Array(readFileSync(join(here, name)));
  const textBytes = (name: string) =>
    enc.encode(readFileSync(join(here, name), "utf8"));

  function bundleInput() {
    return {
      manifest: manifestJson,
      files: [
        { path: "dev.theme.json", bytes: fileBytes("dev.theme.json") },
        { path: "sections/story-block.js", bytes: textBytes("story-block.ts") },
        {
          path: "sections/media-carousel.js",
          bytes: textBytes("media-carousel.ts"),
        },
        {
          path: "sections/product-cards.js",
          bytes: textBytes("product-cards.ts"),
        },
        { path: "components/commerce.js", bytes: textBytes("commerce.ts") },
        { path: "components/shared.js", bytes: textBytes("shared.ts") },
      ],
      dependencies: (manifestJson["dependencies"] ?? []) as Array<{
        name: string;
        version: string;
        license: string;
        integrity: string;
      }>,
      allowedNetworkHosts: [] as string[],
    };
  }

  it("the mapped fixture bundle validates with a stable fingerprint", () => {
    const first = validateDevThemeBundle(bundleInput());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.files).toHaveLength(6);
    expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    const second = validateDevThemeBundle(bundleInput());
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it("a tampered manifest fails the bundle gate before any write", () => {
    const tampered = structuredClone(manifestJson) as Record<string, unknown>;
    tampered["server"] = { entry: "server.js" };
    const verdict = validateDevThemeBundle({
      ...bundleInput(),
      manifest: tampered,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.join(" ")).toMatch(/bundle\.manifest/);
  });
});
