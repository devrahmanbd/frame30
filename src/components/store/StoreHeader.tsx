import { Link } from "@tanstack/react-router";
import { Search, ShoppingBag, User } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useLang } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";

export function StoreHeader({
  slug,
  name,
  tagline,
}: {
  slug: string;
  name: string;
  tagline?: string | null;
}) {
  const { count, hydrated } = useCart(slug);
  const { t } = useLang();
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link to="/store/$slug" params={{ slug }} className="min-w-0">
          <span className="font-bangla-display block truncate text-lg font-semibold">{name}</span>
          {tagline && <span className="block truncate text-xs text-muted-foreground">{tagline}</span>}
        </Link>
        <div className="flex items-center gap-2">
        <Link
          to="/store/$slug/search"
          params={{ slug }}
          search={{}}
          className="inline-flex min-h-11 items-center gap-2 rounded-fq-md border border-border px-3 text-sm"
        >
          <Search className="size-4" aria-hidden />
          <span className="sr-only sm:not-sr-only">{t("Search", "খুঁজুন")}</span>
        </Link>
        <Link
          to="/store/$slug/account"
          params={{ slug }}
          aria-label={t("Your account", "আপনার অ্যাকাউন্ট")}
          className="inline-flex min-h-11 items-center rounded-fq-md border border-border px-3"
        >
          <User className="size-4" aria-hidden />
        </Link>
        <LanguageToggle />
        <Link
          to="/store/$slug/checkout"
          params={{ slug }}
          className="inline-flex min-h-11 items-center gap-2 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          <ShoppingBag className="size-4" aria-hidden />
          <span>{t("Cart", "কার্ট")}</span>
          <span className="money rounded-full bg-primary-foreground/20 px-2 text-xs" aria-live="polite">
            {hydrated ? count : 0}
          </span>
        </Link>
        </div>
      </div>
    </header>
  );
}
