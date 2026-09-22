/**
 * Task 8 — Public theme preview route.
 *
 * No authentication required. Resolves a blueprint by its URL key parameter
 * and renders ThemePreviewFrame with the authored tokens and sections.
 *
 * Usage: /theme-preview/bazaar
 */
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { BLUEPRINT_PRESETS } from "@/lib/theme-blueprints";
import { ThemePreviewFrame } from "@/components/store/ThemePreviewFrame";

type RouteParams = { key: string };

const VALID_TEMPLATES = [
  "index",
  "product",
  "collection",
  "page",
  "blog",
  "cart",
  "checkout",
  "search",
] as const;

export const Route = createFileRoute("/theme-preview/$key")({
  validateSearch: (search: Record<string, unknown>) => ({
    template:
      typeof search.template === "string" &&
      (VALID_TEMPLATES as readonly string[]).includes(search.template)
        ? (search.template as (typeof VALID_TEMPLATES)[number])
        : undefined,
  }),
  component: ThemePreviewRoute,
  errorComponent: ThemePreviewError,
  notFoundComponent: ThemePreviewNotFound,
});

function ThemePreviewRoute() {
  const { key } = Route.useParams() as RouteParams;
  const { template: initialTemplate } = Route.useSearch();
  const preset = BLUEPRINT_PRESETS.find((p) => p.key === key);

  if (!preset) {
    return <ThemePreviewNotFound />;
  }

  return (
    <ThemePreviewFrame
      themeName={preset.nameEn}
      author={preset.key}
      blueprintKey={preset.key}
      tokens={preset.tokens}
      templates={preset.templates}
      initialTemplate={initialTemplate}
      onClose={() => window.history.back()}
    />
  );
}

function ThemePreviewError() {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-8 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-foreground">
          Preview unavailable
        </h1>
        <p className="text-sm text-muted-foreground">
          This theme could not be loaded. The blueprint may be corrupted or the
          URL may be invalid.
        </p>
        <a
          href="/dashboard/themes"
          className={cn(
            "inline-flex items-center gap-2 rounded-fq-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90",
          )}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to themes
        </a>
      </div>
    </div>
  );
}

function ThemePreviewNotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-8 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Theme not found</h1>
        <p className="text-sm text-muted-foreground">
          No blueprint matches that key. Check the URL or install a theme first.
        </p>
        <a
          href="/dashboard/themes"
          className={cn(
            "inline-flex items-center gap-2 rounded-fq-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90",
          )}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to themes
        </a>
      </div>
    </div>
  );
}
