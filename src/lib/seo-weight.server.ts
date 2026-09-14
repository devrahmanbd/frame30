/**
 * Phase 7 production weight auditor.
 *
 * This is intentionally more than a gzip wrapper: it samples the tenant's real
 * published home/product/page heads, measures them with node:zlib, persists an
 * auditable run, emits bounded-cardinality telemetry, and records a terminal
 * failure row on every error path. Storefront requests never call this module.
 */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildPageHead, buildProductHead, buildStoreHead, type HeadOutput } from "./theme-seo";
import { composeWeightReport, measureHead, type WeightFinding, type WeightReport } from "./seo-weight";
import { captureError, incr, log, observe, withSpan } from "./observability.server";

type Client = SupabaseClient<Database>;
type Trigger = "manual" | "release" | "scheduled";

export class SeoWeightError extends Error {
  constructor(readonly code: "merchant_not_found" | "audit_busy" | "read_failed" | "persist_failed", message: string) {
    super(message);
    this.name = "SeoWeightError";
  }
}

const realGzip = (text: string) => gzipSync(Buffer.from(text, "utf8"), { level: 9 }).byteLength;
const safeMessage = (err: unknown) => (err instanceof Error ? err.message.slice(0, 240) : "Unknown audit error");

function fingerprint(finding: WeightFinding) {
  return createHash("sha256")
    .update([finding.code, finding.scope ?? "", finding.offender ?? "", finding.actual ?? ""].join("|"))
    .digest("hex");
}

