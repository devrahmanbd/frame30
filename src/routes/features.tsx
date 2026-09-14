import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "@/components/public/PublicShell";
import { getSiteContext } from "@/lib/site-seo.functions";
import { buildMarketingHead } from "@/lib/marketing-seo";
import { ArrowRight, Store, Smartphone, Truck, CreditCard, ShieldCheck, Layers, LineChart } from "lucide-react";
import { Band, BandHeading, CtaBand } from "@/components/public/bands";
import { AnimatedIcon } from "@/components/public/AnimatedIcon";

export const Route = createFileRoute("/features")({
  loader: async () => {
    const site = await getSiteContext().catch(() => null);
    return { origin: site?.origin ?? null };
  },
  head: ({ loaderData }) => {
    const head = buildMarketingHead({ route: "features", origin: loaderData?.origin ?? null });
    return { meta: head.meta, links: head.links };
  },
  component: FeaturesPage,
});

function FeaturesPage() {
  return (
    <PublicShell>
      {/* 1. Hero */}
      <section className="pt-32 pb-20 fq-band-inner text-center fq-reveal fq-anim-rise">
        <div className="max-w-3xl mx-auto space-y-6">
          <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-foreground">
            Everything you need. <br /><span className="text-muted-foreground">Nothing you don't.</span>
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed">
            A complete commerce engine built specifically for the Bangladeshi market. No plugins, no patching, no compromises.
          </p>
        </div>
      </section>

      {/* 2. Bento Grid Features */}
      <Band surface="glass" divided labelledBy="core-features">
        <div className="fq-reveal fq-anim-rise">
          <BandHeading 
            id="core-features"
            eyebrow="Core Infrastructure"
            title="Built for modern retail."
            sub="We eliminated the need for third-party plugins by building the core essentials natively."
          />
        </div>
        
        <div className="mt-16 fq-grid-12-8-4 gap-6 auto-rows-[300px]">
          {/* Large Card */}
          <div className="fq-span-8 fq-feature-card p-8 flex flex-col justify-between relative overflow-hidden fq-reveal fq-anim-fade">
             <div className="fq-feature-card-glow" />
             <div className="z-10 max-w-md">
               <span className="grid size-12 place-items-center rounded-fq-md bg-primary/10 text-primary mb-6 ring-1 ring-inset ring-primary/20">
                 <AnimatedIcon icon={Store} variant="lift" size="lg" />
               </span>
               <h3 className="text-2xl font-bold text-foreground mb-3">Sub-second Storefronts</h3>
               <p className="text-muted-foreground leading-relaxed">
                 Beautiful, responsive templates optimized for mobile commerce. Every image is compressed, every route is cached, and checkout is instant.
               </p>
             </div>
             <div className="absolute right-0 bottom-0 w-1/2 h-full opacity-10 bg-[radial-gradient(circle_at_bottom_right,_var(--tw-gradient-stops))] from-primary via-transparent to-transparent pointer-events-none" />
          </div>

          {/* Small Card */}
          <div className="fq-span-4 fq-feature-card p-8 flex flex-col fq-reveal fq-anim-rise" style={{animationDelay: '100ms'}}>
             <div className="fq-feature-card-glow" />
             <div className="z-10">
               <span className="grid size-12 place-items-center rounded-fq-md bg-primary/10 text-primary mb-6 ring-1 ring-inset ring-primary/20">
                 <AnimatedIcon icon={CreditCard} variant="tilt" size="lg" />
               </span>
               <h3 className="text-xl font-bold text-foreground mb-2">Native Payments</h3>
               <p className="text-sm text-muted-foreground leading-relaxed">
                 bKash, Nagad, and Cards integrated directly into the checkout flow without slow redirects.
               </p>
             </div>
          </div>

          {/* Small Card */}
          <div className="fq-span-4 fq-feature-card p-8 flex flex-col fq-reveal fq-anim-rise" style={{animationDelay: '150ms'}}>
             <div className="fq-feature-card-glow" />
             <div className="z-10">
               <span className="grid size-12 place-items-center rounded-fq-md bg-primary/10 text-primary mb-6 ring-1 ring-inset ring-primary/20">
                 <AnimatedIcon icon={Truck} variant="bounce" size="lg" />
               </span>
               <h3 className="text-xl font-bold text-foreground mb-2">1-Click Dispatch</h3>
               <p className="text-sm text-muted-foreground leading-relaxed">
                 Book Steadfast, Pathao, or RedX deliveries instantly. Print airway bills directly from your dashboard.
               </p>
             </div>
          </div>

          {/* Large Card */}
          <div className="fq-span-8 fq-feature-card p-8 flex flex-col justify-between relative overflow-hidden fq-reveal fq-anim-fade" style={{animationDelay: '200ms'}}>
             <div className="fq-feature-card-glow" />
             <div className="z-10 max-w-md">
               <span className="grid size-12 place-items-center rounded-fq-md bg-primary/10 text-primary mb-6 ring-1 ring-inset ring-primary/20">
                 <AnimatedIcon icon={Layers} variant="pulse" size="lg" />
               </span>
               <h3 className="text-2xl font-bold text-foreground mb-3">Omnichannel Ledger</h3>
               <p className="text-muted-foreground leading-relaxed">
                 Sync your inventory across your web store, Facebook DMs, and physical retail POS. Never double-sell an item again.
               </p>
             </div>
          </div>
        </div>
      </Band>

      {/* 3. Deep Dive F-Pattern */}
      <Band labelledBy="deep-dive">
        <div className="fq-reveal fq-anim-rise">
           <BandHeading id="deep-dive" eyebrow="Advanced Capabilities" title="More than just a shopping cart." sub="" />
        </div>
        <div className="mt-16 space-y-16 max-w-4xl mx-auto">
           {[
             { title: "Automated COD Fraud Prevention", desc: "Our machine learning models flag serial returners and high-risk addresses before you dispatch, saving you thousands in returned freight costs.", icon: ShieldCheck },
             { title: "Real-time Gross Margin Analytics", desc: "Track your actual profit after subtracting courier costs, payment gateway fees, and COGS. Know your true numbers instantly.", icon: LineChart },
             { title: "Mobile-First Management", desc: "Manage your entire catalog, approve orders, and respond to customers directly from your smartphone. The console is fully responsive.", icon: Smartphone },
           ].map((feature, i) => (
             <div key={i} className="flex gap-6 items-start fq-reveal fq-anim-slide-left" style={{animationDelay: `${i * 100}ms`}}>
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
                   <feature.icon className="size-5" />
                </span>
                <div>
                   <h3 className="text-2xl font-bold text-foreground mb-2">{feature.title}</h3>
                   <p className="text-lg text-muted-foreground leading-relaxed">{feature.desc}</p>
                </div>
             </div>
           ))}
        </div>
      </Band>

      <div className="fq-reveal fq-anim-rise">
        <CtaBand
          id="features-cta"
          title="See it all in action."
          body="Create your account today and start selling. No credit card required."
          primary={
            <Link to="/auth" search={{ mode: "signup" }} className="w-full sm:w-auto inline-flex min-h-[44px] items-center justify-center rounded-fq-md fq-cta-primary px-6 py-3 text-sm font-semibold">
              Get started
            </Link>
          }
          secondary={
            <Link to="/pricing" className="w-full sm:w-auto inline-flex min-h-[44px] items-center justify-center rounded-fq-md border border-border bg-card px-6 py-3 text-sm font-medium text-foreground transition-all hover:bg-muted">
              View Pricing
            </Link>
          }
        />
      </div>
    </PublicShell>
  );
}
