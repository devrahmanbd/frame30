/**
 * Store welcome plate — TDD: bilingual heading + host-aware search CTA.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WelcomePlate } from "./StoreWelcome";

describe("WelcomePlate", () => {
  it("renders the welcome heading with a search CTA (path host)", () => {
    const html = renderToStaticMarkup(
      createElement(WelcomePlate, {
        name: "Demo Store",
        base: "/store/demo-store",
      }),
    );
    expect(html).toContain("Welcome to Framique");
    expect(html).toContain("/store/demo-store/search");
  });

  it("links root-relative on custom hosts", () => {
    const html = renderToStaticMarkup(
      createElement(WelcomePlate, { name: "Demo Store", base: "" }),
    );
    expect(html).toContain('href="/search"');
  });
});
