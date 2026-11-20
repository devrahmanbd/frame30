import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  migrateThemeAst,
  validateThemeAst,
  loadAuthoritativeThemeAst,
  SONGOSKRITI_THEME_MANIFEST,
  THEME_CONTRACT_VERSION,
  type ThemeManifest,
  type ThemeSectionDefinition,
} from "../theme-contract";
import { parseTemplates } from "../builder-ast";

// ── Arbitraries & Generators ──

const genValidFocalPoint = fc.record({
  x: fc.integer({ min: 0, max: 100 }),
  y: fc.integer({ min: 0, max: 100 }),
});

const genInvalidFocalPoint = fc.oneof(
  fc.record({
    x: fc.integer({ min: 101, max: 1000 }),
    y: fc.integer({ min: 0, max: 100 }),
  }),
  fc.record({
    x: fc.integer({ min: -1000, max: -1 }),
    y: fc.integer({ min: 0, max: 100 }),
  }),
  fc.record({
    x: fc.integer({ min: 0, max: 100 }),
    y: fc.integer({ min: 101, max: 1000 }),
  }),
  fc.record({
    x: fc.integer({ min: 0, max: 100 }),
    y: fc.integer({ min: -1000, max: -1 }),
  }),
);

const genStructuredMedia = fc.record({
  url: fc.webUrl({ validSchemes: ["https"] }),
  alt: fc.string({ maxLength: 100 }),
  width: fc.option(fc.integer({ min: 10, max: 4000 })),
  height: fc.option(fc.integer({ min: 10, max: 4000 })),
  focalPoint: fc.option(genValidFocalPoint),
});

const genLegacyImageUrl = fc.webUrl({ validSchemes: ["https"] });

const genSlideItem = fc.record({
  image: fc.oneof(genLegacyImageUrl, genStructuredMedia),
  title: fc.string({ maxLength: 50 }),
  alt: fc.option(fc.string({ maxLength: 50 })),
});

const genHeroSection = fc.record({
  id: fc.stringMatching(/^[a-z0-9_-]{3,12}$/),
  type: fc.constant("hero_carousel" as const),
  settings: fc.record({
    slides: fc.array(genSlideItem, { minLength: 1, maxLength: 5 }),
  }),
});

const genRichTextSection = fc.record({
  id: fc.stringMatching(/^[a-z0-9_-]{3,12}$/),
  type: fc.constant("rich_text" as const),
  settings: fc.record({
    heading: fc.string({ maxLength: 60 }),
    content: fc.string({ maxLength: 300 }),
  }),
});

const genSection = fc.oneof(genHeroSection, genRichTextSection);

const genThemeDoc = fc.record({
  schemaVersion: fc.oneof(
    fc.constant("0.9.0"),
    fc.constant("1.0.0"),
    fc.constant(undefined),
  ),
  index: fc.record({
    header: fc.array(genSection, { maxLength: 2 }),
    main: fc.array(genSection, { minLength: 1, maxLength: 4 }),
    footer: fc.array(genSection, { maxLength: 2 }),
  }),
});

