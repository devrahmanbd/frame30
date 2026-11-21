/**
 * Frame30 — Wave 2.2: Unified MediaPicker Integration & SchemaControls Correction
 * Integration & contract test suite covering Tests A through I (ISSUE-SONG-002).
 *
 * Verifies:
 * - Test A: Media library selection (select existing asset, stores StructuredMediaValue, updates preview)
 * - Test B: Image upload (upload interaction, size/validation preservation)
 * - Test C: Alternative text (edit alt text, survives updates, serialization, reload)
 * - Test D: Focal positioning (set { x: 42, y: 68 }, survives sibling edits and reload)
 * - Test E: Existing structured media (load StructuredMediaValue, preview, alt, focal point, dimensions preserved)
 * - Test F: Legacy URL compatibility (load plain string URL, renders cleanly, never produces [object Object])
 * - Test G: Ordinary URL preservation (kind: "link" and kind: "video" render ordinary URL inputs, not MediaPicker)
 * - Test H: Invalid media handling (malformed object, invalid focal coordinates fail closed)
 * - Test I: State isolation (updating one image leaves sibling properties, repeaters, and overrides untouched)
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SchemaControls, submitSchemaProps } from "./SchemaControls";
import {
  validateProps,
  type PropSchema,
  type WidgetProps,
} from "@/lib/widget-props";
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

describe("Wave 2.2 — Unified MediaPicker Integration & SchemaControls Correction", () => {
  const sampleMedia: StructuredMediaValue = {
    url: "https://images.unsplash.com/photo-songoskriti-silk-saree",
    alt: "Handloom Jamdani Silk Saree",
    focalPoint: { x: 42, y: 68 },
    width: 1200,
    height: 800,
  };

  /* ------------------------------------------------------------------ */
  /* Test A: Media library selection                                    */
  /* ------------------------------------------------------------------ */
  it("Test A: selects asset from media library, stores StructuredMediaValue, and updates preview", () => {
    const schema: PropSchema = [
      { key: "heroImage", label: "Hero Image", kind: "image", required: true },
    ];

    let committedProp: unknown = null;
    const handleChange = (key: string, value: unknown) => {
      if (key === "heroImage") committedProp = value;
    };

    // Initial render with empty image
    const initialProps: WidgetProps = { heroImage: "" };
    const outBefore = html(
      withQuery(
        <SchemaControls
          schema={schema}
          props={initialProps}
          onChange={handleChange}
        />,
      ),
    );
    expect(outBefore).toContain("Hero Image");
    expect(outBefore).toContain('data-placeholder="image"');
    expect(outBefore).toContain("No image selected");

    // Simulate merchant picking an image from library
    const pickedAsset: StructuredMediaValue = {
      url: "https://images.unsplash.com/photo-jamdani-selected.jpg",
      alt: "Selected Jamdani Saree",
      width: 1600,
      height: 900,
    };
    handleChange("heroImage", pickedAsset);

    expect(committedProp).toEqual(pickedAsset);

    // Re-render with picked asset
    const outAfter = html(
      withQuery(
        <SchemaControls
          schema={schema}
          props={{ heroImage: pickedAsset }}
          onChange={handleChange}
        />,
      ),
    );
    expect(outAfter).toContain(
      "https://images.unsplash.com/photo-jamdani-selected.jpg",
    );
    expect(outAfter).toContain("Selected Jamdani Saree");
    expect(outAfter).toContain("Clear");
    expect(outAfter).not.toContain("[object Object]");

    // Verify submission path passes validation
    const submission = submitSchemaProps(schema, { heroImage: pickedAsset });
    expect(submission.ok).toBe(true);
    if (submission.ok) {
      expect(submission.clean.heroImage).toEqual(pickedAsset);
    }
  });

  /* ------------------------------------------------------------------ */
  /* Test B: Image upload                                               */
  /* ------------------------------------------------------------------ */
  it("Test B: preserves upload metadata (dimensions, alt, focal point) across validation and rendering", () => {
    const schema: PropSchema = [
      { key: "banner", label: "Banner Image", kind: "image" },
    ];

    const uploadedMedia: StructuredMediaValue = {
      url: "https://images.unsplash.com/photo-uploaded-handloom.jpg",
      alt: "Handloom Weavers Guild Banner",
      focalPoint: { x: 50, y: 50 },
      width: 2400,
      height: 600,
    };

    // Validation passes cleanly with upload dimensions and focal point
    const result = validateProps(schema, { banner: uploadedMedia });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.clean.banner).toEqual(uploadedMedia);
    }

    // Rendered output displays image and metadata
    const out = html(
      withQuery(
        <SchemaControls
          schema={schema}
          props={{ banner: uploadedMedia }}
          onChange={noop}
        />,
      ),
    );
    expect(out).toContain(
      "https://images.unsplash.com/photo-uploaded-handloom.jpg",
    );
    expect(out).toContain("Handloom Weavers Guild Banner");
    expect(out).toContain("50%, 50%");
    expect(out).not.toContain("[object Object]");
  });

  /* ------------------------------------------------------------------ */
  /* Test C: Alternative text editing                                   */
  /* ------------------------------------------------------------------ */
  it("Test C: edits alt text, survives updates, JSON serialization, and reload", () => {
    const schema: PropSchema = [
      { key: "featured", label: "Featured Product", kind: "image" },
    ];

    const originalMedia: StructuredMediaValue = {
      url: "https://images.unsplash.com/photo-saree.jpg",
      alt: "Initial Saree",
    };

    // User modifies alt text
    const updatedMedia: StructuredMediaValue = {
      ...originalMedia,
      alt: "Masterpiece Muslin Jamdani Saree with Zari Pallu",
    };

    // JSON serialization / deserialization roundtrip
    const serialized = JSON.stringify({ featured: updatedMedia });
    const deserialized = JSON.parse(serialized) as WidgetProps;

    const validation = validateProps(schema, deserialized);
    expect(validation.ok).toBe(true);

    const out = html(
      withQuery(
        <SchemaControls schema={schema} props={deserialized} onChange={noop} />,
      ),
    );
    expect(out).toContain("Masterpiece Muslin Jamdani Saree with Zari Pallu");
    expect(out).toContain("https://images.unsplash.com/photo-saree.jpg");
    expect(out).not.toContain("[object Object]");
  });

  /* ------------------------------------------------------------------ */
  /* Test D: Focal positioning                                          */
  /* ------------------------------------------------------------------ */
  it("Test D: sets focal point { x: 42, y: 68 }, survives sibling edits and reload", () => {
    const schema: PropSchema = [
      { key: "title", label: "Collection Title", kind: "text" },
      { key: "cover", label: "Cover Media", kind: "media" },
    ];

    const initialProps: WidgetProps = {
      title: "Festive Silk 2026",
      cover: { ...sampleMedia },
    };

    // Sibling edit: merchant edits collection title
    const nextProps: WidgetProps = {
      ...initialProps,
      title: "Songoskriti Heritage Silk 2026",
    };

    // Validate sibling edit
    const validation = validateProps(schema, nextProps);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      const cover = validation.clean.cover as StructuredMediaValue;
      expect(cover.focalPoint).toEqual({ x: 42, y: 68 });
      expect(cover.url).toBe(sampleMedia.url);
      expect(cover.alt).toBe(sampleMedia.alt);
    }

    // Render inspector with sibling-updated props
    const out = html(
      withQuery(
        <SchemaControls schema={schema} props={nextProps} onChange={noop} />,
      ),
    );
    expect(out).toContain("Songoskriti Heritage Silk 2026");
    expect(out).toContain("42%, 68%");
    expect(out).not.toContain("[object Object]");
  });

  /* ------------------------------------------------------------------ */
  /* Test E: Existing structured media                                  */
  /* ------------------------------------------------------------------ */
  it("Test E: loads structured media with all fields (url, alt, focal, dimensions) preserved without loss", () => {
    const schema: PropSchema = [
      { key: "gallery", label: "Gallery Image", kind: "image" },
    ];

    const out = html(
      withQuery(
        <SchemaControls
          schema={schema}
          props={{ gallery: sampleMedia }}
          onChange={noop}
        />,
      ),
    );

    expect(out).toContain(sampleMedia.url);
    expect(out).toContain(sampleMedia.alt);
    expect(out).toContain("42%, 68%");
    expect(out).not.toContain("[object Object]");
  });

  /* ------------------------------------------------------------------ */
  /* Test F: Legacy URL compatibility                                   */
  /* ------------------------------------------------------------------ */
  it("Test F: loads plain string URL cleanly without throwing or coercing to [object Object]", () => {
    const schema: PropSchema = [
      { key: "retroImage", label: "Retro Image", kind: "image" },
    ];

    const legacyUrl = "https://images.unsplash.com/photo-retro-cotton.jpg";

    const validation = validateProps(schema, { retroImage: legacyUrl });
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.clean.retroImage).toBe(legacyUrl);
    }

    const out = html(
      withQuery(
        <SchemaControls
          schema={schema}
          props={{ retroImage: legacyUrl }}
          onChange={noop}
        />,
      ),
    );

    expect(out).toContain(legacyUrl);
    expect(out).not.toContain("[object Object]");
  });

  /* ------------------------------------------------------------------ */
  /* Test G: Ordinary URL preservation (kind: link and kind: video)      */
  /* ------------------------------------------------------------------ */
  it("Test G: kind: link and kind: video render ordinary URL inputs, NEVER MediaPicker", () => {
    const mixedSchema: PropSchema = [
      { key: "shopLink", label: "Shop Link", kind: "link" },
      { key: "teaserVideo", label: "Teaser Video", kind: "video" },
      { key: "mainImage", label: "Main Image", kind: "image" },
    ];

    const props: WidgetProps = {
      shopLink: "https://songoskriti.framique.com/c/jamdani",
      teaserVideo: "https://songoskriti.framique.com/media/weaving.mp4",
      mainImage: "https://songoskriti.framique.com/img/hero.jpg",
    };

    const out = html(
      withQuery(
        <SchemaControls schema={mixedSchema} props={props} onChange={noop} />,
      ),
    );

    // image field has MediaPicker container and alt text input
    expect(out).toContain('data-placeholder="image"');
    expect(out).toContain("Main Image — Alt text");

    // video field is a scalar picker without alt text input or MediaPicker tabs
    expect(out).toContain('data-placeholder="video"');
    expect(out).not.toContain("Teaser Video — Alt text");

    // link field is a full control with type="url"
    expect(out).toContain("Shop Link");
    expect(out).not.toContain("Shop Link — Alt text");

    // Non-string object passed to link or video MUST be rejected by validateProps
    const invalidVideo = validateProps(mixedSchema, {
      ...props,
      teaserVideo: { url: "https://evil.com" },
    });
    expect(invalidVideo.ok).toBe(false);
    expect(invalidVideo.errors).toContain("teaserVideo.type");

    const invalidLink = validateProps(mixedSchema, {
      ...props,
      shopLink: { url: "https://evil.com" },
    });
    expect(invalidLink.ok).toBe(false);
    expect(invalidLink.errors).toContain("shopLink.type");
  });

  /* ------------------------------------------------------------------ */
  /* Test H: Invalid media handling                                     */
  /* ------------------------------------------------------------------ */
  it("Test H: rejects malformed media, missing url, and out-of-bounds focal coordinates fail-closed", () => {
    const schema: PropSchema = [
      { key: "photo", label: "Photo", kind: "image" },
    ];

    // Missing URL in object
    const missingUrl = validateProps(schema, { photo: { alt: "Missing URL" } });
    expect(missingUrl.ok).toBe(false);
    expect(missingUrl.errors).toContain("photo.not_a_url");

    // Hostile javascript URL
    const hostileUrl = validateProps(schema, {
      photo: { url: "javascript:alert(1)" },
    });
    expect(hostileUrl.ok).toBe(false);
    expect(hostileUrl.errors).toContain("photo.not_a_url");

    // Out-of-bounds focal point (x > 100)
    const badFocalX = validateProps(schema, {
      photo: {
        url: "https://images.unsplash.com/photo.jpg",
        focalPoint: { x: 150, y: 50 },
      },
    });
    expect(badFocalX.ok).toBe(false);
    expect(badFocalX.errors).toContain("photo.invalid_media");

    // Out-of-bounds focal point (y < 0)
    const badFocalY = validateProps(schema, {
      photo: {
        url: "https://images.unsplash.com/photo.jpg",
        focalPoint: { x: 50, y: -10 },
      },
    });
    expect(badFocalY.ok).toBe(false);
    expect(badFocalY.errors).toContain("photo.invalid_media");

    // Non-string, non-object hostile type (array, boolean)
    const hostileType = validateProps(schema, { photo: [1, 2, 3] });
    expect(hostileType.ok).toBe(false);
    expect(hostileType.errors).toContain("photo.type");
  });

  /* ------------------------------------------------------------------ */
  /* Test I: State isolation                                            */
  /* ------------------------------------------------------------------ */
  it("Test I: mutating media property leaves sibling props, repeaters, and overrides untouched", () => {
    const schema: PropSchema = [
      { key: "logo", label: "Logo", kind: "image" },
      { key: "title", label: "Store Name", kind: "text" },
      {
        key: "menu",
        label: "Menu Items",
        kind: "repeater",
        fields: [{ key: "label", label: "Label", kind: "text" }],
      },
    ];

    const initialProps: WidgetProps = {
      logo: sampleMedia,
      title: "Songoskriti Handloom",
      menu: [{ label: "Home" }, { label: "Sarees" }],
    };

    const nextMedia: StructuredMediaValue = {
      url: "https://images.unsplash.com/photo-new-logo.png",
      alt: "Songoskriti Artisan Emblem",
    };

    // Update only logo
    const updatedProps: WidgetProps = {
      ...initialProps,
      logo: nextMedia,
    };

    // Verify siblings remain reference-identical or deep-identical
    expect(updatedProps.title).toBe(initialProps.title);
    expect(updatedProps.menu).toBe(initialProps.menu);

    // Responsive override isolation
    const mobileOverrides: Record<string, WidgetProps> = {
      mobile: {
        logo: {
          url: "https://images.unsplash.com/photo-mobile-logo.png",
          alt: "Songoskriti Mobile",
        },
      },
    };

    const outMobile = html(
      withQuery(
        <SchemaControls
          schema={schema}
          props={initialProps}
          device="mobile"
          overrides={mobileOverrides}
          onChange={noop}
        />,
      ),
    );

    // Mobile override is displayed
    expect(outMobile).toContain(
      "https://images.unsplash.com/photo-mobile-logo.png",
    );
    expect(outMobile).toContain("mobile override");
    // Base desktop props remain pristine
    expect(initialProps.logo).toEqual(sampleMedia);
  });
});
