/**
 * B1 — Builder › Submissions (M-05, Elementor-model submenu home).
 * Sidebar home for the forms inbox: redirects into the builder studio with
 * the submissions view selected (same pattern as plugins/new.tsx, so the
 * button is never dead).
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { consoleRoute } from "@/lib/console-routes";

export const Route = createFileRoute(
  "/_authenticated/dashboard/builder-submissions",
)({
  staticData: consoleRoute({ permission: "themes.read" }),
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/builder" as never,
      search: { panel: "submissions" } as never,
    });
  },
});
