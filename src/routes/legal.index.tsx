import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "@/components/public/PublicShell";
import { getSiteContext } from "@/lib/site-seo.functions";
import { buildMarketingHead } from "@/lib/marketing-seo";
import { useLang } from "@/lib/i18n";
import { LEGAL_DOCS, ORG_NAP, napAddressLine } from "@/lib/legal";

export const Route = createFileRoute("/legal/")({
  loader: async () => getSiteContext(),
  // The Organization block in this head carries the same NAP the page prints,
  // from the same constant — a footer and a schema that disagree is the
  // classic local-SEO defect.
  head: ({ loaderData }) => buildMarketingHead({ route: "legal", origin: loaderData?.origin ?? null }),
  component: LegalIndex});

function LegalIndex() {
  const { tk, lang } = useLang();
  

  return (
    <PublicShell >
      <section className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="font-bangla-display text-3xl font-bold">{tk("legal.index.title")}</h1>
        <p className="mt-3 text-muted-foreground">{tk("legal.index.subtitle")}</p>

        <ul className="mt-8 space-y-4">
          {LEGAL_DOCS.map((doc) => (
            <li key={doc.slug} className="rounded-fq-lg border border-border bg-card p-5">
              <Link
                to="/legal/$doc"
                params={{ doc: doc.slug }}
                className="font-bangla-display text-lg font-semibold text-primary underline-offset-4 hover:underline"
              >
                {doc.title[lang]}
              </Link>
              <p className="mt-2 text-sm text-muted-foreground">{doc.summary[lang]}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                {tk("legal.updated", { date: doc.effective })} · {tk("legal.version", { version: doc.version })}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-10 rounded-fq-lg border border-border bg-card p-5 text-sm">
          <p className="font-medium">{ORG_NAP.legalName}</p>
          <p className="mt-1 text-muted-foreground">
            {tk("nap.address")}: {napAddressLine()}
          </p>
          <p className="text-muted-foreground">
            {tk("nap.phone")}: {ORG_NAP.phone} · {tk("nap.email")}: {ORG_NAP.email}
          </p>
          <p className="mt-2 text-muted-foreground">{tk("legal.contact")}</p>
        </div>
      </section>
    </PublicShell>
  );
}
