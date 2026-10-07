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
import { createServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "@/components/icons/tabler";
import { cn } from "@/lib/utils";
import type { Database, Json } from "@/integrations/supabase/types";
import { themePreviewHostGateFn } from "@/lib/storefront.functions";
import {
  resolveThemePreview,
  validateThemePreviewSearch,
} from "@/lib/theme-preview-nav";
import { resolveBundledOfficialPreview } from "@/lib/official-artifact-bundle";
import { ThemePreviewFrame } from "@/components/store/ThemePreviewFrame";

type RouteParams = { key: string };

/**
 * SWITCHOVER-4 — merchant installed rows for preview resolution.
 *
 * Optional-auth server fn (the route stays public): when the visitor carries
 * a session it resolves their merchant and returns one artifact per installed
 * theme (`store_themes` row + latest `theme_versions` row, keyed by
 * `source_listing_slug`); anonymous visitors and every failure mode return
 * `[]` so built-in source previews keep working — never a 500, never a leak
 * across merchants (tenant-scoped reads on the caller's own token).
 */
/**
 * Serializable installed row for preview resolution. `tokens` / `templates`
 * ride as `Json` (the version-row column type) so the server-fn
 * serializability gate accepts them; the shape stays assignable to
 * `InstalledPreviewArtifact` downstream.
 */
type ThemePreviewInstalledRow = {
  key: string;
  themeName: string | null;
  author: string | null;
  tokens?: Json | null;
  templates?: Json | null;
};

const themePreviewInstalledFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ThemePreviewInstalledRow[] | null> => {
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const token = (() => {
        try {
          const header = getRequest()?.headers.get("authorization");
          if (!header?.startsWith("Bearer ")) return null;
          const value = header.slice("Bearer ".length);
          return value.split(".").length === 3 ? value : null;
        } catch {
          return null;
        }
      })();
      if (!token) return null;
      const url = process.env["SUPABASE_URL"];
      const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
      if (!url || !key) return null;
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient<Database>(url, key, {
        global: {
          headers: { Authorization: `Bearer ${token}`, apikey: key },
        },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: claimsData, error: claimsError } =
        await supabase.auth.getClaims(token);
      const userId = claimsData?.claims?.sub;
      if (claimsError || !userId) return null;
      const { currentMerchantId } = await import("@/lib/marketing.server");
      let merchantId: string;
      try {
        merchantId = await currentMerchantId(
          supabase as never,
          userId as string,
        );
      } catch {
        return null;
      }
      const { data: themes } = await supabase
        .from("store_themes")
        .select("id, name, author, source_listing_slug")
        .eq("merchant_id", merchantId)
        .not("source_listing_slug", "is", null)
        .limit(100);
      const rows = ((themes ?? []) as {
        id: string;
        name: string;
        author: string | null;
        source_listing_slug: string | null;
      }[]).filter((t) => t.source_listing_slug?.trim());
      if (!rows.length) return [];
      const { data: versions } = await supabase
        .from("theme_versions")
        .select("theme_id, version, templates, tokens")
        .eq("merchant_id", merchantId)
        .in(
          "theme_id",
          rows.map((t) => t.id),
        )
        .order("version", { ascending: false })
        .limit(500);
      const latest = new Map<string, { templates: Json; tokens: Json }>();
      for (const v of ((versions ?? []) as {
        theme_id: string;
        templates: Json;
        tokens: Json;
      }[])) {
        if (!latest.has(v.theme_id))
          latest.set(v.theme_id, { templates: v.templates, tokens: v.tokens });
      }
      return rows.flatMap((t) => {
        const key = t.source_listing_slug!.trim();
        if (!key) return [];
        const v = latest.get(t.id);
        // A theme row with no version row yet carries no artifact content:
        // pass the keyed ref so discovery lists it, resolution falls back.
        return [
          {
            key,
            themeName: t.name,
            author: t.author,
            tokens: v?.tokens ?? null,
            templates: v?.templates ?? null,
          } satisfies ThemePreviewInstalledRow,
        ];
      });
    } catch {
      return [];
    }
  },
);

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
    // Installed rows join preview resolution as data (bundled official
    // fallback preserved for the merchant-less component below):
    // best-effort, fail-open to [] — anonymous visitors keep official
    // previews via the bundle, never a 500.
    let installed: ThemePreviewInstalledRow[] | null = [];
    try {
      installed = await themePreviewInstalledFn();
    } catch {
      installed = [];
    }
    return { installed };
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
    variation: variationKey,
  } = Route.useSearch();
  // Merchant-installed packages preview through the installed set the loader
  // threaded in (SWITCHOVER-4), authoritative when present. Merchant-less
  // visitors (anonymous `null`, or an empty installed set) fall back to the
  // deploy-time-built official bundle ONLY (songoskriti/somvabona, versioned,
  // checksummed — no source imports in this graph); merchants WITH installs
  // never see the bundle (uninstalled keys fail closed to 404, K2).
  // Theme variation deep-link (`?variation=minimal`): unknown keys fall
  // back to the base theme inside the resolver — never a 404.
  const { installed } = Route.useLoaderData();
  const installedPreset = resolveThemePreview(key, variationKey, installed);
  const merchantless =
    installed === null ||
    installed === undefined ||
    (Array.isArray(installed) && installed.length === 0);
  const preset =
    installedPreset ??
    (merchantless ? resolveBundledOfficialPreview(key, variationKey) : null);

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
