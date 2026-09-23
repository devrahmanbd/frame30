import type { Section } from "../../builder-ast";
import type { SectionBuilder } from "./types";

/**
 * Songoskriti masthead chrome (spec §2 item 2).
 * The logo lockup is a hand-built SVG (Task 3 asset); the menubar binds to
 * real menus via the menu picker (Task 5 smoke). Manual-item fallback covers
 * merchants with no menus, so no static hrefs are authored here.
 */
export function buildHeaderMain(s: SectionBuilder): Section[] {
  return [
    s("mega_menu", {
      label: "Shop",
      label_bn: "কেনাকাটা",
      limit: 8,
      columns: 4,
    }),
    s("search_command", {
      placeholder: "Search sarees, panjabis and more",
      placeholder_bn: "শাড়ি, পাঞ্জাবি এবং আরও খুঁজুন",
      buttonLabel: "Search",
      buttonLabel_bn: "খুঁজুন",
      limit: 6,
    }),
    s("account_cart", {
      accountLabel: "Account",
      accountLabel_bn: "অ্যাকাউন্ট",
      cartLabel: "Cart",
      cartLabel_bn: "কার্ট",
      showCount: true,
    }),
  ];
}
