/**
 * Store welcome plate — TDD: bilingual heading + host-aware search CTA.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WelcomePlate } from "./StoreWelcome";

describe("WelcomePlate (h1+h3 only)", () => {
  it("renders exactly one h1 and one h3, nothing else", () => {
    const html = renderToStaticMarkup(
      createElement(WelcomePlate, {
        name: "Demo Store",
        base: "/store/demo-store",
      }),
    );
    expect(html).toContain("Welcome to Framique");
    expect((html.match(/<h1/g) || []).length).toBe(1);
    expect((html.match(/<h3/g) || []).length).toBe(1);
    expect(html).not.toContain("<header");
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("<a ");
  });
});
