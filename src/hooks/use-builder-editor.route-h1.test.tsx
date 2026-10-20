/**
 * ITEM 1 — the editor's lint must know WHICH template it is linting.
 *
 * `lintTemplate(ast)` without the template key cannot honour
 * `routeSuppliesH1(template)` (`src/lib/builder-ast.ts:77`), so a template
 * whose `<h1>` belongs to the ROUTE — product, collection, account, page,
 * blog, search (`ROUTE_H1_TEMPLATES`, `src/lib/builder-ast.ts:68-75`) — was
 * told "No primary heading on this template." (`src/lib/builder-ast.ts:8431`).
 *
 * That warning is merchant-visible and it is WRONG there: a merchant who
 * obeys it adds a heading widget, and on a path host the result is a SECOND
 * `<h1>` next to the route's own.
 *
 * The editor hook (`src/hooks/use-builder-editor.ts:635`) is one of the two
 * call sites that linted without the key; the workspace loader
 * (`src/lib/themes.server.ts:284`) is the other. This suite pins the EDITOR
 * path (the hook's `issues` map); the workspace path is pinned by
 * `src/lib/themes/workspace-route-h1-lint.test.ts`.
 *
 * The rule is NOT weakened for templates that genuinely own their heading:
 * `index` (and every other non-route template) still warns, exactly as
 * before, with exactly the same issue.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_TOKENS,
  ROUTE_H1_TEMPLATES,
  lintTemplate,
  type AstIssue,
  type Section,
  type SectionType,
  type TemplateKey,
  type ThemeAst,
  type ThemeTemplates,
} from "@/lib/builder-ast";
import { useBuilderEditor, type EditorDoc } from "./use-builder-editor";

type Issues = Record<TemplateKey, AstIssue[]>;

const NO_HEADING = "No primary heading on this template.";

/** The exact issue the pre-fix editor produced for a heading-less template. */
const HEADING_WARNING: AstIssue = {
  level: "warn",
  sectionId: null,
  message: NO_HEADING,
};

/**
 * The probe captures what the hook returns. It is read back through a
 * function so the compiler keeps the declared type across the render
 * boundary (a direct read would be narrowed to `null` by the reset below).
 */
let captured: Issues | null = null;

function readIssues(): Issues | null {
  return captured;
}

function IssuesProbe({ doc }: { doc: EditorDoc }) {
  const editor = useBuilderEditor(doc, {
    revision: 1,
    onAutosave: async () => undefined,
  });
  captured = editor.issues;
  return null;
}

/** Drive the real hook and return its `issues` map. */
function editorIssues(templates: ThemeTemplates): Issues {
  captured = null;
  const doc: EditorDoc = { templates, tokens: { ...DEFAULT_TOKENS } };
  renderToStaticMarkup(createElement(IssuesProbe, { doc }));
  const issues = readIssues();
  if (!issues) throw new Error("the editor hook never rendered");
  return issues;
}

function section(id: string, type: SectionType): Section {
  return { id, type, props: {} };
}

/** A route-owned template body with NO heading claimant at all. */
function routeOwnedBody(): Section[] {
  // `breadcrumb` and `page_content` are `heading: false` in the CATALOG and
  // both live in the `main` slot, so this body lints clean apart from the
  // heading question the suite is about.
  return [section("s1", "breadcrumb"), section("s2", "page_content")];
}

function templates(over: Partial<ThemeTemplates> = {}): ThemeTemplates {
  return {
    index: { header: [], main: [], footer: [] },
    page: { header: [], main: routeOwnedBody(), footer: [] },
    ...over,
  };
}

describe("useBuilderEditor — the lint is keyed by template", () => {
  it("never warns about the primary heading on a route-owned template", () => {
    const issues = editorIssues(templates());
    for (const key of ROUTE_H1_TEMPLATES) {
      const headingIssues = (issues[key] ?? []).filter(
        (issue) => issue.message === NO_HEADING,
      );
      expect(headingIssues, `template ${key}`).toEqual([]);
    }
  });

  it("leaves the route-owned page template completely clean", () => {
    // Not just "no heading warning": the keyed lint introduces no other
    // warning either, so the merchant's issue panel stays empty.
    const issues = editorIssues(templates());
    expect(issues.page).toEqual([]);
  });

  it("still warns, exactly as before, on a template that owns its h1", () => {
    const issues = editorIssues(templates());
    // `index` is NOT a route-owned template: nothing supplies its heading, so
    // the warning must survive the fix — unchanged in level, section and text.
    expect(issues.index).toContainEqual(HEADING_WARNING);
  });

  it("keeps the unkeyed lint strict (the key is what silences the rule)", () => {
    // The function-level contract the fix relies on: WITHOUT the key the
    // warning is still produced — the fix passes the key, it does not weaken
    // `lintTemplate`.
    const ast: ThemeAst = { header: [], main: routeOwnedBody(), footer: [] };
    expect(lintTemplate(ast)).toContainEqual(HEADING_WARNING);
    expect(lintTemplate(ast, "page")).not.toContainEqual(HEADING_WARNING);
  });

  it("keeps the editor and the lint function in agreement", () => {
    const issues = editorIssues(templates());
    for (const key of Object.keys(issues) as TemplateKey[]) {
      expect(issues[key]).toEqual(lintTemplate(templateAst(key), key));
    }
  });
});

/** The AST the hook lints for a key (the fixture above, by key). */
function templateAst(key: TemplateKey): ThemeAst {
  if (key === "page") return { header: [], main: routeOwnedBody(), footer: [] };
  return { header: [], main: [], footer: [] };
}
