/**
 * B1 — Builder › Tools (M-05, Elementor-model submenu home).
 * Sidebar home for builder tools (import/export, maintenance): redirects
 * into the builder studio with the tools view selected (same pattern as
 * plugins/new.tsx, so the button is never dead).
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { consoleRoute } from "@/lib/console-routes";

export const Route = createFileRoute("/_authenticated/dashboard/builder-tools")(
  {
    staticData: consoleRoute({ permission: "themes.read" }),
    beforeLoad: () => {
      throw redirect({
        to: "/dashboard/builder" as never,
        search: { panel: "tools" } as never,
      });
    },
  },
);
