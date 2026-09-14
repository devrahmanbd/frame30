import { describe, expect, it } from "vitest";
import {
  cacheControlFor,
  contentTypeFor,
  decodeSource,
  decodeSpec,
  encodeSource,
  encodeSpec,
  isAllowedSource,
  negotiateFormat,
  normalizeSpec,
  safeEqualHex,
  snapWidth,
} from "./image-transform";

describe("snapWidth", () => {
  it("snaps to the ladder so the CDN can actually cache", () => {
    expect(snapWidth(300)).toBe(384);
    expect(snapWidth(64)).toBe(64);
  });

  it("caps at the largest rung", () => {
    expect(snapWidth(99_999)).toBe(1920);
  });
});

describe("normalizeSpec", () => {
  it("clamps quality into a sane band", () => {
    expect(normalizeSpec({ quality: 1 }).quality).toBe(30);
    expect(normalizeSpec({ quality: 100 }).quality).toBe(95);
  });

  it("defaults unknown resize modes to inside", () => {
    expect(normalizeSpec({ resize: "weird" as never }).resize).toBe("inside");
  });
});

describe("negotiateFormat", () => {
  it("prefers avif, then webp, then jpeg", () => {
    expect(negotiateFormat("image/avif,image/webp,*/*", "auto")).toBe("avif");
    expect(negotiateFormat("image/webp,*/*", "auto")).toBe("webp");
    expect(negotiateFormat("*/*", "auto")).toBe("jpeg");
    expect(negotiateFormat(null, "auto")).toBe("jpeg");
  });

  it("never overrides an explicit format", () => {
    expect(negotiateFormat("image/avif", "png")).toBe("png");
  });

  it("maps content types correctly", () => {
    expect(contentTypeFor("jpeg")).toBe("image/jpeg");
    expect(contentTypeFor("avif")).toBe("image/avif");
  });
});

describe("path coding", () => {
  it("round-trips a spec", () => {
    const spec = normalizeSpec({ width: 640, height: 480, resize: "cover", quality: 80, format: "webp" });
    expect(decodeSpec(encodeSpec(spec))).toEqual(spec);
  });

  it("rejects a malformed spec segment", () => {
    expect(decodeSpec("w-1_hx_cover_q80_webp")).toBeNull();
  });

  it("round-trips a source url including query strings", () => {
    const url = "https://cdn.example.com/a/b.png?v=2&x=%20";
    expect(decodeSource(encodeSource(url))).toBe(url);
  });

  it("returns null for undecodable source", () => {
    expect(decodeSource("!!!not base64!!!")).toBeNull();
  });
});

describe("isAllowedSource (SSRF guard)", () => {
  const hosts = ["cdn.example.com", "supabase.co"];

  it("allows an exact host and its subdomains", () => {
    expect(isAllowedSource("https://cdn.example.com/a.jpg", hosts).ok).toBe(true);
    expect(isAllowedSource("https://bucket.supabase.co/a.jpg", hosts).ok).toBe(true);
  });

  it("blocks non-https", () => {
    expect(isAllowedSource("http://cdn.example.com/a.jpg", hosts)).toMatchObject({ reason: "not_https" });
  });

  it("blocks hosts that are not allow-listed", () => {
    expect(isAllowedSource("https://evil.com/a.jpg", hosts)).toMatchObject({
      reason: "host_not_allowed",
    });
  });

  it("blocks the cloud metadata endpoint and loopback", () => {
    expect(isAllowedSource("https://169.254.169.254/latest/meta-data", hosts).ok).toBe(false);
    expect(isAllowedSource("https://127.0.0.1/admin", hosts).ok).toBe(false);
  });

  it("blocks credentials embedded in the url", () => {
    expect(isAllowedSource("https://u:p@cdn.example.com/a.jpg", hosts)).toMatchObject({
      reason: "credentials_in_url",
    });
  });

  it("is not fooled by a suffix lookalike domain", () => {
    expect(isAllowedSource("https://notcdn.example.com.evil.io/a.jpg", hosts).ok).toBe(false);
  });

  it("rejects garbage input", () => {
    expect(isAllowedSource("not a url", hosts)).toMatchObject({ reason: "bad_url" });
  });
});

describe("safeEqualHex", () => {
  it("matches identical strings and rejects different ones", () => {
    expect(safeEqualHex("abc123", "abc123")).toBe(true);
    expect(safeEqualHex("abc123", "abc124")).toBe(false);
    expect(safeEqualHex("abc", "abc123")).toBe(false);
  });
});

describe("cacheControlFor", () => {
  it("marks verified renders immutable and errors short-lived", () => {
    expect(cacheControlFor(true)).toContain("immutable");
    expect(cacheControlFor(false)).toContain("max-age=60");
  });
});
