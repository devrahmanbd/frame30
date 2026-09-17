import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard/content/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/content/pages" as never });
  },
});
