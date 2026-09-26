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
  initialAccountTab,
  isAccountTab,
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
});
