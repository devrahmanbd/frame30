import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "@/components/public/PublicShell";
import { getSiteContext } from "@/lib/site-seo.functions";
import { buildMarketingHead, breadcrumbNode, articleNode } from "@/lib/marketing-seo";
import { useLang } from "@/lib/i18n";
import { LEGAL_DOCS, ORG_NAP, legalDoc, napAddressLine } from "@/lib/legal";

/**
 * One route renders all five legal documents. The content is a static,
 * versioned module rather than a database row on purpose: legal text must be
 * reviewable in a diff, must render even when every backend read is failing,
 * and must never depend on a tenant's data.
 */
export const Route = createFileRoute("/legal/$doc")({
  loader: async ({ params }) => {
    const doc = legalDoc(params.doc);
    // Unknown slugs render an in-page notice with the real index instead of a
    // hard 404 shell: a stale bookmark to /legal/tos should still land the
    // reader on the list of current documents.
    const site = await getSiteContext().catch(() => null);
    return {  origin: site.origin, slug: params.doc, found: Boolean(doc) };
  },
  head: ({ params, loaderData }) => {
    const origin = loaderData?.origin ?? null;
    const doc = legalDoc(params.doc);
    const path = `/legal/${params.doc}`;
    const head = buildMarketingHead({
      route: "legal",
      origin,
      path,
      title: doc ? `${doc.title.en} — ${ORG_NAP.brand}` : "Legal document not found",
      description: doc
        ? doc.summary.en
        : "This legal document does not exist. See the current Framique legal documents: terms, privacy, refunds, cookies and acceptable use.",
      // A stale bookmark must not enter the index as a soft 404, but it should
      // still pass its link equity on to the real index page.
      robots: doc ? undefined : "noindex,follow"});
    const nodes = [
      breadcrumbNode("legal", origin, "en", doc ? { name: doc.title.en, path } : undefined),
      doc
        ? articleNode({
            origin,
            path,
            headline: doc.title.en,
            description: doc.summary.en,
            // `effective` is the only date a legal document has; presenting it
            // as both published and modified is accurate for a versioned doc.
            publishedAt: doc.effective,
            updatedAt: doc.effective,
            section: "Legal"})
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
  component: LegalDocPage});

function LegalDocPage() {
  const { tk, lang } = useLang();
  const { slug, found  } = Route.useLoaderData();
  const doc = found ? legalDoc(slug) : null;

  if (!doc) {
    return (
      <PublicShell >
        <section className="mx-auto max-w-3xl px-4 py-16">
          <h1 className="font-bangla-display text-3xl font-bold">{tk("legal.notfound.title")}</h1>
          <p className="mt-3 text-muted-foreground">{tk("legal.notfound.body")}</p>
          <ul className="mt-6 space-y-2 text-sm">
            {LEGAL_DOCS.map((d) => (
              <li key={d.slug}>
                <Link to="/legal/$doc" params={{ doc: d.slug }} className="text-primary underline underline-offset-4">
                  {d.title[lang]}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </PublicShell>
    );
  }

  return (
    <PublicShell >
      <article className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="font-bangla-display text-3xl font-bold">{doc.title[lang]}</h1>
        <p className="mt-3 text-muted-foreground">{doc.summary[lang]}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {tk("legal.updated", { date: doc.effective })} · {tk("legal.version", { version: doc.version })}
        </p>

        <nav aria-label={tk("legal.toc")} className="mt-8 rounded-fq-lg border border-border bg-card p-5">
          <p className="text-sm font-medium">{tk("legal.toc")}</p>
          <ul className="mt-3 space-y-2 text-sm">
            {doc.sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
                >
                  {section.heading[lang]}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-10 space-y-10">
          {doc.sections.map((section) => (
            <section key={section.id} id={section.id} aria-labelledby={`h-${section.id}`}>
              <h2 id={`h-${section.id}`} className="font-bangla-display text-xl font-semibold">
                {section.heading[lang]}
              </h2>
              {section.body[lang].map((paragraph, index) => (
                <p key={index} className="fq-measure mt-3 text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <footer className="mt-12 rounded-fq-lg border border-border bg-card p-5 text-sm">
          <p className="font-medium">{ORG_NAP.legalName}</p>
          <p className="mt-1 text-muted-foreground">{napAddressLine()}</p>
          <p className="text-muted-foreground">
            {ORG_NAP.phone} · {ORG_NAP.email}
          </p>
          <p className="mt-2 text-muted-foreground">{tk("legal.contact")}</p>
        </footer>
      </article>
    </PublicShell>
  );
}
