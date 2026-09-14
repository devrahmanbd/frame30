import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_TOKENS,
  SECTION_CATALOG,
  contrastRatio,
  inkOn,
  newSection,
  parseTokens,
  tokensToCss,
  type SectionType,
} from "./builder-ast";
import { WIDGET_COMPONENTS } from "@/components/builder/widgets";
import { SectionRenderer } from "@/components/builder/SectionRenderer";

const TYPES = SECTION_CATALOG.map((e) => e.type);
const STYLES = readFileSync("src/styles.css", "utf8");
const WIDGET_FILES = [
  "widgets",
  "chrome",
  "merch",
  "pdp",
  "collection",
  "cart",
  "apparel",
  "beauty",
  "electronics",
].map((n) => readFileSync(`src/components/builder/${n}.tsx`, "utf8"));
const WIDGET_SRC = WIDGET_FILES.join("\n");

function render(type: SectionType, editing: boolean, locale: "en" | "bn") {
  return renderToStaticMarkup(
    <SectionRenderer section={newSection(type)} editing={editing} locale={locale} />,
  );
}

describe("Phase 1 + 2 widgets — usable by any theme", () => {
  it("registers a component for every catalogue widget", () => {
    for (const type of TYPES) expect(typeof WIDGET_COMPONENTS[type], type).toBe("function");
    expect(Object.keys(WIDGET_COMPONENTS).sort()).toEqual(TYPES.slice().sort());
  });

  for (const type of TYPES) {
    it(`${type} renders with no theme installed`, () => {
      for (const locale of ["en", "bn"] as const) {
        expect(() => render(type, false, locale), `${type}/${locale}`).not.toThrow();
        expect(() => render(type, true, locale), `${type}/${locale}/editing`).not.toThrow();
      }
    });
  }

  it("uses only radius utilities the token layer actually defines", () => {
    const used = new Set(WIDGET_SRC.match(/rounded-fq-[a-z]+/g) ?? []);
    for (const cls of used) {
      const step = cls.replace("rounded-fq-", "");
      expect(STYLES.includes(`--radius-fq-${step}`), cls).toBe(true);
    }
  });

  it("keeps widgets off raw theme variables — the semantic layer is the contract", () => {
    // `--theme-container` is the one geometry token widgets may read directly;
    // colour, radius and type reach them through the semantic tokens instead.
    const direct = [...WIDGET_SRC.matchAll(/--theme-[a-z-]+/g)]
      .map((m) => m[0])
      .filter((v) => v !== "--theme-container");
    expect([...new Set(direct)]).toEqual([]);
  });
});

describe("theme scope — semantic tokens are remapped once, with fallbacks", () => {
  const scope = STYLES.slice(STYLES.indexOf("@utility fq-theme-scope"));
  const block = scope.slice(0, scope.indexOf("\n}"));

  for (const token of [
    "--color-background",
    "--color-foreground",
    "--color-card",
    "--color-primary",
    "--color-primary-foreground",
    "--color-accent",
    "--color-muted",
    "--color-muted-foreground",
    "--color-border",
    "--radius-fq-sm",
    "--radius-fq-md",
    "--radius-fq-lg",
    "--font-sans",
  ]) {
    it(`maps ${token} from the theme`, () => {
      const line = block.split("\n").find((l) => l.trim().startsWith(`${token}:`));
      expect(line, token).toBeTruthy();
      // every mapping must carry a platform fallback so a bare custom theme works
      expect(line!.replace(/^[^:]+:/, "")).toMatch(/var\(--theme-[a-z-]+,\s*.+\)/);
    });
  }
});

describe("token bridge", () => {
  it("emits every variable the scope consumes", () => {
    const css = tokensToCss(DEFAULT_TOKENS);
    for (const key of [
      "--theme-brand",
      "--theme-brand-ink",
      "--theme-accent",
      "--theme-accent-ink",
      "--theme-surface",
      "--theme-ink",
      "--theme-muted",
      "--theme-muted-ink",
      "--theme-border",
      "--theme-radius",
      "--theme-font-body",
    ]) {
      expect(css[key], key).toBeTruthy();
    }
  });

  it("picks readable ink for dark and light brands", () => {
    expect(inkOn("#0F172A", "#0F172A")).toBe("#FFFFFF");
    expect(inkOn("#FFE066", "#0F172A")).toBe("#0F172A");
    expect(contrastRatio("#FFE066", inkOn("#FFE066", "#0F172A"))).toBeGreaterThan(4.5);
  });

  it("survives a custom theme that supplies nothing valid", () => {
    const css = tokensToCss(parseTokens({ brand: "not-a-colour" }));
    expect(css["--theme-brand"]).toBe(DEFAULT_TOKENS.brand);
  });
});
