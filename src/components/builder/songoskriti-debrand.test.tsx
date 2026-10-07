/**
 * Theme Remediation Task 2 — de-brand generic renderers.
 *
 * Shared renderers must render ONLY props/tokens/demo-data: zero hardcoded
 * brand content. Brand zones (statement, newsletter, flagship copy) belong
 * to theme-authored sections/props with `_bn` twins.
 *
 * Structure: parity pins first (songoskriti default-locale rendered output
 * BEFORE the change — these pass on main and must stay GREEN after, with
 * the same strings now flowing from theme-authored props), then no-brand
 * tests (RED before, GREEN after: bare sections carry zero brand strings
 * and render copy only from props).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  newSection,
  catalogEntry,
  type PropValue,
  type Section,
  type SectionType,
} from "@/lib/builder-ast";
import type { Locale } from "@/lib/bitext";
import {
  WIDGET_COMPONENTS,
  widgetReader,
  type WidgetComponent,
  type WidgetCtx,
} from "./widgets";
import { SONGOSKRITI_WIDGETS } from "./songoskriti";
import {
  buildSongoskritiFooter,
  type FooterSectionBuilder,
} from "@/lib/themes/songoskriti/footer";
import { buildHomepageMain as buildSongoskritiHomepage } from "@/lib/themes/songoskriti/homepage";
import { buildFooterMain as buildSomvabonaFooter } from "@/lib/themes/somvabona/chrome";
import { buildHomepageMain as buildSomvabonaHomepage } from "@/lib/themes/somvabona/homepage";

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
  editing = false,
) {
  return renderToStaticMarkup(
    createElement(
      Cmp as (p: WidgetCtx) => React.ReactElement,
      ctxFor(section, locale, editing),
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

/** The footer_sitemap section the songoskriti blueprint authors. */
function songoskritiFooterSection(): Section {
  const section = buildSongoskritiFooter(
    stubBuilder<FooterSectionBuilder>(),
  ).find((n) => n.type === "footer_sitemap")!;
  if (!section) throw new Error("blueprint must author a footer_sitemap");
  return section;
}

function songoskritiHomepage(): Section[] {
  return buildSongoskritiHomepage(stubBuilder<never>());
}

function somvabonaFooter(): Section[] {
  return buildSomvabonaFooter(stubBuilder<never>());
}

function somvabonaHomepage(): Section[] {
  return buildSomvabonaHomepage(stubBuilder<never>());
}

const FooterSitemap = SONGOSKRITI_WIDGETS["footer_sitemap"];
const StoreLocator = SONGOSKRITI_WIDGETS["store_locator"];
const UgcGallery = SONGOSKRITI_WIDGETS["ugc_gallery"];

/** Hardcoded brand content that must never render without brand props. */
const BRAND_STRINGS = [
  "Songoskriti",
  "SONGOSKRITI",
  "সংস্কৃতি",
  "Woven in Bangladesh",
  "festive drops",
  "care@songoskriti",
  "/ph/songoskriti",
  "logo-lockup",
];

/**
 * Cross-theme markers: bare `সংস্কৃতি` is a common Bangla word (somvabona
 * legitimately authors "সুতি সংস্কৃতি" — cotton culture), so the live-DOM
 * proof uses songoskriti-specific strings only.
 */
const CROSS_THEME_STRINGS = [
  "Songoskriti",
  "SONGOSKRITI",
  "Woven in Bangladesh",
  "festive drops",
  "care@songoskriti",
  "/ph/songoskriti",
  "logo-lockup",
  "VISIT SONGOSKRITI",
  "বাংলাদেশে বোনা",
  "উৎসবের ড্রপ সবার আগে",
  "শুধু উৎসবের ড্রপের জন্য",
  "সংস্কৃতি দেখুন",
  "Follow @SONGOSKRITI",
];

function expectNoBrand(html: string) {
  for (const marker of BRAND_STRINGS) {
    expect(html, `brand leak: ${marker}`).not.toContain(marker);
  }
}

function expectNoCrossBrand(html: string) {
  for (const marker of CROSS_THEME_STRINGS) {
    expect(html, `cross-brand leak: ${marker}`).not.toContain(marker);
  }
}

/* ------------------------------------------------------- parity pins (pre) */

