import { describe, expect, it } from "vitest";
import {
  SONGOSKRITI_COLLECTIONS,
  buildCollectionArchetype,
} from "./archetypes";

describe("Songoskriti Collection Archetypes", () => {
  it("provides dedicated department archetype for sarees", () => {
    expect(SONGOSKRITI_COLLECTIONS["sarees"]).toBeDefined();
    const config = SONGOSKRITI_COLLECTIONS["sarees"];
    expect(config.title).toBe("Sarees");
    expect(config.heroImage).toBe("/ph/songoskriti/prod-saree.png");
    expect(config.featuredCollection).toBe("sarees");

    const sections = buildCollectionArchetype("sarees", "Sarees");
    expect(sections).not.toBeNull();
    const hero = sections!.find((s) => s.type === "hero_carousel");
    expect(hero).toBeDefined();
    expect(hero?.props?.h1Image).toBe("/ph/songoskriti/prod-saree.png");
  });

  it("provides dedicated department archetype for tangail handloom", () => {
    expect(SONGOSKRITI_COLLECTIONS["tangail"]).toBeDefined();
    const config = SONGOSKRITI_COLLECTIONS["tangail"];
    expect(config.title).toBe("Tangail Handloom");
    expect(config.heroImage).toBe("/ph/songoskriti/cat-newin.png");
    expect(config.featuredCollection).toBe("tangail");

    const sections = buildCollectionArchetype("tangail", "Tangail Handloom");
    expect(sections).not.toBeNull();
    const hero = sections!.find((s) => s.type === "hero_carousel");
    expect(hero).toBeDefined();
    expect(hero?.props?.h1Image).toBe("/ph/songoskriti/cat-newin.png");
  });

  it("falls back to clean listing for unconfigured collections", () => {
    const sections = buildCollectionArchetype("custom-slug", "Custom Collection");
    expect(sections).not.toBeNull();
    expect(sections!.map((s) => s.type)).toEqual([
      "category_header",
      "result_toolbar",
      "product_grid",
    ]);
  });
});
