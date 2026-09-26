/**
 * B1 — Builder › Role Manager (M-05, Elementor-model submenu home).
 * Sidebar home for the content-only design lock (B-15): redirects into the
 * builder studio with the role-manager view selected (same pattern as
 * plugins/new.tsx, so the button is never dead).
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { consoleRoute } from "@/lib/console-routes";

export const Route = createFileRoute(
  "/_authenticated/dashboard/builder-role-manager",
)({
  staticData: consoleRoute({ permission: "themes.read" }),
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/builder" as never,
      search: { panel: "role-manager" } as never,
    });
  },
});
