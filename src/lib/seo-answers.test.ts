import { describe, expect, it } from "vitest";
import type { Section } from "./builder-ast";
import {
  answerBlockIssues,
  authorIssues,
  authorJsonLd,
  banglaShare,
  localeParityIssues,
  parityReport,
  renderLlmsTxt,
  renderSeoTemplate,
  templateIssues,
} from "./seo-answers";
import { sectionJsonLd } from "./structured-data";

const node = (type: string, props: Record<string, unknown> = {}, children?: Section[]): Section =>
  ({ id: `${type}-1`, type, props, ...(children ? { children } : {}) }) as unknown as Section;

describe("answer-first crawlability", () => {
  it("passes a spec table with readable rows", () => {
    expect(answerBlockIssues([node("spec_table", { r1Label: "Battery", r1Value: "5000mAh" })])).toEqual([]);
  });

  it("blocks an answer block nested inside a custom HTML island", () => {
    const issues = answerBlockIssues([
      node("html", { html: "<div></div>" }, [node("faq", { q1: "Is it waterproof?", a1: "Yes, IP68." })]),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.level).toBe("error");
    expect(issues[0]!.message).toMatch(/custom HTML island/);
  });

  it("blocks a guide that is only an image", () => {
    const issues = answerBlockIssues([node("buying_guide", { image: "/specs-table.png" })]);
    expect(issues.some((i) => /image/.test(i.message))).toBe(true);
  });

  it("ignores data-backed blocks with empty props", () => {
    expect(answerBlockIssues([node("product_qna", {})])).toEqual([]);
  });
});

describe("author / expertise metadata", () => {
  it("warns when a guide has no author", () => {
    const issues = authorIssues([node("buying_guide", { heading: "How to choose", body: "..." })]);
    expect(issues[0]).toMatchObject({ level: "warn" });
  });

  it("rejects an invalid review date", () => {
    const issues = authorIssues([node("buying_guide", { author: "Nabila", authorRole: "Dermatologist", reviewedOn: "yesterday" })]);
    expect(issues.some((i) => i.level === "error")).toBe(true);
  });

  it("emits Person attribution in JSON-LD", () => {
    expect(authorJsonLd({ author: "Nabila Rahman", authorRole: "Dermatologist", reviewedOn: "2026-02-01" })).toEqual({
      author: { "@type": "Person", name: "Nabila Rahman", jobTitle: "Dermatologist" },
      dateModified: "2026-02-01",
    });
  });

  it("attaches attribution to the HowTo graph", () => {
    const ld = sectionJsonLd(
      node("how_to_use", {
        heading: "Apply the serum",
        s1Title: "Cleanse",
        s1Body: "Wash with lukewarm water.",
        s2Title: "Apply",
        s2Body: "Two drops, patted in.",
        author: "Nabila Rahman",
        authorRole: "Dermatologist",
      }),
      { storeName: "Store", url: null },
    );
    expect(ld).toMatchObject({ "@type": "HowTo", author: { name: "Nabila Rahman" } });
  });

  it("emits an Article for a buying guide", () => {
    const ld = sectionJsonLd(node("buying_guide", { heading: "Choosing a charger", body: "Watts matter." }), {
      storeName: "Store",
      url: "https://x.test/g",
    });
    expect(ld).toMatchObject({ "@type": "Article", headline: "Choosing a charger" });
  });
});

describe("bilingual parity", () => {
  it("scores Bengali share", () => {
    expect(banglaShare("বাংলা")).toBe(1);
    expect(banglaShare("English only")).toBe(0);
  });

  it("fails a bn field holding English", () => {
    const report = parityReport([{ key: "title", label: "Title", en: "Charger", bn: "Charger" }]);
    expect(report.ok).toBe(false);
    expect(report.findings[0]!.message).toMatch(/English text/);
  });

  it("passes a real translation", () => {
    const report = parityReport([{ key: "title", label: "Title", en: "Charger", bn: "চার্জার" }]);
    expect(report).toMatchObject({ percent: 100, ok: true });
  });

  it("flags fake bn props in the AST", () => {
    const issues = localeParityIssues([node("heading", { text: "Chargers", text_bn: "Chargers" })]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.level).toBe("warn");
  });
});

describe("seo templates", () => {
  it("rejects unknown variables", () => {
    expect(templateIssues("{{title}} — {{colour}}")).toHaveLength(1);
  });

  it("collapses separators around empty variables", () => {
    expect(renderSeoTemplate("{{title}} | {{brand}} | {{store}}", { title: "Charger", store: "Acme" })).toBe(
      "Charger | Acme",
    );
  });

  it("clamps to the snippet limit", () => {
    expect(renderSeoTemplate("{{title}}", { title: "x".repeat(80) }, 20)).toHaveLength(20);
  });
});

describe("llms.txt", () => {
  const body = renderLlmsTxt({
    storeName: "Acme",
    origin: "https://shop.test",
    slug: "acme",
    tagline: "Chargers that last",
    productCount: 42,
    collections: [{ title: "Chargers", path: "/store/acme/search?collection=chargers" }],
    pages: [{ title: "Warranty", path: "/store/acme/pages/warranty" }],
    guides: [{ title: "Choosing a charger", path: "/blog/choosing" }],
  });

  it("titles the store and links absolute URLs", () => {
    expect(body.startsWith("# Acme")).toBe(true);
    expect(body).toContain("https://shop.test/store/acme/search?collection=chargers");
  });

  it("points at the machine-readable surfaces", () => {
    expect(body).toContain("https://shop.test/store/acme/sitemap.xml");
    expect(body).toContain("Products listed: 42");
  });
});
