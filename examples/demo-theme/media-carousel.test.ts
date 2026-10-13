/**
 * Demo theme fixture — lazy media carousel proof (section 2 of 3).
 *
 * Fixture: `examples/demo-theme/media-carousel.ts` fed by platform-provided
 * slide values (merchant image picks up, catalogue art alongside).
 * Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md` §2-4.
 *
 * Run: `npx vitest run --config examples/demo-theme/vitest.config.ts`
 */
import { describe, expect, it } from "vitest";
import { demoCarouselSlidesFixture } from "./fixture-bundles";
import {
  buildCarouselSection,
  CAROUSEL_COMPONENT_NAME,
  CAROUSEL_SECTION_KEY,
  CAROUSEL_SECTION_SLOT,
  coerceCarouselSettings,
  coerceCarouselSlides,
  createCarouselGate,
  destroyCarouselGate,
  renderMediaCarousel,
  type CarouselSlide,
} from "./media-carousel";

/** Real `src="…"` attributes only — `data-src` placeholders must not match. */
const SRC_ATTR = /(?<![-\w])src="/g;

function srcCount(html: string): number {
  return html.match(SRC_ATTR)?.length ?? 0;
}

describe("media carousel — merchant settings render", () => {
  it("renders the caption and every slide with fixture data", () => {
    const out = renderMediaCarousel({
      settings: { caption: "Autumn firing" },
      slides: demoCarouselSlidesFixture(),
      visible: true,
      supportsVideo: true,
    });
    expect(out.caption).toBe("Autumn firing");
    expect(out.html).toContain("Autumn firing");
    expect(out.slides).toHaveLength(3);
    expect(out.html).toContain("/ph/demo/look-1.jpg");
    expect(out.html).toContain("/ph/demo/atelier.mp4");
    expect(out.html).toContain("<video");
  });

  it("renders copy escaped", () => {
    const out = renderMediaCarousel({
      settings: { caption: "<b>Bold</b>" },
      slides: [],
      visible: true,
      supportsVideo: true,
    });
    expect(out.html).not.toContain("<b>Bold</b>");
    expect(out.html).toContain("&lt;b&gt;Bold&lt;/b&gt;");
  });

  it("drops unknown slide kinds and empty sources", () => {
    const slides = coerceCarouselSlides([
      { kind: "image", src: "/ph/demo/a.jpg", alt: "A" },
      { kind: "hologram", src: "/ph/demo/b.jpg" },
      { kind: "video", src: "   " },
      null,
    ]);
    expect(slides.map((slide) => slide.src)).toEqual(["/ph/demo/a.jpg"]);
  });

  it("maps merchant settings onto the host Section shape", () => {
    const section = buildCarouselSection("carousel-1", {
      caption: "Hello",
      motion: "bold",
      gap: 24,
    });
    expect(section).toMatchObject({
      id: "carousel-1",
      type: CAROUSEL_SECTION_KEY,
      props: { caption: "Hello", motion: "bold", gap: 24 },
    });
    expect(CAROUSEL_SECTION_KEY).toBe("media-carousel");
    expect(CAROUSEL_COMPONENT_NAME).toBe("MediaCarousel");
    expect(CAROUSEL_SECTION_SLOT).toBe("main");
  });

  it("clamps merchant spacing and falls back on weak input", () => {
    expect(coerceCarouselSettings({ gap: 999 }).gap).toBe(64);
    expect(coerceCarouselSettings({}).caption).toBe("Lookbook");
    expect(coerceCarouselSettings({ motion: "hyperdrive" }).motion).toBe(
      "standard",
    );
  });
});

describe("media carousel — lazy-load gate (no network until visible)", () => {
  it("hidden output carries placeholders only: zero src attributes", () => {
    const out = renderMediaCarousel({
      settings: {},
      slides: demoCarouselSlidesFixture(),
      visible: false,
      supportsVideo: true,
    });
    expect(srcCount(out.html)).toBe(0);
    expect(out.html).toContain("data-src=");
    expect(out.html).not.toContain("<video src=");
  });

  it("the loader stub stays silent while the block is hidden", () => {
    const gate = createCarouselGate();
    const slides = coerceCarouselSlides(demoCarouselSlidesFixture());
    let calls = 0;
    for (let index = 0; index < slides.length; index++) {
      expect(gate.requestLoad(index, slides, () => (calls += 1))).toBe("gated");
    }
    expect(calls).toBe(0);
    expect(gate.loadedCount()).toBe(0);
  });

  it("marking visible opens the gate: each slide loads once", () => {
    const gate = createCarouselGate();
    const slides = coerceCarouselSlides(demoCarouselSlidesFixture());
    const seen: CarouselSlide[] = [];
    gate.markVisible();
    expect(gate.isVisible()).toBe(true);
    for (let index = 0; index < slides.length; index++) {
      expect(gate.requestLoad(index, slides, (slide) => seen.push(slide))).toBe(
        "loaded",
      );
    }
    expect(seen).toHaveLength(3);
    expect(gate.loadedCount()).toBe(3);
    expect(gate.requestLoad(99, slides, () => {})).toBe("missing");
  });

  it("shown output carries real sources for every slide", () => {
    const out = renderMediaCarousel({
      settings: {},
      slides: demoCarouselSlidesFixture(),
      visible: true,
      supportsVideo: true,
    });
    expect(srcCount(out.html)).toBe(3);
    expect(out.html).toContain('src="/ph/demo/atelier.mp4"');
  });
});

describe("media carousel — fallbacks and unmount cleanup", () => {
  it("no-video hosts get the still frame instead of a video tag", () => {
    const out = renderMediaCarousel({
      settings: {},
      slides: demoCarouselSlidesFixture(),
      visible: true,
      supportsVideo: false,
    });
    expect(out.html).not.toContain("<video");
    expect(out.html).toContain('data-fallback="image"');
    expect(out.html).toContain("/ph/demo/atelier-poster.jpg");
    expect(srcCount(out.html)).toBe(3);
  });

  it("an empty slide list renders an empty note, never a crash", () => {
    for (const slides of [[], undefined, "not-a-list"]) {
      const out = renderMediaCarousel({
        settings: {},
        slides,
        visible: true,
        supportsVideo: true,
      });
      expect(out.slides).toEqual([]);
      expect(out.html).toContain('data-empty="carousel"');
      expect(srcCount(out.html)).toBe(0);
    }
  });

  it("unmount destroys the gate: further loads stay gated", () => {
    const gate = createCarouselGate();
    const slides = coerceCarouselSlides(demoCarouselSlidesFixture());
    gate.markVisible();
    let calls = 0;
    expect(gate.requestLoad(0, slides, () => (calls += 1))).toBe("loaded");
    expect(calls).toBe(1);
    destroyCarouselGate(gate);
    expect(gate.isVisible()).toBe(false);
    expect(gate.loadedCount()).toBe(0);
    expect(gate.requestLoad(1, slides, () => (calls += 1))).toBe("gated");
    expect(calls).toBe(1);
  });
});
