import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronRight, X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { adminOverviewFn, adminSaveSetupFn } from "@/lib/merchant-admin.functions";

const LABELS: Record<string, { en: string; bn: string; hintEn: string; hintBn: string }> = {
  profile: {
    en: "Add support contact",
    bn: "সাপোর্ট যোগাযোগ যোগ করুন",
    hintEn: "Customers need a phone number to reach you.",
    hintBn: "গ্রাহকদের জন্য একটি ফোন নম্বর দরকার।",
  },
  payments: {
    en: "Turn on a payment method",
    bn: "পেমেন্ট মেথড চালু করুন",
    hintEn: "Enable cash on delivery or mobile financial services.",
    hintBn: "ক্যাশ অন ডেলিভারি বা মোবাইল ব্যাংকিং চালু করুন।",
  },
  shipping: {
    en: "Set pickup address and rates",
    bn: "পিকআপ ঠিকানা ও চার্জ দিন",
    hintEn: "Couriers pick up from this address.",
    hintBn: "কুরিয়ার এই ঠিকানা থেকে পণ্য নেবে।",
  },
  courier: {
    en: "Connect a courier",
    bn: "কুরিয়ার যুক্ত করুন",
    hintEn: "At least one active carrier is needed to ship orders.",
    hintBn: "অর্ডার পাঠাতে অন্তত একটি সক্রিয় কুরিয়ার লাগবে।",
  },
  product: {
    en: "Publish your first product",
    bn: "প্রথম পণ্য পাবলিশ করুন",
    hintEn: "An active product makes the storefront shoppable.",
    hintBn: "সক্রিয় পণ্য থাকলে স্টোরে কেনাকাটা শুরু হবে।",
  },
  theme: {
    en: "Publish your storefront theme",
    bn: "থিম পাবলিশ করুন",
    hintEn: "Publish the home page layout from the builder.",
    hintBn: "বিল্ডার থেকে হোম পেজ পাবলিশ করুন।",
  },
  vat: {
    en: "Add your VAT registration",
    bn: "ভ্যাট রেজিস্ট্রেশন দিন",
    hintEn: "Required on invoices for VAT registered sellers.",
    hintBn: "ভ্যাট নিবন্ধিত বিক্রেতাদের ইনভয়েসে দরকার।",
  },
  kyc: {
    en: "Submit store verification",
    bn: "স্টোর ভেরিফিকেশন জমা দিন",
    hintEn: "Verification unlocks payouts.",
    hintBn: "ভেরিফিকেশন হলে পেআউট চালু হয়।",
  },
};

export function SetupChecklist() {
  const { t } = useLang();
  const qc = useQueryClient();
  const fetchOverview = useServerFn(adminOverviewFn);
  const saveSetup = useServerFn(adminSaveSetupFn);
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => fetchOverview(),
    staleTime: 30_000,
  });

  const setup = data?.setup;
  if (!setup || setup.complete || setup.dismissedAt) return null;

  const pct = Math.round((setup.done / setup.total) * 100);

  async function dismiss() {
    setBusy(true);
    try {
      await saveSetup({ data: { dismiss: true } });
      await qc.invalidateQueries({ queryKey: ["admin", "overview"] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="setup-heading"
      className="mb-6 rounded-fq-md border border-border bg-card"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <h2 id="setup-heading" className="text-sm font-semibold">
          {t("Finish setting up your store", "স্টোর সেটআপ শেষ করুন")}
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {setup.done}/{setup.total}
        </span>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("Setup progress", "সেটআপ অগ্রগতি")}
          className="h-2 w-32 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <button
          type="button"
          onClick={dismiss}
          disabled={busy}
          className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-fq-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
          {t("Dismiss", "লুকান")}
        </button>
      </div>

      <ul className="divide-y divide-border">
        {setup.steps.map((step) => {
          const label = LABELS[step.key];
          return (
            <li key={step.key}>
              <a
                href={step.href}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted"
                aria-label={`${label?.en ?? step.key}${step.done ? " (done)" : ""}`}
              >
                <span
                  aria-hidden
                  className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                    step.done
                      ? "border-transparent bg-success-soft text-success-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {step.done ? <Check className="size-3.5" /> : null}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-sm ${step.done ? "text-muted-foreground line-through" : "font-medium"}`}
                  >
                    {t(label?.en ?? step.key, label?.bn ?? step.key)}
                  </span>
                  {!step.done && (
                    <span className="block text-xs text-muted-foreground">
                      {t(label?.hintEn ?? "", label?.hintBn ?? "")}
                    </span>
                  )}
                </span>
                {!step.done && (
                  <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
