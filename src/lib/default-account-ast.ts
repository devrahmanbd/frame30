/**
 * Default account-template AST.
 *
 * Fallback `account` template used when a merchant publishes no `account`
 * template of their own: a bilingual `orders_list` over a `profile_card`,
 * mirroring the built-in dashboard (order history, then shopper details).
 *
 * Wiring note: pass as the `ast`-level default —
 * `ast={chrome?.ast ?? defaultAccountAst()}` — once the widget registry knows
 * the `orders_list` / `profile_card` types. Until that integration lands the
 * renderer skips unregistered types, so routes keep `ast={chrome?.ast ?? null}`
 * with the dashboard as `fallback` (a data AST is not a renderable fallback).
 *
 * Bilingual style follows the blueprints: English props plus explicit `_bn`
 * twins. The `_bn` sides are explicit (not factory-filled) because `withBn`
 * can only fill types the widget catalog already declares.
 */
import type { SectionType, ThemeAst } from "./builder-ast";
import { sectionFactory } from "./theme-section";

/** বাংলা twins for the default account copy (mirrors BLUEPRINT_BN). */
const ACCOUNT_BN: Record<string, string> = {
  "Your orders": "আপনার অর্ডার",
  "No orders yet.": "এখনও কোনো অর্ডার নেই।",
  "Your profile": "আপনার প্রোফাইল",
};

const make = sectionFactory(ACCOUNT_BN);

export function defaultAccountAst(): ThemeAst {
  return {
    header: [],
    main: [
      // Section types land with the parallel widget track; asserted the same
      // way the widget tests assert them (`as unknown as SectionType`).
      make("account", "orders_list" as unknown as SectionType, {
        heading: "Your orders",
        heading_bn: "আপনার অর্ডার",
        emptyText: "No orders yet.",
        emptyText_bn: "এখনও কোনো অর্ডার নেই।",
        limit: 5,
      }),
      make("account", "profile_card" as unknown as SectionType, {
        heading: "Your profile",
        heading_bn: "আপনার প্রোফাইল",
      }),
    ],
    footer: [],
  };
}
