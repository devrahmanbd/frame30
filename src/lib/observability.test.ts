import { describe, expect, it } from "vitest";
import {
  BEACON_MAX_BODY_BYTES,
  checkTimestamp,
  isBodyWithinLimit,
  isJsonContentType,
  isOriginAllowed,
  isValidNonce,
  rejectionStatus,
  safeLandingPath,
  safeReferrerHost,
  signaturePayload,
  timingSafeEqualHex,
} from "./beacon-guard";
import { MetricRegistry, sampleTrace, parseTraceparent, formatTraceparent } from "./telemetry";

describe("beacon guard — media type and size", () => {
  it("accepts JSON with parameters, rejects anything else", () => {
    expect(isJsonContentType("application/json")).toBe(true);
    expect(isJsonContentType("application/json; charset=utf-8")).toBe(true);
    expect(isJsonContentType("text/plain")).toBe(false);
    expect(isJsonContentType(null)).toBe(false);
  });

  it("rejects bodies over the cap by declared or actual size", () => {
    expect(isBodyWithinLimit("100", 100)).toBe(true);
    expect(isBodyWithinLimit(String(BEACON_MAX_BODY_BYTES + 1), 10)).toBe(false);
    expect(isBodyWithinLimit(null, BEACON_MAX_BODY_BYTES + 1)).toBe(false);
  });
});

describe("beacon guard — nonce and freshness", () => {
  it("enforces the nonce charset and length window", () => {
    expect(isValidNonce("a".repeat(16))).toBe(true);
    expect(isValidNonce("a".repeat(15))).toBe(false);
    expect(isValidNonce("a".repeat(65))).toBe(false);
    expect(isValidNonce("has spaces in it!!")).toBe(false);
    expect(isValidNonce(undefined)).toBe(false);
  });

  it("separates stale from future timestamps so metrics show the attack shape", () => {
    const now = 1_700_000_000_000;
    expect(checkTimestamp(now, now)).toBe("ok");
    expect(checkTimestamp(now - 4 * 60_000, now)).toBe("ok");
    expect(checkTimestamp(now - 6 * 60_000, now)).toBe("stale_timestamp");
    expect(checkTimestamp(now + 5 * 60_000, now)).toBe("future_timestamp");
  });
});

describe("beacon guard — origin allowlist", () => {
  it("allows everything only when the merchant configured nothing", () => {
    expect(isOriginAllowed("https://shop.example", [])).toBe(true);
  });

  it("matches on host, ignoring scheme noise and case", () => {
    const allowed = ["shop.example", "https://www.shop.example"];
    expect(isOriginAllowed("https://shop.example", allowed)).toBe(true);
    expect(isOriginAllowed("https://WWW.shop.example", allowed)).toBe(true);
    expect(isOriginAllowed("https://evil.example", allowed)).toBe(false);
    expect(isOriginAllowed(null, allowed)).toBe(false);
  });
});

describe("beacon guard — normalization", () => {
  it("keeps only a bounded path, dropping query strings and absolute URLs", () => {
    expect(safeLandingPath("/p/shoes?utm_source=fb")).toBe("/p/shoes");
    // Absolute URLs are not paths — they are dropped rather than coerced.
    expect(safeLandingPath("https://shop.example/p/shoes?a=1")).toBeNull();
    expect(safeLandingPath("")).toBeNull();
    expect((safeLandingPath("/" + "a".repeat(500)) ?? "").length).toBeLessThanOrEqual(256);
  });

  it("reduces referrers to a host so we never store user URLs", () => {
    expect(safeReferrerHost("https://www.facebook.com/ads/x?id=1")).toBe("www.facebook.com");
    expect(safeReferrerHost("not a url")).toBeNull();
  });
});

