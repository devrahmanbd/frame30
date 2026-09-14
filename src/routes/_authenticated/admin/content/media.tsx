/**
 * Phase 16 — `/admin/content/media` (WordPress Media Library parity).
 */
import { createFileRoute } from "@tanstack/react-router";
import { MediaScreen } from "@/components/admin/media/MediaScreen";
import { consoleRoute } from "@/lib/console-routes";

export const Route = createFileRoute("/_authenticated/admin/content/media")({
  staticData: consoleRoute({ permission: "marketing.read" }),
  head: () => ({
    meta: [
      { title: "Media library — Framique Admin" },
      {
        name: "description",
        content: "Upload, organise and describe every image, vector, video and document your store uses.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MediaScreen,
});
