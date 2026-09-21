import { describe, expect, it } from "vitest";
import { decideStoreRedirectForPath } from "./storefront-host.server";

describe("decideStoreRedirectForPath (custom-domain-only)", () => {
  it("keeps path URLs when no primary", () => {
    expect(
      decideStoreRedirectForPath(null, "framique.qubickle.com", "/p/shirt"),
    ).toBeNull();
  });
  it("301s deep path traffic to primary preserving subpath", () => {
    expect(
      decideStoreRedirectForPath(
        "microscrop.shop",
        "framique.qubickle.com",
        "/store/akira/p/shirt?x=1",
      ),
    ).toBe("https://microscrop.shop/p/shirt?x=1");
  });
  it("never self-redirects on primary host", () => {
    expect(
      decideStoreRedirectForPath("microscrop.shop", "microscrop.shop", "/p/x"),
    ).toBeNull();
  });
});
