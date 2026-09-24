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
  void slug;
  void custom;
  return <WelcomePlate name={name} base={base} />;
}

export function WelcomePlate({ name, base }: { name: string; base: string }) {
  const { t } = useLang();
  void base;
  return (
    <main className="mx-auto grid max-w-2xl place-items-center px-4 py-24 text-center">
      <div>
        <h1 className="font-bangla-display mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          {t("Welcome to Framique", "ফ্রেমিকে স্বাগতম")}
        </h1>
        <h3 className="mx-auto mt-4 max-w-prose text-sm font-normal leading-relaxed text-muted-foreground">
          {t(
            "This store is getting ready. Browse the collection while the shelves are stocked.",
            "এই স্টোরটি প্রস্তুত হচ্ছে। তাক সাজানো পর্যন্ত কালেকশন ঘুরে দেখুন।",
          )}
        </h3>
      </div>
    </main>
  );
}

