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

  it("recurses into containers instead of placeholder boxes", () => {
    const html = renderToStaticMarkup(
      createElement(StudioNodes, {
        nodes: [
          {
            id: "c1",
            el: "container",
            settings: {},
            children: [
              {
                id: "h1",
                el: "heading",
                settings: { text: "Nested", level: 2 },
              },
            ],
          },
        ],
      }),
    );
    expect(html).toContain("Nested");
    expect(html).not.toContain("container");
  });

  it("hides responsive-hidden nodes", () => {
    const html = renderToStaticMarkup(
      createElement(StudioNodes, {
        nodes: [
          {
            id: "h1",
            el: "heading",
            settings: { text: "Gone" },
            hiddenOn: ["desktop"],
          },
        ],
      }),
    );
    expect(html).not.toContain("Gone");
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
