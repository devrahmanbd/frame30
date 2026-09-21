/**
 * Demo-import conflict preflight (D1) — TDD: matching is exact, sorted,
 * duplicate-safe; overwrite replaces only conflicting rows.
 */
import { describe, expect, it } from "vitest";
import { matchConflicts } from "./theme-imports.server";

describe("matchConflicts", () => {
  it("returns the sorted intersection of demo and existing slugs", () => {
    expect(
      matchConflicts(
        ["saree", "panjabi", "kurta"],
        ["kurta", "saree", "own-design"],
      ),
    ).toEqual(["kurta", "saree"]);
  });

  it("is empty when nothing overlaps", () => {
    expect(matchConflicts(["a"], ["b"])).toEqual([]);
    expect(matchConflicts([], ["b"])).toEqual([]);
  });

  it("dedupes and trims", () => {
    expect(matchConflicts(["a", "a "], [" a", "a"])).toEqual(["a"]);
  });
});
