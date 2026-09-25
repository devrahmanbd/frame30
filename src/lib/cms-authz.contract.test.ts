import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf-8");
}

describe("P0 / P1 CMS Security & Pre-emptive Hardening Contract", () => {
  it("enforces requirePermission on all appearance.functions.ts RPCs", () => {
    const src = read("src/lib/themes/appearance.functions.ts");
    const declarations = src.match(/createServerFn\(/g) ?? [];
    const guards = src.match(/requirePermission\(/g) ?? [];
    expect(declarations.length).toBeGreaterThan(0);
    expect(guards.length).toBe(declarations.length);
    expect(src).not.toContain("requireSupabaseAuth");
  });

  it("enforces requirePermission on all authenticated themes.functions.ts RPCs", () => {
    const src = read("src/lib/themes.functions.ts");
    const declarations = src.match(/export const .* = createServerFn/g) ?? [];
    expect(declarations.length).toBeGreaterThan(1);

    // Every declaration is guarded except the single public endpoint
    // (builderRegistryVersionFn — registry descriptor, no session data).
    const segments = src
      .split(/(?=export const \w+ = createServerFn)/)
      .slice(1);
    expect(segments).toHaveLength(declarations.length);
    const unguarded = segments.filter(
      (block) => !block.includes("requirePermission("),
    );
    expect(unguarded).toHaveLength(1);
    expect(unguarded[0]).toMatch(
      /^export const builderRegistryVersionFn = createServerFn/,
    );
    // No `.middleware(...)` between its createServerFn({...}) and .handler.
    expect(unguarded[0]).toMatch(
      /builderRegistryVersionFn = createServerFn\(\{[^}]*\}\)\.handler/,
    );
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
    // Whitespace-flexible: prettier wraps the status array across lines.
    expect(src).toMatch(
      /\.in\(\s*"status",\s*\[\s*"pending_dns",\s*"verifying",\s*"dns_verified",\s*"issuing_cert",?\s*\]\s*\)/,
    );
  });
});
