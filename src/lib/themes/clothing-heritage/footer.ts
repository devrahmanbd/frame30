import type { Section } from "../../builder-ast";
import type { SectionBuilder } from "./types";

export function buildFooter(s: SectionBuilder): Section[] {
  return [
    s("support_strip", {
      heading: "Customer Support & Concierge",
      t1Title: "Order Tracking",
      t1Body: "Real-time dispatch updates",
      t1Href: "/pages/track-order",
      t2Title: "Store Locator",
      t2Body: "Find your nearest flagship",
      t2Href: "/pages/stores",
      t3Title: "Size & Fit Advice",
      t3Body: "Personal styling helpline",
      t3Href: "/pages/size-guide",
      t4Title: "Easy Exchanges",
      t4Body: "7-day doorstep exchange",
      t4Href: "/pages/returns",
    }),
    s("footer_sitemap", {
      c1Title: "Collections",
      c1Links:
        "Tangail Taant\nJamdani Saree\nSilk Panjabi\nNakshi Kantha\nArtisan Jewelry",
      c2Title: "Customer Care",
      c2Links:
        "Size guide\nOrder tracking\nReturns & exchanges\nStore locations\nContact us",
      c3Title: "Our Heritage",
      c3Links:
        "Artisan communities\nHandloom preservation\nFair trade charter\nSustainability",
      c4Title: "About Framique",
      c4Links: "Our story\nMedia & press\nCareers\nTerms & privacy",
    }),
    s("payment_icons", {
      heading: "Payment methods",
      marks: "bKash, Nagad, Rocket, Visa, Mastercard, Cash on Delivery",
    }),
    s("newsletter", {
      heading: "First to the festive drops",
      body: "One letter per drop. Weaves, restocks and artisan stories — never spam.",
      buttonLabel: "Join the list",
    }),
    s("rich_text", {
      heading: "",
      body: "Flagships: Uttara · Gulshan · Chattogram — open 10am to 9pm.",
    }),
  ];
}
