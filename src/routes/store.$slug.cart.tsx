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
import { PluginLayer } from "@/components/store/PluginLayer";
import { StoreHeader } from "@/components/store/StoreHeader";
import { SupportWidget } from "@/components/store/SupportWidget";
import { getStoreChrome } from "@/lib/storefront.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/store/$slug/cart")({
  loader: async ({ params }) => {
    const chrome = await getStoreChrome({
      data: { slug: params.slug, template: "cart" },
    });
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
      <h1 className="text-2xl font-semibold">
        {t("Store not found", "দোকান পাওয়া যায়নি")}
      </h1>
    </main>
  );
}

function CartPage() {
  const { t } = useLang();
  const { slug } = Route.useParams();
  const { merchant, ast, tokens, siteKit, menus, installedPlugins } =
    Route.useLoaderData();

  return (
    <PluginLayer plugins={installedPlugins}>
      <ThemeChrome
        template="cart"
        storeSlug={slug}
        merchantId={merchant.id}
        ast={ast}
        tokens={tokens}
        siteKit={siteKit}
        chrome={
          <>
            <StoreHeader slug={slug} name={merchant.name} menus={menus} />
            {/* Storefront AI support disabled as of now — active on /dashboard and platform front pages */}
            {/* <SupportWidget slug={slug} /> */}
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
          <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8 text-center">
            <h1 className="font-bangla-display text-3xl sm:text-4xl font-medium tracking-wide text-foreground/90">
              {t("Your Bag", "আপনার ব্যাগ")}
            </h1>
            <p className="mt-4 text-[13.5px] text-muted-foreground leading-relaxed">
              {t(
                "Review the items in your bag before proceeding to checkout.",
                "চেকআউটে যাওয়ার আগে আপনার ব্যাগের আইটেমগুলো দেখে নিন।",
              )}
            </p>
            <div className="mt-10">
              <Link
                to="/store/$slug/checkout"
                params={{ slug }}
                className="inline-flex min-h-14 items-center justify-center w-full sm:w-80 bg-foreground px-8 text-[13px] font-bold fq-caps tracking-widest text-background transition-transform hover:bg-foreground/90 active:scale-[0.98]"
              >
                {t("Proceed to Checkout", "চেকআউটে যান")}
              </Link>
            </div>
          </div>
        }
      />
    </PluginLayer>
  );
}
