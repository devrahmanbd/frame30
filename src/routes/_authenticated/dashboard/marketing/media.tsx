/**
 * Legacy media route — the library moved to Content › Media in Phase 16.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticated/dashboard/marketing/media",
)({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/content/media" });
  },
});
