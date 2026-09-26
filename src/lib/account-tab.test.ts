/**
 * Phase 1b — account tab helper contract.
 *
 * Pure tests for isAccountTab / initialAccountTab / nextAccountTabSearch +
 * source asserts that BOTH account routes wire validateSearch,
 * initialAccountTab(search.tab), the pop/state-sync effect, AND the
 * click → URL write (navigate + shared helper + replace:true).
 *
 * No jsdom — pure asserts + source asserts (node env). A full
 * route-component render (memory history: ?tab=wishlist paints wishlist,
 * click writes ?tab=, back restores) is impractical here: both AccountPage
 * components require TanStack router context + supabase session + server-fn
 * data, and the repo forbids new deps (no testing-library/jsdom/
 * test-renderer). The maximal runtime slice is below: the deep-link →
 * click → back scenario is executed through the REAL prod functions
 * (initialAccountTab + nextAccountTabSearch) composed exactly as the
 * routes compose them, and source asserts pin that both routes call them.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACCOUNT_TABS,
  initialAccountTab,
  isAccountTab,
  nextAccountTabSearch,
} from "@/lib/account-tab";

describe("account-tab helper", () => {
  it("accepts every declared tab", () => {
    expect(ACCOUNT_TABS).toEqual([
      "orders",
      "addresses",
      "wishlist",
      "profile",
      "privacy",
    ]);
    for (const tab of ACCOUNT_TABS) {
      expect(isAccountTab(tab)).toBe(true);
      expect(initialAccountTab(tab)).toBe(tab);
    }
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isAccountTab("plugin")).toBe(false);
    expect(isAccountTab("orders ")).toBe(false);
    expect(isAccountTab("")).toBe(false);
    expect(isAccountTab(undefined)).toBe(false);
    expect(isAccountTab(null)).toBe(false);
    expect(isAccountTab(42)).toBe(false);
    expect(isAccountTab({})).toBe(false);
  });

  it("falls back to orders for anything unexpected", () => {
    expect(initialAccountTab(undefined)).toBe("orders");
    expect(initialAccountTab(null)).toBe("orders");
    expect(initialAccountTab("nope")).toBe("orders");
    expect(initialAccountTab(42)).toBe("orders");
  });

  it("wires validateSearch + init tab in BOTH account routes", () => {
    for (const path of [
      "src/routes/account.tsx",
      "src/routes/store.$slug.account.tsx",
    ]) {
      const src = readFileSync(path, "utf8");
      expect(src).toContain("validateSearch");
      expect(src).toContain("initialAccountTab(search.tab)");
      expect(src).toContain("@/lib/account-tab");
    }
  });

  it("re-syncs tab state from search.tab on back/forward (both routes)", () => {
    for (const path of [
      "src/routes/account.tsx",
      "src/routes/store.$slug.account.tsx",
    ]) {
      const src = readFileSync(path, "utf8");
      expect(src).toContain("setTab(initialAccountTab(search.tab))");
      expect(src).toMatch(
        /useEffect\(\(\) => \{\s*\n?\s*setTab\(initialAccountTab\(search\.tab\)\)/,
      );
      expect(src).toMatch(/\[search\.tab\]/);
    }
  });
});

describe("nextAccountTabSearch (click → URL write, runtime)", () => {
  it("sets the clicked tab", () => {
    expect(nextAccountTabSearch({ tab: "orders" }, "wishlist")).toEqual({
      tab: "wishlist",
    });
    expect(nextAccountTabSearch({}, "profile")).toEqual({ tab: "profile" });
  });

  it("drops every other search param (validators keep tab-only)", () => {
    expect(
      nextAccountTabSearch(
        { tab: "orders", preview_token: "abc", focus: "hero" },
        "wishlist",
      ),
    ).toEqual({ tab: "wishlist" });
  });

  it("does not mutate the previous search object", () => {
    const prev = { tab: "orders" as const, preview_token: "abc" };
    nextAccountTabSearch(prev, "privacy");
    expect(prev).toEqual({ tab: "orders", preview_token: "abc" });
  });
});

describe("account tab URL sync scenario (runtime slice)", () => {
  it("deep-link → click → back, through the real prod functions", () => {
    // 1. Deep link ?tab=wishlist: useState init paints the wishlist panel.
    let search: Record<string, unknown> = { tab: "wishlist" };
    let tab = initialAccountTab(search.tab);
    expect(tab).toBe("wishlist");

    // 2. Tab click: setTab(key) + URL write via the shared search updater.
    tab = "orders";
    search = nextAccountTabSearch(search, "orders");
    expect(tab).toBe("orders");
    expect(search).toEqual({ tab: "orders" }); // URL gains ?tab=orders

    // 3. History back to ?tab=wishlist: pop/state-sync effect restores paint.
    search = { tab: "wishlist" };
    tab = initialAccountTab(search.tab);
    expect(tab).toBe("wishlist");
  });
});

describe("account tab click writes the URL (both routes)", () => {
  for (const path of [
    "src/routes/account.tsx",
    "src/routes/store.$slug.account.tsx",
  ]) {
    it(`${path} navigates with the shared helper + replace:true`, () => {
      const src = readFileSync(path, "utf8");
      expect(src).toContain("Route.useNavigate()");
      expect(src).toContain("nextAccountTabSearch(prev, key)");
      expect(src).toContain("replace: true");
      expect(src).toContain("nextAccountTabSearch");
    });

    it(`${path} has no bare local-only tab click left`, () => {
      const src = readFileSync(path, "utf8");
      expect(src).not.toContain("onClick={() => setTab(key)}");
      expect(src).toContain("onClick={() => selectTab(key)}");
    });
  }
});
