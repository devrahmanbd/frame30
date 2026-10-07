/**
 * Theme Remediation Task 2 (fix round) — byte-equality snapshot pins.
 *
 * The parity pins in `songoskriti-debrand.test.tsx` render whatever the
 * LIVE builders emit, so builder + renderer can co-drift: if both change
 * the same string together, the tests stay green while the storefront
 * changes. These tests close that hole from both sides:
 *
 * 1. FIXED fixtures (hand-written literals below, never derived from the
 *    builders) render through the shared renderers to full static-markup
 *    snapshots — any renderer markup/wording change fails.
 * 2. Builder↔fixture equality — any builder prop change fails, forcing the
 *    fixture (and snapshot) to be updated deliberately, never silently.
 *
 * If a snapshot legitimately changes, update with `vitest -u` and call it
 * out in the report — never bulk-update blindly.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  newSection,
  type PropValue,
  type Section,
  type SectionType,
} from "@/lib/builder-ast";
import type { Locale } from "@/lib/bitext";
import { widgetReader, type WidgetComponent, type WidgetCtx } from "./widgets";
import { SONGOSKRITI_WIDGETS } from "./songoskriti";
import {
  buildSongoskritiFooter,
  type FooterSectionBuilder,
} from "@/lib/themes/songoskriti/footer";
import { buildHomepageMain as buildSongoskritiHomepage } from "@/lib/themes/songoskriti/homepage";

function ctxFor(
  section: Section,
  locale: Locale = "en",
  editing = false,
): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, locale),
    Heading: "h2",
    primary: false,
    editing,
    locale,
    storeSlug: "test",
    data: undefined,
    renderChildren: () => null,
    link: (href: string) => href,
  };
}

function render(
  Cmp: WidgetComponent,
  section: Section,
  locale: Locale = "en",
): string {
  return renderToStaticMarkup(
    createElement(
      Cmp as (p: WidgetCtx) => React.ReactElement,
      ctxFor(section, locale),
    ),
  );
}

function stubBuilder<T>(): T {
  const s = (type: string, props: Record<string, PropValue> = {}) => ({
    ...newSection(type as SectionType),
    props,
  });
  return s as unknown as T;
}

/* ------------------------------------------- fixed fixtures (literals) */

