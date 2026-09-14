import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";

import { DocBlocks } from "@/components/docs/DocBlocks";
import { DocsSearch } from "@/components/docs/DocsSearch";
import { DocsAiWidget } from "@/components/docs/DocsAiWidget";
import { PublicShell } from "@/components/public/PublicShell";
import { useLang } from "@/lib/i18n";
import {
  CURRENT_VERSION,
  DOC_VERSIONS,
  docCanonicalPath,
  docHeadings,
  docNav,
  docNeighbours,
  docPage,
  docPath,
  docSourcePath,
  docVersion,
  isDocVersion,
  type DocVersionId} from "@/lib/docs";
import { breadcrumbNode, buildMarketingHead, techArticleNode } from "@/lib/marketing-seo";
import { getSiteContext } from "@/lib/site-seo.functions";

/**
 * One route serves every documentation page, for every version.
 *
 * SEO rules that are enforced here and nowhere else:
 *  - the canonical always points at the **current** version, so a sunset copy
 *    never competes with the page it was replaced by;
 *  - a sunset version renders `noindex,follow` plus a visible banner — the URL
 *    keeps working for bookmarks, it just stops entering the index;
 *  - an unknown version or slug is `noindex,follow` with a real index in the
 *    body, rather than a bare 404 shell that wastes the inbound link.
 */
export const Route = createFileRoute("/docs/$version/$slug")({
  loader: async ({ params }) => {
    const site = await getSiteContext().catch(() => null);
    const version = isDocVersion(params.version) ? params.version : null;
    return {
      origin: site.origin,
      
      version,
      slug: params.slug,
      found: Boolean(version && docPage(version, params.slug))};
  },
  head: ({ params, loaderData }) => {
    const origin = loaderData?.origin ?? null;
    const version = isDocVersion(params.version) ? params.version : null;
    const page = version ? docPage(version, params.slug) : null;
    const path = `/docs/${params.version}/${params.slug}`;
    const current = version === CURRENT_VERSION;

    const head = buildMarketingHead({
      route: "docs",
      origin,
      // Sunset and unknown URLs both point their canonical at the live page.
      path: page ? docCanonicalPath(page.slug) : path,
      ...(page
        ? { title: `${page.title.en} — Framique docs`, description: page.summary.en }
        : {
            title: "Documentation page not found",
            description:
              "This documentation page does not exist in this version. Browse the current Framique developer documentation index instead."}),
      ...(page && current ? {} : { robots: "noindex,follow" })});

    const nodes = [
      breadcrumbNode("docs", origin, "en", page ? { name: page.title.en, path } : undefined),
      page
        ? techArticleNode({
            origin,
            path: docCanonicalPath(page.slug),
            headline: page.title.en,
            description: page.summary.en,
            publishedAt: page.updated,
            updatedAt: page.updated,
            section: "Developer documentation"})
        : null,
    ].filter((node): node is Record<string, unknown> => Boolean(node));

    return {
      meta: head.meta,
      links: head.links,
      scripts:
        nodes.length > 0
          ? [
              {
                type: "application/ld+json",
                children: JSON.stringify({ "@context": "https://schema.org", "@graph": nodes })},
            ]
          : []};
  },
  component: DocsPage});

