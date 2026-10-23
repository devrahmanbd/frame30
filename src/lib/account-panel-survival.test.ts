/**
 * The account route's survival rule (audit gap 5) — the unit suite.
 *
 * The rule closes the placement hole the audit measured: the route used to
 * re-supply every panel the served body does not place, so a panel the
 * theme's DEFAULT body places but the MERCHANT deleted came back as the
 * dashboard's fallback and "remove" did not stick. The rule names the third
 * panel state explicitly (`removed`) and the dashboard's fallback skips
 * `placed ∪ removed`.
 *
 * Vitest env node — NO jsdom/testing-library. Static markup via
 * `renderToStaticMarkup` + the router's `Link` mocked (the repo's own
 * convention, `src/components/store/AccountDashboard.test.tsx`).
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { Section, SectionType, ThemeAst } from "@/lib/builder-ast";
import { themeBodyRenders, themePlacesAccountPanel } from "./theme-shell-slots";
import {
  ACCOUNT_PANEL_TYPES,
  accountPanelsRemoved,
  placedAccountPanels,
} from "./account-panel-survival";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      children,
      ...rest
    }: {
      children?: React.ReactNode;
    } & Record<string, unknown>) => createElement("a", { ...rest }, children),
  };
});

import { AccountDashboard } from "@/components/store/AccountDashboard";
import {
  AccountDashboardProvider,
  type AccountDashboardState,
  type AccountPanelType,
} from "@/components/store/AccountDashboardContext";

function section(type: SectionType, id: string = type): Section {
  return { id, type, props: {} };
}

function ast(
  main: Section[],
  extra?: { header?: Section[]; footer?: Section[] },
): ThemeAst {
  return {
    header: extra?.header ?? [],
    main,
    footer: extra?.footer ?? [],
  };
}

/** A DEFAULT body: the panels in the theme's own order, above the slot. */
const DEFAULT_BODY = ast([
  section("account_nav", "nav"),
  section("account_overview", "over"),
  section("account_orders", "ord"),
  section("account_details", "det"),
  section("page_content", "body"),
]);

describe("the survival rule — the third panel state", () => {
  it("removes nothing when the served body still places everything", () => {
    expect(accountPanelsRemoved({ ast: DEFAULT_BODY }, DEFAULT_BODY)).toEqual(
      [],
    );
  });

  it("names a deleted default panel REMOVED — and only that one", () => {
    // The merchant deleted the nav section from the saved body — and ONLY
    // the nav section.
    const served = ast([
      section("account_overview", "over"),
      section("account_orders", "ord"),
      section("account_details", "det"),
      section("page_content", "body"),
    ]);
    expect(accountPanelsRemoved({ ast: served }, DEFAULT_BODY)).toEqual([
      "account_nav",
    ]);
    // A panel the served body STILL places is the theme's, never "removed".
    expect(themePlacesAccountPanel(served, "account_overview")).toBe(true);
    expect(themePlacesAccountPanel(served, "account_nav")).toBe(false);
  });

  it("reads the CHROME too: a panel still in it is not a removal", () => {
    const served = ast(
      [
        section("account_overview", "over"),
        section("account_orders", "ord"),
        section("account_details", "det"),
        section("page_content", "body"),
      ],
      { header: [section("account_nav", "nav-in-chrome")] },
    );
    expect(themePlacesAccountPanel(served, "account_nav")).toBe(true);
    expect(accountPanelsRemoved({ ast: served }, DEFAULT_BODY)).toEqual([]);
  });

  it("removes nothing when the served body predates the body slot", () => {
    // The whole body is dropped (`themeRendersBody` = false) — the merchant
    // did not author a removal, the dashboard carries EVERY panel.
    const legacy = ast([
      section("heading", "h"),
      section("account_nav", "nav"),
    ]);
    expect(themeBodyRenders(legacy)).toBe(false);
    expect(accountPanelsRemoved({ ast: legacy }, DEFAULT_BODY)).toEqual([]);
  });

  it("removes nothing for a store with no theme composition at all", () => {
    // Whole safety net — exactly the prior behaviour.
    expect(accountPanelsRemoved(null, DEFAULT_BODY)).toEqual([]);
    expect(accountPanelsRemoved({ ast: null }, DEFAULT_BODY)).toEqual([]);
  });

  it("removes nothing when the default package authors NO account body", () => {
    // Custom seeded content or an absent registry body: the comparison has
    // no default to judge against, so nothing is a removal.
    const served = ast([section("page_content", "body")]);
    expect(accountPanelsRemoved({ ast: served }, null)).toEqual([]);
    const all = placedAccountPanels(DEFAULT_BODY);
    expect(all).toEqual([
      "account_nav",
      "account_overview",
      "account_orders",
      "account_details",
    ]);
    // And the WHOLESALE-supply guard holds for the partial default too:
    // a panel the default places counts; a panel it never placed does not.
    const partial = ast([
      section("account_nav", "nav"),
      section("page_content", "body"),
    ]);
    expect(placedAccountPanels(partial)).toEqual(["account_nav"]);
  });

  it("keeps the panel catalog closed and ordered", () => {
    expect(ACCOUNT_PANEL_TYPES).toEqual([
      "account_nav",
      "account_overview",
      "account_orders",
      "account_details",
    ]);
  });
});

