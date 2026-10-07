import { describe, expect, it } from "vitest";

import {
  isServablePkgKind,
  parsePkgSplat,
  parsePkgVersion,
  pkgContentType,
  resolvePkgAsset,
  type PkgRow,
  type PkgTarget,
} from "./package-serve";

const MERCHANT_A = "11111111-1111-1111-1111-111111111111";
const MERCHANT_B = "22222222-2222-2222-2222-222222222222";
const CSS_NAME = "themes/ver-1/assets/styles/skins.css";
const SVG_NAME = "themes/ver-1/assets/assets/hero.svg";
const VERSION = "9f2c41ab";
const URL = `/pkg/${MERCHANT_A}/${CSS_NAME}?v=${VERSION}`;

const cssRow = (over: Partial<PkgRow> = {}): PkgRow => ({
  merchant_id: MERCHANT_A,
  name: CSS_NAME,
  kind: "css",
  content: ".a{color:red}",
  url: URL,
  enabled: true,
  ...over,
});

const target = (over: Partial<PkgTarget> = {}): PkgTarget => ({
  merchantId: MERCHANT_A,
  name: CSS_NAME,
  ...over,
});

describe("pkg serving — path parsing", () => {
  it("parses a minted theme asset URL", () => {
    expect(parsePkgSplat(`${MERCHANT_A}/${CSS_NAME}`)).toEqual({
      merchantId: MERCHANT_A,
      name: CSS_NAME,
    });
  });

  it("parses a plugin namespace", () => {
    const name = "plugins/acme/9f2c41ab/assets/templates/card.json";
    expect(parsePkgSplat(`${MERCHANT_A}/${name}`)).toEqual({
      merchantId: MERCHANT_A,
      name,
    });
  });

  it("rejects traversal: literal .., encoded %2e%2e, %2F and backslash", () => {
    const bad = [
      `${MERCHANT_A}/themes/ver-1/assets/../other.css`,
      `${MERCHANT_A}/themes/ver-1/assets/%2e%2e/other.css`,
      `${MERCHANT_A}/${encodeURIComponent("themes/ver-1")}%2Fassets%2Fx.css`,
      `${MERCHANT_A}/themes/ver-1%5Cassets%5Cx.css`,
      `${MERCHANT_A}/themes/ver-1/assets/%00x.css`,
      `${MERCHANT_A}/themes/ver-1/assets/.`,
    ];
    for (const splat of bad) expect(parsePkgSplat(splat)).toBeNull();
  });

  it("rejects non-namespace names and non-uuid merchants", () => {
    expect(parsePkgSplat(`${MERCHANT_A}/etc/passwd`)).toBeNull();
    expect(parsePkgSplat(`${MERCHANT_A}/themes/ver-1/assets`)).toBeNull();
    expect(parsePkgSplat(`not-a-uuid/${CSS_NAME}`)).toBeNull();
    expect(parsePkgSplat(`*/${CSS_NAME}`)).toBeNull();
    expect(parsePkgSplat(MERCHANT_A)).toBeNull();
    expect(parsePkgSplat("")).toBeNull();
  });

  it("rejects malformed percent-encoding", () => {
    expect(parsePkgSplat(`${MERCHANT_A}/themes%2G/assets/x.css`)).toBeNull();
  });
});

describe("pkg serving — version pin", () => {
  it("accepts the minted hash shape only", () => {
    expect(parsePkgVersion(VERSION)).toBe(VERSION);
    expect(parsePkgVersion(null)).toBeNull();
    expect(parsePkgVersion("")).toBeNull();
    expect(parsePkgVersion("9F2C41AB")).toBeNull();
    expect(parsePkgVersion("../../etc")).toBeNull();
    expect(parsePkgVersion("9f2c41ab-extra")).toBeNull();
  });

  it("a stale or forged ?v= cannot ride the immutable cache", () => {
    expect(resolvePkgAsset(target(), "deadbeef", cssRow()).status).toBe(404);
    expect(resolvePkgAsset(target(), null, cssRow()).status).toBe(404);
  });
});

describe("pkg serving — merchant isolation", () => {
  it("a merchant-B row addressed under merchant-A misses", () => {
    const foreign = cssRow({ merchant_id: MERCHANT_B });
    expect(resolvePkgAsset(target(), VERSION, foreign)).toEqual({
      status: 404,
      reason: "mismatch",
    });
  });

  it("a row for another name under the same merchant misses", () => {
    const other = cssRow({ name: "themes/ver-2/assets/styles/skins.css" });
    expect(resolvePkgAsset(target(), VERSION, other)).toEqual({
      status: 404,
      reason: "mismatch",
    });
  });

  it("a missing row misses with no oracle", () => {
    expect(resolvePkgAsset(target(), VERSION, null)).toEqual({
      status: 404,
      reason: "missing",
    });
  });

  it("a disabled row is not served", () => {
    expect(resolvePkgAsset(target(), VERSION, cssRow({ enabled: false }))).toEqual({
      status: 404,
      reason: "disabled",
    });
  });
});

describe("pkg serving — content policy", () => {
  it("css and json serve inline with nosniff + immutable cache", () => {
    const css = resolvePkgAsset(target(), VERSION, cssRow());
    expect(css).toMatchObject({
      status: 200,
      headers: {
        "content-type": "text/css; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });

    const jsonName = "themes/ver-1/assets/templates/index.json";
    const json = resolvePkgAsset(
      { merchantId: MERCHANT_A, name: jsonName },
      VERSION,
      cssRow({
        name: jsonName,
        kind: "json",
        content: "{}",
        url: `/pkg/${MERCHANT_A}/${jsonName}?v=${VERSION}`,
      }),
    );
    expect(json).toMatchObject({
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    if (json.status === 200) {
      expect(json.headers["cache-control"]).toContain("immutable");
    }
  });

  it("svg is never served as an executable inline document", () => {
    expect(isServablePkgKind("image")).toBe(false);
    expect(isServablePkgKind("font")).toBe(false);
    const svg = resolvePkgAsset(
      { merchantId: MERCHANT_A, name: SVG_NAME },
      VERSION,
      cssRow({
        name: SVG_NAME,
        kind: "image",
        content: "<svg></svg>",
        url: `/pkg/${MERCHANT_A}/${SVG_NAME}?v=${VERSION}`,
      }),
    );
    expect(svg).toEqual({ status: 404, reason: "refused_kind" });
  });

  it("binary rows with no stored bytes are not served", () => {
    const fontName = "plugins/acme/9f2c41ab/assets/acme.woff2";
    expect(
      resolvePkgAsset(
        { merchantId: MERCHANT_A, name: fontName },
        VERSION,
        cssRow({
          name: fontName,
          kind: "font",
          content: null,
          url: `/pkg/${MERCHANT_A}/${fontName}?v=${VERSION}`,
        }),
      ),
    ).toEqual({ status: 404, reason: "refused_kind" });
    expect(
      resolvePkgAsset(target(), VERSION, cssRow({ content: null })),
    ).toEqual({ status: 404, reason: "empty" });
  });

  it("content-type map has no executable branch", () => {
    expect(pkgContentType("css")).toContain("text/css");
    expect(pkgContentType("json")).toContain("application/json");
  });
});
