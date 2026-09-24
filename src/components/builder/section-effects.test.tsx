/**
 * Task 2 — section style panel effect toggles (RED first).
 *
 * The style panel (SectionInspector, driven by the SECTION_CATALOG field
 * declarations) must expose `atmosphere` on hero-family sections and
 * `surface` on editorial banners, writing the exact prop keys/values the
 * theme renderers read. Panel output must round-trip through the
 * section-props pipeline (parseAst → resolveProps → advancedAttrs /
 * sectionStyle) unchanged — the same mechanism advPadY/bg ride.
 */
import { describe, expect, it } from "vitest";
import {
  catalogEntry,
  parseAst,
  resolveProps,
  sectionStyle,
  type SectionType,
} from "@/lib/builder-ast";
import { advancedAttrs } from "@/lib/builder-advanced";

function styleField(type: SectionType, key: string) {
  return catalogEntry(type)?.fields.find((f) => f.key === key);
}

describe("section style panel effect toggles", () => {
  it("hero exposes an atmosphere style control (wash | none)", () => {
    const field = styleField("hero", "atmosphere");
    expect(field?.kind).toBe("select");
    expect(field?.panel).toBe("style");
    expect(field?.options?.map((o) => o.value).sort()).toEqual([
      "none",
      "wash",
    ]);
  });

  it("hero_carousel exposes the same atmosphere control", () => {
    const field = styleField("hero_carousel", "atmosphere");
    expect(field?.kind).toBe("select");
    expect(field?.panel).toBe("style");
    expect(field?.options?.map((o) => o.value).sort()).toEqual([
      "none",
      "wash",
    ]);
  });

  it("editorial_banner exposes a surface style control (glass | card)", () => {
    const field = styleField("editorial_banner", "surface");
    expect(field?.kind).toBe("select");
    expect(field?.panel).toBe("style");
    expect(field?.options?.map((o) => o.value).sort()).toEqual([
      "card",
      "glass",
    ]);
  });

  it("scopes the controls: hero has no surface, banner has no atmosphere", () => {
    expect(styleField("hero", "surface")).toBeUndefined();
    expect(styleField("hero_carousel", "surface")).toBeUndefined();
    expect(styleField("editorial_banner", "atmosphere")).toBeUndefined();
  });

  it("panel-written atmosphere round-trips through parseAst + resolveProps unchanged", () => {
    const ast = parseAst({
      main: [
        {
          id: "h1",
          type: "hero",
          props: {
            heading: "Festive drop",
            atmosphere: "wash",
            bg: "surface",
          },
        },
      ],
    });
    const section = ast.main[0]!;
    expect(section.props["atmosphere"]).toBe("wash");
    // Companions ride the same pipeline untouched.
    expect(section.props["bg"]).toBe("surface");
    expect(section.props["heading"]).toBe("Festive drop");
    const resolved = resolveProps(section, "mobile");
    expect(resolved["atmosphere"]).toBe("wash");
    expect(sectionStyle(resolved).className).toBe(
      sectionStyle({ bg: "surface" }).className,
    );
  });

  it("panel-written surface=glass round-trips on editorial_banner", () => {
    const ast = parseAst({
      main: [
        {
          id: "b1",
          type: "editorial_banner",
          props: { headline: "Lookbook", surface: "glass" },
        },
      ],
    });
    const section = ast.main[0]!;
    expect(section.props["surface"]).toBe("glass");
    expect(resolveProps(section, "mobile")["surface"]).toBe("glass");
  });

  it("panel-written advanced companions still serialize alongside the new keys", () => {
    // In-memory panel output bag (as SectionInspector onChange produces it):
    // the serializers must handle the new keys without mangling the old ones.
    const bag = { atmosphere: "wash", surface: "glass", advPadY: 64 };
    expect(advancedAttrs(bag).style["paddingBlock"]).toBe("64px");
    expect(
      resolveProps({ id: "x", type: "hero", props: bag }, "mobile"),
    ).toEqual(
      expect.objectContaining({ atmosphere: "wash", surface: "glass" }),
    );
  });

  it("rejects off-vocabulary effect values back to the section default", () => {
    const ast = parseAst({
      main: [
        { id: "h9", type: "hero", props: { atmosphere: "explode" } },
        { id: "b9", type: "editorial_banner", props: { surface: "neon" } },
      ],
    });
    expect(ast.main[0]!.props["atmosphere"]).toBe("wash");
    expect(ast.main[1]!.props["surface"]).toBe("card");
  });
});
