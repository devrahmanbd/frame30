/**
 * Phase 3 — read-only custom font delivery.
 *
 * The bucket is private and this is the only way out of it, so a published
 * `@font-face` URL stays same-origin (`font-src 'self'`) and never expires.
 * A missing face 404s quietly: the storefront falls back to the metric-matched
 * face and we count it.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/font/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { isFontObjectPath, FONT_FALLBACK_METRIC } = await import("@/lib/theme-fonts");
        const { readFontObject } = await import("@/lib/theme-fonts.server");

        const splat = (params as { _splat?: string })._splat ?? "";
        const path = splat
          .split("/")
          .filter(Boolean)
          .map((part) => decodeURIComponent(part))
          .join("/");

        const miss = async (reason: string) => {
          const { incr } = await import("@/lib/observability.server");
          incr(FONT_FALLBACK_METRIC, { reason });
          return new Response("not_found", { status: 404, headers: { "cache-control": "no-store" } });
        };

        if (!isFontObjectPath(path)) return miss("bad_path");
        const blob = await readFontObject(path);
        if (!blob) return miss("missing");

        return new Response(blob, {
          headers: {
            "content-type": "font/woff2",
            "x-content-type-options": "nosniff",
            "access-control-allow-origin": "*",
            "cache-control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
