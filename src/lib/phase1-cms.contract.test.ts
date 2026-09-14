/**
 * Phase 1 exit gate — Classic-Editor writing surface.
 *
 * The gate is deliberately behavioural, not cosmetic. It asserts the three
 * things that make this editor safe to hand to a non-technical writer:
 *
 *  1. the body model is lossless on round-trip and hostile markup never
 *     survives a parse;
 *  2. images cannot enter the document without the dimensions that keep CLS
 *     at zero;
 *  3. a draft is never silently lost — local recovery only fires on real
 *     divergence, and diffing large documents stays bounded.
 *
 * Plus structural checks that the route actually wires the surface up, because
 * a perfect library nobody renders is worth nothing.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BODY_LIMITS,
  blocksToText,
  bodyStats,
  deriveExcerpt,
  normalizeBody,
  parseBody,
  safeUrl,
  serializeBody,
  splitAtMore,
  validateBody,
} from "./blog-body";
import { DIFF_LIMITS, diffFields, diffWords, summarizeDiff, tokenize } from "./blog-diff";
import { createDraftStore, draftHash, draftPayloadOf, recoveryOffer } from "./blog-draft";

const ROUTE = readFileSync("src/routes/_authenticated/admin/marketing/articles.tsx", "utf8");
const EDITOR = readFileSync("src/components/admin/blog/ClassicEditor.tsx", "utf8");
const SERVER = readFileSync("src/lib/cms.server.ts", "utf8");

function memoryStorage(fail = false) {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (fail) throw new Error("QuotaExceededError");
      map.set(key, value);
    },
    removeItem: (key: string) => void map.delete(key),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe("body model — parse and serialize", () => {
  it("round-trips every block type without drift", () => {
    const source = [
      "<h2>Heading</h2>",
      "<p>Plain <strong>bold</strong> and <em>italic</em> and <a href=\"https://example.com\">a link</a>.</p>",
      "<ul><li>one</li><li>two</li></ul>",
      "<ol><li>first</li></ol>",
      "<blockquote><p>Quoted</p></blockquote>",
      "<pre><code>const x = 1;</code></pre>",
      "<hr>",
      '<figure><img src="https://cdn.example.com/a.jpg" alt="A" width="800" height="600"><figcaption>Cap</figcaption></figure>',
    ].join("\n");
    const once = normalizeBody(source);
    expect(normalizeBody(once)).toBe(once);
    const blocks = parseBody(once);
    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "list",
      "list",
      "quote",
      "code",
      "hr",
      "image",
    ]);
    expect(serializeBody(blocks)).toBe(once);
  });

  it("treats legacy plain-text bodies as paragraphs", () => {
    const blocks = parseBody("First para.\n\nSecond para.");
    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.type === "paragraph")).toBe(true);
  });

  it("strips scripts, event handlers and dangerous URLs", () => {
    const blocks = parseBody(
      '<p onclick="steal()">hi<script>alert(1)</script></p><p><a href="javascript:alert(1)">x</a></p>',
    );
    const html = serializeBody(blocks);
    expect(html).not.toContain("script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("  https://ok.example.com/a ")).toBe("https://ok.example.com/a");
    expect(safeUrl("/relative/path")).toBe("/relative/path");
  });

  it("keeps nesting and document size bounded", () => {
    const deep = "<strong>".repeat(40) + "x" + "</strong>".repeat(40);
    expect(() => parseBody(`<p>${deep}</p>`)).not.toThrow();
    const huge = "<p>word</p>".repeat(BODY_LIMITS.maxBlocks + 200);
    expect(parseBody(huge).length).toBeLessThanOrEqual(BODY_LIMITS.maxBlocks);
  });
});

describe("zero-CLS image contract", () => {
  it("flags an image with no dimensions or no alt", () => {
    const blocks = parseBody('<figure><img src="https://cdn.example.com/a.jpg" alt=""></figure>');
    const issues = validateBody(blocks);
    expect(issues.map((issue) => issue.code).sort()).toEqual(["image_alt_missing", "image_dimensions_missing"]);
  });

  it("passes an image carrying alt plus intrinsic size", () => {
    const blocks = parseBody(
      '<figure><img src="https://cdn.example.com/a.jpg" alt="Product" width="1200" height="800"></figure>',
    );
    expect(validateBody(blocks)).toEqual([]);
  });

  it("counts media and links for the writer's status line", () => {
    const stats = bodyStats(
      parseBody(
        '<p>one two three <a href="https://a.example.com">l</a></p><figure><img src="https://c.example.com/x.jpg" alt="x" width="10" height="10"></figure>',
      ),
    );
    expect(stats.words).toBeGreaterThanOrEqual(4);
    expect(stats.images).toBe(1);
    expect(stats.links).toBe(1);
    expect(stats.readingMinutes).toBeGreaterThanOrEqual(1);
  });
});

describe("excerpt and read-more split", () => {
  it("honours an explicit more marker", () => {
    const blocks = parseBody("<p>Teaser copy.</p><!--more--><p>Body copy.</p>");
    const split = splitAtMore(blocks);
    expect(split.explicit).toBe(true);
    expect(blocksToText(split.teaser)).toContain("Teaser");
    expect(blocksToText(split.rest)).toContain("Body");
  });

  it("derives a bounded excerpt when none is given", () => {
    const excerpt = deriveExcerpt(parseBody(`<p>${"word ".repeat(400)}</p>`));
    expect(excerpt.length).toBeLessThanOrEqual(BODY_LIMITS.excerptChars + 1);
    expect(excerpt.length).toBeGreaterThan(0);
  });
});

describe("revision diff", () => {
  it("reports word-level inserts and deletes", () => {
    const chunks = diffWords("the quick brown fox", "the slow brown fox");
    const summary = summarizeDiff(chunks);
    expect(summary.changed).toBe(true);
    expect(summary.added).toBe(1);
    expect(summary.removed).toBe(1);
  });

  it("says nothing changed when nothing changed", () => {
    expect(summarizeDiff(diffWords("same text", "same text")).changed).toBe(false);
  });

  it("stays bounded on very large documents instead of exhausting memory", () => {
    const before = "word ".repeat(DIFF_LIMITS.maxTokens * 2);
    const after = `${before}tail`;
    const started = Date.now();
    const chunks = diffWords(before, after);
    expect(Date.now() - started).toBeLessThan(4000);
    expect(chunks.length).toBeGreaterThan(0);
    expect(tokenize(before).length).toBeGreaterThan(DIFF_LIMITS.maxTokens);
  });

  it("diffs metadata fields and ignores untouched ones", () => {
    const fields = diffFields(
      { title: "A", slug: "a", excerpt: "same" },
      { title: "B", slug: "a", excerpt: "same" },
    );
    expect(fields.map((field) => field.key)).toEqual(["title"]);
  });
});

describe("local draft recovery", () => {
  const payload = draftPayloadOf({ title: "T", body: "<p>x</p>" });

  it("round-trips a draft and clears it on save", () => {
    const store = createDraftStore({ storage: memoryStorage() });
    expect(store.write("m1", "a1", payload, "server-hash").ok).toBe(true);
    expect(store.read("m1", "a1")?.title).toBe("T");
    store.clear("m1", "a1");
    expect(store.read("m1", "a1")).toBeNull();
  });

  it("never throws when storage is unavailable or blocked", () => {
    // A blocked quota must not lose the edit: the in-tab mirror still answers.
    const blocked = createDraftStore({ storage: memoryStorage(true) });
    expect(blocked.write("m1", "a1", payload, "h")).toMatchObject({ ok: true, persisted: false });
    expect(blocked.read("m1", "a1")?.body).toBe(payload.body);
    expect(createDraftStore({ storage: null }).read("m1", "a1")).toBeNull();
  });


  it("offers recovery only when the local copy really diverges", () => {
    const stored = {
      ...payload,
      version: 1,
      merchantId: "m1",
      articleId: "a1",
      savedAt: new Date().toISOString(),
      baseHash: draftHash(payload),
    };
    expect(recoveryOffer(stored, payload, null).offer).toBe(false);
    const diverged = { ...stored, body: "<p>newer local edit</p>" };
    expect(recoveryOffer(diverged, payload, null).offer).toBe(true);
    expect(recoveryOffer(null, payload, null).offer).toBe(false);
  });

  it("drops an expired draft rather than resurrecting stale text", () => {
    const shared = memoryStorage();
    const now = Date.now();
    createDraftStore({ storage: shared, now: () => now }).write("m1", "a1", payload, "h");
    const later = createDraftStore({ storage: shared, now: () => now + 30 * 24 * 3600_000 });
    expect(later.read("m1", "a1")).toBeNull();
  });

});

describe("surface wiring", () => {
  it("renders the Classic editor with Visual and Text tabs", () => {
    expect(ROUTE).toContain("<ClassicEditor");
    expect(EDITOR).toContain('"visual"');
    expect(EDITOR).toContain('"text"');
  });

  it("autosaves, backs off and offers recovery in the route", () => {
    expect(ROUTE).toContain("AUTOSAVE_MS");
    expect(ROUTE).toContain("AUTOSAVE_MAX_FAILURES");
    expect(ROUTE).toContain("recoveryOffer");
    expect(ROUTE).toContain("beforeunload");
  });

  it("keeps sanitisation and revision retention server-side", () => {
    expect(SERVER).toContain("normalizeBody");
    expect(SERVER).toMatch(/retention|prune/i);
  });
});
