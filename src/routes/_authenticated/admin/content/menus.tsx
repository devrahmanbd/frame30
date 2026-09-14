/**
 * Phase 16 — `/admin/content/menus` (Appearance › Menus parity).
 */
import { createFileRoute } from "@tanstack/react-router";
import { MenusScreen } from "@/components/admin/menus/MenusScreen";
import { consoleRoute } from "@/lib/console-routes";

export const Route = createFileRoute("/_authenticated/admin/content/menus")({
  staticData: consoleRoute({ permission: "marketing.read" }),
  head: () => ({
    meta: [
      { title: "Menus — Framique Admin" },
      {
        name: "description",
        content: "Build header, footer and mobile navigation from your pages, posts and custom links.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MenusScreen,
});
