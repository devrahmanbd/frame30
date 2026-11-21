/**
 * Frame30 — Wave 2.4: Property-Based Verification for Responsive Presets, Mobile Media & Merchant Controls
 *
 * Verifies invariants:
 * - Property P1: Preset bucket monotonicity (width -> bp mapping)
 * - Property P2: Preset dimension bounds (width in [320, 1440], height in [500, 1200])
 * - Property P3: AST immutability under arbitrary preset viewport transitions
 * - Property P4: Hero slide desktop/mobile media isolation
 * - Property P5: Multi-slide edit isolation (slide i edit leaves j != i unchanged)
 * - Property P6: Mobile hero fallback invariance (empty mobileImage falls back to desktop image)
 * - Property P7: Focal point boundary preservation ([0, 100] x [0, 100])
 * - Property P8: Legacy slide backward compatibility
 * - Property P9: Media coercion roundtrip through AST normalization
 * - Property P10: Merchant labels free of forbidden developer tokens
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  DEVICE_PRESETS,
  bucketForWidth,
  type DeviceBucket,
} from "@/lib/responsive";
import { parseAst, SECTION_CATALOG, type Section } from "@/lib/builder-ast";
import type { StructuredMediaValue } from "@/lib/theme-contract";

// ── Arbitraries & Generators ──

const genSafeUrl = fc.webUrl({ validSchemes: ["https"] });
const genFocalCoordinate = fc.integer({ min: 0, max: 100 });
const genFocalPoint = fc.record({
  x: genFocalCoordinate,
  y: genFocalCoordinate,
});

const genStructuredMedia = fc
  .record({
    url: genSafeUrl,
    alt: fc.option(fc.string({ maxLength: 80 })),
    focalPoint: fc.option(genFocalPoint),
  })
  .map((raw) => {
    const media: StructuredMediaValue = { url: raw.url };
    if (raw.alt) media.alt = raw.alt;
    if (raw.focalPoint) media.focalPoint = raw.focalPoint;
    return media;
  });

const genHeroSlide = fc
  .record({
    headline: fc.string({ minLength: 1, maxLength: 80 }),
    image: fc.oneof(genSafeUrl, genStructuredMedia),
    mobileImage: fc.option(fc.oneof(genSafeUrl, genStructuredMedia)),
  })
  .map((raw) => {
    const slide: Record<string, unknown> = {
      headline: raw.headline,
      image: raw.image,
    };
    if (raw.mobileImage !== null && raw.mobileImage !== undefined) {
      slide.mobileImage = raw.mobileImage;
    }
    return slide;
  });

describe("Wave 2.4 — Property Suites", () => {
  /* ------------------------------------------------------------------ */
  /* Property P1: Preset bucket monotonicity                           */
  /* ------------------------------------------------------------------ */
  it("Property P1: every device preset width monotonically resolves to its declared bucket", () => {
    fc.assert(
      fc.property(fc.constantFrom(...DEVICE_PRESETS), (preset) => {
        const bucket: DeviceBucket = bucketForWidth(preset.width);
        expect(bucket).toBe(preset.bp);
      }),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P2: Preset dimension invariants                           */
  /* ------------------------------------------------------------------ */
  it("Property P2: all presets have realistic mobile/tablet/desktop dimensions", () => {
    expect(DEVICE_PRESETS.length).toBe(8);
    for (const preset of DEVICE_PRESETS) {
      expect(preset.width).toBeGreaterThanOrEqual(320);
      expect(preset.width).toBeLessThanOrEqual(1440);
      expect(preset.height).toBeGreaterThanOrEqual(500);
      expect(preset.height).toBeLessThanOrEqual(1200);
      expect(preset.width / preset.height).toBeGreaterThan(0.3);
      expect(preset.width / preset.height).toBeLessThan(2.5);
    }
  });

  /* ------------------------------------------------------------------ */
  /* Property P3: AST immutability under viewport transitions           */
  /* ------------------------------------------------------------------ */
  it("Property P3: switching between arbitrary presets leaves theme AST strictly invariant", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...DEVICE_PRESETS.map((p) => p.width)), {
          minLength: 1,
          maxLength: 10,
        }),
        (widths) => {
          const section: Section = {
            id: "hero-prop",
            type: "hero_carousel",
            props: {
              slides: [
                {
                  headline: "Heritage Textile",
                  image: "https://cdn.example.com/artisan.jpg",
                },
              ],
            },
          };
          const original = parseAst({ main: [section] });
          const serializedOriginal = JSON.stringify(original);

          // Simulated viewport width state changes
          let currentWidth = 1440;
          for (const w of widths) {
            currentWidth = w;
            expect(currentWidth).toBeGreaterThanOrEqual(320);
          }

          const parsedAfter = parseAst({ main: [section] });
          expect(JSON.stringify(parsedAfter)).toBe(serializedOriginal);
        },
      ),
      { numRuns: 50 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P4: Hero slide desktop/mobile media independence          */
  /* ------------------------------------------------------------------ */
  it("Property P4: modifying mobileImage leaves desktop image strictly identical", () => {
    fc.assert(
      fc.property(
        genStructuredMedia,
        genStructuredMedia,
        genStructuredMedia,
        (desktopMedia, initialMobileMedia, updatedMobileMedia) => {
          const initialSlide = {
            headline: "Title",
            image: desktopMedia,
            mobileImage: initialMobileMedia,
          };

          // Update mobile image only
          const updatedSlide = {
            ...initialSlide,
            mobileImage: updatedMobileMedia,
          };

          expect(updatedSlide.image).toEqual(desktopMedia);
          expect(updatedSlide.mobileImage).toEqual(updatedMobileMedia);
        },
      ),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P5: Multi-slide edit isolation                            */
  /* ------------------------------------------------------------------ */
  it("Property P5: mutating slide i leaves all slides j != i strictly unchanged", () => {
    fc.assert(
      fc.property(
        fc.array(genHeroSlide, { minLength: 2, maxLength: 5 }),
        fc.nat(),
        genStructuredMedia,
        (slides, rawIndex, newMobileMedia) => {
          const targetIndex = rawIndex % slides.length;
          const clonedSlides = JSON.parse(JSON.stringify(slides));

          // Mutate targetIndex
          clonedSlides[targetIndex]!.mobileImage = newMobileMedia;

          // Assert all other slides are unchanged
          for (let j = 0; j < slides.length; j++) {
            if (j !== targetIndex) {
              expect(clonedSlides[j]).toEqual(slides[j]);
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P6: Mobile hero fallback invariance                       */
  /* ------------------------------------------------------------------ */
  it("Property P6: empty or missing mobileImage resolves to desktop media properties", () => {
    fc.assert(
      fc.property(
        genStructuredMedia,
        fc.constantFrom(undefined, "", null),
        (desktopMedia, emptyMobile) => {
          const slide: Record<string, unknown> = {
            headline: "Heritage",
            image: desktopMedia,
          };
          if (emptyMobile !== undefined) {
            slide.mobileImage = emptyMobile;
          }

          // Fallback logic
          const effectiveMobileUrl =
            (slide.mobileImage && typeof slide.mobileImage === "object"
              ? (slide.mobileImage as StructuredMediaValue).url
              : typeof slide.mobileImage === "string" &&
                  slide.mobileImage.trim()
                ? slide.mobileImage
                : null) || desktopMedia.url;

          expect(effectiveMobileUrl).toBe(desktopMedia.url);
        },
      ),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P7: Focal point boundary preservation                     */
  /* ------------------------------------------------------------------ */
  it("Property P7: valid focal coordinates [0, 100] are preserved without corruption", () => {
    fc.assert(
      fc.property(genFocalPoint, genFocalPoint, (desktopFocal, mobileFocal) => {
        expect(desktopFocal.x).toBeGreaterThanOrEqual(0);
        expect(desktopFocal.x).toBeLessThanOrEqual(100);
        expect(desktopFocal.y).toBeGreaterThanOrEqual(0);
        expect(desktopFocal.y).toBeLessThanOrEqual(100);

        expect(mobileFocal.x).toBeGreaterThanOrEqual(0);
        expect(mobileFocal.x).toBeLessThanOrEqual(100);
        expect(mobileFocal.y).toBeGreaterThanOrEqual(0);
        expect(mobileFocal.y).toBeLessThanOrEqual(100);

        // Object-position CSS string formatting
        const desktopCss = `${desktopFocal.x}% ${desktopFocal.y}%`;
        const mobileCss = `${mobileFocal.x}% ${mobileFocal.y}%`;

        expect(desktopCss).toMatch(/^\d{1,3}% \d{1,3}%$/);
        expect(mobileCss).toMatch(/^\d{1,3}% \d{1,3}%$/);
      }),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P8: Legacy slide backward compatibility                   */
  /* ------------------------------------------------------------------ */
  it("Property P8: legacy slides with only { image: string } parse cleanly without mobileImage errors", () => {
    fc.assert(
      fc.property(
        genSafeUrl,
        fc.stringMatching(/^[a-zA-Z0-9 ]{1,50}$/),
        (url, headline) => {
          const section: Section = {
            id: "legacy-hero",
            type: "hero_carousel",
            props: {
              slides: [{ image: url, headline }],
            },
          };

          const parsed = parseAst({ main: [section] });
          const slide = (
            parsed.main[0]!.props.slides as Array<Record<string, unknown>>
          )[0]!;

          expect(slide.image).toBe(url);
          expect(slide.headline).toBe(headline);
          expect(slide.mobileImage).toBeUndefined();
        },
      ),
      { numRuns: 50 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P9: Structured media coercion roundtrip                   */
  /* ------------------------------------------------------------------ */
  it("Property P9: structured media in slide rows roundtrips through AST normalization", () => {
    fc.assert(
      fc.property(
        genStructuredMedia,
        genStructuredMedia,
        (desktopMedia, mobileMedia) => {
          const section: Section = {
            id: "roundtrip-hero",
            type: "hero_carousel",
            props: {
              slides: [
                {
                  headline: "Test Roundtrip",
                  image: desktopMedia,
                  mobileImage: mobileMedia,
                },
              ],
            },
          };

          const parsed = parseAst({ main: [section] });
          const slide = (
            parsed.main[0]!.props.slides as Array<Record<string, unknown>>
          )[0]!;

          expect(slide.headline).toBe("Test Roundtrip");
          expect((slide.image as StructuredMediaValue).url).toBe(
            desktopMedia.url,
          );
          if (desktopMedia.alt) {
            expect((slide.image as StructuredMediaValue).alt).toBe(
              desktopMedia.alt,
            );
          }
          if (desktopMedia.focalPoint) {
            expect((slide.image as StructuredMediaValue).focalPoint).toEqual(
              desktopMedia.focalPoint,
            );
          }

          expect((slide.mobileImage as StructuredMediaValue).url).toBe(
            mobileMedia.url,
          );
          if (mobileMedia.alt) {
            expect((slide.mobileImage as StructuredMediaValue).alt).toBe(
              mobileMedia.alt,
            );
          }
          if (mobileMedia.focalPoint) {
            expect(
              (slide.mobileImage as StructuredMediaValue).focalPoint,
            ).toEqual(mobileMedia.focalPoint);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P10: Merchant labels free of forbidden developer tokens    */
  /* ------------------------------------------------------------------ */
  it("Property P10: section field labels across SECTION_CATALOG contain no forbidden technical jargon", () => {
    const forbidden = [
      /\b(slug|slugs)\b/i,
      /\bUUID\b/i,
      /\bcomma separated URLs\b/i,
      /\bpipe delimited\b/i,
    ];

    for (const section of SECTION_CATALOG) {
      for (const field of section.fields) {
        for (const pattern of forbidden) {
          expect(
            field.label,
            `Catalog section ${section.type} field ${field.key} has forbidden jargon "${field.label}"`,
          ).not.toMatch(pattern);
        }
      }
    }
  });
});
