import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { PublicShell } from "@/components/public/PublicShell";
import { getSiteContext } from "@/lib/site-seo.functions";
import { buildMarketingHead } from "@/lib/marketing-seo";
import { getLanding } from "@/lib/landing.functions";
import { Band, BandHeading, CtaBand } from "@/components/public/bands";
import { Truck, MapPin, PackageCheck, Zap } from "lucide-react";
import { AnimatedIcon } from "@/components/public/AnimatedIcon";

type CourierName = { code: string; name: string; nameBn: string };

const loadCourierNames = createServerFn({ method: "GET" }).handler(
  async (): Promise<CourierName[]> => {
    const { CARRIER_PROFILES } = await import("@/lib/courier-adapters.server");
    return CARRIER_PROFILES.map((p) => ({
      code: p.code,
      name: p.name,
      nameBn: p.nameBn,
    }));
  }
);

export const Route = createFileRoute("/fulfilment")({
  loader: async () => {
    const [site, landing, couriers] = await Promise.all([
      getSiteContext().catch(() => null),
      getLanding().catch(() => null),
      loadCourierNames().catch(() => [] as CourierName[]),
    ]);
    return {
      origin: site?.origin ?? null,
      merchantsNum: landing?.stats?.merchants ?? 300,
      couriers,
    };
  },
  head: ({ loaderData }) => {
    const head = buildMarketingHead({ route: "home", origin: loaderData?.origin ?? null });
    return { meta: head.meta, links: head.links };
  },
  component: FulfilmentPage,
});

function FulfilmentPage() {
  const { couriers } = Route.useLoaderData();

  return (
    <PublicShell>
      {/* Magazine Layout Hero */}
      <section className="pt-32 pb-16 fq-band-inner">
        <div className="fq-grid-12-8-4">
           <div className="fq-span-8 space-y-6 fq-reveal fq-anim-rise">
              <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-foreground leading-[1.05]">
                 Ship faster.<br />
                 <span className="text-primary">Scale effortlessly.</span>
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed max-w-xl">
                 Say goodbye to copying and pasting addresses. Automate your dispatch with deep integrations to Bangladesh's top courier networks.
              </p>
           </div>
           <div className="fq-span-4 hidden lg:flex items-center justify-end fq-reveal fq-anim-fade">
              <Truck className="size-48 text-muted-foreground/10" />
           </div>
        </div>
      </section>

      {/* Grid of Partners */}
      <Band surface="glass" divided labelledBy="partners-title">
         <div className="fq-reveal fq-anim-rise text-center mb-16">
            <h2 id="partners-title" className="text-3xl font-bold tracking-tight text-foreground mb-4">Integrated Courier Partners</h2>
            <p className="text-muted-foreground">We natively support API dispatch for the following providers.</p>
         </div>
         
         <div className="fq-grid-12-8-4 gap-6 max-w-4xl mx-auto">
            {couriers.length > 0 ? couriers.map((c, i) => (
               <div key={c.code} className="fq-span-4 rounded-fq-md bg-card border border-border p-6 flex flex-col items-center justify-center shadow-sm hover:shadow-md transition-shadow fq-reveal fq-anim-rise" style={{animationDelay: `${i * 50}ms`}}>
                  <span className="font-bold text-lg text-foreground">{c.name}</span>
                  <span className="text-xs text-muted-foreground mt-1 tracking-wider">{c.nameBn}</span>
               </div>
            )) : (
               <div className="fq-span-12 rounded-fq-md bg-card border border-border p-10 flex flex-col items-center justify-center shadow-sm">
                  <Truck className="size-10 text-muted-foreground mb-4" />
                  <span className="font-bold text-lg text-foreground">Steadfast, Pathao & RedX</span>
                  <span className="text-sm text-muted-foreground mt-1">Natively supported out of the box.</span>
               </div>
            )}
         </div>
      </Band>

      {/* F Pattern Feature List */}
      <Band labelledBy="fulfilment-features">
         <div className="fq-reveal fq-anim-rise">
            <BandHeading id="fulfilment-features" eyebrow="Fulfilment Engine" title="The end of manual dispatch." sub="" />
         </div>
         <div className="mt-16 space-y-16 max-w-4xl mx-auto">
           {[
             { title: "One-Click Dispatch", desc: "Select orders in your dashboard and push them to your courier's system instantly. No spreadsheets required.", icon: Zap },
             { title: "Automated District Resolution", desc: "Our checkout intelligently prompts customers for districts and thanas that match courier service areas, eliminating misrouted parcels.", icon: MapPin },
             { title: "Thermal Airway Bills", desc: "Print bulk shipping labels directly from your dashboard perfectly formatted for standard thermal printers.", icon: PackageCheck },
           ].map((feature, i) => (
             <div key={i} className="flex gap-6 items-start fq-reveal fq-anim-slide-left" style={{animationDelay: `${i * 100}ms`}}>
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary shadow-sm border border-primary/20">
                   <AnimatedIcon icon={feature.icon} variant="bounce" size="lg" />
                </span>
                <div>
                   <h3 className="text-2xl font-bold text-foreground mb-2">{feature.title}</h3>
                   <p className="text-lg text-muted-foreground leading-relaxed">{feature.desc}</p>
                </div>
             </div>
           ))}
        </div>
      </Band>
    </PublicShell>
  );
}
