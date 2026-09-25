/**
 * Host-aware storefront hrefs — TDD: every widget row links to a routable
 * URL on both custom hosts (root shape) and path hosts (localhost dev).
 */
import { describe, expect, it } from "vitest";
import { storeHref } from "./widget-data";

describe("storeHref", () => {
  it("builds root-shape links for custom hosts", () => {
    expect(storeHref("", "product", "saree")).toBe("/p/saree");
    expect(storeHref("", "collection", "eid")).toBe("/c/eid");
    expect(storeHref("", "post", "hello")).toBe("/blog/hello");
    expect(storeHref("", "category", "womens")).toBe("/search?category=womens");
    expect(storeHref("", "brand", "Aarong")).toBe("/search?q=Aarong");
  });

  it("builds path-shape links for path hosts", () => {
    const base = "/store/akira";
    expect(storeHref(base, "product", "saree")).toBe("/store/akira/p/saree");
    expect(storeHref(base, "collection", "eid")).toBe("/store/akira/c/eid");
    expect(storeHref(base, "category", "womens")).toBe(
      "/store/akira/search?category=womens",
    );
  });

  it("sanitizes hostile slugs", () => {
    expect(storeHref("", "product", "../x")).toBe("/p/x");
    expect(storeHref("", "product", "")).toBe("/p");
  });
});

describe("storeLinkBase", () => {
  it("picks root shape on custom hosts, path shape elsewhere", async () => {
    const { storeLinkBase } = await import("./storefront-host.server");
    expect(storeLinkBase("microscrop.shop", "akira")).toBe("");
    expect(storeLinkBase("framique.qubickle.com", "akira")).toBe(
      "/store/akira",
    );
    expect(storeLinkBase("localhost", "akira")).toBe("/store/akira");
    expect(storeLinkBase(null, "akira")).toBe("/store/akira");
  });
});
