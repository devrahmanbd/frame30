import { describe, expect, it } from "vitest";
import {
  defaultPageSettings,
  parseStudioBody,
  sectionsToStudioNodes,
  serializeStudioBody,
  studioNodesToSections,
} from "./model";
import type { StudioDoc } from "./model";

function doc(): StudioDoc {
  return {
    version: 2,
    root: [
      {
        id: "c1",
        el: "container",
        settings: {},
        children: [
          { id: "b1", el: "button", settings: { label: "Click" } },
        ],
      },
    ],
    page: defaultPageSettings(),
  };
}

describe("parseStudioBody", () => {
  it("round-trips a serialized document", () => {
    const parsed = parseStudioBody(serializeStudioBody(doc()));
    expect(parsed?.root?.[0]?.children?.[0]).toMatchObject({
      el: "button",
    });
  });

  it("rescues payloads with escaped brackets instead of blanking", () => {
    const clean = serializeStudioBody(doc());
    const escaped = clean.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
    // Sanity: the escaped form really is invalid JSON on its own.
    expect(parseStudioBody(escaped)?.root?.[0]?.children?.[0]).toMatchObject(
      {
        el: "button",
      },
    );
  });

  it("returns null for garbage", () => {
    expect(parseStudioBody("<!--fq-studio:v2\nnot json\nfq-studio:end-->")).toBeNull();
    expect(parseStudioBody(null)).toBeNull();
    expect(parseStudioBody("plain markdown")).toBeNull();
  });
});

describe("sectionsToStudioNodes", () => {
  const section = (overrides = {}) => ({
    id: "old-id",
    type: "container",
    props: {},
    ...overrides,
  });

  it("maps type/props/children and regenerates ids", () => {
    const [node] = sectionsToStudioNodes([
      section({
        type: "heading",
        props: { text: "Hi" },
        children: [{ id: "c", type: "text", props: { text: "x" } }],
      }),
    ]);
    expect(node.el).toBe("heading");
    expect(node.settings).toMatchObject({ text: "Hi" });
    expect(node.id).not.toBe("old-id");
    expect(node.children?.[0]?.el).toBe("text");
    expect(node.children?.[0]?.id).not.toBe("c");
  });

  it("fans breakpoint visibility out onto device keys", () => {
    const [node] = sectionsToStudioNodes([
      section({ hidden: ["mobile", "nonsense"] }),
    ]);
    expect(node.hiddenOn).toEqual(["mobile", "mobileLandscape"]);
  });

  it("drops invalid, typeless, and non-object entries but keeps siblings", () => {
    const nodes = sectionsToStudioNodes([
      section({ type: "button", props: { label: "Keep" } }),
      section({ invalid: "bad" }),
      { id: "no-type", props: {} },
      null,
      "text",
    ]);
    expect(nodes.map((n) => n.el)).toEqual(["button"]);
  });

  it("round-trips back into sections for global-block save", () => {
    const nodes = sectionsToStudioNodes([
      {
        id: "a",
        type: "container",
        props: {},
        children: [
          { id: "b", type: "heading", props: { text: "Hi" }, hidden: ["mobile"] },
        ],
      },
    ]);
    const [section] = studioNodesToSections(nodes);
    expect(section.type).toBe("container");
    const child = section.children?.[0] as
      | { type?: unknown; props?: unknown; hidden?: unknown }
      | undefined;
    expect(child).toMatchObject({
      type: "heading",
      props: { text: "Hi" },
    });
    expect(child?.hidden).toEqual(["mobile"]);
    expect(section.id).not.toBe("a");
  });

  it("returns [] for non-arrays and truncates runaway depth", () => {
    expect(sectionsToStudioNodes(null)).toEqual([]);
    expect(sectionsToStudioNodes({})).toEqual([]);
    let deep: unknown = { id: "x", type: "container", props: {} };
    for (let i = 0; i < 20; i++)
      deep = { id: "x", type: "container", props: {}, children: [deep] };
    const [top] = sectionsToStudioNodes([deep]);
    let count = 0;
    let cursor = top;
    while (cursor?.children?.[0] && count < 30) {
      count += 1;
      cursor = cursor.children[0];
    }
    expect(top.el).toBe("container");
    expect(count).toBeLessThanOrEqual(13);
  });
});

describe("faq scalar-to-items migration", () => {
  function faqDoc(settings: Record<string, unknown>): StudioDoc {
    return {
      version: 2,
      root: [{ id: "f1", el: "faq", settings: settings as never }],
      page: defaultPageSettings(),
    };
  }

  it("seeds items from scalar q/a pairs on load", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        faqDoc({ heading: "FAQ", q1: "Q1?", a1: "A1!", q2: "", a2: "", q3: "Q3?", a3: "" }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([
      { question: "Q1?", answer: "A1!" },
      { question: "Q3?", answer: "" },
    ]);
  });

  it("preserves author-edited items instead of re-seeding", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        faqDoc({
          q1: "Old?",
          a1: "Old.",
          items: [{ question: "New?", answer: "New." }],
        }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([{ question: "New?", answer: "New." }]);
  });
});

describe("product_qna scalar-to-items migration", () => {
  function qnaDoc(settings: Record<string, unknown>): StudioDoc {
    return {
      version: 2,
      root: [{ id: "q1", el: "product_qna", settings: settings as never }],
      page: defaultPageSettings(),
    };
  }

  it("seeds items from scalar q/a pairs on load", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        qnaDoc({ heading: "Q&A", q1: "Size?", a1: "Runs large.", q2: "", a2: "" }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([{ question: "Size?", answer: "Runs large." }]);
  });

  it("preserves author-edited items instead of re-seeding", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        qnaDoc({
          q1: "Old?",
          a1: "Old.",
          items: [{ question: "New?", answer: "New." }],
        }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([{ question: "New?", answer: "New." }]);
  });
});
