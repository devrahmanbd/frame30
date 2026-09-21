/**
 * Storefront Studio tree (homepage program): builder-authored page nodes
 * render server-side with the same components as the canvas.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioNodes } from "./StudioNodes";

describe("StudioNodes", () => {
  it("renders heading and text nodes to static markup", () => {
    const html = renderToStaticMarkup(
      createElement(StudioNodes, {
        nodes: [
          { id: "h1", el: "heading", settings: { text: "Hello", level: 2 } },
          { id: "t1", el: "text", settings: { text: "World" } },
        ],
      }),
    );
    expect(html).toContain("Hello");
    expect(html).toContain("World");
  });

  it("renders repeater faq items from node settings", () => {
    const html = renderToStaticMarkup(
      createElement(StudioNodes, {
        nodes: [
          {
            id: "f1",
            el: "faq",
            settings: {
              heading: "FAQ",
              items: [{ question: "Q?", answer: "A!" }],
            },
          },
        ],
      }),
    );
    expect(html).toContain("Q?");
    expect(html).toContain("A!");
  });

  it("renders heritage widgets (not the export fallback)", () => {
    const html = renderToStaticMarkup(
      createElement(StudioNodes, {
        nodes: [
          {
            id: "m1",
            el: "marquee_strip",
            settings: { items: [{ text: "Sale" }] },
          },
        ],
      }),
    );
    expect(html).toContain("Sale");
  });
});
