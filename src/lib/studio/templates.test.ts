import { describe, expect, it } from "vitest";
import { WIDGET_BY_KEY } from "./catalog";
import {
  TEMPLATE_CATEGORIES,
  builtInTemplates,
  instantiate,
} from "./templates";
import type { StudioNode } from "./model";

/** Every template node must reference a registered widget. */
function assertKnownWidgets(nodes: StudioNode[], templateId: string) {
  for (const node of nodes) {
    expect(
      WIDGET_BY_KEY[node.el],
      `${templateId}: unknown widget ${node.el}`,
    ).toBeDefined();
    assertKnownWidgets(node.children ?? [], templateId);
  }
}

describe("builtInTemplates", () => {
  const templates = builtInTemplates();

  it("covers cart, header and footer categories", () => {
    const ids = templates.map((t) => t.id);
    for (const id of [
      "b-cart",
      "b-header",
      "b-footer",
      "b-faq-rich",
      "b-testimonial-carousel",
      "b-hero-split",
    ]) {
      expect(ids).toContain(id);
    }
    expect(TEMPLATE_CATEGORIES).toContain("cart");
  });

  it("every template uses registered widgets with fresh ids on instantiate", () => {
    for (const template of templates) {
      assertKnownWidgets(template.nodes, template.id);
      const seen = new Set<string>();
      const walk = (nodes: StudioNode[]) => {
        for (const node of nodes) {
          expect(node.id).toBeTruthy();
          seen.add(node.id);
          walk(node.children ?? []);
        }
      };
      walk(instantiate(template));
      const count = (nodes: StudioNode[]): number =>
        nodes.reduce((n, node) => n + 1 + count(node.children ?? []), 0);
      expect(seen.size).toBe(count(instantiate(template)));
    }
  });

  it("rich templates carry authored content, not empty defaults", () => {
    const byId = new Map(templates.map((t) => [t.id, t]));
    const faq = JSON.stringify(instantiate(byId.get("b-faq-rich")!));
    expect(faq).toContain("How long does delivery take?");
    const slider = JSON.stringify(
      instantiate(byId.get("b-testimonial-carousel")!),
    );
    expect(slider).toContain("Nusrat A.");
    const hero = JSON.stringify(instantiate(byId.get("b-hero-split")!));
    expect(hero).toContain("Craft you can feel");
  });
});
