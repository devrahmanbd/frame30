/**
 * Phase 2B — Globals editor binding.
 *
 * The editor is a thin view over `ThemeGlobals`: every colour row binds to
 * `var(--fq-g-<id>)`, every font row to `var(--fq-gf-<id>)`, and the swatches
 * resolve through those same variables (the preview strip defines the real
 * custom properties). These cases pin the binding output — the exact codes
 * merchants paste into controls and the CSS the theme surface emits.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_GLOBALS,
  globalColorVar,
  globalFontVar,
  globalsToCss,
  type ThemeGlobals,
} from "@/lib/theme-globals";
import { GlobalsEditor } from "./GlobalsEditor";

const noop = () => undefined;

function render(globals: ThemeGlobals): string {
  return renderToStaticMarkup(
    <GlobalsEditor globals={globals} onChange={noop} />,
  );
}

describe("GlobalsEditor binding", () => {
  it("binds every default colour to its var(--fq-g-*) code with the value", () => {
    const html = render(DEFAULT_GLOBALS);
    for (const color of DEFAULT_GLOBALS.colors) {
      expect(html).toContain(`var(${globalColorVar(color.id)})`);
      expect(html).toContain(color.value);
      expect(html).toContain(color.name);
    }
    expect(html).toContain("var(--fq-g-primary)");
  });

  it("binds every default font to its var(--fq-gf-*) code with the family", () => {
    const html = render(DEFAULT_GLOBALS);
    for (const font of DEFAULT_GLOBALS.fonts) {
      expect(html).toContain(`var(${globalFontVar(font.id)})`);
      expect(html).toContain(font.family);
    }
    expect(html).toContain("var(--fq-gf-heading)");
  });

  it("emits exactly the custom properties the theme surface defines", () => {
    const html = render(DEFAULT_GLOBALS);
    const css = globalsToCss(DEFAULT_GLOBALS);
    expect(css["--fq-g-primary"]).toBe("#0F766E");
    expect(css["--fq-gf-heading"]).toContain("Noto Sans Bengali");
    // Every surface property has a matching binding code in the editor.
    for (const key of Object.keys(css)) {
      expect(html).toContain(`var(${key})`);
    }
  });

  it("resolves swatches through the binding, not the raw value", () => {
    const html = render(DEFAULT_GLOBALS);
    expect(html).toContain("background-color:var(--fq-g-primary)");
    expect(html).toContain("font-family:var(--fq-gf-heading)");
  });

  it("renders edited globals with their new bindings", () => {
    const html = render({
      colors: [{ id: "brandx", name: "Brand X", value: "#123456" }],
      fonts: [
        { id: "display", name: "Display", family: "Inter", weight: "700" },
      ],
    });
    expect(html).toContain("var(--fq-g-brandx)");
    expect(html).toContain("#123456");
    expect(html).toContain("var(--fq-gf-display)");
    expect(html).toContain("Inter");
  });

  it("notes the favicon as a site asset and offers a defaults reset", () => {
    const html = render(DEFAULT_GLOBALS);
    expect(html).toContain("SEO");
    expect(html).toContain("Reset to defaults");
  });
});
