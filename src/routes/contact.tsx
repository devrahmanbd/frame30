import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/components/public/PublicShell";
import { getSiteContext } from "@/lib/site-seo.functions";
import { buildMarketingHead } from "@/lib/marketing-seo";
import { Band, BandHeading } from "@/components/public/bands";
import { Mail, MessageSquare, MapPin } from "lucide-react";
import { AnimatedIcon } from "@/components/public/AnimatedIcon";

export const Route = createFileRoute("/contact")({
  loader: async () => {
    const site = await getSiteContext().catch(() => null);
    return { origin: site?.origin ?? null };
  },
  head: ({ loaderData }) => {
    const head = buildMarketingHead({ route: "contact", origin: loaderData?.origin ?? null });
    return { meta: head.meta, links: head.links };
  },
  component: ContactPage,
});

function ContactPage() {
  return (
    <PublicShell>
      <section className="pt-32 pb-16 fq-band-inner text-center fq-reveal fq-anim-rise">
        <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-foreground mb-6">
          We're here to <span className="text-primary">help</span>.
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Whether you need technical support, sales inquiries, or just want to chat about ecommerce in Bangladesh.
        </p>
      </section>

      <Band surface="glass" divided labelledBy="contact-methods">
        <div className="fq-grid-12-8-4 gap-6">
          <div className="fq-span-4 rounded-fq-lg bg-card border border-border/70 p-8 flex flex-col items-center text-center shadow-sm fq-reveal fq-anim-rise" style={{animationDelay: '100ms'}}>
             <span className="grid size-12 place-items-center rounded-fq-md bg-primary/10 text-primary mb-6">
               <AnimatedIcon icon={Mail} variant="bounce" size="lg" />
             </span>
             <h3 className="text-2xl font-bold text-foreground mb-3">Email Us</h3>
             <p className="text-muted-foreground mb-6">For general inquiries and support, drop us an email anytime.</p>
             <a href="mailto:support@framique.com" className="text-primary font-semibold hover:underline mt-auto">support@framique.com</a>
          </div>

          <div className="fq-span-4 rounded-fq-lg bg-card border border-border/70 p-8 flex flex-col items-center text-center shadow-sm fq-reveal fq-anim-rise" style={{animationDelay: '200ms'}}>
             <span className="grid size-12 place-items-center rounded-fq-md bg-primary/10 text-primary mb-6">
               <AnimatedIcon icon={MessageSquare} variant="pulse" size="lg" />
             </span>
             <h3 className="text-2xl font-bold text-foreground mb-3">Live Chat</h3>
             <p className="text-muted-foreground mb-6">Merchants on Growth and Scale plans get priority live chat support directly from the dashboard.</p>
             <span className="text-sm font-semibold text-muted-foreground mt-auto px-4 py-2 bg-muted rounded-full">Available in Dashboard</span>
          </div>

          <div className="fq-span-4 rounded-fq-lg bg-card border border-border/70 p-8 flex flex-col items-center text-center shadow-sm fq-reveal fq-anim-rise" style={{animationDelay: '300ms'}}>
             <span className="grid size-12 place-items-center rounded-fq-md bg-primary/10 text-primary mb-6">
               <AnimatedIcon icon={MapPin} variant="lift" size="lg" />
             </span>
             <h3 className="text-2xl font-bold text-foreground mb-3">Office</h3>
             <p className="text-muted-foreground mb-6">We are operating out of Dhaka, Bangladesh, building the future of local commerce.</p>
             <span className="text-primary font-semibold mt-auto">Dhaka, Bangladesh</span>
          </div>
        </div>
      </Band>
    </PublicShell>
  );
}
