/**
 * Preview sources registry — dynamic theme wiring, no hardcoding.
 */
import { describe, expect, it } from "vitest";
import {
  defaultPreviewKey,
  demoPreviewTarget,
  previewSourceFor,
  previewSourceKeys,
} from "./preview-sources";

describe("preview-sources registry", () => {
  it("registers keys without the engine naming themes", () => {
    expect(previewSourceKeys()).toContain("songoskriti");
    expect(defaultPreviewKey()).toBe(previewSourceKeys()[0]);
  });

  it("resolves registered keys and null for unknown", () => {
    expect(previewSourceFor("songoskriti")?.key).toBe("songoskriti");
    expect(previewSourceFor("nope")).toBeNull();
  });

  it("builds merchant-less demo targets with template + focus", () => {
    expect(demoPreviewTarget("songoskriti", "collection", "Bestsellers")).toBe(
      "/theme-preview/songoskriti?template=collection&focus=bestsellers",
    );
    expect(demoPreviewTarget("songoskriti", "product", "x")).toBe(
      "/theme-preview/songoskriti?template=product&focus=x",
    );
  });
});
