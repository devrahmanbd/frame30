/**
 * Phase 15 — `/admin/content/themes` (Appearance › Themes parity).
 */
import { createFileRoute } from "@tanstack/react-router";
import { ThemesScreen } from "@/components/admin/themes/ThemesScreen";
import { consoleRoute } from "@/lib/console-routes";

export const Route = createFileRoute("/_authenticated/admin/content/themes")({
  staticData: consoleRoute({ permission: "themes.read" }),
  head: () => ({
    meta: [
      { title: "Themes — Framique Admin" },
      {
        name: "description",
        content: "Install, preview and activate storefront themes for your Framique store.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ThemesScreen,
});
