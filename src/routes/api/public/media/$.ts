/**
 * Phase 3.3 — read-only media delivery.
 *
 * The bucket is private and this is the only way out of it. Public by design
 * (a storefront `<img>` carries no bearer token) and read-only: the path is
 * validated to `<merchant-uuid>/<file>` before anything is fetched, and SVG is
 * never served as an inline document.
 */
import { createFileRoute } from "@tanstack/react-router";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  // Phase 16: the library also holds vectors, media and documents. SVG is
  // stripped of script, event handlers and javascript: hrefs on upload, and
  // still leaves here with nosniff so a browser cannot re-interpret it.
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  pdf: "application/pdf",
};

export const Route = createFileRoute("/api/public/media/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { isMediaObjectPath } = await import("@/lib/media");
        const { readMedia } = await import("@/lib/media.server");

        const splat = (params as { _splat?: string })._splat ?? "";
        const path = splat
          .split("/")
          .filter(Boolean)
          .map((part) => decodeURIComponent(part))
          .join("/");

        if (!isMediaObjectPath(path)) {
          return new Response("not_found", { status: 404, headers: { "cache-control": "no-store" } });
        }

        const blob = await readMedia(path);
        if (!blob) {
          return new Response("not_found", { status: 404, headers: { "cache-control": "no-store" } });
        }

        const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
        const type = TYPES[ext] ?? "application/octet-stream";
        return new Response(blob, {
          headers: {
            "content-type": type,
            "content-disposition": type === "application/octet-stream" ? "attachment" : "inline",
            "x-content-type-options": "nosniff",
            "cache-control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
