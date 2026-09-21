/**
 * Task 8 — Full-screen theme preview frame.
 *
 * Renders blueprint sections (header / main / footer) with template-tab
 * navigation. No auth required; the route resolves the blueprint from the
 * URL key param and passes it here. Uses the same ThemeSurface +
 * SectionRenderer stack the storefront uses, but with placeholder widget
 * data so every section renders something visible.
 */
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeSurface } from "@/components/builder/ThemeSurface";
import { StoreHeader } from "@/components/store/StoreHeader";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
import { WidgetDataProvider } from "@/components/builder/WidgetDataContext";
import {
  collectWidgetRequests,
  type WidgetDataBundle,
  type WidgetDataMap,
} from "@/lib/widget-data";
import { previewDemoMap } from "@/lib/preview-demo-data";
import { compileResponsiveCss } from "@/lib/responsive-css";
import {
  TEMPLATE_KEYS,
  type Section,
  type TemplateKey,
  type ThemeAst,
  type ThemeTokens,
} from "@/lib/builder-ast";

/* ---- template tab labels for the floating picker ---- */
const TAB_LABELS: Record<TemplateKey, string> = {
  index: "Homepage",
  product: "Product",
  collection: "Collection",
  page: "Page",
  blog: "Blog",
  cart: "Cart",
  checkout: "Checkout",
  search: "Search",
};

export type ThemePreviewFrameProps = {
  /** Blueprint name for the header. */
  themeName: string;
  /** Blueprint author. */
  author: string;
  /** Blueprint key — selects the demo catalog for preview rows. */
  blueprintKey: string;
  /** Theme tokens applied to the preview surface. */
  tokens: ThemeTokens;
  /** All authored templates keyed by template key. */
  templates: Record<TemplateKey, ThemeAst>;
  /** Deep-linkable starting tab (?template=product). Defaults to homepage. */
  initialTemplate?: TemplateKey;
  /** Close callback — wired to the × button. */
  onClose: () => void;
};

export function ThemePreviewFrame({
  themeName,
  author,
  blueprintKey,
  tokens,
  templates,
  initialTemplate,
  onClose,
}: ThemePreviewFrameProps) {
  const [template, setTemplate] = useState<TemplateKey>(
    initialTemplate ?? "index",
  );

  const ast = templates[template] ?? templates.index;
  const allSections: Section[] = [...ast.header, ...ast.main, ...ast.footer];
  const responsiveCss = compileResponsiveCss(allSections);
  // Preview has no merchant data: feed every data widget demo catalog rows
  // so grids/rails render products instead of skeleton-spinning forever.
  const previewData: { bundle: WidgetDataBundle; map: WidgetDataMap } =
    useMemo(() => {
      const bundle = collectWidgetRequests(ast);
      return { bundle, map: previewDemoMap(bundle, blueprintKey) };
    }, [ast, blueprintKey]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${themeName} theme preview`}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      {/* ---- floating controls (the only chrome): template tabs + close ---- */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-3">
        <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full border border-border bg-card/90 p-1 shadow-md backdrop-blur">
          <nav
            aria-label="Template"
            className="flex max-w-[60vw] items-center gap-1 overflow-x-auto"
          >
            {TEMPLATE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={template === key}
                onClick={() => setTemplate(key)}
                className={cn(
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  template === key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {TAB_LABELS[key]}
              </button>
            ))}
          </nav>
          <button
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* ---- responsive CSS injected once ---- */}
      {responsiveCss && (
        <style
          dangerouslySetInnerHTML={{
            __html: `.fq-theme-scope{${responsiveCss}}`,
          }}
        />
      )}

      {/* ---- preview canvas: full-bleed, no frame ---- */}
      <div className="flex-1 overflow-auto bg-background">
        <div className="mx-auto" style={{ maxWidth: "100%" }}>
          <ThemeSurface tokens={tokens}>
            {/* Wordmark row, as on a live storefront — the blueprint's
                header sections render beneath it. */}
            <StoreHeader
              slug={blueprintKey}
              name={themeName}
              menus={null}
            />
            <WidgetDataProvider
              bundle={previewData.bundle}
              map={previewData.map}
            >
              {/* header slot */}
              {ast.header.map((section) => (
                <SectionRenderer
                  key={section.id}
                  section={section}
                  template={template}
                  editing={false}
                />
              ))}

              {/* main slot */}
              {ast.main.length > 0 ? (
                ast.main.map((section) => (
                  <SectionRenderer
                    key={section.id}
                    section={section}
                    template={template}
                    editing={false}
                    primary={section.id === ast.main[0]?.id}
                  />
                ))
              ) : (
                <div className="grid min-h-[40vh] place-items-center p-8 text-sm text-muted-foreground">
                  No sections authored for this template.
                </div>
              )}

              {/* footer slot */}
              {ast.footer.map((section) => (
                <SectionRenderer
                  key={section.id}
                  section={section}
                  template={template}
                  editing={false}
                />
              ))}
            </WidgetDataProvider>
          </ThemeSurface>
        </div>
      </div>

    </div>
  );
}