describe("Task 2 parity pins — songoskriti default output", () => {
  it("footer_sitemap renders the slim footer in English", () => {
    const html = render(FooterSitemap, songoskritiFooterSection(), "en");
    // No statement zone, no story link.
    expect(html).not.toContain("Woven in Bangladesh");
    expect(html).not.toContain("OUR STORY →");
    // ZONE 2: single newsletter form.
    expect(html).toContain("First to the festive drops");
    expect(html).toContain("Join the list");
    expect(html).toContain("We email only for festive drops");
    expect(html).toContain("Enter your email");
    // ZONE 3: brand identity + sitemap columns.
    expect(html).toContain("Songoskriti");
    expect(html).toContain("Shop");
    expect(html).toContain("Customer Care");
    expect(html).toContain("care@songoskriti.com");
    // ZONE 4: payments + legal.
    expect(html).toContain("Payment methods");
    expect(html).toContain("bKash");
    expect(html).toContain("© 2026 Songoskriti");
    expect(html).toContain("Terms");
    expect(html).toContain("Privacy");
  });

  it("footer_sitemap renders the slim footer in বাংলা", () => {
    const html = render(FooterSitemap, songoskritiFooterSection(), "bn");
    expect(html).not.toContain("বাংলাদেশে বোনা, পরা হয় সর্বত্র");
    expect(html).not.toContain("আমাদের গল্প →");
    expect(html).toContain("সংস্কৃতি");
    expect(html).toContain("উৎসবের ড্রপ সবার আগে");
    expect(html).toContain("তালিকায় যোগ দিন");
    expect(html).toContain("পেমেন্ট মাধ্যম");
    expect(html).toContain("ইমেইল লিখুন");
  });

  it("store_locator renders the flagship section (homepage props)", () => {
    const section = songoskritiHomepage().find(
      (s) => s.type === "store_locator",
    )!;
    expect(section).toBeDefined();
    const html = render(StoreLocator, section, "en");
    expect(html).toContain("VISIT SONGOSKRITI");
    expect(html).toContain("OUR STORES");
    expect(html).toContain("Uttara Flagship");
    expect(html).toContain("Gulshan Showroom");
    expect(html).toContain("Chattogram Store");
    expect(html).toContain("Open 10am – 9pm daily");
    expect(html).toContain("/ph/songoskriti/cat-women.png");
    expect(html).toContain("GET DIRECTIONS →");
  });

  it("store_locator renders the flagship section in বাংলা", () => {
    const section = songoskritiHomepage().find(
      (s) => s.type === "store_locator",
    )!;
    const html = render(StoreLocator, section, "bn");
    expect(html).toContain("সংস্কৃতি দেখুন");
    expect(html).toContain("আমাদের শাখাসমূহ");
  });

  it("ugc_gallery renders the community section (homepage props)", () => {
    const section = songoskritiHomepage().find(
      (s) => s.type === "ugc_gallery",
    )!;
    expect(section).toBeDefined();
    const html = render(UgcGallery, section, "en");
    expect(html).toContain("WORN BY YOU");
    expect(html).toContain("SONGOSKRITI IN THE WORLD");
    expect(html).toContain("Follow @SONGOSKRITI");
    expect(html).toContain("https://instagram.com");
    expect(html).toContain("ugc-1.png");
  });
});

/* ------------------------------------------- no-brand renderers (RED→GREEN) */

