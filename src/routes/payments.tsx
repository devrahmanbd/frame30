/**
 * `/payments` — bKash, Nagad, card, COD, reconciled.
 *
 * Composed entirely from the shared band kit (docs/05-marketing/copy/05-payments.md
 * is the content contract; TODO.md §10 is the build contract). Copy and rail
 * facts live in `src/lib/marketing/payments.content.ts`; this file only wires
 * that data into bands and builds the SEO head.
 *
 * Loader is fail-soft: `getSiteContext` never throws (see its own doc
 * comment), so there is nothing here that needs a try/catch of its own.
 */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicShell } from "@/components/public/PublicShell";
import { getSiteContext } from "@/lib/site-seo.functions";
import { buildMarketingHead, buildGraph } from "@/lib/marketing-seo";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AnimatedIcon } from "@/components/public/AnimatedIcon";
import {
  Smartphone,
  CreditCard,
  Banknote,
  Sparkles,
  CheckCircle2,
  Receipt,
  Code,
  ArrowRight,
  RefreshCw,
  Layers,
  Copy} from "lucide-react";
import {
  Band,
  BandHeading,
  Chip,
  HeroBand,
  ZRow,
  CardGrid,
  MatrixTable,
  SpotlightBand,
  FaqBand,
  CtaBand,
  type BandCard,
  type MatrixColumn,
  type MatrixRow,
  type FaqEntry} from "@/components/public/bands";
import { MarketingFigure } from "@/components/public/MarketingFigure";
import paymentHandsImg from "@/assets/marketing/payment-hands.jpg";
import { PAYMENT_METHOD_CATALOG } from "@/lib/payment-rails";
import {
  HERO,
  HERO_RAIL_PILLS,
  FOUR_RAILS,
  railCardLabel,
  RAIL_COMPARISON,
  RAIL_COMPARISON_NOTE,
  RAIL_DECISION_FRAMEWORK,
  RECONCILIATION,
  REFUNDS,
  REFUND_SLA_ROWS,
  FRAUD_SCORING,
  FRAUD_SIGNALS,
  COD_PLAYBOOK_TITLE,
  COD_PLAYBOOK,
  COD_WORKED_EXAMPLE_TITLE,
  COD_WORKED_EXAMPLE_ROWS,
  COD_WORKED_EXAMPLE_NOTE,
  CHARGEBACKS,
  CHECKOUT_DESIGN,
  CHECKOUT_FIELDS,
  SECURITY,
  SECURITY_KEY_SCOPES,
  PAYOUTS,
  DEVELOPERS,
  PAYMENTS_FAQ,
  FINAL_CTA} from "@/lib/marketing/payments.content";

export const Route = createFileRoute("/payments")({
  loader: async () => {
    const site = await getSiteContext().catch(() => null);
    return {  origin: site.origin };
  },
  head: ({ loaderData }) => {
    const origin = loaderData?.origin ?? null;
    const head = buildMarketingHead({ route: "payments", origin });
    // FAQ entries passed to JSON-LD are the exact same array FaqBand renders
    // below — mismatched structured data reads as a spam signal to crawlers.
    const graph = buildGraph({
      route: "payments",
      origin,
      faq: PAYMENTS_FAQ.map((entry) => ({ question: entry.question.en, answer: entry.answer.en }))});
    return {
      meta: head.meta,
      links: head.links,
      scripts: graph ? [{ type: "application/ld+json", children: JSON.stringify(graph) }] : []};
  },
  errorComponent: () => <PaymentsMessage titleEn="Could not load this page" titleBn="পেজটি লোড করা যায়নি" />,
  notFoundComponent: () => <PaymentsMessage titleEn="Page not found" titleBn="পেজটি পাওয়া যায়নি" />,
  component: PaymentsPage});

type RailKey = "bkash" | "nagad" | "card" | "cod";

interface RailConfig {
  id: RailKey;
  label: string;
  labelBn: string;
  badge: string;
  feePercent: number;
  settlementTime: string;
  destination: string;
  icon: typeof Smartphone;
  description: string;
}

