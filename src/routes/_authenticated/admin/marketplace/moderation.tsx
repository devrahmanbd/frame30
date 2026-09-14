import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Listing moderation is a platform concern owned by `/root`, not a merchant
 * screen. The URL survives as a permanent redirect so old bookmarks resolve.
 */
export const Route = createFileRoute("/_authenticated/admin/marketplace/moderation")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/marketplace" });
  },
});
