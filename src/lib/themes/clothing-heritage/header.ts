import type { Section } from "../../builder-ast";
import type { SectionBuilder } from "./types";

export function buildHeader(s: SectionBuilder): Section[] {
  return [
    s("subbrand_bar", {
      activeBrand: "Aarong",
      tagline: "A Social Enterprise",
      b1Name: "Aarong",
      b1Href: "/",
      b2Name: "Taaga",
      b2Href: "/collections/taaga",
      b3Name: "Taaga Man",
      b3Href: "/collections/taaga-man",
      b4Name: "Herstory",
      b4Href: "/collections/herstory",
      b5Name: "Aarong Earth",
      b5Href: "/collections/beauty",
    }),
    s("announcement_bar", {
      m1: "Free nationwide delivery on orders over BDT 3,000",
      m2: "Eid & Festive Collection 2026 is now live",
      m3: "Handcrafted by master artisans across 64 districts",
      dismissible: true,
      rotateMs: 5000,
    }),
    s("utility_bar", {
      note: "Flagship stores open 10am - 9pm in Dhaka, Chattogram & Sylhet",
      l1Label: "Artisan stories",
      l1Href: "/blog",
      l2Label: "Store locator",
      l2Href: "/pages/stores",
      l3Label: "Track order",
      l3Href: "/pages/track-order",
      showLanguage: false,
    }),
    s("mega_menu", { label: "Shop by Category", limit: 8, columns: 4 }),
  ];
}
