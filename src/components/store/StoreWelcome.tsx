import { useLang } from "@/lib/i18n";
import { ThemeSurface } from "@/components/builder/ThemeSurface";
import { fontStylesheetUrl } from "@/lib/theme-fonts";
import type { ThemeTokens } from "@/lib/builder-ast";

/**
 * Default storefront homepage.
 *
 * Every store without a merchant-designated homepage renders this instead
 * of the theme index: brand chrome plus a quiet welcome plate. Designated
 * homepages are untouched — this only fills the gap. When a theme's tokens
 * are available, it renders within the theme's scoped ThemeSurface.
 */
export function StoreWelcome({
  slug,
  name,
  custom,
  tokens = null,
}: {
  slug: string;
  name: string;
  /** True on custom-domain hosts (root-relative links), else `/store/<slug>`. */
  custom: boolean;
  tokens?: ThemeTokens | null;
}) {
  const base = custom ? "" : `/store/${slug}`;
  void slug;
  void custom;

  const plate = <WelcomePlate name={name} base={base} />;

  if (tokens) {
    const fontUrl = fontStylesheetUrl(tokens);
    return (
      <ThemeSurface tokens={tokens}>
        {fontUrl ? (
          <link rel="stylesheet" href={fontUrl} crossOrigin="anonymous" />
        ) : null}
        {plate}
      </ThemeSurface>
    );
  }

  return plate;
}

export function WelcomePlate({ name, base }: { name: string; base: string }) {
  const { t } = useLang();
  void base;
  void name;
  return (
    <main className="mx-auto grid max-w-2xl place-items-center px-4 py-24 text-center">
      <div className="w-full">
        <h1
          style={{
            fontFamily: "var(--theme-font-display, inherit)",
            color: "var(--theme-ink, inherit)",
          }}
          className="font-bangla-display mt-3 text-4xl font-bold tracking-tight sm:text-5xl"
        >
          {t("Welcome to Framique", "ফ্রেমিকে স্বাগতম")}
        </h1>
        <h3
          style={{ color: "var(--theme-muted-ink, inherit)" }}
          className="mx-auto mt-4 max-w-prose text-sm font-normal leading-relaxed text-muted-foreground"
        >
          {t(
            "This store is getting ready. Browse the collection while the shelves are stocked.",
            "এই স্টোরটি প্রস্তুত হচ্ছে। তাক সাজানো পর্যন্ত কালেকশন ঘুরে দেখুন।",
          )}
        </h3>
      </div>
    </main>
  );
}
