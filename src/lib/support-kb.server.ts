/**
 * Knowledge Base Engine: Ingest, Vector Embeddings, Hybrid Semantic Search.
 *
 * Combines full-text search (`tsvector`) with dense vector embeddings
 * (NVIDIA Nemotron Embed `nvidia/nemotron-3-embed-1b:free`; legacy vectors
 * `nvidia/llama-nemotron-embed-vl-1b-v2:free` are honoured until the RAG
 * backfill refreshes them — see backfillKbEmbeddings and
 * supabase/pending/support_kb_embedding_version.sql)
 * using Reciprocal Rank Fusion (RRF).
 *
 * Grounded on Framique Cloud Commerce CMS:
 * 1. Multi-tenant merchant isolation & store setup.
 * 2. Bangladeshi payment rails: bKash, Nagad, SSLCommerz, Shurjopay, COD.
 * 3. Bangladeshi courier integrations: SteadFast, Pathao, RedX, Paperfly.
 * 4. Page Builder AST, themes, sections, global blocks, and custom CSS/JS.
 * 5. Headless APIs, webhooks, SEO schema, and merchant team permissions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cached, invalidate } from "./cache.server";
import { incr, log, observe, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import { chunkDocument, snippet } from "./support-kb";
import {
  cosineSimilarity,
  DEFAULT_EMBEDDING_MODEL,
  DETERMINISTIC_FALLBACK_DIM,
  DETERMINISTIC_FALLBACK_SUFFIX,
  generateDeterministicEmbedding,
  generateEmbedding,
  generateEmbeddingWithMeta,
  isEmbeddingModelStale,
  type EmbeddingResult,
} from "./support-embed.server";

type Client = SupabaseClient<Database>;

export class KbError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "KbError";
  }
}

export type KbHit = {
  doc_id: string;
  title: string;
  body: string;
  rank: number;
  source_url: string | null;
  combined_score?: number;
  text_rank?: number;
  vector_sim?: number;
  /** Producing model of the matched chunk vector (present once the version migration lands). */
  embedding_model?: string | null;
};

export type SaveDocInput = {
  id?: string | null;
  title: string;
  body: string;
  locale: "bn" | "en";
  status: "draft" | "published";
  tags: string[];
  sourceUrl?: string | null;
};

/**
 * In-memory index for local tests and offline fallback.
 */
type InMemoryChunk = {
  doc_id: string;
  merchant_id: string;
  title: string;
  body: string;
  source_url: string | null;
  embedding: number[];
  embedding_model: string;
  embedding_dim: number;
};

/** Model id recorded for locally projected (offline) vectors. */
function deterministicChunkModel(
  attempted: string = DEFAULT_EMBEDDING_MODEL,
): string {
  return `${attempted}${DETERMINISTIC_FALLBACK_SUFFIX}`;
}

const IN_MEMORY_KB_CHUNKS: InMemoryChunk[] = [];

/**
 * Canonical Framique Documentation Articles for Grounding.
 */
