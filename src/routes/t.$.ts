/**
 * Level B — versioned theme asset delivery (`/t/<themeId>/<version>/<path>`).
 *
 * Public by design (a sandboxed frame `src` carries no bearer token).
 * Authorization is the fingerprinted-release verification in
 * `@/lib/themes.server` (`resolveDevThemeAsset` — read that module header
 * for the trust chain): only bytes hashing to an approval-bound release
 * file entry are served, with immutable caching. There is intentionally no
 * session check here, mirroring the `/pkg/` + media/font routes.
 *
 * Fail-closed throughout: unparseable splats, unknown versions, ambiguous
 * releases, missing entries, tampered bytes/maps/approvals, refused kinds
 * (`index.html` is not an assembled output and 404s — the frame stays
 * blank rather than executing unreviewed bytes), and oversized rows all
 * 404 with `no-store` (never an immutable directive on a refusal, so a
 * refusal can never poison a shared cache).
 */
import { createFileRoute } from "@tanstack/react-router";

const NOT_FOUND = { "cache-control": "no-store" };

type LooseDb = {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): Promise<{ data: unknown; error: unknown }>;
    };
  };
};

export const Route = createFileRoute("/t/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const {
          parseDevThemeAssetPath,
          devThemeReleaseRowName,
          devThemeApprovalRowName,
          resolveDevThemeAsset,
        } = await import("@/lib/themes.server");
        const { publicClient } = await import("@/lib/pricing.server");

        const splat = (params as { _splat?: string })._splat ?? "";
        const requested = parseDevThemeAssetPath(splat);
        if (!requested) {
          return new Response("not_found", { status: 404, headers: NOT_FOUND });
        }

        // Exact-name reads only (no prefix scans): the descriptor, the
        // approval snapshot, and the addressed file. Cross-merchant rows
        // with the same names are resolved by hash verification inside
        // `resolveDevThemeAsset` (ambiguity refuses), not by scoping here —
        // the URL is merchant-free by contract.
        const db = publicClient() as unknown as LooseDb;
        const namespace = `dev-themes/${requested.themeId}/${requested.version}`;
        const [approvals, maps, assets] = await Promise.all([
          db
            .from("theme_assets")
            .select("merchant_id, name, kind, content, bytes")
            .eq(
              "name",
              devThemeApprovalRowName(requested.themeId, requested.version),
            ),
          db
            .from("theme_assets")
            .select("merchant_id, name, kind, content, bytes")
            .eq(
              "name",
              devThemeReleaseRowName(requested.themeId, requested.version),
            ),
          db
            .from("theme_assets")
            .select("merchant_id, name, kind, content, bytes")
            .eq("name", `${namespace}/${requested.assetPath}`),
        ]);

        const outcome = resolveDevThemeAsset(
          requested,
          (approvals as { data: unknown }).data,
          (maps as { data: unknown }).data,
          (assets as { data: unknown }).data,
        );
        if (outcome.status === 404) {
          return new Response("not_found", { status: 404, headers: NOT_FOUND });
        }
        return new Response(outcome.body, { headers: outcome.headers });
      },
    },
  },
});
