import { describe, expect, it } from "vitest";
import { adaptThemeTemplatesForMerchant } from "./merchant-adapt";
import type { ThemeTemplates } from "../builder-ast";

describe("adaptThemeTemplatesForMerchant", () => {
  it("replaces Songoskriti and Bengali name with merchant name", () => {
    const templates: ThemeTemplates = {
      index: {
        header: [],
        main: [
          {
            id: "heading-1",
            type: "heading",
            props: {
              text: "Welcome to Songoskriti Store",
              text_bn: "সংস্কৃতি দোকানে স্বাগতম",
            },
          },
        ],
        footer: [],
      },
    };

    const adapted = adaptThemeTemplatesForMerchant(templates, {
      name: "Flame Fashion BD",
      nameBn: "ফ্লেম ফ্যাশন বিডি",
    });

    const main = adapted.index?.main as any[];
    expect(main[0].props.text).toBe("Welcome to Flame Fashion BD Store");
    expect(main[0].props.text_bn).toBe("ফ্লেম ফ্যাশন বিডি দোকানে স্বাগতম");
  });

  it("strips care@songoskriti.com and flagships when unconfigured", () => {
    const templates: ThemeTemplates = {
      index: {
        header: [],
        main: [],
        footer: [
          {
            id: "footer-1",
            type: "container",
            props: {
              contact: "care@songoskriti.com\n+880 96 1234 5678\nUttara Flagship\nSupport: 10AM - 9PM\nGeneral inquiries",
              contact_bn: "care@songoskriti.com\n+৮৮০ ৯৬ ১২৩৪ ৫৬৭৮\nউত্তরা ফ্ল্যাগশিপ\nসাপোর্ট: সকাল ১০টা - রাত ৯টা\nসাধারণ জিজ্ঞাসা",
            },
          },
        ],
      },
    };

    const adapted = adaptThemeTemplatesForMerchant(templates, {
      name: "Flame Fashion BD",
      supportEmail: null,
      supportPhone: null,
      locations: null,
    });

    const footer = adapted.index?.footer as any[];
    expect(footer[0].props.contact).toBe("General inquiries");
    expect(footer[0].props.contact_bn).toBe("সাধারণ জিজ্ঞাসা");
  });

  it("substitutes configured merchant email and phone", () => {
    const templates: ThemeTemplates = {
      index: {
        header: [],
        main: [],
        footer: [
          {
            id: "footer-1",
            type: "container",
            props: {
              contact: "care@songoskriti.com\n+880 96 1234 5678",
            },
          },
        ],
      },
    };

    const adapted = adaptThemeTemplatesForMerchant(templates, {
      name: "Flame Fashion BD",
      supportEmail: "support@flamelancer.com",
      supportPhone: "+8801700000000",
    });

    const footer = adapted.index?.footer as any[];
    expect(footer[0].props.contact).toContain("Email: support@flamelancer.com|mailto:support@flamelancer.com");
    expect(footer[0].props.contact).toContain("Phone: +8801700000000|/pages/contact");
  });

  it("prunes sample product disclaimer text from product template", () => {
    const templates: ThemeTemplates = {
      product: {
        header: [],
        main: [
          {
            id: "notice-1",
            type: "rich_text",
            props: {
              body: "Sample product page — prices and stock are sample data",
            },
          },
          {
            id: "prod-1",
            type: "container",
            props: {},
          },
        ],
        footer: [],
      },
    };

    const adapted = adaptThemeTemplatesForMerchant(templates, {
      name: "Flame Fashion BD",
    });

    const main = adapted.product?.main as any[];
    expect(main).toHaveLength(1);
    expect(main[0].type).toBe("container");
  });
});
