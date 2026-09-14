import { describe, expect, it } from "vitest";
import { analyseSeo, normaliseFaq, scoreBand } from "@/lib/seo-analysis";
import { buildStoreHead, type SeoOverride } from "@/lib/theme-seo";

const base = {
  metaTitle: "",
  metaDescription: "",
  canonical: "",
  robotsIndex: true,
  robotsFollow: true,
  ogImageUrl: "",
  focusKeyword: "",
  faq: [],
};

describe("seo analysis", () => {
  it("is deterministic for the same draft", () => {
    const draft = { ...base, metaTitle: "Dhaka handmade jute bags for daily use", focusKeyword: "jute bags" };
    expect(analyseSeo(draft)).toEqual(analyseSeo(draft));
  });

  it("fails an empty draft and passes a complete one", () => {
    const empty = analyseSeo(base);
    const full = analyseSeo({
      ...base,
      metaTitle: "Handmade jute bags in Dhaka — free delivery",
      metaDescription:
        "Shop handmade jute bags in Dhaka with cash on delivery, seven day returns and free shipping over 1500 taka across Bangladesh.",
      canonical: "https://shop.example.com/store/demo",
      ogImageUrl: "https://cdn.example.com/og.jpg",
      focusKeyword: "jute bags",
      content: "Our jute bags are woven by hand. Every jute bag ships from Dhaka within two days.",
      faq: [
        { q: "Do you deliver outside Dhaka?", a: "Yes, we deliver nationwide within three working days." },
        { q: "Can I pay cash on delivery?", a: "Yes, cash on delivery is available for every district." },
      ],
    });
    expect(empty.score).toBeLessThan(full.score);
    expect(full.score).toBeGreaterThanOrEqual(80);
    expect(scoreBand(full.score).tone).toBe("success");
  });

  it("flags a title that overflows the snippet", () => {
    const report = analyseSeo({ ...base, metaTitle: "x".repeat(120) });
    expect(report.checks.find((c) => c.id === "title.length")?.status).toBe("warn");
  });

  it("rejects a non-https social image", () => {
    const report = analyseSeo({ ...base, ogImageUrl: "http://cdn.example.com/og.jpg" });
    expect(report.checks.find((c) => c.id === "og.image")?.status).not.toBe("pass");
  });

  it("drops malformed faq rows instead of throwing", () => {
    expect(normaliseFaq([{ q: "a", a: "b" }, { q: "" }, null, "nope"])).toEqual([{ q: "a", a: "b" }]);
  });
});

describe("seo overrides in head output", () => {
  const input = {
    origin: "https://shop.example.com",
    path: "/store/demo",
    storeName: "Demo Store",
    tagline: "Handmade goods",
    products: [],
  };

  it("prefers merchant overrides over theme defaults", () => {
    const seo: SeoOverride = {
      metaTitle: "Merchant title",
      metaDescription: "Merchant description",
      canonical: "https://custom.example.com/landing",
    };
    const head = buildStoreHead({ ...input, seo });
    expect(head.meta?.find((m) => "title" in m)).toEqual({ title: "Merchant title" });
    expect(head.links?.find((l) => l.rel === "canonical")?.href).toBe("https://custom.example.com/landing");
  });

  it("keeps theme defaults when the override is blank", () => {
    const head = buildStoreHead({ ...input, seo: { metaTitle: "  ", metaDescription: "" } });
    const title = head.meta?.find((m) => "title" in m) as { title: string };
    expect(title.title).toContain("Demo Store");
  });

  it("honours a noindex toggle and drops the canonical link", () => {
    const head = buildStoreHead({ ...input, seo: { robotsIndex: false } });
    expect(head.meta?.find((m) => m.name === "robots")?.content).toBe("noindex,follow");
    expect(head.links?.some((l) => l.rel === "canonical")).toBe(false);
  });

  it("emits FAQPage json-ld from merchant answers", () => {
    const head = buildStoreHead({
      ...input,
      seo: { faq: [{ q: "Do you ship to Sylhet?", a: "Yes, in two days." }, { q: "", a: "ignored" }] },
    });
    const faq = (head.scripts ?? []).map((s) => s.children ?? "").find((c) => c.includes("FAQPage"));
    expect(faq).toBeTruthy();
    const parsed = JSON.parse(faq!);
    expect(parsed.mainEntity).toHaveLength(1);
    expect(parsed.mainEntity[0].name).toBe("Do you ship to Sylhet?");
  });

  it("ignores a non-https canonical override", () => {
    const head = buildStoreHead({ ...input, seo: { canonical: "javascript:alert(1)" } });
    expect(head.links?.find((l) => l.rel === "canonical")?.href).toBe("https://shop.example.com/store/demo");
  });
});
