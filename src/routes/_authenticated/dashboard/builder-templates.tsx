/**
 * B1 — Builder › Templates (M-05, Elementor-model submenu home).
 * Sidebar home for the saved-templates library: redirects into the builder
 * studio with the templates panel selected (same pattern as plugins/new.tsx,
 * so the button is never dead).
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { consoleRoute } from "@/lib/console-routes";

export const Route = createFileRoute(
  "/_authenticated/dashboard/builder-templates",
)({
  staticData: consoleRoute({ permission: "themes.read" }),
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/builder" as never,
      search: { panel: "templates" } as never,
    });
  },
});
