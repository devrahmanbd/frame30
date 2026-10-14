/**
 * Studio global insert — linked (`global_ref`) vs editable-copy choice (TDD).
 *
 * Audit finding: the Globals-tab insert path is snapshot-only (fresh-id
 * clones) while the linked-block copy promises "edits update everywhere".
 * The fix offers both on the existing path: `copy` stays the default (no
 * surprise for current merchants), `linked` inserts a `global_ref` pointer
 * that resolves live at render-data time via `resolveGlobalRef` /
 * `resolveGlobalRefSlots`. These pure helpers are the testable contract;
 * the `insertGlobalBlock` callback keeps `copy` as its default mode.
 */
import { describe, expect, it } from "vitest";
import {
  globalRefNodeForBlock,
  normalizeGlobalInsertMode,
} from "./StudioBuilder";

describe("normalizeGlobalInsertMode", () => {
  it("keeps linked only for the explicit linked choice", () => {
    expect(normalizeGlobalInsertMode("linked")).toBe("linked");
  });

  it("defaults everything else to copy (current behavior preserved)", () => {
    for (const value of [
      undefined,
      null,
      "",
      "copy",
      "COPY",
      "linked ",
      0,
      false,
      {},
    ]) {
      expect(normalizeGlobalInsertMode(value)).toBe("copy");
    }
  });
});

describe("globalRefNodeForBlock", () => {
  it("builds a global_ref pointer carrying only the block id", () => {
    const node = globalRefNodeForBlock("block-1");
    expect(node.el).toBe("global_ref");
    expect(node.settings.ref).toBe("block-1");
    expect(node.id).toBeTruthy();
  });

  it("trims and clamps hostile ids like the builder-ast pointer", () => {
    expect(globalRefNodeForBlock("  Shared Footer  ").settings.ref).toBe(
      "Shared Footer",
    );
    expect(
      String(globalRefNodeForBlock("x".repeat(200)).settings.ref),
    ).toHaveLength(120);
  });

  it("never throws and stays render-safe on blank/hostile input", () => {
    for (const value of ["", "   ", null, undefined, 42]) {
      const node = globalRefNodeForBlock(value as unknown as string);
      expect(node.el).toBe("global_ref");
      expect(node.settings.ref).toBe("");
    }
  });

  it("mints unique ids so two linked inserts never collide", () => {
    expect(globalRefNodeForBlock("b1").id).not.toBe(
      globalRefNodeForBlock("b1").id,
    );
  });

  it("carries no snapshot children — resolution stays live via resolveGlobalRef", () => {
    expect(globalRefNodeForBlock("b1").children).toBeUndefined();
  });
});
