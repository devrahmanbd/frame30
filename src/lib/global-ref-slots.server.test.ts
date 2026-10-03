/**
 * Phase 2B — `global_ref` render-data join (`global-blocks.server`).
 *
 * Covers: the server read-join returning `GlobalRefBlock`-shaped rows with
 * revision metadata, and the pure slot/AST expansion (`resolveGlobalRef`
 * per placement) — resolve by id and by case-insensitive name, missing and
 * blank pointers resolving to the `invalid: "global_ref.missing"`
 * placeholder (never a crash), and input immutability.
 */
import { describe, expect, it, vi } from "vitest";

// The limiter needs Redis/Postgres; the join under test must fail open
// without them, but unit tests should not touch the network at all.
vi.mock("./rate-limit.server", () => ({
  enforceRateLimit: async () => ({ allowed: true }),
}));

import {
  GLOBAL_REF_MISSING,
  type GlobalRefBlock,
  type Section,
} from "./builder-ast";
import {
  listGlobalRefBlocks,
  resolveGlobalRefAst,
  resolveGlobalRefSlots,
} from "./global-blocks.server";

const node = (
  id: string,
  type: string,
  props: Record<string, unknown>,
  children?: Section[],
): Section =>
  ({ id, type, props, ...(children ? { children } : {}) }) as unknown as Section;

const block: GlobalRefBlock = {
  id: "block-1",
  name: "Shared footer",
  nodes: [node("n1", "heading", { text: "Hi" })],
};

describe("resolveGlobalRefSlots", () => {
  it("resolves by id, grafting detached copies in place of the placement", () => {
    const ref = node("g1", "global_ref", { ref: "block-1" });
    const out = resolveGlobalRefSlots([ref], [block]);
    expect(out.missing).toEqual([]);
    expect(out.sections.map((section) => section.id)).toEqual(["g1~n1"]);
    expect(out.sections[0]?.type).toBe("heading");
  });

  it("resolves by case-insensitive name", () => {
    const out = resolveGlobalRefSlots(
      [node("g2", "global_ref", { ref: "shared FOOTER" })],
      [block],
    );
    expect(out.missing).toEqual([]);
    expect(out.sections[0]?.id).toBe("g2~n1");
  });

  it("keeps missing and blank pointers as invalid placeholders, never a crash", () => {
    for (const ref of ["gone", "", "  ", 42, null]) {
      const out = resolveGlobalRefSlots(
        [node("g1", "global_ref", { ref: ref as never })],
        [block],
      );
      expect(out.missing).toEqual(["g1"]);
      expect(out.sections).toHaveLength(1);
      expect(out.sections[0]?.invalid).toBe(GLOBAL_REF_MISSING);
    }
  });

  it("leaves ordinary nodes alone and recurses into container children", () => {
    const sections = [
      node("h1", "heading", { text: "Hi" }),
      node("c1", "container", {}, [
        node("g1", "global_ref", { ref: "block-1" }),
      ]),
    ];
    const out = resolveGlobalRefSlots(sections, [block]);
    expect(out.missing).toEqual([]);
    expect(out.sections[0]?.type).toBe("heading");
    expect(out.sections[0]?.props).toEqual({ text: "Hi" });
    expect(out.sections[1]?.children?.map((child) => child.id)).toEqual([
      "g1~n1",
    ]);
  });

  it("never mutates the input tree or the stored block", () => {
    const sections = [node("g1", "global_ref", { ref: "block-1" })];
    const before = JSON.stringify({ sections, block });
    resolveGlobalRefSlots(sections, [block]);
    expect(JSON.stringify({ sections, block })).toBe(before);
  });
});

describe("resolveGlobalRefAst", () => {
  it("expands header/footer placements and collects missing ids", () => {
    const out = resolveGlobalRefAst(
      {
        header: [node("g1", "global_ref", { ref: "block-1" })],
        main: [node("h1", "heading", { text: "Hi" })],
        footer: [node("g2", "global_ref", { ref: "gone" })],
      },
      [block],
    );
    expect(out.ast.header.map((section) => section.id)).toEqual(["g1~n1"]);
    expect(out.ast.main.map((section) => section.id)).toEqual(["h1"]);
    expect(out.ast.footer[0]?.invalid).toBe(GLOBAL_REF_MISSING);
    expect(out.missing).toEqual(["g2"]);
  });
});

describe("listGlobalRefBlocks", () => {
  // Minimal supabase query-chain stub: select/eq/or/order chain, limit ends it.
  function stubDb(rows: unknown[]) {
    const terminal = Promise.resolve({ data: rows, error: null });
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    chain["select"] = () => chain;
    chain["eq"] = () => chain;
    chain["or"] = () => chain;
    chain["order"] = () => chain;
    chain["limit"] = () => terminal;
    return { from: () => chain };
  }

  type Client = Parameters<typeof listGlobalRefBlocks>[0];

  it("returns GlobalRefBlock rows with revision metadata for the editor", async () => {
    const db = stubDb([
      {
        id: "b1",
        name: "Footer",
        nodes: [{ id: "n1", type: "heading", props: { text: "Hi" } }],
        revision: 3,
        theme_id: null,
        updated_at: "2026-01-01T00:00:00Z",
      },
    ]) as unknown as Client;
    const rows = await listGlobalRefBlocks(db, "merchant-1", null);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("b1");
    expect(rows[0]?.name).toBe("Footer");
    expect(rows[0]?.revision).toBe(3);
    expect(rows[0]?.updatedAt).toBe("2026-01-01T00:00:00Z");
    // Nodes are sanitised on read: the heading survives with its copy.
    expect(rows[0]?.nodes[0]?.id).toBe("n1");
    expect(rows[0]?.nodes[0]?.props["text"]).toBe("Hi");
    // Still a valid resolver input (extra revision fields are fine).
    const out = resolveGlobalRefSlots(
      [node("g1", "global_ref", { ref: "b1" })],
      rows,
    );
    expect(out.missing).toEqual([]);
    expect(out.sections[0]?.id).toBe("g1~n1");
  });

  it("rejects a wildcard merchant instead of widening the read", async () => {
    const db = stubDb([]) as unknown as Client;
    await expect(listGlobalRefBlocks(db, "*", null)).rejects.toThrow();
  });
});
