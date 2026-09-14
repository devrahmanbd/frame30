/**
 * `/admin/money/payments` — the Money section's canonical payments address.
 *
 * The payments desk itself lives at `/admin/payments`; this keeps the section
 * URL working for bookmarks, the verification gate and anyone typing the path
 * the navigation implies.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/money/payments")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/payments" });
  },
});
