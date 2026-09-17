import { createFileRoute, redirect } from "@tanstack/react-router";

/** Merged into the Analytics hub; the old URL still works. */
export const Route = createFileRoute("/_authenticated/dashboard/activity")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/analytics", search: { tab: "activity" } });
  },
});
