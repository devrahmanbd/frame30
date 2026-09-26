/**
 * Phase 1b — account tab helper contract.
 *
 * Pure tests for isAccountTab / initialAccountTab + source asserts that
 * BOTH account routes wire validateSearch + initialAccountTab(search.tab).
 *
 * No jsdom — pure asserts + source asserts (node env).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACCOUNT_TABS,
  type AccountSearch,
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

  it("nextAccountTabSearch sets tab and preserves other params", () => {
    expect(nextAccountTabSearch({}, "wishlist")).toEqual({ tab: "wishlist" });
    expect(
      nextAccountTabSearch({ tab: "orders", preview_token: "abc" }, "privacy"),
    ).toEqual({ tab: "privacy", preview_token: "abc" });
  });

  it("click writes ?tab=, back restores prior tab, no history spam", () => {
    // Maximal honest runtime slice (node env, no jsdom — a full
    // route-component render needs TanStack router context + supabase
    // session + server-fn data, and no new test deps are allowed): a
    // memory-history model exercising the REAL helpers through the exact
    // contract the routes implement — push on distinct-tab click,
    // same-tab no-op, URL-derived tab (pop re-syncs with no effect).
    type Entry = { tab?: string };
    const stack: Entry[] = [{}];
    let index = 0;
    const tabNow = () => initialAccountTab(stack[index].tab);
    const click = (key: (typeof ACCOUNT_TABS)[number]) => {
      if (key === tabNow()) return; // same-tab guard: no history spam
      stack.length = index + 1;
      // Clicks only ever write valid tabs; the cast mirrors the router,
      // whose validateSearch narrows raw search before components see it.
      stack.push(nextAccountTabSearch(stack[index] as AccountSearch, key));
      index += 1;
    };
    const back = () => {
      index = Math.max(0, index - 1);
    };

    expect(tabNow()).toBe("orders"); // bare /account paints orders
    click("wishlist");
    expect(stack[index]).toEqual({ tab: "wishlist" }); // click writes ?tab=
    expect(tabNow()).toBe("wishlist");
    back();
    expect(tabNow()).toBe("orders"); // back restores prior tab
    stack.push({ tab: "wishlist" });
    index = stack.length - 1;
    expect(tabNow()).toBe("wishlist"); // direct ?tab=wishlist paints it
    stack.push({ tab: "nope" });
    index = stack.length - 1;
    expect(tabNow()).toBe("orders"); // invalid tab falls back to orders
    const len = stack.length;
    click(tabNow()); // clicking the active tab…
    expect(stack.length).toBe(len); // …pushes nothing
  });

  it("BOTH routes push (not replace) distinct tab clicks with same-tab guard", () => {
    for (const path of [
      "src/routes/account.tsx",
      "src/routes/store.$slug.account.tsx",
    ]) {
      const src = readFileSync(path, "utf8");
      expect(src).toContain("nextAccountTabSearch");
      expect(src).toContain('to: "."');
      expect(src).toContain("if (key === tab) return");
      expect(src).not.toContain("replace: true");
    }
  });
});
