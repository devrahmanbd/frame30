// src/components/store/ThemePreviewFrame.test.tsx
import { describe, expect, it } from "vitest";
import { previewTargetForHref, collectionDisplayName } from "@/lib/theme-preview-nav";

describe("preview frame slug contract", () => {
  it("collection click target carries slug for heading", () => {
    const t = previewTargetForHref("/c/festive")!;
    expect(t.template).toBe("collection");
    expect(collectionDisplayName("songoskriti", t.slug)).toBe("Eid & Festive");
  });
  it("product click target carries product slug", () => {
    expect(previewTargetForHref("/p/jamdani-saree")?.slug).toBe("jamdani-saree");
  });
});
