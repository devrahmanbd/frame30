import { describe, expect, it } from "vitest";
import { WIDGET_BY_KEY, newWidgetNode } from "./catalog";
import { contentControls } from "./controls";

/**
 * Ported theme widgets: every control key must exist in the widget
 * defaults, otherwise the settings panel edits a key the node never
 * carries. Batch 1 (engagement) + batch 2 (heritage + hero).
 */
const PORTED = [
  "faq",
  "marquee",
  "countdown",
  "banner",
  "trust_bar",
  "announcement_bar",
  "heritage_story",
  "editorial_banner",
  "editorial_hero",
  "lookbook",
  "hero",
  "textile_showcase",
  "department_grid",
  "story_trunk",
  "marquee_strip",
  "hero_carousel",
  "testimonial_carousel",
] as const;

describe("ported theme widgets", () => {
  for (const key of PORTED) {
    it(`${key} is registered with defaults`, () => {
      const def = WIDGET_BY_KEY[key];
      expect(def).toBeDefined();
      expect(def.label).toBeTruthy();
      expect(def.category).toBe("general");
    });

    it(`${key} controls match defaults`, () => {
      const def = WIDGET_BY_KEY[key];
      const keys = new Set(Object.keys(def.defaults));
      for (const control of contentControls(key)) {
        expect(
          keys.has(control.key),
          `${key}: control ${control.key} missing from defaults`,
        ).toBe(true);
      }
    });

    it(`${key} instantiates`, () => {
      const node = newWidgetNode(key);
      expect(node.el).toBe(key);
      expect(node.id).toBeTruthy();
    });
  }

  it("theme prop parity for flat props", () => {
    expect(WIDGET_BY_KEY.faq.defaults).toMatchObject({
      heading: "Frequently asked",
      q1: "",
      a1: "",
    });
    expect(WIDGET_BY_KEY.marquee.defaults).toMatchObject({
      text: "New arrivals every week",
      speed: 30,
      pauseOnHover: true,
    });
    expect(WIDGET_BY_KEY.countdown.defaults).toMatchObject({
      label: "Offer ends in",
      endsAt: "",
    });
    expect(WIDGET_BY_KEY.banner.defaults).toMatchObject({
      text: "Free delivery over BDT 2,000",
      tone: "info",
    });
    expect(WIDGET_BY_KEY.trust_bar.defaults).toMatchObject({
      i1Title: "Fast delivery",
    });
    expect(WIDGET_BY_KEY.announcement_bar.defaults).toMatchObject({
      m1: "Free delivery over BDT 2,000",
      dismissible: true,
      rotateMs: 6000,
    });
  });
});