describe("Task 2 no-brand renderers — props/tokens/demo-data only", () => {
  function bareFooter(): Section {
    return {
      ...newSection("footer_sitemap"),
      props: {
        c1Title: "Help",
        c1Links: "Contact|/pages/contact",
      },
    };
  }

  it("footer_sitemap with columns only carries zero brand strings", () => {
    const html = render(FooterSitemap, bareFooter(), "en");
    expectNoBrand(html);
    // Generic chrome still renders: columns + legal row.
    expect(html).toContain("Help");
    expect(html).toContain("Contact");
    expect(html).toContain("Terms");
    expect(html).toContain("Privacy");
    expect(html).toContain("© 2026");
  });

  it("footer_sitemap skips brand zones without brand props", () => {
    const html = render(FooterSitemap, bareFooter(), "en");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("OUR STORY");
    expect(html).not.toContain("Subscribe");
  });

  it("footer_sitemap renders brand copy only from props", () => {
    const section = {
      ...newSection("footer_sitemap"),
      props: {
        c1Title: "Help",
        c1Links: "Contact|/pages/contact",
        statementHeading: "Custom statement",
        statementBody: "Custom body",
        storyHref: "/pages/custom",
        storyLabel: "CUSTOM STORY →",
        newsletterHeading: "Custom newsletter",
        newsletterButton: "Sign me up",
        newsletterConsent: "Custom consent",
        brandName: "Custom Brand",
        paymentsHeading: "Pay with",
        paymentsMarks: "Visa, Cash",
      },
    };
    const html = render(FooterSitemap, section, "en");
    expect(html).toContain("Custom statement");
    expect(html).toContain("Custom body");
    expect(html).toContain("CUSTOM STORY →");
    expect(html).toContain("/pages/custom");
    expect(html).toContain("Custom newsletter");
    expect(html).toContain("Sign me up");
    expect(html).toContain("Custom consent");
    expect(html).toContain("Custom Brand");
    expect(html).toContain("Pay with");
    expect(html).toContain("© 2026 Custom Brand");
    expectNoBrand(html);
  });

  it("footer_sitemap resolves _bn twins with bn→en fallback (never blank)", () => {
    const section = {
      ...newSection("footer_sitemap"),
      props: {
        c1Title: "Help",
        c1Links: "Contact|/pages/contact",
        statementHeading: "Custom statement",
        statementHeading_bn: "কাস্টম বিবৃতি",
        brandName: "Custom Brand",
      },
    };
    const bnHtml = render(FooterSitemap, section, "bn");
    expect(bnHtml).toContain("কাস্টম বিবৃতি");
    // brandName has no twin: বাংলা falls back to English, never blank.
    expect(bnHtml).toContain("Custom Brand");
  });

  it("store_locator falls back to generic chrome without brand props", () => {
    const section = {
      ...newSection("store_locator"),
      props: { s1Name: "Test Store", s1Hours: "Open 9–5" },
    };
    const html = render(StoreLocator, section, "en");
    expect(html).toContain("Visit our stores");
    expect(html).toContain("Test Store");
    expectNoBrand(html);
    const bnHtml = render(StoreLocator, section, "bn");
    expect(bnHtml).toContain("আমাদের স্টোরসমূহ");
    expectNoBrand(bnHtml);
  });

  it("ugc_gallery falls back to a generic handle without brand props", () => {
    const section = {
      ...newSection("ugc_gallery"),
      props: {
        heading: "Community",
        images: "/a.png, /b.png, /c.png, /d.png, /e.png, /f.png",
      },
    };
    const html = render(UgcGallery, section, "en");
    expect(html).toContain("Community");
    expect(html).toContain("Follow us");
    expectNoBrand(html);
  });
});

/* ------------------------------------------------- cross-theme live-DOM */

describe("Task 2 cross-theme live-DOM — somvabona carries zero songoskriti copy", () => {
  it("somvabona footer sections render brand-free through the shared map", () => {
    for (const locale of ["en", "bn"] as const) {
      for (const section of somvabonaFooter()) {
        const Cmp = WIDGET_COMPONENTS[section.type];
        expect(Cmp, `renderer for ${section.type}`).toBeDefined();
        expectNoCrossBrand(render(Cmp, section, locale as Locale));
      }
    }
  });

  it("somvabona store_locator renders brand-free through the shared map", () => {
    const section = somvabonaHomepage().find(
      (s) => s.type === "store_locator",
    )!;
    expect(section).toBeDefined();
    const Cmp = WIDGET_COMPONENTS[section.type];
    const enHtml = render(Cmp, section, "en");
    expectNoCrossBrand(enHtml);
    expect(enHtml).toContain("flagship");
    const bnHtml = render(Cmp, section, "bn");
    expectNoCrossBrand(bnHtml);
    expect(bnHtml).toContain("ফ্ল্যাগশিপ");
  });
});

describe("Task 2 studio catalog — de-brand props are authorable", () => {
  const FOOTER_ZONE_KEYS = [
    "statementHeading",
    "statementBody",
    "storyHref",
    "storyLabel",
    "newsletterHeading",
    "newsletterButton",
    "newsletterConsent",
    "brandName",
    "paymentsMarks",
    "paymentsHeading",
  ];

  it("footer_sitemap declares the brand-zone fields", () => {
    const entry = catalogEntry("footer_sitemap");
    expect(entry).toBeDefined();
    const keys = new Set((entry?.fields ?? []).map((f) => f.key));
    for (const key of FOOTER_ZONE_KEYS) {
      expect(keys.has(key), `footer_sitemap missing field ${key}`).toBe(true);
    }
    for (const key of FOOTER_ZONE_KEYS) {
      expect(entry?.defaults).toHaveProperty(key);
    }
  });

  it("ugc_gallery declares the handle fields", () => {
    const entry = catalogEntry("ugc_gallery");
    expect(entry).toBeDefined();
    const keys = new Set((entry?.fields ?? []).map((f) => f.key));
    for (const key of ["handleLabel", "handleHref"]) {
      expect(keys.has(key), `ugc_gallery missing field ${key}`).toBe(true);
    }
  });
});
