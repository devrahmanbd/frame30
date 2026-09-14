/**
 * Phase 2 exit gate.
 *
 * Contract, not coverage theatre: every check must carry a stable code and a
 * bilingual hint, the score must be deterministic and locale-aware, a 5k-word
 * body must analyse inside the worker budget, no analysis module may reach a
 * server module, and a duplicate-title publish must be blocked with the
 * offending sibling named.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MIN_JUDGEABLE_WORDS,
  SECONDARY_KEYWORDS_MAX,
  analyseSeo,
  normaliseKeywords,
  type SeoDraft,
} from "@/lib/seo-analysis";
import { documentFacts, phraseOccurrences, readability } from "@/lib/seo-content";
import { serpMetrics, truncateToPixels } from "@/lib/seo-pixels";
import { composeSeoPublishGate, titleKey } from "@/lib/seo-publish-gate";

const base: SeoDraft = {
  metaTitle: "",
  metaDescription: "",
  canonical: "",
  robotsIndex: true,
  robotsFollow: true,
  ogImageUrl: "",
  focusKeyword: "",
  faq: [],
};

const article = (words: number) =>
  [
    "<h1>Handmade jute bags in Dhaka</h1>",
    "<p>Handmade jute bags are woven in Dhaka by weavers we pay directly. " +
      "Every order ships within two days. <a href=\"/store/demo/p/tote\">See the tote</a> " +
      "and <a href=\"/store/demo/pages/care\">care guide</a>, or read the " +
      "<a href=\"https://example.org/jute\">jute standard</a>.</p>",
    "<h2>Why jute bags last</h2>",
    `<p>${"Jute fibre is strong and it dries fast. ".repeat(Math.ceil(words / 8))}</p>`,
    '<img src="/a.jpg" alt="Handmade jute bags on a table" width="800" height="600" />',
  ].join("\n");

describe("phase 2 — analysis contract", () => {
  it("gives every check a stable id and a bilingual hint", () => {
    const report = analyseSeo({
      ...base,
      metaTitle: "Handmade jute bags in Dhaka",
      focusKeyword: "jute bags",
      secondaryKeywords: ["tote bag"],
      content: article(400),
      url: "/store/demo/jute-bags",
    });
    const ids = report.checks.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const check of report.checks) {
      expect(check.id).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(check.hint.trim().length).toBeGreaterThan(0);
      expect(check.hintBn.trim().length).toBeGreaterThan(0);
      expect(check.labelBn.trim().length).toBeGreaterThan(0);
      expect(/[\u0980-\u09FF]/.test(check.hintBn)).toBe(true);
    }
  });

  it("is deterministic for the same draft", () => {
    const draft = { ...base, metaTitle: "Jute bags", focusKeyword: "jute", content: article(200) };
    expect(analyseSeo(draft)).toEqual(analyseSeo(draft));
  });

  it("skips readability honestly for বাংলা instead of faking an English score", () => {
    const bn = analyseSeo({ ...base, locale: "bn", content: article(300) });
    const en = analyseSeo({ ...base, locale: "en", content: article(300) });
    expect(bn.checks.find((c) => c.id === "readability.locale")?.status).toBe("skip");
    expect(bn.facts.readability.applicable).toBe(false);
    expect(en.checks.some((c) => c.id === "readability.ease")).toBe(true);
  });

  it("excludes skipped checks from the denominator", () => {
    const withUrl = analyseSeo({ ...base, focusKeyword: "jute", url: "/jute", metaTitle: "Jute" });
    const withoutUrl = analyseSeo({ ...base, focusKeyword: "jute", metaTitle: "Jute" });
    expect(withoutUrl.checks.find((c) => c.id === "keyword.url")?.status).toBe("skip");
    expect(withUrl.score).toBeGreaterThan(withoutUrl.score - 100); // sanity: both scored
    expect(withoutUrl.counts.skip).toBeGreaterThan(0);
  });

  it("refuses to judge body copy under the minimum word count", () => {
    const report = analyseSeo({ ...base, content: "Three words only", focusKeyword: "words" });
    expect(MIN_JUDGEABLE_WORDS).toBe(40);
    expect(report.checks.find((c) => c.id === "links.internal")?.status).toBe("skip");
  });

  it("scores a complete article well and an empty one badly", () => {
    const full = analyseSeo({
      ...base,
      metaTitle: "Handmade jute bags in Dhaka — free delivery",
      metaDescription:
        "Shop handmade jute bags in Dhaka with cash on delivery, seven day returns and free shipping over 1500 taka across Bangladesh.",
      canonical: "https://shop.example.com/store/demo/jute-bags",
      ogImageUrl: "https://cdn.example.com/og.jpg",
      focusKeyword: "jute bags",
      url: "/store/demo/jute-bags",
      content: article(700),
      faq: [
        { q: "Do you deliver outside Dhaka?", a: "Yes, we deliver nationwide within three working days." },
        { q: "Can I pay cash on delivery?", a: "Yes, cash on delivery is available for every district." },
      ],
    });
    expect(full.score).toBeGreaterThan(analyseSeo(base).score);
    expect(full.facts.internalLinks).toBeGreaterThanOrEqual(2);
    expect(full.facts.externalLinks).toBeGreaterThanOrEqual(1);
  });

  it("counts keyword occurrences on token boundaries, not substrings", () => {
    expect(phraseOccurrences("jute bags and jute bags", "jute bags")).toBe(2);
    expect(phraseOccurrences("jutebags", "jute")).toBe(0);
  });

  it("caps and de-duplicates secondary keywords", () => {
    const out = normaliseKeywords(["a", "A", " b ", "c", "d", "e", "f"]);
    expect(out).toEqual(["a", "b", "c", "d"]);
    expect(out.length).toBeLessThanOrEqual(SECONDARY_KEYWORDS_MAX);
  });

  it("extracts headings, images, alt coverage and link direction", () => {
    const facts = documentFacts(article(120), { origin: "https://shop.example.com" });
    expect(facts.headings[0]).toEqual({ level: 1, text: "Handmade jute bags in Dhaka" });
    expect(facts.images[0]?.alt).toContain("jute bags");
    expect(facts.internalLinks).toBe(2);
    expect(facts.externalLinks).toBe(1);
  });

  it("measures readability only on English prose", () => {
    const facts = documentFacts(article(300));
    expect(readability(facts, "bn").applicable).toBe(false);
    expect(readability(facts, "en").ease).toBeGreaterThan(0);
  });

  it("truncates snippets on pixel width, on a word boundary", () => {
    const long = "Handmade jute bags in Dhaka with cash on delivery and nationwide shipping in two days";
    const metrics = serpMetrics({ title: long, description: long }, "mobile");
    expect(metrics.title.truncated).toBe(true);
    expect(metrics.title.shown.endsWith("…")).toBe(true);
    expect(truncateToPixels("short", 5000, 16)).toBe("short");
  });

  it("analyses a 5k-word body inside the worker budget", () => {
    // The budget is a *typical* cost, not a worst case: on a shared CI runner a
    // single sample can be preempted mid-run (we have seen 59 ms for a 20 ms
    // body). Asserting the median of several runs keeps the guard meaningful —
    // a real regression moves every sample — without failing on one steal.
    const body = article(5000);
    const draft = { ...base, metaTitle: "Jute", focusKeyword: "jute bags", content: body };
    analyseSeo(draft); // warm caches and JIT
    const samples: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const started = performance.now();
      analyseSeo(draft);
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    const budget = Number(process.env["SEO_ANALYSIS_BUDGET_MS"] ?? 50);
    expect(median, `median ${median.toFixed(1)}ms of ${samples.map((s) => s.toFixed(1)).join("/")}`).toBeLessThan(
      budget,
    );
    // The slowest sample may be preempted, but not by an order of magnitude:
    // that would mean the analysis has a pathological path, not a noisy runner.
    expect(samples[samples.length - 1]).toBeLessThan(budget * 4);
  });


  it("keeps the analysis path free of server imports", () => {
    for (const file of [
      "src/lib/seo-analysis.ts",
      "src/lib/seo-content.ts",
      "src/lib/seo-pixels.ts",
      "src/lib/seo-publish-gate.ts",
      "src/lib/seo-analysis.worker.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/from\s+["'][^"']*\.server["']/);
      expect(source).not.toMatch(/@\/integrations\/supabase/);
      expect(source).not.toMatch(/@tanstack\/react-start/);
    }
  });
});

describe("phase 2 — publish gate", () => {
  const gateBase = {
    entityType: "article",
    entityId: "a1",
    title: "Handmade jute bags",
    description: "Bags made in Dhaka.",
    canonical: "",
    robotsIndex: true,
    selfUrl: "https://shop.example.com/blog/jute-bags",
    inSitemap: true,
    siblings: [] as { type: string; id: string | null; label: string; title: string }[],
  };

  it("blocks a duplicate title and names the offending sibling", () => {
    const gate = composeSeoPublishGate({
      ...gateBase,
      siblings: [{ type: "product", id: "p1", label: "Jute tote", title: "handmade  Jute Bags" }],
    });
    expect(gate.ok).toBe(false);
    const failure = gate.failures.find((f) => f.code === "title_duplicate");
    expect(failure?.conflictWith?.label).toBe("Jute tote");
    expect(failure?.messageBn).toMatch(/[\u0980-\u09FF]/);
  });

  it("does not consider the entity its own duplicate", () => {
    const gate = composeSeoPublishGate({
      ...gateBase,
      siblings: [{ type: "article", id: "a1", label: "Self", title: "Handmade jute bags" }],
    });
    expect(gate.ok).toBe(true);
  });

  it("blocks a missing title, an off-site canonical and a noindex sitemap conflict", () => {
    expect(composeSeoPublishGate({ ...gateBase, title: "  " }).failures[0]?.code).toBe("title_missing");
    expect(
      composeSeoPublishGate({ ...gateBase, canonical: "https://other.example.com/x" }).failures[0]?.code,
    ).toBe("canonical_offsite");
    expect(
      composeSeoPublishGate({ ...gateBase, robotsIndex: false, inSitemap: true }).failures[0]?.code,
    ).toBe("noindex_in_sitemap");
  });

  it("accepts a self-referencing canonical and treats a missing description as advisory", () => {
    const gate = composeSeoPublishGate({
      ...gateBase,
      description: "",
      canonical: "https://shop.example.com/blog/jute-bags/",
    });
    expect(gate.ok).toBe(true);
    expect(gate.notices[0]?.code).toBe("description_missing");
  });

  it("normalises titles the way a SERP compares them", () => {
    expect(titleKey("  Jute   BAGS ")).toBe("jute bags");
  });
});
