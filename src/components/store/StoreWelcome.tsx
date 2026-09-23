import { StoreHeader } from "@/components/store/StoreHeader";
import { useLang } from "@/lib/i18n";

/**
 * Default storefront homepage.
 *
 * Every store without a merchant-designated homepage renders this instead
 * of the theme index: brand chrome plus a quiet welcome plate. Designated
 * homepages are untouched — this only fills the gap.
 */
export function StoreWelcome({
  slug,
  name,
  custom,
}: {
  slug: string;
  name: string;
  /** True on custom-domain hosts (root-relative links), else `/store/<slug>`. */
  custom: boolean;
}) {
  const base = custom ? "" : `/store/${slug}`;
  return (
    <>
      <StoreHeader slug={slug} name={name} menus={null} />
      <WelcomePlate name={name} base={base} />
    </>
  );
}

export function WelcomePlate({ name, base }: { name: string; base: string }) {
  const { t } = useLang();
  return (
      <main className="mx-auto grid max-w-2xl place-items-center px-4 py-24 text-center">
        <div>
          <p className="text-xs fq-caps tracking-[0.16em] text-muted-foreground">
            {name}
          </p>
          <h1 className="font-bangla-display mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            {t("Welcome to Framique", "ফ্রেমিকে স্বাগতম")}
          </h1>
          <p className="mx-auto mt-4 max-w-prose text-sm leading-relaxed text-muted-foreground">
            {t(
              "This store is getting ready. Browse the collection while the shelves are stocked.",
              "এই স্টোরটি প্রস্তুত হচ্ছে। তাক সাজানো পর্যন্ত কালেকশন ঘুরে দেখুন।",
            )}
          </p>
          <a
            href={`${base}/search`}
            className="mt-7 inline-flex min-h-11 items-center rounded-fq-md bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            {t("Browse products", "পণ্য দেখুন")}
          </a>
        </div>
      </main>
  );
}
