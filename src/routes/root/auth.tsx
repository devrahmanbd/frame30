import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/root/auth")({
  beforeLoad: () => {
    throw redirect({ to: "/root/login" });
  },
});
