/**
 * Legacy media route — the library moved to Content › Media in Phase 16.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/marketing/media")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/content/media" });
  },
});
