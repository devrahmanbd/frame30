/**
 * Legacy PageBuilder breakpoint switch — preview-only gate (TDD RED-first).
 *
 * Audit finding: the tablet/mobile switch only changes the canvas width
 * (DEVICE_WIDTH) while looking like a layered-editing switch. Tablet/mobile
 * edits silently mutate the same shared values — the legacy BuilderDoc has
 * no `bp` override layers (unlike the studio path, where `inheritanceOf`
 * resolves mobile ← tablet ← desktop). Layering legacy writes would change
 * the doc shape + save format, so the fix is an explicit gate+label: the
 * switch must read as preview-only and point at Studio for responsive
 * layers, while still driving the canvas width exactly as before.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PageBuilder } from "./PageBuilder";
import { DEVICE_WIDTH } from "@/lib/page-builder";

function markup(): string {
  return renderToStaticMarkup(
    <PageBuilder
      doc={{ sections: [] }}
      onChange={() => undefined}
      title="Test page"
    />,
  );
}

describe("PageBuilder breakpoint switch is preview-only", () => {
  it("labels the device switch as preview width, pointing at Studio for layers", () => {
    const html = markup();
    expect(html).toContain("Preview width");
    expect(html).toMatch(/preview only/i);
    expect(html).toMatch(/responsive layers live in Studio/i);
  });

  it("exposes the switch as a group so assistive tech gets the preview-only context", () => {
    expect(markup()).toContain('role="group"');
  });

  it("warns on every device button that edits apply to every size", () => {
    const html = markup();
    for (const device of ["desktop", "tablet", "mobile"]) {
      expect(html, device).toContain(`${device} preview`);
    }
    expect(html).toMatch(/edits apply to every size/i);
  });

  it("keeps driving the canvas width from the switch (behavior preserved)", () => {
    expect(markup()).toContain(`width:${DEVICE_WIDTH.desktop}px`);
  });
});
