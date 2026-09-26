/**
 * B1 — Builder submenu (M-05, Elementor Editor model).
 *
 * RED-first: asserts the Builder nav group (single source of truth in
 * `console-nav.ts`) plus one working route file per submenu entry.
 * Precedents: console-nav-tabs.test.ts (nav shape), StoreHeader.test.tsx:119
 * (source asserts that routes are registered, not dead buttons).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { ADMIN_NAV, permissionForPath } from "./console-nav";

const BUILDER_ENTRIES = [
  { en: "Templates", file: "builder-templates.tsx", panel: "templates" },
  { en: "Saved", file: "builder-saved.tsx", panel: "saved" },
  {
    en: "Theme Builder",
    file: "builder-theme-builder.tsx",
    panel: "theme-builder",
  },
  { en: "Tools", file: "builder-tools.tsx", panel: "tools" },
  { en: "Submissions", file: "builder-submissions.tsx", panel: "submissions" },
  {
    en: "Role Manager",
    file: "builder-role-manager.tsx",
    panel: "role-manager",
  },
] as const;

function routeSource(file: string): string {
  const path = `src/routes/_authenticated/dashboard/${file}`;
  expect(existsSync(path), `${path} exists (no dead nav buttons)`).toBe(true);
  return readFileSync(path, "utf8");
}

describe("B1 — Builder submenu homes (M-05)", () => {
  it("declares a top-level Builder group with bilingual labels", () => {
    const builder = ADMIN_NAV.find((g) => g.key === "builder");
    expect(builder).toBeDefined();
    expect(builder!.en).toBe("Builder");
    expect(builder!.bn.trim().length).toBeGreaterThan(0);
    expect(builder!.bn).not.toBe(builder!.en);
    expect(builder!.icon).toBe("builder");
  });

  it("exposes all six submenu homes across items + more (max five primary tabs)", () => {
    const builder = ADMIN_NAV.find((g) => g.key === "builder");
    expect(builder).toBeDefined();
    const all = [...builder!.items, ...(builder!.more ?? [])];
    expect(all.map((i) => i.en)).toEqual(BUILDER_ENTRIES.map((e) => e.en));
    // Phase-5 console contract: never more than five primary tabs.
    expect(builder!.items.length).toBeLessThanOrEqual(5);
  });

  it("gives every entry a bilingual label and a themes.read gate", () => {
    const builder = ADMIN_NAV.find((g) => g.key === "builder");
    expect(builder).toBeDefined();
    const all = [...builder!.items, ...(builder!.more ?? [])];
    for (const item of all) {
      expect(item.bn.trim().length, `${item.en} bn`).toBeGreaterThan(0);
      expect(item.bn, `${item.en} bilingual`).not.toBe(item.en);
      expect(item.permission, `${item.en} gate`).toBe("themes.read");
      expect(permissionForPath(item.to), `${item.to} gate`).toBe("themes.read");
    }
  });

  it("backs every entry with a registered route file that lands on the builder", () => {
    for (const entry of BUILDER_ENTRIES) {
      const src = routeSource(entry.file);
      expect(src).toContain("createFileRoute");
      // Redirects to the builder studio (same pattern as plugins/new.tsx),
      // carrying the panel that selects the right surface.
      expect(src).toContain("/dashboard/builder");
      expect(src).toContain(entry.panel);
    }
  });

  it("builder honors the panel search param and maps submenu keys to real panels", () => {
    const src = readFileSync(
      "src/routes/_authenticated/dashboard/builder.tsx",
      "utf8",
    );
    expect(src).toContain("validateSearch");
    for (const entry of BUILDER_ENTRIES) {
      expect(src, `panel key ${entry.panel}`).toContain(entry.panel);
    }
  });
});
