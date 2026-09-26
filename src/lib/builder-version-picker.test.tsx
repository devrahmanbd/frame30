/**
 * B1 — Builder version picker (WF-20).
 *
 * RED-first: the schedule form must let the merchant pick WHICH version to
 * schedule instead of hardcoding `versions[0]`, while rollback keeps
 * dispatching through the existing rollback mutation.
 * Precedents: cart.test.tsx:13 (renderToStaticMarkup), StoreHeader.test.tsx:119
 * (source asserts for wiring that cannot boot a router in node env).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { VersionTimeline } from "@/components/builder/VersionTimeline";
import { LanguageProvider } from "@/lib/i18n";

const BUILDER_SRC = () =>
  readFileSync("src/routes/_authenticated/dashboard/builder.tsx", "utf8");

function renderHistory() {
  // VersionTimeline renders the persisted revision list unconditionally
  // (HistoryPanel keeps revisions behind its Revisions tab, invisible to
  // static markup); both dispatch restore through the same rollback mutation
  // the builder wires at onRestore/restore.mutate.
  return renderToStaticMarkup(
    <LanguageProvider initialLang="en">
      <VersionTimeline
        versions={[
          {
            id: "v-1",
            version: 1,
            status: "draft",
            note: "First",
            createdAt: new Date("2026-09-01T10:00:00Z").toISOString(),
            rollbackOf: null,
          },
          {
            id: "v-2",
            version: 2,
            status: "draft",
            note: null,
            createdAt: new Date("2026-09-02T10:00:00Z").toISOString(),
            rollbackOf: null,
          },
        ]}
        schedules={[]}
        busy={false}
        onRollback={() => {}}
        onCancelSchedule={() => {}}
      />
    </LanguageProvider>,
  );
}

describe("B1 — version picker (WF-20)", () => {
  it("renders the seeded revision list with per-version restore actions", () => {
    const html = renderHistory();
    expect(html).toContain("v1");
    expect(html).toContain("v2");
    expect(html).toContain("Restore");
  });

  it("offers a version selector in the schedule form (no hardcoded versions[0])", () => {
    const src = BUILDER_SRC();
    // Bilingual selector bound to the workspace version list.
    expect(src).toMatch(/schedule-version/);
    expect(src).toMatch(/workspace\.data\?\.versions/);
    // The schedule mutation must consume the picked version, not only the
    // first row.
    expect(src).toMatch(/scheduledVersionId|selectedVersionId|scheduleVersion/);
  });

  it("keeps rollback + schedule wired to the existing server mutations", () => {
    const src = BUILDER_SRC();
    expect(src).toContain("builderRollbackFn");
    expect(src).toContain("builderScheduleFn");
    expect(src).toContain("restore.mutate");
    expect(src).toContain("scheduleRelease.mutate");
    // Rollback path passes the picked revision id through.
    expect(src).toMatch(/rollback\(\{\s*data:\s*\{\s*versionId/);
  });
});
