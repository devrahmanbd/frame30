import type { Section } from "../../builder-ast";
import { withOceanblueDefaults } from "./skins";
import type { SectionBuilder } from "./types";

/**
 * Oceanblue topbar redesign (theme-owned, zero shared edits).
 *
 * The shared `StoreHeader` masthead (announcement + logo + nav) renders
 * identically for every theme by design — only copy/logo/menu differ via
 * key-driven config. Oceanblue's distinct topbar is therefore a second,
 * campaign-rotation strip in theme header AST (rendered below the
 * masthead by `ThemeChrome`), while the chrome strip above keeps the
 * service promise (shipping + exchange, collapses on scroll):
 *
 * - Chrome strip: service promise, static, bilingual.
 * - Theme strip: three rotating campaign messages (new season, wedding
 *   edit, exchange assurance), dismissible, 6s rotation. Copy is
 *   evergreen — no fabricated discounts, percentages, or deadlines.
 *
 * `mega_menu` / `search_command` / `account_cart` stay out of theme
 * sections (the masthead already owns them; verified no-double-chrome
 * lesson). `announcement_bar` is header-slotted, so this parses clean.
 */
export function buildHeaderMain(s: SectionBuilder): Section[] {
  s = withOceanblueDefaults(s);
  return [
    s("announcement_bar", {
      m1: "New Season AW'26 is here",
      m1_bn: "নতুন সিজন এসেছে",
      href: "/c/new-in",
      dismissible: true,
      rotateMs: 6000,
      items: [
        {
          text: "New Season AW'26 is here — suits, kurtas & sarees",
          text_bn: "নতুন সিজন এসেছে — স্যুট, কুর্তা ও শাড়ি",
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
