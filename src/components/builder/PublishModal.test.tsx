/**
 * M4 / review F4 — the publish gate SURFACES the declined-template warning.
 *
 * The publish gate appends a `warn` issue when the theme does not design a
 * body for the selected template (`src/routes/_authenticated/dashboard/builder.tsx`).
 * The modal used to render the warning's COUNT only — the merchant could
 * see that something was wrong and not WHAT — so the declined template was
 * named in the builder's checklist drawer and nowhere in the publish gate.
 *
 * This suite renders the modal: the warning's TEXT must be there, next to
 * the count, and the publish button must still be enabled (a warning never
 * blocks a publish).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PublishModal } from "./PublishModal";
import { UNSUPPORTED_TEMPLATE_TITLE } from "@/components/store/ThemePreviewFrame";

const DECLINED = `${UNSUPPORTED_TEMPLATE_TITLE} — Cart`;

/** The modal's own publish button — its attributes, not its class list. */
function publishButton(markup: string): string {
  const button = [
    ...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g),
  ].find(([, , inner]) => inner.trim() === "Publish");
  return button?.[1] ?? "";
}

describe("the publish modal surfaces the declined-template warning", () => {
  it("renders the warning's TEXT, not only its count", () => {
    const markup = renderToStaticMarkup(
      createElement(PublishModal, {
        open: true,
        onClose: () => undefined,
        onPublish: () => undefined,
        issues: [{ level: "warn", sectionId: null, message: DECLINED }],
        templateName: "Cart",
        hasChanges: true,
      }),
    );
    // The count…
    expect(markup).toContain("1 warning(s)");
    // …AND the message: the merchant can read WHICH template their theme
    // designs no body for.
    expect(markup).toContain(DECLINED);
    expect(markup).toContain("Cart");
  });

  it("a warning never blocks the publish", () => {
    const markup = renderToStaticMarkup(
      createElement(PublishModal, {
        open: true,
        onClose: () => undefined,
        onPublish: () => undefined,
        issues: [{ level: "warn", sectionId: null, message: DECLINED }],
        templateName: "Cart",
        hasChanges: true,
      }),
    );
    const publish = publishButton(markup);
    // The publish button is present and NOT disabled.
    expect(publish).toBeDefined();
    expect(publish).not.toMatch(/\sdisabled(=|\s|>)/);
  });

  it("an ERROR still blocks the publish and still names itself", () => {
    const markup = renderToStaticMarkup(
      createElement(PublishModal, {
        open: true,
        onClose: () => undefined,
        onPublish: () => undefined,
        issues: [
          { level: "error", sectionId: "s-1", message: "The heading is empty" },
        ],
        templateName: "Cart",
        hasChanges: true,
      }),
    );
    expect(markup).toContain("The heading is empty");
    expect(publishButton(markup)).toMatch(/\sdisabled(=|\s|>)/);
  });
});
