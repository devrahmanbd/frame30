import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf-8");
}

describe("P0 / P1 CMS Security & Pre-emptive Hardening Contract", () => {
  it("appearance.functions.ts RPCs are retired with the theme purge (no theme lifecycle surface)", () => {
    expect(existsSync(resolve(process.cwd(), "src/lib/themes/appearance.functions.ts"))).toBe(
      false,
    );
    expect(existsSync(resolve(process.cwd(), "src/lib/themes/appearance.server.ts"))).toBe(
      false,
    );
  });

  it("enforces requirePermission on all authenticated themes.functions.ts RPCs", () => {
    const src = read("src/lib/themes.functions.ts");
    // All functions except public builderRegistryVersionFn must enforce requirePermission
    const guards = src.match(/requirePermission\(/g) ?? [];
    expect(guards.length).toBe(14);
    expect(src).not.toContain("requireSupabaseAuth");
  });

  it("enforces requirePermission on all plugins.functions.ts RPCs", () => {
    const src = read("src/lib/plugins.functions.ts");
    const declarations = src.match(/createServerFn\(/g) ?? [];
    const guards = src.match(/requirePermission\(/g) ?? [];
    expect(declarations.length).toBeGreaterThan(0);
    expect(guards.length).toBe(declarations.length);
    expect(src).not.toContain("requireSupabaseAuth");
  });

  it("enforces stable idempotency in marketplace/index.tsx (no Date.now)", () => {
    const src = read(
      "src/routes/_authenticated/dashboard/marketplace/index.tsx",
    );
    expect(src).not.toMatch(/idempotencyKey:.*Date\.now\(\)/);
    expect(src).toContain("idempotencyKey: stableKey");
  });

  it("closes CSRF fail-open hole on /api/ mutations in server.ts", () => {
    const src = read("src/server.ts");
    expect(src).not.toContain('!url.pathname.startsWith("/api/")');
    expect(src).toContain("hasToken");
    expect(src).toContain("authorization");
  });

  it("does not echo internal x-framique-tenant-id to public shoppers in server.ts", () => {
    const src = read("src/server.ts");
    expect(src).not.toContain(
      'headers.set("x-framique-tenant-id", decision.tenantId)',
    );
  });

  it("sanitizes SVGs on the legacy media upload path in media.server.ts", () => {
    const src = read("src/lib/media.server.ts");
    expect(src).toContain("sanitiseSvg");
    expect(src).toContain('contentType.toLowerCase() === "image/svg+xml"');
  });

  it("serves SVGs with attachment disposition and sandbox CSP in media/$.ts", () => {
    const src = read("src/routes/api/public/media/$.ts");
    expect(src).toContain("isSvg");
    expect(src).toContain('"attachment"');
    expect(src).toContain("content-security-policy");
    expect(src).toContain("default-src 'none'");
  });

  it("includes host in Vary header for multi-tenant edge cache safety", () => {
    const src = read("src/lib/storefront-cache.ts");
    expect(src).toContain('"accept-language, host"');
  });

  it("rate-limits and negatively caches verify-sni.ts", () => {
    const src = read("src/routes/api/public/domains/verify-sni.ts");
    expect(src).toContain("enforceRateLimit");
    expect(src).toContain("NEGATIVE_CACHE");
    expect(src).toContain("max-age=15");
  });

  it("includes issuing_cert in sweepDomains background polling in domains.server.ts", () => {
    const src = read("src/lib/domains.server.ts");
    expect(src).toContain(
      '.in("status", ["pending_dns", "verifying", "dns_verified", "issuing_cert"])',
    );
  });
});
