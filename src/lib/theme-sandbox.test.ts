import { describe, expect, it } from "vitest";
import {
  AST_LIMITS,
  assertPayloadWithinLimits,
  parseAst,
  parseTemplates,
  safeEmbedUrl,
  sanitiseText,
  takeSanitiserRejects,
} from "./builder-ast";

const html = (body: string) => ({ main: [{ id: "s1", type: "html", props: { body } }] });

describe("theme sandbox — content sanitiser", () => {
  it("strips tags, event handlers and residual angle brackets", () => {
    const payloads = [
      `<script>alert(1)</script>`,
      `<img src=x onerror="alert(1)">`,
      `<div onclick="steal()">hi</div>`,
      `<iframe src="https://evil.test"></iframe>`,
      `<svg/onload=alert(1)`,
    ];
    for (const payload of payloads) {
      const out = sanitiseText(payload, 2000);
      expect(out).not.toMatch(/[<>]/);
      expect(out.toLowerCase()).not.toContain("script>");
      expect(out.toLowerCase()).not.toContain("onerror=");
    }
  });

  it("keeps the html widget as plain text through the parser", () => {
    const ast = parseAst(html(`<script>alert(1)</script>safe copy`));
    expect(String(ast.main[0]?.props["body"])).toBe("safe copy");
  });

  it("counts rejections so the sanitiser is observable", () => {
    takeSanitiserRejects();
    parseAst(html("<b>bold</b>"));
    expect(takeSanitiserRejects()).toBeGreaterThan(0);
  });
});

describe("theme sandbox — links and embeds", () => {
  const link = (href: string) =>
    parseAst({ main: [{ id: "s1", type: "hero", props: { ctaHref: href } }] }).main[0]?.props[
      "ctaHref"
    ];

  it("rejects dangerous link schemes", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,<script>", "vbscript:x", "//evil.test"]) {
      expect(link(href)).toBe("");
    }
  });

  it("allows safe link schemes", () => {
    for (const href of ["https://a.test/x", "/collections", "#top", "mailto:a@b.test", "tel:+8801"]) {
      expect(link(href)).toBe(href);
    }
  });

  it("frames only allowlisted https hosts", () => {
    expect(safeEmbedUrl("https://www.youtube.com/embed/abc")).toContain("youtube.com/embed/abc");
    expect(safeEmbedUrl("https://player.vimeo.com/video/1")).toContain("player.vimeo.com");
    for (const bad of [
      "https://evil.test/frame",
      "http://www.youtube.com/embed/abc",
      "javascript:alert(1)",
      "https://www.youtube.com.evil.test/embed/abc",
    ]) {
      expect(safeEmbedUrl(bad)).toBe("");
    }
  });
});

describe("theme sandbox — structural limits", () => {
  it("rejects an oversized payload", () => {
    const big = { templates: { index: { main: [{ id: "s", type: "html", props: { body: "x".repeat(AST_LIMITS.maxPayloadChars) } }] } } };
    expect(() => assertPayloadWithinLimits(big)).toThrow(/payload_too_large/);
  });

  it("rejects a deeply nested payload", () => {
    let deep: unknown = "leaf";
    for (let i = 0; i < AST_LIMITS.maxDepth + 4; i += 1) deep = { child: deep };
    expect(() => assertPayloadWithinLimits(deep)).toThrow(/payload_too_deep/);
  });

  it("caps sections per slot", () => {
    const many = Array.from({ length: AST_LIMITS.maxSectionsPerSlot + 25 }, (_, i) => ({
      id: `s${i}`,
      type: "html",
      props: { body: "x" },
    }));
    expect(parseAst({ main: many }).main.length).toBe(AST_LIMITS.maxSectionsPerSlot);
  });

  it("drops malformed template keys and unknown widgets", () => {
    const parsed = parseTemplates({
      index: { main: [{ id: "s1", type: "html", props: {} }] },
      "../../etc/passwd": { main: [{ id: "x", type: "html", props: {} }] },
      __proto__: { main: [] },
    });
    expect(Object.keys(parsed)).toEqual(["index"]);
    const unknown = parseAst({ main: [{ id: "s1", type: "evil_widget", props: {} }] });
    expect(unknown.main[0]?.invalid).toContain("unknown_widget");
  });
});
