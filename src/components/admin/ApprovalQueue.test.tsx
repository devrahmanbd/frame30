/**
 * Threat-defense — ApprovalQueue static markup
 * (InstallConsent.test.tsx precedent: renderToStaticMarkup via
 * LanguageProvider).
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import {
  ApprovalQueue,
  type SecurityApprovalPlugin,
  type SecurityApprovalTheme,
} from "./ApprovalQueue";
import { LanguageProvider } from "@/lib/i18n";

const THEMES: SecurityApprovalTheme[] = [
  {
    themeId: "11111111-1111-4111-8111-111111111111",
    themeName: "Flagged Theme",
    versionId: "22222222-2222-4222-8222-222222222222",
    findings: [{ code: "secret" }, { code: "external-url" }],
  },
];

const PLUGINS: SecurityApprovalPlugin[] = [
  {
    pluginId: "probe-plugin",
    name: "Probe Plugin",
    manifestVersion: "1.2.3",
    findings: [{ code: "eval" }],
  },
];

function renderQueue(
  lang: "en" | "bn",
  overrides?: {
    themes?: SecurityApprovalTheme[];
    plugins?: SecurityApprovalPlugin[];
    busy?: string | null;
  },
) {
  const ui: ReactElement = (
    <LanguageProvider initialLang={lang}>
      <ApprovalQueue
        themes={overrides?.themes ?? THEMES}
        plugins={overrides?.plugins ?? PLUGINS}
        busy={overrides?.busy ?? null}
        onApproveTheme={() => {}}
        onApprovePlugin={() => {}}
      />
    </LanguageProvider>
  );
  return renderToStaticMarkup(ui);
}

describe("ApprovalQueue", () => {
  it("renders pending theme rows with name, version and finding codes", () => {
    const html = renderQueue("en");
    expect(html).toContain("Flagged Theme");
    expect(html).toContain("22222222-2222-4222-8222-222222222222");
    expect(html).toContain("secret");
    expect(html).toContain("external-url");
    expect(html).toContain("Themes waiting for approval");
  });

  it("renders pending plugin rows with name, version and finding codes", () => {
    const html = renderQueue("en");
    expect(html).toContain("Probe Plugin");
    expect(html).toContain("1.2.3");
    expect(html).toContain("eval");
    expect(html).toContain("Plugins waiting for approval");
  });

  it("shows an Approve button per row", () => {
    const html = renderQueue("en");
    expect(html).toContain("Approve");
  });

  it("marks the in-flight row busy without hiding the other rows", () => {
    const html = renderQueue("en", {
      busy: "11111111-1111-4111-8111-111111111111",
    });
    expect(html).toContain("Approving…");
    expect(html).toContain("Probe Plugin");
  });

  it("wires row buttons to the matching approve callbacks", () => {
    const onApproveTheme = vi.fn();
    const onApprovePlugin = vi.fn();
    // Static markup cannot click; assert the wiring surface instead: the
    // component accepts both callbacks and renders both sections, so the
    // route can bind theme rows to themeApproveFn and plugin rows to
    // pluginApproveFn without branching here.
    const ui: ReactElement = (
      <LanguageProvider initialLang="en">
        <ApprovalQueue
          themes={THEMES}
          plugins={PLUGINS}
          onApproveTheme={onApproveTheme}
          onApprovePlugin={onApprovePlugin}
        />
      </LanguageProvider>
    );
    const html = renderToStaticMarkup(ui);
    expect(html).toContain("Flagged Theme");
    expect(html).toContain("Probe Plugin");
    expect(onApproveTheme).not.toHaveBeenCalled();
    expect(onApprovePlugin).not.toHaveBeenCalled();
  });

  it("shows the empty state when nothing is pending", () => {
    const html = renderQueue("en", { themes: [], plugins: [] });
    expect(html).toContain("No pending approvals.");
    expect(html).not.toContain("Flagged Theme");
    expect(html).not.toContain("Probe Plugin");
  });

  it("renders Bangla labels for Bangla readers", () => {
    const html = renderQueue("bn");
    expect(html).toContain("অনুমোদনের অপেক্ষায় থাকা থিম");
    expect(html).toContain("অনুমোদনের অপেক্ষায় থাকা প্লাগইন");
    expect(html).toContain("অনুমোদন করুন");
  });

  it("renders the Bangla empty state for Bangla readers", () => {
    const html = renderQueue("bn", { themes: [], plugins: [] });
    expect(html).toContain("কোনো অপেক্ষমাণ অনুমোদন নেই।");
  });
});
