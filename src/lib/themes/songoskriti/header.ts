import type { Section } from "../../builder-ast";
import { withSongoskritiDefaults } from "./skins";
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
  s = withSongoskritiDefaults(s);
  return [
    s("mega_menu", {
      label: "Shop",
      label_bn: "কেনাকাটা",
      limit: 8,
      columns: 4,
    }),
  ];
}
