import { describe, expect, it, vi, beforeEach } from "vitest";
import { WIDTH_LADDER } from "./image-transform";

vi.mock("./image-transform.server", () => ({
  buildImageUrl: vi.fn(async (source: string, spec: { width: number; height: number }) =>
    `/api/public/img/sig/${spec.width}x${spec.height}/${encodeURIComponent(source)}`,
  ),
}));

const { responsiveImage, responsiveImages, IMAGE_PRESETS } = await import("./image-cdn.server");

describe("responsiveImage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null for a missing source so callers can render a placeholder", async () => {
    expect(await responsiveImage(null, "card")).toBeNull();
    expect(await responsiveImage(undefined, "card")).toBeNull();
    expect(await responsiveImage("", "card")).toBeNull();
  });

  it("emits one srcset entry per preset width, ascending", async () => {
    const img = await responsiveImage("https://cdn.example.com/a.jpg", "card");
    const widths = img!.srcSet.split(", ").map((e) => Number(e.split(" ")[1]!.replace("w", "")));
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(widths).toEqual([...IMAGE_PRESETS.card.widths]);
  });

  it("only ever requests widths on the shared ladder", async () => {
    for (const preset of ["thumb", "card", "hero", "banner"] as const) {
      const img = await responsiveImage("https://cdn.example.com/a.jpg", preset);
      const widths = img!.srcSet.split(", ").map((e) => Number(e.split(" ")[1]!.replace("w", "")));
      for (const w of widths) expect(WIDTH_LADDER).toContain(w as (typeof WIDTH_LADDER)[number]);
    }
  });

  it("picks a mid-ladder fallback src that is present in the srcset", async () => {
    const img = await responsiveImage("https://cdn.example.com/a.jpg", "hero");
    expect(img!.srcSet).toContain(img!.src);
    expect(img!.width).toBeGreaterThan(IMAGE_PRESETS.hero.widths[0]!);
  });

  it("keeps banner aspect ratio in the derived height", async () => {
    const img = await responsiveImage("https://cdn.example.com/a.jpg", "banner");
    expect(img!.height).toBe(Math.round(img!.width / IMAGE_PRESETS.banner.aspect));
  });

  it("passes the preset sizes hint through unchanged", async () => {
    const img = await responsiveImage("https://cdn.example.com/a.jpg", "thumb");
    expect(img!.sizes).toBe(IMAGE_PRESETS.thumb.sizes);
  });

  it("maps a list while preserving order and tolerating gaps", async () => {
    const out = await responsiveImages(
      [{ image_url: "https://cdn.example.com/1.jpg" }, { image_url: null }, { image_url: "https://cdn.example.com/3.jpg" }],
      "card",
    );
    expect(out).toHaveLength(3);
    expect(out[0]!.image).not.toBeNull();
    expect(out[1]!.image).toBeNull();
    expect(out[2]!.image!.src).toContain("3.jpg");
  });
});
