/**
 * Threat-defense — ThemeApprovalBadge static markup
 * (InstallConsent.test.tsx precedent: renderToStaticMarkup).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import { ThemeApprovalBadge } from "./ThemeApproval";

function renderBadge() {
  const ui: ReactElement = (
    <ThemeApprovalBadge findings={[{ code: "secret" }]} onApprove={() => {}} />
  );
  return renderToStaticMarkup(ui);
}

describe("ThemeApprovalBadge", () => {
  it("badges the theme and names the findings", () => {
    const html = renderBadge();
    expect(html).toContain("Needs approval");
    expect(html).toContain("secret");
    expect(html).toContain("Approve");
  });
});
