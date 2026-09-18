import { describe, expect, it } from "vitest";
import {
  type Attachment,
  checkExternalUrl,
  dimensionLabel,
  filterAttachments,
  filtersActive,
  formatBytes,
  isAllowedMimeType,
  isSvgSafe,
  mediaKind,
  missingAltCount,
  monthLabel,
  monthOptions,
  neighbourAttachment,
  sanitiseSvg,
  searchAttachments,
  selectRange,
  slugFileName,
  titleFromFileName,
  toggleSelected,
  typeCounts,
  uniqueFileName,
  validateMagicBytes,
  validateUpload,
} from "./library";

function att(over: Partial<Attachment> = {}): Attachment {
  return {
    id: "a1",
    fileName: "hero.png",
    title: "Hero",
    altText: "A hero",
    caption: "",
    description: "",
    storagePath: "m/hero.png",
    url: "/api/public/media/m/hero.png",
    contentType: "image/png",
    sizeBytes: 2048,
    width: 1200,
    height: 800,
    sanitised: false,
    createdAt: "2026-03-04T10:00:00.000Z",
    ...over,
  };
}

describe("media kinds", () => {
  it("classifies each family", () => {
    expect(mediaKind("image/png")).toBe("image");
    expect(mediaKind("image/svg+xml")).toBe("vector");
    expect(mediaKind("video/mp4")).toBe("video");
    expect(mediaKind("audio/mpeg")).toBe("audio");
    expect(mediaKind("application/pdf")).toBe("document");
    expect(mediaKind("application/zip")).toBe("other");
  });
});

describe("upload validation", () => {
  it("accepts an allowed image", () => {
    expect(
      validateUpload({ name: "a.png", type: "image/png", size: 100 }).ok,
    ).toBe(true);
  });
  it("rejects a bad type, empty and oversize file", () => {
    expect(
      validateUpload({ name: "a.zip", type: "application/zip", size: 10 }),
    ).toMatchObject({
      reason: "bad_type",
    });
    expect(
      validateUpload({ name: "a.png", type: "image/png", size: 0 }),
    ).toMatchObject({ reason: "empty" });
    expect(
      validateUpload({ name: "a.png", type: "image/png", size: 99 }, 50),
    ).toMatchObject({
      reason: "too_large",
    });
  });
});

describe("naming", () => {
  it("slugs a messy filename", () => {
    expect(slugFileName("My Photo (Final).JPG")).toBe("my-photo-final.jpg");
  });
  it("suffixes duplicates", () => {
    expect(uniqueFileName("logo.png", ["logo.png"])).toBe("logo-1.png");
    expect(uniqueFileName("logo.png", ["logo.png", "logo-1.png"])).toBe(
      "logo-2.png",
    );
    expect(uniqueFileName("logo.png", [])).toBe("logo.png");
  });
  it("derives a readable title", () => {
    expect(titleFromFileName("summer_sale-banner.webp")).toBe(
      "Summer sale banner",
    );
  });
});

describe("svg sanitiser", () => {
  it("keeps a clean svg untouched", () => {
    const clean = '<svg viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>';
    expect(isSvgSafe(clean)).toBe(true);
  });
  it("strips scripts, handlers and javascript hrefs", () => {
    const dirty =
      '<svg onload="alert(1)"><script>alert(2)</script><a xlink:href="javascript:alert(3)">x</a></svg>';
    const out = sanitiseSvg(dirty);
    expect(out.changed).toBe(true);
    expect(out.svg).not.toContain("script");
    expect(out.svg).not.toContain("onload");
    expect(out.svg).not.toContain("javascript:");
  });
});

describe("filtering", () => {
  const items = [
    att({
      id: "1",
      fileName: "hero.png",
      createdAt: "2026-03-04T00:00:00.000Z",
    }),
    att({
      id: "2",
      fileName: "logo.svg",
      contentType: "image/svg+xml",
      createdAt: "2026-02-01T00:00:00.000Z",
      altText: "",
    }),
    att({
      id: "3",
      fileName: "guide.pdf",
      contentType: "application/pdf",
      createdAt: "2026-02-11T00:00:00.000Z",
    }),
  ];

  it("searches across every text field", () => {
    expect(searchAttachments(items, "logo").map((i) => i.id)).toEqual(["2"]);
    expect(searchAttachments(items, "").length).toBe(3);
  });

  it("filters by type and month", () => {
    expect(
      filterAttachments(items, {
        query: "",
        type: "document",
        month: "all",
      }).map((i) => i.id),
    ).toEqual(["3"]);
    expect(
      filterAttachments(items, { query: "", type: "all", month: "2026-02" })
        .length,
    ).toBe(2);
  });

  it("reports active filters and counts", () => {
    expect(filtersActive({ query: "", type: "all", month: "all" })).toBe(false);
    expect(filtersActive({ query: "x", type: "all", month: "all" })).toBe(true);
    expect(typeCounts(items)).toMatchObject({
      all: 3,
      image: 1,
      vector: 1,
      document: 1,
    });
  });

  it("lists months newest first", () => {
    expect(monthOptions(items).map((m) => m.key)).toEqual([
      "2026-03",
      "2026-02",
    ]);
    expect(monthLabel("2026-02")).toBe("February 2026");
  });

  it("counts images missing alt text only", () => {
    expect(missingAltCount(items)).toBe(0);
    expect(missingAltCount([att({ altText: "" })])).toBe(1);
  });
});

