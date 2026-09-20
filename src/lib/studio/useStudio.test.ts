import { describe, expect, it } from "vitest";
import { shouldAdoptDoc } from "./useStudio";

describe("shouldAdoptDoc", () => {
  it("adopts a newly-arrived key when pristine", () => {
    expect(shouldAdoptDoc(null, "page:1:2026-01-01", false)).toBe(true);
    expect(shouldAdoptDoc("new", "page:1:2026-01-01", false)).toBe(true);
  });

  it("ignores identical or missing keys", () => {
    expect(shouldAdoptDoc("page:1:x", "page:1:x", false)).toBe(false);
    expect(shouldAdoptDoc("page:1:x", null, false)).toBe(false);
    expect(shouldAdoptDoc("page:1:x", undefined, false)).toBe(false);
  });

  it("never clobbers in-progress edits", () => {
    expect(shouldAdoptDoc(null, "page:1:2026-01-01", true)).toBe(false);
    expect(shouldAdoptDoc("new", "page:1:2026-01-01", true)).toBe(false);
  });
});
