/**
 * PKG-2 — versioned package asset delivery (`/pkg/<merchant>/<name>?v=`).
 *
 * Public by design (a storefront `<link>`/`<img>` carries no bearer
 * token). Authorization is the merchant-scoped lookup plus the traversal,
 * version-pin and kind guards in `@/lib/package-serve` (read that module
 * header for the threat model) — there is intentionally no session check
 * here, mirroring the media/font routes.
 */
import { createFileRoute } from "@tanstack/react-router";
import type { PkgRow } from "@/lib/package-serve";

const NOT_FOUND = { "cache-control": "no-store" };

type LooseDb = {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        eq(col: string, val: string): {
          maybeSingle(): Promise<{ data: PkgRow | null }>;
        };
      };
    };
  };
};

export const Route = createFileRoute("/pkg/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { parsePkgSplat, parsePkgVersion, resolvePkgAsset } =
          await import("@/lib/package-serve");
        const { publicClient } = await import("@/lib/pricing.server");

        const splat = (params as { _splat?: string })._splat ?? "";
        const target = parsePkgSplat(splat);
        if (!target) {
          return new Response("not_found", { status: 404, headers: NOT_FOUND });
        }
        const version = parsePkgVersion(
          new URL(request.url).searchParams.get("v"),
        );

        // The generated DB types do not know the asset columns; the query
        // shape is pinned by `PkgRow` and the serving test.
        const db = publicClient() as unknown as LooseDb;
        const { data } = await db
          .from("theme_assets")
          .select("merchant_id, name, kind, content, url, enabled")
          .eq("merchant_id", target.merchantId)
          .eq("name", target.name)
          .maybeSingle();

        const outcome = resolvePkgAsset(target, version, data);
        if (outcome.status === 404) {
          return new Response("not_found", { status: 404, headers: NOT_FOUND });
        }
        return new Response(outcome.body, { headers: outcome.headers });
      },
    },
  },
});
