/**
 * Threat-defense — PluginApprovalBadge static markup
 * (InstallConsent.test.tsx precedent: renderToStaticMarkup via
 * LanguageProvider).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import { PluginApprovalBadge } from "./PluginApproval";
import { LanguageProvider } from "@/lib/i18n";

function renderBadge(lang: "en" | "bn") {
  const ui: ReactElement = (
    <LanguageProvider initialLang={lang}>
      <PluginApprovalBadge
        findings={[{ code: "secret" }]}
        onApprove={() => {}}
      />
    </LanguageProvider>
  );
  return renderToStaticMarkup(ui);
}

describe("PluginApprovalBadge", () => {
  it("badges the plugin and names the findings (English)", () => {
    const html = renderBadge("en");
    expect(html).toContain("Needs approval");
    expect(html).toContain("secret");
    expect(html).toContain("Approve");
  });

  it("renders Bangla labels for Bangla readers", () => {
    const html = renderBadge("bn");
    expect(html).toContain("অনুমোদন প্রয়োজন");
    expect(html).toContain("অনুমোদন করুন");
  });
});
