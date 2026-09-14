import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { resolveProductLocation } from "@/lib/storefront.functions";
import { useLang } from "@/lib/i18n";

/** Legacy single-shop URL. The owning tenant is derived from the product record. */
export const Route = createFileRoute("/products/$productId")({
  loader: async ({ params }) => {
    // A legacy URL can carry anything (`/products/1`); an unparseable id is a
    // 404, never a 500 — the validator throws before the lookup runs.
    let location: Awaited<ReturnType<typeof resolveProductLocation>> = null;
    try {
      location = await resolveProductLocation({ data: { productId: params.productId } });
    } catch {
      throw notFound();
    }
    if (!location) throw notFound();
    throw redirect({
      to: "/store/$slug/p/$productSlug",
      params: { slug: location.storeSlug, productSlug: location.productSlug },
      replace: true,
    });
  },

  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  notFoundComponent: ProductNotFound,
});

function ProductNotFound() {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">{t("Product not found", "পণ্য পাওয়া যায়নি")}</h1>
    </main>
  );
}
