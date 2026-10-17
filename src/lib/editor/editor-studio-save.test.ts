/**
 * Studio v2 envelope save canonicalization.
 *
 * Live regression (loopback e2e, 2026-10-16): `canonicalBody` ran the
 * `<!--fq-studio:v2 …-->` string envelope through the markdown round-trip,
 * escaping the embedded JSON (`"` → `\"`, `[` → `\[`). Storage then held a
 * payload `parseStudioBody` could not revive (quote layers were never
 * recovered), so a reloaded canvas adopted ZERO nodes and the wipeout guard
 * (`isWipeoutSave`) saw an "empty" baseline and stopped protecting saves.
 *
 * Contract pinned here:
 * - envelopes pass through `canonicalBody` BYTE-IDENTICAL (any kind);
 * - plain markdown pages canonicalize exactly as before;
 * - `plainText` derives nothing from envelopes (mirrors builder bodies);
 * - already-mangled historical payloads are still recoverable, and the
 *   wipeout guard stays armed against them.
 */
import { describe, expect, it } from "vitest";
import { canonicalBody, plainText } from "./editor.server";
import { blocksToMarkdown, markdownToBlocks } from "./page-markdown";
import { isWipeoutSave } from "./editor-doc";
import {
  readStudioBody,
  serializeStudioBody,
  type StudioDoc,
  type StudioNode,
} from "@/lib/studio/model";

// Quotes + brackets: exactly the characters the markdown round-trip escapes.
const HEADING_TEXT = 'Top reviews "mvbi" [x]';

function headingNode(): StudioNode {
  return { id: "n_heading", el: "heading", settings: { text: HEADING_TEXT } };
}

function envelope(): string {
  const doc: StudioDoc = {
    version: 2,
    root: [
      {
        id: "n_root",
        el: "container",
        settings: {},
        children: [headingNode()],
      },
    ],
    page: {
      title: "E2E studio save",
      status: "draft",
      layout: "default",
      allowComments: false,
      hideTitle: false,
    },
  };
  return serializeStudioBody(doc);
}

function emptiedEnvelope(): string {
  const doc: StudioDoc = {
    version: 2,
    root: [],
    page: {
      title: "E2E studio save",
      status: "draft",
      layout: "default",
      allowComments: false,
      hideTitle: false,
    },
  };
  return serializeStudioBody(doc);
}

describe("studio v2 envelope canonicalization", () => {
  it("passes the envelope through byte-identical for pages", () => {
    const env = envelope();
    expect(canonicalBody("page", env)).toBe(env);
  });

  it("passes the envelope through byte-identical for posts", () => {
    const env = envelope();
    expect(canonicalBody("post", env)).toBe(env);
  });

  it("proves the markdown round-trip would corrupt the envelope (regression rationale)", () => {
    const env = envelope();
    const mangled = blocksToMarkdown(markdownToBlocks(env));
    expect(mangled).not.toBe(env);
    // And the mangled payload is NOT the authored doc on any pre-recovery code path.
    expect(mangled).not.toContain(JSON.stringify(envelope()));
  });

  it("still canonicalises plain markdown pages exactly as before", () => {
    const md = "# Hello\n\nA gentle paragraph.";
    expect(canonicalBody("page", md)).toBe(
      blocksToMarkdown(markdownToBlocks(md)),
    );
  });

  it("derives no plain text from an envelope (mirrors builder bodies)", () => {
    expect(plainText("page", envelope())).toBe("");
  });
});

describe("historical mangled-envelope recovery", () => {
  it("recovers authored nodes from a payload mangled by the old save path", () => {
    const mangled = blocksToMarkdown(markdownToBlocks(envelope()));
    const recovered = readStudioBody(mangled);
    expect(recovered).not.toBeNull();
    expect(recovered!.root.length).toBeGreaterThan(0);
    expect(JSON.stringify(recovered)).toContain("Top reviews");
  });

  it("keeps the wipeout guard armed against a mangled baseline", () => {
    const mangled = blocksToMarkdown(markdownToBlocks(envelope()));
    expect(isWipeoutSave("page", "builder", mangled, emptiedEnvelope())).toBe(
      true,
    );
  });

  it("never revives garbage: clean parse still wins over recovery", () => {
    const env = envelope();
    const head = readStudioBody(env)!.root[0]!.children?.[0];
    expect((head!.settings as Record<string, unknown>)["text"]).toBe(
      HEADING_TEXT,
    );
  });
});
