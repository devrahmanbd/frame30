/**
 * WP Plugins › Add New parity route.
 * Redirects directly to the extension directory / widget catalog with tab=plugin.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { consoleRoute } from "@/lib/console-routes";

export const Route = createFileRoute("/_authenticated/dashboard/plugins/new")({
  staticData: consoleRoute({ permission: "plugins.read" }),
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/marketplace" as never,
      search: { tab: "plugin" } as never,
    });
  },
});
