/**
 * Frame30 DICE Native Adapters Registry
 * Normative Architecture: F30-DICE-ARCH-001 Revision 2.3 Section 8.6
 */

export * from "./types.js";
export * from "./lean4-adapter.js";
export * from "./tla-adapter.js";
export * from "./bend2-adapter.js";
export * from "./bombadil-adapter.js";
export * from "./vitest-adapter.js";

import type { DiceAdapter, AdapterToolName } from "./types.js";
import { Lean4Adapter } from "./lean4-adapter.js";
import { TlaAdapter } from "./tla-adapter.js";
import { Bend2Adapter } from "./bend2-adapter.js";
import { BombadilAdapter } from "./bombadil-adapter.js";
import { VitestAdapter } from "./vitest-adapter.js";

export function getAdapterForTool(
  tool: AdapterToolName,
  options: { repoRoot?: string } = {},
): DiceAdapter {
  switch (tool) {
    case "lean4":
      return new Lean4Adapter(options);
    case "tlc":
      return new TlaAdapter(options);
    case "bend2":
      return new Bend2Adapter(options);
    case "bombadil":
      return new BombadilAdapter(options);
    case "fast-check":
      return new VitestAdapter({ ...options, isFastCheck: true });
    case "vitest":
    default:
      return new VitestAdapter(options);
  }
}
