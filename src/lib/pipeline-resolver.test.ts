/**
 * The ONE resolution pipeline — its contract.
 *
 * **The subject.** The editor canvas, the theme preview and the published
 * storefront used to resolve their ASTs three different ways: the canvas
 * took the merchant's draft and passed no `themeKey` (so it rendered the
 * platform's generic widget), the preview took the theme's source — or a
 * merchant's newest version row — and synthesised a body for every template
 * key the theme did not author, and the storefront took the published
 * pointer and fell back to the route's own surface **silently** when the
 * theme declined the template.
 *
 * **The contract this suite pins.**
 *
 *  1. **One resolver.** `resolveTemplateForHost({ template, variants, tenant,
 *     mode })` is the only way a host turns "a template" into "a body". The
 *     three hosts resolve the SAME AST for the same (store, template, mode):
 *     the HOST is not an input to the resolution, so it cannot change the
 *     answer.
 *  2. **Three modes, three labels.** `draft` (the editor's autosaved
 *     document), `published` (the storefront's pointer) and `source` (the
 *     theme's own builders) — and each is LABELLED, so a preview can say
 *     which of the three the visitor is looking at.
 *  3. **An absent template is ABSENT.** A template the theme does not author
 *     resolves to an explicit `absent` result — never a synthesised body,
 *     never the homepage.
 *  4. **The map's length is the THEME's.** The preview's assembled map for a
 *     theme that authors nine of the ten templates carries nine keys, and the
 *     tenth is absent.
 *  5. **The editor canvas resolves the theme's presentation.** The canvas's
 *     `SectionRenderer` receives a `themeKey` — the same key the widget tray
 *     uses, the storefront uses and the preview uses.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  DEFAULT_TOKENS,
  TEMPLATE_KEYS,
  type Section,
  type SectionBuilder,
  type TemplateKey,
  type ThemeAst,
  type ThemeTemplates,
  type ThemeTokens,
} from "@/lib/builder-ast";
import {
  PIPELINE_MODES,
  PIPELINE_MODE_LABELS,
  resolveEditorDraft,
  resolveTemplateForHost,
  type PipelineSource,
} from "./pipeline-resolver";
import { assemblePreviewTemplates } from "@/lib/theme-preview-nav";
import type { PreviewThemeSource } from "@/lib/theme-preview-nav";
import { previewSourceFor } from "./preview-sources";
import { resolvePublishedTemplate } from "./storefront.server";
import { resolveVariantAst } from "./template-variants";
import { songoskritiPreviewSource } from "@/lib/themes/songoskriti/preview";
import {
  SONGOSKRITI_PREVIEW_QUERY_TERM,
  SONGOSKRITI_PREVIEW_SEARCH_PATH,
  SONGOSKRITI_PREVIEW_SEARCH_TOTAL,
  songoskritiPreviewAccountOverview,
  songoskritiPreviewCart,
  songoskritiPreviewFeed,
  songoskritiPreviewOrders,
} from "@/lib/themes/songoskriti/preview-demo-data";
import { LanguageProvider } from "@/lib/i18n";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
import { CanvasDemoScope } from "@/components/builder/CanvasDemoScope";
import { normalizeSearchParams } from "@/lib/storefront-search";

/** The theme's OWN preview source — the platform's real map. */
const SOURCE_READER = readFileSync(
  new URL("./theme-preview-nav.ts", import.meta.url),
  "utf8",
);

/** A body the theme authored. */
function ast(main: Section[] = []): ThemeAst {
  return { header: [], main, footer: [] };
}

/** One section. */
function section(type: string): Section {
  return { id: `${type}-1`, type: type as Section["type"], props: {} };
}

/** The theme builder the preview port hands each source. */
const buildSection: SectionBuilder = (type, props = {}) => ({
  id: `${type}-1`,
  type,
  props,
});

/** The source's CODE — the comments are stripped, so a scan reads the code
 *  and not the prose that documents it. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/.*$/gm, "");
}

/** The resolved branch of a resolution — a narrow, so the assertions read. */
function resolved(out: ReturnType<typeof resolveTemplateForHost>): {
  ast: ThemeAst;
  tokens: ThemeTokens | null;
  source: PipelineSource;
} {
  if (out.status !== "resolved") {
    throw new Error(`expected a resolved body, got: ${out.reason}`);
  }
  return out;
}

