/**
 * T7 quick-wins — the `ratio` emitter must accept both catalog spellings:
 * slash (`16/9`, from image/product_media selects) and dash (`16-9`, from the
 * style-layer select), plus the portrait options (`4/5`, `3/4`) and `auto`.
 * Anything the emitter rejects vanishes from the responsive signature, so the
 * breakpoint override is silently lost in both the preview class and CSS.
 */
import { describe, expect, it } from "vitest";
import {
  compileResponsiveCss,
  responsiveClassOf,
  responsiveSignature,
} from "./responsive-css";
import { newSection, type Section } from "./builder-ast";

function withBpRatio(ratio: string): Section {
  const node = newSection("hero");
  return { ...node, bp: { tablet: { ratio } } };
}

describe("ratio emitter vocabulary", () => {
  it.each(["16/9", "4/3", "1/1", "4/5", "3/4"])(
    "keeps slash spelling %s in the signature",
    (ratio) => {
      const node = withBpRatio(ratio);
      expect(responsiveSignature(node), ratio).not.toBeNull();
      expect(responsiveClassOf(node), ratio).not.toBeNull();
    },
  );

  it.each(["16-9", "4-3", "1-1", "auto"])(
    "keeps dash spelling %s in the signature",
    (ratio) => {
      const node = withBpRatio(ratio);
      expect(responsiveSignature(node), ratio).not.toBeNull();
      expect(responsiveClassOf(node), ratio).not.toBeNull();
    },
  );

  it("compiles a slash ratio to an aspect-ratio declaration", () => {
    const compiled = compileResponsiveCss([withBpRatio("16/9")]);
    expect(compiled.rules).toBeGreaterThan(0);
    expect(compiled.css).toContain("aspect-ratio:16 / 9");
  });

  it("compiles portrait ratios to aspect-ratio declarations", () => {
    const compiled = compileResponsiveCss([withBpRatio("4/5")]);
    expect(compiled.rules).toBeGreaterThan(0);
    expect(compiled.css).toContain("aspect-ratio:4 / 5");
  });

  it("still drops unknown ratio vocabulary", () => {
    expect(responsiveSignature(withBpRatio("banana"))).toBeNull();
  });
});
