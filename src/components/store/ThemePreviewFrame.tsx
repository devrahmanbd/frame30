/**
 * Task 8 — Full-screen theme preview frame.
 *
 * Renders blueprint sections (header / main / footer) with template-tab
 * navigation. No auth required; the route resolves the blueprint from the
 * URL key param and passes it here. Uses the same ThemeSurface +
 * SectionRenderer stack the storefront uses, but with placeholder widget
 * data so every section renders something visible.
 */
import { useMemo, useState, type MouseEvent } from "react";
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
import { previewTemplateForHref } from "@/lib/theme-preview-nav";
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

  // Envato-style demo browsing: mapped links switch the preview tab with
  // demo content instead of escaping to live routes that 404 on hosts
  // without a merchant. Unmapped links keep default browser behavior.
  const onCanvasClick = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest?.("a[href]");
    if (!anchor) return;
    const next = previewTemplateForHref(anchor.getAttribute("href") ?? "");
    if (!next) return;
    event.preventDefault();
    setTemplate(next);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${themeName} theme preview`}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      {/* ---- floating controls: a single dot that expands on demand.
          The preview itself stays chrome-free; nothing here may read as
          theme navigation. ---- */}
      <PreviewDock
        template={template}
        setTemplate={setTemplate}
        onClose={onClose}
      />

      {/* ---- responsive CSS injected once ---- */}
      {responsiveCss && (
        <style
          dangerouslySetInnerHTML={{
            __html: `.fq-theme-scope{${responsiveCss}}`,
          }}
        />
      )}

      {/* ---- preview canvas: full-bleed, no frame ---- */}
      <div className="flex-1 overflow-auto bg-background" onClick={onCanvasClick}>
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

/** Collapsed preview dock: one small corner dot, expands on click. */
function PreviewDock({
  template,
  setTemplate,
  onClose,
}: {
  template: TemplateKey;
  setTemplate: (t: TemplateKey) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-3 right-3 z-50">
      {open ? (
        <div className="flex max-w-[86vw] items-center gap-1 rounded-2xl border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur">
          <nav
            aria-label="Template"
            className="flex items-center gap-1 overflow-x-auto"
          >
            {TEMPLATE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={template === key}
                onClick={() => {
                  setTemplate(key);
                  setOpen(false);
                }}
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
      ) : (
        <button
          type="button"
          aria-label="Preview controls"
          onClick={() => setOpen(true)}
          className="grid size-10 place-items-center rounded-full border border-border bg-card/90 text-muted-foreground opacity-60 shadow-md backdrop-blur transition hover:opacity-100"
        >
          <span aria-hidden="true" className="flex gap-1">
            <span className="size-1.5 rounded-full bg-current" />
            <span className="size-1.5 rounded-full bg-current" />
            <span className="size-1.5 rounded-full bg-current" />
          </span>
        </button>
      )}
    </div>
  );
}
