/**
 * Auto-generated onboarding slugs: derived from the store name, unique by
 * numeric suffix. The wizard never asks for an address anymore.
 */
import { describe, expect, it } from "vitest";
import { candidateStoreSlugs } from "./use-merchant";

describe("candidateStoreSlugs", () => {
  it("derives the slug from the name", () => {
    expect(candidateStoreSlugs("Akira Heritage")[0]).toBe("akira-heritage");
  });

  it("appends numeric suffixes for collisions", () => {
    expect(candidateStoreSlugs("Akira", 3)).toEqual([
      "akira",
      "akira-2",
      "akira-3",
    ]);
  });

  it("strips characters the server would reject", () => {
    const [first] = candidateStoreSlugs("Müller & Sons!");
    expect(first).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("falls back for short or empty names", () => {
    expect(candidateStoreSlugs("AB")[0]).toBe("store");
    // Unusable names fall back to slugify's unique item-xxx, still valid.
    expect(candidateStoreSlugs("!!!")[0]).toMatch(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    );
  });

  it("keeps every candidate within length bounds", () => {
    for (const slug of candidateStoreSlugs("a".repeat(100), 5)) {
      expect(slug.length).toBeLessThanOrEqual(60);
    }
  });
});
