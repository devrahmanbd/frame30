import { describe, expect, it } from "vitest";
import { articleHeadingIds, articleJsonLd, articleOutline, escapeFeedXml, normalizeBlogSearch, shareLinks } from "./blog-reader";
import { parseBody } from "./blog-body";

describe("public blog reader contracts", () => {
  it("builds stable unique anchors for duplicate headings", () => {
    const body = "<h2>Scale safely</h2><p>One</p><h2>Scale safely</h2>";
    const outline = articleOutline(body);
    expect(outline.toc.map((item) => item.id)).toEqual(["scale-safely", "scale-safely-2"]);
    expect([...articleHeadingIds(parseBody(body)).values()]).toEqual(outline.toc.map((item) => item.id));
  });

  it("normalizes hostile wildcard input and bounds query length", () => {
    expect(normalizeBlogSearch("  revenue%_\\\u0000  growth ")).toBe("revenue growth");
    expect(normalizeBlogSearch("x".repeat(200))).toHaveLength(80);
  });

  it("produces encoded share links and safe feed XML", () => {
    const links = shareLinks("https://example.com/", "hello world", "A & B");
    expect(links.linkedin).toContain(encodeURIComponent("https://example.com/blog/hello%20world"));
    expect(escapeFeedXml(`<script a="1">&`)).toBe("&lt;script a=&quot;1&quot;&gt;&amp;");
  });

  it("emits Article schema with a Person byline", () => {
    const node = articleJsonLd({ slug: "guide", title: "Guide", description: "Useful guide", publisher: "Framique", readingMinutes: 7, author: { slug: "editor", displayName: "Editor", displayNameEn: null, roleTitle: null, bio: null, bioEn: null, avatarUrl: null, websiteUrl: null, socialLinks: {} } });
    expect(node).toMatchObject({ "@type": "Article", timeRequired: "PT7M", author: { "@type": "Person", name: "Editor" } });
  });
});