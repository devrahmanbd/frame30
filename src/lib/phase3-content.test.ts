import { describe, expect, it } from "vitest";
import {
  MEDIA_URL_PREFIX,
  altKey,
  isMediaObjectPath,
  mediaUrl,
  safeFileName,
  sizesAttr,
  sizesKey,
  validateMediaUrl,
} from "./media";
import { catalogEntry, parseAst, type Section } from "./builder-ast";
import { translationCoverage } from "./translation-coverage";
import { exportBlocks, importBlocks, sanitiseBlockNodes, type BlockEnvelope } from "./saved-blocks";

const MERCHANT = "11111111-2222-3333-4444-555555555555";

describe("media paths", () => {
  it("accepts only <merchant>/<file> object paths", () => {
    expect(isMediaObjectPath(`${MERCHANT}/hero-abc.jpg`)).toBe(true);
    expect(isMediaObjectPath(`${MERCHANT}/../secrets.jpg`)).toBe(false);
    expect(isMediaObjectPath(`${MERCHANT}/nested/hero.jpg`)).toBe(false);
    expect(isMediaObjectPath("hero.jpg")).toBe(false);
  });

  it("builds and validates its own URLs", () => {
    const url = mediaUrl(`${MERCHANT}/hero.jpg`);
    expect(url.startsWith(MEDIA_URL_PREFIX)).toBe(true);
    expect(validateMediaUrl(url)).toEqual({ ok: true, url });
  });

  it("refuses a media URL with a tampered path", () => {
    expect(validateMediaUrl(`${MEDIA_URL_PREFIX}${MERCHANT}/..%2Fetc`).ok).toBe(false);
  });

  it("refuses off-list remote hosts and allows listed ones", () => {
    expect(validateMediaUrl("https://evil.example/x.jpg", ["cdn.example"]).ok).toBe(false);
    expect(validateMediaUrl("https://cdn.example/x.jpg", ["cdn.example"]).ok).toBe(true);
    expect(validateMediaUrl("javascript:alert(1)", ["cdn.example"]).ok).toBe(false);
  });

  it("collapses upload names to safe keys", () => {
    const name = safeFileName("ঈদ Hero!! photo.PNG", "image/png");
    expect(name).toMatch(/^[a-z0-9-]*-[a-z0-9]+\.png$/);
    expect(isMediaObjectPath(`${MERCHANT}/${name}`)).toBe(true);
  });

  it("maps sizes presets to a responsive attribute", () => {
    expect(sizesAttr("full")).toBe("100vw");
    expect(sizesAttr("nonsense")).toBe(sizesAttr("full"));
    expect(sizesAttr(undefined)).toBe(sizesAttr("full"));
  });
});

describe("image props in the catalog", () => {
  it("promotes picture URLs to image fields with alt + sizes siblings", () => {
    const entry = catalogEntry("editorial_hero");
    const image = entry?.fields.find((field) => field.key === "imageUrl");
    expect(image?.kind).toBe("image");
    expect(entry?.fields.find((f) => f.key === altKey("imageUrl"))?.kind).toBe("bitext");
    expect(entry?.defaults[sizesKey("imageUrl")]).toBe("full");
  });

  it("keeps alt and sizes through the sanitiser", () => {
    const ast = parseAst({
      header: [],
      main: [
        {
          id: "n1",
          type: "editorial_hero",
          props: {
            imageUrl: "https://cdn.example/a.jpg",
            [altKey("imageUrl")]: "Model in a jamdani sari",
            [`${altKey("imageUrl")}_bn`]: "জামদানি শাড়িতে মডেল",
            [sizesKey("imageUrl")]: "half",
          },
        },
      ],
      footer: [],
    });
    const node = ast.main[0]!;
    expect(node.props[altKey("imageUrl")]).toBe("Model in a jamdani sari");
    expect(node.props[`${altKey("imageUrl")}_bn`]).toBe("জামদানি শাড়িতে মডেল");
    expect(node.props[sizesKey("imageUrl")]).toBe("half");
  });
});

function template(nodes: Section[]) {
  return { header: [], main: nodes, footer: [] };
}

describe("translation coverage", () => {
  const heroWith = (props: Record<string, string>): Section =>
    parseAst(template([{ id: "h1", type: "editorial_hero", props }])).main[0]!;

  it("counts a fully translated field as ok", () => {
    const report = translationCoverage({
      index: template([heroWith({ heading: "Winter drop", heading_bn: "শীতের কালেকশন" })]),
    });
    expect(report.total).toBeGreaterThan(0);
    expect(report.byTemplate["index"]?.ok).toBeGreaterThan(0);
  });

  it("flags a missing বাংলা side as a fallback, not as ok", () => {
    const report = translationCoverage({
      index: template([heroWith({ heading: "Winter drop" })]),
    });
    expect(report.fallback).toBeGreaterThanOrEqual(1);
    expect(report.percent).toBeLessThan(100);
    expect(report.worst.some((ref) => ref.fieldKey === "heading" && ref.state === "fallback")).toBe(true);
  });

  it("flags বাংলা-only copy as empty English and sorts it first", () => {
    const report = translationCoverage({
      index: template([heroWith({ heading: "", heading_bn: "শীতের কালেকশন", body: "Some copy" })]),
    });
    expect(report.worst[0]?.state).toBe("empty");
  });

  it("treats a theme with no bilingual copy as complete", () => {
    const report = translationCoverage({});
    expect(report.total).toBe(0);
    expect(report.percent).toBe(100);
  });
});

describe("block portability", () => {
  const nodes = sanitiseBlockNodes([
    { id: "b1", type: "editorial_hero", props: { heading: "Eid edit", heading_bn: "ঈদ এডিট" } },
  ]);

  it("round-trips a library losslessly", () => {
    const json = exportBlocks("theme-1", [
      { id: "1", name: "Eid hero", createdAt: new Date().toISOString(), nodes },
    ]);
    const envelope = JSON.parse(json) as BlockEnvelope;
    expect(envelope.v).toBe(1);
    expect(envelope.blocks[0]?.name).toBe("Eid hero");
    expect(envelope.blocks[0]?.nodes[0]?.props["heading_bn"]).toBe("ঈদ এডিট");
  });

  it("rejects junk and oversized payloads without throwing", () => {
    expect(importBlocks("theme-2", "not json").added).toBe(0);
    expect(importBlocks("theme-2", "x".repeat(600 * 1024)).added).toBe(0);
    expect(importBlocks(null, exportBlocks(null, [])).added).toBe(0);
  });

  it("drops unknown widgets rather than trusting an imported file", () => {
    const json = JSON.stringify({
      v: 1,
      blocks: [{ name: "evil", nodes: [{ id: "x", type: "definitely_not_a_widget", props: {} }] }],
    });
    const parsed = JSON.parse(json) as BlockEnvelope;
    const cleaned = sanitiseBlockNodes(parsed.blocks[0]?.nodes);
    expect(cleaned.every((node) => String(node.type) !== "definitely_not_a_widget")).toBe(true);
  });
});
