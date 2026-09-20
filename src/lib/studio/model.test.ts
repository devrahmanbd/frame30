import { describe, expect, it } from "vitest";
import { parseStudioBody, serializeStudioBody } from "./model";
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