describe("beacon guard — signatures", () => {
  it("binds every identity field into the signed payload", () => {
    const payload = signaturePayload({
      merchantId: "m1",
      nonce: "n1",
      sentAt: 123,
      visitorId: "v1",
      network: "meta",
    });
    expect(payload).toBe("m1\nn1\n123\nv1\nmeta");
    // Changing any field must change the payload — no field is optional filler.
    expect(
      signaturePayload({ merchantId: "m1", nonce: "n1", sentAt: 124, visitorId: "v1", network: "meta" }),
    ).not.toBe(payload);
  });

  it("compares hex constant-time and rejects length or content mismatch", () => {
    expect(timingSafeEqualHex("abcd", "abcd")).toBe(true);
    expect(timingSafeEqualHex("abcd", "abce")).toBe(false);
    expect(timingSafeEqualHex("abcd", "abcde")).toBe(false);
    expect(timingSafeEqualHex("", "")).toBe(false);
  });

  it("maps rejection reasons to sane HTTP statuses", () => {
    expect(rejectionStatus("invalid_signature")).toBe(403);
    expect(rejectionStatus("origin_not_allowed")).toBe(403);
    expect(rejectionStatus("payload_too_large")).toBe(413);
    expect(rejectionStatus("unsupported_media_type")).toBe(415);
  });
});

describe("telemetry registry", () => {
  it("aggregates counters per label set and renders Prometheus text", () => {
    const reg = new MetricRegistry();
    reg.describe("t_clicks_total", "counter", "clicks");
    reg.incr("t_clicks_total", { verdict: "valid" });
    reg.incr("t_clicks_total", { verdict: "valid" }, 2);
    reg.incr("t_clicks_total", { verdict: "invalid" });
    const text = reg.render();
    expect(text).toContain("# TYPE t_clicks_total counter");
    expect(text).toContain('t_clicks_total{verdict="valid"} 3');
    expect(text).toContain('t_clicks_total{verdict="invalid"} 1');
  });

  it("renders histograms with cumulative buckets, sum and count", () => {
    const reg = new MetricRegistry();
    reg.observe("t_ms", 5);
    reg.observe("t_ms", 5000);
    const text = reg.render();
    expect(text).toContain("t_ms_count 2");
    expect(text).toContain("t_ms_sum 5005");
    expect(text).toContain('t_ms_bucket{le="+Inf"} 2');
  });

  it("caps cardinality instead of exploding the scrape", () => {
    const reg = new MetricRegistry(10);
    for (let i = 0; i < 50; i += 1) reg.incr("t_wide_total", { id: String(i) });
    expect(reg.totalSeries()).toBeLessThanOrEqual(10);
    expect(reg.droppedSeries()).toBeGreaterThan(0);
  });

  it("escapes label values so a hostile label cannot break the format", () => {
    const reg = new MetricRegistry();
    reg.incr("t_x_total", { route: 'a"b\nc' });
    const text = reg.render();
    expect(text).not.toMatch(/route="a"b/);
    expect(text.split("\n").filter((l) => l.startsWith("t_x_total")).length).toBe(1);
  });
});

describe("trace context", () => {
  it("round-trips a W3C traceparent", () => {
    const tp = formatTraceparent({ traceId: "a".repeat(32), spanId: "b".repeat(16), sampled: true });
    const parsed = parseTraceparent(tp);
    expect(parsed?.traceId).toBe("a".repeat(32));
    expect(parsed?.sampled).toBe(true);
  });

  it("rejects malformed traceparents rather than trusting them", () => {
    expect(parseTraceparent("garbage")).toBeNull();
    expect(parseTraceparent("00-zzz-bbbbbbbbbbbbbbbb-01")).toBeNull();
    expect(parseTraceparent(null)).toBeNull();
  });

  it("samples deterministically on the trace id so a trace is never half-recorded", () => {
    const id = "c".repeat(32);
    expect(sampleTrace(id, 1)).toBe(true);
    expect(sampleTrace(id, 0)).toBe(false);
    expect(sampleTrace(id, 0.5)).toBe(sampleTrace(id, 0.5));
  });
});
