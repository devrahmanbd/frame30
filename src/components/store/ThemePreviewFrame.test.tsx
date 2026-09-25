// src/components/store/ThemePreviewFrame.test.tsx
import { describe, expect, it } from "vitest";
import {
  previewTargetForHref,
  collectionDisplayName,
  previewSearchForSwitch,
} from "@/lib/theme-preview-nav";

describe("preview frame slug contract", () => {
  it("collection click target carries slug for heading", () => {
    const t = previewTargetForHref("/c/festive")!;
    expect(t.template).toBe("collection");
    expect(collectionDisplayName("songoskriti", t.slug)).toBe("Eid & Festive");
  });
  it("product click target carries product slug", () => {
    expect(previewTargetForHref("/p/jamdani-saree")?.slug).toBe(
      "jamdani-saree",
    );
  });
});

describe("preview frame search round-trip", () => {
  it("search click writes separate keys so refresh preserves them", () => {
    // Same updater ThemePreviewFrame.switchTo passes to navigate: raw
    // in-canvas query must never land as a single q value.
    const next = previewSearchForSwitch("search", null, "max=99900", {
      template: "search",
    });
    expect(next).toMatchObject({ template: "search", max: "99900" });
    expect(next).not.toHaveProperty("q", "max=99900");
  });
});

// Back-button sync (ThemePreviewFrame useEffect on
// initialTemplate/initialSlug): node env has no router/DOM, so verify
// manually — /c/festive -> /c/wedding -> back shows festive.
