/**
 * WP Plugins › Add New parity route.
 * Redirects directly to the extension directory / widget catalog with tab=widget.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard/plugins/new")({
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/marketplace",
      search: { tab: "widget" },
    });
  },
});
