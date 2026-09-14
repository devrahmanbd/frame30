import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { StoreHeader } from "@/components/store/StoreHeader";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { useLang } from "@/lib/i18n";
import { buildPageHead } from "@/lib/theme-seo";
import { getStorePageFn } from "@/lib/storefront-search.functions";
import { verificationTags } from "@/lib/search-console";
import { handleMissingStoreUrl } from "@/lib/missing-url";

export const Route = createFileRoute("/store/$slug/pages/$pageSlug")({
  loader: async ({ params }) => {
    const found = await getStorePageFn({ data: { slug: params.slug, pageSlug: params.pageSlug } });
    if (!found) throw await handleMissingStoreUrl(params.slug, `/store/${params.slug}/pages/${params.pageSlug}`);
    return found;
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return { meta: [{ title: "Page unavailable" }, { name: "robots", content: "noindex" }] };
    }
    const base = buildPageHead({
      origin: loaderData.origin,
      path: `/store/${params.slug}/pages/${loaderData.page.slug}`,
      storePath: `/store/${params.slug}`,
      storeName: loaderData.merchant.name,
      themeKey: loaderData.themeKey,
      robots: loaderData.page.robots,
      noindex: (loaderData.page.robots ?? "").startsWith("noindex"),
      seo: loaderData.seo ?? null,
      page: loaderData.page,
    });
    return {
      ...base,
      meta: [...(base.meta ?? []), ...verificationTags(loaderData.siteKit.verification)],
    };
  },
  component: StorePageView,
});

function StorePageView() {
  const { t } = useLang();
  const { slug } = Route.useParams();
  const { merchant, page, html, nav, ast, tokens, siteKit, customCss, isBuilder } =
    Route.useLoaderData();

  const breadcrumb = (
    <nav aria-label={t("Breadcrumb", "ব্রেডক্রাম্ব")} className="text-xs text-muted-foreground">
      <Link to="/store/$slug" params={{ slug }} className="underline">
        {merchant.name}
      </Link>
      <span aria-hidden> / </span>
      <span>{page.title}</span>
    </nav>
  );

  const content = (
    <article>
      <h1 className="font-bangla-display text-3xl font-bold">{page.title}</h1>
      {page.excerpt && <p className="mt-2 text-muted-foreground">{page.excerpt}</p>}
      <div
        className={
          isBuilder
            ? "fq-builder-page mt-6"
            : "fq-prose mt-6 space-y-4 text-sm leading-relaxed"
        }
        // Markdown is rendered server-side through an allow-list renderer that
        // escapes every raw character before emitting tags.
        dangerouslySetInnerHTML={{ __html: html }}
      />
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
            <Link
              to="/store/$slug/pages/$pageSlug"
              params={{ slug, pageSlug: item.slug }}
              aria-current={item.slug === page.slug ? "page" : undefined}
              className={`block rounded-fq-md px-3 py-2 text-sm ${
                item.slug === page.slug ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {item.title}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );

  return (
    <ThemeChrome
      template="page"
      storeSlug={slug}
      merchantId={merchant.id}
      ast={ast}
      tokens={tokens}
      siteKit={siteKit}
      customCss={customCss}
      ownsPrimary
      chrome={<StoreHeader slug={slug} name={merchant.name} />}
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
  );
}

