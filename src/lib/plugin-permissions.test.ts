import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PRESETS } from "./authz";
import { readFileSync } from "node:fs";
describe("plugins.* permissions", () => {
  it("registers plugins.read and plugins.update", () => {
    expect(PERMISSIONS).toContain("plugins.read");
    expect(PERMISSIONS).toContain("plugins.update");
  });
  it("no plugin fn or route still references themes.*", () => {
    for (const f of [
      "src/lib/plugins.functions.ts",
      "src/routes/_authenticated/dashboard/plugins/index.tsx",
    ]) {
      expect(readFileSync(f, "utf8")).not.toMatch(/themes\.(read|update)/);
    }
    const nav = readFileSync("src/lib/console-nav.ts", "utf8");
    // Bound the window to the Plugins section: a fixed +1500 overshoots into
    // the sibling Marketplace section, whose Themes/Plugins tabs legitimately
    // keep themes.read (marketplace server paths are out of scope for this task).
    const start = nav.indexOf('key: "plugins"');
    const nextKey = nav.indexOf('key: "marketplace"', start);
    const block = nav.slice(start, nextKey === -1 ? start + 1500 : nextKey);
    expect(block).not.toMatch(/themes\.(read|update)/);
  });
  it("mirrors themes read/update in every role preset with plugins read/update", () => {
    for (const [name, perms] of Object.entries(ROLE_PRESETS)) {
      const list = perms as readonly string[];
      if (list.includes("themes.read"))
        expect(list, name).toContain("plugins.read");
      if (list.includes("themes.update"))
        expect(list, name).toContain("plugins.update");
    }
  });
});
