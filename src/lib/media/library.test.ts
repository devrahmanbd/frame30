import { describe, expect, it } from "vitest";
import {
  type Attachment,
  checkExternalUrl,
  dimensionLabel,
  filterAttachments,
  filtersActive,
  formatBytes,
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
    expect(validateUpload({ name: "a.png", type: "image/png", size: 100 }).ok).toBe(true);
  });
  it("rejects a bad type, empty and oversize file", () => {
    expect(validateUpload({ name: "a.zip", type: "application/zip", size: 10 })).toMatchObject({
      reason: "bad_type",
    });
    expect(validateUpload({ name: "a.png", type: "image/png", size: 0 })).toMatchObject({ reason: "empty" });
    expect(validateUpload({ name: "a.png", type: "image/png", size: 99 }, 50)).toMatchObject({
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
    expect(uniqueFileName("logo.png", ["logo.png", "logo-1.png"])).toBe("logo-2.png");
    expect(uniqueFileName("logo.png", [])).toBe("logo.png");
  });
  it("derives a readable title", () => {
    expect(titleFromFileName("summer_sale-banner.webp")).toBe("Summer sale banner");
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
    att({ id: "1", fileName: "hero.png", createdAt: "2026-03-04T00:00:00.000Z" }),
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
    expect(filterAttachments(items, { query: "", type: "document", month: "all" }).map((i) => i.id)).toEqual([
      "3",
    ]);
    expect(filterAttachments(items, { query: "", type: "all", month: "2026-02" }).length).toBe(2);
  });

  it("reports active filters and counts", () => {
    expect(filtersActive({ query: "", type: "all", month: "all" })).toBe(false);
    expect(filtersActive({ query: "x", type: "all", month: "all" })).toBe(true);
    expect(typeCounts(items)).toMatchObject({ all: 3, image: 1, vector: 1, document: 1 });
  });

  it("lists months newest first", () => {
    expect(monthOptions(items).map((m) => m.key)).toEqual(["2026-03", "2026-02"]);
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
