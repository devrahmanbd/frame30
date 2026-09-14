import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/components/public/PublicShell";
import { getSiteContext } from "@/lib/site-seo.functions";
import { buildMarketingHead } from "@/lib/marketing-seo";
import { Band, BandHeading } from "@/components/public/bands";
import { ShieldCheck, Lock, Server, FileText } from "lucide-react";
import { AnimatedIcon } from "@/components/public/AnimatedIcon";

export const Route = createFileRoute("/security")({
  loader: async () => {
    const site = await getSiteContext().catch(() => null);
    return { origin: site?.origin ?? null };
  },
  head: ({ loaderData }) => {
    const head = buildMarketingHead({ route: "security", origin: loaderData?.origin ?? null });
    return { meta: head.meta, links: head.links };
  },
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <PublicShell>
      {/* Split Screen Header */}
      <section className="pt-32 pb-16 fq-band-inner">
        <div className="fq-grid-12-8-4 items-center">
           <div className="fq-span-6 space-y-6 fq-reveal fq-anim-slide-left">
             <div className="inline-flex items-center rounded-full bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
               <ShieldCheck className="mr-2 h-4 w-4" /> Enterprise Grade
             </div>
             <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-foreground">
               Security is our <span className="text-primary">foundation.</span>
             </h1>
             <p className="text-xl text-muted-foreground leading-relaxed max-w-lg">
               Your business data and your customers' privacy are protected by state-of-the-art encryption and modern infrastructure practices.
             </p>
           </div>
           <div className="fq-span-6 flex justify-center lg:justify-end mt-12 lg:mt-0 fq-reveal fq-anim-fade">
             <div className="w-full max-w-md aspect-square rounded-full bg-accent/30 border border-border flex items-center justify-center relative overflow-hidden shadow-xl">
               <div className="absolute inset-0 bg-primary/10 blur-[80px]" />
               <ShieldCheck className="size-48 text-primary/40 relative z-10" />
             </div>
           </div>
        </div>
      </section>

      {/* Grid Features */}
      <Band surface="glass" divided labelledBy="security-features">
        <div className="fq-reveal fq-anim-rise">
           <BandHeading 
             id="security-features"
             eyebrow="How we protect you"
             title="Built on modern security standards."
             sub="We handle the complexity of compliance and encryption so you can focus on selling."
           />
        </div>

        <div className="mt-16 fq-grid-12-8-4 gap-6">
          <div className="fq-span-6 rounded-fq-lg bg-card border border-border/70 p-10 flex gap-6 shadow-sm fq-reveal fq-anim-rise" style={{animationDelay: '100ms'}}>
             <span className="grid size-12 shrink-0 place-items-center rounded-fq-md bg-primary/10 text-primary">
               <AnimatedIcon icon={Lock} variant="pulse" size="lg" />
             </span>
             <div>
               <h3 className="text-2xl font-bold text-foreground mb-3">End-to-End Encryption</h3>
               <p className="text-muted-foreground leading-relaxed">All traffic between your store, our servers, and payment gateways is encrypted using TLS 1.3. We never store raw passwords or sensitive payment data.</p>
             </div>
          </div>

          <div className="fq-span-6 rounded-fq-lg bg-card border border-border/70 p-10 flex gap-6 shadow-sm fq-reveal fq-anim-rise" style={{animationDelay: '200ms'}}>
             <span className="grid size-12 shrink-0 place-items-center rounded-fq-md bg-primary/10 text-primary">
               <AnimatedIcon icon={Server} variant="lift" size="lg" />
             </span>
             <div>
               <h3 className="text-2xl font-bold text-foreground mb-3">Infrastructure Isolation</h3>
               <p className="text-muted-foreground leading-relaxed">Merchant data is logically isolated. Our Edge network prevents DDoS attacks, and our database clusters are automatically backed up across multiple availability zones.</p>
             </div>
          </div>
          
          <div className="fq-span-12 rounded-fq-lg bg-card border border-border/70 p-10 flex gap-6 shadow-sm fq-reveal fq-anim-rise" style={{animationDelay: '300ms'}}>
             <span className="grid size-12 shrink-0 place-items-center rounded-fq-md bg-primary/10 text-primary">
               <AnimatedIcon icon={FileText} variant="bounce" size="lg" />
             </span>
             <div>
               <h3 className="text-2xl font-bold text-foreground mb-3">Compliance Ready</h3>
               <p className="text-muted-foreground leading-relaxed max-w-3xl">We adhere to global security best practices and local data protection regulations. Vulnerability scans and dependency audits are performed automatically on every deployment to our infrastructure.</p>
             </div>
          </div>
        </div>
      </Band>
    </PublicShell>
  );
}
