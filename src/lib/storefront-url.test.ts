import { describe, expect, it } from "vitest";
import {
  storefrontPathForMerchant,
  storefrontUrlForMerchant,
  storePageUrlForMerchant,
} from "./storefront-url";

describe("storefrontUrlForMerchant (dashboard View-store anchor)", () => {
  it("links to the primary custom domain when one exists", () => {
    expect(storefrontUrlForMerchant("microscrop.shop", "akira")).toBe(
      "https://microscrop.shop/",
    );
  });

  it("falls back to the path URL when there is no primary", () => {
    expect(storefrontUrlForMerchant(null, "akira")).toBe("/store/akira");
  });
});

describe("storefrontPathForMerchant (subpaths)", () => {
  it("resolves against the primary domain when present", () => {
    expect(
      storefrontPathForMerchant("microscrop.shop", "akira", "sitemap.xml"),
    ).toBe("https://microscrop.shop/sitemap.xml");
    expect(
      storefrontPathForMerchant("microscrop.shop", "akira", "/search"),
    ).toBe("https://microscrop.shop/search");
  });

  it("falls back to path URLs", () => {
    expect(storefrontPathForMerchant(null, "akira", "sitemap.xml")).toBe(
      "/store/akira/sitemap.xml",
    );
  });
});

describe("storePageUrlForMerchant homepage root", () => {
  it("points the designated homepage at the store root", () => {
    expect(
      storePageUrlForMerchant("microscrop.shop", "akira", "anything", false, true),
    ).toBe("https://microscrop.shop/");
    expect(
      storePageUrlForMerchant(null, "akira", "anything", false, true),
    ).toBe("/store/akira/");
  });

  it("keeps normal pages on their page URLs", () => {
    expect(
      storePageUrlForMerchant("microscrop.shop", "akira", "about", false, false),
    ).toBe("https://microscrop.shop/pages/about");
  });

  it("builds page URLs with optional preview flag", () => {
    expect(
      storePageUrlForMerchant("microscrop.shop", "akira", "about", false),
    ).toBe("https://microscrop.shop/pages/about");
    expect(
      storePageUrlForMerchant("microscrop.shop", "akira", "about", true),
    ).toBe("https://microscrop.shop/pages/about?preview=1");
    expect(storePageUrlForMerchant(null, "akira", "about", false)).toBe(
      "/store/akira/pages/about",
    );
    expect(storePageUrlForMerchant(null, "akira", "about", true)).toBe(
      "/store/akira/pages/about?preview=1",
    );
  });
});
