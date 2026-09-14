import { ORG_NAP, napAddressLine } from "./nap";
export { ORG_NAP, napAddressLine, napPostalAddress, organizationSchema } from "./nap";

/**
 * Phase 10.3 — legal pages and the single source of NAP.
 *
 * Two things live here and nowhere else:
 *
 *   1. `ORG_NAP` — the canonical Name / Address / Phone for the business.
 *      Every surface that prints an address (footer, contact page,
 *      Organization JSON-LD, invoice, transactional email) reads this object.
 *      A NAP that disagrees with itself across pages is the single most
 *      common local-SEO defect, so we make disagreement impossible by
 *      construction and assert it in the copy contract.
 *
 *   2. `LEGAL_DOCS` — Terms, Privacy, Refund, Cookies, Acceptable Use, each
 *      bilingual, each versioned with an effective date. Versioning matters
 *      operationally: consent records store `policyVersion`, so we must be
 *      able to say exactly what a merchant agreed to on a given day.
 *
 * Content rules: no clause promises something the platform does not do, and
 * every document names a real contact route for the obligation it creates.
 */

export type LegalSection = {
  id: string;
  heading: { en: string; bn: string };
  body: { en: string[]; bn: string[] };
};

export type LegalDoc = {
  slug: string;
  version: string;
  effective: string; // ISO date
  title: { en: string; bn: string };
  summary: { en: string; bn: string };
  sections: LegalSection[];
};

