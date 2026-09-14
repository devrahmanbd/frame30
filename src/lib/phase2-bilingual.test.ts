/**
 * Phase 2 — bilingual system maturity.
 *
 * These are contract tests, not snapshots: each one fails the build if a
 * platform-wide বাংলা invariant is broken (line box, caps, elasticity,
 * mixed script, numerals, fail-safe).
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isMixedScript,
  resolveBiTextTagged,
  segmentMixedScript,
  toDigits,
} from "./bitext";
import { DEFAULT_TOKENS, tokensToCss } from "./builder-ast";

const css = readFileSync("src/styles.css", "utf8");

describe("§2.1 বাংলা line box", () => {
  it("scales headings by --fq-bn-scale 1.06 with a 1.7 line box", () => {
    expect(css).toContain("--fq-bn-scale, 1.06");
    expect(css).toMatch(/line-height:\s*1\.7;/);
  });

  it("never clips matras: heading boxes stay overflow: visible", () => {
    const block = css.slice(css.indexOf(':where([lang="bn"]) h1'));
    expect(block.slice(0, 400)).toContain("overflow: visible");
  });

  it("exposes the scale as a theme token", () => {
    expect(tokensToCss({ ...DEFAULT_TOKENS, locale: "bn" })["--fq-bn-scale"]).toBe("1.06");
  });
});

describe("§2.2 no all-caps under বাংলা", () => {
  it("disables text-transform for .fq-caps inside a bn subtree", () => {
    expect(css).toContain('.fq-caps');
    expect(css).toMatch(/:where\(\[lang="bn"\]\) \.fq-caps[\s\S]{0,120}text-transform: none/);
  });

  /** Lint, not convention: a raw `uppercase` class in storefront copy fails. */
  it("no storefront widget file uses a raw `uppercase` class", () => {
    const dir = "src/components/builder";
    const storefront = [
      "widgets.tsx",
      "chrome.tsx",
      "merch.tsx",
      "pdp.tsx",
      "cart.tsx",
      "collection.tsx",
      "apparel.tsx",
      "electronics.tsx",
      "beauty.tsx",
    ].filter((f) => readdirSync(dir).includes(f));
    const offenders = storefront.filter((f) =>
      /\buppercase\b/.test(readFileSync(`${dir}/${f}`, "utf8")),
    );
    expect(offenders, "use fq-caps so বাংলা opts out").toEqual([]);
  });
});

describe("§2.3 length elasticity", () => {
  it("forbids fixed-width tappables inside a bn subtree", () => {
    expect(css).toMatch(
      /:where\(\[lang="bn"\]\) :is\(button[\s\S]{0,200}max-width: 100%/,
    );
  });
});

describe("§2.4 mixed-script safety", () => {
  it("isolates SKUs and model numbers inside Bangla copy", () => {
    const runs = segmentMixedScript("গ্যালাক্সি A50-256GB পাওয়া যাচ্ছে");
    expect(runs.filter((r) => r.ltr).map((r) => r.text)).toEqual(["A50-256GB"]);
    expect(runs.map((r) => r.text).join("")).toBe("গ্যালাক্সি A50-256GB পাওয়া যাচ্ছে");
  });

  it("captures units attached to a number", () => {
    const runs = segmentMixedScript("ওজন 250 g মাত্র");
    expect(runs.some((r) => r.ltr && r.text.includes("250"))).toBe(true);
  });

  it("leaves pure English copy as one run — no extra markup on en pages", () => {
    expect(segmentMixedScript("Galaxy A50-256GB")).toEqual([
      { text: "Galaxy A50-256GB", ltr: false },
    ]);
    expect(isMixedScript("Galaxy A50")).toBe(false);
  });
});

describe("§2.5 numerals", () => {
  it("carries the digit system as --fq-digits", () => {
    expect(tokensToCss({ ...DEFAULT_TOKENS, digits: "bengali" })["--fq-digits"]).toBe("bengali");
  });

  it("keeps tabular figures on the Bangla stack", () => {
    expect(css).toMatch(/\[data-numeric\][\s\S]{0,160}font-variant-numeric: tabular-nums/);
  });

  it("maps money digits to Bengali numerals", () => {
    expect(toDigits("৳ 4,500", "bengali")).toBe("৳ ৪,৫০০");
  });
});

describe("§2.6 missing-translation fail-safe", () => {
  it("renders English with lang=en rather than an empty node", () => {
    expect(resolveBiTextTagged({ en: "Add to cart", bn: "" }, "bn")).toEqual({
      text: "Add to cart",
      lang: "en",
      state: "fallback",
    });
  });

  it("uses বাংলা with lang=bn when it exists", () => {
    expect(resolveBiTextTagged({ en: "Add to cart", bn: "কার্টে যোগ" }, "bn")).toEqual({
      text: "কার্টে যোগ",
      lang: "bn",
      state: "ok",
    });
  });

  it("an English page never switches script", () => {
    expect(resolveBiTextTagged({ en: "", bn: "কার্টে যোগ" }, "en").text).toBe("");
  });
});