/* --------------------- the rendered surface ------------------------------
 * The rule is only real when the RENDERED skip changes: a provider state
 * carrying `removed` must make the deleted panel ABSENT — the dashboard
 * never re-supplies it — while the other panels still render.
 * ------------------------------------------------------------------------ */

function renderUnderState(state: Partial<AccountDashboardState>): string {
  const value: AccountDashboardState = {
    slug: "demo",
    currency: "BDT",
    status: "ready",
    orders: [],
    tab: "orders",
    setTab: () => undefined,
    openOrderId: null,
    setOpenOrderId: () => undefined,
    ...state,
  };
  return renderToStaticMarkup(
    createElement(AccountDashboardProvider, {
      value,
      // The provider is a function component whose `children` prop is
      // required, so the child rides IN the props object (the varargs form
      // does not satisfy this React-types version).
      children: createElement(AccountDashboard, {
        slug: value.slug,
        status: value.status,
        tab: value.tab,
        currency: value.currency,
      }),
    }),
  );
}

function rendersPanel(markup: string, panel: AccountPanelType): boolean {
  // Every fallback panel's copy carries its own labelled landmark, and the
  // nav renders its tabs — assert on data the panel owns, not on a wrapper
  // class that could drift.
  return markup.includes(navProbe(panel));
}

const NAV_PATTERNS: Record<AccountPanelType, string> = {
  account_nav: 'aria-label="Account sections"',
  // The overview strip's own labelled section.
  account_overview: "At a glance",
  // The orders panel's designed empty state (the route's own fallback).
  account_orders: "No orders yet.",
  // The details panel renders per-tab; probe the addresses tab's empty state.
  account_details: "No saved addresses yet.",
};
const navProbe = (panel: AccountPanelType): string => NAV_PATTERNS[panel];

describe("the rendered skip — placed ∪ removed", () => {
  it("keeps every fallback panel when nothing is placed or removed", () => {
    // The orders panel shows on the `orders` tab; the details panel on the
    // `addresses` tab — two renders, one claim each.
    const ordersTab = renderUnderState({ tab: "orders" });
    const addressesTab = renderUnderState({ tab: "addresses" });
    expect(rendersPanel(ordersTab, "account_nav")).toBe(true);
    expect(rendersPanel(ordersTab, "account_overview")).toBe(true);
    expect(rendersPanel(ordersTab, "account_orders")).toBe(true);
    expect(rendersPanel(addressesTab, "account_details")).toBe(true);
  });

  it("hides exactly the PLACED panels — the placed rule is intact", () => {
    const ordersTab = renderUnderState({
      tab: "orders",
      placed: ["account_nav", "account_overview"],
    });
    expect(rendersPanel(ordersTab, "account_nav")).toBe(false);
    expect(rendersPanel(ordersTab, "account_overview")).toBe(false);
    expect(rendersPanel(ordersTab, "account_orders")).toBe(true);
  });

  it("sticks the removal: a REMOVED panel renders even as a fallback", () => {
    // THE gap: the served body no longer places the nav (placed is empty),
    // but the theme's default body DID — so the merchant deleted it. The
    // dashboard must NOT re-supply it. This is the assertion the old
    // behaviour (re-supply every unplaced panel) failed.
    const ordersTab = renderUnderState({
      tab: "orders",
      removed: ["account_nav"],
    });
    expect(rendersPanel(ordersTab, "account_nav")).toBe(false);
    // The OTHER panels keep their fallback — the removal is surgical.
    expect(rendersPanel(ordersTab, "account_overview")).toBe(true);
    expect(rendersPanel(ordersTab, "account_orders")).toBe(true);
  });

  it("skips the union: a panel both placed and removed stays absent too", () => {
    // placed ∪ removed — the union, inverted twice by the dashboard.
    const addressesTab = renderUnderState({
      tab: "addresses",
      placed: ["account_details"],
      removed: ["account_details"],
    });
    expect(rendersPanel(addressesTab, "account_details")).toBe(false);
    expect(rendersPanel(addressesTab, "account_overview")).toBe(true);
  });

  it("keeps the SIGNED-OUT safety net whole, whatever the removed set says", () => {
    // A signed-out shopper never sees the placed/removed surface at all.
    const markup = renderUnderState({
      status: "unauthenticated",
      removed: ["account_nav", "account_overview"],
    });
    expect(
      markup.includes("Track Your Order"),
      "the signed-out surface is the designed order lookup",
    ).toBe(true);
    expect(
      markup.includes('aria-label="Account sections"'),
      "the removed nav panel is not shown signed-out either",
    ).toBe(false);
  });
});
