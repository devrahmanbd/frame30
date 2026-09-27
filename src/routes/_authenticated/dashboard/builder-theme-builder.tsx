/**
 * B1 — Builder › Theme Builder (M-05, Elementor-model submenu home).
 * Sidebar home for site-part templates (header/footer/single/archive):
 * redirects into the builder studio with the theme-builder view selected
 * (same pattern as plugins/new.tsx, so the button is never dead).
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { consoleRoute } from "@/lib/console-routes";

export const Route = createFileRoute(
  "/_authenticated/dashboard/builder-theme-builder",
)({
  staticData: consoleRoute({ permission: "themes.read" }),
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/builder" as never,
      search: { panel: "theme-builder" } as never,
    });
  },
});
