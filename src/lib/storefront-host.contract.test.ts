/**
 * Custom-domain storefront serving — contract gate.
 *
 * Guards the WordPress-parity requirement "a store live ON the custom domain":
 * - Unknown hosts, platform hosts and non-`active` domain rows resolve to
 *   null (the caller falls through to normal routes; `/` keeps serving the
 *   platform landing).
 * - Active rows resolve — primary AND non-primary alike serve the store.
 * - Header injection (path traversal, scheme, whitespace) is rejected at
 *   normalization; a `:port` suffix is stripped, not rejected.
 * - `/store/<slug>` path URLs 301 to `https://<primary>/` only when a primary
 *   exists and the request is not already on it.
 * - Structural: `/` branches on `resolveStorefrontHostFn`, and the store
 *   index route enforces the primary redirect in `beforeLoad`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  decideHostResolution,
  decideStoreRedirect,
  isPlatformHost,
  normalizeRequestHost,
} from "./storefront-host.server";

const ACTIVE_PRIMARY = {
  merchant_id: "m-1",
  hostname: "microscrop.shop",
  status: "active",
  is_primary: true,
  merchantSlug: "flame-fashion-bd",
};

const ACTIVE_NON_PRIMARY = {
  ...ACTIVE_PRIMARY,
  hostname: "shop.microscrop.shop",
  is_primary: false,
};

describe("normalizeRequestHost", () => {
  it("lowercases, strips port and a trailing FQDN dot", () => {
    expect(normalizeRequestHost("MicroScrop.Shop:443")).toBe("microscrop.shop");
    expect(normalizeRequestHost("shop.example.com.")).toBe("shop.example.com");
    expect(normalizeRequestHost("  SHOP.Example.COM  ")).toBe(
      "shop.example.com",
    );
  });

  it("takes the first value of a proxy chain", () => {
    expect(normalizeRequestHost("shop.example.com, edge.internal")).toBe(
      "shop.example.com",
    );
  });

  it("rejects header injection and non-host values", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "microscrop.shop/evil",
      "microscrop.shop?x=1",
      "microscrop.shop#frag",
      "user@microscrop.shop",
      "https://microscrop.shop/",
      "microscrop.shop\\evil",
      "micro scrop.shop",
      "microscrop.shop\n.evil.com",
      "../traversal",
      "shop",
      "localhost",
      "[::1]",
      "microscrop.shop:notaport",
      "a".repeat(254),
    ]) {
      expect(
        normalizeRequestHost(bad as string | null),
        String(bad),
      ).toBeNull();
    }
  });
});

describe("isPlatformHost", () => {
  it("keeps platform origins on platform routing", () => {
    for (const h of [
      "localhost",
      "127.0.0.1",
      "framique.qubickle.com",
      "edge.framique.store",
      "app.framique.app",
      "framique.com",
    ]) {
      expect(isPlatformHost(h), h).toBe(true);
    }
  });

  it("lets merchant domains through to the DB lookup", () => {
    expect(isPlatformHost("microscrop.shop")).toBe(false);
    expect(isPlatformHost("shop.example.com.bd")).toBe(false);
  });
});

describe("decideHostResolution", () => {
  it("unknown host resolves to null (falls through to normal routes)", () => {
    expect(decideHostResolution("unknown.example.com", null)).toBeNull();
    expect(decideHostResolution(null, ACTIVE_PRIMARY)).toBeNull();
  });

  it("unproven rows resolve to null", () => {
    for (const status of ["pending_dns", "verifying", "failed", "disabled"]) {
      expect(
        decideHostResolution("microscrop.shop", {
          ...ACTIVE_PRIMARY,
          status,
        }),
        status,
      ).toBeNull();
    }
  });

  it("proven-but-uncertified rows resolve (same set the edge SNI gate allows)", () => {
    for (const status of ["dns_verified", "issuing_cert", "active"]) {
      const out = decideHostResolution("microscrop.shop", {
        ...ACTIVE_PRIMARY,
        status,
      });
      expect(out, status).not.toBeNull();
      expect(out?.merchantSlug).toBe("flame-fashion-bd");
    }
  });

  it("active non-primary domains resolve (serve the store, no redirect)", () => {
    expect(
      decideHostResolution("shop.microscrop.shop", ACTIVE_NON_PRIMARY),
    ).toEqual({
      merchantId: "m-1",
      merchantSlug: "flame-fashion-bd",
      hostname: "shop.microscrop.shop",
      isPrimary: false,
    });
  });

  it("active primary domains resolve with isPrimary", () => {
    expect(
      decideHostResolution("microscrop.shop", ACTIVE_PRIMARY),
    ).toMatchObject({ merchantSlug: "flame-fashion-bd", isPrimary: true });
  });

  it("never resolves platform hosts even with a matching row", () => {
    expect(
      decideHostResolution("framique.qubickle.com", {
        ...ACTIVE_PRIMARY,
        hostname: "framique.qubickle.com",
      }),
    ).toBeNull();
  });

  it("a row without a merchant slug never resolves", () => {
    expect(
      decideHostResolution("microscrop.shop", {
        ...ACTIVE_PRIMARY,
        merchantSlug: null,
      }),
    ).toBeNull();
  });
});

describe("decideStoreRedirect (redirect_to_primary)", () => {
  it("keeps path URLs working when there is no primary", () => {
    expect(decideStoreRedirect(null, "framique.qubickle.com")).toBeNull();
  });

  it("301s path traffic to the primary host", () => {
    expect(
      decideStoreRedirect("microscrop.shop", "framique.qubickle.com"),
    ).toBe("https://microscrop.shop/");
  });

  it("never self-redirects when already on the primary host", () => {
    expect(
      decideStoreRedirect("microscrop.shop", "microscrop.shop"),
    ).toBeNull();
    expect(
      decideStoreRedirect("microscrop.shop", "MicroScrop.Shop"),
    ).toBeNull();
  });
});

describe("route wiring", () => {
  const index = readFileSync("src/routes/index.tsx", "utf8");
  const storeIndex = readFileSync("src/routes/store.$slug.index.tsx", "utf8");
  const fns = readFileSync("src/lib/storefront.functions.ts", "utf8");

  it("`/` resolves the request host and only then serves a storefront", () => {
    expect(index).toContain("resolveStorefrontHostFn");
    expect(index).toContain('kind: "store"');
    expect(index).toContain("getLanding()");
  });

  it("the store index enforces the primary redirect in beforeLoad", () => {
    expect(storeIndex).toContain("beforeLoad");
    expect(storeIndex).toContain("resolveStoreRedirectFn");
    expect(storeIndex).toContain("301");
  });

  it("server functions exist for host resolution and redirect checks", () => {
    expect(fns).toContain("resolveStorefrontHostFn");
    expect(fns).toContain("resolveStoreRedirectFn");
  });

  it("host resolution is cached with the tenant-canary window", () => {
    const server = readFileSync("src/lib/storefront-host.server.ts", "utf8");
    expect(server).toContain("300");
    expect(server).toContain('status", "active"');
  });
});
