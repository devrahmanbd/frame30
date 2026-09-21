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
        const splat = (params as { _splat?: string })._splat ?? "";
        const seed = placeholderSeed(
          decodeURIComponent(splat.split("/").filter(Boolean).join(" ") || ""),
        );
        return new Response(placeholderSvg(seed), {
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
