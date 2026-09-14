import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { resolveOrderLocation } from "@/lib/storefront.functions";
import { useLang } from "@/lib/i18n";

/** Legacy single-shop URL. The owning tenant is derived from the order record. */
export const Route = createFileRoute("/order/$orderId/confirmation")({
  loader: async ({ params }) => {
    const slug = await resolveOrderLocation({ data: { orderId: params.orderId } });
    if (!slug) throw notFound();
    throw redirect({
      to: "/store/$slug/order/$orderId",
      params: { slug, orderId: params.orderId },
      replace: true,
    });
  },
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  notFoundComponent: OrderNotFound,
});

function OrderNotFound() {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">{t("Order not found", "অর্ডার পাওয়া যায়নি")}</h1>
    </main>
  );
}