const FIXED_FOOTER_PROPS: Record<string, PropValue> = {
  newsletterHeading: "First to the festive drops",
  newsletterHeading_bn: "উৎসবের ড্রপ সবার আগে",
  newsletterButton: "Join the list",
  newsletterButton_bn: "তালিকায় যোগ দিন",
  newsletterConsent: "We email only for festive drops. Unsubscribe anytime.",
  newsletterConsent_bn:
    "শুধু উৎসবের ড্রপের জন্য ইমেইল পাঠাই। যেকোনো সময় আনসাবস্ক্রাইব করুন।",
  brandName: "Songoskriti",
  brandName_bn: "সংস্কৃতি",
  paymentsHeading: "Payment methods",
  paymentsHeading_bn: "পেমেন্ট মাধ্যম",
  paymentsMarks: "bKash, Nagad, Rocket, Visa, Mastercard, Cash on Delivery",
  c1Title: "Shop",
  c1Title_bn: "কেনাকাটা",
  c1Links: [
    "New Arrivals|/c/new-in",
    "Women|/c/women",
    "Men|/c/men",
    "Kids|/c/kids",
    "Sarees|/c/sarees",
    "Panjabi|/c/panjabi",
    "Festive|/c/festive",
    "Wedding|/c/wedding",
    "Jewellery|/c/jewellery",
  ].join("\n"),
  c1Links_bn: [
    "নতুন এসেছে|/c/new-in",
    "নারী|/c/women",
    "পুরুষ|/c/men",
    "শিশু|/c/kids",
    "শাড়ি|/c/sarees",
    "পাঞ্জাবি|/c/panjabi",
    "উৎসব|/c/festive",
    "বিয়ে|/c/wedding",
    "গহনা|/c/jewellery",
  ].join("\n"),
  c2Title: "Customer Care",
  c2Title_bn: "ক্রেতা সেবা",
  c2Links: [
    "Size Guide|/pages/size-guide",
    "Order Tracking|/pages/track-order",
    "Shipping|/pages/shipping",
    "Returns & Exchanges|/pages/returns",
    "Cancellation|/pages/cancellation",
    "FAQ|/pages/faq",
    "Contact|/pages/contact",
  ].join("\n"),
  c2Links_bn: [
    "সাইজ গাইড|/pages/size-guide",
    "অর্ডার ট্র্যাকিং|/pages/track-order",
    "ডেলিভারি|/pages/shipping",
    "রিটার্ন ও বদল|/pages/returns",
    "বাতিলকরণ|/pages/cancellation",
    "সাধারণ জিজ্ঞাসা|/pages/faq",
    "যোগাযোগ|/pages/contact",
  ].join("\n"),
  c3Title: "Our Heritage",
  c3Title_bn: "আমাদের ঐতিহ্য",
  c3Links: [
    "Our Story|/pages/about",
    "Master Weavers|/pages/master-weavers",
    "Handloom Heritage|/blog/handloom",
    "Artisan Partnerships|/pages/artisans",
    "Journal|/blog",
    "Stores|/pages/stores",
  ].join("\n"),
  c3Links_bn: [
    "আমাদের গল্প|/pages/about",
    "মাস্টার তাঁতি|/pages/master-weavers",
    "হাতে বোনা ঐতিহ্য|/blog/handloom",
    "তাঁতি অংশীদারিত্ব|/pages/artisans",
    "জার্নাল|/blog",
    "স্টোরসমূহ|/pages/stores",
  ].join("\n"),
  c4Title: "Contact",
  c4Title_bn: "যোগাযোগ",
  c4Links: [
    "Phone: +880 96 1234 5678|/pages/contact",
    "Email: care@songoskriti.com|mailto:care@songoskriti.com",
    "Uttara Flagship|/pages/stores#uttara",
    "Gulshan Flagship|/pages/stores#gulshan",
    "Chattogram Flagship|/pages/stores#chattogram",
    "Support: 10AM - 9PM|/pages/contact",
  ].join("\n"),
  c4Links_bn: [
    "ফোন: +৮৮০ ৯৬ ১২৩৪ ৫৬৭৮|/pages/contact",
    "ইমেইল: care@songoskriti.com|mailto:care@songoskriti.com",
    "উত্তরা ফ্ল্যাগশিপ|/pages/stores#uttara",
    "গুলশান ফ্ল্যাগশিপ|/pages/stores#gulshan",
    "চট্টগ্রাম ফ্ল্যাগশিপ|/pages/stores#chattogram",
    "সাপোর্ট: সকাল ১০টা - রাত ৯টা|/pages/contact",
  ].join("\n"),
};

const FIXED_LOCATOR_PROPS: Record<string, PropValue> = {
  heading: "VISIT SONGOSKRITI",
  heading_bn: "সংস্কৃতি দেখুন",
  images:
    "/ph/songoskriti/cat-women.png, /ph/songoskriti/cat-men.png, /ph/songoskriti/hero-festive.png",
  s1Name: "Uttara Flagship",
  s1Hours: "Open 10am – 9pm daily",
  s2Name: "Gulshan Showroom",
  s2Hours: "Open 10am – 9pm daily",
  s3Name: "Chattogram Store",
  s3Hours: "Open 10am – 8pm daily",
};

const FIXED_UGC_PROPS: Record<string, PropValue> = {
  heading: "WORN BY YOU",
  heading_bn: "আপনার পরিধানে",
  subhead: "SONGOSKRITI IN THE WORLD",
  subhead_bn: "সংস্কৃতি সারা দুনিয়ায়",
  handleLabel: "Follow @SONGOSKRITI",
  handleHref: "https://instagram.com",
  images:
    "/ph/songoskriti/ugc-1.png, /ph/songoskriti/ugc-2.png, /ph/songoskriti/ugc-3.png, /ph/songoskriti/ugc-4.png, /ph/songoskriti/ugc-5.jpg, /ph/songoskriti/ugc-6.jpg",
};

