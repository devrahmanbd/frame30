import { one } from "./embed";
/**
 * Phase 4 — custom code storage, publish gate and storefront delivery.
 *
 * Draft rows (`version_id is null`) are what the merchant edits; publishing
 * snapshots the draft against a theme version, so custom code is versioned,
 * diffable and rolls back with the theme it belongs to. The platform owner can
 * disable custom code per tenant — the kill switch is checked on the read path,
 * so flipping it takes effect on the next storefront render.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { cached, invalidate } from "./cache.server";
import { incr, log, withSpan } from "./observability.server";
import { rateLimit } from "./rate-limit.server";
import {
  EMPTY_CUSTOM_CODE,
  compileCustomCode,
  type CompiledCustomCode,
  type CustomCode,
  type Finding,
} from "./custom-code";

type Client = SupabaseClient<Database>;

export class CustomCodeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CustomCodeError";
  }
}

const CACHE_PREFIX = "customcode:";
const COLUMNS =
  "id, theme_id, version_id, css, js, head_snippet, body_start, body_end, js_requires_consent, enabled, findings, updated_at";

type Row = {
  id: string;
  theme_id: string;
  version_id: string | null;
  css: string;
  js: string;
  head_snippet: string;
  body_start: string;
  body_end: string;
  js_requires_consent: boolean;
  enabled: boolean;
  findings: Json;
  updated_at: string;
};

function toCode(row: Row | null): CustomCode {
  if (!row) return { ...EMPTY_CUSTOM_CODE };
  return {
    css: row.css,
    js: row.js,
    head: row.head_snippet,
    bodyStart: row.body_start,
    bodyEnd: row.body_end,
    jsRequiresConsent: row.js_requires_consent,
    enabled: row.enabled,
  };
}

export type CustomCodeWorkspace = {
  themeId: string;
  code: CustomCode;
  findings: Finding[];
  blocked: boolean;
  updatedAt: string | null;
  killed: boolean;
  killReason: string | null;
  /** Published snapshots, newest first — the diff/rollback surface. */
  history: { versionId: string; version: number; publishedAt: string | null; code: CustomCode }[];
};

async function killSwitch(db: Client, merchantId: string) {
  const { data } = await db
    .from("custom_code_kill_switch")
    .select("disabled, reason")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  return { killed: Boolean(data?.disabled), reason: data?.reason ?? null };
}

