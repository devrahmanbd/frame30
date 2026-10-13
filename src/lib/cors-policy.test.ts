import { describe, expect, it } from "vitest";
import { resolveAllowedOrigin } from "./cors-policy";

function req(origin: string | null): Request {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  return new Request("https://api.framique.test/v1/cart", { headers });
}

describe("resolveAllowedOrigin", () => {
  it("echoes allowlisted storefront origins", () => {
    expect(resolveAllowedOrigin(req("https://shop.framique.store"))).toBe(
      "https://shop.framique.store",
    );
    expect(resolveAllowedOrigin(req("https://app.framique.com"))).toBe(
      "https://app.framique.com",
    );
    expect(resolveAllowedOrigin(req("https://framique.qubickle.com"))).toBe(
      "https://framique.qubickle.com",
    );
    expect(resolveAllowedOrigin(req("http://localhost:3000"))).toBe(
      "http://localhost:3000",
    );
  });

  it("returns null when no origin is present (non-browser client)", () => {
    expect(resolveAllowedOrigin(req(null))).toBeNull();
  });

  it("returns null for foreign origins instead of a wildcard", () => {
    expect(resolveAllowedOrigin(req("https://evil.example.com"))).toBeNull();
    expect(
      resolveAllowedOrigin(req("https://framique.store.evil.com")),
    ).toBeNull();
    expect(resolveAllowedOrigin(req("https://notframique.com"))).toBeNull();
  });

  it("returns null for malformed origins", () => {
    expect(resolveAllowedOrigin(req("not-a-url"))).toBeNull();
    expect(resolveAllowedOrigin(req(""))).toBeNull();
  });
});
