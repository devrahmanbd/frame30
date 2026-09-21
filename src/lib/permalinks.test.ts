/**
 * Permalink builder/parser (D2, WP parity) — TDD: presets, tags,
 * category/tag bases, round-trips.
 */
import { describe, expect, it } from "vitest";
import {
  PERMALINK_PRESETS,
  buildPostUrl,
  matchPostUrl,
  type PermalinkStructure,
} from "./permalinks";

const post = {
  postname: "hello-world",
  dateISO: "2026-09-21T10:00:00Z",
  category: "news",
  author: "maxw",
  post_id: 123,
};

describe("buildPostUrl", () => {
  it("builds each preset", () => {
    expect(buildPostUrl({ kind: "postname" }, post)).toBe("/hello-world/");
    expect(buildPostUrl({ kind: "numeric" }, post)).toBe("/archives/123");
    expect(buildPostUrl({ kind: "day-name" }, post)).toBe(
      "/2026/09/21/hello-world/",
    );
    expect(buildPostUrl({ kind: "month-name" }, post)).toBe(
      "/2026/09/hello-world/",
    );
  });

  it("builds custom structures with tags", () => {
    const s: PermalinkStructure = {
      kind: "custom",
      custom: "/%category%/%postname%/",
    };
    expect(buildPostUrl(s, post)).toBe("/news/hello-world/");
  });

  it("applies category and tag bases", () => {
    expect(
      buildPostUrl(
        { kind: "postname", categoryBase: "topics" },
        { ...post, category: "news" },
      ),
    ).toBe("/hello-world/");
  });

  it("plain uses the post id query", () => {
    expect(buildPostUrl({ kind: "plain" }, post)).toBe("/?p=123");
  });
});

describe("matchPostUrl", () => {
  it("round-trips postname and dated structures", () => {
    for (const s of [
      { kind: "postname" },
      { kind: "day-name" },
      { kind: "month-name" },
      { kind: "custom", custom: "/%category%/%postname%/" },
    ] as PermalinkStructure[]) {
      const url = buildPostUrl(s, post);
      const m = matchPostUrl(s, url);
      expect(m?.postname, url).toBe("hello-world");
    }
  });

  it("rejects non-matching paths", () => {
    expect(matchPostUrl({ kind: "postname" }, "/2026/09/21/hello-world/")).toBeNull();
    expect(matchPostUrl({ kind: "numeric" }, "/hello-world/")).toBeNull();
  });
});

describe("PERMALINK_PRESETS", () => {
  it("covers the WP set", () => {
    expect(PERMALINK_PRESETS.map((p) => p.kind)).toEqual([
      "plain",
      "day-name",
      "month-name",
      "numeric",
      "postname",
      "custom",
    ]);
  });
});