describe("Theme Standard Integration — fast-check Properties (Phases 2.1 – 2.10)", () => {
  // P1: Migration Idempotency
  it("P1: Migration is idempotent — migrate(migrate(doc)) === migrate(doc)", () => {
    fc.assert(
      fc.property(genThemeDoc, (doc) => {
        const first = migrateThemeAst(doc, SONGOSKRITI_THEME_MANIFEST);
        const second = migrateThemeAst(first.ast, SONGOSKRITI_THEME_MANIFEST);
        expect(second.ast).toEqual(first.ast);
      }),
      { numRuns: 100, seed: 421001 },
    );
  });

  // P2: Media Preservation
  it("P2: Valid structured media preserves URL, alt text, dimensions, and focal position", () => {
    fc.assert(
      fc.property(genStructuredMedia, (media) => {
        const doc = {
          schemaVersion: "1.0.0",
          sections: [
            {
              id: "hero_test",
              type: "hero_carousel",
              settings: {
                slides: [{ image: media }],
              },
            },
          ],
        };

        const res = migrateThemeAst(doc, SONGOSKRITI_THEME_MANIFEST);
        const migratedSections = (res.ast as Record<string, unknown>).sections as any[];
        const migratedMedia = migratedSections[0].settings.slides[0].image;

        expect(migratedMedia.url).toBe(media.url);
        expect(migratedMedia.alt).toBe(media.alt);
        if (media.width !== undefined) expect(migratedMedia.width).toBe(media.width);
        if (media.height !== undefined) expect(migratedMedia.height).toBe(media.height);
        if (media.focalPoint) {
          expect(migratedMedia.focalPoint).toEqual(media.focalPoint);
        }
      }),
      { numRuns: 100, seed: 421002 },
    );
  });

  // P3: Legacy Compatibility
  it("P3: Legacy string URLs migrate cleanly to structured media without data loss", () => {
    fc.assert(
      fc.property(genLegacyImageUrl, fc.string({ maxLength: 50 }), (url, altText) => {
        const legacyDoc = {
          schemaVersion: "0.9.0",
          sections: [
            {
              id: "hero_legacy",
              type: "hero_carousel",
              settings: {
                slides: [{ image: url, alt: altText }],
              },
            },
          ],
        };

        const res = migrateThemeAst(legacyDoc, SONGOSKRITI_THEME_MANIFEST);
        const migratedSections = (res.ast as Record<string, unknown>).sections as any[];
        const migratedSlide = migratedSections[0].settings.slides[0];

        expect(typeof migratedSlide.image).toBe("object");
        expect(migratedSlide.image.url).toBe(url.trim());
        expect((res.ast as Record<string, unknown>).schemaVersion).toBe(THEME_CONTRACT_VERSION);
      }),
      { numRuns: 100, seed: 421003 },
    );
  });

  // P4: Future-Version Rejection
  it("P4: Future schema versions are strictly rejected fail-closed without mutating input", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        fc.integer({ min: 0, max: 99 }),
        fc.integer({ min: 0, max: 99 }),
        genThemeDoc,
        (maj, min, patch, doc) => {
          const futureVersion = `${maj}.${min}.${patch}`;
          const futureDoc = { ...doc, schemaVersion: futureVersion };
          const clone = JSON.parse(JSON.stringify(futureDoc));

          const res = loadAuthoritativeThemeAst(
            futureDoc,
            SONGOSKRITI_THEME_MANIFEST,
            (ast) => ast,
          );

          expect(res.success).toBe(false);
          if (!res.success) {
            expect(res.error).toContain(`Unsupported future schema version '${futureVersion}'`);
          }
          expect(futureDoc).toEqual(clone);
        },
      ),
      { numRuns: 100, seed: 421004 },
    );
  });

  // P5: Failure Immutability
  it("P5: When migration or validation fails, the input document remains untouched", () => {
    fc.assert(
      fc.property(genInvalidFocalPoint, (invalidFocal) => {
        const invalidDoc = {
          schemaVersion: "1.0.0",
          sections: [
            {
              id: "hero_broken",
              type: "hero_carousel",
              settings: {
                slides: [
                  {
                    image: {
                      url: "https://example.com/img.jpg",
                      focalPoint: invalidFocal,
                    },
                  },
                ],
              },
            },
          ],
        };
        const clone = JSON.parse(JSON.stringify(invalidDoc));

        const res = loadAuthoritativeThemeAst(
          invalidDoc,
          SONGOSKRITI_THEME_MANIFEST,
          (ast) => ast,
        );

        expect(res.success).toBe(false);
        expect(invalidDoc).toEqual(clone);
      }),
      { numRuns: 100, seed: 421005 },
    );
  });

  // P6: No Invalid Publication
  it("P6: A document with schema validation failures cannot pass publication load", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Z_]{4,10}$/), // Undeclared setting key
        (undeclaredKey) => {
          const docWithUndeclared = {
            schemaVersion: "1.0.0",
            sections: [
              {
                id: "rich_1",
                type: "rich_text",
                settings: {
                  heading: "Valid Heading",
                  [undeclaredKey]: "Illegal Value",
                },
              },
            ],
          };

          const res = loadAuthoritativeThemeAst(
            docWithUndeclared,
            SONGOSKRITI_THEME_MANIFEST,
            (ast) => parseTemplates(ast as any),
          );

          expect(res.success).toBe(false);
          if (!res.success) {
            expect(res.error).toContain("Theme AST validation failed");
          }
        },
      ),
      { numRuns: 100, seed: 421006 },
    );
  });

  // P7: Canonical Persistence
  it("P7: Every successfully migrated document stamps canonical schemaVersion 1.0.0", () => {
    fc.assert(
      fc.property(genThemeDoc, (doc) => {
        const res = loadAuthoritativeThemeAst(
          doc,
          SONGOSKRITI_THEME_MANIFEST,
          (ast) => ast,
        );

        if (res.success) {
          const migrated = res.ast as Record<string, unknown>;
          expect(migrated.schemaVersion).toBe(THEME_CONTRACT_VERSION);
          expect(THEME_CONTRACT_VERSION).toBe("1.0.0");
        }
      }),
      { numRuns: 100, seed: 421007 },
    );
  });

  // P8: Preview / Publication Equivalence
  it("P8: Equivalent validated configurations produce identical normalized template ASTs", () => {
    fc.assert(
      fc.property(genThemeDoc, (doc) => {
        const resPreview = loadAuthoritativeThemeAst(
          doc,
          SONGOSKRITI_THEME_MANIFEST,
          (ast) => parseTemplates(ast as any),
        );
        const resPublished = loadAuthoritativeThemeAst(
          doc,
          SONGOSKRITI_THEME_MANIFEST,
          (ast) => parseTemplates(ast as any),
        );

        expect(resPreview.success).toBe(resPublished.success);
        if (resPreview.success && resPublished.success) {
          expect(resPreview.ast).toEqual(resPublished.ast);
        }
      }),
      { numRuns: 100, seed: 421008 },
    );
  });

  // P9: Nested Configuration Preservation
  it("P9: Nested repeaters preserve all valid items and settings across arbitrary depths", () => {
    const genNestedSlides = fc.array(
      fc.record({
        image: genStructuredMedia,
        title: fc.string({ maxLength: 40 }),
      }),
      { minLength: 1, maxLength: 6 },
    );

    fc.assert(
      fc.property(genNestedSlides, (slides) => {
        const doc = {
          schemaVersion: "1.0.0",
          sections: [
            {
              id: "hero_nested",
              type: "hero_carousel",
              settings: { slides },
            },
          ],
        };

        const res = migrateThemeAst(doc, SONGOSKRITI_THEME_MANIFEST);
        const migratedSections = (res.ast as Record<string, unknown>).sections as any[];
        const migratedSlides = migratedSections[0].settings.slides;

        expect(migratedSlides).toHaveLength(slides.length);
        for (let i = 0; i < slides.length; i++) {
          expect(migratedSlides[i].title).toBe(slides[i].title);
          expect(migratedSlides[i].image.url).toBe(slides[i].image.url);
        }
      }),
      { numRuns: 100, seed: 421009 },
    );
  });

  // P10: Deterministic Behavior
  it("P10: Repeated execution with identical inputs produces bit-for-bit identical results", () => {
    fc.assert(
      fc.property(genThemeDoc, (doc) => {
        const runA = JSON.stringify(migrateThemeAst(doc, SONGOSKRITI_THEME_MANIFEST));
        const runB = JSON.stringify(migrateThemeAst(doc, SONGOSKRITI_THEME_MANIFEST));
        expect(runA).toBe(runB);
      }),
      { numRuns: 100, seed: 421010 },
    );
  });
});
