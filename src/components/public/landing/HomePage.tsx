import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Smartphone,
  Truck,
  ShieldCheck,
  Layers,
  ArrowRight,
  Check,
  Store,
  BarChart3,
  PackageCheck,
  Zap,
} from "lucide-react";
import {
  Band,
  BandHeading,
  BandSequence,
  CtaBand,
  FaqBand,
  HeroBand,
} from "@/components/public/bands";
import { fmtMinor } from "@/lib/money";
import { en } from "@/lib/i18n-dict";
import {
  FAQ_ROWS,
  planTeaser,
  type LandingData,
} from "@/lib/landing";
import {
  FINAL_CTA,
  HERO,
} from "@/lib/marketing/home.content";
import { TESTIMONIALS } from "@/lib/marketing/testimonials.content";
import { AnimatedIcon } from "@/components/public/AnimatedIcon";
import { EcosystemSlide } from "@/components/public/landing/EcosystemSlide";
import { TestimonialList } from "@/components/public/landing/TestimonialList";
import { MarketingFigure } from "@/components/public/MarketingFigure";
import themesImg from "@/assets/marketing/themes.jpg";
import courierImg from "@/assets/marketing/courier.jpg";
import dashboardImg from "@/assets/marketing/dashboard.jpg";
import mobileStoreImg from "@/assets/marketing/mobile-store.jpg";
import { cn } from "@/lib/utils";

const PRIMARY_CTA =
  "w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center rounded-fq-md px-6 py-3 text-sm fq-cta-primary";