const s = (
  id: string,
  headingEn: string,
  headingBn: string,
  bodyEn: string[],
  bodyBn: string[],
): LegalSection => ({ id, heading: { en: headingEn, bn: headingBn }, body: { en: bodyEn, bn: bodyBn } });

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "terms",
    version: "2026-08-01",
    effective: "2026-08-01",
    title: { en: "Terms of Service", bn: "সেবার শর্তাবলি" },
    summary: {
      en: "The agreement between your business and Framique when you run a store on the platform.",
      bn: "প্ল্যাটফর্মে স্টোর চালানোর সময় আপনার ব্যবসা ও Framique-এর মধ্যে যে চুক্তি প্রযোজ্য।",
    },
    sections: [
      s(
        "who-we-are",
        "Who you are contracting with",
        "চুক্তি কার সঙ্গে",
        [
          `${ORG_NAP.legalName}, registered in ${ORG_NAP.country} at ${napAddressLine()}, provides the Framique commerce platform.`,
          "By creating an account you confirm you can enter a contract on behalf of the business named on the account.",
        ],
        [
          `${ORG_NAP.legalName}, ঠিকানা ${napAddressLine()}, Framique কমার্স প্ল্যাটফর্ম পরিচালনা করে।`,
          "অ্যাকাউন্ট খোলার মাধ্যমে আপনি নিশ্চিত করছেন যে অ্যাকাউন্টে উল্লেখ করা ব্যবসার পক্ষে চুক্তি করার অধিকার আপনার আছে।",
        ],
      ),
      s(
        "your-store",
        "Your store, your content",
        "আপনার স্টোর, আপনার কনটেন্ট",
        [
          "You own the products, media, articles and customer records you upload. We store and process them so the platform can work for you.",
          "You are responsible for the legality of what you sell, the accuracy of prices, and the claims you make to shoppers.",
        ],
        [
          "আপনার আপলোড করা পণ্য, ছবি, লেখা ও কাস্টমার তথ্যের মালিক আপনি। প্ল্যাটফর্ম চালানোর জন্যই আমরা সেগুলো সংরক্ষণ ও প্রসেস করি।",
          "আপনি যা বিক্রি করেন তার বৈধতা, দামের সঠিকতা এবং ক্রেতাকে দেওয়া প্রতিশ্রুতির দায় আপনার।",
        ],
      ),
      s(
        "plans",
        "Plans, trials and invoices",
        "প্ল্যান, ট্রায়াল ও ইনভয়েস",
        [
          "Plan limits and prices are shown on the pricing page in BDT before you subscribe. A trial ends on the date shown in your dashboard; we do not charge a card during a trial.",
          "Invoices are issued per billing period and are payable through the methods enabled on your account.",
        ],
        [
          "সাবস্ক্রাইব করার আগেই প্রাইসিং পেজে BDT-তে প্ল্যানের সীমা ও দাম দেখানো হয়। ড্যাশবোর্ডে দেখানো তারিখে ট্রায়াল শেষ হয়; ট্রায়াল চলাকালে কার্ডে চার্জ করা হয় না।",
          "প্রতি বিলিং পিরিয়ডে ইনভয়েস ইস্যু হয় এবং আপনার অ্যাকাউন্টে চালু পদ্ধতিতে পরিশোধযোগ্য।",
        ],
      ),
      s(
        "availability",
        "Availability and changes",
        "সেবা প্রাপ্যতা ও পরিবর্তন",
        [
          "We publish platform status and incident history on the status page. We do not promise uninterrupted service; we do commit to telling you what happened.",
          "Breaking changes to merchant-facing APIs are announced in the changelog before they take effect.",
        ],
        [
          "স্ট্যাটাস পেজে প্ল্যাটফর্মের অবস্থা ও ঘটে যাওয়া সমস্যার ইতিহাস প্রকাশ করা হয়। নিরবচ্ছিন্ন সেবার প্রতিশ্রুতি আমরা দিই না; তবে কী ঘটেছে তা জানানোর দায়িত্ব নিই।",
          "মার্চেন্ট-মুখী API-তে বড় পরিবর্তন কার্যকর হওয়ার আগে চেঞ্জলগে জানানো হয়।",
        ],
      ),
      s(
        "ending",
        "Ending the agreement",
        "চুক্তি সমাপ্তি",
        [
          "You can cancel at any time from billing settings. Your store stays reachable until the end of the paid period.",
          "You can export products, orders and customers to CSV during the retention window shown in your settings, including after cancellation.",
        ],
        [
          "বিলিং সেটিংস থেকে যেকোনো সময় বাতিল করতে পারেন। পরিশোধিত সময় শেষ না হওয়া পর্যন্ত স্টোর চালু থাকে।",
          "সেটিংসে দেখানো রিটেনশন সময়ের মধ্যে — বাতিলের পরেও — পণ্য, অর্ডার ও কাস্টমার CSV-তে এক্সপোর্ট করা যায়।",
        ],
      ),
      s(
        "liability",
        "Liability",
        "দায়",
        [
          "Except where the law does not allow it, our liability for a claim is limited to the fees you paid in the three months before the claim.",
          "Nothing here limits liability for fraud or for anything that cannot be limited under Bangladeshi law.",
        ],
        [
          "আইনে যেখানে বাধা নেই, সেখানে কোনো দাবির ক্ষেত্রে আমাদের দায় দাবির আগের তিন মাসে আপনার পরিশোধিত ফি পর্যন্ত সীমিত।",
          "প্রতারণা বা বাংলাদেশের আইনে সীমিত করা যায় না এমন কোনো দায় এখানে সীমিত করা হয়নি।",
        ],
      ),
    ],
  },
  {
    slug: "privacy",
    version: "2026-08-01",
    effective: "2026-08-01",
    title: { en: "Privacy Policy", bn: "প্রাইভেসি পলিসি" },
    summary: {
      en: "What personal data the platform holds, why it is held, and how to ask us to change or delete it.",
      bn: "প্ল্যাটফর্ম কোন ব্যক্তিগত তথ্য রাখে, কেন রাখে এবং কীভাবে তা বদলাতে বা মুছতে বলবেন।",
    },
    sections: [
      s(
        "controller",
        "Who controls the data",
        "তথ্যের নিয়ন্ত্রক কে",
        [
          `For your merchant account, ${ORG_NAP.legalName} is the controller. For shoppers on your storefront, you are the controller and we process on your instructions.`,
          `Privacy questions go to ${ORG_NAP.privacyEmail}; we answer in writing.`,
        ],
        [
          `আপনার মার্চেন্ট অ্যাকাউন্টের ক্ষেত্রে নিয়ন্ত্রক ${ORG_NAP.legalName}। আপনার স্টোরের ক্রেতাদের ক্ষেত্রে নিয়ন্ত্রক আপনি, আমরা আপনার নির্দেশে প্রসেস করি।`,
          `প্রাইভেসি সংক্রান্ত প্রশ্ন ${ORG_NAP.privacyEmail} ঠিকানায় পাঠান; উত্তর লিখিতভাবে দেওয়া হয়।`,
        ],
      ),
      s(
        "what",
        "What we collect",
        "কী কী সংগ্রহ করা হয়",
        [
          "Account data: name, email, phone, business details and login events. Store data: products, orders, customers and messages you create. Technical data: IP-derived hashes, device type and error traces needed to keep the service safe.",
          "We do not sell personal data, and we do not use shopper data from one store to advertise another.",
        ],
        [
          "অ্যাকাউন্ট তথ্য: নাম, ইমেইল, ফোন, ব্যবসার তথ্য ও লগইন রেকর্ড। স্টোর তথ্য: আপনার তৈরি পণ্য, অর্ডার, কাস্টমার ও বার্তা। কারিগরি তথ্য: নিরাপত্তার জন্য প্রয়োজনীয় IP থেকে তৈরি হ্যাশ, ডিভাইসের ধরন ও এরর রেকর্ড।",
          "আমরা ব্যক্তিগত তথ্য বিক্রি করি না, এবং এক স্টোরের ক্রেতার তথ্য অন্য স্টোরের বিজ্ঞাপনে ব্যবহার করি না।",
        ],
      ),
      s(
        "why",
        "Why we hold it",
        "কেন রাখা হয়",
        [
          "To run the service you asked for, to bill you, to prevent fraud, and to meet accounting and tax obligations.",
          "Marketing email is sent only to addresses that confirmed a subscription, and every message carries a working unsubscribe link.",
        ],
        [
          "আপনার চাওয়া সেবা চালাতে, বিল করতে, প্রতারণা ঠেকাতে এবং হিসাব ও কর সংক্রান্ত বাধ্যবাধকতা মানতে।",
          "মার্কেটিং ইমেইল কেবল নিশ্চিত করা ঠিকানায় যায়, এবং প্রতিটি বার্তায় কার্যকর আনসাবস্ক্রাইব লিংক থাকে।",
        ],
      ),
      s(
        "retention",
        "How long we keep it",
        "কতদিন রাখা হয়",
        [
          "Store data stays while the account is active and for the retention window shown in your settings after cancellation. Financial records are kept for the period the law requires.",
          "Backups roll off on a fixed schedule; a deletion request is applied to live data immediately and to backups as they expire.",
        ],
        [
          "অ্যাকাউন্ট চালু থাকা অবস্থায় এবং বাতিলের পর সেটিংসে দেখানো রিটেনশন সময় পর্যন্ত স্টোর ডেটা থাকে। আর্থিক রেকর্ড আইনে নির্ধারিত সময় পর্যন্ত রাখা হয়।",
          "ব্যাকআপ নির্দিষ্ট সময় পর মুছে যায়; মুছে ফেলার অনুরোধ লাইভ ডেটায় সঙ্গে সঙ্গে এবং ব্যাকআপে মেয়াদ শেষ হওয়ার সঙ্গে সঙ্গে কার্যকর হয়।",
        ],
      ),
      s(
        "rights",
        "Your rights",
        "আপনার অধিকার",
        [
          "Ask for a copy of your data, a correction, or deletion. Export tools cover most requests instantly; anything else is handled by a person.",
          "If you are unhappy with the answer, say so in the same thread and it is escalated inside one business day.",
        ],
        [
          "আপনার তথ্যের কপি, সংশোধন বা মুছে ফেলার অনুরোধ করতে পারেন। বেশিরভাগ অনুরোধ এক্সপোর্ট টুল দিয়েই সঙ্গে সঙ্গে মেটে; বাকিগুলো একজন মানুষ দেখেন।",
          "উত্তরে সন্তুষ্ট না হলে একই থ্রেডে জানান; এক কর্মদিবসের মধ্যে বিষয়টি উপরে পাঠানো হয়।",
        ],
      ),
    ],
  },
  {
    slug: "refund",
    version: "2026-08-01",
    effective: "2026-08-01",
    title: { en: "Refund Policy", bn: "রিফান্ড পলিসি" },
    summary: {
      en: "When platform subscription fees are refunded, and how shopper refunds on your own store work.",
      bn: "প্ল্যাটফর্ম সাবস্ক্রিপশন ফি কখন ফেরত দেওয়া হয়, এবং আপনার স্টোরে ক্রেতার রিফান্ড কীভাবে চলে।",
    },
    sections: [
      s(
        "subscription",
        "Subscription fees",
        "সাবস্ক্রিপশন ফি",
        [
          "A paid period that has not started is refunded in full. A period already in use is refunded only where we failed to deliver the plan you paid for.",
          "Refund requests are answered within three business days with the decision and the reason in writing.",
        ],
        [
          "শুরু না হওয়া কোনো পরিশোধিত সময়ের পুরো টাকা ফেরত দেওয়া হয়। চলমান সময়ের ফি কেবল তখনই ফেরত দেওয়া হয় যখন পরিশোধিত প্ল্যানের সেবা আমরা দিতে পারিনি।",
          "রিফান্ড অনুরোধের উত্তর তিন কর্মদিবসের মধ্যে সিদ্ধান্ত ও কারণসহ লিখিতভাবে দেওয়া হয়।",
        ],
      ),
      s(
        "shopper",
        "Refunds on your storefront",
        "আপনার স্টোরে রিফান্ড",
        [
          "Your store's refund terms are yours to set and to honour. The platform records the refund, restores stock and updates the order timeline.",
          "Money moves through the gateway or rail that took the payment; cash on delivery refunds are recorded but settled by you.",
        ],
        [
          "আপনার স্টোরের রিফান্ড শর্ত আপনি ঠিক করবেন এবং আপনিই মানবেন। প্ল্যাটফর্ম রিফান্ড রেকর্ড করে, স্টক ফিরিয়ে দেয় ও অর্ডার টাইমলাইন হালনাগাদ করে।",
          "যে গেটওয়ে বা রেলে টাকা এসেছিল সেখানেই ফেরত যায়; ক্যাশ অন ডেলিভারির রিফান্ড রেকর্ড হয় কিন্তু আপনি নিজে পরিশোধ করেন।",
        ],
      ),
      s(
        "chargeback",
        "Disputes and chargebacks",
        "ডিসপিউট ও চার্জব্যাক",
        [
          "A gateway dispute is shown in the order timeline with the evidence deadline. We forward what you submit; the gateway decides.",
          "Repeated disputes above the gateway's threshold can suspend that payment method on your account until it is reviewed.",
        ],
        [
          "গেটওয়ে ডিসপিউট অর্ডার টাইমলাইনে প্রমাণ জমার শেষ তারিখসহ দেখানো হয়। আপনি যা জমা দেন আমরা তা পাঠাই; সিদ্ধান্ত গেটওয়ের।",
          "গেটওয়ের সীমার বেশি বারবার ডিসপিউট হলে পর্যালোচনা না হওয়া পর্যন্ত আপনার অ্যাকাউন্টে ওই পেমেন্ট মেথড বন্ধ থাকতে পারে।",
        ],
      ),
    ],
  },
  {
    slug: "cookies",
    version: "2026-08-01",
    effective: "2026-08-01",
    title: { en: "Cookie Policy", bn: "কুকি পলিসি" },
    summary: {
      en: "Which cookies the platform sets, which ones need consent, and how to change your choice.",
      bn: "প্ল্যাটফর্ম কোন কুকি ব্যবহার করে, কোনগুলোর জন্য সম্মতি লাগে এবং কীভাবে পছন্দ বদলাবেন।",
    },
    sections: [
      s(
        "necessary",
        "Strictly necessary",
        "অপরিহার্য",
        [
          "Session, cart and language cookies. These are set without consent because the store cannot function without them, and they carry no advertising identifier.",
          "Language choice is stored per store, so switching to Bangla in one shop does not change another.",
        ],
        [
          "সেশন, কার্ট ও ভাষার কুকি। এগুলো ছাড়া স্টোর চলে না বলে সম্মতি ছাড়াই সেট হয়, এবং এগুলোতে কোনো বিজ্ঞাপন আইডি থাকে না।",
          "ভাষার পছন্দ প্রতি স্টোরে আলাদা রাখা হয়, তাই এক দোকানে বাংলা করলে অন্যটি বদলায় না।",
        ],
      ),
      s(
        "analytics",
        "Analytics and marketing",
        "অ্যানালিটিক্স ও মার্কেটিং",
        [
          "Analytics and pixel tags load only after the shopper accepts them in the consent banner. Declining leaves the store fully usable.",
          "Merchants choose which tags a storefront may load; the platform blocks anything not declared in site settings.",
        ],
        [
          "কনসেন্ট ব্যানারে ক্রেতা সম্মতি দিলে তবেই অ্যানালিটিক্স ও পিক্সেল ট্যাগ লোড হয়। না দিলেও স্টোর পুরোপুরি ব্যবহারযোগ্য থাকে।",
          "কোন ট্যাগ লোড হবে তা মার্চেন্ট ঠিক করেন; সাইট সেটিংসে ঘোষণা করা নেই এমন কিছু প্ল্যাটফর্ম ব্লক করে।",
        ],
      ),
      s(
        "change",
        "Changing your choice",
        "পছন্দ বদলানো",
        [
          "Reopen the consent chip in the storefront footer to change or withdraw consent. The choice, its text and its version are recorded.",
        ],
        [
          "স্টোরফুটারের কনসেন্ট চিপ খুলে সম্মতি বদলাতে বা তুলে নিতে পারেন। পছন্দ, তার লেখা ও ভার্সন রেকর্ড করা হয়।",
        ],
      ),
    ],
  },
  {
    slug: "acceptable-use",
    version: "2026-08-01",
    effective: "2026-08-01",
    title: { en: "Acceptable Use Policy", bn: "গ্রহণযোগ্য ব্যবহার নীতি" },
    summary: {
      en: "What may not be sold or done on the platform, and what happens when a rule is broken.",
      bn: "প্ল্যাটফর্মে কী বিক্রি বা করা যাবে না, এবং নিয়ম ভাঙলে কী হয়।",
    },
    sections: [
      s(
        "prohibited",
        "Prohibited goods and conduct",
        "নিষিদ্ধ পণ্য ও আচরণ",
        [
          "No goods that are illegal in Bangladesh, no counterfeit brands, no prescription medicine without a licence, no weapons, no sexual content involving minors, no wildlife products.",
          "No deceptive pricing, fake reviews, or discounts that were never available at the crossed-out price.",
        ],
        [
          "বাংলাদেশে অবৈধ কোনো পণ্য নয়, নকল ব্র্যান্ড নয়, লাইসেন্স ছাড়া প্রেসক্রিপশন ওষুধ নয়, অস্ত্র নয়, শিশুসংক্রান্ত যৌন কনটেন্ট নয়, বন্যপ্রাণীজাত পণ্য নয়।",
          "বিভ্রান্তিকর দাম, ভুয়া রিভিউ, বা কেটে দেখানো দামে কখনো বিক্রি হয়নি এমন ছাড় দেওয়া যাবে না।",
        ],
      ),
      s(
        "platform",
        "Platform integrity",
        "প্ল্যাটফর্মের সুরক্ষা",
        [
          "No scraping other merchants' stores, no attempts to reach data outside your own tenant, no load testing without written agreement, no bulk email to addresses that did not opt in.",
          "API keys are per merchant. Sharing one outside your business is a breach and is logged.",
        ],
        [
          "অন্য মার্চেন্টের স্টোর স্ক্র্যাপ করা, নিজের টেন্যান্টের বাইরের ডেটায় পৌঁছানোর চেষ্টা, লিখিত সম্মতি ছাড়া লোড টেস্ট, বা সম্মতি না নেওয়া ঠিকানায় গণ-ইমেইল করা যাবে না।",
          "API কী প্রতি মার্চেন্টের নিজস্ব। ব্যবসার বাইরে তা শেয়ার করা নিয়ম ভঙ্গ এবং তা লগ করা হয়।",
        ],
      ),
      s(
        "enforcement",
        "How we enforce",
        "কীভাবে প্রয়োগ হয়",
        [
          "First we write to you with the specific finding and a deadline. Serious cases — fraud, illegal goods, active abuse — suspend the store immediately and we tell you why.",
          "You can appeal in the same ticket thread; an appeal is reviewed by someone who did not make the original decision.",
        ],
        [
          "প্রথমে নির্দিষ্ট অভিযোগ ও সময়সীমা জানিয়ে আমরা লিখি। গুরুতর ক্ষেত্রে — প্রতারণা, অবৈধ পণ্য, চলমান অপব্যবহার — স্টোর সঙ্গে সঙ্গে বন্ধ করা হয় এবং কারণ জানানো হয়।",
          "একই টিকিট থ্রেডে আপিল করা যায়; আপিল দেখেন এমন কেউ যিনি প্রথম সিদ্ধান্তে ছিলেন না।",
        ],
      ),
    ],
  },
];

export const LEGAL_SLUGS = LEGAL_DOCS.map((d) => d.slug);

export function legalDoc(slug: string): LegalDoc | null {
  return LEGAL_DOCS.find((d) => d.slug === slug) ?? null;
}

/** Newest effective date across all documents — shown in the footer. */
export function legalLastUpdated(): string {
  return LEGAL_DOCS.map((d) => d.effective).sort().at(-1) as string;
}
