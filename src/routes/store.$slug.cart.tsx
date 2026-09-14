/**
 * `/store/$slug/cart` — the themed cart page.
 *
 * The cart widgets (`cart_lines`, `cart_summary`, `checkout_steps`,
 * `payment_methods`) read the live cart themselves through `CartContext`,
 * which `ThemeChrome` opens for every storefront render. This route therefore
 * only supplies the theme document and a plain fallback for stores whose
 * theme publishes no cart template.
 */
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { StoreHeader } from "@/components/store/StoreHeader";
import { SupportWidget } from "@/components/store/SupportWidget";
import { getStoreChrome } from "@/lib/storefront.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/store/$slug/cart")({
  loader: async ({ params }) => {
    const chrome = await getStoreChrome({ data: { slug: params.slug, template: "cart" } });
    if (!chrome) throw notFound();
    return chrome;
  },
  head: ({ loaderData }) => {
    const name = loaderData?.merchant.name ?? "Store";
    const title = `Cart — ${name}`;
    const description = `Review the items in your ${name} cart before checkout.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        // A personal cart is never an index target.
        { name: "robots", content: "noindex,follow" },
      ],
    };
  },
  component: CartPage,
  notFoundComponent: CartMissing,
});

function CartMissing() {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">{t("Store not found", "দোকান পাওয়া যায়নি")}</h1>
    </main>
  );
}

function CartPage() {
  const { t } = useLang();
  const { slug } = Route.useParams();
  const { merchant, ast, tokens, siteKit } = Route.useLoaderData();

  return (
    <ThemeChrome
      template="cart"
      storeSlug={slug}
      merchantId={merchant.id}
      ast={ast}
      tokens={tokens}
      siteKit={siteKit}
      chrome={
        <>
          <StoreHeader slug={slug} name={merchant.name} />
          <SupportWidget slug={slug} />
        </>
      }
      // The widgets render live cart data on their own; the keys simply tell
      // the renderer this page owns the cart context.
      contextSlots={{
        cart_lines: null,
        cart_summary: null,
        cart_drawer: null,
        checkout_steps: null,
        payment_methods: null,
      }}
      fallback={
        <section className="rounded-fq-lg border border-border bg-card p-8 text-center">
          <h1 className="font-bangla-display text-2xl font-bold">{t("Your cart", "আপনার কার্ট")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "Continue to checkout to review your items and pay.",
              "আইটেম দেখতে ও পেমেন্ট করতে চেকআউটে যান।",
            )}
          </p>
          <Link
            to="/store/$slug/checkout"
            params={{ slug }}
            className="mt-4 inline-block min-h-11 rounded-fq-md bg-primary px-5 text-sm font-medium leading-[2.75rem] text-primary-foreground"
          >
            {t("Go to checkout", "চেকআউটে যান")}
          </Link>
        </section>
      }
    />
  );
}