async function sampleHeads(merchantId: string): Promise<{ heads: { route: string; head: HeadOutput }[]; partial: string[] }> {
  const { publicClient } = await import("./pricing.server");
  const db = publicClient();
  const { data: merchant, error: merchantError } = await db
    .from("merchants")
    .select("id, name, slug, currency_code")
    .eq("id", merchantId)
    .eq("status", "active")
    .maybeSingle();
  if (merchantError) throw new SeoWeightError("read_failed", merchantError.message);
  if (!merchant) throw new SeoWeightError("merchant_not_found", "The active store could not be found.");

  const [{ data: settings }, { data: products }, { data: page }] = await Promise.all([
    db.from("merchant_settings").select("tagline, shipping_flat_minor_int, free_shipping_threshold_minor_int").eq("merchant_id", merchantId).maybeSingle(),
    db.from("products").select("id, title, slug, description, image_url, product_variants(name, sku, price_amount_minor_int, stock_quantity)").eq("merchant_id", merchantId).eq("status", "active").order("created_at", { ascending: false }).limit(20),
    db.from("storefront_pages").select("title, slug, excerpt, meta_title, meta_description, cover_image_url, updated_at, robots").eq("merchant_id", merchantId).eq("is_published", true).is("deleted_at", null).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const items = products ?? [];
  const heads: { route: string; head: HeadOutput }[] = [
    {
      route: `/store/${merchant.slug}`,
      head: buildStoreHead({
        origin: "https://audit.invalid",
        path: `/store/${merchant.slug}`,
        storeName: merchant.name,
        tagline: settings?.tagline,
        products: items.map((p) => ({ title: p.title, slug: p.slug, image_url: p.image_url })),
      }),
    },
  ];
  const partial: string[] = [];
  const product = items[0];
  if (product) {
    const variants = product.product_variants ?? [];
    const price = variants.map((v) => Number(v.price_amount_minor_int ?? 0)).sort((a, b) => a - b)[0] ?? 0;
    heads.push({
      route: `/store/${merchant.slug}/p/${product.slug}`,
      head: buildProductHead({
        origin: "https://audit.invalid",
        path: `/store/${merchant.slug}/p/${product.slug}`,
        storePath: `/store/${merchant.slug}`,
        storeName: merchant.name,
        product: { title: product.title, slug: product.slug, description: product.description, image_url: product.image_url, sku: variants[0]?.sku },
        currency: merchant.currency_code,
        priceMinor: price,
        inStock: variants.some((v) => Number(v.stock_quantity ?? 0) > 0),
        shipping: { flatMinor: Number(settings?.shipping_flat_minor_int ?? 0), freeThresholdMinor: settings?.free_shipping_threshold_minor_int },
      }),
    });
  } else partial.push("no_active_product");
  if (page) {
    heads.push({
      route: `/store/${merchant.slug}/pages/${page.slug}`,
      head: buildPageHead({
        origin: "https://audit.invalid",
        path: `/store/${merchant.slug}/pages/${page.slug}`,
        storePath: `/store/${merchant.slug}`,
        storeName: merchant.name,
        noindex: (page.robots ?? "").startsWith("noindex"),
        page,
      }),
    });
  } else partial.push("no_published_page");
  return { heads, partial };
}

export async function runSeoWeightAudit(input: { merchantId: string; requestedBy: string | null; trigger?: Trigger }): Promise<WeightReport & { runId: string; status: string; partialReasons: string[] }> {
  const started = Date.now();
  const trigger = input.trigger ?? "manual";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: active } = await supabaseAdmin.from("seo_weight_runs").select("id").eq("merchant_id", input.merchantId).eq("status", "running").gte("started_at", new Date(Date.now() - 10 * 60_000).toISOString()).limit(1).maybeSingle();
  if (active) throw new SeoWeightError("audit_busy", "A weight audit is already running for this store.");
  const { data: run, error: createError } = await supabaseAdmin.from("seo_weight_runs").insert({ merchant_id: input.merchantId, trigger, requested_by: input.requestedBy }).select("id").single();
  if (createError || !run) throw new SeoWeightError("persist_failed", createError?.message ?? "Could not create audit run.");

  try {
    const report = await withSpan("seo.weight.audit", async () => {
      const samples = await sampleHeads(input.merchantId);
      const heads = samples.heads.map(({ route, head }) => measureHead(route, head, realGzip));
      return { report: composeWeightReport({ heads }), partial: samples.partial };
    }, { trigger });
    const status = report.partial.length ? "partial" : report.report.ok ? "ok" : "failed";
    const findings = report.report.findings.map((f) => ({ merchant_id: input.merchantId, run_id: run.id, code: f.code, severity: f.severity, scope: f.scope ?? null, offender: f.offender ?? null, actual: f.actual ?? null, budget: f.budget ?? null, message: f.message, message_bn: f.messageBn, fingerprint: fingerprint(f) }));
    if (findings.length) {
      const { error } = await supabaseAdmin.from("seo_weight_findings").insert(findings);
      if (error) throw new SeoWeightError("persist_failed", error.message);
    }
    const duration = Date.now() - started;
    const { error: finishError } = await supabaseAdmin.from("seo_weight_runs").update({ status, score: report.report.score, pages_measured: report.report.heads.length, findings_total: findings.length, blocking_total: findings.filter((f) => f.severity === "error").length, heaviest_route: report.report.heaviest?.route ?? null, heaviest_gz_bytes: report.report.heaviest?.gzBytes ?? null, raw_bytes_total: report.report.heads.reduce((n, h) => n + h.rawBytes, 0), jsonld_bytes_total: report.report.heads.reduce((n, h) => n + h.jsonLdBytes, 0), partial_reasons: report.partial, duration_ms: duration, finished_at: new Date().toISOString() }).eq("id", run.id);
    if (finishError) throw new SeoWeightError("persist_failed", finishError.message);
    for (const head of report.report.heads) observe("framique_seo_head_bytes", head.gzBytes, { template: head.route.includes("/p/") ? "product" : head.route.includes("/pages/") ? "page" : "index" });
    for (const finding of findings) incr("framique_seo_weight_findings_total", { code: finding.code, severity: finding.severity });
    incr("framique_seo_weight_runs_total", { trigger, outcome: status });
    log("info", "seo.weight.completed", { merchantId: input.merchantId, runId: run.id, status, score: report.report.score, pages: report.report.heads.length, durationMs: duration });
    return { ...report.report, runId: run.id, status, partialReasons: report.partial };
  } catch (err) {
    const code = err instanceof SeoWeightError ? err.code : "read_failed";
    await supabaseAdmin.from("seo_weight_runs").update({ status: "failed", error_code: code, duration_ms: Date.now() - started, finished_at: new Date().toISOString() }).eq("id", run.id);
    incr("framique_seo_weight_runs_total", { trigger, outcome: "failed" });
    await captureError(err, { scope: "seo.weight", merchantId: input.merchantId, runId: run.id, code });
    log("error", "seo.weight.failed", { merchantId: input.merchantId, runId: run.id, code, reason: safeMessage(err) });
    throw err;
  }
}

export async function loadSeoWeightState(supabase: Client, merchantId: string, historyLimit = 12) {
  const [{ data: runs, error: runsError }, { data: findings, error: findingsError }] = await Promise.all([
    supabase.from("seo_weight_runs").select("*").eq("merchant_id", merchantId).order("started_at", { ascending: false }).limit(historyLimit),
    supabase.from("seo_weight_findings").select("*").eq("merchant_id", merchantId).order("created_at", { ascending: false }).limit(100),
  ]);
  if (runsError || findingsError) throw new SeoWeightError("read_failed", runsError?.message ?? findingsError?.message ?? "Audit history unavailable.");
  const latest = runs?.[0] ?? null;
  return { latest, runs: runs ?? [], findings: latest ? (findings ?? []).filter((f) => f.run_id === latest.id) : [] };
}