/**
 * Custom-domain-only cutover — contract gate.
 *
 * Path-based storefront (`/store/*` on platform hosts) is an abuse surface
 * and must not serve: the gate 410s it (preview drafts + localhost dev
 * excepted; token-gated track/order excepted). Shoppers use the merchant
 * custom domain, which serves deep routes at `/` root paths.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  isBlockedPathStorefront,
  isCustomHostPath,
} from "./storefront-host.server";

describe("isBlockedPathStorefront", () => {
  it("blocks catalog paths on the platform host", () => {
    for (const p of [
      "/store/akira",
      "/store/akira/",
      "/store/akira/p/shirt",
      "/store/akira/c/shoes",
      "/store/akira/pages/about",
      "/store/akira/search",
      "/store/akira/cart",
      "/store/akira/checkout",
      "/store/akira/sitemap.xml",
    ]) {
      expect(
        isBlockedPathStorefront("framique.qubickle.com", p, false),
        p,
      ).toBe(true);
    }
  });

  it("lets token-gated order flows through", () => {
    expect(
      isBlockedPathStorefront("framique.qubickle.com", "/store/a/track", false),
    ).toBe(false);
    expect(
      isBlockedPathStorefront(
        "framique.qubickle.com",
        "/store/a/order/123",
        false,
      ),
    ).toBe(false);
  });

  it("lets draft previews and localhost dev through", () => {
    expect(
      isBlockedPathStorefront("framique.qubickle.com", "/store/a/p/x", true),
    ).toBe(false);
    expect(isBlockedPathStorefront("localhost", "/store/a/p/x", false)).toBe(
      false,
    );
    expect(isBlockedPathStorefront("127.0.0.1", "/store/a", false)).toBe(false);
  });

  it("does not touch non-store paths or custom hosts", () => {
    expect(
      isBlockedPathStorefront("framique.qubickle.com", "/dashboard", false),
    ).toBe(false);
    expect(isBlockedPathStorefront("framique.qubickle.com", "/", false)).toBe(
      false,
    );
    expect(isBlockedPathStorefront("microscrop.shop", "/store/a", false)).toBe(
      false,
    );
    expect(isBlockedPathStorefront(null, "/store/a", false)).toBe(false);
  });
});

describe("isCustomHostPath", () => {
  it("detects root-path custom-host rendering vs /store/ path rendering", () => {
    expect(isCustomHostPath("/p/shirt")).toBe(true);
    expect(isCustomHostPath("/")).toBe(true);
    expect(isCustomHostPath("/store/akira")).toBe(false);
    expect(isCustomHostPath("/store/akira/p/x")).toBe(false);
  });
});

describe("cutover wiring", () => {
  it("server.ts gates platform-host /store/* before SSR", () => {
    const src = readFileSync("src/server.ts", "utf8");
    expect(src).toContain("isBlockedPathStorefront");
    expect(src).toContain("404");
    expect(src).not.toContain("storefronts are served");
  });

  it("server.ts does NOT rewrite custom paths (SSR/client route parity)", () => {
    const src = readFileSync("src/server.ts", "utf8");
    expect(src).not.toContain("/store/${hostRes.merchantSlug}");
    expect(src).toContain("Deleted; do not re-add");
  });

  it("custom-host root routes exist for every deep path", () => {
    for (const file of [
      "src/routes/p.$productSlug.tsx",
      "src/routes/c.$collectionSlug.tsx",
      "src/routes/pages.$pageSlug.tsx",
      "src/routes/search.tsx",
      "src/routes/cart.tsx",
      "src/routes/checkout.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toContain("resolveStorefrontHostFn");
    }
  });

  it("host-explicit resolution exists for entry points", () => {
    const src = readFileSync("src/lib/storefront-host.server.ts", "utf8");
    expect(src).toContain("resolveStorefrontHostFor");
  });
});