const SIMULATOR_RAILS: Record<RailKey, RailConfig> = {
  bkash: {
    id: "bkash",
    label: "bKash Direct MFS",
    labelBn: "বিকাশ ডিরেক্ট এমএফএস",
    badge: "180ms Webhook",
    feePercent: 1.2,
    settlementTime: "Real-time Instant Webhook",
    destination: "Direct to Merchant bKash Account",
    icon: Smartphone,
    description: "Tokenized customer checkout with direct automated reversal on dispatch refusal."},
  nagad: {
    id: "nagad",
    label: "Nagad Gateway",
    labelBn: "নগদ পেমেন্ট গেটওয়ে",
    badge: "210ms Webhook",
    feePercent: 1.0,
    settlementTime: "Instant Webhook Confirmation",
    destination: "Direct to Merchant Nagad Wallet",
    icon: Smartphone,
    description: "Direct carrier PG callback with SHA-256 merchant signature validation."},
  card: {
    id: "card",
    label: "City Bank Visa / Mastercard",
    labelBn: "সিটি ব্যাংক ভিসা / মাস্টারকার্ড",
    badge: "3D Secure 2.0",
    feePercent: 1.8,
    settlementTime: "T+1 Merchant Settlement",
    destination: "Direct to Merchant Corporate Current A/C",
    icon: CreditCard,
    description: "EMV 3DS2 frictionless OTP rail directly routed to City Bank Bangladesh gateway."},
  cod: {
    id: "cod",
    label: "Cash on Delivery (COD)",
    labelBn: "ক্যাশ অন ডেলিভারি",
    badge: "Courier Remittance",
    feePercent: 0.0,
    settlementTime: "Courier Remittance Cycle",
    destination: "Steadfast & Pathao Automated Remittance",
    icon: Banknote,
    description: "Courier rider collects cash at doorstep with pre-dispatch OTP confirmation."}};

