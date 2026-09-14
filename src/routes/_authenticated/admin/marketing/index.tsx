import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/marketing/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/marketing/campaigns" });
  },
});
