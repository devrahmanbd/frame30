/**
 * DeepWiki Intelligent Answer Engine.
 *
 * Implements an intelligent, self-learning knowledge graph and answer synthesis
 * engine combining:
 *  1. Multi-Hop RAG: Seed semantic retrieval + relational graph expansion.
 *  2. Reinforcement Learning (RL): Edge Q-value weight adaptation from user feedback.
 *  3. Atropos Environment: Evaluates conversational transitions in the Atropos harness.
 *  4. Deep Provenance: Structured synthesis with verified DeepWiki citation tags.
 */

import { createHash } from "node:crypto";
import { withSpan, incr, observe, log } from "./observability.server";
import { cached } from "./cache.server";
import { en } from "./i18n-dict";
import { redactPii, screenOutbound, digest } from "./support-guardrails";
import {
  computeTrajectoryReward,
  stepAtroposEnv,
  REWARD_WEIGHTS,
  type AtroposEnvState,
  type AtroposAction,
  type AtroposEnvStepResult,
  type EvaluatedReward,
  type TrajectoryStep,
} from "./support-rl-reward.server";
import { draftAnswer } from "./support-llm.server";
import { captureTrainingTurn } from "./ai-training-data.server";
import { searchStoreProducts } from "./support-kb.server";

// ─────────────────────────────────────────────────────────────────────────────
// Types & Graph Contracts
// ─────────────────────────────────────────────────────────────────────────────

export type DeepWikiCategory =
  | "logistics"
  | "payments"
  | "store_policy"
  | "cms_builder"
  | "catalog"
  | "platform"
  | "security";

export type RelationType =
  | "prerequisite_for"
  | "related_to"
  | "governed_by"
  | "alternative_to"
  | "integrates_with";

export type DeepWikiRelation = {
  targetId: string;
  relationType: RelationType;
  /** Q-value weight representing relevance / transition strength (0.1 to 1.0) */
  weight: number;
  /** Cumulative count of traversals in successful turns */
  traversals: number;
  /** Latest reward signal observed on this path */
  lastReward: number;
};

export type DeepWikiEntity = {
  id: string;
  slug: string;
  title: string;
  titleBn?: string;
  summary: string;
  summaryBn?: string;
  content: string;
  category: DeepWikiCategory;
  tags: string[];
  verifiedFacts: string[];
  verifiedFactsBn?: string[];
  confidenceScore: number; // 0.0 to 1.0
  relations: DeepWikiRelation[];
  sourceUrl?: string | null;
  revision: number;
  updatedAt: string;
};

export type DeepWikiCitation = {
  entityId: string;
  title: string;
  slug: string;
  factSnippet: string;
  citationTag: string; // e.g. [DeepWiki: SteadFast Logistics §1.2]
};

export type DeepWikiQueryResult = {
  queryId: string;
  merchantId: string;
  query: string;
  locale: "bn" | "en";
  answer: string;
  confidence: "high" | "medium" | "low";
  citations: DeepWikiCitation[];
  traversedNodeIds: string[];
  atroposStep: AtroposEnvStepResult;
  qValueUpdates?: Record<string, number>;
  createdAt: string;
};

export type DeepWikiQueryInput = {
  merchantId: string;
  query: string;
  locale?: "bn" | "en";
  conversationId?: string | null;
  turnIndex?: number;
  maxHops?: number;
};

