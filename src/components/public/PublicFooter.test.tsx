/**
 * Public footer social icons — TDD: uniform Simple Icons set (opensvg.dev /
 * svgrepo.com canonical paths). The bug class is mixed styles (e.g. a lone
 * stroke-outline icon among fills), so every icon must share viewBox +
 * fill-current and carry a real brand path.
 */
import { describe, expect, it } from "vitest";
import { SOCIAL_LINKS } from "./PublicFooter";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

describe("PublicFooter social icons", () => {
  it("covers YouTube, X, Instagram and Facebook", () => {
    expect(SOCIAL_LINKS.map((l) => l.name)).toEqual([
      "YouTube",
      "X",
      "Instagram",
      "Facebook",
    ]);
  });

  it("uses one consistent fill-glyph style (no stroke outlines)", () => {
    for (const link of SOCIAL_LINKS) {
      const html = renderToStaticMarkup(createElement(() => link.icon));
      expect(html).toContain('viewBox="0 0 24 24"');
      expect(html).toContain("fill-current");
      expect(html).not.toContain("stroke-current");
      expect(html).not.toContain("<rect");
      expect(html).not.toContain("<line");
      // A real brand path, not an empty shell.
      const d = html.match(/<path d="([^"]+)"/)?.[1] ?? "";
      expect(d.length).toBeGreaterThan(100);
    }
  });
});
