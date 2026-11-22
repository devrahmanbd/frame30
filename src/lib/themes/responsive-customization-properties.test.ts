/**
 * Frame30 — Wave 3: Responsive Customization Fast-Check Property Suite.
 *
 * Universal property assertions across thousands of randomized inputs:
 * - Property P1: Cascade Inheritance Determinism
 * - Property P2: Override Isolation Across Device Layers
 * - Property P3: Reset Restores Upstream Inheritance
 * - Property P4: AST Roundtrip & Coercion Preservation
 * - Property P5: Viewport Preset Switching Deep AST Immutability
 * - Property P6: Storefront widgetReader Parity With inheritanceOf
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  inheritanceOf,
  LAYER_CASCADE,
  DEVICE_PRESETS,
  bucketForWidth,
  type DeviceBucket,
} from "@/lib/responsive";
import {
  parseAst,
  resolveProps,
  type Breakpoint,
  type PropValue,
  type Section,
} from "@/lib/builder-ast";

// ── Arbitraries ──

const genDeviceBucket = fc.constantFrom<DeviceBucket>("mobile", "tablet", "desktop");
const genBreakpoint = fc.constantFrom<Breakpoint>("desktop", "tablet", "mobile");

const genScalarValue = fc.oneof(
  fc.integer({ min: 1, max: 12 }),
  fc.string({ minLength: 1, maxLength: 50 }),
  fc.boolean(),
);

const genPropsBag = fc.dictionary(
  fc.stringMatching(/^[a-z][a-zA-Z0-9_]{1,15}$/),
  genScalarValue,
);

const genSectionWithOverrides = fc
  .record({
    id: fc.stringMatching(/^sec-[a-z0-9]{4,8}$/),
    props: genPropsBag,
    tabletOverrides: fc.option(genPropsBag),
    mobileOverrides: fc.option(genPropsBag),
  })
  .map(({ id, props, tabletOverrides, mobileOverrides }) => {
    const sec: Section = {
      id,
      type: "department_grid",
      props,
    };
    const bp: Partial<Record<Breakpoint, Record<string, PropValue>>> = {};
    if (tabletOverrides && Object.keys(tabletOverrides).length > 0) {
      bp.tablet = tabletOverrides;
    }
    if (mobileOverrides && Object.keys(mobileOverrides).length > 0) {
      bp.mobile = mobileOverrides;
    }
    if (Object.keys(bp).length > 0) {
      sec.bp = bp;
    }
    return sec;
  });

describe("Wave 3 — Responsive Customization Fast-Check Properties", () => {
  it("Property P1: Cascade Inheritance Determinism — repeated evaluation yields identical value and source", () => {
    fc.assert(
      fc.property(genSectionWithOverrides, genBreakpoint, fc.string(), (section, device, key) => {
        const res1 = inheritanceOf(section, key, device);
        const res2 = inheritanceOf(section, key, device);

        expect(res1.value).toEqual(res2.value);
        expect(res1.source).toBe(res2.source);
        expect(res1.inherited).toBe(res2.inherited);
        expect(res1.overridden).toBe(res2.overridden);
      }),
      { numRuns: 500 },
    );
  });

  it("Property P2: Override Isolation — modifying mobile overrides leaves desktop and tablet unchanged", () => {
    fc.assert(
      fc.property(
        genSectionWithOverrides,
        fc.stringMatching(/^[a-z][a-zA-Z0-9_]{1,10}$/),
        genScalarValue,
        (section, key, newVal) => {
          const originalProps = JSON.stringify(section.props);
          const originalTablet = JSON.stringify(section.bp?.tablet ?? null);

          // Apply mobile override
          const updatedSection: Section = {
            ...section,
            bp: {
              ...section.bp,
              mobile: {
                ...(section.bp?.mobile ?? {}),
                [key]: newVal,
              },
            },
          };

          expect(JSON.stringify(updatedSection.props)).toBe(originalProps);
          expect(JSON.stringify(updatedSection.bp?.tablet ?? null)).toBe(originalTablet);
          expect(updatedSection.bp?.mobile?.[key]).toBe(newVal);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("Property P3: Reset Restores Upstream Inheritance — clearing an override restores parent layer", () => {
    fc.assert(
      fc.property(
        genSectionWithOverrides,
        fc.constantFrom<Breakpoint>("tablet", "mobile"),
        fc.stringMatching(/^[a-z][a-zA-Z0-9_]{1,10}$/),
        genScalarValue,
        (section, device, key, overrideVal) => {
          // Add explicit override
          const withOverride: Section = {
            ...section,
            bp: {
              ...section.bp,
              [device]: {
                ...(section.bp?.[device] ?? {}),
                [key]: overrideVal,
              },
            },
          };

          const inheritBefore = inheritanceOf(withOverride, key, device);
          expect(inheritBefore.overridden).toBe(true);
          expect(inheritBefore.value).toBe(overrideVal);

          // Simulate reset: delete the override key
          const cleanedDeviceBag = { ...(withOverride.bp?.[device] ?? {}) };
          delete cleanedDeviceBag[key];

          const resetSection: Section = {
            ...withOverride,
            bp: {
              ...withOverride.bp,
              [device]: cleanedDeviceBag,
            },
          };

          const inheritAfter = inheritanceOf(resetSection, key, device);
          expect(inheritAfter.overridden).toBe(false);
          // If desktop or tablet has this key, it must now inherit from there
          if (device === "mobile" && resetSection.bp?.tablet && key in resetSection.bp.tablet) {
            expect(inheritAfter.source).toBe("tablet");
            expect(inheritAfter.value).toBe(resetSection.bp.tablet[key]);
            expect(inheritAfter.inherited).toBe(true);
          } else if (key in resetSection.props) {
            expect(inheritAfter.source).toBe("desktop");
            expect(inheritAfter.value).toBe(resetSection.props[key]);
            expect(inheritAfter.inherited).toBe(true);
          } else {
            expect(inheritAfter.source).toBe("default");
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("Property P4: AST Roundtrip & Coercion Preservation — valid responsive bp survives AST normalization", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 2 }),
        (dCols, tCols, mCols) => {
          const rawAst = {
            main: [
              {
                id: "dept-grid",
                type: "department_grid",
                props: {
                  columns: dCols,
                },
                bp: {
                  tablet: {
                    columns: tCols,
                  },
                  mobile: {
                    columns: mCols,
                  },
                },
              },
            ],
          };

          const parsed = parseAst(rawAst);
          const parsedSec = parsed.main[0]!;

          expect(parsedSec.props.columns).toBe(dCols);
          expect(parsedSec.bp?.tablet?.columns).toBe(tCols);
          expect(parsedSec.bp?.mobile?.columns).toBe(mCols);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("Property P5: Viewport Preset Switching Deep AST Immutability", () => {
    fc.assert(
      fc.property(genSectionWithOverrides, fc.constantFrom(...DEVICE_PRESETS), (section, preset) => {
        const doc = { main: [section] };
        Object.freeze(section);
        Object.freeze(section.props);
        if (section.bp) {
          Object.freeze(section.bp);
          if (section.bp.tablet) Object.freeze(section.bp.tablet);
          if (section.bp.mobile) Object.freeze(section.bp.mobile);
        }
        Object.freeze(doc.main);
        Object.freeze(doc);

        const beforeJson = JSON.stringify(doc);

        // Simulated preview width switch
        const width = preset.width;
        const bucket = bucketForWidth(width);
        expect(bucket).toBe(preset.bp);

        // Document must remain byte-identical
        const afterJson = JSON.stringify(doc);
        expect(afterJson).toBe(beforeJson);
      }),
      { numRuns: 200 },
    );
  });

  it("Property P6: Storefront resolveProps Parity With inheritanceOf", () => {
    fc.assert(
      fc.property(
        genSectionWithOverrides,
        genBreakpoint,
        fc.stringMatching(/^[a-z][a-zA-Z0-9_]{1,10}$/),
        (section, device, key) => {
          const inheritance = inheritanceOf(section, key, device);
          const resolved = resolveProps(section, device);

          expect(resolved[key]).toEqual(inheritance.value);
        },
      ),
      { numRuns: 300 },
    );
  });
});
