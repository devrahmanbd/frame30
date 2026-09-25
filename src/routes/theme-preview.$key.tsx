/**
 * Task 8 (restored, Task 5) — Public theme preview route.
 *
 * Restored from `dddfdc2^` (file originates in `de6c9af`; `ba620a1`
 * postdates the purge and was NOT used). Adaptations vs the original,
 * required because the tree moved (documented per Task 5 step 1):
 *
 * 1. `BLUEPRINT_PRESETS` from `@/lib/theme-blueprints` no longer exists
 *    (theme packs removed in 1434a6b). Key resolution now goes through
 *    `resolveThemePreview` in `@/lib/theme-preview-nav`, which builds the
 *    `songoskriti` preset from the Task 1 builders + locked tokens and
 *    returns null for every other key (→ 404 state below).
 * 2. `VALID_TEMPLATES` gains `"account"`: `TEMPLATE_KEYS` in
 *    `src/lib/builder-ast.ts` now lists account as a first-class template
 *    and `ThemePreviewFrame` labels it, so the deep-link allow-list stays
 *    in sync (matches the later `ba48c48` revision of this file).
 * 3. `preset.nameEn` → `preset.themeName`: the resolver exposes the
 *    display name under the frame's own prop name.
 *
 * No authentication required. Resolves the preset by its URL key parameter
 * and renders ThemePreviewFrame with the authored tokens and sections.
 *
 * Usage: /theme-preview/songoskriti
 */
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "@/components/icons/tabler";
import { cn } from "@/lib/utils";
import { resolveThemePreview } from "@/lib/theme-preview-nav";
import { ThemePreviewFrame } from "@/components/store/ThemePreviewFrame";

type RouteParams = { key: string };

const VALID_TEMPLATES = [
  "index",
  "product",
  "collection",
  "account",
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
    slug:
      typeof search.slug === "string"
        ? (search.slug as string).slice(0, 80)
        : undefined,
  }),
  // Demo pages must never index: merchant-less URLs redirect here instead
  // of 404ing, and indexers must not mistake demo for store content.
  head: () => ({
    meta: [{ title: "Theme preview" }, { name: "robots", content: "noindex" }],
  }),
  component: ThemePreviewRoute,
  errorComponent: ThemePreviewError,
  notFoundComponent: ThemePreviewNotFound,
});

function ThemePreviewRoute() {
  const { key } = Route.useParams() as RouteParams;
  const { template: initialTemplate, slug: initialSlug } = Route.useSearch();
  const preset = resolveThemePreview(key);

  if (!preset) {
    return <ThemePreviewNotFound />;
  }

  return (
    <ThemePreviewFrame
      themeName={preset.themeName}
      author={preset.author}
      blueprintKey={preset.key}
      tokens={preset.tokens}
      templates={preset.templates}
      initialTemplate={initialTemplate}
      initialSlug={initialSlug}
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
          href="/dashboard/content/themes"
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
          href="/dashboard/content/themes"
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
