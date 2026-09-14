import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "@/components/public/PublicShell";
import { getSiteContext } from "@/lib/site-seo.functions";
import { buildMarketingHead } from "@/lib/marketing-seo";
import { Zap, Code, Terminal, Building2, Store, ArrowRight, Target } from "lucide-react";
import { Band, BandHeading, CtaBand } from "@/components/public/bands";
import { AnimatedIcon } from "@/components/public/AnimatedIcon";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/about")({
  loader: async () => {
    const site = await getSiteContext().catch(() => null);
    return { origin: site?.origin ?? null };
  },
  head: ({ loaderData }) => {
    const head = buildMarketingHead({ route: "about", origin: loaderData?.origin ?? null });
    return { meta: head.meta, links: head.links };
  },
  component: AboutPage,
});

function AboutPage() {
  return (
    <PublicShell>
      {/* 1. Split Screen Hero */}
      <section className="relative w-full pt-32 pb-20 fq-band-inner overflow-hidden">
        <div className="fq-grid-12-8-4 items-center min-h-[60vh]">
          <div className="fq-span-6 space-y-8 fq-reveal fq-anim-rise">
            <div className="inline-flex items-center rounded-full bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              <Building2 className="mr-2 h-4 w-4" /> Our Story
            </div>
            <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-foreground leading-[1.05]">
              Engineering the <span className="text-primary">commerce OS</span> for Bangladesh.
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed max-w-lg">
              Foreign platforms were never built for COD, bKash, or local logistics. We are building the infrastructure to fix that.
            </p>
            <div className="pt-4">
              <Link to="/auth" search={{ mode: "signup" }} className="inline-flex min-h-[44px] items-center justify-center rounded-fq-md bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                Start building today <ArrowRight className="ml-2 size-4" />
              </Link>
            </div>
          </div>
          <div className="fq-span-6 relative flex justify-center lg:justify-end mt-12 lg:mt-0 fq-reveal fq-anim-fade" style={{ animationDelay: "200ms" }}>
             <div className="w-full max-w-lg aspect-square rounded-[2rem] bg-accent/50 border border-border/50 relative overflow-hidden flex flex-col justify-end p-8 shadow-2xl">
                <div className="absolute inset-0 bg-primary/5 blur-[100px] rounded-full" />
                <Store className="size-32 text-primary/20 absolute top-10 right-10" />
                <h3 className="text-3xl font-bold text-foreground mb-4 relative z-10">Local First.</h3>
                <p className="text-muted-foreground relative z-10">Designed specifically for the nuances of South Asian retail operations.</p>
             </div>
          </div>
        </div>
      </section>

      {/* 2. Z-Pattern Values */}
      <Band surface="glass" divided labelledBy="values-title">
        <div className="fq-reveal fq-anim-rise">
          <BandHeading 
            id="values-title"
            eyebrow="Core Principles"
            title="Engineering over marketing."
            sub="We believe in fast load times, accessible code, and radically transparent pricing."
          />
        </div>
        
        <div className="mt-20 space-y-24">
          {/* Z Row 1 */}
          <div className="fq-grid-12-8-4 items-center gap-12 lg:gap-20 fq-reveal fq-anim-slide-left">
            <div className="fq-span-6 order-2 lg:order-1">
              <div className="aspect-[4/3] fq-feature-card flex items-center justify-center">
                 <div className="fq-feature-card-glow" />
                 <Terminal className="size-24 text-muted-foreground/20 z-10" />
              </div>
            </div>
            <div className="fq-span-6 order-1 lg:order-2 space-y-6">
              <span className="grid size-12 place-items-center rounded-fq-md bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                <AnimatedIcon icon={Terminal} variant="bounce" size="lg" />
              </span>
              <h3 className="text-3xl font-bold text-foreground">Zero Vendor Lock-in</h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Our architecture is designed to be fully self-hostable. If your brand outgrows our managed infrastructure, you can take your entire dataset and run it on your own servers. We own the platform, you own your business.
              </p>
            </div>
          </div>

          {/* Z Row 2 */}
          <div className="fq-grid-12-8-4 items-center gap-12 lg:gap-20 fq-reveal fq-anim-slide-right">
            <div className="fq-span-6 space-y-6">
              <span className="grid size-12 place-items-center rounded-fq-md bg-warning/10 text-warning-foreground ring-1 ring-inset ring-warning-foreground/20">
                <AnimatedIcon icon={Zap} variant="pulse" size="lg" />
              </span>
              <h3 className="text-3xl font-bold text-foreground">Sub-second Architecture</h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Slow stores kill conversion. Every API route, every database query, and every frontend component is optimized for sub-second responses on mobile data networks across Bangladesh.
              </p>
            </div>
            <div className="fq-span-6">
              <div className="aspect-[4/3] fq-feature-card flex items-center justify-center">
                 <div className="fq-feature-card-glow" />
                 <Zap className="size-24 text-warning-foreground/20 z-10" />
              </div>
            </div>
          </div>
        </div>
      </Band>

      {/* 3. CTA */}
      <div className="fq-reveal fq-anim-rise">
        <CtaBand
          id="about-cta"
          title="Ready to upgrade your infrastructure?"
          body="Join the fastest-growing network of Bangladeshi merchants building on modern tech."
          primary={
            <Link to="/auth" search={{ mode: "signup" }} className="w-full sm:w-auto inline-flex min-h-[44px] items-center justify-center rounded-fq-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:scale-[0.98]">
              Get Started
            </Link>
          }
          secondary={
            <Link to="/features" className="w-full sm:w-auto inline-flex min-h-[44px] items-center justify-center rounded-fq-md border border-border bg-card px-6 py-3 text-sm font-medium text-foreground transition-all hover:bg-muted">
              See Features
            </Link>
          }
        />
      </div>
    </PublicShell>
  );
}
