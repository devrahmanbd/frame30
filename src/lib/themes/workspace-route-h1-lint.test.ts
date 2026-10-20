/**
 * ITEM 1 — the WORKSPACE loader's lint must know which template it lints.
 *
 * `loadWorkspace` (`src/lib/themes.server.ts:284`) builds the editor's issue
 * map. It linted every template WITHOUT the template key, so
 * `routeSuppliesH1(template)` (`src/lib/builder-ast.ts:77`) could not be
 * honoured: a template whose `<h1>` belongs to the ROUTE — product,
 * collection, account, page, blog, search (`ROUTE_H1_TEMPLATES`,
 * `src/lib/builder-ast.ts:68-75`) — was told "No primary heading on this
 * template." (`src/lib/builder-ast.ts:8431`).
 *
 * The warning is merchant-visible and wrong there: a merchant who obeys it
 * adds a heading widget, and on a path host that is a SECOND `<h1>` next to
 * the route's own.
 *
 * This suite pins the WORKSPACE path (the loader's `issues` map). The editor
 * hook path is pinned by `src/hooks/use-builder-editor.route-h1.test.tsx`.
 *
 * The rule is NOT weakened for templates that genuinely own their heading:
 * `index` still warns, with exactly the same issue as before.
 *
 * No network, no real database: the workspace is read through the fakeDb
 * fixture, exactly as `activation-latency.test.ts` does.
 */
import { describe, expect, it, vi } from "vitest";
import { fakeDb } from "../__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "../__fixtures__/test-doubles";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("../observability.server", () => rec.holder!.observability);
vi.mock("../rate-limit.server", () => allowAllRateLimits());

const { loadWorkspace } = await import("../themes.server");
const { ROUTE_H1_TEMPLATES } = await import("../builder-ast");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const THEME = "33333333-3333-3333-3333-333333333333";

const NO_HEADING = "No primary heading on this template.";

/**
 * A route-owned template body with NO heading claimant: `breadcrumb` and
 * `page_content` are `heading: false` in the CATALOG, so this body carries
 * no h1 claimant at all.
 */
const PAGE_BODY = {
  header: [],
  main: [
    { id: "s1", type: "breadcrumb", props: {} },
    { id: "s2", type: "page_content", props: {} },
  ],
  footer: [],
};

/** A theme whose `index` template is empty (so it owns — and lacks — an h1). */
function workspaceDb() {
  return fakeDb({
    tables: {
      store_themes: [
        {
          id: THEME,
          merchant_id: MERCHANT,
          name: "Live",
          is_active: false,
          published_version_id: null,
        },
      ],
      theme_drafts: [
        {
          merchant_id: MERCHANT,
          theme_id: THEME,
          revision: 1,
          templates: {
            index: { header: [], main: [], footer: [] },
            page: PAGE_BODY,
          },
          tokens: {},
          updated_at: new Date().toISOString(),
        },
      ],
      theme_versions: [],
      theme_schedules: [],
    },
  });
}

describe("loadWorkspace — the workspace lint is keyed by template", () => {
  it("never warns about the primary heading on a route-owned template", async () => {
    const db = workspaceDb();
    const workspace = await loadWorkspace(db.asClient(), MERCHANT);
    for (const key of ROUTE_H1_TEMPLATES) {
      const headingIssues = (workspace.issues[key] ?? []).filter(
        (issue) => issue.message === NO_HEADING,
      );
      expect(headingIssues, `template ${key}`).toEqual([]);
    }
  });

  it("leaves the route-owned page template completely clean", async () => {
    const db = workspaceDb();
    const workspace = await loadWorkspace(db.asClient(), MERCHANT);
    // Not just "no heading warning": the keyed lint introduces no other
    // warning either, so the merchant's issue panel stays empty.
    expect(workspace.issues.page).toEqual([]);
  });

  it("still warns, exactly as before, on a template that owns its h1", async () => {
    const db = workspaceDb();
    const workspace = await loadWorkspace(db.asClient(), MERCHANT);
    // `index` is NOT a route-owned template: nothing supplies its heading, so
    // the warning must survive the fix — unchanged in level, section and text.
    expect(workspace.issues.index).toContainEqual({
      level: "warn",
      sectionId: null,
      message: NO_HEADING,
    });
  });
});
