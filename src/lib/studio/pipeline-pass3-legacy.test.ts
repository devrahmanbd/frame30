/**
 * Studio persistence pipeline — Pass 3: legacy preservation.
 *
 * Pins the PUBLISHED module contracts (not implementation details):
 * - `readStudioBody` / `upgradeV1` (studio/model.ts:865) — whatever the body
 *   holds (Studio v2, upgraded v1 page-builder, or nothing shaped), the v1
 *   widget settings survive the upgrade.
 * - `serializeStudioBody` / `parseStudioBody` round-trip: legacy widgets
 *   (heading / button / text / containers — every widget WITHOUT a repeater
 *   seeder) come back byte-identical, and a second serialize is stable.
 * - `pluginBlockToExtension` — legacy `plugin_block`s migrate WITHOUT data
 *   loss (key promoted, every other prop rides along, identity/chrome kept).
 * - Pre-slot documents keep no `header`/`footer` keys (byte-identical wire).
 *
 * Seeder widgets (faq / hero / trust_bar / …) INTENTIONALLY gain `items` on
 * load — that migration is lossless (scalars stay), so it is pinned as
 * preservation rather than asserted byte-identical.
 */
import { describe, expect, it } from "vitest";
import {
  defaultPageSettings,
  parseStudioBody,
  readStudioBody,
  serializeStudioBody,
  upgradeV1,
  type StudioDoc,
  type StudioNode,
} from "@/lib/studio/model";
import {
  parseBuilderBody,
  serializeBuilderBody,
  type BuilderDoc,
} from "@/lib/page-builder";
import { parseAst, pluginBlockToExtension } from "@/lib/builder-ast";
import { newWidgetNode } from "@/lib/studio/catalog";

function legacyPage(): BuilderDoc {
  return {
    sections: [
      {
        id: "s1",
        width: "boxed",
        paddingY: 40,
        paddingX: 16,
        gap: 24,
        columns: [
          {
            id: "c1",
            span: 12,
            widgets: [
              {
                id: "w1",
                type: "heading",
                settings: { text: "Hello", align: "center", size: 40 },
              },
              {
                id: "w2",
                type: "button",
                settings: { label: "Shop now", href: "/products" },
              },
              { id: "w3", type: "text", settings: { text: "Body copy" } },
            ],
          },
        ],
      },
    ],
  };
}