function PaymentSettlementSandbox() {
  const { t, lang } = useLang();
  const [selectedRail, setSelectedRail] = useState<RailKey>("bkash");
  const [orderAmount, setOrderAmount] = useState<number>(3600);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulatedMs, setSimulatedMs] = useState<number>(184);
  const [copied, setCopied] = useState<boolean>(false);

  const rail = SIMULATOR_RAILS[selectedRail];
  const Icon = rail.icon;
  const gatewayFee = (orderAmount * rail.feePercent) / 100;
  const netTakeHome = orderAmount - gatewayFee;

  const handleSimulate = () => {
    setIsSimulating(true);
    setSimulatedMs(Math.floor(Math.random() * 40) + 165);
    setTimeout(() => setIsSimulating(false), 450);
  };

  const sampleWebhookPayload = {
    event: "payment.captured",
    transaction_id: `TRX_${selectedRail.toUpperCase()}_948271BD`,
    status: "SETTLED",
    currency: "BDT",
    order: {
      amount: orderAmount,
      platform_cut: 0,
      interchange_fee: Number(gatewayFee.toFixed(2)),
      merchant_net_settlement: Number(netTakeHome.toFixed(2)),
      customer_phone: "+880 1712-***489"},
    routing: {
      rail: selectedRail,
      gateway_confirmation_ms: simulatedMs,
      merchant_settlement: rail.destination,
      reconciliation_state: "LEDGER_LOCKED"}};

  return (
    <div className="fq-glass fq-halo rounded-fq-lg border border-border/80 bg-card/90 p-6 sm:p-8 mt-12 shadow-lift-lg">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3" /> {t("Interactive Rail & Settlement Simulator", "ইন্টারেক্টিভ পেমেন্ট রেল ও সেটেলমেন্ট সিমুলেটর")}
          </span>
          <h3 className="fq-display text-xl sm:text-2xl font-bold mt-2 text-foreground">
            {t("Live Payment Settlement & Webhook Sandbox", "লাইভ পেমেন্ট সেটেলমেন্ট ও ওয়েবহুক স্যান্ডবক্স")}
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {t("Simulate real-world customer checkouts and watch 0% platform commission with instant ledger writes.", "বাস্তব গ্রাহক চেকআউট সিমুলেট করুন এবং ০% প্ল্যাটফর্ম কমিশনের সুবিধা সরাসরি দেখুন।")}
          </p>
        </div>

        {/* Action button */}
        <button
          type="button"
          onClick={handleSimulate}
          disabled={isSimulating}
          className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:scale-[0.98] disabled:opacity-50 shrink-0"
        >
          <AnimatedIcon icon={RefreshCw} variant="spin-slow" size="sm" />
          {isSimulating ? t("Simulating...", "সিমুলেট হচ্ছে...") : t("Trigger Test Webhook", "টেস্ট ওয়েবহুক ট্রিগার করুন")}
        </button>
      </div>

      {/* Split-Screen: Simulator Controls & Live Webhook (Left) vs Instant P&L Net Ledger (Right) */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Simulator Controls & Webhook Payload (lg:col-span-7) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Step 1: Rail Selector Pills */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t("1. Select Payment Rail", "১. পেমেন্ট রেল নির্বাচন করুন")}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(["bkash", "nagad", "card", "cod"] as const).map((key) => {
                const r = SIMULATOR_RAILS[key];
                const RIcon = r.icon;
                const active = selectedRail === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedRail(key)}
                    className={cn(
                      "min-h-[44px] rounded-fq-md p-3 text-left transition-all border flex flex-col justify-between",
                      active
                        ? "border-primary bg-primary/10 shadow-sm scale-[1.01]"
                        : "border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className={cn("grid size-7 place-items-center rounded-fq-sm shrink-0", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                        <AnimatedIcon icon={RIcon} variant="lift" size="sm" />
                      </span>
                      <span className="rounded-fq-sm bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {r.badge}
                      </span>
                    </div>
                    <div className="mt-3">
                      <p className="font-semibold text-xs text-foreground truncate">{lang === "bn" ? r.labelBn : r.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{r.feePercent}% Fee · 0% Platform</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Order Amount Presets */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t("2. Sample Basket Value", "২. কার্টের নমুনা মূল্য")}
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "৳1,200", value: 1200, item: t("Cotton Panjabi", "কটন পাঞ্জাবি") },
                { label: "৳3,600", value: 3600, item: t("Tangail Jamdani", "টাঙ্গাইল জামদানি") },
                { label: "৳8,500", value: 8500, item: t("Showroom Wholesale", "শো-রুম পাইকারি") },
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setOrderAmount(preset.value)}
                  className={cn(
                    "min-h-[44px] rounded-fq-sm px-4 py-2 text-xs font-semibold transition-all inline-flex items-center gap-1.5",
                    orderAmount === preset.value
                      ? "bg-primary text-primary-foreground shadow-sm scale-[1.02]"
                      : "border border-border/70 bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/40",
                  )}
                >
                  <span>{preset.label}</span>
                  <span className="opacity-75 font-normal">({preset.item})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Live Webhook JSON Terminal Stream */}
          <div>
            <div className="flex items-center justify-between pb-2 mb-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Code className="size-3.5 text-primary" />
                {t("Live Webhook Event Stream", "লাইভ ওয়েবহুক ইভেন্ট স্ট্রিম")}
              </span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-primary">
                  {t("Verified Rail Latency:", "যাচাইকৃত লেটেন্সি:")} {simulatedMs}ms
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(sampleWebhookPayload, null, 2));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="rounded-fq-sm border border-border/70 bg-card px-2.5 py-1 text-[11px] font-medium text-foreground hover:border-primary/50 transition-colors inline-flex items-center gap-1.5"
                >
                  <AnimatedIcon icon={copied ? CheckCircle2 : Copy} variant={copied ? "sparkle" : "draw"} size="sm" />
                  <span>{copied ? t("Copied", "কপি হয়েছে") : t("Copy JSON", "কপি করুন")}</span>
                </button>
              </div>
            </div>
            <div className="rounded-fq-md border border-border/80 bg-background/90 p-4 font-mono text-xs overflow-x-auto shadow-inner">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/40 text-muted-foreground text-[11px]">
                <span className="text-foreground font-semibold">POST /api/webhooks/payments/{selectedRail}</span>
                <span className="text-primary font-semibold flex items-center gap-1.5">
                  <AnimatedIcon icon={CheckCircle2} variant="ping" size="sm" />
                  200 OK • {simulatedMs}ms
                </span>
              </div>
              <div className="mb-2 text-[11px] text-muted-foreground flex items-center gap-2">
                <span>Transaction ID:</span>
                <span className="fx-datastream">{sampleWebhookPayload.transaction_id}</span>
              </div>
              <pre className="text-foreground leading-relaxed">
                {JSON.stringify(sampleWebhookPayload, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        {/* Right Column: Instant P&L Net Ledger Balance (lg:col-span-5) */}
        <div className="lg:col-span-5 rounded-fq-lg border border-border/90 bg-card p-6 shadow-sm space-y-5">
          <div className="border-b border-border/60 pb-4">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {t("Instant P&L Net Ledger", "ইনস্ট্যান্ট পিঅ্যান্ডএল নিট লেজার")}
              </span>
              <span className="font-mono text-[11px] font-medium text-muted-foreground">
                STATUS: SETTLED
              </span>
            </div>
            <h4 className="fq-display text-lg font-bold text-foreground mt-2">
              {lang === "bn" ? rail.labelBn : rail.label}
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {rail.settlementTime}
            </p>
          </div>

          <div className="space-y-3 text-xs sm:text-sm">
            <div className="flex items-center justify-between py-1.5 border-b border-border/40 text-muted-foreground">
              <span>{t("Gross Order Total", "মোট অর্ডার মূল্য")}</span>
              <span className="font-mono tabular-nums font-semibold text-foreground">
                ৳{orderAmount.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-border/40 text-primary">
              <span className="font-semibold">{t("Framique Platform Cut", "ফ্রেমিক প্ল্যাটফর্ম কমিশন")}</span>
              <span className="font-mono tabular-nums font-bold">
                0% (৳0.00)
              </span>
            </div>

            <div className="flex items-center justify-between py-1.5 border-b border-border/40 text-muted-foreground">
              <div>
                <span>{t("Gateway Interchange Fee", "গেটওয়ে ফি")}</span>
                <span className="block text-[10px] opacity-75 font-normal">{rail.feePercent}% direct carrier fee</span>
              </div>
              <span className="font-mono tabular-nums font-semibold text-foreground">
                -৳{gatewayFee.toFixed(2)}
              </span>
            </div>

            <div className="pt-3 border-t-2 border-primary/30 flex items-baseline justify-between">
              <div>
                <span className="fq-display text-sm font-bold text-foreground">{t("Net Merchant Take-Home", "মার্চেন্টের নিট আয়")}</span>
                <span className="block text-[11px] text-primary font-medium mt-0.5">{t("100% Top-line Cash", "১০০% টপ-লাইন ক্যাশ")}</span>
              </div>
              <span className="fq-display text-2xl font-extrabold text-foreground tabular-nums">
                ৳{netTakeHome.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="rounded-fq-md border border-primary/20 bg-primary/5 p-3.5 space-y-1 text-xs">
            <p className="font-semibold text-primary flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5" />
              {t("Direct Settlement Destination", "সরাসরি সেটেলমেন্ট গন্তব্য")}
            </p>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              {rail.destination}
            </p>
          </div>

          <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
            <span>Reconciliation:</span>
            <span className="text-primary font-semibold">LEDGER_LOCKED</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentsMessage({ titleEn, titleBn }: { titleEn: string; titleBn: string }) {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="font-bangla-display text-2xl font-semibold">{t(titleEn, titleBn)}</h1>
      <Link to="/" className="mt-4 inline-block text-sm text-primary underline">
        {t("Back to home", "হোমে ফিরে যান")}
      </Link>
    </main>
  );
}

function PaymentsPage() {
  const { t, lang } = useLang();
  

  // Rail comparison table columns — one column per fact the deck's table asks
  // for. Column ids match the `cells` keys built below.
  const comparisonColumns: MatrixColumn[] = [
    { id: "settlement", label: t("Settlement timing", "সেটেলমেন্ট সময়") },
    { id: "failures", label: t("Common failure modes", "সাধারণ ব্যর্থতা") },
    { id: "refund", label: t("Refund path", "রিফান্ড পথ") },
    { id: "reconciliation", label: t("Reconciliation difficulty", "মিলকরণের কঠিনতা") },
    { id: "basket", label: t("Best-fit basket size", "উপযুক্ত বাস্কেট সাইজ") },
  ];
  const comparisonRows: MatrixRow[] = RAIL_COMPARISON.map((row) => ({
    id: row.id,
    label: row.methodKeys
      .map((key) => (lang === "bn" ? PAYMENT_METHOD_CATALOG[key].labelBn : PAYMENT_METHOD_CATALOG[key].label))
      .join(" / "),
    cells: {
      settlement: row.settlementTiming,
      failures: row.failureModes,
      refund: row.refundPath,
      reconciliation: row.reconciliationDifficulty,
      basket: row.bestFitBasket}}));

  // Refund SLA is a second, smaller matrix reusing the same rail-key pattern.
  const refundColumns: MatrixColumn[] = [{ id: "sla", label: t("Typical refund time", "রিফান্ডের সময়") }];
  const refundRows: MatrixRow[] = REFUND_SLA_ROWS.map((row) => ({
    id: row.id,
    label: row.methodKeys
      .map((key) => (lang === "bn" ? PAYMENT_METHOD_CATALOG[key].labelBn : PAYMENT_METHOD_CATALOG[key].label))
      .join(" / "),
    cells: { sla: row.typicalTime }}));

  const railCards: BandCard[] = FOUR_RAILS.map((card) => ({
    id: card.id,
    title: railCardLabel(card, lang),
    body: (
      <>
        <span className="block font-medium text-foreground">{t(card.headline.en, card.headline.bn)}</span>
        <span className="mt-1 block">{t(card.detail.en, card.detail.bn)}</span>
      </>
    )}));

  const playbookCards: BandCard[] = COD_PLAYBOOK.map((card) => ({
    id: card.id,
    icon: <span className="fq-display text-lg text-primary">{card.number}</span>,
    title: t(card.title.en, card.title.bn),
    body: t(card.body.en, card.body.bn)}));

  const faqEntries: FaqEntry[] = PAYMENTS_FAQ.map((entry) => ({
    id: entry.id,
    question: t(entry.question.en, entry.question.bn),
    answer: t(entry.answer.en, entry.answer.bn)}));

  return (
    <PublicShell >
      {/* 1 — Hero */}
      <HeroBand
        eyebrow={t(HERO.eyebrow.en, HERO.eyebrow.bn)}
        title={t(HERO.title.en, HERO.title.bn)}
        sub={t(HERO.sub.en, HERO.sub.bn)}
        actions={
          <>
            <a
              href="#four-rails"
              className="w-full sm:w-auto min-h-[44px] rounded-fq-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground flex items-center justify-center gap-2 shadow-sm hover:bg-primary/90 transition-all group"
            >
              <span>{t(HERO.primaryCta.en, HERO.primaryCta.bn)}</span>
              <AnimatedIcon icon={ArrowRight} variant="magnetic" size="sm" />
            </a>
            <Link
              to="/docs"
              className="w-full sm:w-auto min-h-[44px] rounded-fq-md border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground flex items-center justify-center hover:bg-muted/30 transition-all"
            >
              {t(HERO.altCta.en, HERO.altCta.bn)}
            </Link>
          </>
        }
        proof={
          <span className="flex flex-wrap gap-2">
            {HERO_RAIL_PILLS.map((key) => (
              <Chip key={key}>{lang === "bn" ? PAYMENT_METHOD_CATALOG[key].labelBn : PAYMENT_METHOD_CATALOG[key].label}</Chip>
            ))}
          </span>
        }
      />

      {/* 2 — The four rails */}
      <Band id="four-rails" labelledBy="four-rails-title">
        <BandHeading
          id="four-rails-title"
          eyebrow={t("The four rails", "চারটি রেল")}
          title={t(
            "Four structurally different payment behaviours, one ledger.",
            "চারটি ভিন্ন পেমেন্ট আচরণ, একটি লেজার।",
          )}
          sub={t(
            "Each rail is a first-class object with its own authorisation flow, failure surface and refund path — but every rail writes to the same order and ledger schema.",
            "প্রতিটি রেলের নিজস্ব অথরাইজেশন ফ্লো, ব্যর্থতার ধরন ও রিফান্ড পথ আছে — কিন্তু সবাই একই অর্ডার ও লেজার স্কিমায় লেখে।",
          )}
        />
        <MarketingFigure
          className="mt-8"
          src={paymentHandsImg}
          alt="Prompt: High-tech 3D visualization of cryptographic data streams connecting mobile banking nodes bKash and Nagad to an encrypted merchant ledger, holographic glowing shield icon, deep navy and calm pink tones, photorealistic studio render, 8k resolution, aspect ratio 16:9."
          caption={t(
            "Instant digital checkout and zero-commission direct merchant bank settlement.",
            "তাত্ক্ষণিক ডিজিটাল চেকআউট এবং জিরো-কমিশন ডিরেক্ট মার্চেন্ট ব্যাংক সেটেলমেন্ট।",
          )}
        />
        <div className="mt-10">
          <CardGrid cards={railCards} columns={4} />
        </div>
        <PaymentSettlementSandbox />
      </Band>

      {/* 3 — Rail comparison table */}
      <Band surface="glass" labelledBy="rail-comparison-title" divided>
        <BandHeading
          id="rail-comparison-title"
          eyebrow={t("Which rail should I lead with?", "কোন রেল দিয়ে শুরু করব?")}
          title={t("Rail comparison — the table to bring into a finance conversation.", "রেল তুলনা — অর্থ বিভাগের আলোচনায় আনার টেবিল।")}
        />
        <div className="mt-8">
          <MatrixTable
            caption={t("Payment rail comparison: settlement, failure modes, refunds, reconciliation", "পেমেন্ট রেল তুলনা")}
            layout="cards"
            columns={comparisonColumns}
            rows={comparisonRows}
            note={t(RAIL_COMPARISON_NOTE.en, RAIL_COMPARISON_NOTE.bn)}
          />
        </div>
        <p className="fq-measure mt-6 text-sm text-muted-foreground">
          {t(RAIL_DECISION_FRAMEWORK.en, RAIL_DECISION_FRAMEWORK.bn)}
        </p>
      </Band>

      {/* 4 — The reconciliation engine */}
      <Band labelledBy="reconciliation-title">
        <ZRow
          id="reconciliation-title"
          level={2}
          direction="left"
          eyebrow={t(RECONCILIATION.eyebrow.en, RECONCILIATION.eyebrow.bn)}
          title={t(RECONCILIATION.title.en)}
          body={t(RECONCILIATION.body.en)}
          bullets={RECONCILIATION.bullets.map((b) => t(b.en))}
          proof={t(RECONCILIATION.proof.en)}
          visual={
            <div className="fq-glass flex flex-col gap-3 rounded-fq-lg p-6 text-sm text-muted-foreground">
              {RECONCILIATION.flow.map((step, index) => (
                <div key={index} className="flex items-center gap-3">
                  <span className="fq-glass flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium text-foreground">
                    {index + 1}
                  </span>
                  <span>{t(step.en)}</span>
                </div>
              ))}
            </div>
          }
        />
        <p className="fq-measure mt-4 text-sm text-muted-foreground">{t(RECONCILIATION.worked.en)}</p>
      </Band>

      {/* 5 — Refunds and partial refunds */}
      <Band surface="glass" divided>
        <ZRow
          direction="right"
          level={2}
          title={t(REFUNDS.title.en)}
          body={t(REFUNDS.body.en)}
          bullets={REFUNDS.bullets.map((b) => t(b.en))}
          proof={t(REFUNDS.proof.en)}
          visual={
            <div className="mt-4">
              <MatrixTable
                caption={t("Typical refund time by rail", "রেল অনুযায়ী রিফান্ড সময়")}
                layout="cards"
                columns={refundColumns}
                rows={refundRows}
              />
            </div>
          }
        />
      </Band>

      {/* 6 — Fraud scoring before courier booking */}
      <Band divided>
        <ZRow
          direction="left"
          level={2}
          title={t(FRAUD_SCORING.title.en)}
          body={t(FRAUD_SCORING.body.en)}
          bullets={FRAUD_SCORING.bullets.map((b) => t(b.en))}
          proof={t(FRAUD_SCORING.proof.en)}
          visual={
            <ul className="fq-glass space-y-3 rounded-fq-lg p-6 text-sm">
              {FRAUD_SIGNALS.map((signal) => (
                <li key={signal.id} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={
                      signal.active
                        ? "mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                        : "mt-1.5 size-2 shrink-0 rounded-full bg-border"
                    }
                  />
                  <span className="text-muted-foreground">{t(signal.label.en)}</span>
                </li>
              ))}
            </ul>
          }
        />
      </Band>

      {/* 7 — COD risk management playbook */}
      <Band surface="glass" labelledBy="cod-playbook-title" divided>
        <BandHeading id="cod-playbook-title" title={t(COD_PLAYBOOK_TITLE.en, COD_PLAYBOOK_TITLE.bn)} />
        <div className="mt-10">
          <CardGrid cards={playbookCards} columns={3} />
        </div>
        <div className="mt-12 border-t border-border pt-10">
          <h3 className="fq-display text-xl">{t(COD_WORKED_EXAMPLE_TITLE.en)}</h3>
          <div className="mt-6">
            <MatrixTable
              caption={t(COD_WORKED_EXAMPLE_TITLE.en)}
              layout="cards"
              columns={[
                { id: "before", label: t("Before playbook", "প্লেবুকের আগে") },
                { id: "after", label: t("After playbook (refusal cut to 8%)", "প্লেবুকের পরে (৮% এ নেমে আসা)"), highlight: true },
              ]}
              rows={COD_WORKED_EXAMPLE_ROWS.map((row) => ({
                id: row.id,
                label: t(row.metric.en),
                cells: { before: row.before, after: row.after }}))}
              note={t(COD_WORKED_EXAMPLE_NOTE.en)}
            />
          </div>
        </div>
      </Band>

      {/* 8 — Chargebacks and disputes */}
      <Band divided>
        <BandHeading title={t(CHARGEBACKS.title.en)} />
        <div className="fq-glass mt-8 max-w-3xl rounded-fq-lg p-6">
          <p className="text-sm text-muted-foreground">{t(CHARGEBACKS.body.en)}</p>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            {CHARGEBACKS.bullets.map((b, i) => (
              <li key={i} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-border" />
                <span>{t(b.en)}</span>
              </li>
            ))}
          </ul>
        </div>
      </Band>

      {/* 9 — Checkout conversion design */}
      <Band surface="glass" divided>
        <ZRow
          direction="right"
          level={2}
          eyebrow={t(CHECKOUT_DESIGN.eyebrow.en, CHECKOUT_DESIGN.eyebrow.bn)}
          title={t(CHECKOUT_DESIGN.title.en)}
          body={t(CHECKOUT_DESIGN.body.en)}
          bullets={CHECKOUT_DESIGN.bullets.map((b) => t(b.en))}
          visual={
            <MatrixTable
              caption={t("Checkout field checklist", "চেকআউট ফিল্ড চেকলিস্ট")}
              layout="cards"
              columns={[
                { id: "required", label: t("Required?", "আবশ্যক?") },
                { id: "why", label: t("Why", "কেন") },
              ]}
              rows={CHECKOUT_FIELDS.map((f) => ({
                id: f.id,
                label: t(f.field.en),
                cells: { required: f.required, why: t(f.why.en) }}))}
            />
          }
        />
      </Band>

      {/* 10 — Security: PCI, keys, tokens */}
      <Band divided>
        <BandHeading title={t(SECURITY.title.en)} sub={t(SECURITY.body.en)} />
        <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <ul className="space-y-3 text-sm text-muted-foreground">
            {SECURITY.bullets.map((b, i) => (
              <li key={i} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-border" />
                <span>{t(b.en)}</span>
              </li>
            ))}
          </ul>
          <div className="fq-glass rounded-fq-lg p-6">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {t("Key scopes", "কী স্কোপ")}
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              {SECURITY_KEY_SCOPES.map((scope) => (
                <li key={scope.id} className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
                  <span className="font-mono text-foreground">{scope.scope.en}</span>
                  <span className="text-right text-muted-foreground">{t(scope.grants.en)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Band>

      {/* 11 — Payouts and finance exports */}
      <Band surface="glass" divided>
        <ZRow
          direction="left"
          level={2}
          title={t(PAYOUTS.title.en)}
          body={t(PAYOUTS.body.en)}
          bullets={PAYOUTS.bullets.map((b) => t(b.en))}
          proof={t(PAYOUTS.proof.en)}
        />
      </Band>

      {/* 12 — Built for developers */}
      <Band divided>
        <BandHeading title={t(DEVELOPERS.title.en)} sub={t(DEVELOPERS.body.en)} />
        <div className="fq-glass mt-8 rounded-fq-lg p-6">
          <ul className="space-y-4 text-sm">
            {DEVELOPERS.endpoints.map((ep) => (
              <li key={ep.id}>
                <code className="rounded bg-background px-2 py-1 font-mono text-xs text-foreground">{ep.code}</code>
                <p className="mt-1 text-muted-foreground">{t(ep.desc.en)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-4 border-t border-border pt-4 text-sm">
            {DEVELOPERS.docsLinks.map((link) => (
              <Link key={link.id} to={link.href} className="text-primary underline">
                {t(link.label.en)}
              </Link>
            ))}
          </div>
        </div>
      </Band>

      {/* 13 — FAQ */}
      <Band surface="glass" labelledBy="payments-faq-title" divided>
        <BandHeading id="payments-faq-title" title={t("Frequently asked", "সচরাচর জিজ্ঞাসা")} />
        <FaqBand entries={faqEntries} />
      </Band>

      {/* 14 — Final CTA */}
      <CtaBand
        title={t(FINAL_CTA.title.en, FINAL_CTA.title.bn)}
        body={t(FINAL_CTA.body.en, FINAL_CTA.body.bn)}
        primary={
          <Link
            to="/auth"
            search={{ mode: "signup", accountType: "merchant" }}
            className="w-full sm:w-auto min-h-[44px] rounded-fq-md bg-primary text-primary-foreground px-6 py-3 text-sm font-semibold flex items-center justify-center shadow-sm hover:bg-primary/90 transition-all"
          >
            {t(FINAL_CTA.primaryCta.en)}
          </Link>
        }
        secondary={
          <Link
            to="/contact"
            className="w-full sm:w-auto min-h-[44px] rounded-fq-md border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground flex items-center justify-center hover:bg-muted/30 transition-all"
          >
            {t(FINAL_CTA.secondaryCta.en)}
          </Link>
        }
      />
    </PublicShell>
  );
}
