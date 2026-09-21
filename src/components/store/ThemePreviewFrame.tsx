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
import { Monitor, Smartphone, Tablet, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeSurface } from "@/components/builder/ThemeSurface";
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

/* ---- device widths (mirrors appearance.ts but kept local) ---- */
const DEVICES = [
  { id: "desktop" as const, label: "Desktop", icon: Monitor, width: null },
  { id: "tablet" as const, label: "Tablet", icon: Tablet, width: 810 },
  { id: "mobile" as const, label: "Mobile", icon: Smartphone, width: 390 },
] as const;

/* ---- tab labels for the template picker ---- */
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
  const [device, setDevice] =
    useState<(typeof DEVICES)[number]["id"]>("desktop");

  const ast = templates[template] ?? templates.index;
  const deviceEntry = DEVICES.find((d) => d.id === device)!;
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
      {/* ---- toolbar ---- */}
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {themeName}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            Preview · {author}
          </p>
        </div>

        {/* template tabs */}
        <nav
          aria-label="Template"
          className="hidden gap-1 overflow-x-auto md:flex"
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

        {/* device toggle */}
        <div
          role="group"
          aria-label="Preview width"
          className="flex items-center gap-1"
        >
          {DEVICES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={device === id}
              aria-label={label}
              onClick={() => setDevice(id)}
              className={cn(
                "grid size-9 place-items-center rounded-full transition-colors",
                device === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-label="Close preview"
          onClick={onClose}
          className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      {/* ---- responsive CSS injected once ---- */}
      {responsiveCss && (
        <style
          dangerouslySetInnerHTML={{
            __html: `.fq-theme-scope{${responsiveCss}}`,
          }}
        />
      )}

      {/* ---- preview canvas ---- */}
      <div className="flex-1 overflow-auto bg-muted p-4">
        <div
          className="mx-auto rounded-fq-md border border-border bg-card shadow-fq-md transition-[max-width] duration-200"
          style={{ maxWidth: deviceEntry.width ?? "100%" }}
        >
          <ThemeSurface tokens={tokens}>
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

      {/* ---- mobile template picker (stacked below toolbar on small screens) ---- */}
      <nav
        aria-label="Template"
        className="flex gap-1 overflow-x-auto border-t border-border bg-card px-4 py-2 md:hidden"
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
    </div>
  );
}
