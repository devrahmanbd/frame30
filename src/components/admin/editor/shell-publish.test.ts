/**
 * Shell wiring gaps (publish / lints / revisions passthrough).
 *
 * Covers the pure seams `EditorShell` owns:
 *  - the studio publish handler threads the working `commit("publish")` path,
 *  - the lint count is real (nonzero on a fixture with issues),
 *  - server revisions map 1:1 onto the studio `RevisionEntry` shape.
 */
import { describe, expect, it, vi } from "vitest";
import {
  countBuilderLints,
  countStudioLints,
} from "@/lib/editor/editor-doc";
import {
  emptyStudioDoc,
  serializeStudioBody,
  type StudioDoc,
} from "@/lib/studio/model";
import { createStudioPublishHandler, toStudioRevisions } from "./EditorShell";

function issueFixture(): StudioDoc {
  const doc = emptyStudioDoc("Fixture");
  return {
    ...doc,
    root: [
      {
        id: "img-1",
        el: "image",
        settings: { url: "", alt: "" },
      },
      {
        id: "head-1",
        el: "heading",
        settings: { text: "   ", level: 2 },
      },
      {
        id: "empty-1",
        el: "container",
        settings: {},
        children: [],
      },
    ],
  };
}

function cleanFixture(): StudioDoc {
  const doc = emptyStudioDoc("Clean");
  return {
    ...doc,
    root: [
      {
        id: "head-1",
        el: "heading",
        settings: { text: "Hello", level: 2 },
      },
      {
        id: "img-1",
        el: "image",
        settings: { url: "https://img.test/a.jpg", alt: "A" },
      },
    ],
  };
}

describe("studio publish passthrough", () => {
  it("serializes the studio doc and calls the shell publish path", async () => {
    const serialize = vi.fn();
    const publish = vi.fn().mockResolvedValue(undefined);
    const order: string[] = [];
    const handle = createStudioPublishHandler(
      (body) => {
        order.push("serialize");
        serialize(body);
      },
      async () => {
        order.push("publish");
        await publish();
      },
      async () => {},
    );
    await handle(issueFixture());
    expect(serialize).toHaveBeenCalledTimes(1);
    expect(String(serialize.mock.calls[0]![0])).toContain("fq-studio:v2");
    expect(publish).toHaveBeenCalledTimes(1);
    // The canvas must be flushed into the shell body before publish reads it.
    expect(order).toEqual(["serialize", "publish"]);
  });
});

describe("real lint count", () => {
  it("is nonzero on a fixture with issues", () => {
    expect(countStudioLints(issueFixture())).toBeGreaterThan(0);
  });

  it("counts a serialized builder body and stays silent otherwise", () => {
    expect(
      countBuilderLints(serializeStudioBody(issueFixture()), "Fixture"),
    ).toBeGreaterThan(0);
    expect(countStudioLints(cleanFixture())).toBe(0);
    expect(countBuilderLints("<p>classic markup</p>", "Classic")).toBe(0);
    expect(countBuilderLints(null)).toBe(0);
  });
});

describe("revisions passthrough shape", () => {
  it("maps server revisions onto studio RevisionEntry values", () => {
    const entries = toStudioRevisions(
      [
        {
          id: "r1",
          title: "First",
          status: "draft",
          isAutosave: true,
          createdAt: "2026-09-04T12:00:00.000Z",
          authorId: "u1",
        },
        {
          id: "r2",
          title: "Live",
          status: "published",
          isAutosave: false,
          createdAt: "2026-09-05T12:00:00.000Z",
          authorId: "missing",
        },
      ],
      [{ id: "u1", name: "Asha" }],
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      id: "r1",
      author: "Asha",
      kind: "autosave",
    });
    expect(typeof entries[0]!.at).toBe("number");
    expect(entries[1]).toMatchObject({
      id: "r2",
      author: "Unknown",
      kind: "published",
    });
    expect(entries[1]!.at).toBeGreaterThan(entries[0]!.at);
  });

  it("defaults to empty", () => {
    expect(toStudioRevisions(null, null)).toEqual([]);
    expect(toStudioRevisions([], [])).toEqual([]);
  });
});
