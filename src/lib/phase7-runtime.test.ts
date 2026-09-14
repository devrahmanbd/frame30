/**
 * Phase 7 — runtime robustness / fail-safes.
 *
 * Each invariant in TODO §7 is asserted here, not merely implemented: the
 * resolver degrades to last-good rows, the storefront cache key is tenant ·
 * template · locale · theme_version and a publish purges one merchant only, the
 * hydration policy matches the declared per-category contract, and the overlay
 * host is the sole owner of focus trap, scroll lock and Escape.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";

import { newSection, type Section, type ThemeAst } from "./builder-ast";
import { collectWidgetRequests, type WidgetRow } from "./widget-data";
import { clearLastGood, lastGoodRows, resolveWidgetData } from "./widget-data.server";
import { cached, invalidate } from "./cache.server";
import { parseCacheKey, storefrontCacheKey, tenantCachePrefix } from "./storefront-cache";
import { hydrationMode } from "./widget-hydration";
import { WIDGET_REGISTRY, WIDGET_TYPES } from "./widget-registry";

const TENANT = "merchant-phase7";
const OTHER = "merchant-other";

function grid(props: Record<string, unknown> = {}): Section {
  const section = newSection("product_grid");
  return { ...section, props: { ...section.props, ...props } as Section["props"] };
}
const ast = (main: Section[]): ThemeAst => ({ header: [], main, footer: [] });

const ROWS: WidgetRow[] = [{ id: "p1", title: "Kurta", href: "/products/kurta" }];

describe("Phase 7 — resolver fail-safes", () => {
  beforeEach(() => clearLastGood());

  it("remembers the last good payload and serves it when the source times out", async () => {
    const bundle = collectWidgetRequests(ast([grid({ limit: 4 })]));
    const key = bundle.requests[0]!.key;

    const ok = await resolveWidgetData(TENANT, bundle, {
      collection: async () => ({ [key]: ROWS }),
    });
    expect(ok[key]).toEqual(ROWS);
    expect(lastGoodRows(TENANT, key)).toEqual(ROWS);

    const slow = await resolveWidgetData(
      TENANT,
      bundle,
      { collection: () => new Promise(() => undefined) },
      { timeoutMs: 5 },
    );
    expect(slow[key]).toEqual(ROWS);
  });

  it("serves last-good rows when the source throws, and never rejects", async () => {
    const bundle = collectWidgetRequests(ast([grid({ limit: 6 })]));
    const key = bundle.requests[0]!.key;
    await resolveWidgetData(TENANT, bundle, { collection: async () => ({ [key]: ROWS }) });

    const degraded = await resolveWidgetData(TENANT, bundle, {
      collection: async () => {
        throw new Error("database unavailable");
      },
    });
    expect(degraded[key]).toEqual(ROWS);
  });

  it("falls back to empty rows when nothing was ever good", async () => {
    const bundle = collectWidgetRequests(ast([grid({ limit: 9 })]));
    const key = bundle.requests[0]!.key;
    const map = await resolveWidgetData(TENANT, bundle, {
      collection: async () => {
        throw new Error("cold start");
      },
    });
    expect(map[key]).toEqual([]);
  });

  it("never lets one tenant's last-good payload leak into another's", async () => {
    const bundle = collectWidgetRequests(ast([grid({ limit: 12 })]));
    const key = bundle.requests[0]!.key;
    await resolveWidgetData(TENANT, bundle, { collection: async () => ({ [key]: ROWS }) });

    const other = await resolveWidgetData(OTHER, bundle, {
      collection: async () => {
        throw new Error("boom");
      },
    });
    expect(other[key]).toEqual([]);
    expect(lastGoodRows(OTHER, key)).toEqual([]);
  });
});

describe("Phase 7 — storefront cache identity", () => {
  it("keys every cached body by tenant · template · locale · theme_version", () => {
    const key = storefrontCacheKey({
      merchantId: TENANT,
      template: "product",
      locale: "bn",
      themeVersion: "v-42",
    });
    expect(parseCacheKey(key)).toEqual({
      merchantId: TENANT,
      template: "product",
      locale: "bn",
      themeVersion: "v-42",
    });
    // Any dimension changing must change the key.
    const dims = [
      storefrontCacheKey({ merchantId: OTHER, template: "product", locale: "bn", themeVersion: "v-42" }),
      storefrontCacheKey({ merchantId: TENANT, template: "index", locale: "bn", themeVersion: "v-42" }),
      storefrontCacheKey({ merchantId: TENANT, template: "product", locale: "en", themeVersion: "v-42" }),
      storefrontCacheKey({ merchantId: TENANT, template: "product", locale: "bn", themeVersion: "v-43" }),
    ];
    expect(new Set([key, ...dims]).size).toBe(5);
  });

  it("a publish purge clears one merchant and leaves every other one warm", async () => {
    const mine = storefrontCacheKey({ merchantId: TENANT, template: "index", themeVersion: "v1" });
    const theirs = storefrontCacheKey({ merchantId: OTHER, template: "index", themeVersion: "v1" });
    await cached(mine, 60, async () => "mine-v1");
    await cached(theirs, 60, async () => "theirs-v1");

    invalidate(tenantCachePrefix(TENANT));

    expect(await cached(mine, 60, async () => "mine-v2")).toBe("mine-v2");
    expect(await cached(theirs, 60, async () => "theirs-v2")).toBe("theirs-v1");
  });
});

describe("Phase 7 — hydration policy audit", () => {
  it("assigns every registered widget exactly one mode", () => {
    for (const type of WIDGET_TYPES) {
      expect(["static", "eager", "visible", "interaction"]).toContain(hydrationMode(type));
    }
  });

  it("keeps chrome eager, editorial static and overlays interaction", () => {
    for (const type of ["announcement_bar", "account_cart", "add_to_cart"] as const) {
      expect(hydrationMode(type), type).toBe("eager");
    }
    for (const type of ["rich_text", "heading", "image", "divider"] as const) {
      expect(hydrationMode(type), type).toBe("static");
    }
    for (const type of ["cart_drawer", "size_guide", "quick_view", "facet_sidebar"] as const) {
      expect(hydrationMode(type), type).toBe("interaction");
    }
  });

  it("never marks an interactive data-bound widget as zero-JS static", () => {
    // Server-rendered tables are the one honest exception: their rows are
    // markup, so hydrating them would buy nothing.
    const MARKUP_ONLY_DATA = new Set(["spec_table", "product_meta"]);
    for (const type of WIDGET_TYPES) {
      if (!WIDGET_REGISTRY[type].data || MARKUP_ONLY_DATA.has(type)) continue;
      expect(hydrationMode(type), type).not.toBe("static");
    }
  });
});

describe("Phase 7 — overlay invariants", () => {
  const dir = join(process.cwd(), "src/components/builder");
  const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter(
    (f) => (f.endsWith(".tsx") || f.endsWith(".ts")) && !f.includes(".test."),
  );

  it("only OverlayHost locks scroll and declares a modal dialog", () => {
    const offenders = files.filter((file) => {
      if (file.endsWith("OverlayHost.tsx")) return false;
      const source = readFileSync(join(dir, file), "utf8");
      return /body\.style\.overflow/.test(source) || /aria-modal/.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("OverlayHost owns focus trap, scroll lock, Escape and focus restore", () => {
    const source = readFileSync(join(dir, "primitives/OverlayHost.tsx"), "utf8");
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("document.body.style.overflow");
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain('event.key !== "Tab"');
    expect(source).toContain("restoreRef.current?.focus?.()");
  });
});