export const FRAMIQUE_CANONICAL_KB_DOCS = [
  {
    id: "kb-doc-steadfast-courier",
    title: "SteadFast Courier Webhook & Parcel Booking Integration",
    locale: "en" as const,
    tags: ["courier", "steadfast", "shipping", "webhook", "bangladesh"],
    sourceUrl: "/docs/v1/shipping/steadfast",
    body: `Framique provides native, automated integration with SteadFast Courier for seamless parcel booking and automated status synchronization across all 64 districts in Bangladesh.
To configure SteadFast Courier in Framique:
1. Navigate to Admin Settings -> Shipping -> SteadFast Courier.
2. Enter your SteadFast API Key and Secret Key retrieved from your SteadFast merchant portal.
3. Configure the Webhook Callback URL: Copy the Framique webhook endpoint URL (e.g., https://framique.qubickle.com/api/webhooks/courier/steadfast) and paste it into SteadFast portal settings.
4. When orders transition to 'Processing' or 'Ready to Ship', click 'Book SteadFast Parcel' to generate an AWB tracking code and consignment ID.
5. SteadFast delivers webhook callbacks on status changes ('in_transit', 'delivered', 'cancelled', 'returned') which automatically update order fulfillment status and customer shipment tracking.`,
  },
  {
    id: "kb-doc-bkash-checkout",
    title: "bKash Tokenized Checkout & Direct Payment API Configuration",
    locale: "en" as const,
    tags: ["payments", "bkash", "mfs", "bangladesh", "tokenized"],
    sourceUrl: "/docs/v1/payments/bkash",
    body: `Framique supports both bKash Direct Checkout (Tokenized Payment API) and bKash URL-based payment flow for Bangladeshi merchants.
Configuration Steps:
1. Navigate to Admin -> Payments -> Payment Providers -> bKash.
2. Supply your Merchant App Key, App Secret, Username, and Password provided during your bKash PGW merchant onboarding.
3. For Sandbox testing, toggle 'Sandbox Mode' on. For production, switch to Live mode and ensure your bKash IP whitelist includes Framique's egress gateway IPs.
4. Callbacks: Framique automatically handles payment authorization, token acquisition, executePayment API, and queryPayment verification.
5. Immediate settlement: Successful bKash transactions credit the order ledger atomically with transaction ID (trxID) recorded for auditability.`,
  },
  {
    id: "kb-doc-page-builder-ast",
    title:
      "Framique Page Builder AST, Sections, Global Blocks & Custom Styling",
    locale: "en" as const,
    tags: ["builder", "cms", "ast", "theme", "templates", "custom-css"],
    sourceUrl: "/docs/v1/storefront/builder",
    body: `The Framique Visual Page Builder allows store owners to customize storefront layouts through a deterministic Abstract Syntax Tree (AST).
Architecture & Capabilities:
1. The page layout is represented as a JSON AST containing 'header', 'main', and 'footer' section arrays.
2. Supported Section Types: 'hero_banner', 'featured_products', 'category_grid', 'richtext', 'newsletter', 'custom_html', 'testimonials', and 'marquee'.
3. Global Blocks: Reusable components (e.g. promotional announcement bar or trust badges) can be created once and shared across multiple templates.
4. Custom CSS & Tokens: Merchants can inject scoped CSS variables conforming to Framique Design Tokens without breaking responsive hydration or mobile layouts.
5. Versioning: Every publish generates an immutable snapshot allowing instant rollback to previous versions.`,
  },
  {
    id: "kb-doc-tenant-isolation-rbac",
    title: "Multi-Tenant Merchant Isolation, Custom Domains & Staff RBAC",
    locale: "en" as const,
    tags: ["tenancy", "domains", "rbac", "security", "merchants"],
    sourceUrl: "/docs/v1/security/tenancy",
    body: `Framique operates a strict multi-tenant architecture where every merchant's catalog, customer records, orders, and credentials are completely isolated.
Key Isolation Guarantees:
1. Row Level Security (RLS): All PostgreSQL tables enforce merchant_id checks tied to auth.uid() sessions via the 'has_merchant_role' helper.
2. Staff Roles: Merchants can invite team members with granular roles: 'owner' (full administrative access), 'admin' (store settings & operations), 'editor' (products & content), and 'viewer' (read-only audit).
3. Custom Domains: Merchants can connect custom domains (e.g. store.com.bd) with automated ACME TLS certificate issuance via HTTP-01 challenge verification.
4. Zero Cross-Tenant Leaks: Direct API queries or search requests for another store's private resources are blocked at the REST gateway.`,
  },
  {
    id: "kb-doc-pathao-redx-logistics",
    title: "Pathao & RedX Logistics, Automated Manifests & Real-Time Tracking",
    locale: "en" as const,
    tags: ["courier", "pathao", "redx", "logistics", "shipping", "tracking"],
    sourceUrl: "/docs/v1/shipping/pathao-redx",
    body: `In addition to SteadFast, Framique integrates directly with Pathao Logistics and RedX Courier APIs for automated delivery dispatch across Bangladesh.
Capabilities:
1. Store Location Setup: Configure warehouse pickup address, district, and city zone IDs matching Pathao/RedX geographic taxonomy.
2. Automated Manifest Creation: Select bulk orders to generate courier delivery manifests and printable shipping labels in one click.
3. Real-Time Tracking: The parcel tracking console on the customer dashboard queries delivery event checkpoints in real time.
4. Cash on Delivery (COD) Reconciliation: Automatically reconciles collected COD payments against courier remittance invoices to prevent balance discrepancies.`,
  },
];

/**
 * Standard text-based KB search using cache.
 */
export async function searchKb(
  merchantId: string,
  query: string,
  limit = 4,
): Promise<KbHit[]> {
  const key = `kb:${merchantId}:${query.toLowerCase().slice(0, 120)}`;
  return cached(key, 30, async () => {
    try {
      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin.rpc("support_kb_search", {
        _merchant_id: merchantId,
        _q: query,
        _limit: limit,
      });

      if (error || !data) {
        throw new Error(error?.message || "rpc_failed");
      }

      const hits = ((data ?? []) as unknown as KbHit[]).map((h) => ({
        ...h,
        body: snippet(h.body, query, 320),
      }));
      incr("framique_ai_kb_search_total", {
        outcome: hits.length ? "hit" : "miss",
        mode: "text",
      });
      return hits;
    } catch {
      // In-memory fallback
      return searchInMemoryKb(merchantId, query, undefined, limit);
    }
  });
}

/**
 * Retrieve active published products matching query tokens from the store catalog.
 */
