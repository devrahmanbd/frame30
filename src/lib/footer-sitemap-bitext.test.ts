/**
 * T7 quick-wins — BITEXT_FIELDS.footer_sitemap must cover the cNLinks columns
 * plus the brand-zone prose keys. Anything missing here never becomes
 * `bitext`, so parseAst drops its `_bn` twin while the renderers resolve it
 * bilingually — bn footer links/brand zones silently render English after a
 * real parse round-trip.
 */
import { describe, expect, it } from "vitest";
import { biTextKeysOf, newSection, parseAst } from "./builder-ast";

const EXPECTED_KEYS = [
  "c1Title",
  "c2Title",
  "c3Title",
  "c4Title",
  "c1Links",
  "c2Links",
  "c3Links",
  "c4Links",
  "statementHeading",
  "statementBody",
  "storyLabel",
  "newsletterHeading",
  "newsletterButton",
  "newsletterConsent",
  "brandName",
  "paymentsMarks",
  "paymentsHeading",
];

describe("footer_sitemap bitext coverage", () => {
  it("declares link columns and brand-zone prose keys as bilingual", () => {
    const keys = biTextKeysOf("footer_sitemap");
    for (const key of EXPECTED_KEYS) expect(keys, key).toContain(key);
  });

  it("parseAst preserves scalar _bn twins end to end", () => {
    const ast = parseAst({
      header: [],
      main: [],
      footer: [
        {
          id: "f1",
          type: "footer_sitemap",
          props: {
            c1Title: "Shop",
            c1Title_bn: "কেনাকাটা",
            c1Links: "New in|/c/new-in",
            c1Links_bn: "নতুন এসেছে|/c/new-in",
            statementHeading: "Our craft",
            statementHeading_bn: "আমাদের কারুকাজ",
            brandName: "House",
            brandName_bn: "হাউস",
          },
        },
      ],
    });
    const props = ast.footer[0]?.props ?? {};
    expect(props["c1Title_bn"]).toBe("কেনাকাটা");
    expect(props["c1Links_bn"]).toBe("নতুন এসেছে|/c/new-in");
    expect(props["statementHeading_bn"]).toBe("আমাদের কারুকাজ");
    expect(props["brandName_bn"]).toBe("হাউস");
  });

  it("newSection seeds _bn siblings for links and brand zones", () => {
    const section = newSection("footer_sitemap");
    for (const key of ["c1Links_bn", "statementHeading_bn", "brandName_bn"])
      expect(key in section.props, key).toBe(true);
  });
});
