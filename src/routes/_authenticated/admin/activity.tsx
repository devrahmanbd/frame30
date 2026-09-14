import { createFileRoute, redirect } from "@tanstack/react-router";

/** Merged into the Analytics hub; the old URL still works. */
export const Route = createFileRoute("/_authenticated/admin/activity")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/analytics", search: { tab: "activity" } });
  },
});