const SECONDARY_CTA =
  "w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center rounded-fq-md px-6 py-3 text-sm fq-cta-secondary";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export function HomePage({ data }: { data: LandingData }) {
  const { demoSlug, plans } = data;
  const teaser = planTeaser(plans);
  const [activeTourTab, setActiveTourTab] = useState<0 | 1 | 2>(0);

  return (
    <BandSequence route="/">
      {/* 1. HERO SECTION (Original Top-Notch Hero) */}
      <HeroBand
        title="Sell online and in-store. Take bKash, cards, and COD on one ledger."
        titleBn="অনলাইন স্টোর, বিকাশ পেমেন্ট আর কুরিয়ার বুকিং — সবই এক প্ল্যাটফর্মে।"
        sub="Take orders on your custom website, collect payments via direct bKash and Nagad settlement, and book Steadfast or Pathao riders in one click. Zero sales commission, zero hidden cuts."
        subBn="সহজ অনলাইন স্টোর, ওয়ান-ক্লিক বিকাশ-নগদ পেমেন্ট এবং স্বয়ংক্রিয় কুরিয়ার বুকিং — সবই এক প্ল্যাটফর্মে।"
        proof={null}
        visual={
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }} className="relative z-10 w-full">
            <div className="absolute inset-0 fq-halo bg-primary/20 blur-3xl -z-10 rounded-[2rem]" />
            <img src={dashboardImg} alt="Dashboard" className="w-full h-auto rounded-xl shadow-2xl border border-white/20 dark:border-white/10" />
          </motion.div>
        }
        actions={
          <>
            <Link to="/auth" search={{ mode: "signup" }} className={cn(PRIMARY_CTA, "group gap-2")}>
              <span>{HERO.ctaPrimary}</span>
              <AnimatedIcon icon={ArrowRight} variant="magnetic" size="sm" />
            </Link>
            {demoSlug ? (
              <Link to="/store/$slug" params={{ slug: demoSlug }} className={SECONDARY_CTA}>
                {HERO.ctaSecondary}
              </Link>
            ) : (
              <Link to="/features" className={SECONDARY_CTA}>
                Explore features
              </Link>
            )}
          </>
        }
      />

      <Band tight>
        <EcosystemSlide />
      </Band>

      {/* 2. BENTO GRID - REDESIGNED WITH ANIMATION */}
      <Band surface="glass" divided labelledBy="platform-title" tight>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <BandHeading
            id="platform-title"
            eyebrow="Bangladesh Retail Infrastructure"
            title="Built for how commerce actually works in Bangladesh."
            sub="Foreign platforms force you to stitch together fragile plugins for bKash, deal with delayed payouts, and copy-paste addresses into courier portals. Framique handles it all out of the box."
          />
        </motion.div>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-[340px]"
        >
          {/* Card 1: Spans 2 columns */}
          <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="md:col-span-2 lg:col-span-2 rounded-fq-lg bg-card/60 backdrop-blur-xl border border-white/10 p-8 flex flex-col justify-between relative overflow-hidden group shadow-lg transition-all duration-300 hover:shadow-primary/5 hover:border-primary/30">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="z-10 max-w-lg">
              <span className="grid size-12 place-items-center rounded-fq-md bg-primary/10 text-primary mb-5 ring-1 ring-inset ring-primary/20">
                <AnimatedIcon icon={Smartphone} variant="bounce" size="lg" />
              </span>
              <h3 className="text-2xl font-bold text-foreground tracking-tight mb-2">1-Tap Mobile Checkout</h3>
              <p className="text-muted-foreground leading-relaxed">
                Over 78% of Bangladeshi shoppers order on mobile data. Our checkout eliminates multi-step friction, resolves districts automatically, and completes bKash/Nagad transactions without redirect stalls.
              </p>
            </div>
            <div className="absolute right-0 bottom-0 w-2/3 h-2/3 opacity-30 group-hover:opacity-50 transition-opacity duration-500 translate-y-12 translate-x-12">
              <img src={mobileStoreImg} alt="Mobile Checkout" className="w-full h-full object-cover object-top rounded-tl-2xl shadow-2xl border-t border-l border-white/10" />
            </div>
          </motion.div>

          {/* Card 2: Spans 2 rows on large screens */}
          <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="md:col-span-1 lg:row-span-2 rounded-fq-lg bg-muted/20 backdrop-blur-xl border border-white/10 p-8 flex flex-col relative overflow-hidden group shadow-lg transition-all duration-300 hover:shadow-primary/5 hover:border-primary/30">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="z-10">
              <span className="grid size-12 place-items-center rounded-fq-md bg-primary/10 text-primary mb-5 ring-1 ring-inset ring-primary/20">
                <AnimatedIcon icon={Layers} variant="lift" size="lg" />
              </span>
              <h3 className="text-2xl font-bold text-foreground tracking-tight mb-2">Multi-Channel Ledger</h3>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Sell online, via Facebook DM, or at your retail showroom POS without stock clashes. Everything syncs in real-time.
              </p>
            </div>
            <div className="mt-auto relative rounded-fq-md border border-white/10 bg-background/50 backdrop-blur-md p-4 shadow-sm w-full group-hover:scale-[1.02] transition-transform duration-500">
               <div className="flex justify-between items-center pb-2 border-b border-border/50 mb-3">
                 <span className="text-xs font-semibold">Stock Lock: Jamdani Tunic</span>
                 <span className="text-[10px] text-primary font-medium px-2 py-0.5 bg-primary/10 rounded-full">Syncing</span>
               </div>
               <div className="space-y-2 text-xs">
                 <div className="flex justify-between p-2 bg-muted/40 rounded"><span>Web</span> <span className="font-bold">42</span></div>
                 <div className="flex justify-between p-2 bg-muted/40 rounded"><span>Social</span> <span className="font-bold">42</span></div>
                 <div className="flex justify-between p-2 bg-muted/40 rounded"><span>POS</span> <span className="font-bold">42</span></div>
               </div>
            </div>
          </motion.div>

          {/* Card 3 */}
          <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="md:col-span-1 rounded-fq-lg bg-card/60 backdrop-blur-xl border border-white/10 p-8 flex flex-col justify-between relative overflow-hidden group shadow-lg transition-all duration-300 hover:shadow-primary/5 hover:border-primary/30">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="z-10">
              <span className="grid size-12 place-items-center rounded-fq-md bg-primary/10 text-primary mb-5 ring-1 ring-inset ring-primary/20">
                <AnimatedIcon icon={Truck} variant="tilt" size="lg" />
              </span>
              <h3 className="text-xl font-bold text-foreground tracking-tight mb-2">Courier Dispatch</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Steadfast, Pathao, and RedX connect directly to your order drawer. Generate bulk thermal airway bills instantly.
              </p>
            </div>
          </motion.div>

          {/* Card 4 */}
          <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="md:col-span-1 rounded-fq-lg bg-card/60 backdrop-blur-xl border border-white/10 p-8 flex flex-col justify-between relative overflow-hidden group shadow-lg transition-all duration-300 hover:shadow-primary/5 hover:border-primary/30">
            <div className="absolute inset-0 bg-gradient-to-tl from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="z-10">
              <span className="grid size-12 place-items-center rounded-fq-md bg-primary/10 text-primary mb-5 ring-1 ring-inset ring-primary/20">
                <AnimatedIcon icon={ShieldCheck} variant="pulse" size="lg" />
              </span>
              <h3 className="text-xl font-bold text-foreground tracking-tight mb-2">COD Fraud Shield</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Automatically flag risky addresses and serial returners before you ship, saving you up to 42% on returned freight losses.
              </p>
            </div>
          </motion.div>
        </motion.div>
      </Band>

      {/* 3. PRODUCT TOUR - Z-PATTERN WITH ANIMATIONS */}
      <Band labelledBy="tour-title" tight>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <BandHeading
            id="tour-title"
            eyebrow="Product Architecture"
            title="The complete retail engine in one login."
            sub="Storefront, checkout, fulfilment, catalogue, POS and reporting — one clean system moving together."
          />
        </motion.div>

        <div className="mt-16">
          <div className="flex flex-wrap items-center justify-center gap-3 border-b border-border/60 pb-6">
            {[
              { id: 0, label: "Storefront & Themes", icon: Store },
              { id: 1, label: "Orders & Fulfilment", icon: PackageCheck },
              { id: 2, label: "Analytics & Retention", icon: BarChart3 },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTourTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTourTab(tab.id as 0 | 1 | 2)}
                  className={cn(
                    "min-h-[48px] flex items-center gap-2.5 rounded-full px-6 py-2.5 text-sm transition-all relative",
                    isActive ? "fq-cta-secondary font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted font-medium"
                  )}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <Icon className="size-4" />
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-12">
            <AnimatePresence mode="wait">
              {activeTourTab === 0 && (
                <motion.div 
                  key="tab0"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  transition={{ duration: 0.4 }}
                  className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center"
                >
                  <div className="space-y-6 order-2 lg:order-1">
                    <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest rounded-full">Speed & Conversion</span>
                    <h3 className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">Storefronts crafted to turn visitors into buyers.</h3>
                    <p className="text-base text-muted-foreground leading-relaxed">
                      Customise your layout, typography, and colour accents without coding. Every template is engineered with sub-second page loads, instant cart drawers, and responsive image compression.
                    </p>
                    <ul className="space-y-3 pt-4 text-sm text-foreground font-medium">
                      {['Custom domain support with automated SSL', 'Built-in product variants & color swatches', 'Automatic SEO & structured schema tags'].map((item, i) => (
                         <li key={i} className="flex items-center gap-3">
                           <span className="grid place-items-center size-5 rounded-full bg-primary/20 text-primary shrink-0"><Check className="size-3" /></span>
                           <span>{item}</span>
                         </li>
                      ))}
                    </ul>
                  </div>
                  <div className="order-1 lg:order-2">
                    <MarketingFigure src={themesImg} alt="Storefront Themes" className="w-full rounded-2xl shadow-xl border border-border/50" />
                  </div>
                </motion.div>
              )}

              {activeTourTab === 1 && (
                <motion.div 
                  key="tab1"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  transition={{ duration: 0.4 }}
                  className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center"
                >
                  <div className="order-1">
                    <MarketingFigure src={courierImg} alt="Courier Booking" className="w-full rounded-2xl shadow-xl border border-border/50" />
                  </div>
                  <div className="space-y-6 order-2">
                    <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest rounded-full">Logistics</span>
                    <h3 className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">Ship 100 orders in the time it used to take for ten.</h3>
                    <p className="text-base text-muted-foreground leading-relaxed">
                      Say goodbye to manual courier exports and endless WhatsApp coordinate confirmations. Automated courier assignment selects the best carrier by district, books pickup, and notifies the buyer.
                    </p>
                    <ul className="space-y-3 pt-4 text-sm text-foreground font-medium">
                      {['Instant consignment for Steadfast & Pathao', 'Bulk thermal shipping label printing', 'Automated delivery tracking SMS'].map((item, i) => (
                         <li key={i} className="flex items-center gap-3">
                           <span className="grid place-items-center size-5 rounded-full bg-primary/20 text-primary shrink-0"><Check className="size-3" /></span>
                           <span>{item}</span>
                         </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              )}

              {activeTourTab === 2 && (
                <motion.div 
                  key="tab2"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  transition={{ duration: 0.4 }}
                  className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center"
                >
                  <div className="space-y-6 order-2 lg:order-1">
                    <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest rounded-full">Clarity</span>
                    <h3 className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">Know your true profit after shipping and fees.</h3>
                    <p className="text-base text-muted-foreground leading-relaxed">
                      Most merchants calculate gross sales while ignoring returned COD shipping costs and gateway cuts. Framique gives you true net margin per product, per channel, and per month.
                    </p>
                    <ul className="space-y-3 pt-4 text-sm text-foreground font-medium">
                      {['Automated gross margin & courier cost breakdown', 'Abandoned cart recovery via SMS/WhatsApp', 'Customer lifetime value analytics'].map((item, i) => (
                         <li key={i} className="flex items-center gap-3">
                           <span className="grid place-items-center size-5 rounded-full bg-primary/20 text-primary shrink-0"><Check className="size-3" /></span>
                           <span>{item}</span>
                         </li>
                      ))}
                    </ul>
                  </div>
                  <div className="order-1 lg:order-2">
                    <MarketingFigure src={dashboardImg} alt="Dashboard Analytics" className="w-full rounded-2xl shadow-xl border border-border/50" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </Band>

      {/* 4. TRANSPARENT PRICING */}
      <Band surface="glass" divided labelledBy="pricing-title">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <BandHeading
            id="pricing-title"
            eyebrow="Transparent Pricing"
            title="Simple, predictable plans. Zero hidden fees."
            sub="No percentage cuts from your sales. You keep 100% of your top-line revenue."
          />
        </motion.div>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8"
        >
          {plans.slice(0, 3).map((plan) => {
            const isFeatured = plan.plan === "growth";
            return (
              <motion.div
                variants={itemVariants}
                key={plan.plan}
                className={cn(
                  "relative rounded-fq-lg border p-8 flex flex-col justify-between transition-all hover:-translate-y-1",
                  isFeatured
                    ? "border-primary bg-card shadow-lg ring-1 ring-primary/30"
                    : "border-border/70 bg-card/40 hover:border-border",
                )}
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
                  <ul className="mt-8 space-y-4 text-sm text-foreground font-medium">
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
                        : "border-2 border-border text-foreground hover:bg-muted font-bold",
                    )}
                  >
                    Get started
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </Band>

      {/* 5. MERCHANT STORIES / TESTIMONIALS */}
      <Band labelledBy="cases-title">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <BandHeading
            id="cases-title"
            eyebrow={TESTIMONIALS.eyebrow}
            title="Built for the merchants shaping Bangladesh retail."
            sub="Real businesses seeing real results with Framique's native commerce platform."
          />
        </motion.div>

        <TestimonialList />
      </Band>

      {/* 6. FAQ ACCORDION */}
      <Band divided labelledBy="faq-title">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <BandHeading
            id="faq-title"
            eyebrow="Frequently Asked Questions"
            title="Everything you need to know before joining."
            sub="Clear answers to common questions about payouts, setup, and courier connections."
          />
        </motion.div>
        <div className="mt-10">
          <FaqBand
            entries={FAQ_ROWS.map((row) => ({
              id: row.id,
              question: en(row.questionKey),
              answer: en(row.answerKey),
            }))}
          />
        </div>
      </Band>

      {/* 7. FINAL HIGH-CONVERTING CTA */}
      <motion.div
         initial={{ opacity: 0, y: 30 }}
         whileInView={{ opacity: 1, y: 0 }}
         viewport={{ once: true }}
         transition={{ duration: 0.8 }}
      >
        <CtaBand
          id="final-cta-title"
          tone="glass"
          title="Start growing your ecommerce business today."
          body="Join hundreds of modern Bangladeshi merchants who trust Framique for their storefront, payments, and logistics."
          note="No hidden fees · Cancel anytime · Full feature access"
          primary={
            <Link to="/auth" search={{ mode: "signup" }} className={cn(PRIMARY_CTA, "group gap-2 min-h-[56px] px-10 text-base rounded-full")}>
              <span>{FINAL_CTA.ctaPrimary}</span>
              <AnimatedIcon icon={ArrowRight} variant="magnetic" size="sm" />
            </Link>
          }
          secondary={
            <Link to="/contact" className={cn(SECONDARY_CTA, "min-h-[56px] px-10 text-base rounded-full")}>
              {FINAL_CTA.ctaSecondary}
            </Link>
          }
        />
      </motion.div>
    </BandSequence>
  );
}