export async function loadCustomCode(db: Client, merchantId: string, themeId: string): Promise<CustomCodeWorkspace> {
  return withSpan("customcode.load", async () => {
    const [draftRes, historyRes, kill] = await Promise.all([
      db.from("theme_custom_code").select(COLUMNS).eq("theme_id", themeId).is("version_id", null).maybeSingle(),
      db
        .from("theme_custom_code")
        .select(`${COLUMNS}, theme_versions!inner(version, published_at)`)
        .eq("theme_id", themeId)
        .not("version_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(20),
      killSwitch(db, merchantId),
    ]);

    const code = toCode((draftRes.data as Row | null) ?? null);
    const compiled = compileCustomCode(code);
    return {
      themeId,
      code,
      findings: compiled.findings,
      blocked: compiled.blocked,
      updatedAt: (draftRes.data as Row | null)?.updated_at ?? null,
      killed: kill.killed,
      killReason: kill.reason,
      history: ((historyRes.data ?? []) as unknown as (Row & { theme_versions: { version: number; published_at: string | null } | { version: number; published_at: string | null }[] })[]).map(
        (row) => ({
          versionId: row.version_id as string,
          version: one(row.theme_versions)?.version ?? 0,
          publishedAt: one(row.theme_versions)?.published_at ?? null,
          code: toCode(row),
        }),
      ),
    };
  });
}

/** Autosave-grade write: warnings are stored, errors are stored too but block publish. */
export async function saveCustomCode(
  db: Client,
  merchantId: string,
  input: { themeId: string } & Partial<CustomCode>,
): Promise<{ findings: Finding[]; blocked: boolean }> {
  await rateLimit("builder.custom_code", merchantId);
  const compiled = compileCustomCode(input);
  const { error } = await db.from("theme_custom_code").upsert(
    {
      merchant_id: merchantId,
      theme_id: input.themeId,
      version_id: null,
      css: input.css ?? "",
      js: input.js ?? "",
      head_snippet: input.head ?? "",
      body_start: input.bodyStart ?? "",
      body_end: input.bodyEnd ?? "",
      js_requires_consent: input.jsRequiresConsent ?? true,
      enabled: input.enabled ?? true,
      findings: compiled.findings as unknown as Json,
    },
    { onConflict: "theme_id", ignoreDuplicates: false },
  );
  if (error) throw new CustomCodeError("customcode.save_failed", error.message);
  incr("framique_custom_code_save_total", { blocked: String(compiled.blocked) });
  return { findings: compiled.findings, blocked: compiled.blocked };
}

/**
 * Snapshot the draft onto a theme version. Called by the theme publish path, so
 * a page and the code that styles it always ship together.
 */
export async function snapshotCustomCode(
  db: Client,
  merchantId: string,
  themeId: string,
  versionId: string,
): Promise<{ snapshotted: boolean; findings: Finding[] }> {
  const { data } = await db
    .from("theme_custom_code")
    .select(COLUMNS)
    .eq("theme_id", themeId)
    .is("version_id", null)
    .maybeSingle();
  const row = data as Row | null;
  if (!row) return { snapshotted: false, findings: [] };

  const compiled = compileCustomCode(toCode(row));
  if (compiled.blocked) {
    // Secret-scan / XSS lint findings block publish — never the other way round.
    throw new CustomCodeError(
      "customcode.publish_blocked",
      compiled.findings
        .filter((x) => x.level === "error")
        .slice(0, 4)
        .map((x) => x.message)
        .join(" · "),
    );
  }

  const { error } = await db.from("theme_custom_code").upsert(
    {
      merchant_id: merchantId,
      theme_id: themeId,
      version_id: versionId,
      css: row.css,
      js: row.js,
      head_snippet: row.head_snippet,
      body_start: row.body_start,
      body_end: row.body_end,
      js_requires_consent: row.js_requires_consent,
      enabled: row.enabled,
      findings: compiled.findings as unknown as Json,
    },
    { onConflict: "version_id", ignoreDuplicates: false },
  );
  if (error) throw new CustomCodeError("customcode.snapshot_failed", error.message);
  invalidate(CACHE_PREFIX);
  log("info", "customcode.published", { merchant_id: merchantId, version_id: versionId });
  return { snapshotted: true, findings: compiled.findings };
}

/** Restore a published snapshot back into the draft, ready to re-publish. */
export async function restoreCustomCode(db: Client, merchantId: string, themeId: string, versionId: string) {
  const { data } = await db
    .from("theme_custom_code")
    .select(COLUMNS)
    .eq("theme_id", themeId)
    .eq("version_id", versionId)
    .maybeSingle();
  const row = data as Row | null;
  if (!row) throw new CustomCodeError("customcode.snapshot_missing", "That version has no custom code.");
  return saveCustomCode(db, merchantId, { themeId, ...toCode(row) });
}

/** Platform owner kill switch (`17-owner-console`). RLS restricts the writer. */
export async function setCustomCodeKill(db: Client, merchantId: string, disabled: boolean, reason: string | null) {
  const { error } = await db
    .from("custom_code_kill_switch")
    .upsert({ merchant_id: merchantId, disabled, reason }, { onConflict: "merchant_id" });
  if (error) throw new CustomCodeError("customcode.kill_failed", error.message);
  invalidate(CACHE_PREFIX);
  log("warn", "customcode.kill_switch", { merchant_id: merchantId, disabled });
  return { ok: true };
}

/**
 * Storefront read: the published snapshot for the live theme version, compiled
 * and cached per tenant. Returns null when nothing is published, the merchant
 * disabled it, or the platform pulled the kill switch.
 */
export async function publishedCustomCode(merchantId: string): Promise<CompiledCustomCode | null> {
  const { renderRead } = await import("./render-read.server");
  return renderRead<CompiledCustomCode | null>({
    name: "custom_code.published",
    key: `${CACHE_PREFIX}${merchantId}`,
    fallback: null,
    ttlSeconds: 60,
    staleSeconds: 300,
    context: { merchant_id: merchantId },
    load: async () => {
      const { publicClient } = await import("./pricing.server");
      const db = publicClient() as unknown as Client;

      const [{ data: theme }, kill] = await Promise.all([
        db
          .from("store_themes")
          .select("id, published_version_id")
          .eq("merchant_id", merchantId)
          .eq("is_active", true)
          .maybeSingle(),
        killSwitch(db, merchantId),
      ]);
      if (kill.killed || !theme?.published_version_id) return null;

      const { data } = await db
        .from("theme_custom_code")
        .select(COLUMNS)
        .eq("version_id", theme.published_version_id)
        .maybeSingle();
      const row = data as Row | null;
      if (!row || !row.enabled) return null;

      const compiled = compileCustomCode(toCode(row));
      // A snapshot that would fail today's rules is dropped rather than served.
      if (compiled.blocked) {
        incr("framique_custom_code_blocked_total", { surface: "storefront" });
        return null;
      }
      return compiled;
    },
  });
}
