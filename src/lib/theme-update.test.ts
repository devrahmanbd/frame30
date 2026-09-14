import { describe, expect, it } from "vitest";
import { diffTemplates, mergeTemplates } from "./themes.server";
import type { ThemeTemplates } from "./builder-ast";

const section = (id: string, title = "a") => ({
  id,
  type: "heading" as const,
  props: { title },
});

const tree = (ids: [string, string][]): ThemeTemplates => ({
  index: { header: [], main: ids.map(([id, title]) => section(id, title)), footer: [] },
});

describe("theme update diff", () => {
  const mine = tree([
    ["hero-1", "mine"],
    ["custom-1", "mine"],
  ]);
  const upstream = tree([
    ["hero-1", "upstream"],
    ["promo-1", "upstream"],
  ]);

  it("classifies added, removed and changed sections", () => {
    const [entry] = diffTemplates(mine, upstream);
    expect(entry?.template).toBe("index");
    expect(entry?.added).toEqual(["promo-1"]);
    expect(entry?.removed).toEqual(["custom-1"]);
    expect(entry?.changed).toEqual(["hero-1"]);
  });

  it("adopt takes upstream order and keeps merchant-only sections", () => {
    const merged = mergeTemplates(mine, upstream, "adopt");
    expect(merged.index?.main.map((s) => s.id)).toEqual(["hero-1", "promo-1", "custom-1"]);
    expect(merged.index?.main[0]?.props.title).toBe("upstream");
  });

  it("keep_mine preserves merchant sections and appends only new ones", () => {
    const merged = mergeTemplates(mine, upstream, "keep_mine");
    expect(merged.index?.main.map((s) => s.id)).toEqual(["hero-1", "custom-1", "promo-1"]);
    expect(merged.index?.main[0]?.props.title).toBe("mine");
  });

  it("never drops a template the merchant has but upstream omits", () => {
    const withPage: ThemeTemplates = {
      ...mine,
      page: { header: [], main: [section("page-1")], footer: [] },
    };
    const merged = mergeTemplates(withPage, upstream, "adopt");
    expect(merged.page?.main.map((s) => s.id)).toEqual(["page-1"]);
  });
});
