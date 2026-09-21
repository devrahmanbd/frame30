/**
 * Local SVG product placeholder endpoint — `/api/public/ph/<seed>`.
 *
 * Public by design (storefront `<img>` tags reference it). Pure compute, no
 * DB, no secrets: the seed is slug-sanitized and the SVG is static (no
 * scripts). Long immutable cache — output is deterministic per seed.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/ph/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { placeholderSeed, placeholderSvg } =
          await import("@/lib/placeholder");
        // Slice 3: `/api/public/ph/<dept>/<seed>` tints the tile with the
        // department palette; single-segment URLs keep heritage default art.
        const parts = (params as { _splat?: string })._splat
          ? ((params as { _splat?: string })._splat as string)
              .split("/")
              .filter(Boolean)
          : [];
        const seed = placeholderSeed(
          decodeURIComponent(parts.at(-1) ?? ""),
        );
        const dept = parts.length > 1 ? placeholderSeed(parts[0]) : null;
        return new Response(placeholderSvg(seed, dept), {
          status: 200,
          headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            "cache-control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
