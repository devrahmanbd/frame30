/**
 * Phase 3 — per-template SEO overrides: the server layer.
 *
 * Same production rules as global blocks, for the same reasons:
 *  - **Tenancy twice** — the caller's RLS-scoped client *and* an explicit
 *    `merchant_id` filter, so one bad predicate cannot cross a store boundary.
 *  - **Optimistic concurrency** — `saveTemplateSeo` takes the revision the
 *    drawer loaded. Two staff editing the same template produce a conflict, not
 *    a silent clobber.
 *  - **Re-validate on write and on read** — the row is untrusted input in both
 *    directions, so it goes through `parsePageSeo` each way. A canonical stored
 *    before a validation rule tightened can never leak into a `<link>`.
 *  - **Score is derived, never trusted** — the client sends the AST it is
 *    editing; the score is recomputed here with the shared analyser, so the
 *    stored number always matches what the merchant was shown.
 *  - **Observed and rate limited** — spans, counters, structured logs and an
 *    audit row on every write.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { TEMPLATE_KEYS, parseAst, type TemplateKey } from "./builder-ast";
import {
  EMPTY_PAGE_SEO,
  parsePageSeo,
  scoreBuilderSeo,
  type PageSeo,
} from "./builder-seo";
import { assertTenantId } from "./tenant-scope";
import { incr, log, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import { auditAction } from "./hardening.server";
import { invalidateTemplateSeo } from "./template-seo.server";

type Client = SupabaseClient<Database>;

const TABLE = "builder_template_seo";
const SELECT =
  "id, template, title, description, canonical, og_title, og_description, og_image, focus_keyword, noindex, score, revision, updated_at";

export class TemplateSeoError extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "TemplateSeoError";
  }
}

export type TemplateSeoRecord = {
  template: TemplateKey;
  seo: PageSeo;
  score: number;
  revision: number;
  updatedAt: string | null;
};

type Row = {
  template: string;
  title: string | null;
  description: string | null;
  canonical: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  focus_keyword: string | null;
  noindex: boolean | null;
  score: number | null;
  revision: number | null;
  updated_at: string | null;
};

function assertTemplate(value: string): TemplateKey {
  if (!(TEMPLATE_KEYS as readonly string[]).includes(value)) {
    throw new TemplateSeoError("template_seo.unknown_template", value);
  }
  return value as TemplateKey;
}

function toRecord(row: Row): TemplateSeoRecord {
  return {
    template: assertTemplate(row.template),
    seo: parsePageSeo({
      title: row.title,
      description: row.description,
      canonical: row.canonical,
      ogTitle: row.og_title,
      ogDescription: row.og_description,
      ogImage: row.og_image,
      focusKeyword: row.focus_keyword,
      noindex: row.noindex === true,
    }),
    score: Math.min(Math.max(row.score ?? 0, 0), 100),
    revision: Math.max(row.revision ?? 1, 1),
    updatedAt: row.updated_at,
  };
}

/** A template with no stored row still has an addressable, empty record. */
export function emptyRecord(template: TemplateKey): TemplateSeoRecord {
  return { template, seo: { ...EMPTY_PAGE_SEO }, score: 0, revision: 0, updatedAt: null };
}

/* --------------------------------------------------------------------- read */

export async function listTemplateSeo(
  db: Client,
  merchantId: string,
  themeId: string | null = null,
): Promise<TemplateSeoRecord[]> {
  const merchant = assertTenantId(merchantId, "template_seo.list");
  return withSpan("builder.template_seo.list", async () => {
    await enforceRateLimit("builder.seo_read", merchant);
    let query = db.from(TABLE).select(SELECT).eq("merchant_id", merchant);
    query = themeId ? query.or(`theme_id.is.null,theme_id.eq.${themeId}`) : query.is("theme_id", null);
    const { data, error } = await query.limit(TEMPLATE_KEYS.length * 2);
    if (error) throw new TemplateSeoError("template_seo.read_failed", error.message);
    incr("builder_template_seo_read_total", {}, 1);
    const out: TemplateSeoRecord[] = [];
    for (const row of (data ?? []) as Row[]) {
      // An unknown template means the catalog shrank under a stored row: drop
      // it from the response rather than failing the whole panel.
      try {
        out.push(toRecord(row));
      } catch {
        log("warn", "builder.template_seo.unknown_template", {
          merchant_id: merchant,
          template: row.template,
        });
      }
    }
    return out;
  });
}

export async function getTemplateSeo(
  db: Client,
  merchantId: string,
  template: TemplateKey,
  themeId: string | null = null,
): Promise<TemplateSeoRecord> {
  const rows = await listTemplateSeo(db, merchantId, themeId);
  return rows.find((row) => row.template === template) ?? emptyRecord(template);
}