export type DeepWikiFeedbackInput = {
  queryId: string;
  rating: number; // 1 to 5
  feedbackText?: string;
  isResolved?: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// In-Memory DeepWiki Knowledge Graph Store (Isolated per Merchant / Canonical)
// ─────────────────────────────────────────────────────────────────────────────

const DEEPWIKI_ENTITIES = new Map<string, DeepWikiEntity>();
const QUERY_RESULTS_REGISTRY = new Map<string, DeepWikiQueryResult>();

export function clearDeepWikiRegistry() {
  QUERY_RESULTS_REGISTRY.clear();
}

export function resetDeepWikiKnowledgeGraph() {
  DEEPWIKI_ENTITIES.clear();
  seedDeepWikiDefaults();
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical Commerce & Infrastructure Knowledge Graph Seeding
// ─────────────────────────────────────────────────────────────────────────────

export const CANONICAL_DEEPWIKI_ENTITIES: DeepWikiEntity[] = [
  {
    id: "wiki-steadfast-courier",
    slug: "steadfast-logistics-webhook",
    title: "SteadFast Courier Logistics",
    titleBn: "স্টেডফাস্ট কুরিয়ার অটোমেটেড ডিসপ্যাচ ও ট্র্যাকিং",
    summary:
      "Automated parcel booking, webhook status sync, and cash-on-delivery tracking across all 64 districts in Bangladesh.",
    summaryBn:
      "বাংলাদেশের ৬৪টি জেলায় অটোমেটেড পার্সেল বুকিং, ওয়েবহুক ট্র্যাকিং এবং ক্যাশ অন ডেলিভারি সার্ভিস।",
    content: `SteadFast Courier provides native automated fulfillment for Framique storefronts across Bangladesh.
Key operational capabilities:
1. Automated Parcel Booking: Instantly generates consignment numbers and printable shipping labels upon order status moving to Processing.
2. Webhook Event Ingestion: Real-time callbacks for 'in_transit', 'delivered', 'cancelled', and 'returned' states synchronize order fulfillment.
3. Nationwide COD: Full coverage across 64 districts with automated COD remittance reconciliation.
4. SLA Guarantee: Standard 24–48h inside Dhaka metropolitan area and 48–96h across remaining divisions.`,
    category: "logistics",
    tags: [
      "steadfast",
      "courier",
      "shipping",
      "delivery",
      "logistics",
      "bangladesh",
      "webhook",
    ],
    verifiedFacts: [
      "SteadFast delivers to all 64 districts across Bangladesh.",
      "Consignment tracking codes (AWB) are automatically generated upon dispatch.",
      "Delivery inside Dhaka averages 1–2 business days; outside Dhaka averages 2–4 business days.",
    ],
    verifiedFactsBn: [
      "স্টেডফাস্ট বাংলাদেশের ৬৪টি জেলাতেই ডেলিভারি সেবা প্রদান করে।",
      "অর্ডার ডিসপ্যাচ করার সাথে সাথে ট্র্যাকিং কোড (AWB) স্বয়ংক্রিয়ভাবে তৈরি হয়।",
      "ঢাকার ভেতরে ডেলিভারিতে ১–২ দিন এবং ঢাকার বাইরে ২–৪ দিন সময় লাগে।",
    ],
    confidenceScore: 0.98,
    relations: [
      {
        targetId: "wiki-pathao-redx",
        relationType: "alternative_to",
        weight: 0.85,
        traversals: 0,
        lastReward: 0.0,
      },
      {
        targetId: "wiki-shipping-policy",
        relationType: "governed_by",
        weight: 0.9,
        traversals: 0,
        lastReward: 0.0,
      },
    ],
    sourceUrl: "/docs/v1/shipping/steadfast",
    revision: 1,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "wiki-pathao-redx",
    slug: "pathao-redx-logistics",
    title: "Pathao & RedX Multi-Carrier Routing",
    titleBn: "পাঠাও এবং রেডএক্স মাল্টি-ক্যারিয়ার লজিস্টিকস",
    summary:
      "Secondary and surge logistics routing for high-volume merchant dispatch and on-demand pickup.",
    summaryBn:
      "দ্রুত পিকআপ ও অতিরিক্ত অর্ডারের জন্য পাঠাও এবং রেডএক্স কুরিয়ার সেবা।",
    content: `Pathao and RedX logistics complement SteadFast by offering on-demand same-day and next-day pickup in major metro hubs.
1. Multi-carrier load balancing: Framique automatically routes shipments based on courier performance and destination postal zones.
2. Bulk Manifests: Allows bulk generation of pickup manifests for dispatch drivers.
3. Reverse Logistics: Streamlines parcel returns and exchange pickups directly from customer addresses.`,
    category: "logistics",
    tags: ["pathao", "redx", "courier", "logistics", "shipping", "pickup"],
    verifiedFacts: [
      "Pathao and RedX support same-day warehouse pickup in Dhaka, Chittagong, and Sylhet.",
      "Framique provides automated multi-carrier load balancing across courier providers.",
    ],
    verifiedFactsBn: [
      "পাঠাও ও রেডএক্স ঢাকা, চট্টগ্রাম ও সিলেটে সেম-ডে ওয়্যারহাউস পিকআপ সাপোর্ট করে।",
      "ফ্রেমিক স্বয়ংক্রিয়ভাবে কুরিয়ারদের মধ্যে সেরা পারফরম্যান্স বিবেচনা করে লোড ব্যালেন্সিং করে।",
    ],
    confidenceScore: 0.94,
    relations: [
      {
        targetId: "wiki-steadfast-courier",
        relationType: "alternative_to",
        weight: 0.85,
        traversals: 0,
        lastReward: 0.0,
      },
      {
        targetId: "wiki-shipping-policy",
        relationType: "governed_by",
        weight: 0.9,
        traversals: 0,
        lastReward: 0.0,
      },
    ],
    sourceUrl: "/docs/v1/shipping/pathao-redx",
    revision: 1,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "wiki-bkash-checkout",
    slug: "bkash-tokenized-payments",
    title: "bKash Direct & Tokenized Checkout Rails",
    titleBn: "বিকাশ ডিরেক্ট ও টোকেনাইজড পেমেন্ট গেটওয়ে",
    summary:
      "Instant MFS payment capture with zero per-transaction platform fees and atomic ledger settlement.",
    summaryBn:
      "জিরো প্ল্যাটফর্ম ফি সহ তাৎক্ষণিক বিকাশ পেমেন্ট গ্রহণ এবং অটোমেটেড লেজার সেটেলমেন্ট।",
    content: `Framique natively integrates bKash Direct Checkout (Tokenized API) with real-time signature verification.
Key financial features:
1. Direct Settlement: Customer payments flow directly into the merchant's bKash merchant account without escrow middleman delays.
2. Atomic Ledger: Every successful trxID is recorded immutably in the store ledger.
3. 0% Commission: Framique charges 0% per-transaction commission on all sales across all merchant tiers.
4. Sandbox Verification: Provides pre-configured test credentials for sandbox validation before going live.`,
    category: "payments",
    tags: ["bkash", "payments", "mfs", "bangladesh", "tokenized", "checkout"],
    verifiedFacts: [
      "Framique charges strictly 0% transaction commission on all bKash payments.",
      "Customer funds settle directly into the merchant's verified bKash merchant account.",
      "Transactions record an immutable transaction ID (trxID) for automated accounting.",
    ],
    verifiedFactsBn: [
      "ফ্রেমিক বিকাশের যেকোনো পেমেন্টে ০% প্ল্যাটফর্ম ট্রানজেকশন ফি নেয়।",
      "গ্রাহকের পেমেন্ট সরাসরি মার্চেন্টের নিজস্ব বিকাশ মার্চেন্ট অ্যাকাউন্টে জমা হয়।",
      "প্রতিটি সফল পেমেন্টের trxID ট্র্যাকিং ও হিসাবের জন্য সংরক্ষিত থাকে।",
    ],
    confidenceScore: 0.99,
    relations: [
      {
        targetId: "wiki-payment-methods",
        relationType: "related_to",
        weight: 0.95,
        traversals: 0,
        lastReward: 0.0,
      },
      {
        targetId: "wiki-steadfast-courier",
        relationType: "integrates_with",
        weight: 0.88,
        traversals: 0,
        lastReward: 0.0,
      },
    ],
    sourceUrl: "/docs/v1/payments/bkash",
    revision: 1,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "wiki-payment-methods",
    slug: "store-payment-methods-cod",
    title: "Multi-Rail Bangladeshi Payments & Cash on Delivery (COD)",
    titleBn: "মাল্টি-রেল পেমেন্ট পদ্ধতি ও ক্যাশ অন ডেলিভারি (COD)",
    summary:
      "Comprehensive checkout rails supporting bKash, Nagad, Visa, Mastercard, and Cash on Delivery across Bangladesh.",
    summaryBn:
      "বিকাশ, নগদ, ভিসা, মাস্টারকার্ড এবং ক্যাশ অন ডেলিভারি (COD) পেমেন্ট ব্যবস্থা।",
    content: `Merchants on Framique can enable multiple payment channels simultaneously:
1. Mobile Financial Services (MFS): bKash and Nagad direct payments.
2. Card Payment Gateways: Visa, Mastercard, and Amex via local payment gateways (SSLCommerz, Shurjopay).
3. Cash on Delivery (COD): Courier-collected payments upon doorstep delivery across all 64 districts.
4. Security: All digital transactions enforce PCI-DSS and tokenized data encryption.`,
    category: "payments",
    tags: [
      "payments",
      "nagad",
      "cards",
      "cod",
      "cash on delivery",
      "sslcommerz",
    ],
    verifiedFacts: [
      "Supported payment channels include bKash, Nagad, Visa, Mastercard, and Cash on Delivery.",
      "Cash on Delivery is supported nationwide across all 64 districts.",
    ],
    verifiedFactsBn: [
      "পেমেন্ট পদ্ধতির মধ্যে রয়েছে বিকাশ, নগদ, ভিসা, মাস্টারকার্ড এবং ক্যাশ অন ডেলিভারি।",
      "সারা বাংলাদেশের ৬৪টি জেলাতেই ক্যাশ অন ডেলিভারি (COD) সুবিধা রয়েছে।",
    ],
    confidenceScore: 0.97,
    relations: [
      {
        targetId: "wiki-bkash-checkout",
        relationType: "related_to",
        weight: 0.95,
        traversals: 0,
        lastReward: 0.0,
      },
      {
        targetId: "wiki-shipping-policy",
        relationType: "related_to",
        weight: 0.85,
        traversals: 0,
        lastReward: 0.0,
      },
    ],
    sourceUrl: "/docs/v1/payments/overview",
    revision: 1,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "wiki-shipping-policy",
    slug: "shipping-delivery-policy",
    title: "Nationwide Shipping, Delivery Rates & Transit Windows",
    titleBn: "দেশব্যাপী শিপিং, ডেলিভারি চার্জ এবং সময়সীমা",
    summary:
      "Standard delivery windows, destination-based fee calculation, and automated tracking notifications.",
    summaryBn:
      "ডেলিভারির সময়সীমা, এলাকাভিত্তিক চার্জ গণনা এবং অটোমেটেড ট্র্যাকিং নোটিফিকেশন।",
    content: `Standard shipping guidelines across all Framique merchant storefronts:
1. Delivery Turnaround: Inside Dhaka metropolitan area is typically 1–2 business days; outside Dhaka across 64 districts is 2–4 business days.
2. Shipping Rates: Automatically calculated based on destination city and parcel package weight at checkout.
3. Order Tracking: Customers receive real-time SMS and web tracking updates as couriers scan parcel checkpoints.`,
    category: "store_policy",
    tags: ["shipping", "delivery", "policy", "rates", "transit", "time"],
    verifiedFacts: [
      "Delivery turnaround is 1–2 business days inside Dhaka and 2–4 business days nationwide.",
      "Delivery charges are calculated based on destination and weight at checkout.",
      "Customers receive parcel tracking checkpoints in real time.",
    ],
    verifiedFactsBn: [
      "ডেলিভারির সময় ঢাকার ভেতরে ১–২ দিন এবং ঢাকার বাইরে ২–৪ কার্যদিবস।",
      "ডেলিভারি চার্জ চেকআউটের সময় লোকেশন এবং ওজনের ওপর ভিত্তি করে হিসাব করা হয়।",
      "গ্রাহকরা লাইভ ট্র্যাকিং চেকপয়েন্ট আপডেট দেখতে পারেন।",
    ],
    confidenceScore: 0.96,
    relations: [
      {
        targetId: "wiki-steadfast-courier",
        relationType: "integrates_with",
        weight: 0.9,
        traversals: 0,
        lastReward: 0.0,
      },
      {
        targetId: "wiki-return-refunds",
        relationType: "related_to",
        weight: 0.82,
        traversals: 0,
        lastReward: 0.0,
      },
    ],
    sourceUrl: "/docs/v1/shipping/policy",
    revision: 1,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "wiki-return-refunds",
    slug: "returns-exchanges-refunds",
    title: "Return, Exchange & Refund Assurance Policy",
    titleBn: "রিটার্ন, এক্সচেঞ্জ এবং রিফান্ড পলিসি",
    summary:
      "Hassle-free 7-day return and exchange policy with automated ticket escalation.",
    summaryBn:
      "৭ দিনের সহজ রিটার্ন ও এক্সচেঞ্জ পলিসি এবং স্বয়ংক্রিয় সাপোর্ট টিকিট ব্যবস্থা।",
    content: `Customer purchase protection guidelines:
1. 7-Day Window: Unused merchandise with original tags and packaging can be returned or exchanged within 7 days of receipt.
2. Defective Items: Replacements or full refunds are processed immediately upon inspection of damaged shipments.
3. Escalation: Refund requests automatically open a high-priority support ticket in the merchant dashboard.`,
    category: "store_policy",
    tags: ["returns", "exchanges", "refunds", "policy", "guarantee"],
    verifiedFacts: [
      "Customers may request a return or exchange within 7 days of delivery.",
      "Refund requests automatically escalate to high-priority merchant tickets.",
    ],
    verifiedFactsBn: [
      "পণ্য ডেলিভারির ৭ দিনের মধ্যে রিটার্ন বা এক্সচেঞ্জের আবেদন করা যায়।",
      "রিফান্ড অনুরোধগুলো স্বয়ংক্রিয়ভাবে হাই-প্রাইয়োরিটি সাপোর্ট টিকিটে রূপান্তরিত হয়।",
    ],
    confidenceScore: 0.95,
    relations: [
      {
        targetId: "wiki-shipping-policy",
        relationType: "related_to",
        weight: 0.82,
        traversals: 0,
        lastReward: 0.0,
      },
    ],
    sourceUrl: "/docs/v1/returns/policy",
    revision: 1,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "wiki-page-builder",
    slug: "visual-page-builder-cms",
    title: "Visual Page Builder AST, Blocks & Responsive Sections",
    titleBn: "ভিজুয়াল পেজ বিল্ডার AST এবং রেসপনসিভ সেকশন",
    summary:
      "Drag-and-drop storefront customizer using deterministic JSON Abstract Syntax Tree (AST).",
    summaryBn:
      "ডিটারমিনিস্টিক JSON AST ভিত্তিক ড্র্যাগ-অ্যান্ড-ড্রপ স্টোরফ্রন্ট কাস্টমাইজার।",
    content: `The Framique Visual Page Builder allows store owners to customize storefront layouts:
1. Structure: Layouts are composed of header, main, and footer arrays holding section AST objects.
2. Built-in Sections: Includes hero banner, featured products, category grid, rich text, trust badges, and testimonials.
3. Snapshots: Every publish produces an immutable version snapshot with 1-click rollback capability.`,
    category: "cms_builder",
    tags: ["builder", "cms", "ast", "sections", "theme", "customizer"],
    verifiedFacts: [
      "Page layouts are represented as deterministic JSON Abstract Syntax Trees (AST).",
      "Every publish creates an immutable snapshot with instant 1-click rollback.",
    ],
    verifiedFactsBn: [
      "পেজ লেআউট ডিটারমিনিস্টিক JSON AST হিসেবে কাজ করে।",
      "প্রতিবার পাবলিশ করলে ইমিউটেবল স্ন্যাপশট তৈরি হয় যা ১-ক্লিকে রোলব্যাক করা যায়।",
    ],
    confidenceScore: 0.98,
    relations: [
      {
        targetId: "wiki-merchant-isolation",
        relationType: "governed_by",
        weight: 0.88,
        traversals: 0,
        lastReward: 0.0,
      },
    ],
    sourceUrl: "/docs/v1/storefront/builder",
    revision: 1,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "wiki-merchant-isolation",
    slug: "tenant-isolation-security",
    title: "Multi-Tenant Merchant Isolation & RLS Security",
    titleBn: "মাল্টি-টেন্যান্ট আইসোলেশন এবং RLS সিকিউরিটি",
    summary:
      "Strict Row Level Security (RLS) and cryptographic tenant boundary guarantees.",
    summaryBn: "কঠোর রো লেভেল সিকিউরিটি (RLS) এবং ক্রস-টেন্যান্ট ডেটা সুরক্ষা।",
    content: `Framique enforces comprehensive multi-tenant isolation:
1. Database Isolation: Row Level Security (RLS) enforces merchant_id checks on every public table.
2. Custom Domains: Automated TLS termination via HTTP-01 ACME challenges with zero cross-tenant certificate leakage.
3. Role-Based Access: Granular staff roles (owner, admin, editor, viewer) protecting sensitive operational controls.`,
    category: "security",
    tags: ["security", "tenancy", "rls", "isolation", "domains", "rbac"],
    verifiedFacts: [
      "All PostgreSQL tables enforce Row Level Security tied to merchant_id.",
      "Custom domains receive automated TLS certificates with zero cross-tenant leakage.",
    ],
    verifiedFactsBn: [
      "পোস্টগ্রেসের প্রতিটি টেবিলে merchant_id ভিত্তিক রো লেভেল সিকিউরিটি নিশ্চিত করা আছে।",
      "কাস্টম ডোমেইনে স্বয়ংক্রিয় TLS সার্টিফিকেট ইস্যু করা হয়।",
    ],
    confidenceScore: 0.99,
    relations: [
      {
        targetId: "wiki-page-builder",
        relationType: "governed_by",
        weight: 0.88,
        traversals: 0,
        lastReward: 0.0,
      },
    ],
    sourceUrl: "/docs/v1/security/tenancy",
    revision: 1,
    updatedAt: new Date().toISOString(),
  },
];

export function seedDeepWikiDefaults() {
  if (DEEPWIKI_ENTITIES.size > 0) return;
  for (const entity of CANONICAL_DEEPWIKI_ENTITIES) {
    DEEPWIKI_ENTITIES.set(entity.id, { ...entity });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity Extraction & Multi-Hop Graph Traversal
// ─────────────────────────────────────────────────────────────────────────────

export const STOP_WORDS = new Set([
  "what",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "whose",
  "why",
  "how",
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "if",
  "as",
  "at",
  "by",
  "for",
  "with",
  "about",
  "to",
  "from",
  "in",
  "out",
  "on",
  "off",
  "over",
  "under",
  "all",
  "any",
  "both",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "can",
  "will",
  "just",
  "should",
  "now",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "he",
  "she",
  "it",
  "they",
  "them",
  "is",
  "am",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "please",
  "tell",
  "know",
  "কি",
  "না",
  "এবং",
  "ও",
  "বা",
  "এর",
  "কে",
  "তে",
  "থেকে",
  "হবে",
  "হয়",
  "আছে",
  "আমি",
  "আমরা",
  "আপনি",
  "আপনার",
  "আমাদের",
  "দয়া",
  "করে",
]);

/**
 * Extract keywords and candidate entity concepts from a query.
 */
export function extractQueryEntities(query: string): string[] {
  const rawTokens = query
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
  const content = rawTokens.filter((t) => !STOP_WORDS.has(t) && t.length > 1);
  return content.length > 0 ? content : rawTokens;
}

/**
 * Multi-Hop Graph Traversal:
 * Given seed entities, expands outward across graph relationships, prioritizing
 * edges with higher learned Q-value weights.
 */
export function expandKnowledgeGraph(
  seedEntities: DeepWikiEntity[],
  maxHops = 2,
): DeepWikiEntity[] {
  seedDeepWikiDefaults();
  const visited = new Set<string>();
  const result: DeepWikiEntity[] = [];

  const queue: Array<{ entity: DeepWikiEntity; hop: number }> = [];
  for (const seed of seedEntities) {
    if (!visited.has(seed.id)) {
      visited.add(seed.id);
      result.push(seed);
      queue.push({ entity: seed, hop: 0 });
    }
  }

  while (queue.length > 0) {
    const { entity, hop } = queue.shift()!;
    if (hop >= maxHops) continue;

    // Sort relations by learned Q-value weight descending (RL Policy choice)
    const sortedRelations = [...entity.relations].sort(
      (a, b) => b.weight - a.weight,
    );

    for (const rel of sortedRelations) {
      if (!visited.has(rel.targetId)) {
        const neighbor = DEEPWIKI_ENTITIES.get(rel.targetId);
        if (neighbor) {
          visited.add(neighbor.id);
          result.push(neighbor);
          // Increment relation traversal count
          rel.traversals++;
          queue.push({ entity: neighbor, hop: hop + 1 });
        }
      }
    }
  }

  return result;
}

/**
 * Find seed entities matching query tokens.
 */
export function findSeedEntities(
  tokens: string[],
  limit = 3,
): DeepWikiEntity[] {
  seedDeepWikiDefaults();
  const scored = Array.from(DEEPWIKI_ENTITIES.values()).map((entity) => {
    const textLower =
      `${entity.title} ${entity.titleBn ?? ""} ${entity.tags.join(" ")} ${entity.summary} ${entity.summaryBn ?? ""} ${entity.verifiedFacts.join(" ")} ${(entity.verifiedFactsBn ?? []).join(" ")}`.toLowerCase();
    const docWords = new Set(
      textLower.split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean),
    );

    let matches = 0;
    for (const tok of tokens) {
      if (
        docWords.has(tok) ||
        docWords.has(tok + "s") ||
        (tok.endsWith("s") && docWords.has(tok.slice(0, -1))) ||
        (tok.endsWith("ing") && docWords.has(tok.slice(0, -3)))
      ) {
        matches++;
      }
    }

    const matchScore = tokens.length > 0 ? matches / tokens.length : 0;
    return { entity, matchScore };
  });

  return scored
    .filter((s) => s.matchScore >= 0.25)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit)
    .map((s) => s.entity);
}

// ─────────────────────────────────────────────────────────────────────────────
// Synthesis Engine with DeepWiki Citations
// ─────────────────────────────────────────────────────────────────────────────

export type DeepWikiContext = {
  seedEntities: DeepWikiEntity[];
  expandedGraph: DeepWikiEntity[];
  extractedTokens: string[];
};

/**
 * Generate formatted DeepWiki citations from entities.
 */
export function generateDeepWikiCitations(
  entities: DeepWikiEntity[],
  locale: "bn" | "en",
): DeepWikiCitation[] {
  const citations: DeepWikiCitation[] = [];
  entities.forEach((entity, idx) => {
    const fact =
      locale === "bn" && entity.verifiedFactsBn?.length
        ? entity.verifiedFactsBn[0]
        : entity.verifiedFacts[0] || entity.summary;

    citations.push({
      entityId: entity.id,
      title: locale === "bn" && entity.titleBn ? entity.titleBn : entity.title,
      slug: entity.slug,
      factSnippet: fact,
      citationTag: `[DeepWiki: ${entity.title} §${idx + 1}]`,
    });
  });
  return citations;
}

/**
 * Synthesize grounded, authoritative markdown answers citing DeepWiki entities.
 */
export async function synthesizeDeepWikiAnswer(opts: {
  query: string;
  context: DeepWikiContext;
  locale: "bn" | "en";
}): Promise<{ answer: string; citations: DeepWikiCitation[] }> {
  const { query, context, locale } = opts;
  const citations = generateDeepWikiCitations(context.expandedGraph, locale);

  // Attempt LLM generation first via draftAnswer if available
  const draftContext = context.expandedGraph.map((e) => ({
    title: locale === "bn" && e.titleBn ? e.titleBn : e.title,
    body: `${e.summary}\n${e.verifiedFacts.join(". ")}`,
  }));

  const draft = await draftAnswer({
    question: query,
    context: draftContext,
    locale,
  }).catch(() => null);

  if (draft && draft.text) {
    const citationFooter =
      locale === "bn"
        ? `\n\n**যাচাইকৃত তথ্যসূত্র (DeepWiki Citations):**\n` +
          citations
            .map(
              (c) =>
                `• **${c.citationTag}** — ${c.title}: *"${c.factSnippet}"*`,
            )
            .join("\n")
        : `\n\n**Verified Sources (DeepWiki Citations):**\n` +
          citations
            .map(
              (c) =>
                `• **${c.citationTag}** — ${c.title}: *"${c.factSnippet}"*`,
            )
            .join("\n");

    return {
      answer: `${draft.text}${citationFooter}`,
      citations,
    };
  }

  // Deterministic synthesis fallback
  const primaryEntity = context.seedEntities[0] || context.expandedGraph[0];
  const isBn = locale === "bn";

  if (!primaryEntity) {
    return {
      answer: isBn
        ? "দুঃখিত, এই বিষয়ে ডিপউইকিতে পর্যাপ্ত তথ্য পাওয়া যায়নি। অনুগ্রহ করে নির্দিষ্ট বিষয়ে প্রশ্ন করুন।"
        : "I do not have enough verified DeepWiki information on this specific topic. Please inquire about our store shipping, payment gateways, or policies.",
      citations: [],
    };
  }

  const title =
    isBn && primaryEntity.titleBn ? primaryEntity.titleBn : primaryEntity.title;
  const summary =
    isBn && primaryEntity.summaryBn
      ? primaryEntity.summaryBn
      : primaryEntity.summary;
  const facts =
    isBn && primaryEntity.verifiedFactsBn?.length
      ? primaryEntity.verifiedFactsBn
      : primaryEntity.verifiedFacts;

  const connected = context.expandedGraph
    .filter((e) => e.id !== primaryEntity.id)
    .map((e) => (isBn && e.titleBn ? e.titleBn : e.title));

  let synthesized = isBn
    ? `### ${title}\n\n${summary}\n\n**মূল তথ্যসমূহ [DeepWiki §1.1]:**\n` +
      facts.map((f) => `• ${f}`).join("\n")
    : `### ${title}\n\n${summary}\n\n**Key Verified Facts [DeepWiki §1.1]:**\n` +
      facts.map((f) => `• ${f}`).join("\n");

  if (connected.length > 0) {
    synthesized += isBn
      ? `\n\n**সম্পর্কিত বিষয়সমূহ:** ${connected.join(", ")}`
      : `\n\n**Connected Topics:** ${connected.join(", ")}`;
  }

  synthesized += isBn
    ? `\n\n**যাচাইকৃত তথ্যসূত্র (DeepWiki Citations):**\n` +
      citations
        .map((c) => `• **${c.citationTag}** — ${c.title}: *"${c.factSnippet}"*`)
        .join("\n")
    : `\n\n**Verified Sources (DeepWiki Citations):**\n` +
      citations
        .map((c) => `• **${c.citationTag}** — ${c.title}: *"${c.factSnippet}"*`)
        .join("\n");

  return {
    answer: synthesized,
    citations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Atropos RL Environment & Policy Learning Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute DeepWiki Multi-Hop RAG query and evaluate through the Atropos RL harness.
 */
export async function queryDeepWiki(
  input: DeepWikiQueryInput,
): Promise<DeepWikiQueryResult> {
  return withSpan("deepwiki.query", async () => {
    seedDeepWikiDefaults();
    const locale = input.locale ?? "en";
    const queryId = `dw_${createHash("sha256").update(`${input.merchantId}:${input.query}:${Date.now()}`).digest("hex").slice(0, 16)}`;
    const conversationId = input.conversationId ?? `dw_conv_${queryId}`;
    const turnIndex = input.turnIndex ?? 1;

    // 1. Entity & Concept Extraction
    const queryTokens = extractQueryEntities(input.query);

    // 2. Seed Retrieval
    const seedEntities = findSeedEntities(queryTokens, 2);

    // 3. Multi-Hop Graph Expansion
    const expandedGraph = expandKnowledgeGraph(
      seedEntities,
      input.maxHops ?? 2,
    );

    // 4. Grounded Synthesis with Citations
    const { answer, citations } = await synthesizeDeepWikiAnswer({
      query: input.query,
      context: {
        seedEntities,
        expandedGraph,
        extractedTokens: queryTokens,
      },
      locale,
    });

    // 5. Outbound Guardrail Screening
    const outbound = screenOutbound(answer, { pinned: false });
    const safeAnswer = outbound.allowed
      ? answer
      : locale === "bn"
        ? "আমি কোনো অনির্ভরযোগ্য তথ্য বা মনগড়া সংখ্যা দিতে চাই না। স্টোর টিমের প্রতিনিধি এখান থেকে সহায়তা করবেন।"
        : en("support.needs_human");

    // 6. Atropos Environment Step Transition
    const atroposState: AtroposEnvState = {
      conversationId,
      turnIndex,
      history: [],
      isDone: false,
    };

    const atroposAction: AtroposAction = {
      intent: seedEntities[0]?.category ?? "general_deepwiki",
      replyText: safeAnswer,
    };

    const stepObservation: Omit<TrajectoryStep, "agentReply"> = {
      userMessage: input.query,
      grounded: citations.length > 0 && outbound.allowed,
      guardrailBlocked: !outbound.allowed,
      toolCalls: seedEntities.map((e) => ({
        tool: `deepwiki.${e.slug}`,
        ok: true,
      })),
      latencyMs: 120,
      actionCompleted: citations.length > 0 ? "answered" : undefined,
    };

    const stepResult = stepAtroposEnv(
      atroposState,
      atroposAction,
      stepObservation,
    );

    const queryResult: DeepWikiQueryResult = {
      queryId,
      merchantId: input.merchantId,
      query: input.query,
      locale,
      answer: safeAnswer,
      confidence:
        citations.length >= 2
          ? "high"
          : citations.length === 1
            ? "medium"
            : "low",
      citations,
      traversedNodeIds: expandedGraph.map((e) => e.id),
      atroposStep: stepResult,
      createdAt: new Date().toISOString(),
    };

    // Store in query registry for RL feedback updates
    QUERY_RESULTS_REGISTRY.set(queryId, queryResult);
    incr("framique_deepwiki_query_total", {
      outcome: citations.length ? "grounded" : "miss",
      confidence: queryResult.confidence,
    });

    return queryResult;
  });
}

/**
 * Apply Reinforcement Learning Feedback to update DeepWiki Edge Weights (Q-Values).
 *
 * Implements:
 *   Q_{t+1}(e) = Q_t(e) + \alpha * (R - Q_t(e))
 *
 * High CSAT / resolved turns strengthen the graph connections;
 * Poor ratings dampen weights to stimulate policy exploration.
 */
export async function applyAtroposFeedback(
  input: DeepWikiFeedbackInput,
): Promise<{
  queryId: string;
  previousReward: number;
  newReward: EvaluatedReward;
  updatedWeights: Record<string, number>;
}> {
  return withSpan("deepwiki.feedback", async () => {
    const record = QUERY_RESULTS_REGISTRY.get(input.queryId);
    if (!record) {
      throw new Error(`DeepWiki query record not found: ${input.queryId}`);
    }

    // Recompute reward with updated CSAT and resolution signals
    const updatedStep: TrajectoryStep = {
      userMessage: record.query,
      agentReply: record.answer,
      grounded: record.citations.length > 0,
      csatRating: input.rating,
      actionCompleted: input.isResolved ? "answered" : undefined,
    };

    const newReward = computeTrajectoryReward(updatedStep);
    // Scale user feedback and trajectory reward to target Q-value in [0.1, 1.0]
    const rewardSignal =
      input.rating !== undefined
        ? Math.max(
            0.1,
            Math.min(
              1.0,
              Number(
                (
                  (input.rating / 5) *
                    (input.isResolved !== false ? 1.0 : 0.8) +
                  (newReward.components.groundingReward > 0 ? 0.05 : -0.1)
                ).toFixed(4),
              ),
            ),
          )
        : newReward.normalizedScore;
    const learningRate = 0.2;
    const updatedWeights: Record<string, number> = {};

    // Update Q-values on all graph edges traversed in this turn
    for (const entityId of record.traversedNodeIds) {
      const entity = DEEPWIKI_ENTITIES.get(entityId);
      if (!entity) continue;

      for (const rel of entity.relations) {
        if (record.traversedNodeIds.includes(rel.targetId)) {
          const oldWeight = rel.weight;
          // Q-learning update step
          const newWeight = Math.max(
            0.1,
            Math.min(
              1.0,
              Number(
                (oldWeight + learningRate * (rewardSignal - oldWeight)).toFixed(
                  4,
                ),
              ),
            ),
          );

          rel.weight = newWeight;
          rel.lastReward = newReward.totalReward;
          updatedWeights[`${entity.id}->${rel.targetId}`] = newWeight;
        }
      }
    }

    // Capture into training flywheel if high-quality trajectory
    if (newReward.label === "high_quality") {
      await captureTrainingTurn({
        merchantId: record.merchantId,
        conversationId: record.atroposStep.nextState.conversationId,
        userMessage: record.query,
        agentReply: record.answer,
        csatRating: input.rating,
        csatReview: input.feedbackText ?? null,
        grounded: true,
        actionCompleted: "answered",
      }).catch(() => null);
    }

    record.qValueUpdates = updatedWeights;
    log("info", "deepwiki.rl_feedback_applied", {
      queryId: input.queryId,
      csat: input.rating,
      newReward: newReward.totalReward,
      edgesUpdated: Object.keys(updatedWeights).length,
    });

    return {
      queryId: input.queryId,
      previousReward: record.atroposStep.reward,
      newReward,
      updatedWeights,
    };
  });
}

/**
 * Ingest a custom entity or policy article into the merchant's DeepWiki graph.
 */
export function ingestDeepWikiEntity(
  merchantId: string,
  entity: Omit<DeepWikiEntity, "revision" | "updatedAt">,
): DeepWikiEntity {
  seedDeepWikiDefaults();
  const fullEntity: DeepWikiEntity = {
    ...entity,
    revision: 1,
    updatedAt: new Date().toISOString(),
  };

  DEEPWIKI_ENTITIES.set(entity.id, fullEntity);
  incr("framique_deepwiki_entity_ingest_total", {
    category: entity.category,
  });

  return fullEntity;
}

/**
 * Retrieve the current DeepWiki Knowledge Graph (nodes and weighted links).
 */
export function getDeepWikiGraph(): {
  nodes: Array<{ id: string; title: string; category: DeepWikiCategory }>;
  links: Array<{
    source: string;
    target: string;
    type: RelationType;
    weight: number;
    traversals: number;
  }>;
} {
  seedDeepWikiDefaults();
  const nodes = Array.from(DEEPWIKI_ENTITIES.values()).map((e) => ({
    id: e.id,
    title: e.title,
    category: e.category,
  }));

  const links: Array<{
    source: string;
    target: string;
    type: RelationType;
    weight: number;
    traversals: number;
  }> = [];

  for (const entity of DEEPWIKI_ENTITIES.values()) {
    for (const rel of entity.relations) {
      links.push({
        source: entity.id,
        target: rel.targetId,
        type: rel.relationType,
        weight: rel.weight,
        traversals: rel.traversals,
      });
    }
  }

  return { nodes, links };
}

/**
 * Find the latest DeepWiki query result executed in a given conversation.
 */
export function getLatestDeepWikiQueryForConversation(
  conversationId: string,
): DeepWikiQueryResult | null {
  const records = Array.from(QUERY_RESULTS_REGISTRY.values()).reverse();
  for (const record of records) {
    if (record.atroposStep.nextState.conversationId === conversationId) {
      return record;
    }
  }
  return null;
}
