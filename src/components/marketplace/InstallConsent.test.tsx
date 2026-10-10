/**
 * Threat-defense — InstallConsent shows the external-URL inventory.
 *
 * Vitest env node — static markup via renderToStaticMarkup
 * (CollectionView.test.tsx precedent). InstallConsent needs useLang →
 * LanguageProvider.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import { InstallConsent } from "./InstallConsent";
import { LanguageProvider } from "@/lib/i18n";

function renderConsent(externalUrls?: string[]) {
  const ui: ReactElement = (
    <LanguageProvider initialLang="en">
      <InstallConsent
        listingName="Probe Plugin"
        version={{
          id: "v1",
          version: "1.0.0",
          scopes: [],
          changelog: null,
          content_hash: "ab".repeat(32),
          size_bytes: 1024,
          ...(externalUrls ? { externalUrls } : {}),
        }}
        trial={false}
        busy={false}
        onCancel={() => {}}
        onApprove={() => {}}
      />
    </LanguageProvider>
  );
  return renderToStaticMarkup(ui);
}

describe("InstallConsent external-URL inventory", () => {
  it("lists contacted addresses when provided", () => {
    const html = renderConsent(["https://api.example.com/", "https://cdn.example.com/x.js"]);
    expect(html).toContain("https://api.example.com/");
    expect(html).toContain("https://cdn.example.com/x.js");
  });

  it("shows no inventory section when absent", () => {
    const html = renderConsent();
    expect(html).not.toContain("external addresses");
  });
});
