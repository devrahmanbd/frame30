import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useCustomerAccount, useCustomerMutation, useCustomerWishlist } from "@/hooks/use-customer";
import { customerRemoveWishlistFn } from "@/lib/customer.functions";
import { useLang } from "@/lib/i18n";
import { fmtMinor } from "@/lib/money";
import { EmptyState, InlineError, PageHeader, TableSkeleton } from "@/components/console/primitives";
import { Heart, Trash2, ExternalLink, Bell, ShoppingBag, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/wishlist")({
  head: () => ({
    meta: [
      { title: "Wishlist — Framique" },
      { name: "description", content: "Products you saved for later." },
      { property: "og:title", content: "Wishlist — Framique" },
      { property: "og:description", content: "Products you saved for later." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: WishlistPage,
});

function WishlistPage() {
  const { t } = useLang();
  const { data: account } = useCustomerAccount();
  const wishlist = useCustomerWishlist(Boolean(account?.id));
  const [removedId, setRemovedId] = useState<string | null>(null);

  const removeMutation = useCustomerMutation(customerRemoveWishlistFn, [["customer", "wishlist"]]);

  const items = wishlist.data?.items ?? [];
  const currency = wishlist.data?.currency ?? "BDT";

  const handleRemove = async (itemId: string) => {
    setRemovedId(itemId);
    try {
      await removeMutation.mutateAsync({ itemId });
    } finally {
      setRemovedId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Wishlist", "উইশলিস্ট")}
        description={t(
          "Items you have saved across partner storefronts. Keep track of prices and stock.",
          "আপনার সংরক্ষিত পণ্যের তালিকা। মূল্য এবং স্টক আপডেট পর্যবেক্ষণ করুন।",
        )}
      />

      {wishlist.isPending && <TableSkeleton rows={3} cols={2} />}

      {wishlist.isError && (
        <InlineError
          message={t("Could not load your saved items.", "সংরক্ষিত পণ্য লোড করা যায়নি।")}
          onRetry={() => void wishlist.refetch()}
        />
      )}

      {!wishlist.isPending && !wishlist.isError && items.length === 0 && (
        <EmptyState
          title={t("Nothing saved yet", "এখনো কিছু সংরক্ষিত নেই")}
          description={t(
            "Tap the heart icon on any product in the storefront to save it here for later.",
            "পছন্দের পণ্যের হার্ট আইকনে ট্যাপ করে এখানে সংরক্ষণ করে রাখুন।",
          )}
        />
      )}

      {items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const isRemoving = removedId === item.id;
            const productHref = item.slug
              ? `/store/${account?.storeSlug ?? "shop"}/products/${item.slug}`
              : null;

            return (
              <div
                key={item.id}
                className="group relative flex flex-col justify-between rounded-fq-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                      {item.variantName && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {item.variantName}
                        </p>
                      )}
                    </div>
                    {item.stockAlert && (
                      <span
                        title={t("Stock alert active", "স্টক সতর্কতা সক্রিয়")}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                      >
                        <Bell className="h-3 w-3" />
                        {t("Alert", "সতর্কতা")}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-base font-bold text-foreground">
                      {fmtMinor(item.priceMinor, currency)}
                    </span>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-2 pt-3 border-t border-border/70">
                  {productHref ? (
                    <Link
                      to={productHref}
                      className="inline-flex items-center gap-1.5 rounded-fq-md bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 text-xs font-medium transition-colors"
                    >
                      <ShoppingBag className="h-3.5 w-3.5" />
                      {t("View in Store", "স্টোরে দেখুন")}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("Saved variant", "সংরক্ষিত ভ্যারিয়েন্ট")}
                    </span>
                  )}

                  <button
                    type="button"
                    disabled={isRemoving}
                    onClick={() => handleRemove(item.id)}
                    className="inline-flex items-center gap-1 rounded-fq-md p-1.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                    aria-label={t("Remove item", "আইটেম মুছুন")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only sm:not-sr-only">{t("Remove", "মুছুন")}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
