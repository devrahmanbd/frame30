import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard/marketing/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/marketing/campaigns" });
  },
});
