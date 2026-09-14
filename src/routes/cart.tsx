import { createFileRoute, redirect } from "@tanstack/react-router";
import { getFeaturedStoreSlug } from "@/lib/storefront.functions";

/** Legacy single-shop URL. Carts are tenant-scoped, so send shoppers to a store. */
export const Route = createFileRoute("/cart")({
  loader: async () => {
    const slug = await getFeaturedStoreSlug();
    if (slug) throw redirect({ to: "/store/$slug", params: { slug }, replace: true });
    throw redirect({ to: "/", replace: true });
  },
});
