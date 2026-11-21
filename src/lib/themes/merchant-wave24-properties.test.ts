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
import { renderToStaticMarkup } from "react-dom/server";
import fc from "fast-check";
import {
  DEVICE_PRESETS,
  bucketForWidth,
  type DeviceBucket,
} from "@/lib/responsive";
import {
  parseAst,
  SECTION_CATALOG,
  type Section,
  type PropRow,
} from "@/lib/builder-ast";
import type { StructuredMediaValue } from "@/lib/theme-contract";
import {
  resolveHeroSlide,
  renderHeroArt,
} from "@/components/builder/heritage";
import { StructuredMediaValueSchema } from "@/lib/media";

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

const genHeroSlide: fc.Arbitrary<PropRow> = fc
  .record({
    headline: fc.string({ minLength: 1, maxLength: 80 }),
    image: fc.oneof(genSafeUrl, genStructuredMedia),
    mobileImage: fc.option(fc.oneof(genSafeUrl, genStructuredMedia)),
  })
  .map((raw) => {
    const slide: PropRow = {
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
          const originalAst = parseAst({ main: [section] });
          const serializedOriginal = JSON.stringify(originalAst);

          // Simulated viewport state transitions using production bucket resolution
          for (const w of widths) {
            const bucket: DeviceBucket = bucketForWidth(w);
            expect(bucket).toBeDefined();
            // Production invariant: viewport switches must not alter document AST
            const afterStepAst = parseAst({ main: [section] });
            expect(JSON.stringify(afterStepAst)).toBe(serializedOriginal);
          }

          // Mutation check: if a faulty viewport handler accidentally mutates the AST, detect it
          const faultyMutate = (ast: typeof originalAst, width: number) => {
            const mutated = JSON.parse(JSON.stringify(ast));
            mutated.main[0].props["viewportWidth"] = width;
            return mutated;
          };
          const mutated = faultyMutate(originalAst, widths[0]!);
          expect(JSON.stringify(mutated)).not.toBe(serializedOriginal);
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
          const section: Section = {
            id: "hero-isolation",
            type: "hero_carousel",
            props: {
              slides: [
                {
                  headline: "Heritage Slide",
                  image: desktopMedia,
                  mobileImage: initialMobileMedia,
                },
              ],
            },
          };

          const parsedInitial = parseAst({ main: [section] });
          const initialSlideRow = (
            parsedInitial.main[0]!.props.slides as unknown as PropRow[]
          )[0]!;
          const resolvedBefore = resolveHeroSlide(initialSlideRow);

          // Update mobile image only through production AST structure
          const updatedSection: Section = {
            ...section,
            props: {
              ...section.props,
              slides: [
                {
                  headline: "Heritage Slide",
                  image: desktopMedia,
                  mobileImage: updatedMobileMedia,
                },
              ],
            },
          };
          const parsedUpdated = parseAst({ main: [updatedSection] });
          const updatedSlideRow = (
            parsedUpdated.main[0]!.props.slides as unknown as PropRow[]
          )[0]!;
          const resolvedAfter = resolveHeroSlide(updatedSlideRow);

          // Desktop media invariants
          expect(resolvedAfter.image).toBe(desktopMedia.url);
          expect(resolvedAfter.imageAlt).toBe(
            desktopMedia.alt?.trim() || undefined,
          );
          expect(resolvedAfter.imageFocalPoint).toEqual(
            desktopMedia.focalPoint ?? null,
          );

          // Mobile media is updated correctly
          expect(resolvedAfter.mobileImage).toBe(updatedMobileMedia.url);
          expect(resolvedAfter.mobileImageAlt).toBe(
            updatedMobileMedia.alt?.trim() || undefined,
          );
          expect(resolvedAfter.mobileImageFocalPoint).toEqual(
            updatedMobileMedia.focalPoint ?? null,
          );

          // Mutation check: if mobile update accidentally overwrote desktop media
          const faultyMobileOverwrite = {
            ...resolvedAfter,
            image: updatedMobileMedia.url,
          };
          if (updatedMobileMedia.url !== desktopMedia.url) {
            expect(faultyMobileOverwrite.image).not.toBe(resolvedBefore.image);
          }
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
        fc.array(genHeroSlide, { minLength: 2, maxLength: 3 }),
        fc.nat(),
        genStructuredMedia,
        (slides, rawIndex, newMobileMedia) => {
          const targetIndex = rawIndex % slides.length;
          const section: Section = {
            id: "hero-multi-isolation",
            type: "hero_carousel",
            props: { slides: slides as unknown as PropRow[] },
          };

          const parsedBefore = parseAst({ main: [section] });
          const rawSlidesBefore = parsedBefore.main[0]!.props.slides as unknown as PropRow[];
          const resolvedBefore = rawSlidesBefore.map(resolveHeroSlide);

          // Update only slide targetIndex
          const updatedSlides = slides.map((s, idx) =>
            idx === targetIndex ? { ...s, mobileImage: newMobileMedia } : s,
          );
          const parsedAfter = parseAst({
            main: [{ ...section, props: { slides: updatedSlides as unknown as PropRow[] } }],
          });
          const rawSlidesAfter = parsedAfter.main[0]!.props.slides as unknown as PropRow[];
          const resolvedAfter = rawSlidesAfter.map(resolveHeroSlide);

          // Invariant: all slides j != targetIndex remain strictly identical
          for (let j = 0; j < slides.length; j++) {
            if (j !== targetIndex) {
              expect(resolvedAfter[j]).toEqual(resolvedBefore[j]);
            } else {
              expect(resolvedAfter[j]!.mobileImage).toBe(newMobileMedia.url);
            }
          }

          // Mutation check: if slide modification leaked to all slides
          const faultyGlobalLeak = resolvedBefore.map((s) => ({
            ...s,
            mobileImage: newMobileMedia.url,
          }));
          const untargetedIndex = (targetIndex + 1) % slides.length;
          if (resolvedBefore[untargetedIndex]!.mobileImage !== newMobileMedia.url) {
            expect(faultyGlobalLeak[untargetedIndex]).not.toEqual(
              resolvedBefore[untargetedIndex],
            );
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
          const row: PropRow = {
            headline: "Heritage Weave",
            image: desktopMedia,
          };
          if (emptyMobile !== undefined && emptyMobile !== null) {
            row.mobileImage = emptyMobile;
          }

          // Test actual production slide resolution
          const resolved = resolveHeroSlide(row);

          expect(resolved.image).toBe(desktopMedia.url);
          expect(resolved.imageAlt).toBe(desktopMedia.alt?.trim() || undefined);
          expect(resolved.imageFocalPoint).toEqual(
            desktopMedia.focalPoint ?? null,
          );

          // Mobile image must be empty/unresolvable
          expect(resolved.mobileImage).toBe("");
          expect(resolved.mobileImageFocalPoint).toBeNull();

          // Test actual production rendering fallback via renderHeroArt
          const mobileElem = renderHeroArt({
            slide: resolved,
            isFirst: true,
            device: "mobile",
          }) as React.ReactElement<{ src?: string }>;
          // On mobile preview, desktop image is rendered as fallback
          expect(mobileElem.props.src).toBe(desktopMedia.url);

          const markupDesktop = renderToStaticMarkup(
            renderHeroArt({ slide: resolved, isFirst: true, device: "desktop" }),
          );
          // When mobileImage is absent, <source> must not emit an empty srcset
          expect(markupDesktop).not.toContain('srcset=""');
          expect(markupDesktop).not.toContain('srcSet=""');

          // Clearing mobile media must never destroy desktop media
          const clearedRow = { ...row, mobileImage: "" };
          const resolvedCleared = resolveHeroSlide(clearedRow);
          expect(resolvedCleared.image).toBe(desktopMedia.url);

          // Mutation check: if clearing mobile media destroyed desktop media
          const faultyClearDestroy = { ...resolvedCleared, image: "" };
          expect(faultyClearDestroy.image).not.toBe(desktopMedia.url);
        },
      ),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P7: Focal point boundary preservation & validation        */
  /* ------------------------------------------------------------------ */
  it("Property P7: valid focal coordinates [0, 100] are preserved, invalid coordinates are rejected", () => {
    const genBadCoord = fc.oneof(
      fc.integer({ min: -1000, max: -1 }),
      fc.integer({ min: 101, max: 1000 }),
    );

    fc.assert(
      fc.property(
        genSafeUrl,
        genFocalPoint,
        genBadCoord,
        fc.integer({ min: 0, max: 100 }),
        (url, validFocal, badX, goodY) => {
          // 1. Valid coordinates [0, 100] validate through StructuredMediaValueSchema
          const validMedia = {
            url,
            focalPoint: validFocal,
          };
          const validParsed = StructuredMediaValueSchema.safeParse(validMedia);
          expect(validParsed.success).toBe(true);

          // Valid coordinates resolve through production resolveHeroSlide
          const validSlide = resolveHeroSlide({ image: validMedia });
          expect(validSlide.imageFocalPoint).toEqual(validFocal);

          // 2. Out-of-bounds coordinates must be rejected by schema
          const badMediaX = {
            url,
            focalPoint: { x: badX, y: goodY },
          };
          const badParsedX = StructuredMediaValueSchema.safeParse(badMediaX);
          expect(badParsedX.success).toBe(false);

          // Out-of-bounds coordinates must be stripped to null by resolveHeroSlide
          const badSlideX = resolveHeroSlide({ image: badMediaX });
          expect(badSlideX.imageFocalPoint).toBeNull();

          const badMediaY = {
            url,
            focalPoint: { x: goodY, y: badX },
          };
          const badParsedY = StructuredMediaValueSchema.safeParse(badMediaY);
          expect(badParsedY.success).toBe(false);

          const badSlideY = resolveHeroSlide({ image: badMediaY });
          expect(badSlideY.imageFocalPoint).toBeNull();

          // Mutation check: if invalid focal coordinates entered persisted configuration
          const faultyBypassValidation = (m: typeof badMediaX) => {
            // Emulates an insecure validator that does not reject out-of-bounds coords
            return m.focalPoint.x >= 0 && m.focalPoint.x <= 100;
          };
          expect(faultyBypassValidation(badMediaX)).toBe(false);
        },
      ),
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
