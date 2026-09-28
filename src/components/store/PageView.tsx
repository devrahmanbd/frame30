import { Link, useRouterState } from "@tanstack/react-router";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StudioNodes } from "@/components/store/StudioNodes";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { useLang } from "@/lib/i18n";
import { isCustomHostPath } from "@/lib/storefront-url";
import type { getStorePageFn } from "@/lib/storefront-search.functions";

export type PagePayload = Exclude<
  Awaited<ReturnType<typeof getStorePageFn>>,
  null
>;

export function PageView({ data }: { data: PagePayload }) {
  const { t } = useLang();
  const { location } = useRouterState();
  const custom = isCustomHostPath(location.pathname);

  const {
    merchant,
    page,
    html,
    nav,
    ast,
    tokens,
    siteKit,
    customCss,
    isBuilder,
    menus,
    studioNodes,
    installedPlugins,
    themeKey,
  } = data;
  const slug = merchant.slug;

  const breadcrumb = (
    <nav
      aria-label={t("Breadcrumb", "ব্রেডক্রাম্ব")}
      className="text-xs text-muted-foreground"
    >
      {custom ? (
        <Link to="/" className="underline">
          {merchant.name}
        </Link>
      ) : (
        <Link
          to="/store/$slug"
          search={{ preview_token: undefined }}
          params={{ slug }}
          className="underline"
        >
          {merchant.name}
        </Link>
      )}
      <span aria-hidden> / </span>
      <span>{page.title}</span>
    </nav>
  );

  const selfComposed =
    isBuilder || (studioNodes != null && studioNodes.length > 0);
  const content = (
    <article>
      {!selfComposed && (
        <>
          <h1 className="font-bangla-display text-3xl font-bold">
            {page.title}
          </h1>
          {page.excerpt && (
            <p className="mt-2 text-muted-foreground">{page.excerpt}</p>
          )}
        </>
      )}
      {studioNodes && studioNodes.length > 0 ? (
        <div className="fq-builder-page mt-6">
          <StudioNodes nodes={studioNodes} />
        </div>
      ) : (
        <div
          className={
            isBuilder
              ? "fq-builder-page mt-6"
              : "fq-prose mt-6 space-y-4 text-sm leading-relaxed"
          }
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      <p className="mt-8 text-xs text-muted-foreground">
        {t("Last updated", "সর্বশেষ হালনাগাদ")}:{" "}
        <time dateTime={page.updated_at} className="money">
          {new Date(page.updated_at).toLocaleDateString("en-GB")}
        </time>
      </p>
    </article>
  );

  const sidebar = nav.length > 0 && (
    <aside aria-label={t("Store information", "দোকানের তথ্য")}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("More information", "আরও তথ্য")}
      </h2>
      <ul className="mt-2 space-y-1">
        {nav.map((item) => (
          <li key={item.slug}>
            {custom ? (
              <Link
                to="/pages/$pageSlug"
                params={{ pageSlug: item.slug }}
                aria-current={item.slug === page.slug ? "page" : undefined}
                className={`block rounded-fq-md px-3 py-2 text-sm ${
                  item.slug === page.slug
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {item.title}
              </Link>
            ) : (
              <Link
                to="/store/$slug/pages/$pageSlug"
                params={{ slug, pageSlug: item.slug }}
                aria-current={item.slug === page.slug ? "page" : undefined}
                className={`block rounded-fq-md px-3 py-2 text-sm ${
                  item.slug === page.slug
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {item.title}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );

  return (
    <PluginLayer plugins={installedPlugins}>
      <ThemeChrome
        template="page"
        storeSlug={slug}
        themeKey={themeKey ?? null}
        merchantId={merchant.id}
        ast={ast}
        tokens={tokens}
        siteKit={siteKit}
        customCss={customCss}
        ownsPrimary={custom}
        chrome={
          <StoreHeader
            slug={slug}
            name={merchant.name}
            menus={menus}
            themeKey={themeKey ?? null}
          />
        }
        contextSlots={{ breadcrumb, page_content: content }}
        containerClassName="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1fr_15rem]"
        fallback={
          <>
            <div>
              {breadcrumb}
              {content}
            </div>
            {sidebar}
          </>
        }
      />
    </PluginLayer>
  );
}
