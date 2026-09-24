import type { Section } from "../../builder-ast";
import type { SectionBuilder } from "./types";

/**
 * Songoskriti masthead chrome (spec §2 item 2).
 * The logo lockup is a hand-built SVG (Task 3 asset); the menubar binds to
 * real menus via the menu picker (Task 5 smoke). Manual-item fallback covers
 * merchants with no menus, so no static hrefs are authored here.
 *
 * Search/account/cart live here exactly once: the storefront `StoreHeader`
 * chrome (preview frame + live store) already renders search, account and
 * cart actions, so blueprint `search_command`/`account_cart` sections would
 * render a second search bar and account row beneath the masthead.
 * Browser-verified 2026-09-24: header keeps the menubar only.
 */
export function buildHeaderMain(s: SectionBuilder): Section[] {
  return [
    s("subbrand_bar", {
      activeBrand: "Songoskriti",
      tagline: "A Social Enterprise for Artisans of Bangladesh",
      tagline_bn: "বাংলাদেশের তাঁতি ও কারিগরদের সামাজিক উদ্যোগ",
      b1Name: "Songoskriti",
      b1Href: "/",
      b2Name: "Taaga",
      b2Href: "/c/contemporary",
      b3Name: "Taaga Man",
      b3Href: "/c/men",
      b4Name: "Herstory",
      b4Href: "/c/heritage-handloom",
      b5Name: "Earth",
      b5Href: "/c/living",
    }),
    s("mega_menu", {
      label: "Shop",
      label_bn: "কেনাকাটা",
      limit: 8,
      columns: 4,
    }),
  ];
}
