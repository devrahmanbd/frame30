import { describe, expect, it } from "vitest";
import { isLocalHostname } from "./edge-hosts";

describe("isLocalHostname (REPORT WF-10)", () => {
  it("accepts genuine local hostnames", () => {
    for (const host of [
      "localhost",
      "LOCALHOST",
      "  localhost  ",
      "127.0.0.1",
      "::1",
      "[::1]",
      "app.localhost",
      "framique.local",
      "shop.framique.test",
      "framique.test",
    ]) {
      expect(isLocalHostname(host)).toBe(true);
    }
  });

  it("rejects attacker hostnames that merely contain localhost", () => {
    for (const host of [
      "localhost.evil.com",
      "mylocalhost.com",
      "evil-localhost.com",
      "localhostattacker.io",
      "127.0.0.1.evil.com",
      "fakelocal",
      "contest",
      "example.com",
      "brand.framique.store",
      "",
    ]) {
      expect(isLocalHostname(host)).toBe(false);
    }
  });

  it("handles trailing-dot FQDN form", () => {
    expect(isLocalHostname("localhost.")).toBe(true);
    expect(isLocalHostname("localhost.evil.com.")).toBe(false);
  });
});