/* -------------------------------------------------------------------- write */

export type SaveTemplateSeoInput = {
  template: string;
  themeId?: string | null;
  seo: unknown;
  /** The AST currently open in the editor; the score is derived from it. */
  ast?: unknown;
  storeName?: string;
  /** Revision the drawer loaded. `0` means "no row yet". */
  expectedRevision: number;
};

export async function saveTemplateSeo(
  db: Client,
  merchantId: string,
  actor: string | null,
  input: SaveTemplateSeoInput,
): Promise<TemplateSeoRecord> {
  const merchant = assertTenantId(merchantId, "template_seo.save");
  return withSpan("builder.template_seo.save", async () => {
    await enforceRateLimit("builder.seo_write", merchant);
    const template = assertTemplate(input.template);
    const seo = parsePageSeo(input.seo);
    const ast = parseAst(input.ast ?? {});
    const score = scoreBuilderSeo({
      seo,
      ast,
      template,
      storeName: (input.storeName ?? "").slice(0, 80) || "Store",
      url: seo.canonical || null,
    }).score;

    const payload = {
      merchant_id: merchant,
      theme_id: input.themeId ?? null,
      template,
      title: seo.title,
      description: seo.description,
      canonical: seo.canonical,
      og_title: seo.ogTitle,
      og_description: seo.ogDescription,
      og_image: seo.ogImage,
      focus_keyword: seo.focusKeyword,
      noindex: seo.noindex,
      score,
      updated_by: actor,
    };

    if (input.expectedRevision <= 0) {
      const { data, error } = await db
        .from(TABLE)
        .insert({ ...payload, revision: 1, created_by: actor })
        .select(SELECT)
        .maybeSingle();
      // 23505: another tab created the row first. Report a conflict so the
      // drawer reloads and the merchant sees the value that actually landed.
      if (error?.code === "23505") throw new TemplateSeoError("template_seo.conflict");
      if (error?.code === "42501") throw new TemplateSeoError("template_seo.forbidden");
      if (error || !data) throw new TemplateSeoError("template_seo.write_failed", error?.message ?? "write failed");
      const record = toRecord(data as Row);
      invalidateTemplateSeo(merchant);
      incr("builder_template_seo_write_total", { op: "create" });
      log("info", "builder.template_seo.created", { merchant_id: merchant, template, score });
      await auditAction(db, merchant, actor, "builder.template_seo.create", "builder_template_seo", { template, score });
      return record;
    }

    const { data, error } = await db
      .from(TABLE)
      .update({ ...payload, revision: input.expectedRevision + 1 })
      .eq("merchant_id", merchant)
      .eq("template", template)
      .eq("revision", input.expectedRevision)
      .select(SELECT)
      .maybeSingle();
    if (error?.code === "42501") throw new TemplateSeoError("template_seo.forbidden");
    if (error) throw new TemplateSeoError("template_seo.write_failed", error.message);
    if (!data) throw new TemplateSeoError("template_seo.conflict");
    const record = toRecord(data as Row);
    invalidateTemplateSeo(merchant);
    incr("builder_template_seo_write_total", { op: "update" });
    log("info", "builder.template_seo.updated", {
      merchant_id: merchant,
      template,
      score,
      revision: record.revision,
    });
    await auditAction(db, merchant, actor, "builder.template_seo.update", "builder_template_seo", {
      template,
      score,
      noindex: seo.noindex,
    });
    return record;
  });
}

export async function clearTemplateSeo(
  db: Client,
  merchantId: string,
  actor: string | null,
  template: string,
  themeId: string | null = null,
): Promise<{ cleared: boolean }> {
  const merchant = assertTenantId(merchantId, "template_seo.clear");
  return withSpan("builder.template_seo.clear", async () => {
    await enforceRateLimit("builder.seo_write", merchant);
    const key = assertTemplate(template);
    let query = db.from(TABLE).delete().eq("merchant_id", merchant).eq("template", key);
    query = themeId ? query.eq("theme_id", themeId) : query.is("theme_id", null);
    const { data, error } = await query.select("id");
    if (error) throw new TemplateSeoError("template_seo.write_failed", error.message);
    invalidateTemplateSeo(merchant);
    incr("builder_template_seo_write_total", { op: "clear" });
    await auditAction(db, merchant, actor, "builder.template_seo.clear", "builder_template_seo", { template: key });
    return { cleared: ((data as unknown[] | null) ?? []).length > 0 };
  });
}
