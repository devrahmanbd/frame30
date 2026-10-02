import type { Section } from "../../builder-ast";
import { withBlueoceanDefaults } from "./skins";
import type { SectionBuilder } from "./types";

/**
 * BlueOcean header — campaign rotation strip in theme header AST.
 *
 * The shared `StoreHeader` masthead already owns logo/nav/search/account,
 * so this theme strip carries rotating evergreen campaign messages only
 * (no fabricated discounts or deadlines). All keys are declared catalog
 * fields, so the strip survives the persist/parse round trip.
 */
export function buildHeaderMain(s: SectionBuilder): Section[] {
  const ws = withBlueoceanDefaults(s);
  return [
    ws("announcement_bar", {
      m1: "Monsoon festive edit is here",
      m1_bn: "বর্ষার উৎসব সংগ্রহ এসেছে",
      href: "/collections/festive",
      dismissible: true,
      rotateMs: 6000,
      items: [
        {
          text: "Monsoon festive edit — suits, sarees & co-ords",
          text_bn: "বর্ষার উৎসব সংগ্রহ — স্যুট, শাড়ি ও কো-অর্ড",
        },
        {
          text: "Everyday cottons — honest prices, easy fits",
          text_bn: "প্রতিদিনের সুতি — সৎ দাম, সহজ ফিট",
        },
        {
          text: "Easy 7-day exchange, no questions asked",
          text_bn: "সহজ ৭ দিনের বদল, কোনো প্রশ্ন ছাড়াই",
        },
      ] as any,
    }),
    ws("mega_menu", {
      label: "Shop",
      label_bn: "কেনাকাটা",
      limit: 8,
      columns: 4,
    }),
  ];
}