describe("selection", () => {
  const items = [att({ id: "1" }), att({ id: "2" }), att({ id: "3" })];
  it("toggles", () => {
    expect(toggleSelected(["1"], "2")).toEqual(["1", "2"]);
    expect(toggleSelected(["1", "2"], "1")).toEqual(["2"]);
  });
  it("shift-selects a range", () => {
    expect(selectRange(items, "1", "3", [])).toEqual(["1", "2", "3"]);
  });
  it("walks neighbours", () => {
    expect(neighbourAttachment(items, "2", 1)?.id).toBe("3");
    expect(neighbourAttachment(items, "3", 1)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats bytes and dimensions", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(dimensionLabel({ width: 100, height: 50 })).toBe("100 × 50");
    expect(dimensionLabel({ width: null, height: null })).toBeNull();
  });
  it("validates external urls", () => {
    expect(checkExternalUrl("https://a.test/x.png").ok).toBe(true);
    expect(checkExternalUrl("http://a.test/x.png").ok).toBe(false);
    expect(checkExternalUrl("nonsense").ok).toBe(false);
  });
});

describe("validateMagicBytes with strictness", () => {
  const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
  const garbageBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]);

  it("forensic: blocks all uploads", () => {
    const r = validateMagicBytes(jpegBytes, "image/jpeg", "forensic");
    expect(r.ok).toBe(false);
    expect(r).toHaveProperty("reason", "uploads_disabled");
  });

  it("standard: passes valid JPEG", () => {
    const r = validateMagicBytes(jpegBytes, "image/jpeg", "standard");
    expect(r.ok).toBe(true);
  });

  it("standard: catches magic mismatch", () => {
    const r = validateMagicBytes(garbageBytes, "image/jpeg", "standard");
    expect(r.ok).toBe(false);
    expect(r).toHaveProperty("reason", "magic_mismatch");
  });

  it("enhanced: validates container format size headers", () => {
    // MP4 with reasonable declared size (0x0000000C = 12 bytes, actual 12 bytes)
    const mp4Header = new Uint8Array([
      0x00, 0x00, 0x00, 0x0c, // declared size = 12 (matches actual)
      0x66, 0x74, 0x79, 0x70, // ftyp
      0x69, 0x73, 0x6f, 0x6d,
    ]);
    const r1 = validateMagicBytes(mp4Header, "video/mp4", "enhanced");
    expect(r1.ok).toBe(true);

    // MP4 with wildly wrong declared size (0x7FFFFFFF = ~2GB, actual 12 bytes)
    const mp4Bad = new Uint8Array([
      0x7f, 0xff, 0xff, 0xff, // declared size = ~2GB, actual = 12
      0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6f, 0x6d,
    ]);
    const r2 = validateMagicBytes(mp4Bad, "video/mp4", "enhanced");
    expect(r2.ok).toBe(false);
    expect(r2).toHaveProperty("reason", "size_header_mismatch");
  });

  it("strict: rejects unknown MIME types", () => {
    const r = validateMagicBytes(garbageBytes, "application/x-unknown-type", "strict");
    expect(r.ok).toBe(false);
    expect(r).toHaveProperty("reason", "mime_not_allowed");
  });

  it("strict: accepts known MIME types", () => {
    const r = validateMagicBytes(jpegBytes, "image/jpeg", "strict");
    expect(r.ok).toBe(true);
  });

  it("default strictness is standard", () => {
    const r = validateMagicBytes(jpegBytes, "image/jpeg");
    expect(r.ok).toBe(true);
  });
});

describe("isAllowedMimeType", () => {
  it("matches exact mime types", () => {
    expect(isAllowedMimeType("image/jpeg", ["image/jpeg"])).toBe(true);
    expect(isAllowedMimeType("image/png", ["image/jpeg"])).toBe(false);
  });

  it("matches wildcard patterns", () => {
    expect(isAllowedMimeType("image/png", ["image/*"])).toBe(true);
    expect(isAllowedMimeType("video/mp4", ["video/*"])).toBe(true);
    expect(isAllowedMimeType("application/pdf", ["image/*"])).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isAllowedMimeType("Image/JPEG", ["image/jpeg"])).toBe(true);
    expect(isAllowedMimeType("IMAGE/*", ["image/*"])).toBe(true);
  });
});
