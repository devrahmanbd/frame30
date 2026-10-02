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
import { createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowLeft } from "@/components/icons/tabler";
import { cn } from "@/lib/utils";
import { themePreviewHostGateFn } from "@/lib/storefront.functions";
import {
  resolveThemePreview,
  validateThemePreviewSearch,
} from "@/lib/theme-preview-nav";
import { ThemePreviewFrame } from "@/components/store/ThemePreviewFrame";

type RouteParams = { key: string };

export const Route = createFileRoute("/theme-preview/$key")({
  // Template + focus (?focus= is the contract merchant-less redirects use)
  // plus preserved search query keys (`q`, `max`) so refresh keeps
  // `?template=search&max=99900` instead of dropping it.
  validateSearch: (search: Record<string, unknown>) =>
    validateThemePreviewSearch(search),
  // Demo pages must never index: merchant-less URLs redirect here instead
  // of 404ing, and indexers must not mistake demo for store content.
  head: () => ({
    meta: [
      { title: "Theme preview" },
      {
        name: "description",
        content:
          "Live preview of a Framique storefront theme with demo products.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  // System-domain-only preview (Sept 2026 security fix): merchant/custom
  // hosts get a 404 with zero preview markup — never a login redirect from
  // a storefront path (account.tsx loader notFound() precedent). Direct hits
  // are already 404d by the `server.ts` edge gate before SSR; this loader
  // covers client-side SPA navigation, where no fresh document request runs.
  // Fail closed: any gate failure denies.
  loader: async () => {
    let allowed = false;
    try {
      allowed = (await themePreviewHostGateFn()).allowed;
    } catch {
      allowed = false;
    }
    if (!allowed) throw notFound();
    return null;
  },
  component: ThemePreviewRoute,
  errorComponent: ThemePreviewError,
  notFoundComponent: ThemePreviewNotFound,
});

function ThemePreviewRoute() {
  const { key } = Route.useParams() as RouteParams;
  const {
    template: initialTemplate,
    focus: initialFocus,
    mock_order: initialMockOrder,
  } = Route.useSearch();
  console.log("THE KEY IS: ", key); const preset = resolveThemePreview(key);

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
      initialFocus={initialFocus}
      initialMockOrder={initialMockOrder}
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
