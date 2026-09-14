/**
 * Phase 8 — system architecture invariants (caching, tenant isolation,
 * observability, failure policy).
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EDGE_TTL_SECONDS,
  STOREFRONT_CACHE_PREFIX,
  isStorefrontPath,
  parseCacheKey,
  storefrontCacheHeaders,
  storefrontCacheKey,
  tenantCachePrefix,
} from "./storefront-cache";
import { assertTenantId, isTenantId, isTenantUuid, TenantScopeError } from "./tenant-scope";
import { resolveWidgetData } from "./widget-data.server";
import type { WidgetDataBundle } from "./widget-data";
import type { SourceLoader } from "./widget-data.server";

const TENANT = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";

const bundle = {
  requests: [{ key: "k1", nodeId: "n1", source: "collection", params: { limit: 4 } }],
  byNode: { n1: "k1" },
} as unknown as WidgetDataBundle;

describe("8.2 caching — tenant · template · locale · theme_version", () => {
  it("keys every dimension, tenant first", () => {
    const key = storefrontCacheKey({ merchantId: TENANT, template: "index", locale: "bn", themeVersion: "v9" });
    expect(key).toBe(`${STOREFRONT_CACHE_PREFIX}${TENANT}:index:bn:v9`);
    expect(key.startsWith(tenantCachePrefix(TENANT))).toBe(true);
    expect(parseCacheKey(key)).toEqual({
      merchantId: TENANT,
      template: "index",
      locale: "bn",
      themeVersion: "v9",
    });
  });

  it("changes key when the published version changes (publish, not purge, wins)", () => {
    const a = storefrontCacheKey({ merchantId: TENANT, template: "index", themeVersion: "v1" });
    const b = storefrontCacheKey({ merchantId: TENANT, template: "index", themeVersion: "v2" });
    expect(a).not.toBe(b);
  });

  it("never lets one tenant's prefix purge another", () => {
    const mine = storefrontCacheKey({ merchantId: TENANT, template: "index" });
    expect(mine.startsWith(tenantCachePrefix(OTHER))).toBe(false);
  });

  it("rejects a key without a tenant or with a separator injected", () => {
    expect(() => storefrontCacheKey({ merchantId: "", template: "index" })).toThrow(/tenant/i);
    expect(() => storefrontCacheKey({ merchantId: `${TENANT}:evil`, template: "index" })).toThrow();
  });

  it("marks only storefront documents shared-cacheable", () => {
    expect(isStorefrontPath("/store/acme")).toBe(true);
    expect(isStorefrontPath("/store/acme/p/shirt")).toBe(true);
    expect(isStorefrontPath("/admin/products")).toBe(false);
    expect(isStorefrontPath("/root")).toBe(false);
  });

  it("varies on language and validates on theme version", () => {
    const headers = storefrontCacheHeaders("v7");
    expect(headers["cache-control"]).toContain(`s-maxage=${EDGE_TTL_SECONDS}`);
    expect(headers["vary"]).toBe("accept-language");
    expect(headers["etag"]).toBe('W/"tv-v7"');
    expect(storefrontCacheHeaders(null)["etag"]).toBeUndefined();
  });
});

describe("8.4 tenant isolation at the resolver", () => {
  it("accepts only a real tenant id", () => {
    expect(isTenantId(TENANT)).toBe(true);
    expect(isTenantId("*")).toBe(false);
    expect(isTenantId("acme:evil")).toBe(false);
    expect(isTenantUuid(TENANT)).toBe(true);
    expect(isTenantUuid("acme")).toBe(false);
    expect(assertTenantId(` ${TENANT} `, "test")).toBe(TENANT);
    expect(() => assertTenantId(null, "test")).toThrow(TenantScopeError);
  });

  it("refuses to resolve widget data without a tenant", async () => {
    await expect(resolveWidgetData("", bundle, {})).rejects.toThrow(TenantScopeError);
    await expect(resolveWidgetData("all", bundle, {})).rejects.toThrow(/tenant/i);
  });

  it("passes the validated tenant to every source loader", async () => {
    const loader: SourceLoader = vi.fn(async () => ({ k1: [] }));
    await resolveWidgetData(` ${TENANT} `, bundle, { collection: loader });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(vi.mocked(loader).mock.calls[0]![0]).toBe(TENANT);
  });

  it("still degrades a failing source to empty rows instead of throwing", async () => {
    const map = await resolveWidgetData(TENANT, bundle, {
      collection: async () => {
        throw new Error("db down");
      },
    });
    expect(map["k1"]).toEqual([]);
  });
});

describe("8.7 observability", () => {
  it("emits resolver latency and outcome series once a template resolves", async () => {
    const { renderPrometheus } = await import("./observability.server");
    await resolveWidgetData(TENANT, bundle, { collection: async () => ({ k1: [] }) });
    const text = renderPrometheus();
    expect(text).toContain("framique_widget_resolver_ms_bucket");
    expect(text).toContain('framique_widget_resolver_total{outcome="ok"');
    expect(text).toContain('source="batch"');
  });

  it("charts render time, resolver latency, widget errors and plugin timeouts", () => {
    const dashboard = readFileSync(
      join(process.cwd(), "ops", "observability", "grafana", "builder-dashboard.json"),
      "utf8",
    );
    for (const metric of [
      "framique_template_render_ms",
      "framique_widget_resolver_ms",
      "framique_widget_errors_total",
      "framique_plugin_hook_total",
    ]) {
      expect(dashboard).toContain(metric);
    }
  });
});
