/**
 * B1 — Builder › Saved (M-05, Elementor-model submenu home).
 * Sidebar home for reusable saved sections/blocks: redirects into the
 * builder studio with the saved library selected (same pattern as
 * plugins/new.tsx, so the button is never dead).
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { consoleRoute } from "@/lib/console-routes";

export const Route = createFileRoute("/_authenticated/dashboard/builder-saved")(
  {
    staticData: consoleRoute({ permission: "themes.read" }),
    beforeLoad: () => {
      throw redirect({
        to: "/dashboard/builder" as never,
        search: { panel: "saved" } as never,
      });
    },
  },
);
