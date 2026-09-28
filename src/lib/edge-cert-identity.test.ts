import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  certCoversHost,
  servedIdentityMatches,
} from "./edge-cert-identity.server";

const PEM = readFileSync(
  new URL("./fixtures/skew-test-cert.pem", import.meta.url),
  "utf8",
);

function certLike(cn: string | null, sans: string[]) {
  return { subject: { CN: cn ?? undefined }, sans };
}

describe("servedIdentityMatches (wrong-cert / replica-skew detector)", () => {
  it("matches an exact SAN entry", () => {
    expect(
      servedIdentityMatches(
        "shop.example.com",
        certLike("other.example.com", ["shop.example.com"]),
      ),
    ).toBe(true);
  });

  it("rejects the shared default cert served for a custom domain", () => {
    // The diagnosed skew symptom: flamelancer.com served bitcart.ghostmaster.shop.
    expect(
      servedIdentityMatches(
        "flamelancer.com",
        certLike("bitcart.ghostmaster.shop", ["bitcart.ghostmaster.shop"]),
      ),
    ).toBe(false);
  });

  it("falls back to CN only when no SAN is present (Node semantics)", () => {
    expect(
      servedIdentityMatches(
        "shop.example.com",
        certLike("shop.example.com", []),
      ),
    ).toBe(true);
    expect(
      servedIdentityMatches(
        "shop.example.com",
        certLike("other.example.com", []),
      ),
    ).toBe(false);
  });

  it("ignores CN when SANs exist", () => {
    expect(
      servedIdentityMatches(
        "shop.example.com",
        certLike("shop.example.com", ["other.example.com"]),
      ),
    ).toBe(false);
  });

  it("matches a single-label wildcard but not across labels", () => {
    const wild = certLike(null, ["*.example.com"]);
    expect(servedIdentityMatches("a.example.com", wild)).toBe(true);
    expect(servedIdentityMatches("a.b.example.com", wild)).toBe(false);
    expect(servedIdentityMatches("example.com", wild)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(
      servedIdentityMatches(
        "Shop.Example.COM",
        certLike(null, ["shop.example.com"]),
      ),
    ).toBe(true);
  });

  it("never matches on empty identity", () => {
    expect(servedIdentityMatches("shop.example.com", certLike(null, []))).toBe(
      false,
    );
  });
});

describe("certCoversHost (local PEM SAN check)", () => {
  it("accepts the fixture PEM for its own hostname", () => {
    expect(certCoversHost(PEM, "shop.example.com")).toBe(true);
  });

  it("accepts the fixture wildcard for a sibling host", () => {
    expect(certCoversHost(PEM, "other.example.com")).toBe(true);
  });

  it("rejects the fixture PEM for an unrelated host", () => {
    expect(certCoversHost(PEM, "flamelancer.com")).toBe(false);
  });

  it("rejects garbage instead of throwing", () => {
    expect(certCoversHost("not-a-pem", "shop.example.com")).toBe(false);
  });
});
