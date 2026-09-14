import { describe, expect, it } from "vitest";
import {
  DomainInputError,
  canTransition,
  certHealth,
  dnsInstructions,
  evaluateDns,
  isApex,
  nextCheckDelaySeconds,
  normalizeHostname,
} from "./domains";

const target = { cname: "edge.framique.app", ips: ["203.0.113.10", "203.0.113.11"] };

describe("normalizeHostname", () => {
  it("strips scheme, path, port and trailing dot", () => {
    expect(normalizeHostname(" HTTPS://Shop.Example.com:443/checkout?a=1 ")).toBe("shop.example.com");
    expect(normalizeHostname("example.com.")).toBe("example.com");
  });

  it("rejects IPs, bare labels, reserved suffixes and reserved sub-domains", () => {
    for (const [input, code] of [
      ["127.0.0.1", "domain.ip_not_allowed"],
      ["localhost", "domain.reserved"],
      ["shop", "domain.needs_tld"],
      ["store.framique.app", "domain.reserved"],
      ["admin.example.com", "domain.reserved_label"],
      ["-bad.example.com", "domain.invalid"],
      ["", "domain.empty"],
    ] as const) {
      expect(() => normalizeHostname(input)).toThrowError(DomainInputError);
      try {
        normalizeHostname(input);
      } catch (err) {
        expect((err as DomainInputError).code).toBe(code);
      }
    }
  });

  it("converts unicode to punycode", () => {
    expect(normalizeHostname("দোকান.example.com")).toMatch(/^xn--/);
  });
});

describe("isApex", () => {
  it("understands multi-part registry suffixes", () => {
    expect(isApex("example.com")).toBe(true);
    expect(isApex("shop.example.com")).toBe(false);
    expect(isApex("example.com.bd")).toBe(true);
    expect(isApex("shop.example.com.bd")).toBe(false);
  });
});

describe("dnsInstructions", () => {
  it("uses CNAME for sub-domains and A records for the apex", () => {
    const sub = dnsInstructions("shop.example.com", "tok", target);
    expect(sub.filter((r) => r.type === "CNAME")).toHaveLength(1);
    expect(sub.some((r) => r.type === "A")).toBe(false);

    const apex = dnsInstructions("example.com", "tok", target);
    expect(apex.filter((r) => r.type === "A")).toHaveLength(2);
    expect(apex.find((r) => r.type === "ALIAS")?.required).toBe(false);
    expect(apex[0]).toMatchObject({ type: "TXT", name: "_framique-challenge.example.com" });
  });
});

describe("state machine", () => {
  it("allows the happy path and blocks illegal jumps", () => {
    expect(canTransition("pending_dns", "verifying")).toBe(true);
    expect(canTransition("verifying", "dns_verified")).toBe(true);
    expect(canTransition("issuing_cert", "active")).toBe(true);
    expect(canTransition("pending_dns", "active")).toBe(false);
    expect(canTransition("disabled", "active")).toBe(false);
    expect(canTransition("active", "active")).toBe(true);
  });
});

describe("backoff and cert health", () => {
  it("backs off exponentially but caps at six hours", () => {
    expect(nextCheckDelaySeconds(0)).toBe(60);
    expect(nextCheckDelaySeconds(3)).toBe(480);
    expect(nextCheckDelaySeconds(50)).toBe(21600);
  });

  it("classifies certificate expiry windows", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(certHealth(null, now).state).toBe("none");
    expect(certHealth("2026-03-01T00:00:00Z", now).state).toBe("ok");
    expect(certHealth("2026-01-20T00:00:00Z", now).state).toBe("renew_soon");
    expect(certHealth("2026-01-05T00:00:00Z", now).state).toBe("expiring");
    expect(certHealth("2025-12-30T00:00:00Z", now).state).toBe("expired");
  });
});

describe("evaluateDns", () => {
  const base = { hostname: "shop.example.com", token: "tok", target };

  it("requires ownership before routing", () => {
    expect(evaluateDns({ ...base, txt: [], cname: ["edge.framique.app"], a: [] }).reason).toBe(
      "domain.txt_missing",
    );
  });

  it("accepts quoted TXT answers and either routing record", () => {
    expect(
      evaluateDns({
        ...base,
        txt: ['"framique-verification=tok"'],
        cname: ["EDGE.framique.app."],
        a: [],
      }),
    ).toEqual({ ownership: true, routing: true, reason: null });

    expect(
      evaluateDns({ ...base, txt: ["framique-verification=tok"], cname: [], a: ["203.0.113.11"] })
        .routing,
    ).toBe(true);

    expect(
      evaluateDns({ ...base, txt: ["framique-verification=tok"], cname: [], a: ["198.51.100.7"] })
        .reason,
    ).toBe("domain.routing_missing");
  });
});
