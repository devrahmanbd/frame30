import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/content/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/content/pages" as never });
  },
});
