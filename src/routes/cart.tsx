import {
  createFileRoute,
  Link,
  notFound,
  redirect,
} from "@tanstack/react-router";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { StoreHeader } from "@/components/store/StoreHeader";
import {
  getFeaturedStoreSlug,
  getStoreChrome,
  resolveStorefrontHostFn,
} from "@/lib/storefront.functions";
import { useLang } from "@/lib/i18n";

/**
 * Custom-host cart (`microscrop.shop/cart`) + legacy single-shop redirector.
 *
 * On a custom host the merchant chrome is served directly (no redirect, so
 * SPA hydration stays on this route). Everywhere else the legacy behavior
 * is preserved: bounce to the featured store's path cart.
 */
export const Route = createFileRoute("/cart")({
  loader: async () => {
    let host: Awaited<ReturnType<typeof resolveStorefrontHostFn>> = null;
    try {
      host = await resolveStorefrontHostFn();
    } catch {
      host = null;
    }
    if (host) {
      const chrome = await getStoreChrome({
        data: { slug: host.merchantSlug, template: "cart" },
      });
      if (!chrome) throw notFound();
      return { ...chrome, slug: host.merchantSlug, custom: true as const };
    }
    const slug = await getFeaturedStoreSlug();
    if (slug)
      throw redirect({
        to: "/store/$slug/cart",
        params: { slug },
        replace: true,
      });
    throw redirect({ to: "/", replace: true });
  },
  head: ({ loaderData }) => {
    const name =
      (loaderData as { merchant?: { name?: string } } | null)?.merchant?.name ??
      "Store";
    return {
      meta: [
        { title: `Cart — ${name}` },
        {
          name: "description",
          content: `Review the items in your ${name} cart before checkout.`,
        },
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
  const data = Route.useLoaderData();
  const { slug, merchant } = data;
  return (
    <ThemeChrome
      template="cart"
      storeSlug={slug}
      merchantId={merchant.id}
      ast={data.ast}
      tokens={data.tokens}
      siteKit={data.siteKit}
      installedPlugins={data.installedPlugins}
      chrome={
        <>
          <StoreHeader slug={slug} name={merchant.name} menus={data.menus} />
        </>
      }
      contextSlots={{
        cart_lines: null,
        cart_summary: null,
        cart_drawer: null,
        checkout_steps: null,
        payment_methods: null,
      }}
      fallback={
        <section className="rounded-fq-lg border border-border bg-card p-8 text-center">
          <h1 className="font-bangla-display text-2xl font-bold">
            {t("Your cart", "আপনার কার্ট")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "Continue to checkout to review your items and pay.",
              "আইটেম দেখতে ও পেমেন্ট করতে চেকআউটে যান।",
            )}
          </p>
          <Link
            to="/checkout"
            className="mt-4 inline-block min-h-11 rounded-fq-md bg-primary px-5 text-sm font-medium leading-[2.75rem] text-primary-foreground"
          >
            {t("Go to checkout", "চেকআউটে যান")}
          </Link>
        </section>
      }
    />
  );
}