describe("the pipeline resolver — one resolver for the three hosts", () => {
  it("resolves the SAME ast for the same (store, template, mode), whatever the host", () => {
    const variants = { cart: ast([section("cart_lines")]) };
    const editor = resolveTemplateForHost({
      template: "cart",
      variants,
      tenant: "demo",
      mode: "draft",
      host: "editor",
    });
    const preview = resolveTemplateForHost({
      template: "cart",
      variants,
      tenant: "demo",
      mode: "draft",
      host: "preview",
    });
    const storefront = resolveTemplateForHost({
      template: "cart",
      variants,
      tenant: "demo",
      mode: "draft",
      host: "storefront",
    });
    expect(editor.status).toBe("resolved");
    expect(preview.status).toBe("resolved");
    expect(storefront.status).toBe("resolved");
    expect(resolved(preview).ast).toBe(resolved(editor).ast);
    expect(resolved(storefront).ast).toBe(resolved(editor).ast);
    expect(resolved(preview).tokens).toBe(resolved(editor).tokens);
  });

  it("the MAP is the input that changes the answer — a different body resolves differently", () => {
    // The old suite varied host/mode/tenant over ONE map and called that
    // "the three hosts agree"; one code path cannot disagree with itself
    // (review M2). This case varies the MAP and pins that the resolver's
    // output follows it.
    const lines = ast([section("cart_lines")]);
    const summary = ast([section("cart_summary")]);
    const a = resolveTemplateForHost({
      template: "cart",
      variants: { cart: lines },
      tenant: "demo",
      mode: "published",
      host: "storefront",
    });
    const b = resolveTemplateForHost({
      template: "cart",
      variants: { cart: summary },
      tenant: "demo",
      mode: "published",
      host: "storefront",
    });
    expect(resolved(a).ast).toBe(lines);
    expect(resolved(b).ast).toBe(summary);
    expect(resolved(a).ast).not.toBe(resolved(b).ast);
  });

  it("the three modes are exactly draft, published and source — and each is labelled", () => {
    expect([...PIPELINE_MODES].sort()).toEqual([
      "draft",
      "published",
      "source",
    ]);
    for (const mode of PIPELINE_MODES) {
      const label = PIPELINE_MODE_LABELS[mode];
      expect(typeof label, `${mode} must be labelled`).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
    // The labels are DISTINCT — a labelled source that says the same thing
    // for two modes is not labelled.
    expect(new Set(Object.values(PIPELINE_MODE_LABELS)).size).toBe(
      PIPELINE_MODES.length,
    );
  });

  it("every mode resolves the same body from the same map", () => {
    const variants = { cart: ast([section("cart_lines")]) };
    const seen = PIPELINE_MODES.map((mode) => {
      const out = resolveTemplateForHost({
        template: "cart",
        variants,
        tenant: "demo",
        mode,
        host: "storefront",
      });
      expect(out.status).toBe("resolved");
      return out;
    });
    expect(resolved(seen[1]!).ast).toBe(resolved(seen[0]!).ast);
    expect(resolved(seen[2]!).ast).toBe(resolved(seen[0]!).ast);
    // … and the SOURCE label differs — that is the only difference.
    expect(resolved(seen[1]!).source.mode).toBe("published");
    expect(resolved(seen[2]!).source.mode).toBe("source");
  });

  it("a template the theme does not author resolves to an explicit ABSENT result", () => {
    const out = resolveTemplateForHost({
      template: "cart",
      variants: {},
      tenant: "demo",
      mode: "published",
      host: "storefront",
    });
    expect(out.status).toBe("absent");
    // Never the homepage, never a synthesised body.
    expect(out).not.toHaveProperty("ast");
    expect((out as { reason: string }).reason.length).toBeGreaterThan(0);
  });

  it("an absent result is ABSENT — the resolver never falls back to the homepage", () => {
    const out = resolveTemplateForHost({
      template: "index",
      variants: {},
      tenant: "demo",
      mode: "source",
      host: "preview",
    });
    expect(out.status).toBe("absent");
    expect(out).not.toHaveProperty("ast");
  });

  it("a VARIANT resolves through the variant rule — the variant first, then its base", () => {
    const variantBody = ast([section("blog_terms")]);
    const baseBody = ast([section("blog_archive")]);
    const variants = {
      blog: baseBody,
      blog_listing: variantBody,
    };
    const out = resolveTemplateForHost({
      template: "blog_listing",
      variants,
      tenant: "demo",
      mode: "source",
      host: "preview",
    });
    expect(out.status).toBe("resolved");
    expect(resolved(out).ast).toBe(variantBody);
    // … and a variant the theme does not author falls back to its BASE —
    // the storefront's own rule (`resolveVariantAst`).
    const base = resolveTemplateForHost({
      template: "blog_article",
      variants,
      tenant: "demo",
      mode: "source",
      host: "preview",
    });
    expect(base.status).toBe("resolved");
    expect(resolved(base).ast).toBe(baseBody);
  });
});

describe("the three hosts consume the resolver — their OUTPUT follows the map", () => {
  it("the preview source resolves through `mode: source` and its body follows the artifact", () => {
    const lines = ast([section("cart_lines")]);
    const summary = ast([section("cart_summary")]);
    const a = previewSourceFor("acme", undefined, [
      { key: "acme", tokens: {}, templates: { cart: lines } },
    ]);
    const b = previewSourceFor("acme", undefined, [
      { key: "acme", tokens: {}, templates: { cart: summary } },
    ]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // The host's public output — not the resolver's return value. The
    // stored AST goes through `parseTemplates`, which normalises props, so
    // the assertion is on the resolved SECTION, not raw prop identity.
    expect(a!.main("cart", buildSection)!.map((s) => s.type)).toEqual([
      "cart_lines",
    ]);
    expect(b!.main("cart", buildSection)!.map((s) => s.type)).toEqual([
      "cart_summary",
    ]);
    expect(a!.main("cart", buildSection)).not.toEqual(
      b!.main("cart", buildSection),
    );
    // An absent template is the preview's explicit absent state.
    expect(a!.main("archive", buildSection)).toBeNull();
  });

  it("the storefront body resolves through `mode: published` and returns null for an absent template", () => {
    const lines = ast([section("cart_lines")]);
    const summary = ast([section("cart_summary")]);
    const a = resolvePublishedTemplate({
      templates: { cart: lines },
      template: "cart",
      tenant: "demo",
    });
    const b = resolvePublishedTemplate({
      templates: { cart: summary },
      template: "cart",
      tenant: "demo",
    });
    expect(a).toEqual(lines);
    expect(b).toEqual(summary);
    expect(a).not.toEqual(b);
    expect(
      resolvePublishedTemplate({
        templates: {},
        template: "cart",
        tenant: "demo",
      }),
    ).toBeNull();
  });

  it("each host module calls the ONE resolver with its own mode and host label", () => {
    const preview = readFileSync(
      new URL("./preview-sources.ts", import.meta.url),
      "utf8",
    );
    const storefront = readFileSync(
      new URL("./storefront.server.ts", import.meta.url),
      "utf8",
    );
    expect(preview).toContain("resolveTemplateForHost({");
    expect(preview).toContain('mode: "source"');
    expect(preview).toContain('host: "preview"');
    expect(storefront).toContain("resolveTemplateForHost({");
    expect(storefront).toContain('mode: "published"');
    expect(storefront).toContain('host: "storefront"');
  });
});

describe("the preview's assembled map — the THEME's own length", () => {
  it("a theme that authors nine of the ten templates carries NINE keys, and the tenth is absent", () => {
    const authored = TEMPLATE_KEYS.filter((key) => key !== "archive");
    const source: PreviewThemeSource = {
      key: "nine-of-ten",
      themeName: "Nine of ten",
      author: "Test",
      tokens: {} as PreviewThemeSource["tokens"],
      header: () => [],
      footer: () => [],
      main: (template) =>
        template === "archive" ? null : [section(`w_${template}`)],
    };
    const map = assemblePreviewTemplates(source);
    // The map's length is the THEME's own — not the platform's ten.
    expect(Object.keys(map)).toHaveLength(authored.length);
    expect(Object.keys(map)).toHaveLength(9);
    // … and the template the theme did not author is ABSENT — never a
    // synthesised body.
    expect(map.archive).toBeUndefined();
    expect(Object.keys(map)).not.toContain("archive");
  });

  it("the engine no longer synthesises a body for an un-authored template", () => {
    // The synthesis is GONE: `assemblePreviewTemplates` never calls
    // `genericDemoMain`. The function STAYS — it is the distinctness gate's
    // reference body (`src/lib/themes/songoskriti/template-distinctness.ts`).
    const body = SOURCE_READER.slice(
      SOURCE_READER.indexOf("export function assemblePreviewTemplates"),
    );
    const until = body.indexOf("\n}\n");
    const fn = body.slice(0, until);
    expect(fn).not.toContain("genericDemoMain");
    // … and the function itself is still there, for the gate.
    expect(SOURCE_READER).toContain("export function genericDemoMain");
  });
});

describe("the editor canvas — the theme's presentation and the theme's demo data", () => {
  const BUILDER = readFileSync(
    new URL("../routes/_authenticated/dashboard/builder.tsx", import.meta.url),
    "utf8",
  );

  it("the canvas's SectionRenderer receives a themeKey", () => {
    // The key the widget TRAY already uses — the same key the storefront
    // uses and the preview uses. One key, three hosts.
    expect(BUILDER).toContain("themeKey={activeThemeKey}");
    // The canvas's own SectionRenderer (the one inside the canvas tree).
    const at = BUILDER.indexOf("<SectionRenderer");
    expect(at).toBeGreaterThanOrEqual(0);
    const block = BUILDER.slice(at, at + 900);
    expect(block).toContain("themeKey={activeThemeKey}");
  });

  it("RENDERS the editor's draft resolution and its mode label", () => {
    // The RENDER, not a source scan: the canvas's draft is resolved, the
    // mode label is shown, and the resolved body draws the THEME's own
    // presentation — the three claims the editor's pipeline rests on.
    const source = songoskritiPreviewSource();
    const templates = {
      cart: {
        header: [],
        main: source.main("cart", buildSection) ?? [],
        footer: [],
      },
    };
    const resolution = resolveEditorDraft({
      template: "cart",
      doc: { templates, tokens: DEFAULT_TOKENS },
      tenant: "songoskriti",
    });
    // The mode is the editor's own — `draft` — and it is LABELLED.
    expect(resolution.mode).toBe("draft");
    expect(resolution.label).toBe(PIPELINE_MODE_LABELS.draft);
    expect(resolution.label).toBe("Your unsaved draft");
    // The draft authors the cart, so nothing is declined.
    expect(resolution.declined).toBe(false);
    expect(resolution.ast.main.length).toBeGreaterThan(0);

    // The canvas frame, as the route draws it: the resolution attribute, the
    // visible label, and the resolved body.
    const markup = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        null,
        createElement(
          "div",
          { "data-fq-resolution": resolution.mode },
          createElement(
            "p",
            { "data-fq-resolution-label": resolution.mode },
            resolution.label,
          ),
          createElement(CanvasDemoScope, {
            children: resolution.ast.main.map((section) =>
              createElement(SectionRenderer, {
                key: section.id,
                section,
                template: "cart",
                editing: true,
                themeKey: "songoskriti",
                demoData: section.type !== "page_content",
              }),
            ),
            enabled: true,
            cart: songoskritiPreviewCart(),
            query: {
              params: normalizeSearchParams({
                q: SONGOSKRITI_PREVIEW_QUERY_TERM,
              }),
              total: SONGOSKRITI_PREVIEW_SEARCH_TOTAL,
              basePath: SONGOSKRITI_PREVIEW_SEARCH_PATH,
              navigate: undefined,
            },
            feed: songoskritiPreviewFeed(),
            account: {
              slug: "songoskriti",
              currency: "BDT",
              status: "ready",
              overview: songoskritiPreviewAccountOverview(),
              orders: songoskritiPreviewOrders(),
              tab: "orders",
              setTab: () => {},
              openOrderId: null,
              setOpenOrderId: () => {},
              orderDetail: null,
              placed: [],
            },
          }),
        ),
      ),
    );
    // The mode and its visible label render.
    expect(markup).toContain('data-fq-resolution="draft"');
    expect(markup).toContain('data-fq-resolution-label="draft"');
    expect(markup).toContain("Your unsaved draft");
    // The draft's body draws the THEME's presentation, not the platform's
    // generic widget (the platform's order-summary panel chrome is absent).
    expect(markup).toContain('aria-label="Order summary"');
    expect(markup).not.toContain('aria-label="Order summary" class="p-6');
  });

  it("a VARIANT key falls back to its BASE — the storefront's own rule", () => {
    // F10: the editor swapped `templateAstOf` for the resolver, and the
    // resolver's variant rule is the storefront's rule. This PROVES it
    // rather than assuming it: the editor's answer and the storefront's own
    // `resolveVariantAst` are the same body.
    const baseBody = ast([section("blog_archive")]);
    const variantBody = ast([section("blog_terms")]);
    const baseOnly = { blog: baseBody };

    const fell = resolveEditorDraft({
      template: "blog_listing",
      doc: { templates: baseOnly },
      tenant: "demo",
    });
    expect(fell.ast).toBe(baseBody);

    // The storefront's own rule, called directly.
    const storefront = resolveVariantAst(
      baseOnly as unknown as ThemeTemplates,
      "blog",
      "listing",
    );
    expect(storefront).not.toBeNull();
    expect(fell.ast).toBe(storefront!.ast);

    // …and the variant's OWN body still wins when the theme authors it.
    const withVariant = { blog: baseBody, blog_listing: variantBody };
    const own = resolveEditorDraft({
      template: "blog_listing",
      doc: { templates: withVariant },
      tenant: "demo",
    });
    expect(own.ast).toBe(variantBody);
  });

  it("the canvas resolves its DRAFT through the ONE resolver — mode and host labelled", () => {
    // The editor is not a fourth path (review M2): it calls the same
    // resolver with `mode: "draft"`, `host: "editor"` and the draft map.
    // The wiring scan is kept IN ADDITION to the render above.
    expect(BUILDER).toContain("resolveEditorDraft({");
    expect(BUILDER).toContain("templates: doc.templates");
    // The resolver call itself is labelled — the mode and the host.
    const resolver = readFileSync(
      new URL("./pipeline-resolver.ts", import.meta.url),
      "utf8",
    );
    expect(resolver).toContain('mode: "draft"');
    expect(resolver).toContain('host: "editor"');
    // S8: the mode label is RENDERED, not merely computed.
    expect(BUILDER).toContain("data-fq-resolution={resolutionMode}");
    expect(BUILDER).toContain("data-fq-resolution-label={resolutionMode}");
  });

  it("names a declined template in the switcher and the publish gate (M4)", () => {
    // The switcher marks the template and the canvas shows a named banner.
    expect(BUILDER).toContain('data-fq-theme-state="declined-template"');
    expect(BUILDER).toContain("data-fq-declined");
    // The publish gate receives a `warn` issue — visible, never blocking.
    expect(BUILDER).toContain('level: "warn" as const');
    expect(BUILDER).toContain(
      "message: `${UNSUPPORTED_TEMPLATE_TITLE} — ${templateLabel}`",
    );
    // The same words the preview/storefront frame uses, imported rather than
    // retyped.
    expect(BUILDER).toContain(
      'import { UNSUPPORTED_TEMPLATE_TITLE } from "@/components/store/ThemePreviewFrame"',
    );
  });

  it("the canvas mounts the theme's DEMO providers — and never the live cart", () => {
    expect(BUILDER).toContain("CanvasDemoScope");
    // M5: the account panels read the SAME provider the preview mounts.
    const scope = readFileSync(
      new URL("../components/builder/CanvasDemoScope.tsx", import.meta.url),
      "utf8",
    );
    expect(scope).toContain("CartProvider");
    expect(scope).toContain("CollectionQueryProvider");
    expect(scope).toContain("BlogFeedProvider");
    expect(scope).toContain("AccountDashboardProvider");
    expect(BUILDER).toContain("canvasDemoAccount");
    expect(BUILDER).toContain("enabled={isSongoskriti}");
    // The canvas draws the provider-backed context widgets, not the editing
    // placeholder — the demo scope's whole point (Task 4(a)).
    expect(BUILDER).toContain('section.type !== "page_content"');
    // S3: the demo scope is GATED on the theme key, exactly as the preview
    // gates it — another theme never receives Songoskriti fixtures.
    expect(BUILDER).toContain(
      'const isSongoskriti = activeThemeKey === "songoskriti"',
    );
    // The storefront mounts the LIVE scope; the canvas must never mount it.
    // The scan reads the CODE (the comments are stripped) — a comment that
    // NAMES the live scope is documentation, not a mount.
    const code = stripComments(BUILDER);
    expect(code).not.toContain("useLiveCart");
    expect(code).not.toContain("LiveCartScope");
  });

  it("the storefront mounts ONLY the live scope — never the demo providers", () => {
    const chrome = readFileSync(
      new URL("../components/store/ThemeChrome.tsx", import.meta.url),
      "utf8",
    );
    expect(chrome).toContain("LiveCartScope");
    const code = stripComments(chrome);
    expect(code).not.toContain("songoskritiPreviewCart");
    expect(code).not.toContain("songoskritiPreviewFeed");
    expect(code).not.toContain("BlogFeedProvider");
    expect(code).not.toContain("CollectionQueryProvider");
  });
});

describe("the storefront's declined template — an explicit, named state", () => {
  const CHROME = readFileSync(
    new URL("../components/store/ThemeChrome.tsx", import.meta.url),
    "utf8",
  );

  it("the fallback renders inside a NAMED frame", () => {
    // The route's platform surface is RETAINED — it is the platform's
    // designed surface for a declined template — but it is named, so the
    // editor and the publish gate can say which template the theme does not
    // design.
    expect(CHROME).toContain("data-fq-theme-state");
    expect(CHROME).toContain("declined-template");
  });
});
