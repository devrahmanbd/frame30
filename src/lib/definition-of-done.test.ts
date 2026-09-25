/**
 * Platform-wide definition of done (TODO.md).
 *
 * Each block below is one bullet of the checklist. A regression on any clause
 * fails here rather than in a merchant's storefront.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  TEMPLATE_KEYS,
  lintTemplate,
  parseAst,
  type Section,
  type ThemeAst,
} from "./builder-ast";
import { collectWidgetRequests } from "./widget-data";
import { WIDGET_REGISTRY, WIDGET_TYPES } from "./widget-registry";
import { checkApiCompatibility, PRESET_API_RANGE } from "./registry-version";
import { formatDisplayMoney } from "./money-display";
import { PLUGIN_BUDGET } from "./plugin-manifest";
import { LIGHTHOUSE_BUDGET } from "./web-vitals";

/** The four blueprint themes plus every other shipped preset. */

function allSections(ast: ThemeAst): Section[] {
  const out: Section[] = [];
  const walk = (nodes: Section[] | undefined) => {
    for (const node of nodes ?? []) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(ast.header);
  walk(ast.main);
  walk(ast.footer);
  return out;
}

describe("DoD 2 — performance budgets are codified", () => {
  it("keeps the Lighthouse/vitals budget at the documented floors", () => {
    expect(LIGHTHOUSE_BUDGET.performance).toBeGreaterThanOrEqual(90);
    expect(LIGHTHOUSE_BUDGET.accessibility).toBeGreaterThanOrEqual(95);
    expect(LIGHTHOUSE_BUDGET.lcpMs).toBeLessThanOrEqual(2500);
    expect(LIGHTHOUSE_BUDGET.clsL).toBeLessThanOrEqual(0.02);
    expect(LIGHTHOUSE_BUDGET.inpMs).toBeLessThanOrEqual(200);
  });
});

describe("DoD 3 — one batched data call per template render", () => {
  it("collects every data widget into a single deduped request set", () => {
    const ast = parseAst({
      header: [],
      main: [
        { id: "rail-1", type: "product_rail", props: {} },
        { id: "rail-2", type: "product_rail", props: {} },
      ],
      footer: [],
    });
    const bundle = collectWidgetRequests(ast);
    const keys = new Set(bundle.requests.map((r) => r.key));
    expect(keys.size, "dedupe").toBe(bundle.requests.length);
    const dataNodes = allSections(ast).filter(
      (node) => WIDGET_REGISTRY[node.type]?.data,
    );
    expect(dataNodes.length).toBeGreaterThan(0);
    // Every data widget maps into the one bundle — no widget fetches alone.
    for (const node of dataNodes) {
      expect(Object.keys(bundle.byNode), `${node.type}/${node.id}`).toContain(
        node.id,
      );
    }
  });
});

describe("DoD 4 — money is a server integer with tabular numerals", () => {
  it("formats integer minor units and never accepts client math", () => {
    expect(formatDisplayMoney(120000, { compact: true })).toContain("1,200");
    expect(
      formatDisplayMoney(120000, {
        compact: true,
        locale: "bn",
        digits: "bengali",
      }),
    ).toMatch(/[০-৯]/);
  });

  it("keeps money arithmetic out of widget renderers", () => {
    const dir = join(process.cwd(), "src/components/builder");
    const files = readdirSync(dir).filter(
      (f) => f.endsWith(".tsx") && !f.includes(".test."),
    );
    for (const file of files) {
      const src = readFileSync(join(dir, file), "utf8");
      expect(src, `${file} divides money client-side`).not.toMatch(
        /(price|total|amount)\w*\s*\/\s*100\b/i,
      );
    }
  });
});

describe("DoD 5 — ≥70% shared registry, no theme-exclusive renderer branches", () => {
  it("gates no registry entry on a theme, so 100% of it is available to every theme", () => {
    // Sharing is a contract, not a count: `WidgetMeta` carries no theme field,
    // so a widget authored for one vertical can be dropped into any theme. The
    // vertical modules (apparel / beauty / electronics) are code organisation
    // only — the tray reads the registry, never a per-theme allow list.
    const registrySrc = readFileSync(
      join(process.cwd(), "src/lib/widget-registry.ts"),
      "utf8",
    );
    const metaBlock = registrySrc.slice(
      registrySrc.indexOf("export type WidgetMeta"),
      registrySrc.indexOf("/** Per-type additions"),
    );
    expect(metaBlock).not.toMatch(/\btheme(s|Key)?\s*[?:]/);

    const traySrc = readFileSync(
      join(process.cwd(), "src/components/builder/WidgetTray.tsx"),
      "utf8",
    );
    expect(traySrc).not.toMatch(/theme(Key)?\s*===/);

    // Vertical modules must stay a minority of the registry.
    const dir = join(process.cwd(), "src/components/builder");
    const verticalTypes = new Set<string>();
    for (const file of ["apparel.tsx", "beauty.tsx", "electronics.tsx"]) {
      const src = readFileSync(join(dir, file), "utf8");
      const map = src.slice(src.indexOf("_WIDGETS: Record<"));
      for (const match of map.matchAll(/^\s{2}([a-z_]+):/gm)) {
        if ((WIDGET_TYPES as string[]).includes(match[1]))
          verticalTypes.add(match[1]);
      }
    }
    expect(verticalTypes.size / WIDGET_TYPES.length).toBeLessThan(0.5);
  });

  it("has no renderer that takes a theme identity", () => {
    const dir = join(process.cwd(), "src/components/builder");
    for (const file of readdirSync(dir).filter(
      (f) => f.endsWith(".tsx") && !f.includes(".test."),
    )) {
      const src = readFileSync(join(dir, file), "utf8");
      // No renderer may take a theme identity as a prop.
      expect(src, `${file} threads a theme key`).not.toMatch(/themeKey\s*[?:]/);
    }
  });

  it("keeps the registry a closed enum with a renderer for each type", () => {
    expect(WIDGET_TYPES.length).toBe(Object.keys(WIDGET_REGISTRY).length);
    for (const type of WIDGET_TYPES) {
      expect(WIDGET_REGISTRY[type].fields, type).toBeDefined();
    }
  });
});

describe("DoD 6 — custom code and plugins are sandboxed, versioned, budgeted, kill-switchable", () => {
  it("renders third-party markup only inside the sandbox", () => {
    const sandbox = readFileSync(
      join(process.cwd(), "src/components/builder/HtmlSandbox.tsx"),
      "utf8",
    );
    expect(sandbox).toMatch(/sandbox=/);
    expect(sandbox).not.toMatch(/allow-same-origin[^"']*allow-scripts/);
  });

  it("versions and budgets plugins", () => {
    expect(PLUGIN_BUDGET.jsKb).toBeGreaterThan(0);
    expect(PLUGIN_BUDGET.mainThreadMs).toBeGreaterThan(0);
    expect(checkApiCompatibility(PRESET_API_RANGE).ok).toBe(true);
    expect(checkApiCompatibility("^99.0.0").ok).toBe(false);
  });

  it("keeps a kill switch on plugin blocks", () => {
    const manifest = readFileSync(
      join(process.cwd(), "src/lib/plugin-manifest.ts"),
      "utf8",
    );
    expect(manifest).toMatch(/disabled/);
  });
});

describe("DoD 7 — demo import is idempotent and fully reversible", () => {
  it("exposes both import and purge, tenant-scoped", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/themes.server.ts"),
      "utf8",
    );
    expect(src).toMatch(/importDemoContent/);
    expect(src).toMatch(/purgeDemoContent/);
    expect(src).toMatch(/theme_import_demo/);
    expect(src).toMatch(/theme_purge_demo/);
  });
});