/** Depth-first texts of every widget node in a studio tree. */
function collectTexts(nodes: StudioNode[]): string[] {
  const out: string[] = [];
  const walk = (list: StudioNode[]) => {
    for (const node of list) {
      for (const key of ["text", "label"]) {
        const value = node.settings[key];
        if (typeof value === "string" && value) out.push(value);
      }
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

describe("pass 3 — existing v1 pages upgrade with settings intact", () => {
  it("v1 widget copy survives serialize → read → upgrade", () => {
    const body = serializeBuilderBody(legacyPage());
    expect(parseBuilderBody(body)).toEqual(legacyPage());
    const doc = readStudioBody(body, "Legacy page")!;
    expect(doc).not.toBeNull();
    const texts = collectTexts(doc.root);
    expect(texts).toContain("Hello");
    expect(texts).toContain("Shop now");
    expect(texts).toContain("Body copy");
  });

  it("upgradeV1 keeps the v1 widget settings bag (with documented remaps)", () => {
    const doc = upgradeV1(legacyPage(), "Legacy page");
    const texts = collectTexts(doc.root);
    expect(texts).toContain("Hello");
    expect(texts).toContain("Shop now");
    // Documented remaps: align → textAlign, size → fontSize (model.ts:880-887).
    const heading = doc.root[0]!.children![0]!.children!.find(
      (n) => n.settings["text"] === "Hello",
    )!;
    expect(heading.settings["textAlign"]).toBe("center");
    expect(heading.settings["fontSize"]).toBe(40);
    expect(heading.settings["text"]).toBe("Hello");
  });

  it("a Studio v2 body always wins over the v1 fallback", () => {
    const legacy = newWidgetNode("heading");
    legacy.settings["text"] = "Studio copy";
    const v2body = serializeStudioBody({
      version: 2,
      root: [legacy],
      page: defaultPageSettings("V2"),
    });
    const doc = readStudioBody(
      `${v2body}\n${serializeBuilderBody(legacyPage())}`,
    )!;
    expect(collectTexts(doc.root)).toContain("Studio copy");
    expect(collectTexts(doc.root)).not.toContain("Hello");
  });
});

describe("pass 3 — legacy widgets round-trip byte-identical", () => {
  function legacyDoc(): StudioDoc {
    const container: StudioNode = {
      id: "wrap-1",
      el: "container",
      settings: { layout: "flex", direction: "column", gap: 20 },
      children: [
        {
          id: "h-1",
          el: "heading",
          settings: { text: "Legacy headline", level: 2, textAlign: "left" },
        },
        {
          id: "b-1",
          el: "button",
          settings: {
            label: "Buy",
            href: "/products",
            variant: "primary",
            size: "md",
            textAlign: "left",
          },
        },
        {
          id: "t-1",
          el: "text",
          settings: { text: "Paragraph", fontSize: 16, textAlign: "left" },
        },
      ],
    };
    return {
      version: 2,
      root: [container],
      page: defaultPageSettings("Legacy"),
    };
  }

  it("serialize → parse preserves every legacy node and setting", () => {
    const doc = legacyDoc();
    const parsed = parseStudioBody(serializeStudioBody(doc))!;
    expect(parsed.root).toEqual(doc.root);
    expect(parsed.page).toEqual(doc.page);
    expect(JSON.stringify(parsed.root)).toBe(JSON.stringify(doc.root));
  });

  it("a second serialize is byte-stable (reload does not drift)", () => {
    const first = serializeStudioBody(legacyDoc());
    const second = serializeStudioBody(parseStudioBody(first)!);
    expect(second).toBe(first);
  });

  it("byte-identity is per-node: each legacy widget matches exactly", () => {
    const doc = legacyDoc();
    const parsed = parseStudioBody(serializeStudioBody(doc))!;
    const before = doc.root[0]!.children!;
    const after = parsed.root[0]!.children!;
    expect(after.map((n) => n.id)).toEqual(before.map((n) => n.id));
    for (const [index, node] of before.entries()) {
      expect(JSON.stringify(after[index]!.settings)).toBe(
        JSON.stringify(node.settings),
      );
    }
  });
});

describe("pass 3 — pre-slot documents keep their wire shape", () => {
  it("no header/footer keys appear for single-root docs", () => {
    const legacy = newWidgetNode("heading");
    const doc: StudioDoc = {
      version: 2,
      root: [legacy],
      page: defaultPageSettings("Pre-slot"),
    };
    const parsed = parseStudioBody(serializeStudioBody(doc))!;
    expect(parsed.header).toBeUndefined();
    expect(parsed.footer).toBeUndefined();
    expect(parsed.root).toHaveLength(1);
    expect(parsed.root[0]!.el).toBe("heading");
  });

  it("unknown studio elements are preserved, never dropped or rewritten", () => {
    const raw = `<!--fq-studio:v2${JSON.stringify({
      version: 2,
      root: [{ id: "u1", el: "future_widget", settings: { text: "hi" } }],
      page: defaultPageSettings("Unknown"),
    })}fq-studio:end-->`;
    const parsed = parseStudioBody(raw)!;
    expect(parsed.root[0]!.el).toBe("future_widget");
    expect(parsed.root[0]!.settings).toEqual({ text: "hi" });
  });

  it("unknown AST types degrade to labelled placeholders in the theme layer too", () => {
    const ast = parseAst({
      header: [],
      main: [{ id: "g1", type: "ghost_widget", props: { text: "boo" } }],
      footer: [],
    });
    expect(ast.main[0]!.invalid).toBe("unknown_widget:ghost_widget");
    expect(ast.main).toHaveLength(1);
  });
});

describe("pass 3 — legacy plugin_block migrates without data loss", () => {
  it("promotes the key and carries every other prop + identity", () => {
    const next = pluginBlockToExtension({
      id: "pb-1",
      type: "plugin_block",
      props: {
        pluginKey: "plugin:acme/reviews",
        height: 480,
        title: "Authored",
      },
    } as never)!;
    expect(next.widgetKey).toBe("plugin:acme/reviews");
    expect(next.instanceId).toBe("pb-1");
    expect(next.id).toBe("pb-1");
    expect(next.props as unknown as Record<string, unknown>).toMatchObject({
      height: 480,
      title: "Authored",
    });
    expect("pluginKey" in (next.props as Record<string, unknown>)).toBe(false);
  });

  it("a key-less legacy block is kept as an explicit missing placeholder", () => {
    const next = pluginBlockToExtension({
      id: "pb-2",
      type: "plugin_block",
      props: { pluginKey: "  ", height: 320 },
    } as never)!;
    expect(next.invalid).toBe("extension.missing_key");
    expect(next.id).toBe("pb-2");
  });

  it("non-plugin_block nodes are left alone (null, never converted)", () => {
    expect(
      pluginBlockToExtension({
        id: "h-1",
        type: "heading",
        props: { text: "Hi" },
      } as never),
    ).toBeNull();
  });
});

describe("pass 3 — seeder migrations are lossless (scalars stay, items added)", () => {
  it("faq scalars seed items on load without losing the authored pairs", () => {
    const doc: StudioDoc = {
      version: 2,
      root: [
        {
          id: "f1",
          el: "faq",
          settings: { heading: "FAQ", q1: "Q?", a1: "A!" },
        },
      ],
      page: defaultPageSettings("Seeder"),
    };
    const parsed = parseStudioBody(serializeStudioBody(doc))!;
    const settings = parsed.root[0]!.settings as Record<string, unknown>;
    expect(settings["q1"]).toBe("Q?");
    expect(settings["a1"]).toBe("A!");
    expect(settings["items"]).toEqual([{ question: "Q?", answer: "A!" }]);
  });

  it("author-edited repeater rows are never overwritten by the seeder", () => {
    const doc: StudioDoc = {
      version: 2,
      root: [
        {
          id: "f1",
          el: "faq",
          settings: {
            q1: "Old?",
            a1: "Old.",
            items: [{ question: "New?", answer: "New." }],
          },
        },
      ],
      page: defaultPageSettings("Seeder"),
    };
    const parsed = parseStudioBody(serializeStudioBody(doc))!;
    const settings = parsed.root[0]!.settings as Record<string, unknown>;
    expect(settings["items"]).toEqual([{ question: "New?", answer: "New." }]);
  });
});
