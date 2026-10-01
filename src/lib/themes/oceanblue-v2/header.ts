import type { Section } from "../../builder-ast";
import { withOceanblueV2Defaults } from "./skins";
import type { SectionBuilder } from "./types";

/**
 * Oceanblue-v2 topbar (theme-owned, zero shared edits).
 *
 * Same verified pattern as v1: the shared `StoreHeader` masthead renders
 * identically for every theme — only copy/logo/menu differ via key-driven
 * config. V2's distinct topbar is therefore a second, campaign-rotation
 * strip in theme header AST (rendered below the masthead by
 * `ThemeChrome`), while the chrome strip above keeps the service promise.
 *
 * - Chrome strip: service promise, static, bilingual.
 * - Theme strip: three rotating festive messages (new season, wedding
 *   edit, exchange assurance), dismissible, 6s rotation. Copy is
 *   evergreen — no fabricated discounts, percentages, or deadlines.
 *
 * `mega_menu` / `search_command` / `account_cart` stay out of theme
 * sections (the masthead already owns them; verified no-double-chrome
 * lesson). `announcement_bar` is header-slotted, so this parses clean.
 */
export function buildHeaderMain(s: SectionBuilder): Section[] {
  s = withOceanblueV2Defaults(s);
  return [
    s("announcement_bar", {
      m1: "The Festive Edit has arrived",
      m1_bn: "উৎসবের সংগ্রহ এসেছে",
      href: "/c/festive",
      dismissible: true,
      rotateMs: 6000,
      items: [
        {
          text: "The Festive Edit has arrived — suits, kurtas & sarees",
          text_bn: "উৎসবের সংগ্রহ এসেছে — স্যুট, কুর্তা ও শাড়ি",
        },
        {
          text: "The Wedding Edit — lehengas & anarkalis",
          text_bn: "বিয়ের সংগ্রহ — লেহেঙ্গা ও আনারকলি",
        },
        {
          text: "Easy 7-day exchange, no questions asked",
          text_bn: "সহজ ৭ দিনের বদল, কোনো প্রশ্ন ছাড়াই",
        },
      ],
    }),
  ];
}
