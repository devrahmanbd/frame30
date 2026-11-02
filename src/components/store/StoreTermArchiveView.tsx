import type { TermKind } from "@/lib/blog-taxonomy";
import { useLang } from "@/lib/i18n";
import { StoreHeader } from "@/components/store/StoreHeader";
import { ArchiveView } from "@/components/store/ArchiveView";
import { archiveContextFrom } from "@/lib/archive-context";
import type { ThemeAst, ThemeTokens } from "@/lib/builder-ast";
import type { TermArchive } from "@/lib/blog-index.server";

export type StoreTermArchiveData = {
  merchant: { id: string; name: string; slug: string };
  origin: string | null;
  menus: import("@/lib/menus/menu").StoreMenus;
  themeKey: string | null;
  tokens: ThemeTokens | null;
  ast: ThemeAst | null;
  archive: TermArchive;
  basePath: string;
};

export function StoreTermArchiveView({
  data,
  kind,
  surface = "host",
}: {
  data: StoreTermArchiveData;
  kind: TermKind;
  surface?: "store" | "host";
}) {
  const { t, lang } = useLang();
  const { term } = data.archive;
  const heading = lang === "bn" ? term.name : term.name_en || term.name;

  const facets = data.archive.children.length
    ? data.archive.children.map((child) => ({
        slug: child.slug,
        name: child.name,
        kind,
        count: child.article_count ?? 0,
      }))
    : data.archive.facets;

  const context = archiveContextFrom({
    kind,
    term,
    articles: data.archive.articles,
    facets,
    paging: data.archive.paging,
    ancestry: data.archive.ancestry,
  });

  const basePath = data.basePath;
  const blogRootHref =
    surface === "store" ? `/store/${data.merchant.slug}/blog` : "/blog";

  return (
    <>
      <StoreHeader
        slug={data.merchant.slug}
        name={data.merchant.name}
        menus={data.menus}
        themeKey={data.themeKey}
      />
      <ArchiveView
        kind={kind}
        context={context}
        ast={data.ast}
        tokens={data.tokens}
        themeKey={data.themeKey}
        storeSlug={data.merchant.slug}
        storeName={data.merchant.name}
        feed={{
          articles: data.archive.articles,
          facets,
          paging: data.archive.paging,
          activeSlug: term.slug,
          basePath: (page: number) =>
            page > 1 ? `${basePath}?page=${page}` : basePath,
        }}
        header={
          <>
            <nav
              aria-label={t("Breadcrumb", "ব্রেডক্রাম্ব")}
              className="mb-4 text-xs text-muted-foreground"
            >
              <a href={blogRootHref} className="underline">
                {t("Blog", "ব্লগ")}
              </a>
              {data.archive.ancestry.map((crumb) => (
                <span key={crumb.id}>
                  <span aria-hidden> / </span>
                  {crumb.id === term.id ? (
                    <span aria-current="page">{crumb.name}</span>
                  ) : (
                    <a
                      href={
                        surface === "store"
                          ? `/store/${data.merchant.slug}/blog/${kind}/${crumb.slug}`
                          : `/blog/${kind}/${crumb.slug}`
                      }
                      className="underline"
                    >
                      {crumb.name}
                    </a>
                  )}
                </span>
              ))}
            </nav>
            <header className="mb-8 border-b border-border pb-6">
              <h1 className="font-bangla-display text-3xl font-semibold">
                {heading}
              </h1>
              {term.description ? (
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  {term.description}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  `${data.archive.paging.total} articles`,
                  `${data.archive.paging.total}টি লেখা`,
                )}
              </p>
            </header>
          </>
        }
        empty={
          <p className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
            {data.archive.paging.overrun
              ? t("That page does not exist yet.", "এই পেজটি এখনো নেই।")
              : kind === "tag"
                ? t(
                    "No articles with this tag yet.",
                    "এই ট্যাগে এখনো কোনো লেখা নেই।",
                  )
                : t(
                    "No articles in this category yet.",
                    "এই ক্যাটাগরিতে এখনো কোনো লেখা নেই।",
                  )}
          </p>
        }
      />
    </>
  );
}
