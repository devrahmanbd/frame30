import { describe, expect, it } from "vitest";
import { storefrontUrlForMerchant } from "./storefront-url";

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
