/**
 * The account route's SURVIVAL rule — which of the four placeable panels the
 * storefront serves, and which of them the MERCHANT's own removal removes.
 *
 * **The hole this closes (audit gap 5).** The route used to re-supply every
 * panel the served body does not place (`store.$slug.account.tsx`, predicate
 * `themePlacesAccountPanel` in `theme-shell-slots.ts`): a panel the theme's
 * default composition places but the merchant deleted came back as the
 * dashboard's fallback, so "remove" did not stick. This module says the
 * difference in explicit data:
 *
 *   - **placed** — the served body places it → the THEME's panel;
 *   - **removed** — the theme's DEFAULT body places it but the served body
 *     does not → the MERCHANT deleted it; the dashboard's fallback skips it
 *     too, so the panel is shown NOWHERE. The removal sticks.
 *   - **neither** — the theme never placed it → the dashboard's fallback
 *     supplies it, exactly as before.
 *
 * Why default-vs-saved and not a persisted tombstone: `parseAst`
 * (`src/lib/builder-ast.ts`) strips every key outside `header`/`main`/
 * `footer` and `parseTemplates` drops unknown template keys, so a meta bag
 * cannot survive the canonical round trip without touching the parser — an
 * unnecessary risk against the stored-AST compatibility rule. The edge this
 * rule accepts, stated rather than hidden: a FUTURE theme update that adds a
 * panel to the default body reads as a merchant removal for an old draft, so
 * that panel stays absent for stores served from an old body. A theme with
 * no registry package (custom seeded content) resolves to an empty default
 * set, so `removed` is empty and the safety net is whole — the prior
 * behaviour, byte for byte, for anything this rule cannot judge.
 *
 * Pure data in, lists out: no React, no DOM, no DB.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ThemeAst, ThemeTemplates } from "./builder-ast";
import { themeBodyRenders, themePlacesAccountPanel } from "./theme-shell-slots";
import type { AccountPanelType } from "@/components/store/AccountDashboardContext";

/** The four placeable panels, in the route's own order. */
export const ACCOUNT_PANEL_TYPES: readonly AccountPanelType[] = [
  "account_nav",
  "account_overview",
  "account_orders",
  "account_details",
];

/** The shape of the chrome the account route's loader feeds the rule. */
export type AccountChrome = {
  /** The SERVED composition — the published map's `account` body. */
  ast: ThemeAst | null;
  /** The installed theme key the composition was served from. */
  themeKey?: string | null;
} | null;

/** The panels a DEFAULT theme body places (the same predicate, full set). */
export function placedAccountPanels(
  ast: ThemeAst | null | undefined,
): readonly AccountPanelType[] {
  return ACCOUNT_PANEL_TYPES.filter((panel) =>
    themePlacesAccountPanel(ast, panel),
  );
}

/**
 * The survival rule: `removed = defaultPlaced − servedPlaced`.
 *
 * Guarded in both directions: a chrome with NO served composition returns
 * nothing (there is no saved body to compare — the whole safety net stands),
 * and a served body that does not render at all (it predates the route-owned
 * `page_content` slot) returns nothing — the theme never deleted anything
 * then, the whole body is dropped, and the dashboard must carry every panel,
 * exactly as `themePlacesAccountPanel`'s contract already serves it.
 */
export function accountPanelsRemoved(
  chrome: AccountChrome,
  defaultAst: ThemeAst | null | undefined,
): readonly AccountPanelType[] {
  const served = chrome?.ast;
  if (!served || !themeBodyRenders(served)) return [];
  const servedPanels = placedAccountPanels(served);
  return placedAccountPanels(defaultAst ?? null).filter(
    (panel) => !servedPanels.includes(panel),
  );
}

/**
 * The loader half: the DEFAULT composition comes from the installed theme's
 * registry package, so the comparison runs against what the theme's own
 * package authors for `account` today. Unknown theme key (or a package that
 * authors no account body) → an empty default set → `removed` is empty and
 * the safety net is whole.
 */
export async function loadRemovedAccountPanels(
  chrome: AccountChrome,
): Promise<readonly AccountPanelType[]> {
  if (!chrome?.themeKey || !chrome.ast) return [];
  const { registryPackage } = await import("./themes.server");
  const templates: ThemeTemplates = registryPackage(chrome.themeKey).templates;
  return accountPanelsRemoved(chrome, templates["account"] ?? null);
}

/**
 * The loader's seam. Route loaders are client-executed on client-side
 * navigation, and `themes.server` reaches `node:async_hooks` through
 * `observability.server`, so the default read MUST live in a server
 * function — exactly where every other server read lives (the route's own
 * `getStoreChrome` call is the neighbouring precedent).
 *
 * The served AST travels with the request because `getStoreChrome` already
 * loaded it; the handler only compares it with the installed package's
 * default. It grants nothing, so a hostile payload can only cause the answer
 * "[]" — the wholesale safety net, which is the pre-existing behaviour.
 */
export const accountRemovedPanelsFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        themeKey: z.string().min(1).nullable(),
        ast: z.unknown().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<readonly AccountPanelType[]> => {
    try {
      return await loadRemovedAccountPanels({
        themeKey: data.themeKey,
        ast: data.ast as ThemeAst | null,
      });
    } catch {
      return [];
    }
  });
