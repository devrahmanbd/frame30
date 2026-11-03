import { describe, expect, it } from "vitest";
import { buildHomepageMain } from "./homepage";

describe("Songoskriti homepage seed configuration", () => {
  const s = (type: string, props = {}) => ({ id: type, type, props }) as never;
  const sections = buildHomepageMain(s);

  it("accurately names UNESCO Intangible Cultural Heritage in hero slides", () => {
    const hero = sections.find((s) => s.type === "hero_carousel");
    expect(hero).toBeDefined();
    const slides = (hero?.props?.slides ?? []) as {
      caption?: string;
      caption_bn?: string;
    }[];
    const weaveSlide = slides.find(
      (s) =>
        s.caption?.includes("UNESCO") || s.caption_bn?.includes("ইউনেস্কো"),
    );
    expect(weaveSlide).toBeDefined();
    expect(weaveSlide?.caption).toBe("UNESCO Intangible Cultural Heritage");
    expect(weaveSlide?.caption_bn).toBe("ইউনেস্কো স্বীকৃত অধরা ঐতিহ্য");
    // Ensure no inaccurate "World Heritage" claims
    for (const slide of slides) {
      expect(slide.caption).not.toContain("World Heritage");
      expect(slide.caption_bn).not.toContain("বিশ্ব ঐতিহ্য");
    }
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

  it("does not fabricate ratings or verified flags in default testimonial rows", () => {
    const testimonials = sections.find((s) => s.type === "testimonials");
    expect(testimonials).toBeDefined();
    const rows = (testimonials?.props?.testimonials ?? []) as Record<
      string,
      unknown
    >[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.rating).toBeUndefined();
      expect(row.verified).toBeUndefined();
    }
  });
});
