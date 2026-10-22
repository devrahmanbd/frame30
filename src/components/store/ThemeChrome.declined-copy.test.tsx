/**
 * S7 — shopper copy names the template in human words, never its raw key.
 *
 * The declined-template frame keeps the platform surface but names the state.
 * Its label must read "Search results", not "search", and must still carry
 * the machine key only in `data-fq-template` for the editor/publish gate.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeChrome } from "./ThemeChrome";
import { TEMPLATE_KEYS } from "@/lib/builder-ast";
import { templateDisplayName } from "@/lib/template-display";

const EMPTY_AST = { header: [], main: [], footer: [] };

describe("S7 — declined-template copy is humanised", () => {
  it("has a human label for every template key", () => {
    for (const key of TEMPLATE_KEYS) {
      const label = templateDisplayName(key);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(key);
      expect(label).not.toContain("_");
    }
  });

  it("names the search template in prose and keeps the key as data", () => {
    const markup = renderToStaticMarkup(
      <ThemeChrome
        template="search"
        ast={EMPTY_AST}
        tokens={null}
        fallback={<div>FALLBACK-MARKER</div>}
      />,
    );
    expect(markup).toContain("does not design the Search results page");
    expect(markup).not.toContain("does not design the search page");
    expect(markup).toContain('data-fq-template="search"');
  });

  it("names the archive template in prose", () => {
    const markup = renderToStaticMarkup(
      <ThemeChrome
        template="archive"
        ast={EMPTY_AST}
        tokens={null}
        storeName="Demo Store"
        fallback={<div>FALLBACK-MARKER</div>}
      />,
    );
    expect(markup).toContain(
      "Demo Store — this theme does not design the Archive page",
    );
    expect(markup).not.toContain("does not design the archive page");
  });
});
