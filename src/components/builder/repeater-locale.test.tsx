/**
 * Repeater item-row locale parity — TDD: bn renders row `_bn` twins with EN
 * fallback (never blank), mirroring the footer_sitemap precedent.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  newSection,
  parseAst,
  type Section,
  type SectionType,
  type Slot,
} from "@/lib/builder-ast";
import { CHROME_WIDGETS } from "./chrome";
import { PDP_WIDGETS } from "./pdp";
import { APPAREL_WIDGETS } from "./apparel";
import { CIRCUIT_WIDGETS } from "./electronics";
import { WIDGET_COMPONENTS, widgetReader, type WidgetCtx } from "./widgets";
import type { Locale } from "@/lib/bitext";

function ctxForLocale(section: Section, locale: Locale): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, locale),
    Heading: "h2",
    primary: false,
    editing: false,
    locale,
    storeSlug: "test",
    link: (href: string) => href,
    data: undefined,
    renderChildren: () => null,
  };
}

function htmlFor(
  Cmp: (p: WidgetCtx) => React.ReactNode,
  section: Section,
  locale: Locale,
): string {
  return renderToStaticMarkup(
    createElement(
      Cmp as (p: WidgetCtx) => React.ReactElement,
      ctxForLocale(section, locale),
    ),
  );
}

function sectionWith(
  type: Parameters<typeof newSection>[0],
  props: object,
): Section {
  const base = newSection(type);
  return { ...base, props: { ...base.props, ...props } };
}

describe("hero items-row locale parity", () => {
  const Cmp = WIDGET_COMPONENTS["hero"];
  const props = {
    items: [
      {
        heading: "Welcome",
        heading_bn: "স্বাগতম",
        image: "/hero.jpg",
        subheading: "New season",
        subheading_bn: "নতুন সিজন",
        ctaLabel: "Shop",
        ctaLabel_bn: "কেনাকাটা",
        ctaHref: "/c",
      },
    ],
  };

  it("bn renders the _bn twins", () => {
    const html = htmlFor(Cmp, sectionWith("hero", props), "bn");
    expect(html).toContain("স্বাগতম");
    expect(html).toContain("নতুন সিজন");
    expect(html).toContain("কেনাকাটা");
    expect(html).not.toContain(">Welcome<");
  });

  it("en renders English", () => {
    const html = htmlFor(Cmp, sectionWith("hero", props), "en");
    expect(html).toContain(">Welcome<");
    expect(html).not.toContain("স্বাগতম");
  });

  it("bn falls back to English when twins are missing", () => {
    const html = htmlFor(
      Cmp,
      sectionWith("hero", {
        items: [{ heading: "Only English", image: "/h.jpg" }],
      }),
      "bn",
    );
    expect(html).toContain("Only English");
  });
});

describe("faq items-row locale parity", () => {
  const Cmp = WIDGET_COMPONENTS["faq"];
  const props = {
    items: [
      {
        question: "Size?",
        question_bn: "সাইজ?",
        answer: "Runs large.",
        answer_bn: "বড় সাইজ।",
      },
    ],
  };

  it("bn renders the _bn twins", () => {
    const html = htmlFor(Cmp, sectionWith("faq", props), "bn");
    expect(html).toContain("সাইজ?");
    expect(html).toContain("বড় সাইজ।");
    expect(html).not.toContain(">Size?<");
  });

  it("bn falls back to English when twins are missing", () => {
    const html = htmlFor(
      Cmp,
      sectionWith("faq", {
        items: [{ question: "Size?", answer: "Runs large." }],
      }),
      "bn",
    );
    expect(html).toContain("Size?");
    expect(html).toContain("Runs large.");
  });
});

describe("product_qna items-row locale parity", () => {
  const Cmp = PDP_WIDGETS["product_qna"];
  const props = {
    items: [
      {
        question: "Wash?",
        question_bn: "ধোয়া?",
        answer: "Cold wash.",
        answer_bn: "ঠান্ডা পানিতে ধুন।",
      },
    ],
  };

  it("bn renders the _bn twins", () => {
    const html = htmlFor(Cmp, sectionWith("product_qna", props), "bn");
    expect(html).toContain("ধোয়া?");
    expect(html).toContain("ঠান্ডা পানিতে ধুন।");
    expect(html).not.toContain(">Wash?<");
  });

  it("bn falls back to English when twins are missing", () => {
    const html = htmlFor(
      Cmp,
      sectionWith("product_qna", {
        items: [{ question: "Wash?", answer: "Cold wash." }],
      }),
      "bn",
    );
    expect(html).toContain("Wash?");
  });
});

describe("trust_bar items-row locale parity", () => {
  const Cmp = CHROME_WIDGETS["trust_bar"];
  const props = {
    items: [
      {
        icon: "delivery",
        title: "Fast delivery",
        title_bn: "দ্রুত ডেলিভারি",
        body: "In 48 hours",
        body_bn: "৪৮ ঘণ্টায়",
      },
    ],
  };

  it("bn renders the _bn twins", () => {
    const html = htmlFor(Cmp, sectionWith("trust_bar", props), "bn");
    expect(html).toContain("দ্রুত ডেলিভারি");
    expect(html).toContain("৪৮ ঘণ্টায়");
    expect(html).not.toContain("Fast delivery");
  });

  it("bn falls back to English when twins are missing", () => {
    const html = htmlFor(
      Cmp,
      sectionWith("trust_bar", {
        items: [{ icon: "delivery", title: "Fast delivery", body: "" }],
      }),
      "bn",
    );
    expect(html).toContain("Fast delivery");
  });
});

describe("announcement_bar items-row locale parity", () => {
  const Cmp = CHROME_WIDGETS["announcement_bar"];
  const props = {
    items: [
      { text: "Sale!", text_bn: "ছাড়!" },
      { text: "New in", text_bn: "নতুন এসেছে" },
    ],
  };

  it("bn renders the _bn twins", () => {
    const html = htmlFor(Cmp, sectionWith("announcement_bar", props), "bn");
    expect(html).toContain("ছাড়!");
    expect(html).not.toContain(">Sale!<");
  });

  it("bn falls back to English when twins are missing", () => {
    const html = htmlFor(
      Cmp,
      sectionWith("announcement_bar", { items: [{ text: "Sale!" }] }),
      "bn",
    );
    expect(html).toContain("Sale!");
  });
});

describe("lookbook items-row locale parity", () => {
  const Cmp = APPAREL_WIDGETS["lookbook"];
  const props = {
    items: [{ image: "/a.jpg", alt: "Look 1", alt_bn: "লুক ১", href: "" }],
  };

  it("bn renders the _bn alt", () => {
    const html = htmlFor(Cmp, sectionWith("lookbook", props), "bn");
    expect(html).toContain("লুক ১");
    expect(html).not.toContain('alt="Look 1"');
  });

  it("bn falls back to English alt when the twin is missing", () => {
    const html = htmlFor(
      Cmp,
      sectionWith("lookbook", {
        items: [{ image: "/a.jpg", alt: "Look 1", href: "" }],
      }),
      "bn",
    );
    expect(html).toContain('alt="Look 1"');
  });
});

describe("spec_table items-row locale parity", () => {
  const Cmp = CIRCUIT_WIDGETS["spec_table"];
  const props = {
    items: [
      {
        group: "Battery",
        group_bn: "ব্যাটারি",
        label: "Capacity",
        label_bn: "ধারণক্ষমতা",
        value: "5000mAh",
        value_bn: "৫০০০এমএএইচ",
      },
    ],
  };

  it("bn renders the _bn twins", () => {
    const html = htmlFor(Cmp, sectionWith("spec_table", props), "bn");
    expect(html).toContain("ধারণক্ষমতা");
    expect(html).toContain("৫০০০এমএএইচ");
    expect(html).not.toContain(">Capacity<");
  });

  it("bn falls back to English when twins are missing", () => {
    const html = htmlFor(
      Cmp,
      sectionWith("spec_table", {
        items: [{ group: "", label: "Capacity", value: "5000mAh" }],
      }),
      "bn",
    );
    expect(html).toContain("Capacity");
    expect(html).toContain("5000mAh");
  });
});

describe("repeater parse round-trip preserves items + _bn twins", () => {
  const CASES: Array<{
    type: SectionType;
    slot: Slot;
    props: Record<string, unknown>;
  }> = [
    {
      type: "hero",
      slot: "main",
      props: {
        items: [
          {
            heading: "Welcome",
            heading_bn: "স্বাগতম",
            image: "/hero.jpg",
            subheading: "New season",
            subheading_bn: "নতুন সিজন",
            ctaLabel: "Shop",
            ctaLabel_bn: "কেনাকাটা",
            ctaHref: "/c",
          },
        ],
      },
    },
    {
      type: "faq",
      slot: "main",
      props: {
        items: [
          {
            question: "Size?",
            question_bn: "সাইজ?",
            answer: "Runs large.",
            answer_bn: "বড় সাইজ।",
          },
        ],
      },
    },
    {
      type: "product_qna",
      slot: "main",
      props: {
        items: [
          {
            question: "Wash?",
            question_bn: "ধোয়া?",
            answer: "Cold wash.",
            answer_bn: "ঠান্ডা পানিতে ধুন।",
          },
        ],
      },
    },
    {
      type: "trust_bar",
      slot: "header",
      props: {
        items: [
          {
            icon: "delivery",
            title: "Fast delivery",
            title_bn: "দ্রুত ডেলিভারি",
            body: "In 48 hours",
            body_bn: "৪৮ ঘণ্টায়",
          },
        ],
      },
    },
    {
      type: "announcement_bar",
      slot: "header",
      props: {
        items: [
          { text: "Sale!", text_bn: "ছাড়!" },
          { text: "New in", text_bn: "নতুন এসেছে" },
        ],
      },
    },
    {
      type: "lookbook",
      slot: "main",
      props: {
        items: [{ image: "/a.jpg", alt: "Look 1", alt_bn: "লুক ১", href: "" }],
      },
    },
    {
      type: "spec_table",
      slot: "main",
      props: {
        items: [
          {
            group: "Battery",
            group_bn: "ব্যাটারি",
            label: "Capacity",
            label_bn: "ধারণক্ষমতা",
            value: "5000mAh",
            value_bn: "৫০০০এমএএইচ",
          },
        ],
      },
    },
    {
      type: "footer_sitemap",
      slot: "footer",
      props: {
        items: [
          {
            title: "Shop",
            title_bn: "কেনাকাটা",
            links: "New in|/",
            links_bn: "নতুন|/",
          },
        ],
      },
    },
  ];

  for (const c of CASES) {
    it(`${c.type} keeps items rows and twins through parse→serialize`, () => {
      const ast = {
        header: [],
        main: [],
        footer: [],
        [c.slot]: [{ id: `rt-${c.type}`, type: c.type, props: c.props }],
      };
      const roundTripped = parseAst(JSON.parse(JSON.stringify(ast)));
      const section = (
        roundTripped[c.slot] as unknown as Section[]
      )[0] as Section;
      expect(section?.type).toBe(c.type);
      expect(section?.props.items).toEqual(c.props.items);
    });
  }
});
