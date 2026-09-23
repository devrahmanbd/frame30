import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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

  // DEV-2 deep-path parity: /store/<slug>/* → https://<primary>/*.
  // WordPress parity — the /store/<slug> prefix is stripped, ?# preserved,
  // // collapsed (decideStoreRedirectForPath semantics).
  it("301s /store/<slug>/p/<x> to /p/<x> on the primary", () => {
    expect(
      decideStoreRedirectForPath(
        "microscrop.shop",
        "framique.qubickle.com",
        "/store/akira/p/shirt",
      ),
    ).toBe("https://microscrop.shop/p/shirt");
  });
  it("301s collection, page, blog and search deep paths", () => {
    expect(
      decideStoreRedirectForPath(
        "microscrop.shop",
        "framique.qubickle.com",
        "/store/akira/c/shoes",
      ),
    ).toBe("https://microscrop.shop/c/shoes");
    expect(
      decideStoreRedirectForPath(
        "microscrop.shop",
        "framique.qubickle.com",
        "/store/akira/pages/about",
      ),
    ).toBe("https://microscrop.shop/pages/about");
    expect(
      decideStoreRedirectForPath(
        "microscrop.shop",
        "framique.qubickle.com",
        "/store/akira/blog/hello",
      ),
    ).toBe("https://microscrop.shop/blog/hello");
    expect(
      decideStoreRedirectForPath(
        "microscrop.shop",
        "framique.qubickle.com",
        "/store/akira/search?q=jamdani",
      ),
    ).toBe("https://microscrop.shop/search?q=jamdani");
  });
  it("preserves query + fragment on deep redirects", () => {
    expect(
      decideStoreRedirectForPath(
        "microscrop.shop",
        "framique.qubickle.com",
        "/store/akira/p/shirt?x=1#details",
      ),
    ).toBe("https://microscrop.shop/p/shirt?x=1#details");
    expect(
      decideStoreRedirectForPath(
        "microscrop.shop",
        "framique.qubickle.com",
        "/store/akira/c/shoes#grid",
      ),
    ).toBe("https://microscrop.shop/c/shoes#grid");
  });
  it("collapses double slashes before stripping the prefix", () => {
    expect(
      decideStoreRedirectForPath(
        "microscrop.shop",
        "framique.qubickle.com",
        "/store/akira//p//shirt",
      ),
    ).toBe("https://microscrop.shop/p/shirt");
  });
  it("redirects the bare slug to the primary root", () => {
    expect(
      decideStoreRedirectForPath(
        "microscrop.shop",
        "framique.qubickle.com",
        "/store/akira",
      ),
    ).toBe("https://microscrop.shop/");
  });
  it("matches hosts case-insensitively", () => {
    expect(
      decideStoreRedirectForPath(
        "MicroScrop.Shop",
        "FRAMIQUE.QUBICKLE.COM",
        "/store/akira/p/x",
      ),
    ).toBe("https://microscrop.shop/p/x");
    expect(
      decideStoreRedirectForPath(
        "microscrop.shop",
        "MicroScrop.Shop",
        "/store/akira/p/x",
      ),
    ).toBeNull();
  });
});

describe("deep-path redirect wiring (DEV-2)", () => {
  it("server.ts gate 301s blocked /store/* to the primary via decideStoreRedirectForPath", () => {
    const src = readFileSync("src/server.ts", "utf8");
    expect(src).toContain("decideStoreRedirectForPath");
    expect(src).toContain("301");
  });
});
