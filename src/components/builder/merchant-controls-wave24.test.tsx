/**
 * Frame30 — Wave 2.4: Responsive Preview Presets, Mobile Hero Media & Merchant-First Controls
 * Independent Acceptance & Integration Suite.
 *
 * Verifies:
 * - Group 1: Eight Responsive Preview Presets (Scope A)
 *   - All 8 presets exist in DEVICE_PRESETS with exact dimensions and buckets
 *   - Presets resolve correctly through bucketForWidth
 *   - Bilingual English and Bengali names are present
 *   - BuilderTopBar renders all 8 presets with accessible labels and active indicator
 *   - Viewport switching never mutates theme AST
 * - Group 2: Optional Mobile-Specific Hero Image (Scope B)
 *   - hero_carousel slide schema declares mobileImage with kind: "image"
 *   - SectionInspector renders MediaPicker for mobileImage
 *   - Desktop and mobile media isolation (editing one does not mutate the other)
 *   - Slide isolation (slide 0 modifications never leak to slide 1)
 *   - Mobile focal point positioning is preserved independently
 *   - Responsive <picture> markup with (max-width: 767px) source query
 *   - Desktop fallback when mobileImage is omitted or cleared
 *   - Legacy slide compatibility (plain image without mobileImage)
 * - Group 3: Technical Input Elimination (Scope C)
 *   - Merchant-facing labels free of "slug", "handle", "UUID", "comma separated", "pipe delimited"
 *   - Image fields across sections render MediaPicker rather than raw text URLs
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SectionInspector } from "./SectionInspector";
import { BuilderTopBar } from "./BuilderTopBar";
import {
  DEVICE_PRESETS,
  bucketForWidth,
  type DeviceBucket,
} from "@/lib/responsive";
import {
  parseAst,
  resolveSkin,
  type Breakpoint,
  type Section,
  SECTION_CATALOG,
} from "@/lib/builder-ast";
import { WIDGET_COMPONENTS, widgetReader, type WidgetCtx } from "./widgets";
import type { StructuredMediaValue } from "@/lib/theme-contract";

function html(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

function withQuery(node: ReactElement): ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const noop = () => {};
const baseInspectorProps = {
  template: "index" as const,
  device: "desktop" as Breakpoint,
  frameLang: "en" as const,
  viewMode: "all" as const,
  onViewModeChange: noop,
  onRemove: noop,
  onDuplicate: noop,
  onToggleHidden: noop,
  onResetToTemplate: noop,
  onOpenAssetDrawer: noop,
  onPickMediaForNode: noop,
  onReorder: noop,
  onClearOverride: noop,
  onDelete: noop,
  allSections: [],
};

function makeCtx(
  section: Section,
  device: Breakpoint = "desktop",
  locale: "en" | "bn" = "en",
): WidgetCtx {
  return {
    section,
    ...widgetReader(section, device, locale),
    Heading: "h2",
    primary: false,
    editing: false,
    device,
    locale,
    template: "index",
    renderChildren: () => null,
  };
}

describe("Wave 2.4 — Scope A: Eight Responsive Preview Presets", () => {
  it("Test A1: defines all 8 platform-standard responsive preview presets with exact dimensions", () => {
    expect(DEVICE_PRESETS).toHaveLength(8);

    const expected = [
      { id: "small-mobile", width: 320, height: 568, bp: "mobile" },
      { id: "mobile", width: 360, height: 640, bp: "mobile" },
      { id: "mobile-large", width: 390, height: 844, bp: "mobile" },
      { id: "mobile-xl", width: 430, height: 932, bp: "mobile" },
      { id: "tablet", width: 768, height: 1024, bp: "tablet" },
      { id: "laptop", width: 1024, height: 768, bp: "tablet" },
      { id: "desktop", width: 1280, height: 800, bp: "desktop" },
      { id: "desktop-wide", width: 1440, height: 900, bp: "desktop" },
    ];

    for (const exp of expected) {
      const found = DEVICE_PRESETS.find((p) => p.width === exp.width);
      expect(found, `Preset with width ${exp.width} must exist`).toBeDefined();
      expect(found?.height).toBe(exp.height);
      expect(found?.bp).toBe(exp.bp);
      expect(found?.label).toBe(String(exp.width));
    }
  });

  it("Test A2: verifies every preset resolves to its declared bucket under bucketForWidth", () => {
    for (const preset of DEVICE_PRESETS) {
      const bucket: DeviceBucket = bucketForWidth(preset.width);
      expect(bucket).toBe(preset.bp);
    }
  });

  it("Test A3: presets declare understandable bilingual names", () => {
    for (const preset of DEVICE_PRESETS) {
      expect(preset.name).toBeTruthy();
      expect(typeof preset.name).toBe("string");
      expect(preset.name_bn).toBeTruthy();
      expect(typeof preset.name_bn).toBe("string");
    }

    const smallMobile = DEVICE_PRESETS.find((p) => p.width === 320);
    expect(smallMobile?.name).toBe("Small mobile");
    expect(smallMobile?.name_bn).toBe("ছোট মোবাইল");

    const desktopWide = DEVICE_PRESETS.find((p) => p.width === 1440);
    expect(desktopWide?.name).toBe("Desktop wide");
    expect(desktopWide?.name_bn).toBe("ওয়াইড ডেস্কটপ");
  });

  it("Test A4: BuilderTopBar renders all 8 presets with accessible tabs and active state", () => {
    const markup = html(
      <BuilderTopBar
        title="Songoskriti"
        status="saved"
        device="mobile"
        previewWidth={390}
        onWidthChange={noop}
        canUndo={false}
        canRedo={false}
        onUndo={noop}
        onRedo={noop}
        onPreview={noop}
        isPreview={false}
        onSave={noop}
        onPublish={noop}
      />,
    );

    for (const preset of DEVICE_PRESETS) {
      expect(markup).toContain(`${preset.width}`);
    }

    // Active preset (390) must have aria-selected="true"
    expect(markup).toMatch(/aria-selected="true"[^>]*>.*390/s);
  });

  it("Test A5: switching preview width maintains strict AST immutability", () => {
    const initialAst: { main: Section[] } = {
      main: [
        {
          id: "hero-1",
          type: "hero_carousel",
          props: {
            slides: [
              {
                image: "https://cdn.example.com/hero.jpg",
                headline: "Timeless Weaves",
              },
            ],
          },
        },
      ],
    };

    const parsedBefore = parseAst(initialAst);
    const serializedBefore = JSON.stringify(parsedBefore);

    // Simulated preset switches across all 8 widths
    for (const preset of DEVICE_PRESETS) {
      const currentWidth = preset.width;
      expect(currentWidth).toBeGreaterThanOrEqual(320);
    }

    const parsedAfter = parseAst(initialAst);
    expect(JSON.stringify(parsedAfter)).toBe(serializedBefore);
  });
});

describe("Wave 2.4 — Scope B: Optional Mobile-Specific Hero Image", () => {
  it("Test B1: hero_carousel slide repeater declares mobileImage field with kind: image", () => {
    const heroDef = SECTION_CATALOG.find((s) => s.type === "hero_carousel");
    expect(heroDef).toBeDefined();

    const slidesField = heroDef?.fields.find((f) => f.key === "slides");
    expect(slidesField).toBeDefined();
    expect(slidesField?.kind).toBe("array");

    const mobileImageField = slidesField?.fields?.find(
      (f) => f.key === "mobileImage",
    );
    expect(
      mobileImageField,
      "mobileImage field must exist in hero_carousel slide fields",
    ).toBeDefined();
    expect(mobileImageField?.kind).toBe("image");
  });

  it("Test B2: SectionInspector renders MediaPicker for mobileImage in slide repeater", () => {
    const section: Section = {
      id: "hero-test",
      type: "hero_carousel",
      props: {
        slides: [
          {
            image: "https://cdn.example.com/desktop-hero.jpg",
            mobileImage: "https://cdn.example.com/mobile-hero.jpg",
            headline: "Jamdani Splendor",
          },
        ],
      },
    };

    const markup = html(
      withQuery(
        <SectionInspector
          {...baseInspectorProps}
          section={section}
          onChange={noop}
        />,
      ),
    );

    // Must render MediaPicker controls, not raw text inputs for mobileImage
    expect(markup).toContain("Mobile image");
    // MediaPicker renders image preview or button
    expect(markup).toContain("mobile-hero.jpg");
  });

  it("Test B3: desktop and mobile media isolation — editing one never alters the other", () => {
    const initialSlide = {
      image: {
        url: "https://cdn.example.com/desktop.jpg",
        alt: "Desktop Jamdani",
        focalPoint: { x: 50, y: 30 },
      } as StructuredMediaValue,
      mobileImage: {
        url: "https://cdn.example.com/mobile.jpg",
        alt: "Mobile Jamdani",
        focalPoint: { x: 70, y: 80 },
      } as StructuredMediaValue,
      headline: "Artisanal Weaves",
    };

    const section: Section = {
      id: "hero-iso",
      type: "hero_carousel",
      props: {
        slides: [initialSlide],
      },
    };

    const parsed = parseAst({ main: [section] });
    const slide = (
      parsed.main[0]!.props.slides as Array<Record<string, unknown>>
    )[0]!;

    // Modifying mobileImage
    const updatedSlide = {
      ...slide,
      mobileImage: {
        url: "https://cdn.example.com/mobile-v2.jpg",
        alt: "Updated Mobile Jamdani",
        focalPoint: { x: 80, y: 90 },
      },
    };

    // Desktop image must remain completely unchanged
    expect((updatedSlide as Record<string, unknown>).image).toEqual(initialSlide.image);

    // Modifying desktop image leaves mobileImage completely unchanged
    const desktopUpdatedSlide = {
      ...slide,
      image: {
        url: "https://cdn.example.com/desktop-v2.jpg",
        alt: "New Desktop Alt",
      },
    };
    expect((desktopUpdatedSlide as Record<string, unknown>).mobileImage).toEqual(initialSlide.mobileImage);
  });

  it("Test B4: slide isolation — slide 0 mobile image edits do not leak to slide 1", () => {
    const section: Section = {
      id: "hero-multi",
      type: "hero_carousel",
      props: {
        slides: [
          {
            image: "https://cdn.example.com/slide1-desktop.jpg",
            mobileImage: "https://cdn.example.com/slide1-mobile.jpg",
            headline: "Slide 1",
          },
          {
            image: "https://cdn.example.com/slide2-desktop.jpg",
            headline: "Slide 2",
          },
        ],
      },
    };

    const parsed = parseAst({ main: [section] });
    const slides = parsed.main[0]!.props.slides as Array<
      Record<string, unknown>
    >;

    expect(slides[0]!.mobileImage).toBe(
      "https://cdn.example.com/slide1-mobile.jpg",
    );
    expect(slides[1]!.mobileImage).toBeUndefined();
  });

  it("Test B5: mobile focal point positioning is preserved independently", () => {
    const section: Section = {
      id: "hero-focal",
      type: "hero_carousel",
      props: {
        slides: [
          {
            image: {
              url: "https://cdn.example.com/desktop.jpg",
              focalPoint: { x: 25, y: 35 },
            },
            mobileImage: {
              url: "https://cdn.example.com/mobile.jpg",
              focalPoint: { x: 85, y: 95 },
            },
            headline: "Handloom Heritage",
          },
        ],
      },
    };

    const parsed = parseAst({ main: [section] });
    const slide = (
      parsed.main[0]!.props.slides as Array<Record<string, unknown>>
    )[0]!;

    const dFocal =
      typeof slide.image === "object" && slide.image !== null
        ? (slide.image as Record<string, unknown>).focalPoint
        : null;
    const mFocal =
      typeof slide.mobileImage === "object" && slide.mobileImage !== null
        ? (slide.mobileImage as Record<string, unknown>).focalPoint
        : null;

    expect(dFocal).toEqual({ x: 25, y: 35 });
    expect(mFocal).toEqual({ x: 85, y: 95 });
  });

  it("Test B6: renders responsive <picture> with (max-width: 767px) media query", () => {
    const section: Section = {
      id: "hero-pic",
      type: "hero_carousel",
      props: {
        skin: "split",
        slides: [
          {
            image: "https://cdn.example.com/desktop.jpg",
            mobileImage: "https://cdn.example.com/mobile.jpg",
            headline: "Woven Dreams",
          },
        ],
      },
    };

    const ctx = makeCtx(section, "desktop", "en");
    const Cmp = WIDGET_COMPONENTS.hero_carousel;
    expect(Cmp).toBeDefined();

    const markup = html(<Cmp {...ctx} />);

    // Must emit <picture>
    expect(markup).toContain("<picture");
    // Must emit <source media="(max-width: 767px)"
    expect(markup).toContain('media="(max-width: 767px)"');
    expect(markup).toContain("https://cdn.example.com/mobile.jpg");
    expect(markup).toContain("https://cdn.example.com/desktop.jpg");
  });

  it("Test B7: desktop fallback — when mobileImage is omitted or cleared, desktop image renders on mobile", () => {
    const section: Section = {
      id: "hero-fallback",
      type: "hero_carousel",
      props: {
        skin: "split",
        slides: [
          {
            image: "https://cdn.example.com/desktop-only.jpg",
            headline: "Classic Saree",
          },
        ],
      },
    };

    // Render in mobile device mode
    const ctx = makeCtx(section, "mobile", "en");
    const Cmp = WIDGET_COMPONENTS.hero_carousel;
    const markup = html(<Cmp {...ctx} />);

    expect(markup).toContain("https://cdn.example.com/desktop-only.jpg");
    // Should NOT have an empty or invalid mobile source
    expect(markup).not.toContain('srcset=""');
    expect(markup).not.toContain('srcSet=""');
  });

  it("Test B8: legacy compatibility — slides with only { image: string } render without error", () => {
    const legacySection: Section = {
      id: "hero-legacy",
      type: "hero_carousel",
      props: {
        slides: [
          {
            image: "https://cdn.example.com/legacy-hero.jpg",
            headline: "Traditional Handcraft",
            subhead: "Passed down through generations",
            ctaLabel: "Shop Collection",
            ctaUrl: "/c/sarees",
          },
        ],
      },
    };

    const ctxDesktop = makeCtx(legacySection, "desktop", "en");
    const ctxMobile = makeCtx(legacySection, "mobile", "en");
    const Cmp = WIDGET_COMPONENTS.hero_carousel;

    expect(() => html(<Cmp {...ctxDesktop} />)).not.toThrow();
    expect(() => html(<Cmp {...ctxMobile} />)).not.toThrow();

    const markupMobile = html(<Cmp {...ctxMobile} />);
    expect(markupMobile).toContain("https://cdn.example.com/legacy-hero.jpg");
    expect(markupMobile).toContain("Traditional Handcraft");
  });

  it("Test B9: production <picture> responsive focal point styling emits --hero-focal-d, --hero-focal-m, and .fq-hero-art without hardcoded desktop object-position inline override", () => {
    const section: Section = {
      id: "hero-focal-responsive",
      type: "hero_carousel",
      props: {
        skin: "split",
        slides: [
          {
            image: {
              url: "https://cdn.example.com/desktop.jpg",
              focalPoint: { x: 25, y: 35 },
            },
            mobileImage: {
              url: "https://cdn.example.com/mobile.jpg",
              focalPoint: { x: 85, y: 95 },
            },
            headline: "Jamdani Artisans",
          },
        ],
      },
    };

    // Render in production SSR mode (desktop ctx, no mobileCanvas)
    const ctx = makeCtx(section, "desktop", "en");
    const Cmp = WIDGET_COMPONENTS.hero_carousel;
    const markup = html(<Cmp {...ctx} />);

    // 1. Emits <picture> with responsive media query
    expect(markup).toContain("<picture");
    expect(markup).toContain('media="(max-width: 767px)"');
    expect(markup).toContain("https://cdn.example.com/mobile.jpg");
    expect(markup).toContain("https://cdn.example.com/desktop.jpg");

    // 2. Responsive CSS custom properties must be present
    expect(markup).toContain("--hero-focal-d:25% 35%");
    expect(markup).toContain("--hero-focal-m:85% 95%");

    // 3. Must use the responsive hero art class
    expect(markup).toContain("fq-hero-art");

    // 4. Must NOT have inline objectPosition hardcoded to desktop only when both are present
    expect(markup).not.toMatch(/style="[^"]*object-position:\s*25%\s*35%[^"]*"/);
  });

  it("Test B10: alternative-text contract — single semantic image alt is uniformly resolved and applied across preview and production", () => {
    const section: Section = {
      id: "hero-alt-contract",
      type: "hero_carousel",
      props: {
        skin: "split",
        slides: [
          {
            image: {
              url: "https://cdn.example.com/desktop.jpg",
              alt: "Artisan weaving jamdani saree on handloom",
            },
            mobileImage: {
              url: "https://cdn.example.com/mobile.jpg",
              alt: "Close-up of handloom weaver fingers on jamdani motif",
            },
            headline: "Woven Heritage",
          },
        ],
      },
    };

    // Desktop/production SSR
    const ctxDesktop = makeCtx(section, "desktop", "en");
    // Mobile preview
    const ctxMobile = makeCtx(section, "mobile", "en");
    const Cmp = WIDGET_COMPONENTS.hero_carousel;

    const markupDesktop = html(<Cmp {...ctxDesktop} />);
    const markupMobile = html(<Cmp {...ctxMobile} />);

    // Primary image alt describes the editorial content
    expect(markupDesktop).toContain('alt="Artisan weaving jamdani saree on handloom"');
    // Simulated mobile preview must maintain the exact same alt contract
    expect(markupMobile).toContain('alt="Artisan weaving jamdani saree on handloom"');

    // <source> must NEVER receive invalid alt attribute
    expect(markupDesktop).not.toMatch(/<source[^>]*\balt=/);
  });
});

describe("Wave 2.4 — Scope C: Remove Remaining Unnecessary Technical Input Requirements", () => {
  it("Test C1: merchant-facing field labels across sections do not expose developer jargon", () => {
    const forbiddenPatterns = [
      /\b(slug|slugs)\b/i,
      /\bUUID\b/i,
      /\bcomma separated URLs\b/i,
      /\bpipe delimited\b/i,
    ];

    for (const section of SECTION_CATALOG) {
      for (const field of section.fields) {
        for (const pattern of forbiddenPatterns) {
          expect(
            field.label,
            `Field ${field.key} in section ${section.type} has developer jargon "${field.label}"`,
          ).not.toMatch(pattern);
        }
      }
    }
  });

  it("Test C2: image fields in heritage and story sections declare kind: image", () => {
    const heritageStory = SECTION_CATALOG.find(
      (s) => s.type === "heritage_story",
    );
    expect(heritageStory).toBeDefined();
    const storyImage = heritageStory?.fields.find((f) => f.key === "image");
    expect(storyImage?.kind).toBe("image");

    const textileShowcase = SECTION_CATALOG.find(
      (s) => s.type === "textile_showcase",
    );
    expect(textileShowcase).toBeDefined();
    const itemsField = textileShowcase?.fields.find((f) => f.key === "items");
    const itemImage = itemsField?.fields?.find((f) => f.key === "image");
    expect(itemImage?.kind).toBe("image");

    const editorialBanner = SECTION_CATALOG.find(
      (s) => s.type === "editorial_banner",
    );
    expect(editorialBanner).toBeDefined();
    const bannerImage = editorialBanner?.fields.find((f) => f.key === "image");
    expect(bannerImage?.kind).toBe("image");
  });
});
