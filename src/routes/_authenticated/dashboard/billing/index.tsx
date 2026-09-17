import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard/billing/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/billing/invoices" });
  },
});
