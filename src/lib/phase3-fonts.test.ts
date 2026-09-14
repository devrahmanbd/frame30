import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_TOKENS, FONT_PAIRINGS, applyFontPairing } from "./builder-ast";
import {
  FONT_BUDGET,
  FONT_FAMILIES,
  checkFontBudget,
  coversScript,
  customFontFaceCss,
  fontHeadLinks,
  fontStackCss,
  fontStoragePath,
  fontStylesheetUrl,
  isFontObjectPath,
  isWoff2,
  licenceGate,
  pairingCoverage,
  resolveFontStack,
  validateFontUpload,
  type FontAsset,
} from "./theme-fonts";
import { FONT_PRELOAD } from "./web-vitals";

const css = readFileSync("src/styles.css", "utf8");
const woff2 = (bytes = 64) => {
  const out = new Uint8Array(bytes);
  out.set([0x77, 0x4f, 0x46, 0x32]);
  return out;
};

describe("phase 3 — font resolver", () => {
  it("every pairing × locale resolves to a face that covers the script", () => {
    const failures = pairingCoverage().filter((row) => !row.ok);
    expect(failures).toEqual([]);
  });

  it("a latin-only face on বাংলা appends a Bengali-capable family", () => {
    const stack = resolveFontStack("Playfair Display", "bn");
    expect(stack).toContain("Noto Sans Bengali");
    expect(stack.some((name) => coversScript(name, "bengali"))).toBe(true);
    expect(fontStackCss("Playfair Display", "bn")).toContain('"Noto Sans Bengali"');
  });

  it("the stack always ends in a generic and carries the metric-matched fallback", () => {
    const stack = resolveFontStack("Inter", "en");
    expect(stack).toContain("Inter Fallback");
    expect(stack.at(-1)).toBe("sans-serif");
  });
});

describe("phase 3 — fallback faces and stylesheet", () => {
  it("every catalogue family declares a metric-matched @font-face in styles.css", () => {
    for (const meta of Object.values(FONT_FAMILIES)) {
      expect(css).toContain(`font-family: "${meta.fallback}"`);
    }
    expect(css).toContain("size-adjust");
  });

  it("the stylesheet is derived from the pairing, not hardcoded", () => {
    const serif = applyFontPairing(DEFAULT_TOKENS, "editorial-serif");
    const url = fontStylesheetUrl(serif);
    expect(url).toContain("family=Playfair+Display");
    expect(url).toContain("family=Inter");
    expect(url).not.toContain("Hind+Siliguri");
    expect(url).toContain("display=swap");
  });

  it("bengali pairings request the bengali subset", () => {
    expect(fontStylesheetUrl(applyFontPairing(DEFAULT_TOKENS, "bengali-modern"))).toContain(
      "subset=latin,bengali",
    );
  });

  it("head links preconnect to both origins and preload the sheet", () => {
    const links = fontHeadLinks(DEFAULT_TOKENS);
    expect(links.filter((l) => l.rel === "preconnect")).toHaveLength(2);
    expect(links.some((l) => l.rel === "preload")).toBe(true);
    expect(links.some((l) => l.rel === "stylesheet")).toBe(true);
  });

  it("the platform default preload still ships both scripts", () => {
    expect(FONT_PRELOAD.stylesheet).toContain("Noto+Sans+Bengali");
    expect(FONT_PRELOAD.stylesheet).toContain("Inter");
    expect(FONT_PRELOAD.stylesheet).toContain("display=swap");
  });
});

describe("phase 3 — budget", () => {
  it("every shipped pairing is inside the budget", () => {
    for (const key of Object.keys(FONT_PAIRINGS) as (keyof typeof FONT_PAIRINGS)[]) {
      expect(checkFontBudget(applyFontPairing(DEFAULT_TOKENS, key)).ok).toBe(true);
    }
  });

  it("no family requests more than four weights and only latin/bengali subsets exist", () => {
    for (const meta of Object.values(FONT_FAMILIES)) {
      expect(meta.weights.length).toBeLessThanOrEqual(FONT_BUDGET.maxWeightsPerFamily);
      for (const script of meta.scripts) expect(FONT_BUDGET.subsets).toContain(script);
    }
  });

  it("a third family fails the theme", () => {
    const failures = checkFontBudget({ fontDisplay: "Comic Sans", fontBody: "Inter" }).failures;
    expect(failures.some((f) => f.code === "font:unknown")).toBe(true);
  });
});

describe("phase 3 — custom fonts", () => {
  it("accepts a real woff2 and rejects anything else", () => {
    expect(isWoff2(woff2())).toBe(true);
    expect(isWoff2(new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x00]))).toBe(false);
    const bad = validateFontUpload({
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
      family: "Acme",
      weight: 400,
      existingFilesForFamily: 0,
    });
    expect(bad).toMatchObject({ ok: false, code: "bad_format" });
  });

  it("enforces 400 KB × 4 files per family", () => {
    expect(
      validateFontUpload({
        bytes: woff2(FONT_BUDGET.maxFileBytes + 1),
        family: "Acme",
        weight: 400,
        existingFilesForFamily: 0,
      }),
    ).toMatchObject({ ok: false, code: "too_large" });
    expect(
      validateFontUpload({
        bytes: woff2(),
        family: "Acme",
        weight: 400,
        existingFilesForFamily: FONT_BUDGET.maxFilesPerFamily,
      }),
    ).toMatchObject({ ok: false, code: "too_many" });
    expect(
      validateFontUpload({ bytes: woff2(), family: "Acme", weight: 400, existingFilesForFamily: 1 }),
    ).toEqual({ ok: true });
  });

  it("storage paths are merchant/family/weight.woff2 and reject traversal", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const path = fontStoragePath(id, "Acme Grotesk", 500);
    expect(path).toBe(`${id}/Acme Grotesk/500.woff2`);
    expect(isFontObjectPath(path)).toBe(true);
    expect(isFontObjectPath(`${id}/../secrets/400.woff2`)).toBe(false);
  });

  it("licence attestation gates publish and unlicensed faces are not emitted", () => {
    const asset: FontAsset = {
      id: "a",
      family: "Acme",
      weight: 400,
      subset: "latin",
      storagePath: "11111111-1111-1111-1111-111111111111/Acme/400.woff2",
      bytes: 1000,
      licenceConfirmedAt: null,
    };
    expect(licenceGate([asset])).toHaveLength(1);
    expect(customFontFaceCss([asset])).toBe("");

    const licensed = { ...asset, licenceConfirmedAt: new Date().toISOString() };
    expect(licenceGate([licensed])).toEqual([]);
    const face = customFontFaceCss([licensed]);
    expect(face).toContain("@font-face");
    expect(face).toContain("/api/public/font/");
    expect(face).toContain("font-display:swap");
  });
});
