import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/components/public/PublicShell";
import { getSiteContext } from "@/lib/site-seo.functions";
import { buildMarketingHead } from "@/lib/marketing-seo";
import { Band, BandHeading, FaqBand } from "@/components/public/bands";
import { FAQ_ROWS } from "@/lib/landing";
import { en } from "@/lib/i18n-dict";
import { HelpCircle } from "lucide-react";

export const Route = createFileRoute("/faq")({
  loader: async () => {
    const site = await getSiteContext().catch(() => null);
    return { origin: site?.origin ?? null };
  },
  head: ({ loaderData }) => {
    const head = buildMarketingHead({ route: "home", origin: loaderData?.origin ?? null });
    return { meta: head.meta, links: head.links };
  },
  component: FaqPage,
});

function FaqPage() {
  return (
    <PublicShell>
      {/* 1. Header Layout */}
      <section className="pt-32 pb-16 fq-band-inner overflow-hidden">
        <div className="fq-grid-12-8-4">
          <div className="fq-span-8 space-y-6 fq-reveal fq-anim-slide-left">
            <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-foreground">
              Frequently Asked <span className="text-primary">Questions</span>
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl">
              Everything you need to know about setting up your store, integrating couriers, and receiving payments in Bangladesh.
            </p>
          </div>
          <div className="fq-span-4 hidden lg:flex justify-end items-start opacity-20 fq-reveal fq-anim-fade">
             <HelpCircle className="size-48 text-primary" />
          </div>
        </div>
      </section>

      {/* 2. FAQ List container */}
      <Band surface="glass" divided labelledBy="faq-detailed">
        <div className="fq-reveal fq-anim-rise max-w-4xl mx-auto">
          <FaqBand
            entries={FAQ_ROWS.map((row) => ({
              id: row.id,
              question: en(row.questionKey),
              answer: en(row.answerKey),
            }))}
          />
        </div>
      </Band>
    </PublicShell>
  );
}
