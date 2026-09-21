import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreFooterMenus } from "@/components/store/StoreFooterMenus";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { useLang } from "@/lib/i18n";
import type { getStorePageFn } from "@/lib/storefront-search.functions";

type HomepageData = NonNullable<Awaited<ReturnType<typeof getStorePageFn>>>;

/**
 * CMS-designated storefront homepage (`/`).
 *
 * Renders a merchant-chosen published page with the same chrome and theme
 * tokens as ordinary store pages. Builder-authored pages are self-composed,
 * so no extra title block is prepended for them; markdown pages get the
 * standard title/excerpt header like their `/pages/<slug>` twin.
 */
export function StoreHomepage({
  home,
  slug,
}: {
  home: HomepageData;
  slug: string;
}) {
  const { t } = useLang();
  const {
    merchant,
    page,
    html,
    ast,
    tokens,
    siteKit,
    customCss,
    isBuilder,
    menus,
  } = home;

  const content = (
    <article>
      {!isBuilder && (
        <>
          <h1 className="font-bangla-display text-3xl font-bold">
            {page.title}
          </h1>
          {page.excerpt && (
            <p className="mt-2 text-muted-foreground">{page.excerpt}</p>
          )}
        </>
      )}
      <div
        className={
          isBuilder
            ? "fq-builder-page mt-6"
            : "fq-prose mt-6 space-y-4 text-sm leading-relaxed"
        }
        // Rendered server-side through the allow-list renderer (builder) or
        // the escaped markdown renderer — never raw author HTML.
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {!isBuilder && (
        <p className="mt-8 text-xs text-muted-foreground">
          {t("Last updated", "সর্বশেষ হালনাগাদ")}:{" "}
          <time dateTime={page.updated_at} className="money">
            {new Date(page.updated_at).toLocaleDateString("en-GB")}
          </time>
        </p>
      )}
    </article>
  );

  return (
    <>
      <ThemeChrome
        template="page"
        storeSlug={slug}
        merchantId={merchant.id}
        ast={ast}
        tokens={tokens}
        siteKit={siteKit}
        customCss={customCss}
        ownsPrimary
        chrome={<StoreHeader slug={slug} name={merchant.name} menus={menus} />}
        contextSlots={{ page_content: content }}
        containerClassName="mx-auto max-w-6xl px-4 py-8"
        fallback={<div>{content}</div>}
      />
      {/* Phase 16 T4: dashboard-designed footer menu; null when unclaimed. */}
      {menus && <StoreFooterMenus slug={slug} nodes={menus.footer} />}
    </>
  );
}
