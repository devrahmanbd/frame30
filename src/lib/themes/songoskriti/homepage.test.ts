import { describe, expect, it } from "vitest";
import { buildHomepageMain } from "./homepage";

describe("Songoskriti homepage seed configuration", () => {
  const s = (type: string, props = {}) => ({ id: type, type, props }) as never;
  const sections = buildHomepageMain(s);

  it("accurately describes UNESCO Intangible Cultural Heritage in Jamdani body text, without generic marketing badges", () => {
    const hero = sections.find((s) => s.type === "hero_carousel");
    expect(hero).toBeDefined();
    const slides = (hero?.props?.slides ?? []) as {
      caption?: string;
      caption_bn?: string;
      subhead?: string;
      subhead_bn?: string;
    }[];
    // Slides do not carry generic promotional/heritage captions
    for (const slide of slides) {
      expect(slide.caption).toBeUndefined();
      expect(slide.caption_bn).toBeUndefined();
    }
    const jamdaniSlide = slides.find(
      (s) =>
        s.subhead?.includes("UNESCO") || s.subhead_bn?.includes("ইউনেস্কো"),
    );
    expect(jamdaniSlide).toBeDefined();
    expect(jamdaniSlide?.subhead).toContain(
      "Dhakai Jamdani weaving craft, an enduring handloom tradition recognized by UNESCO as Intangible Cultural Heritage of Humanity.",
    );
    expect(jamdaniSlide?.subhead_bn).toContain(
      "ঢাকার ঐতিহ্যবাহী জামদানি বুনন শিল্প, ইউনেস্কো স্বীকৃত অধরা সাংস্কৃতিক ঐতিহ্য।",
    );
  });

  it("maps 'From the Loom' collections to actual published destinations", () => {
    const story = sections.find((s) => s.type === "collection_story");
    expect(story).toBeDefined();
    const collections = (story?.props?.collections ?? []) as {
      title: string;
      href: string;
      subtitle: string;
    }[];

    const jamdani = collections.find((c) => c.title === "Jamdani");
    expect(jamdani?.href).toBe("/c/jamdani");
    expect(jamdani?.subtitle).toBe("UNESCO Intangible Cultural Heritage");

    const rajshahi = collections.find((c) => c.title === "Rajshahi Silk");
    expect(rajshahi?.href).toBe(""); // Non-linked because no collection exists

    const tangail = collections.find((c) => c.title === "Tangail Handloom");
    expect(tangail?.href).toBe("/c/heritage-handloom");

    const nakshi = collections.find((c) => c.title === "Nakshi Kantha");
    expect(nakshi?.href).toBe("/c/nakshi-kantha");

    // Must not link to non-existent /c/wedding, /c/sarees, or /c/living
    const hrefs = collections.map((c) => c.href);
    expect(hrefs).not.toContain("/c/wedding");
    expect(hrefs).not.toContain("/c/sarees");
    expect(hrefs).not.toContain("/c/living");
  });

  it("omits unverified customer testimonials by default to avoid fabricated social proof", () => {
    const testimonials = sections.find((s) => s.type === "testimonials");
    expect(testimonials).toBeDefined();
    const rows = (testimonials?.props?.testimonials ?? []) as Record<
      string,
      unknown
    >[];
    expect(rows).toEqual([]);
  });

  it("omits artificial sticker badges from product rails", () => {
    const rails = sections.filter((s) => s.type === "product_rail");
    for (const rail of rails) {
      expect(rail?.props?.badgeLabel).toBeUndefined();
    }
  });
});
