/**
 * Phase 7 — runtime fail-safes at the render layer.
 *
 * An empty rail leaves no hole, a missing image still reserves its ratio box,
 * and a single throwing widget in any blueprint is contained to its own node
 * while every sibling on the page keeps rendering.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Rail } from "./primitives/Rail";
import { MediaFrame } from "./primitives/MediaFrame";
import { WidgetBoundary } from "./WidgetBoundary";
import { SHIPPED_BLUEPRINTS } from "@/lib/theme-blueprints";
import { flattenAst, parseAst } from "@/lib/builder-ast";

const markup = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("Phase 7 — empty and missing states", () => {
  it("an empty rail self-hides instead of leaving controls over a void", () => {
    expect(markup(<Rail label="Trending">{[]}</Rail>)).toBe("");
  });

  it("a populated rail still renders its items and controls", () => {
    const html = markup(<Rail label="Trending">{[<span key="a">item</span>]}</Rail>);
    expect(html).toContain("item");
    expect(html).toContain('aria-label="Scroll right"');
  });

  it("a missing image reserves the same ratio box as a present one", () => {
    const withImage = markup(<MediaFrame src="/a.jpg" alt="Kurta" ratio="portrait" />);
    const without = markup(<MediaFrame src={null} alt="Kurta" ratio="portrait" />);
    expect(withImage).toContain("aspect-[3/4]");
    expect(without).toContain("aspect-[3/4]");
    expect(without).not.toContain("<img");
  });
});

describe("Phase 7 — one bad widget never takes a page down", () => {
  /** Render a blueprint page where exactly one node's boundary has failed. */
  function pageWithOneFailure(types: string[], failAt: number) {
    return markup(
      <>
        {types.map((type, index) => {
          if (index === failAt) {
            const failed = new WidgetBoundary({ type, children: null });
            failed.state = { failed: true, message: "boom" };
            return <div key={index}>{failed.render() as React.ReactElement}</div>;
          }
          return (
            <WidgetBoundary key={index} type={type}>
              <p data-ok={type}>{type}</p>
            </WidgetBoundary>
          );
        })}
      </>,
    );
  }

  for (const preset of SHIPPED_BLUEPRINTS) {
    it(`${preset.key}: the surrounding template keeps rendering`, () => {
      const index = parseAst((preset.templates as Record<string, unknown>)["index"]);
      const types = flattenAst(index).map((section) => section.type);
      expect(types.length).toBeGreaterThan(2);

      const html = pageWithOneFailure(types, 1);
      expect(html).toContain(`data-widget-failed="${types[1]}"`);
      for (const [i, type] of types.entries()) {
        if (i === 1) continue;
        expect(html).toContain(`data-ok="${type}"`);
      }
    });
  }
});
