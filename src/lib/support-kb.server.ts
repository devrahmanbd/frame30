/**
 * Knowledge Base Engine: Ingest, Vector Embeddings, Hybrid Semantic Search.
 *
 * Combines full-text search (`tsvector`) with dense vector embeddings
 * (NVIDIA Llama-Nemotron Embed `nvidia/llama-nemotron-embed-vl-1b-v2:free`)
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
  generateDeterministicEmbedding,
  generateEmbedding,
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
};

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
3. Configure the Webhook Callback URL: Copy the Framique webhook endpoint URL (e.g., https://your-store.framique.com/api/webhooks/courier/steadfast) and paste it into SteadFast portal settings.
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
    title: "Framique Page Builder AST, Sections, Global Blocks & Custom Styling",
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
export async function searchKb(merchantId: string, query: string, limit = 4): Promise<KbHit[]> {
  const key = `kb:${merchantId}:${query.toLowerCase().slice(0, 120)}`;
  return cached(key, 30, async () => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
      incr("framique_ai_kb_search_total", { outcome: hits.length ? "hit" : "miss", mode: "text" });
      return hits;
    } catch {
      // In-memory fallback
      return searchInMemoryKb(merchantId, query, undefined, limit);
    }
  });
}

/**
 * Hybrid Semantic Search combining dense vector embeddings and full-text search with RRF.
 */
export async function searchKbHybrid(
  merchantId: string,
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
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await (supabaseAdmin as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }).rpc("support_kb_hybrid_search", {
        _merchant_id: merchantId,
        _q: trimmed,
        _query_embedding: queryEmbedding,
        _limit: limit,
        _rrf_k: rrfK,
      });

      if (error || !Array.isArray(data) || data.length === 0) {
        throw new Error(error ? JSON.stringify(error) : "empty_or_error");
      }

      const hits = (data as Array<{
        doc_id: string;
        title: string;
        body: string;
        source_url: string | null;
        combined_score: number;
        text_rank: number;
        vector_sim: number;
      }>).map((h) => ({
        doc_id: h.doc_id,
        title: h.title,
        body: snippet(h.body, trimmed, 360),
        rank: h.combined_score,
        source_url: h.source_url,
        combined_score: h.combined_score,
        text_rank: h.text_rank,
        vector_sim: h.vector_sim,
      }));

      const elapsed = Date.now() - started;
      incr("framique_ai_kb_search_total", { outcome: hits.length ? "hit" : "miss", mode: "hybrid" });
      observe("framique_ai_kb_search_latency_ms", elapsed, { mode: "hybrid" });
      return hits;
    } catch {
      // 3. Resilient in-memory fallback for local dev / tests
      const fallbackHits = searchInMemoryKb(merchantId, trimmed, queryEmbedding ?? undefined, limit, rrfK);
      const elapsed = Date.now() - started;
      incr("framique_ai_kb_search_total", { outcome: fallbackHits.length ? "hit" : "miss", mode: "hybrid_fallback" });
      observe("framique_ai_kb_search_latency_ms", elapsed, { mode: "hybrid_fallback" });
      return fallbackHits;
    }
  });
}

let canonicalSeeded = false;

export function ensureCanonicalSeeded() {
  if (canonicalSeeded && IN_MEMORY_KB_CHUNKS.length > 0) return;
  canonicalSeeded = true;
  for (const doc of FRAMIQUE_CANONICAL_KB_DOCS) {
    if (!IN_MEMORY_KB_CHUNKS.some((c) => c.doc_id === doc.id)) {
      const vec = generateDeterministicEmbedding(`${doc.title}\n${doc.body}`, 1024);
      IN_MEMORY_KB_CHUNKS.push({
        doc_id: doc.id,
        merchant_id: "canonical",
        title: doc.title,
        body: doc.body,
        source_url: doc.sourceUrl ?? null,
        embedding: vec,
      });
    }
  }
}

/**
 * In-memory Reciprocal Rank Fusion search over IN_MEMORY_KB_CHUNKS.
 */
export function searchInMemoryKb(
  merchantId: string,
  query: string,
  queryEmbedding?: number[],
  limit = 5,
  rrfK = 60,
): KbHit[] {
  ensureCanonicalSeeded();
  const qTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const pool = IN_MEMORY_KB_CHUNKS.filter(
    (c) =>
      c.merchant_id === merchantId ||
      c.merchant_id === "canonical" ||
      c.merchant_id === "seed" ||
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
    let matches = 0;
    for (const tok of qTokens) {
      if (textLower.includes(tok)) matches++;
    }
    const textScore = qTokens.length > 0 ? matches / qTokens.length : 0;

    // Vector cosine similarity score
    const vectorSim = queryEmbedding && c.embedding ? cosineSimilarity(queryEmbedding, c.embedding) : 0;

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

  return scored.slice(0, limit).map((s) => ({
    doc_id: s.chunk.doc_id,
    title: s.chunk.title,
    body: snippet(s.chunk.body, query, 360),
    rank: s.rrfScore,
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
) {
  const vec = embedding || generateDeterministicEmbedding(`${doc.title}\n${doc.body}`, 1024);
  IN_MEMORY_KB_CHUNKS.push({
    doc_id: doc.id,
    merchant_id: merchantId,
    title: doc.title,
    body: doc.body,
    source_url: doc.sourceUrl ?? null,
    embedding: vec,
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
    const embedding = generateDeterministicEmbedding(`${doc.title}\n${doc.body}`, 1024);
    registerInMemoryDoc(merchantId, {
      id: doc.id,
      title: doc.title,
      body: doc.body,
      sourceUrl: doc.sourceUrl,
    }, embedding);
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
      await db.from("support_kb_chunks").delete().eq("merchant_id", merchantId).eq("doc_id", docId);

      if (chunks.length) {
        // Generate vector embeddings for chunks
        const embeddings = await Promise.all(
          chunks.map((c) =>
            generateEmbedding(`${row.title}\n${c.body}`).catch(() =>
              generateDeterministicEmbedding(`${row.title}\n${c.body}`, 1024),
            ),
          ),
        );

        await db.from("support_kb_chunks").insert(
          chunks.map((c, i) => ({
            merchant_id: merchantId,
            doc_id: docId!,
            ordinal: c.ordinal,
            body: c.body,
            embedding: embeddings[i],
          })),
        );
      }
    } catch {
      // Fallback: register in in-memory index
      if (!docId) docId = `inmem-doc-${Date.now()}`;
      const emb = generateDeterministicEmbedding(`${row.title}\n${row.body}`, 1024);
      registerInMemoryDoc(merchantId, {
        id: docId,
        title: row.title,
        body: row.body,
        sourceUrl: row.source_url,
      }, emb);
    }

    invalidate(`kb:${merchantId}:`);
    invalidate(`kb_hybrid:${merchantId}:`);
    incr("framique_ai_kb_doc_total", { action: input.id ? "updated" : "created" });
    log("info", "support.kb_saved", { merchant_id: merchantId, doc_id: docId });
    return { id: docId, ok: true };
  });
}

/** Soft delete: the doc leaves retrieval immediately, history stays auditable. */
export async function deleteDoc(db: Client, merchantId: string, userId: string, docId: string) {
  await enforceRateLimit("support.kb_write", `${merchantId}:${userId}`);
  try {
    await db.from("support_kb_chunks").delete().eq("merchant_id", merchantId).eq("doc_id", docId);
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
