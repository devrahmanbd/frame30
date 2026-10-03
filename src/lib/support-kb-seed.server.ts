/**
 * Public-corpus KB seeder (R2).
 *
 * Reads the versioned `knowledgebase/*.md` markdown corpus and upserts each
 * live (non-draft) file into `support_kb_docs` via `saveDoc()`. Embeddings
 * are produced downstream by the save/backfill pipeline (`saveDoc` chunks +
 * embeds at write time; `backfillKbEmbeddings` refreshes stale rows) — this
 * module never invents vectors.
 *
 * Idempotency: docs are matched to existing rows by normalized
 * `locale:title`. A re-run skips rows whose stored body already equals the
 * corpus body *and* which already carry the current corpus version tag, so
 * re-running changes nothing. Files with `status: draft` frontmatter are
 * always skipped (reported, never published).
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { saveDoc, type SaveDocInput } from "./support-kb.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export const KB_CORPUS_VERSION = "public-corpus-v1";
export const KB_CORPUS_SOURCE_TAG = "source:public-corpus";
export const KB_CORPUS_VERSION_TAG = `corpus:${KB_CORPUS_VERSION}`;
export const KB_SEED_USER_ID = "system:public-corpus-seed";
export const KB_CORPUS_DIR_NAME = "knowledgebase";

export const KB_CORPUS_LOCALES = ["en", "bn"] as const;
export type CorpusLocale = (typeof KB_CORPUS_LOCALES)[number];

export const KB_CORPUS_AUDIENCES = ["merchant", "developer", "platform"] as const;
export type CorpusAudience = (typeof KB_CORPUS_AUDIENCES)[number];

export type CorpusDoc = {
  slug: string;
  title: string;
  locale: CorpusLocale;
  audience: CorpusAudience;
  tags: string[];
  sourceUrl: string | null;
  status: "draft" | "published";
  body: string;
};

export type ExistingDoc = {
  id: string;
  title: string;
  body: string;
  tags?: string[] | null;
};

export class KbCorpusError extends Error {
  constructor(readonly file: string, message: string) {
    super(`${file}: ${message}`);
    this.name = "KbCorpusError";
  }
}

/** Minimal frontmatter parser (no new dependencies by lane constraint). */
export function parseCorpusFile(slug: string, raw: string): CorpusDoc {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new KbCorpusError(slug, "missing frontmatter block");
  const [, front, bodyRaw] = match;
  const fields = new Map<string, string>();
  for (const line of (front ?? "").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon < 0) throw new KbCorpusError(slug, `bad frontmatter line: ${line}`);
    fields.set(
      line.slice(0, colon).trim().toLowerCase(),
      line.slice(colon + 1).trim(),
    );
  }

  const title = (fields.get("title") ?? "").replace(/^["']|["']$/g, "");
  const locale = (fields.get("locale") ?? "").replace(/^["']|["']$/g, "");
  const audience = (fields.get("audience") ?? "").replace(/^["']|["']$/g, "");
  if (!title) throw new KbCorpusError(slug, "frontmatter requires title");
  if (!(KB_CORPUS_LOCALES as readonly string[]).includes(locale)) {
    throw new KbCorpusError(slug, "frontmatter locale must be en or bn");
  }
  if (!(KB_CORPUS_AUDIENCES as readonly string[]).includes(audience)) {
    throw new KbCorpusError(
      slug,
      "frontmatter audience must be merchant, developer, or platform",
    );
  }
  const statusRaw = (fields.get("status") ?? "published").replace(/^["']|["']$/g, "");
  if (statusRaw !== "draft" && statusRaw !== "published") {
    throw new KbCorpusError(slug, "frontmatter status must be draft or published");
  }
  const tagsRaw = (fields.get("tags") ?? "").replace(/^\[|\]$/g, "");
  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)
    .slice(0, 10);
  const sourceRaw = (fields.get("source") ?? "").replace(/^["']|["']$/g, "");
  const body = (bodyRaw ?? "").replace(/\r\n/g, "\n").trim();
  if (body.length < 200) {
    throw new KbCorpusError(slug, "body too short to be self-contained (<200 chars)");
  }
  return {
    slug,
    title,
    locale: locale as CorpusLocale,
    audience: audience as CorpusAudience,
    tags,
    sourceUrl: sourceRaw || null,
    status: statusRaw,
    body,
  };
}

export function defaultCorpusDir(): string {
  return join(process.cwd(), KB_CORPUS_DIR_NAME);
}

export async function loadCorpusDocs(dir?: string): Promise<CorpusDoc[]> {
  const root = dir ?? defaultCorpusDir();
  const entries = (await readdir(root)).filter((f) => f.endsWith(".md")).sort();
  const docs: CorpusDoc[] = [];
  for (const file of entries) {
    const raw = await readFile(join(root, file), "utf8");
    docs.push(parseCorpusFile(basename(file, ".md"), raw));
  }
  return docs;
}

function normBody(body: string): string {
  return body.replace(/\r\n/g, "\n").trim();
}

export type SeedPlan = {
  create: CorpusDoc[];
  update: Array<{ doc: CorpusDoc; id: string }>;
  skip: CorpusDoc[];
  drafts: CorpusDoc[];
};

/** Pure diff: match desired docs against existing rows by title. */
export function planSeed(desired: CorpusDoc[], existing: ExistingDoc[]): SeedPlan {
  const plan: SeedPlan = { create: [], update: [], skip: [], drafts: [] };
  const byTitle = new Map<string, ExistingDoc>();
  for (const row of existing) {
    byTitle.set(row.title.trim().toLowerCase(), row);
  }
  for (const doc of desired) {
    if (doc.status === "draft") {
      plan.drafts.push(doc);
      continue;
    }
    const row = byTitle.get(doc.title.trim().toLowerCase());
    if (!row) {
      plan.create.push(doc);
      continue;
    }
    const sameBody = normBody(row.body ?? "") === normBody(doc.body);
    const tagged = Array.isArray(row.tags) && row.tags.includes(KB_CORPUS_VERSION_TAG);
    if (sameBody && tagged) plan.skip.push(doc);
    else plan.update.push({ doc, id: row.id });
  }
  return plan;
}

export type SaveDocFn = (
  db: Client,
  merchantId: string,
  userId: string,
  input: SaveDocInput,
) => Promise<{ id: string | null | undefined }>;

export type ListExistingFn = (
  db: Client,
  merchantId: string,
) => Promise<ExistingDoc[]>;

async function defaultListExisting(
  db: Client,
  merchantId: string,
): Promise<ExistingDoc[]> {
  const { data, error } = await db
    .from("support_kb_docs")
    .select("id, title, body, tags")
    .eq("merchant_id", merchantId)
    .limit(500);
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as ExistingDoc[];
}

function toSaveInput(doc: CorpusDoc, id?: string | null): SaveDocInput {
  return {
    id: id ?? null,
    title: doc.title,
    body: doc.body,
    locale: doc.locale,
    status: "published",
    tags: [...doc.tags, KB_CORPUS_SOURCE_TAG, KB_CORPUS_VERSION_TAG].slice(0, 12),
    sourceUrl: doc.sourceUrl,
  };
}

export type SeedPublicKbOptions = {
  dryRun?: boolean;
  dir?: string;
  userId?: string;
  saveDocFn?: SaveDocFn;
  listExistingFn?: ListExistingFn;
};

export type SeedPublicKbSummary = {
  version: string;
  sourceTag: string;
  dryRun: boolean;
  total: number;
  draftsSkipped: string[];
  wouldCreate: number;
  wouldUpdate: number;
  upToDate: number;
  created: number;
  updated: number;
  skipped: number;
};

/**
 * Seed the public corpus for a merchant. Idempotent: re-running with an
 * unchanged corpus performs zero writes. `dryRun` reports would-create /
 * would-update counts without writing.
 */
export async function seedPublicKb(
  db: Client,
  merchantId: string,
  options?: SeedPublicKbOptions,
): Promise<SeedPublicKbSummary> {
  const dryRun = options?.dryRun ?? false;
  const userId = options?.userId ?? KB_SEED_USER_ID;
  const save: SaveDocFn = options?.saveDocFn ?? saveDoc;
  const listExisting: ListExistingFn = options?.listExistingFn ?? defaultListExisting;

  const docs = await loadCorpusDocs(options?.dir);
  const existing = await listExisting(db, merchantId);
  // Match existing rows by title alone (the list read carries no locale);
  // titles are unique per locale in this corpus.
  const plan = planSeed(docs, existing);

  const summary: SeedPublicKbSummary = {
    version: KB_CORPUS_VERSION,
    sourceTag: KB_CORPUS_SOURCE_TAG,
    dryRun,
    total: docs.length - plan.drafts.length,
    draftsSkipped: plan.drafts.map((d) => d.slug),
    wouldCreate: plan.create.length,
    wouldUpdate: plan.update.length,
    upToDate: plan.skip.length,
    created: 0,
    updated: 0,
    skipped: plan.skip.length,
  };
  if (dryRun) return summary;

  for (const doc of plan.create) {
    await save(db, merchantId, userId, toSaveInput(doc));
    summary.created++;
  }
  for (const { doc, id } of plan.update) {
    await save(db, merchantId, userId, toSaveInput(doc, id));
    summary.updated++;
  }
  return summary;
}
