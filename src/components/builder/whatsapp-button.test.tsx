/**
 * WhatsApp page-builder block — theme renderer contract: digits-only wa.me
 * link, official glyph, bubble/bar styles, fail-closed with no phone.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type PropValue, type Section } from "@/lib/builder-ast";
import { WIDGET_COMPONENTS, widgetReader, type WidgetCtx } from "./widgets";

function ctxFor(section: Section): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, "en"),
    link: (href: string) => href,
    Heading: "h2",
    primary: false,
    editing: false,
    locale: "en",
    storeSlug: "test",
    data: undefined,
    renderChildren: () => null,
  };
}

function render(props: Record<string, PropValue>): string {
  const section = { ...newSection("whatsapp_button"), props };
  const Cmp = WIDGET_COMPONENTS.whatsapp_button;
  return renderToStaticMarkup(createElement(Cmp, ctxFor(section)));
}

describe("whatsapp_button theme block", () => {
  it("renders a digits-only wa.me anchor", () => {
    const html = render({
      phone_number: "+880 1540-203662",
      label: "Chat now",
      greeting_message: "Hi!",
      style: "bubble",
      size: "md",
    });
    expect(html).toContain("https://wa.me/8801540203662?text=Hi!");
    expect(html).toContain("Chat now");
    expect(html).toContain('target="_blank"');
  });

  it("renders the bar style with label", () => {
    const html = render({
      phone_number: "8801",
      label: "Order on WhatsApp",
      style: "bar",
    });
    expect(html).toContain("Order on WhatsApp");
    expect(html).toContain("rounded-full");
  });

  it("renders nothing without a phone number", () => {
    expect(render({ phone_number: "" })).toBe("");
    expect(render({})).not.toContain("wa.me");
  });

  it("defaults from the theme catalog", () => {
    const section = newSection("whatsapp_button");
    expect(section.props).toMatchObject({
      label: "Chat on WhatsApp",
      style: "bubble",
      size: "md",
    });
  });
});
