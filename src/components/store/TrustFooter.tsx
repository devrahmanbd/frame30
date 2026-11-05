import React from "react";
import { useDynamicContext } from "@/components/builder/DynamicContext";
import { useLang } from "@/lib/i18n";
import { Truck, RotateCcw, ShieldCheck, Headset, Star } from "lucide-react";

export interface TrustBadgeItem {
  icon?: "delivery" | "returns" | "secure" | "support" | "quality";
  title: string;
  body: string;
  policyKey?: string;
}

export interface TrustFooterProps {
  items?: TrustBadgeItem[];
  codPolicy?: string;
  deliveryPolicy?: string;
  exchangePolicy?: string;
  returnPolicy?: string;
  supportEmail?: string;
  supportPhone?: string;
  supportHours?: string;
  craftPolicy?: string;
  paymentPolicy?: string;
}

const ICONS = {
  delivery: Truck,
  returns: RotateCcw,
  secure: ShieldCheck,
  support: Headset,
  quality: Star,
};

/**
 * Storefront trust footer: strictly policy-verified assurance badges.
 * Omit unverified claims instead of substituting generic marketing promises.
 * Missing policy data produces zero customer-facing claims.
 */
export function TrustFooter(props: TrustFooterProps) {
  const { lang } = useLang();
  const locale = lang === "bn" ? "bn" : "en";
  const dynamic = (useDynamicContext(false) || {}) as Record<string, unknown>;
  const dynamicPolicy = (dynamic.policy || {}) as Record<string, unknown>;
  const dynamicMerchant = (dynamic.merchant || {}) as Record<string, unknown>;

  const codPolicy =
    props.codPolicy ||
    (typeof dynamicPolicy.cod_policy === "string" ? dynamicPolicy.cod_policy : "") ||
    (typeof dynamic.codPolicy === "string" ? (dynamic.codPolicy as string) : "");

  const deliveryPolicy =
    props.deliveryPolicy ||
    (typeof dynamicPolicy.delivery_policy === "string" ? dynamicPolicy.delivery_policy : "") ||
    (typeof dynamic.deliveryPolicy === "string" ? (dynamic.deliveryPolicy as string) : "");

  const exchangePolicy =
    props.exchangePolicy ||
    props.returnPolicy ||
    (typeof dynamicPolicy.exchange_policy === "string" ? dynamicPolicy.exchange_policy : "") ||
    (typeof dynamic.exchangePolicy === "string" ? (dynamic.exchangePolicy as string) : "");

  const supportHours =
    props.supportHours ||
    (typeof dynamicPolicy.support_hours === "string" ? dynamicPolicy.support_hours : "") ||
    (typeof dynamic.supportHours === "string" ? (dynamic.supportHours as string) : "");

  const supportEmail =
    props.supportEmail ||
    (typeof dynamicPolicy.support_email === "string" ? dynamicPolicy.support_email : "") ||
    (typeof dynamicMerchant.support_email === "string" ? dynamicMerchant.support_email : "") ||
    (typeof dynamic.support_email === "string" ? (dynamic.support_email as string) : "");

  const supportPhone =
    props.supportPhone ||
    (typeof dynamicPolicy.support_phone === "string" ? dynamicPolicy.support_phone : "") ||
    (typeof dynamicMerchant.support_phone === "string" ? dynamicMerchant.support_phone : "") ||
    (typeof dynamic.support_phone === "string" ? (dynamic.support_phone as string) : "");

  const craftPolicy =
    props.craftPolicy ||
    (typeof dynamicPolicy.craft_policy === "string" ? dynamicPolicy.craft_policy : "") ||
    (typeof dynamic.craftPolicy === "string" ? (dynamic.craftPolicy as string) : "");

  const paymentPolicy =
    props.paymentPolicy ||
    (typeof dynamicPolicy.payment_policy === "string" ? dynamicPolicy.payment_policy : "") ||
    (typeof dynamic.paymentPolicy === "string" ? (dynamic.paymentPolicy as string) : "");

  const badges: { icon: "delivery" | "returns" | "secure" | "support" | "quality"; title: string; body: string }[] = [];

  if (codPolicy) {
    badges.push({
      icon: "delivery",
      title: locale === "bn" ? "সারাদেশে ডেলিভারি" : "NATIONWIDE DELIVERY",
      body: codPolicy,
    });
  } else if (deliveryPolicy) {
    badges.push({
      icon: "delivery",
      title: locale === "bn" ? "ডেলিভারি সুবিধা" : "DELIVERY SERVICE",
      body: deliveryPolicy,
    });
  }

  if (exchangePolicy) {
    badges.push({
      icon: "returns",
      title: locale === "bn" ? "সহজ বিনিময়" : "EASY EXCHANGE",
      body: exchangePolicy,
    });
  }

  if (supportHours) {
    badges.push({
      icon: "support",
      title: locale === "bn" ? "গ্রাহক সেবা" : "CUSTOMER CARE",
      body: supportHours,
    });
  } else if (supportEmail) {
    badges.push({
      icon: "support",
      title: locale === "bn" ? "গ্রাহক সেবা" : "CUSTOMER CARE",
      body: locale === "bn" ? `ইমেইল সহায়তা: ${supportEmail}` : `Email support: ${supportEmail}`,
    });
  } else if (supportPhone) {
    badges.push({
      icon: "support",
      title: locale === "bn" ? "গ্রাহক সেবা" : "CUSTOMER CARE",
      body: locale === "bn" ? `হটলাইন: ${supportPhone}` : `Hotline: ${supportPhone}`,
    });
  }

  if (craftPolicy) {
    badges.push({
      icon: "quality",
      title: locale === "bn" ? "খাঁটি কারুশিল্প" : "AUTHENTIC CRAFT",
      body: craftPolicy,
    });
  }

  if (paymentPolicy) {
    badges.push({
      icon: "secure",
      title: locale === "bn" ? "নিরাপদ পেমেন্ট" : "SECURE PAYMENT",
      body: paymentPolicy,
    });
  }

  // Missing policy data produces zero customer-facing claims
  if (badges.length === 0) {
    return null;
  }

  const gridCols =
    badges.length === 1
      ? "grid-cols-1"
      : badges.length === 2
        ? "grid-cols-2"
        : badges.length === 3
          ? "grid-cols-1 sm:grid-cols-3"
          : "grid-cols-2 lg:grid-cols-4";

  return (
    <div data-reveal className="w-full border-t border-[var(--theme-border)]">
      <ul className={`mx-auto grid max-w-[var(--fq-container,1440px)] ${gridCols} divide-x divide-[var(--theme-border)] px-0`}>
        {badges.map((item, idx) => {
          const Icon = ICONS[item.icon] || Star;
          return (
            <li key={idx} className="flex items-center gap-4 py-8 px-6 sm:px-8">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--theme-border)] bg-[var(--theme-surface)] text-[var(--theme-accent)]">
                <Icon size={20} />
              </div>
              <div>
                <p className="font-serif text-[11px] font-semibold tracking-wider text-[var(--theme-ink)] uppercase">
                  {item.title}
                </p>
                <p className="text-xs text-[var(--theme-ink)]/75 mt-0.5 leading-relaxed">
                  {item.body}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
