/**
 * QUBICKLE Rule 14 — publish-gated rollback/schedule (RED-first).
 *
 * builderRollbackFn + builderScheduleFn (publish AND unpublish) must require
 * themes.publish, not themes.update. An update-only role must not be able to
 * rollback or schedule a publish.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { can } from "./authz";

function fnBlock(src: string, name: string): string {
  const idx = src.indexOf(`export const ${name} = createServerFn`);
  if (idx === -1) throw new Error(`missing ${name}`);
  // Next export or EOF bounds the block.
  const rest = src.slice(idx);
  const next = rest.indexOf("export const ", 10);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("Rule 14 — rollback/schedule require themes.publish", () => {
  const src = readFileSync("src/lib/themes.functions.ts", "utf8");

  it("builderRollbackFn requires themes.publish", () => {
    const block = fnBlock(src, "builderRollbackFn");
    expect(block).toContain('requirePermission("themes.publish")');
    expect(block).not.toContain('requirePermission("themes.update")');
  });

  it("builderScheduleFn requires themes.publish (publish AND unpublish)", () => {
    const block = fnBlock(src, "builderScheduleFn");
    expect(block).toContain('requirePermission("themes.publish")');
    expect(block).not.toContain('requirePermission("themes.update")');
    // Both actions ride the same fn — the gate covers unpublish too.
    expect(block).toContain('"publish"');
    expect(block).toContain('"unpublish"');
  });

  it("[NEGATIVE] update-only role cannot satisfy themes.publish", () => {
    expect(
      can("themes.publish", {
        permissions: ["themes.read", "themes.update"],
        status: "active",
      }),
    ).toBe(false);
    expect(
      can("themes.publish", {
        permissions: ["themes.publish"],
        status: "active",
      }),
    ).toBe(true);
  });
});
