/**
 * Frame30 — Wave 2.2: Property-Based Verification for SchemaControls MediaPicker Integration
 *
 * Verifies invariants:
 * - Property P1: Structured media preservation across unrelated schema property updates
 * - Property P2: Media replacement isolation (mutates only target field, leaves siblings intact)
 * - Property P3: Focal-point preservation within [0, 100] bounds across validation & serialization
 * - Property P4: Legacy URL string compatibility (accepted cleanly without corruption)
 * - Property P5: Invalid media rejection (malformed objects & out-of-bounds focal fail closed)
 * - Property P6: Ordinary URL distinction (kind: "link" and kind: "video" strictly reject structured objects)
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  validateProps,
  type PropSchema,
  type WidgetProps,
} from "@/lib/widget-props";
import {
  resolveMediaUrl,
  resolveMediaAlt,
  type StructuredMediaValue,
} from "@/lib/theme-contract";

// ── Arbitraries & Generators ──

const genValidFocalPoint = fc.record({
  x: fc.integer({ min: 0, max: 100 }),
  y: fc.integer({ min: 0, max: 100 }),
});

const genSafeUrl = fc.webUrl({ validSchemes: ["https"] });

const genStructuredMedia = fc
  .record({
    url: genSafeUrl,
    alt: fc.option(fc.string({ maxLength: 100 })),
    width: fc.option(fc.integer({ min: 10, max: 4000 })),
    height: fc.option(fc.integer({ min: 10, max: 4000 })),
    focalPoint: fc.option(genValidFocalPoint),
  })
  .map((raw) => {
    const media: StructuredMediaValue = { url: raw.url };
    if (raw.alt !== null && raw.alt !== undefined) media.alt = raw.alt;
    if (raw.width !== null && raw.width !== undefined) media.width = raw.width;
    if (raw.height !== null && raw.height !== undefined)
      media.height = raw.height;
    if (raw.focalPoint !== null && raw.focalPoint !== undefined)
      media.focalPoint = raw.focalPoint;
    return media;
  });

describe("SchemaControls MediaPicker Property Suites (Wave 2.2)", () => {
  /* ------------------------------------------------------------------ */
  /* Property P1: Structured media preservation across unrelated updates*/
  /* ------------------------------------------------------------------ */
  it("Property P1: unrelated schema property updates preserve structured media byte-identical", () => {
    const schema: PropSchema = [
      { key: "heroImage", label: "Hero Image", kind: "image" },
      { key: "headline", label: "Headline", kind: "text" },
      { key: "featured", label: "Featured", kind: "boolean" },
    ];

    fc.assert(
      fc.property(
        genStructuredMedia,
        fc.string({ maxLength: 80 }),
        fc.string({ maxLength: 80 }),
        fc.boolean(),
        fc.boolean(),
        (media, initialText, updatedText, initialBool, updatedBool) => {
          const initialProps: WidgetProps = {
            heroImage: media,
            headline: initialText,
            featured: initialBool,
          };

          const initialValidation = validateProps(schema, initialProps);
          expect(initialValidation.ok).toBe(true);

          // Mutate unrelated properties
          const updatedProps: WidgetProps = {
            ...initialProps,
            headline: updatedText,
            featured: updatedBool,
          };

          const updatedValidation = validateProps(schema, updatedProps);
          expect(updatedValidation.ok).toBe(true);
          if (updatedValidation.ok) {
            // Media property must remain strictly identical
            expect(updatedValidation.clean.heroImage).toEqual(media);
            const preserved = updatedValidation.clean
              .heroImage as StructuredMediaValue;
            expect(preserved.url).toBe(media.url);
            expect(preserved.alt).toBe(media.alt);
            expect(preserved.focalPoint).toEqual(media.focalPoint);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P2: Media replacement isolation                           */
  /* ------------------------------------------------------------------ */
  it("Property P2: replacing media property mutates ONLY the target field, preserving all siblings", () => {
    const schema: PropSchema = [
      { key: "mainMedia", label: "Main Media", kind: "media" },
      { key: "caption", label: "Caption", kind: "text" },
      { key: "count", label: "Count", kind: "number" },
    ];

    fc.assert(
      fc.property(
        genStructuredMedia,
        genStructuredMedia,
        fc.string({ maxLength: 50 }),
        fc.integer({ min: 1, max: 1000 }),
        (initialMedia, newMedia, caption, count) => {
          const baseProps: WidgetProps = {
            mainMedia: initialMedia,
            caption,
            count,
          };

          const baseResult = validateProps(schema, baseProps);
          expect(baseResult.ok).toBe(true);

          const replacedProps: WidgetProps = {
            ...baseProps,
            mainMedia: newMedia,
          };

          const result = validateProps(schema, replacedProps);
          expect(result.ok).toBe(true);
          if (result.ok && baseResult.ok) {
            expect(result.clean.mainMedia).toEqual(newMedia);
            expect(result.clean.caption).toBe(baseResult.clean.caption);
            expect(result.clean.count).toBe(baseResult.clean.count);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P3: Focal-point preservation within [0, 100] bounds       */
  /* ------------------------------------------------------------------ */
  it("Property P3: valid focal point within [0, 100] bounds survives validation and serialization", () => {
    const schema: PropSchema = [
      { key: "avatar", label: "Avatar", kind: "image" },
    ];

    fc.assert(
      fc.property(
        genSafeUrl,
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (url, x, y) => {
          const media: StructuredMediaValue = {
            url,
            focalPoint: { x, y },
          };

          // 1. Validation preserves focal point
          const res = validateProps(schema, { avatar: media });
          expect(res.ok).toBe(true);
          if (res.ok) {
            const cleanMedia = res.clean.avatar as StructuredMediaValue;
            expect(cleanMedia.focalPoint).toEqual({ x, y });
          }

          // 2. Serialization roundtrip preserves focal point
          const serialized = JSON.stringify({ avatar: media });
          const parsed = JSON.parse(serialized) as WidgetProps;
          const resRoundtrip = validateProps(schema, parsed);
          expect(resRoundtrip.ok).toBe(true);
          if (resRoundtrip.ok) {
            const cleanMedia = resRoundtrip.clean
              .avatar as StructuredMediaValue;
            expect(cleanMedia.focalPoint).toEqual({ x, y });
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P4: Legacy URL string compatibility                       */
  /* ------------------------------------------------------------------ */
  it("Property P4: valid legacy URL strings remain accepted without corruption", () => {
    const schema: PropSchema = [
      { key: "banner", label: "Banner", kind: "image" },
    ];

    fc.assert(
      fc.property(genSafeUrl, (url) => {
        const res = validateProps(schema, { banner: url });
        expect(res.ok).toBe(true);
        if (res.ok) {
          expect(res.clean.banner).toBe(url);
          expect(resolveMediaUrl(res.clean.banner)).toBe(url);
          expect(resolveMediaAlt(res.clean.banner, "fallback")).toBe(
            "fallback",
          );
        }
      }),
      { numRuns: 100 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P5: Invalid media rejection                               */
  /* ------------------------------------------------------------------ */
  it("Property P5: malformed media and out-of-bounds focal coordinates fail closed", () => {
    const schema: PropSchema = [
      { key: "pic", label: "Picture", kind: "image" },
    ];

    // Arbitrary out-of-bounds coordinates (x < 0 or x > 100, y < 0 or y > 100)
    const genBadCoord = fc.oneof(
      fc.integer({ min: -1000, max: -1 }),
      fc.integer({ min: 101, max: 1000 }),
    );

    fc.assert(
      fc.property(
        genSafeUrl,
        genBadCoord,
        fc.integer({ min: 0, max: 100 }),
        (url, badX, goodY) => {
          const badMedia = {
            url,
            focalPoint: { x: badX, y: goodY },
          };
          const res = validateProps(schema, { pic: badMedia });
          expect(res.ok).toBe(false);
          expect(res.errors).toContain("pic.invalid_media");
        },
      ),
      { numRuns: 50 },
    );

    fc.assert(
      fc.property(
        genSafeUrl,
        fc.integer({ min: 0, max: 100 }),
        genBadCoord,
        (url, goodX, badY) => {
          const badMedia = {
            url,
            focalPoint: { x: goodX, y: badY },
          };
          const res = validateProps(schema, { pic: badMedia });
          expect(res.ok).toBe(false);
          expect(res.errors).toContain("pic.invalid_media");
        },
      ),
      { numRuns: 50 },
    );
  });

  /* ------------------------------------------------------------------ */
  /* Property P6: Ordinary URL distinction                              */
  /* ------------------------------------------------------------------ */
  it("Property P6: kind: 'link' and kind: 'video' strictly reject structured objects", () => {
    const schema: PropSchema = [
      { key: "navLink", label: "Navigation Link", kind: "link" },
      { key: "heroVideo", label: "Hero Video", kind: "video" },
    ];

    fc.assert(
      fc.property(genStructuredMedia, (media) => {
        // Link rejecting structured media object
        const linkRes = validateProps(schema, {
          navLink: media,
          heroVideo: "https://v.mp4",
        });
        expect(linkRes.ok).toBe(false);
        expect(linkRes.errors).toContain("navLink.type");

        // Video rejecting structured media object
        const videoRes = validateProps(schema, {
          navLink: "https://example.com",
          heroVideo: media,
        });
        expect(videoRes.ok).toBe(false);
        expect(videoRes.errors).toContain("heroVideo.type");
      }),
      { numRuns: 100 },
    );
  });
});