function fixedSection(
  type: "footer_sitemap" | "store_locator" | "ugc_gallery",
  props: Record<string, PropValue>,
): Section {
  return { ...newSection(type), props };
}

const FooterSitemap = SONGOSKRITI_WIDGETS["footer_sitemap"];
const StoreLocator = SONGOSKRITI_WIDGETS["store_locator"];
const UgcGallery = SONGOSKRITI_WIDGETS["ugc_gallery"];

/* ---------------------------------- builder↔fixture equality (drift fails) */

describe("Task 2 fix — builders still emit the pinned fixtures", () => {
  it("buildSongoskritiFooter emits the slim footer sections", () => {
    // Footer is navigation + trust only: link columns carry the sitemap,
    // one newsletter form lives in the sitemap zone, and a colophon row
    // (payments + copyright) closes. No statement, no story link, no
    // standalone newsletter or payment sections.
    const sections =
      buildSongoskritiFooter(stubBuilder<FooterSectionBuilder>());
    expect(sections.map((n) => n.type)).toEqual([
      "footer_sitemap",
      "rich_text",
    ]);
    const sitemap = sections.find((n) => n.type === "footer_sitemap")!;
    expect(sitemap.props).toEqual(FIXED_FOOTER_PROPS);
  });

  it("songoskriti homepage emits exactly the fixed store_locator props", () => {
    const section = buildSongoskritiHomepage(stubBuilder<never>()).find(
      (s) => s.type === "store_locator",
    )!;
    expect(section).toBeDefined();
    expect(section.props).toEqual(FIXED_LOCATOR_PROPS);
  });

  it("songoskriti homepage emits exactly the fixed ugc_gallery props", () => {
    const section = buildSongoskritiHomepage(stubBuilder<never>()).find(
      (s) => s.type === "ugc_gallery",
    )!;
    expect(section).toBeDefined();
    expect(section.props).toEqual(FIXED_UGC_PROPS);
  });
});

/* --------------------------- byte-equality snapshots (renderer drift fails) */

describe("Task 2 fix — full static-markup snapshots from fixed fixtures", () => {
  it("footer en", () => {
    const html = render(
      FooterSitemap,
      fixedSection("footer_sitemap", FIXED_FOOTER_PROPS),
      "en",
    );
    expect(html).toContain("© 2026 Songoskriti");
    expect(html).toMatchSnapshot();
  });

  it("footer bn", () => {
    const html = render(
      FooterSitemap,
      fixedSection("footer_sitemap", FIXED_FOOTER_PROPS),
      "bn",
    );
    expect(html).toContain("পেমেন্ট মাধ্যম");
    expect(html).toMatchSnapshot();
  });

  it("store-locator en", () => {
    const html = render(
      StoreLocator,
      fixedSection("store_locator", FIXED_LOCATOR_PROPS),
      "en",
    );
    expect(html).toContain("VISIT SONGOSKRITI");
    expect(html).toMatchSnapshot();
  });

  it("store-locator bn", () => {
    const html = render(
      StoreLocator,
      fixedSection("store_locator", FIXED_LOCATOR_PROPS),
      "bn",
    );
    expect(html).toContain("সংস্কৃতি দেখুন");
    expect(html).toMatchSnapshot();
  });

  it("ugc-gallery en", () => {
    const html = render(
      UgcGallery,
      fixedSection("ugc_gallery", FIXED_UGC_PROPS),
      "en",
    );
    expect(html).toContain("Follow @SONGOSKRITI");
    expect(html).toMatchSnapshot();
  });

  it("ugc-gallery bn", () => {
    const html = render(
      UgcGallery,
      fixedSection("ugc_gallery", FIXED_UGC_PROPS),
      "bn",
    );
    expect(html).toContain("সংস্কৃতি সারা দুনিয়ায়");
    expect(html).toMatchSnapshot();
  });
});

/* ---------------- shared renderer carries zero brand-asset literals */

describe("Task 2 fix — shared renderer fallback art is neutral", () => {
  it("songoskriti.tsx references no /ph/songoskriti brand assets", () => {
    const src = readFileSync("src/components/builder/songoskriti.tsx", "utf8");
    expect(src).not.toContain("/ph/songoskriti");
  });
});
