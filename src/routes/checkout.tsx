import { createFileRoute, redirect } from "@tanstack/react-router";
import { getFeaturedStoreSlug } from "@/lib/storefront.functions";

/** Legacy single-shop URL. Checkout is tenant-scoped at /store/$slug/checkout. */
export const Route = createFileRoute("/checkout")({
  loader: async () => {
    const slug = await getFeaturedStoreSlug();
    if (slug) throw redirect({ to: "/store/$slug/checkout", params: { slug }, replace: true });
    throw redirect({ to: "/", replace: true });
  },
});
