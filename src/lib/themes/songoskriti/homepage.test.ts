import { describe, expect, it } from "vitest";
import { buildHomepageMain } from "./homepage";

describe("Songoskriti homepage seed configuration", () => {
  const s = (type: string, props = {}) => ({ id: type, type, props }) as never;
  const sections = buildHomepageMain(s);

  it("accurately describes Dhakai Jamdani handloom craft without generic marketing slogans", () => {
    const hero = sections.find((s) => s.type === "hero_carousel");
    expect(hero).toBeDefined();
    const slides = (hero?.props?.slides ?? []) as {
      caption?: string;
      caption_bn?: string;
      headline?: string;
      headline_bn?: string;
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
        s.headline?.includes("Jamdani") || s.headline_bn?.includes("জামদানি"),
    );
    expect(jamdaniSlide).toBeDefined();
    expect(jamdaniSlide?.subhead).toContain(
      "Traditional geometric motifs hand-loomed by master weavers in Narayanganj.",
    );
    expect(jamdaniSlide?.subhead_bn).toContain(
      "নারায়ণগঞ্জের দক্ষ তাঁতিদের হাতে বোনা ঐতিহ্যবাহী জামদানি ও সিল্ক।",
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

    expect(story?.props?.subhead).toBe(
      "Traditional handloom weaves from master weavers across Bangladesh.",
    );

    const jamdani = collections.find((c) => c.title === "Jamdani");
    expect(jamdani?.href).toBe("/c/jamdani");
    expect(jamdani?.subtitle).toBe("Traditional Handloom");

    const rajshahi = collections.find((c) => c.title === "Rajshahi Silk");
    expect(rajshahi?.href).toBe("/c/rajshahi-silk"); // Linked to published Rajshahi Silk collection
    expect(rajshahi?.subtitle).toBe("Pure Silk Weave");

    const tangail = collections.find((c) => c.title === "Tangail Handloom");
    expect(tangail?.href).toBe("/c/heritage-handloom");
    expect(tangail?.subtitle).toBe("Cotton Taant");

    const nakshi = collections.find((c) => c.title === "Nakshi Kantha");
    expect(nakshi?.href).toBe("/c/nakshi-kantha");
    expect(nakshi?.subtitle).toBe("Hand-Embroidered");

    // Must not link to non-existent /c/wedding, /c/sarees, or /c/living
    const hrefs = collections.map((c) => c.href);
    expect(hrefs).not.toContain("/c/wedding");
    expect(hrefs).not.toContain("/c/sarees");
    expect(hrefs).not.toContain("/c/living");
  });

  it("features Flame Fashion BD Journal with authentic craft articles", () => {
    const journal = sections.find(
      (s) =>
        s.type === "split_feature" &&
        (s.props?.heading as string)?.includes("JOURNAL"),
    );
    expect(journal).toBeDefined();
    expect(journal?.props?.heading).toBe("THE FLAME FASHION BD\nJOURNAL");
    expect(journal?.props?.heading_bn).toBe("ফ্লেম ফ্যাশন\nজার্নাল");
    expect(journal?.props?.ctaUrl).toBe("/blog/authentic-jamdani");
    expect(journal?.props?.ctaUrl2).toBe("/blog/bengali-wedding");
  });

  it("verifies trust footer displays accurate customer care hours and policies", () => {
    const trust = sections.find((s) => s.type === "trust_footer");
    expect(trust).toBeDefined();
    const items = (trust?.props?.items ?? []) as {
      title: string;
      body: string;
    }[];
    const customerCare = items.find((i) => i.title === "CUSTOMER CARE");
    expect(customerCare).toBeDefined();
    expect(customerCare?.body).toBe("Saturday – Thursday, 10:00 AM – 8:00 PM");
  });

  it("merchandises curated products neutrally as Festive Selection instead of fabricated popularity", () => {
    const festiveRail = sections.find(
      (s) => s.type === "product_rail" && s.props?.collection === "festive",
    );
    expect(festiveRail).toBeDefined();
    expect(festiveRail?.props?.heading).toBe("Festive Selection");
    expect(festiveRail?.props?.subhead).toBe(
      "Curated handloom sarees and festive attire.",
    );
  });

  it("labels gallery as Seasonal Lookbook without claiming stock photos are customer UGC", () => {
    const ugc = sections.find((s) => s.type === "ugc_gallery");
    expect(ugc).toBeDefined();
    expect(ugc?.props?.heading).toBe("SEASONAL LOOKBOOK");
    expect(ugc?.props?.subhead).toBe("FLAME FASHION BD LOOKBOOK");
  });

  it("does not populate fictional physical store outlets in default store locator", () => {
    const locator = sections.find((s) => s.type === "store_locator");
    expect(locator).toBeDefined();
    expect(locator?.props?.s1Name).toBeUndefined();
    expect(locator?.props?.s2Name).toBeUndefined();
    expect(locator?.props?.s3Name).toBeUndefined();
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
