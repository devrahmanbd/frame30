import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StudioNodes } from "@/components/store/StudioNodes";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { themeRendersBody } from "@/lib/theme-body-slot";
import { PluginLayer } from "@/components/store/PluginLayer";
import { useLang } from "@/lib/i18n";
import { isCustomHostPath } from "@/lib/storefront-url";
import { buildTrayRegistry } from "@/lib/unified-widget-registry";
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
  // Frame30 one-registry (storefront): the authored twin tree resolves against
  // the SAME tenant-authorized defs as the editor — the tray registry is built
  // from the loader's server-authorized installs (pure and deterministic in
  // SSR + hydration), never the def-less fallback that misses every twin.
  const registry = useMemo(
    () => buildTrayRegistry(installedPlugins),
    [installedPlugins],
  );

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
          <StudioNodes
            nodes={studioNodes}
            registry={registry}
            themeKey={themeKey}
          />
        </div>
      ) : (
        <div
          className={
            isBuilder
              ? "fq-builder-page mt-6"
              : "fq-prose mt-6 space-y-4 text-sm leading-relaxed"
          }
          dangerouslySetInnerHTML={{ __html: html }} // sast-allow: html-sink -- getStorePageFn html is renderBuilderHtml (esc plus safeHref/safeSrc, html blocked) or renderPageMarkdown (parseInline plus blockToHtml)
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

  // The ONE predicate that decides which path this page renders through:
  // does the THEME render the body? It is the same question `ThemeChrome`
  // asks itself (`themeRendersBody`), imported rather than re-derived, so the
  // theme's choice and this route's layout can never disagree.
  //
  //  - themed: the theme's main declares this route's `page_content` slot, so
  //    the theme's layout renders and the route's `fallback` never does.
  //  - unthemed: no theme AST, or a main without the slot — the route's
  //    fallback renders the body and the nav beside it.
  const themeOwnsBody = themeRendersBody(ast, "page_content");

  // In the themed path the route's fallback is not rendered at all, so the
  // sibling-page nav has to travel THROUGH the theme's content slot: below
  // the merchant's own body, as a sibling of their `<article>` — never inside
  // it, and the merchant's content AST is untouched.
  //
  // The themed slot renders the slot value with NO wrapper of its own (the
  // context widget renders it bare when it declares no heading), so the two
  // would sit flush against each other: the nav's `<aside>` starts right
  // where the merchant's article ends. The theme's own `space-y-8` — the
  // utility its `main` spaces its children with — separates them here, so
  // the nav is visually detached from the article while remaining its
  // sibling.
  const pageContent = themeOwnsBody ? (
    <div className="space-y-8">
      {content}
      {sidebar}
    </div>
  ) : (
    content
  );

  // The two-column grid belongs to the fallback path only: there the nav is a
  // sibling column. When the theme renders the body the container has a
  // single child, so reserving `lg:grid-cols-[1fr_15rem]` would leave an
  // empty 15rem gutter at `lg+`.
  const containerClassName = themeOwnsBody
    ? "mx-auto max-w-5xl px-4 py-8"
    : "mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1fr_15rem]";

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
        registry={registry}
        ownsPrimary={custom}
        contentSlot="page_content"
        chrome={
          <StoreHeader
            slug={slug}
            name={merchant.name}
            menus={menus}
            themeKey={themeKey ?? null}
          />
        }
        contextSlots={{ breadcrumb, page_content: pageContent }}
        containerClassName={containerClassName}
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