function DocsPage() {
  const { lang } = useLang();
  const { version, slug, found  } = Route.useLoaderData();

  if (!version || !found) {
    return (
      <PublicShell >
        <section className="mx-auto max-w-3xl px-4 py-16">
          <h1 className="font-bangla-display text-3xl font-bold">This page moved or never existed</h1>
          <p className="mt-3 text-muted-foreground">
            Nothing is served at <code className="font-mono">/docs/{version ?? "?"}/{slug}</code>. The current
            documentation index is below.
          </p>
          <ul className="mt-6 space-y-2 text-sm">
            {docNav(CURRENT_VERSION).flatMap((group) =>
              group.pages.map((page) => (
                <li key={page.slug}>
                  <Link
                    to="/docs/$version/$slug"
                    params={{ version: CURRENT_VERSION, slug: page.slug }}
                    className="fq-tap text-primary underline underline-offset-4"
                  >
                    {page.title[lang]}
                  </Link>
                </li>
              )),
            )}
          </ul>
        </section>
      </PublicShell>
    );
  }

  const page = docPage(version, slug)!;
  const nav = docNav(version);
  const headings = docHeadings(page);
  const { prev, next } = docNeighbours(version, slug);
  const meta = docVersion(version);

  return (
    <PublicShell >
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 lg:grid-cols-[16rem_minmax(0,1fr)_14rem]">
        <DocsSidebar version={version} activeSlug={slug} nav={nav} lang={lang} />

        <article className="min-w-0">
          {meta.status === "sunset" && (
            <p
              role="status"
              className="mb-6 rounded-fq-md border border-warning bg-warning-soft p-4 text-sm text-warning-foreground"
            >
              You are reading <strong>{meta.label}</strong>, which is retired
              {meta.sunsetOn ? ` on ${meta.sunsetOn}` : ""}. It is kept online for existing integrations only.{" "}
              <Link
                to="/docs/$version/$slug"
                params={{ version: CURRENT_VERSION, slug }}
                className="underline underline-offset-4"
              >
                Read the {CURRENT_VERSION} version
              </Link>
              .
            </p>
          )}

          <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
            <Link to="/docs" className="hover:underline">
              Docs
            </Link>{" "}
            / <span>{page.title[lang]}</span>
          </nav>

          <h1 className="mt-2 font-bangla-display text-3xl font-bold md:text-4xl">{page.title[lang]}</h1>
          <p className="mt-3 text-lg text-muted-foreground">{page.summary[lang]}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Version {meta.label} · updated {page.updated}
          </p>

          {headings.length > 1 && (
            <details className="mt-4 mb-6 rounded-fq-md border border-border/80 bg-card/60 p-3 text-xs lg:hidden group">
              <summary className="cursor-pointer font-semibold text-foreground flex items-center justify-between min-h-[36px] list-none">
                <span>On this page ({headings.length} sections)</span>
                <ChevronDown className="size-3.5 transition-transform group-open:rotate-180 text-muted-foreground" />
              </summary>
              <ul className="mt-2.5 space-y-1.5 border-t border-border/50 pt-2 text-muted-foreground">
                {headings.map((heading) => (
                  <li key={heading.anchor} className={heading.level === 3 ? "pl-3" : ""}>
                    <a href={`#${heading.anchor}`} className="block py-1 hover:text-primary transition-colors">
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <DocBlocks page={page} />

          <footer className="mt-14 border-t border-border pt-6">
            <div className="flex flex-wrap justify-between gap-4 text-sm">
              {prev ? (
                <Link
                  to="/docs/$version/$slug"
                  params={{ version, slug: prev.slug }}
                  className="fq-tap text-primary underline underline-offset-4"
                >
                  ← {prev.title[lang]}
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link
                  to="/docs/$version/$slug"
                  params={{ version, slug: next.slug }}
                  className="fq-tap text-primary underline underline-offset-4"
                >
                  {next.title[lang]} →
                </Link>
              )}
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              Something wrong on this page? It is written in{" "}
              <code className="font-mono">{docSourcePath(page.slug)}</code> —{" "}
              <Link to="/contact" className="underline underline-offset-4">
                tell us
              </Link>{" "}
              and we will fix it.
            </p>
          </footer>
        </article>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">On this page</p>
            <ul className="mt-3 space-y-2 text-sm">
              {headings.map((heading) => (
                <li key={heading.anchor} className={heading.level === 3 ? "pl-3" : ""}>
                  <a href={`#${heading.anchor}`} className="fq-tap text-muted-foreground hover:text-foreground">
                    {heading.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
      <DocsAiWidget version={version} />
    </PublicShell>
  );
}

function DocsSidebar({
  version,
  activeSlug,
  nav,
  lang}: {
  version: DocVersionId;
  activeSlug: string;
  nav: ReturnType<typeof docNav>;
  lang: "en" | "bn";
}) {
  return (
    <nav aria-label="Documentation" className="lg:sticky lg:top-24 lg:self-start">
      <DocsSearch version={version} />

      <label htmlFor="docs-version" className="mt-4 block text-xs font-semibold uppercase text-muted-foreground">
        Version
      </label>
      <select
        id="docs-version"
        value={version}
        onChange={(event) => {
          // Full navigation keeps the version in the URL, which is what makes a
          // docs link shareable and quotable in a support thread.
          window.location.href = docPath(event.target.value as DocVersionId, activeSlug);
        }}
        className="mt-1 min-h-11 w-full rounded-fq-md border border-border bg-background px-2 text-sm"
      >
        {DOC_VERSIONS.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
            {v.status === "sunset" ? " (retired)" : " (current)"}
          </option>
        ))}
      </select>

      {nav.map((group) => (
        <div key={group.id} className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label[lang]}
          </p>
          <ul className="mt-2 space-y-1">
            {group.pages.map((page) => (
              <li key={page.slug}>
                <Link
                  to="/docs/$version/$slug"
                  params={{ version, slug: page.slug }}
                  className={`block rounded-fq-md px-2 py-2 text-sm ${
                    page.slug === activeSlug ? "bg-accent font-medium" : "hover:bg-accent"
                  }`}
                  aria-current={page.slug === activeSlug ? "page" : undefined}
                >
                  {page.title[lang]}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
