import { describe, expect, it } from "vitest";
import {
  isPersonalizedStorefrontPath,
  isStorefrontPath,
  personalizedNoStoreHeaders,
} from "./storefront-cache";

describe("personalized storefront guard (REPORT WF-09)", () => {
  it("flags shopper-specific pages in path-based shape", () => {
    for (const path of [
      "/store/acme/cart",
      "/store/acme/checkout",
      "/store/acme/account",
      "/store/acme/account/orders",
      "/store/acme/order/ord_123",
      "/store/acme/track",
      "/store/acme/Cart",
    ]) {
      expect(isPersonalizedStorefrontPath(path)).toBe(true);
    }
  });

  it("flags shopper-specific pages in custom-domain shape", () => {
    for (const path of ["/cart", "/checkout", "/account", "/order/ord_123", "/track"]) {
      expect(isPersonalizedStorefrontPath(path)).toBe(true);
    }
  });

  it("leaves anonymous catalog docs cacheable, not personalized", () => {
    for (const path of [
      "/store/acme",
      "/store/acme/p/hoodie",
      "/store/acme/c/new",
      "/store/acme/pages/about",
      "/store/acme/search",
      "/",
      "/p/hoodie",
      "/c/new",
      "/pages/about",
    ]) {
      expect(isPersonalizedStorefrontPath(path)).toBe(false);
      expect(isStorefrontPath(path)).toBe(true);
    }
  });

  it("never marks console/api/auth paths personalized", () => {
    for (const path of ["/dashboard", "/root/ai", "/api/public/media/x", "/auth", "/_authenticated"]) {
      expect(isPersonalizedStorefrontPath(path)).toBe(false);
    }
  });

  it("emits private no-store headers", () => {
    expect(personalizedNoStoreHeaders()["cache-control"]).toBe("private, no-store");
  });
});