export async function searchStoreProducts(
  merchantId: string,
  query: string,
  limit = 3,
): Promise<KbHit[]> {
  try {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const qTokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);
    if (!qTokens.length) return [];

    const { data: products } = await supabaseAdmin
      .from("products")
      .select(
        "id, title, description, price_minor_int, currency_code, category, status",
      )
      .eq("merchant_id", merchantId)
      .limit(25);

    if (!products || products.length === 0) return [];

    const matched = products
      .map((p) => {
        const text =
          `${p.title} ${p.category ?? ""} ${p.description ?? ""}`.toLowerCase();
        let matches = 0;
        for (const tok of qTokens) {
          if (text.includes(tok)) matches++;
        }
        return { product: p, score: matches / qTokens.length };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return matched.map((m) => {
      const p = m.product;
      const priceFmt = `৳${(p.price_minor_int / 100).toLocaleString()}`;
      return {
        doc_id: `prod_${p.id}`,
        title: `${p.title} (${priceFmt})`,
        body: `${p.title} is available in our store. Price: ${priceFmt}. ${p.description ? p.description + ". " : ""}Category: ${p.category || "General"}. Status: In stock.`,
        rank: 0.95,
        source_url: `/products/${p.id}`,
        combined_score: 0.95,
        text_rank: 0.95,
        vector_sim: 0.9,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Hybrid Semantic Search combining dense vector embeddings and full-text search with RRF.
 */
export async function searchKbHybrid(
  merchantId: string | null,
  query: string,
  limit = 5,
  rrfK = 60,
): Promise<KbHit[]> {
  const started = Date.now();
  const trimmed = query.trim();
  if (!trimmed) return [];

  const key = `kb_hybrid:${merchantId}:${trimmed.toLowerCase().slice(0, 120)}:${limit}`;
  return cached(key, 30, async () => {
    // 1. Generate query embedding
    let queryEmbedding: number[] | null = null;
    try {
      queryEmbedding = await generateEmbedding(trimmed);
    } catch {
      queryEmbedding = generateDeterministicEmbedding(trimmed, 1024);
    }

    // 2. Query Supabase RPC `support_kb_hybrid_search`
    let hits: KbHit[] = [];
    try {
      const { supabaseAdmin } =
        await import("@/integrations/supabase/client.server");
      const { data, error } = await (
        supabaseAdmin as unknown as {
          rpc: (
            fn: string,
            args: Record<string, unknown>,
          ) => Promise<{ data: unknown; error: unknown }>;
        }
      ).rpc("support_kb_hybrid_search", {
        _merchant_id: merchantId,
        _q: trimmed,
        _query_embedding: queryEmbedding,
        _limit: limit,
        _rrf_k: rrfK,
      });

      if (!error && Array.isArray(data) && data.length > 0) {
        hits = (
          data as Array<{
            doc_id: string;
            title: string;
            body: string;
            source_url: string | null;
            combined_score: number;
            text_rank: number;
            vector_sim: number;
            embedding_model?: string | null;
          }>
        ).map((h) => ({
          doc_id: h.doc_id,
          title: h.title,
          body: snippet(h.body, trimmed, 360),
          rank: h.combined_score,
          source_url: h.source_url,
          combined_score: h.combined_score,
          text_rank: h.text_rank,
          vector_sim: h.vector_sim,
          embedding_model: h.embedding_model ?? null,
        }));
      }
    } catch {
      // ignore
    }

    // 3. Resilient in-memory fallback for store FAQs & platform docs
    if (hits.length === 0) {
      hits = searchInMemoryKb(
        merchantId,
        trimmed,
        queryEmbedding ?? undefined,
        limit,
        rrfK,
      );
    }

    // 4. If still 0 hits, check store products catalog
    if (hits.length === 0 && merchantId) {
      hits = await searchStoreProducts(merchantId, trimmed, limit);
    }

    const elapsed = Date.now() - started;
    incr("framique_ai_kb_search_total", {
      outcome: hits.length ? "hit" : "miss",
      mode: "hybrid",
    });
    observe("framique_ai_kb_search_latency_ms", elapsed, { mode: "hybrid" });
    return hits;
  });
}

/**
 * Additional Platform Documentation Articles for Framique Front Pages & Lead Inquiries.
 */
export const PLATFORM_KB_DOCS = [
  {
    id: "kb-doc-platform-overview-trial",
    title:
      "Framique Cloud Commerce Platform Overview, Architecture & 14-Day Free Trial",
    locale: "en" as const,
    tags: ["platform", "overview", "free-trial", "features", "getting-started"],
    sourceUrl: "/about",
    body: `Framique is an all-in-one cloud hosting and e-commerce service provider built for merchants in Bangladesh and worldwide.
Merchants get a complete high-performance storefront hosted on their own custom domain.
Key Platform Features:
1. All-in-One Infrastructure: Managed edge CDN hosting, automated TLS certificates, PostgreSQL databases with Row Level Security, Redis caching, and continuous zero-downtime deployments.
2. 14-Day Free Trial: Merchants can launch and test their storefront for 14 days without entering credit card information.
3. Visual Drag-and-Drop Page Builder: Full customization over sections, product carousels, hero banners, trust badges, and brand aesthetics.
4. Native Bangladeshi Integrations: 1-click connectivity for bKash, Nagad, SSLCommerz, and SteadFast/Pathao/RedX courier dispatch with real-time parcel tracking.
5. Zero Commission Fees: 0% transaction fees on all sales.`,
  },
  {
    id: "kb-doc-platform-pricing-plans",
    title:
      "Framique Subscription Pricing Plans, Zero Commission & Feature Matrix",
    locale: "en" as const,
    tags: [
      "pricing",
      "plans",
      "costs",
      "zero-commission",
      "starter",
      "growth",
      "scale",
    ],
    sourceUrl: "/pricing",
    body: `Framique offers transparent subscription tiers with strictly 0% per-transaction commission fees across all plans:
1. 14-Day Free Trial: Full platform access to build storefronts, upload products, and test integrations with zero risk.
2. Starter Plan: BDT 1,500/month (or BDT 15,000/year). Includes up to 500 products, free SSL certificates, bKash & Nagad checkout, SteadFast courier integration, and standard support.
3. Growth Plan: BDT 3,500/month (or BDT 35,000/year). Includes unlimited products, custom domain connection, Pathao & RedX couriers, bulk label printing, advanced analytics, and priority live chat support.
4. Scale / Enterprise Plan: BDT 8,000/month (or BDT 80,000/year). Multi-staff RBAC, dedicated technical account manager, custom API integrations, high-traffic surge capacity, and 99.99% uptime SLA guarantee.
All plans include free managed hosting, daily backups, DDoS protection, and responsive customer support.`,
  },
  {
    id: "kb-doc-platform-sales-consultation",
    title:
      "Talk to Framique Sales Team, Book a Live Demo & Store Migration Consultation",
    locale: "en" as const,
    tags: ["sales", "demo", "consultation", "callback", "migration", "leads"],
    sourceUrl: "/contact",
    body: `Prospective store owners and enterprise brands can connect directly with the Framique sales and solutions architecture team:
1. Book a Live Demo: Request a personalized walkthrough of the visual page builder, payment gateways, and automated courier fulfillment.
2. Free Store Migration: We assist brands migrating from Shopify, WooCommerce, or custom platforms with catalog imports, customer data migration, and zero-downtime cutover.
3. Schedule a Callback: You can request a callback directly through our AI chat widget by providing your phone number (01XXXXXXXXX) and preferred time window (morning, afternoon, evening).
4. Direct Contact Channels (verified via getVerifiedContact, see src/lib/support-contact.server.ts):
   • Email: sales@framique.com or support@framique.com
   • Office: Dhaka, Bangladesh.`,
  },
];

/**
 * Standard Store Baseline FAQ Documents.
 * Provides answers for store delivery, returns, payments, and hours even before a store owner adds custom articles.
 */
export const STORE_BASE_FAQS = [
  {
    id: "kb-store-shipping",
    title:
      "Shipping, Courier & Delivery Charges across Bangladesh (ডেলিভারি ও কুরিয়ার চার্জ)",
    tags: [
      "shipping",
      "delivery",
      "charge",
      "charges",
      "courier",
      "steadfast",
      "pathao",
      "bangladesh",
      "dhaka",
      "ডেলিভারি",
      "চার্জ",
      "কুরিয়ার",
    ],
    sourceUrl: "/shipping",
    body: "We deliver across all 64 districts in Bangladesh using SteadFast Courier and Pathao Logistics. Delivery inside Dhaka typically takes 1–2 business days. Delivery outside Dhaka across Bangladesh takes 2–4 business days. Delivery charges are calculated based on destination and package weight, and clearly displayed during checkout. Cash on Delivery (COD) is available across Bangladesh. ঢাকার ভেতরে সাধারণত ১–২ দিন, ঢাকার বাইরে ২–৪ দিন সময় লাগে।",
  },
  {
    id: "kb-store-payments",
    title:
      "Payment Methods: bKash, Nagad, Cards & Cash on Delivery (বিকাশ ও পেমেন্ট পদ্ধতি)",
    tags: [
      "payment",
      "payments",
      "pay",
      "bkash",
      "nagad",
      "cod",
      "cash on delivery",
      "cards",
      "sslcommerz",
      "বিকাশ",
      "নগদ",
      "পেমেন্ট",
    ],
    sourceUrl: "/payments",
    body: "We accept bKash direct online payments, Nagad, Visa and Mastercard debit and credit cards, and Cash on Delivery (COD). All transactions are encrypted and processed securely. আমরা বিকাশ, নগদ, ভিসা, মাস্টারকার্ড এবং ক্যাশ অন ডেলিভারি সাপোর্ট করি।",
  },
  {
    id: "kb-store-refunds",
    title: "Return, Replacement & Refund Policy (রিটার্ন ও রিফান্ড পলিসি)",
    tags: [
      "refund",
      "refunds",
      "return",
      "returns",
      "exchange",
      "replacement",
      "policy",
      "days",
      "রিটার্ন",
      "ফেরত",
      "রিফান্ড",
    ],
    sourceUrl: "/returns",
    body: "Unused items in original condition with tags intact can be returned or exchanged within 7 days of delivery. To initiate an exchange or return, please provide your order number or contact our support team. Refunds are issued promptly once the return parcel is received and inspected. ডেলিভারির ৭ দিনের মধ্যে অব্যবহৃত পণ্য ফেরত বা এক্সচেঞ্জ করা যায়।",
  },
  {
    id: "kb-store-hours",
    title:
      "Store & Shop Operating / Opening Hours & Customer Support (দোকান ও স্টোর খোলার সময়সূচী ও যোগাযোগ)",
    tags: [
      "hours",
      "open",
      "opening",
      "shop",
      "store",
      "timing",
      "schedule",
      "contact",
      "phone",
      "whatsapp",
      "email",
      "সময়",
      "খোলা",
      "সময়সূচী",
      "দোকান",
      "যোগাযোগ",
    ],
    sourceUrl: "/contact",
    body: "Our store and customer service are open daily from 9:00 AM to 10:00 PM BST. We are active Saturday through Friday. Shop hours: 9:00 AM to 10:00 PM. You can chat with us live, reach us via WhatsApp, or request an automated phone callback anytime. আমাদের দোকান ও কাস্টমার সাপোর্ট প্রতিদিন সকাল ৯:০০ টা থেকে রাত ১০:০০ টা পর্যন্ত খোলা থাকে।",
  },
];

let canonicalSeeded = false;

export function ensureCanonicalSeeded() {
  if (canonicalSeeded && IN_MEMORY_KB_CHUNKS.length > 0) return;
  canonicalSeeded = true;
  for (const doc of FRAMIQUE_CANONICAL_KB_DOCS) {
    if (!IN_MEMORY_KB_CHUNKS.some((c) => c.doc_id === doc.id)) {
      const vec = generateDeterministicEmbedding(
        `${doc.title}\n${doc.tags.join(" ")}\n${doc.body}`,
        1024,
      );
      IN_MEMORY_KB_CHUNKS.push({
        doc_id: doc.id,
        merchant_id: "canonical",
        title: doc.title,
        body: `${doc.body} [Keywords: ${doc.tags.join(", ")}]`,
        source_url: doc.sourceUrl ?? null,
        embedding: vec,
        embedding_model: deterministicChunkModel(),
        embedding_dim: vec.length,
      });
    }
  }
  for (const doc of STORE_BASE_FAQS) {
    if (!IN_MEMORY_KB_CHUNKS.some((c) => c.doc_id === doc.id)) {
      const vec = generateDeterministicEmbedding(
        `${doc.title}\n${doc.tags.join(" ")}\n${doc.body}`,
        1024,
      );
      IN_MEMORY_KB_CHUNKS.push({
        doc_id: doc.id,
        merchant_id: "canonical",
        title: doc.title,
        body: `${doc.body} [Keywords: ${doc.tags.join(", ")}]`,
        source_url: doc.sourceUrl ?? null,
        embedding: vec,
        embedding_model: deterministicChunkModel(),
        embedding_dim: vec.length,
      });
    }
  }
  for (const doc of PLATFORM_KB_DOCS) {
    if (!IN_MEMORY_KB_CHUNKS.some((c) => c.doc_id === doc.id)) {
      const vec = generateDeterministicEmbedding(
        `${doc.title}\n${doc.tags.join(" ")}\n${doc.body}`,
        1024,
      );
      IN_MEMORY_KB_CHUNKS.push({
        doc_id: doc.id,
        merchant_id: "framique",
        title: doc.title,
        body: `${doc.body} [Keywords: ${doc.tags.join(", ")}]`,
        source_url: doc.sourceUrl ?? null,
        embedding: vec,
        embedding_model: deterministicChunkModel(),
        embedding_dim: vec.length,
      });
    }
  }
}

/**
 * Query coverage gate — the single-stem false-positive killer.
 *
 * A hit only qualifies as citable when it accounts for enough distinctive
 * query words (same tokenization + stemming the scorer uses). "How to
 * integrate ERP?" against the Pathao article scores 0.5 ("erp" matches
 * nothing) and is disqualified, no matter how high its text/vector scores
 * look. Returns covered / total in [0, 1]; 0 when the query has no
 * content tokens.
 *
 * Calibrated at 0.6 (was 1.0): measured on the repo's own fixtures —
 *   ERP adversarial query ............ 0.50 → still disqualified
 *   Martian out-of-domain ............ 0.33 → still disqualified
 *   bKash paraphrase ("accept … on my store?"
 *     vs "supports … merchants") ..... 0.60 → admitted (was wrongly refused)
 *   shipping natural phrasing ........ 0.75 → admitted (was wrongly refused)
 *   exact/technical queries .......... 1.00 → admitted
 * Short 2-token queries still need full coverage (1/2 = 0.5 < 0.6), so the
 * ERP-class false positive stays dead while 4+ token natural phrasing may
 * miss one synonym. Precision contracts (coverage gate + confidenceOf +
 * enforceGroundedReply) are unchanged — only the gate threshold moved.
 */
export const MIN_QUERY_COVERAGE = 0.6;

function coverageVariants(tok: string): string[] {
  const out = [tok, `${tok}s`];
  if (tok.endsWith("s")) out.push(tok.slice(0, -1));
  if (tok.endsWith("ing")) out.push(tok.slice(0, -3));
  if (tok.endsWith("ed")) out.push(tok.slice(0, -2));
  return out;
}

export function queryCoverage(
  query: string,
  title: string,
  body: string,
): number {
  const rawTokens = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const contentTokens = rawTokens.filter(
    (t) => !STOP_WORDS.has(t) && t.length > 1,
  );
  const qTokens = contentTokens.length > 0 ? contentTokens : rawTokens;
  if (qTokens.length === 0) return 0;
  const docWords = new Set(
    `${title} ${body}`
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );
  let covered = 0;
  for (const tok of qTokens) {
    if (coverageVariants(tok).some((v) => docWords.has(v))) covered++;
  }
  return covered / qTokens.length;
}

const STOP_WORDS = new Set([
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
 * In-memory Reciprocal Rank Fusion search over IN_MEMORY_KB_CHUNKS.
 */
export function searchInMemoryKb(
  merchantId: string | null,
  query: string,
  queryEmbedding?: number[],
  limit = 5,
  rrfK = 60,
): KbHit[] {
  ensureCanonicalSeeded();
  const rawTokens = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const contentTokens = rawTokens.filter(
    (t) => !STOP_WORDS.has(t) && t.length > 1,
  );
  const qTokens = contentTokens.length > 0 ? contentTokens : rawTokens;
  const pool = IN_MEMORY_KB_CHUNKS.filter(
    (c) =>
      c.merchant_id === merchantId ||
      c.merchant_id === "canonical" ||
      c.merchant_id === "seed" ||
      c.merchant_id === "framique" ||
      merchantId === "seed",
  );

  if (!pool.length) return [];

  type Scored = {
    chunk: InMemoryChunk;
    textScore: number;
    vectorSim: number;
    textRank: number;
    vectorRank: number;
    rrfScore: number;
  };

  const scored: Scored[] = pool.map((c) => {
    // Text keyword match score
    const textLower = `${c.title} ${c.body}`.toLowerCase();
    const docWords = new Set(
      textLower.split(/[^\p{L}\p{N}]+/u).filter(Boolean),
    );
    let matches = 0;
    for (const tok of qTokens) {
      if (
        docWords.has(tok) ||
        docWords.has(tok + "s") ||
        (tok.endsWith("s") && docWords.has(tok.slice(0, -1))) ||
        (tok.endsWith("ing") && docWords.has(tok.slice(0, -3))) ||
        (tok.endsWith("ed") && docWords.has(tok.slice(0, -2)))
      ) {
        matches++;
      }
    }
    const textScore = qTokens.length > 0 ? matches / qTokens.length : 0;

    // Vector cosine similarity score
    const vectorSim =
      queryEmbedding && c.embedding
        ? cosineSimilarity(queryEmbedding, c.embedding)
        : 0;

    return {
      chunk: c,
      textScore,
      vectorSim,
      textRank: 0,
      vectorRank: 0,
      rrfScore: 0,
    };
  });

  // Sort by text score descending to assign text rank
  scored.sort((a, b) => b.textScore - a.textScore);
  scored.forEach((item, idx) => {
    item.textRank = idx + 1;
  });

  // Sort by vector similarity descending to assign vector rank
  scored.sort((a, b) => b.vectorSim - a.vectorSim);
  scored.forEach((item, idx) => {
    item.vectorRank = idx + 1;
  });

  // Calculate RRF score
  scored.forEach((item) => {
    const textTerm = item.textScore > 0 ? 1 / (rrfK + item.textRank) : 0;
    const vectorTerm = item.vectorSim > 0 ? 1 / (rrfK + item.vectorRank) : 0;
    item.rrfScore = textTerm + vectorTerm;
  });

  // Sort by final combined score descending
  scored.sort((a, b) => b.rrfScore - a.rrfScore);

  // Filter to keep only genuinely matching chunks (meaningful keyword match or high semantic similarity)
  const minTextScore = qTokens.length <= 2 ? 0.3 : 0.25;
  const relevant = scored.filter(
    (s) =>
      s.rrfScore > 0 &&
      (s.textScore >= minTextScore ||
        (s.textScore > 0 && s.vectorSim >= 0.4) ||
        s.vectorSim >= 0.55),
  );

  return relevant.slice(0, limit).map((s) => ({
    doc_id: s.chunk.doc_id,
    title: s.chunk.title,
    body: snippet(s.chunk.body, query, 360),
    rank: s.textScore > 0 ? Math.max(s.rrfScore, 0.05) : s.rrfScore,
    source_url: s.chunk.source_url,
    combined_score: Number(s.rrfScore.toFixed(6)),
    text_rank: Number(s.textScore.toFixed(4)),
    vector_sim: Number(s.vectorSim.toFixed(4)),
  }));
}

/**
 * Register document chunks in memory for testing or local usage.
 */
export function registerInMemoryDoc(
  merchantId: string,
  doc: { id: string; title: string; body: string; sourceUrl?: string | null },
  embedding?: number[],
  meta?: { embeddingModel?: string; embeddingDim?: number },
) {
  const vec =
    embedding ||
    generateDeterministicEmbedding(`${doc.title}\n${doc.body}`, 1024);
  IN_MEMORY_KB_CHUNKS.push({
    doc_id: doc.id,
    merchant_id: merchantId,
    title: doc.title,
    body: doc.body,
    source_url: doc.sourceUrl ?? null,
    embedding: vec,
    embedding_model: meta?.embeddingModel || deterministicChunkModel(),
    embedding_dim: meta?.embeddingDim || vec.length,
  });
}

export function clearInMemoryKb() {
  IN_MEMORY_KB_CHUNKS.length = 0;
  canonicalSeeded = false;
}

/**
 * Seed canonical Framique knowledge base docs into memory or database.
 */
export async function seedCanonicalFramiqueDocs(merchantId: string) {
  for (const doc of FRAMIQUE_CANONICAL_KB_DOCS) {
    const embedding = generateDeterministicEmbedding(
      `${doc.title}\n${doc.body}`,
      1024,
    );
    registerInMemoryDoc(
      merchantId,
      {
        id: doc.id,
        title: doc.title,
        body: doc.body,
        sourceUrl: doc.sourceUrl,
      },
      embedding,
    );
  }
}

export async function listDocs(db: Client, merchantId: string) {
  await enforceRateLimit("support.read", merchantId);
  const { data } = await db
    .from("support_kb_docs")
    .select("id, title, body, locale, status, tags, source_url, updated_at")
    .eq("merchant_id", merchantId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  return data ?? [];
}

/** Upsert + generate vector embeddings + re-chunk in one call. */
export async function saveDoc(
  db: Client,
  merchantId: string,
  userId: string,
  input: SaveDocInput,
) {
  return withSpan("support.kb_save", async () => {
    await enforceRateLimit("support.kb_write", `${merchantId}:${userId}`);
    const row = {
      merchant_id: merchantId,
      title: input.title.slice(0, 200),
      body: input.body.slice(0, 20_000),
      locale: input.locale,
      status: input.status,
      tags: input.tags.slice(0, 12),
      source_url: input.sourceUrl ?? null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };

    let docId = input.id;
    try {
      const { data, error } = input.id
        ? await db
            .from("support_kb_docs")
            .update(row)
            .eq("merchant_id", merchantId)
            .eq("id", input.id)
            .select("id")
            .single()
        : await db.from("support_kb_docs").insert(row).select("id").single();

      if (error || !data) throw new KbError("kb_save_failed");
      docId = data.id;

      const chunks = chunkDocument(row.body);
      await db
        .from("support_kb_chunks")
        .delete()
        .eq("merchant_id", merchantId)
        .eq("doc_id", docId);

      if (chunks.length) {
        // Generate vector embeddings for chunks, recording the producing
        // model id per embedding so the RAG backfill can refresh stale rows.
        const metas = await Promise.all(
          chunks.map((c): Promise<EmbeddingResult> => {
            const text = `${row.title}\n${c.body}`;
            return generateEmbeddingWithMeta(text).catch(() => ({
              embedding: generateDeterministicEmbedding(
                text,
                DETERMINISTIC_FALLBACK_DIM,
              ),
              model: deterministicChunkModel(),
              dim: DETERMINISTIC_FALLBACK_DIM,
              fallback: true,
            }));
          }),
        );

        await insertKbChunksFeatureDetected(
          db,
          merchantId,
          docId!,
          chunks.map((c, i) => ({
            ordinal: c.ordinal,
            body: c.body,
            embedding: metas[i].embedding,
            embedding_model: metas[i].model,
            embedding_dim: metas[i].dim,
          })),
        );
      }
    } catch {
      // Fallback: register in in-memory index
      if (!docId) docId = `inmem-doc-${Date.now()}`;
      const emb = generateDeterministicEmbedding(
        `${row.title}\n${row.body}`,
        1024,
      );
      registerInMemoryDoc(
        merchantId,
        {
          id: docId,
          title: row.title,
          body: row.body,
          sourceUrl: row.source_url,
        },
        emb,
      );
    }

    invalidate(`kb:${merchantId}:`);
    invalidate(`kb_hybrid:${merchantId}:`);
    incr("framique_ai_kb_doc_total", {
      action: input.id ? "updated" : "created",
    });
    log("info", "support.kb_saved", { merchant_id: merchantId, doc_id: docId });
    return { id: docId, ok: true };
  });
}

/** Soft delete: the doc leaves retrieval immediately, history stays auditable. */
export async function deleteDoc(
  db: Client,
  merchantId: string,
  userId: string,
  docId: string,
) {
  await enforceRateLimit("support.kb_write", `${merchantId}:${userId}`);
  try {
    await db
      .from("support_kb_chunks")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("doc_id", docId);
    await db
      .from("support_kb_docs")
      .update({ deleted_at: new Date().toISOString(), status: "draft" })
      .eq("merchant_id", merchantId)
      .eq("id", docId);
  } catch {
    // In-memory index removal
    const idx = IN_MEMORY_KB_CHUNKS.findIndex((c) => c.doc_id === docId);
    if (idx !== -1) IN_MEMORY_KB_CHUNKS.splice(idx, 1);
  }

  invalidate(`kb:${merchantId}:`);
  invalidate(`kb_hybrid:${merchantId}:`);
  incr("framique_ai_kb_doc_total", { action: "deleted" });
  return { ok: true as const };
}

// ─────────────────────────────────────────────────────────────────────────────
// Embedding versioning + RAG backfill (Nemotron-3 migration)
//
// support_kb_chunks gains `embedding_model` (text) + `embedding_dim` (int)
// via supabase/pending/support_kb_embedding_version.sql (UNAPPLIED — the code
// below feature-detects the columns and works with and without them).
// ─────────────────────────────────────────────────────────────────────────────

export type VersionedChunkRow = {
  ordinal: number;
  body: string;
  embedding: number[];
  embedding_model: string;
  embedding_dim: number;
};

/** True when the failure is "the version columns don't exist yet" — never for real errors. */
export function isMissingEmbeddingVersionColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (!/embedding_model|embedding_dim/i.test(msg)) return false;
  return /column|schema cache|PGRST204|42703|does not exist/i.test(msg);
}

/**
 * Insert chunk rows, storing embedding_model/dim when the schema allows it.
 * Optimistic versioned insert first; on missing-column failure retry bare.
 * Real errors are rethrown — only the absent-migration case degrades.
 */
export async function insertKbChunksFeatureDetected(
  db: Client,
  merchantId: string,
  docId: string,
  rows: VersionedChunkRow[],
): Promise<{ versioned: boolean }> {
  const base = rows.map((r) => ({
    merchant_id: merchantId,
    doc_id: docId,
    ordinal: r.ordinal,
    body: r.body,
    embedding: r.embedding,
  }));
  try {
    await db
      .from("support_kb_chunks")
      .insert(
        rows.map((r, i) => ({
          ...base[i],
          embedding_model: r.embedding_model,
          embedding_dim: r.embedding_dim,
        })),
      );
    return { versioned: true };
  } catch (err) {
    if (!isMissingEmbeddingVersionColumnError(err)) throw err;
    await db.from("support_kb_chunks").insert(base);
    log("warn", "support.kb_chunks_version_columns_missing", {
      merchant_id: merchantId,
      doc_id: docId,
    });
    return { versioned: false };
  }
}

async function updateChunkEmbeddingFeatureDetected(
  db: Client,
  id: string,
  embedding: number[],
  model: string,
  dim: number,
  assumeVersioned = true,
): Promise<{ versioned: boolean }> {
  if (assumeVersioned) {
    try {
      await db
        .from("support_kb_chunks")
        .update({ embedding, embedding_model: model, embedding_dim: dim })
        .eq("id", id);
      return { versioned: true };
    } catch (err) {
      if (!isMissingEmbeddingVersionColumnError(err)) throw err;
    }
  }
  await db.from("support_kb_chunks").update({ embedding }).eq("id", id);
  return { versioned: false };
}

type BackfillRow = {
  id: string;
  doc_id: string;
  body: string;
  embedding: unknown;
  embedding_model?: unknown;
  embedding_dim?: unknown;
};

function rowEmbeddingEmpty(embedding: unknown): boolean {
  return (
    embedding == null ||
    (Array.isArray(embedding) && embedding.length === 0)
  );
}

function rowNeedsRefresh(
  row: BackfillRow,
  model: string,
  versioned: boolean,
): boolean {
  if (!versioned) return rowEmbeddingEmpty(row.embedding);
  if (rowEmbeddingEmpty(row.embedding)) return true;
  if (
    isEmbeddingModelStale(
      typeof row.embedding_model === "string" ? row.embedding_model : null,
      model,
    )
  ) {
    return true;
  }
  return (
    typeof row.embedding_dim === "number" &&
    Array.isArray(row.embedding) &&
    row.embedding_dim !== row.embedding.length
  );
}

export type KbBackfillSummary = {
  model: string;
  versioned: boolean;
  scanned: number;
  stale: number;
  refreshed: number;
  skippedFresh: number;
  skippedOfflineFallback: number;
  dryRun: boolean;
};

/**
 * RAG backfill: re-embed chunks whose stored vector is missing, legacy, or
 * offline-fallback so recall converges on `model` after the migration.
 *
 * Safety rules:
 * - Works with and without the version columns (feature-detected per read and
 *   per write; pre-migration DBs only refill null/empty vectors).
 * - Never overwrites a real stored vector with a deterministic offline
 *   projection (offline runs only fill gaps, and record the fallback id).
 * - dryRun reports stale counts without writing.
 * - `embed` is injectable so tests can run the whole loop without network.
 */
export async function backfillKbEmbeddings(
  db: Client,
  merchantId: string,
  options?: {
    batchSize?: number;
    dryRun?: boolean;
    model?: string;
    embed?: (text: string, model: string) => Promise<EmbeddingResult>;
  },
): Promise<KbBackfillSummary> {
  const model = options?.model?.trim() || DEFAULT_EMBEDDING_MODEL;
  const batchSize = Math.min(Math.max(options?.batchSize ?? 50, 1), 200);
  const dryRun = options?.dryRun ?? false;
  const embed =
    options?.embed ??
    ((text: string, m: string) => generateEmbeddingWithMeta(text, { model: m }));
  const summary: KbBackfillSummary = {
    model,
    versioned: true,
    scanned: 0,
    stale: 0,
    refreshed: 0,
    skippedFresh: 0,
    skippedOfflineFallback: 0,
    dryRun,
  };

  let rows: BackfillRow[] = [];
  try {
    const { data } = await db
      .from("support_kb_chunks")
      .select("id, doc_id, body, embedding, embedding_model, embedding_dim")
      .eq("merchant_id", merchantId)
      .limit(batchSize * 4);
    rows = (Array.isArray(data) ? data : []) as BackfillRow[];
  } catch (err) {
    if (!isMissingEmbeddingVersionColumnError(err)) throw err;
    summary.versioned = false;
    const { data } = await db
      .from("support_kb_chunks")
      .select("id, doc_id, body, embedding")
      .eq("merchant_id", merchantId)
      .limit(batchSize * 4);
    rows = (Array.isArray(data) ? data : []) as BackfillRow[];
  }

  const titles = new Map<string, string>();
  try {
    const { data } = await db
      .from("support_kb_docs")
      .select("id, title")
      .eq("merchant_id", merchantId)
      .limit(500);
    for (const d of (Array.isArray(data) ? data : []) as Array<{
      id: string;
      title: string;
    }>) {
      titles.set(d.id, d.title);
    }
  } catch {
    // Titles are a nicety (better embed text); chunks re-embed from body alone.
  }

  for (const row of rows) {
    if (!dryRun && summary.refreshed >= batchSize) break;
    if (dryRun && summary.stale >= batchSize) break;
    summary.scanned++;
    if (!rowNeedsRefresh(row, model, summary.versioned)) {
      summary.skippedFresh++;
      continue;
    }
    summary.stale++;
    const text = `${titles.get(row.doc_id) ?? ""}\n${row.body ?? ""}`.trim();
    if (!text) {
      summary.skippedOfflineFallback++;
      continue;
    }
    if (dryRun) continue;
    const result = await embed(text, model);
    if (result.fallback && !rowEmbeddingEmpty(row.embedding)) {
      // Offline run: never clobber a real vector with a projection.
      summary.skippedOfflineFallback++;
      continue;
    }
    const up = await updateChunkEmbeddingFeatureDetected(
      db,
      row.id,
      result.embedding,
      result.model,
      result.dim,
      summary.versioned,
    );
    if (!up.versioned) summary.versioned = false;
    summary.refreshed++;
  }

  log("info", "support.kb_backfill", {
    merchant_id: merchantId,
    ...summary,
  });
  return summary;
}
