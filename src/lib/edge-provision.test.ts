import { describe, expect, it } from "vitest";
import {
  CERT_SCRIPT,
  buildIssueCommand,
  isProvisionableHost,
  shouldProvisionNow,
} from "./edge-provision.server";

describe("edge provision guard", () => {
  it("accepts plain hostnames, rejects everything hostile", () => {
    expect(isProvisionableHost("flamelancer.com")).toBe(true);
    expect(isProvisionableHost("shop.example.com.bd")).toBe(true);
    for (const evil of [
      "",
      "a",
      "localhost",
      "127.0.0.1",
      "shop;rm -rf /",
      "shop.example.com && id",
      "shop\nexample.com",
      "shop example.com",
      "-evil.com",
      ".example.com",
      "a".repeat(254),
      "UPPER.EXAMPLE.COM",
    ]) {
      expect(isProvisionableHost(evil), evil).toBe(false);
    }
  });

  it("builds a fixed-shape script call (hostname is data, never flags)", () => {
    expect(buildIssueCommand("flamelancer.com", {})).toEqual([
      CERT_SCRIPT,
      "flamelancer.com",
      "live",
    ]);
    expect(buildIssueCommand("flamelancer.com", { staging: true })).toEqual([
      CERT_SCRIPT,
      "flamelancer.com",
      "staging",
    ]);
  });

  it("throws instead of building for hostile input", () => {
    expect(() => buildIssueCommand("x; rm -rf /", {})).toThrow();
    expect(() =>
      buildIssueCommand("flamelancer.com", { email: "not-an-email" }),
    ).toThrow();
  });
});

describe("provision single-flight + cooldown", () => {
  it("coalesces concurrent orders and cools down after success", () => {
    let now = 1_000_000;
    const clock = () => now;
    expect(shouldProvisionNow("a.com", new Map(), clock)).toBe("go");
    const inflight = new Map([["a.com", 1_000_000]]);
    expect(shouldProvisionNow("a.com", inflight, clock)).toBe("inflight");
    now += 5 * 60_000;
    expect(shouldProvisionNow("a.com", inflight, clock)).toBe("inflight");
    now += 10 * 60_000;
    expect(shouldProvisionNow("a.com", inflight, clock)).toBe("go");
  });

  it("script path is the pinned system path", () => {
    expect(CERT_SCRIPT).toBe("/usr/local/bin/framique-cert-issue.sh");
  });
});
