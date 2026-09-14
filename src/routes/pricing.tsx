import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "@/components/public/PublicShell";
import { getSiteContext } from "@/lib/site-seo.functions";
import { buildMarketingHead } from "@/lib/marketing-seo";
import { getLanding } from "@/lib/landing.functions";
import { Band, BandHeading, FaqBand, CtaBand } from "@/components/public/bands";
import { Check, X } from "lucide-react";
import { fmtMinor } from "@/lib/money";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pricing")({
  loader: async () => {
    const [site, landing] = await Promise.all([
      getSiteContext().catch(() => null),
      getLanding().catch(() => null),
    ]);
    return { origin: site?.origin ?? null, plans: landing?.plans ?? [] };
  },
  head: ({ loaderData }) => {
    const head = buildMarketingHead({ route: "pricing", origin: loaderData?.origin ?? null });
    return { meta: head.meta, links: head.links };
  },
  component: PricingPage,
});

function PricingPage() {
  const { plans } = Route.useLoaderData();

  return (
    <PublicShell>
      {/* 1. Header */}
      <section className="pt-32 pb-16 fq-band-inner text-center fq-reveal fq-anim-rise">
        <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-foreground mb-6">
          Simple, predictable plans.<br />Zero hidden fees.
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          No percentage cuts from your sales. You keep 100% of your top-line revenue.
        </p>
      </section>

      {/* 2. Pricing Cards Grid */}
      <Band surface="glass" divided labelledBy="pricing-plans">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
          {plans.slice(0, 3).map((plan, i) => {
            const isFeatured = plan.plan === "growth";
            return (
              <div
                key={plan.plan}
                className={cn(
                  "relative rounded-fq-lg border p-8 flex flex-col justify-between transition-all hover:-translate-y-1 fq-reveal fq-anim-rise bg-card",
                  isFeatured
                    ? "border-primary shadow-lg ring-1 ring-primary/30"
                    : "border-border/70 hover:border-border",
                )}
                style={{animationDelay: `${i * 100}ms`}}
              >
                {isFeatured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-[11px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
                    Most Popular
                  </span>
                )}
                <div>
                  <h3 className="text-2xl font-bold text-foreground">{plan.titleEn}</h3>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed h-12">
                    {plan.plan === "starter" && "Perfect for new merchants launching their first online store."}
                    {plan.plan === "growth" && "For fast-growing brands scaling orders and teams."}
                    {plan.plan === "scale" && "For established retailers needing multi-location POS."}
                  </p>
                  <div className="mt-8 border-t border-border/50 pt-6">
                    <p className="flex items-baseline gap-1.5">
                      <span className="text-5xl font-extrabold tabular-nums tracking-tighter text-foreground">
                        {typeof plan.priceMinorInt === "number"
                          ? fmtMinor(plan.priceMinorInt, plan.currencyCode)
                          : "Custom"}
                      </span>
                      {typeof plan.priceMinorInt === "number" && <span className="text-sm font-medium text-muted-foreground">/mo</span>}
                    </p>
                    <p className="text-xs text-primary font-bold tracking-wide uppercase mt-3">0% transaction fees</p>
                  </div>
                  <ul className="mt-8 space-y-4 text-sm text-foreground font-medium flex-grow">
                    <li className="flex items-center gap-3">
                      <Check className="size-4 text-primary shrink-0" />
                      <span>{plan.productsLimit} products catalogue</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <Check className="size-4 text-primary shrink-0" />
                      <span>{plan.staffLimit} staff seats</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <Check className="size-4 text-primary shrink-0" />
                      <span>bKash & Nagad instant settlement</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <Check className="size-4 text-primary shrink-0" />
                      <span>Steadfast & Pathao Booking</span>
                    </li>
                    <li className={cn("flex items-center gap-3", plan.plan === "starter" ? "text-muted-foreground/50" : "")}>
                      {plan.plan === "starter" ? <X className="size-4 shrink-0" /> : <Check className="size-4 text-primary shrink-0" />}
                      <span>Advanced Analytics</span>
                    </li>
                  </ul>
                </div>
                <div className="mt-10 pt-6 border-t border-border/40">
                  <Link
                    to="/auth"
                    search={{ mode: "signup" }}
                    className={cn(
                      "w-full inline-flex min-h-[48px] items-center justify-center rounded-fq-md text-sm transition-all",
                      isFeatured
                        ? "fq-cta-primary"
                        : "border-2 border-border text-foreground hover:bg-muted font-bold"
                    )}
                  >
                    Get started
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </Band>

      <div className="fq-reveal fq-anim-rise">
        <CtaBand
          id="pricing-cta"
          title="Not sure which plan is right for you?"
          body="Get started today. You can upgrade or downgrade at any time as your business evolves."
          primary={
            <Link to="/auth" search={{ mode: "signup" }} className="w-full sm:w-auto inline-flex min-h-[44px] items-center justify-center rounded-fq-md fq-cta-primary px-6 py-3 text-sm font-semibold">
              Get started
            </Link>
          }
          secondary={
            <Link to="/contact" className="w-full sm:w-auto inline-flex min-h-[44px] items-center justify-center rounded-fq-md border border-border bg-card px-6 py-3 text-sm font-medium text-foreground transition-all hover:bg-muted">
              Contact Sales
            </Link>
          }
        />
      </div>
    </PublicShell>
  );
}
