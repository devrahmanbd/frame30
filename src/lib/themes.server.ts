/**
 * Builder & themes server module.
 *
 * Every write goes through a SECURITY DEFINER RPC so tenancy is enforced in the
 * database, never in the client. Reads of the public registry are cached
 * per-isolate; tenant reads never are. All entry points are spanned and the
 * write paths are rate limited.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { cached, invalidate } from "./cache.server";
import { storefrontCacheKey, tenantCachePrefix } from "./storefront-cache";
import { assertTenantId } from "./tenant-scope";
import { incr, log, withSpan } from "./observability.server";
import { rateLimit } from "./rate-limit.server";
import {
  DEFAULT_TOKENS,
  TEMPLATE_KEYS,
  assertPayloadWithinLimits,
  takeSanitiserRejects,
  lintTemplate,
  parseAst,
  parseTemplates,
  parseTokens,
  templateOf,
  type TemplateKey,
  type ThemeTemplates,
  type ThemeTokens,
} from "./builder-ast";
import { THEME_PRESETS, presetByKey } from "./theme-presets";
import { PRESET_API_RANGE, checkApiCompatibility } from "./registry-version";
import { translationGate } from "./builder-guardrails";
import { translationCoverage } from "./translation-coverage";

type Client = SupabaseClient<Database>;

export class BuilderError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BuilderError";
  }
}

/* ------------------------------------------------------------- theme + draft */

export type ThemeSummary = {
  id: string;
  name: string;
  isActive: boolean;
  publishedVersionId: string | null;
  sourceKey: string | null;
  sourceVersion: string | null;
};

async function ensureTheme(db: Client, merchantId: string): Promise<ThemeSummary> {
  const { data, error } = await db
    .from("store_themes")
    .select("id, name, is_active, published_version_id, source_listing_slug, source_version")
    .eq("merchant_id", merchantId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    return {
      id: data.id,
      name: data.name,
      isActive: data.is_active,
      publishedVersionId: data.published_version_id,
      sourceKey: data.source_listing_slug,
      sourceVersion: data.source_version,
    };
  }
  const { data: created, error: createError } = await db
    .from("store_themes")
    .insert({ merchant_id: merchantId, name: "Default theme" })
    .select("id, name, is_active, published_version_id")
    .single();
  if (createError) throw createError;
  return {
    id: created.id,
    name: created.name,
    isActive: created.is_active,
    publishedVersionId: created.published_version_id,
    sourceKey: null,
    sourceVersion: null,
  };
}

export type VersionRow = {
  id: string;
  version: number;
  status: string;
  note: string | null;
  label: string | null;
  createdAt: string;
  publishedAt: string | null;
  rollbackOf: string | null;
};

export type ScheduleRow = {
  id: string;
  action: string;
  runAt: string;
  state: string;
  versionId: string | null;
  lastError: string | null;
};

export type BuilderWorkspace = {
  theme: ThemeSummary;
  templates: ThemeTemplates;
  tokens: ThemeTokens;
  revision: number;
  draftUpdatedAt: string | null;
  source: "draft" | "version" | "empty";
  versions: VersionRow[];
  schedules: ScheduleRow[];
  issues: Record<string, ReturnType<typeof lintTemplate>>;
};

/** Editor bootstrap: newest autosave draft wins over the newest committed version. */
export async function loadWorkspace(db: Client, merchantId: string): Promise<BuilderWorkspace> {
  return withSpan("builder.workspace", async () => {
    const theme = await ensureTheme(db, merchantId);

    const [draftRes, versionsRes, scheduleRes] = await Promise.all([
      db
        .from("theme_drafts")
        .select("templates, tokens, revision, updated_at")
        .eq("theme_id", theme.id)
        .maybeSingle(),
      db
        .from("theme_versions")
        .select(
          "id, version, status, note, label, created_at, published_at, rollback_of, templates, tokens, ast",
        )
        .eq("theme_id", theme.id)
        .order("version", { ascending: false })
        .limit(30),
      db
        .from("theme_schedules")
        .select("id, action, run_at, state, version_id, last_error")
        .eq("theme_id", theme.id)
        .order("run_at", { ascending: true })
        .limit(20),
    ]);
    if (versionsRes.error) throw versionsRes.error;

    const versionRows = versionsRes.data ?? [];
    const newest = versionRows[0];
    const draft = draftRes.data;

    let templates: ThemeTemplates;
    let tokens: ThemeTokens;
    let source: BuilderWorkspace["source"];
    if (draft) {
      templates = parseTemplates(draft.templates);
      tokens = parseTokens(draft.tokens);
      source = "draft";
    } else if (newest) {
      templates = parseTemplates(newest.templates ?? { index: newest.ast });
      tokens = parseTokens(newest.tokens);
      source = "version";
    } else {
      templates = parseTemplates({});
      tokens = { ...DEFAULT_TOKENS };
      source = "empty";
    }

    const issues: BuilderWorkspace["issues"] = {};
    for (const key of TEMPLATE_KEYS) issues[key] = lintTemplate(templateOf(templates, key));

    return {
      theme,
      templates,
      tokens,
      revision: draft?.revision ?? 0,
      draftUpdatedAt: draft?.updated_at ?? null,
      source,
      versions: versionRows.map((row) => ({
        id: row.id,
        version: row.version,
        status: row.status,
        note: row.note,
        label: row.label,
        createdAt: row.created_at,
        publishedAt: row.published_at,
        rollbackOf: row.rollback_of,
      })),
      schedules: (scheduleRes.data ?? []).map((row) => ({
        id: row.id,
        action: row.action,
        runAt: row.run_at,
        state: row.state,
        versionId: row.version_id,
        lastError: row.last_error,
      })),
      issues,
    };
  });
}

async function rpc<T>(db: Client, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (
    db as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: T; error: unknown }>;
    }
  ).rpc(fn, args);
  if (error) {
    const message = (error as { message?: string }).message ?? "builder.rpc_failed";
    throw new BuilderError(message.split(" ")[0] ?? "builder.rpc_failed", message);
  }
  return data;
}

/**
 * Structural gate for every untrusted builder payload: size and nesting are
 * checked before parsing, and sanitiser rejections are counted afterwards so
 * stripped markup, blocked links, and blocked embeds are visible in metrics.
 */
function parseUntrusted(input: { templates?: unknown; tokens?: unknown }, surface: string) {
  try {
    assertPayloadWithinLimits({ templates: input.templates ?? {}, tokens: input.tokens ?? {} });
  } catch (err) {
    const code = err instanceof Error ? err.message : "builder.payload_invalid";
    throw new BuilderError(code, "Theme content is too large or too deeply nested.");
  }
  takeSanitiserRejects();
  const templates = parseTemplates(input.templates);
  const tokens = parseTokens(input.tokens);
  const rejects = takeSanitiserRejects();
  if (rejects) {
    incr("framique_builder_sanitiser_rejects_total", { surface });
    log("warn", "builder.sanitised", { surface, rejects });
  }
  return { templates, tokens };
}

/** Autosave: last-writer-wins guarded by a monotonic client revision. */
export async function autosave(
  db: Client,
  merchantId: string,
  input: { themeId: string; templates?: unknown; tokens?: unknown; revision: number },
) {
  await rateLimit("builder.autosave", `${merchantId}`);
  const { templates, tokens } = parseUntrusted(input, "autosave");
  const result = await rpc<{ revision: number; applied: boolean }>(db, "theme_autosave", {
    _theme_id: input.themeId,
    _templates: templates as unknown as Json,
    _tokens: tokens as unknown as Json,
    _revision: input.revision,
  });
  incr("framique_builder_autosave_total", { applied: String(result.applied) });
  return result;
}

/** Commit an immutable snapshot. Identical consecutive drafts reuse the version. */
export async function commitVersion(
  db: Client,
  merchantId: string,
  input: { themeId: string; templates?: unknown; tokens?: unknown; note?: string; label?: string },
) {
  await rateLimit("builder.commit", merchantId);
  const { templates, tokens } = parseUntrusted(input, "commit");
  const versionId = await rpc<string>(db, "theme_commit", {
    _theme_id: input.themeId,
    _templates: templates as unknown as Json,
    _tokens: tokens as unknown as Json,
    _note: input.note ?? null,
    _label: input.label ?? null,
  });
  return { versionId };
}

/**
 * Phase 8.2: purge is tenant-scoped and happens on publish / rollback only.
 * Passing no merchant is an operator action (`purgeThemeCache`) and is the only
 * path allowed to clear every tenant.
 */
function purgeStorefront(reason: string, merchantId?: string) {
  invalidate(merchantId ? tenantCachePrefix(merchantId) : "storefront:");
  incr("framique_theme_purge_total", { reason, scope: merchantId ? "tenant" : "all" });
}

/** Publish blocks on lint errors: a broken page never reaches shoppers. */
export async function publishVersion(
  db: Client,
  merchantId: string,
  input: { themeId: string; templates?: unknown; tokens?: unknown; note?: string },
) {
  await rateLimit("builder.publish", merchantId);
  const { templates } = parseUntrusted(input, "publish");
  const lint = TEMPLATE_KEYS.flatMap((key) =>
    lintTemplate(templateOf(templates, key), key)
      .filter((issue) => issue.level === "error")
      .map((issue) => `${key}: ${issue.message}`),
  );
  // Phase 9: missing বাংলা only warns per string, but a theme that is more than
  // 10% untranslated cannot go live half-Bangla.
  const translation = translationGate(translationCoverage(templates)).map((issue) => issue.message);
  // Phase 3: a merchant-uploaded face without a licence attestation, or a
  // theme over the font loading budget, never reaches shoppers.
  const tokens = parseTokens(input.tokens);
  const fonts: string[] = [];
  {
    const { licenceGate, checkFontBudget } = await import("./theme-fonts");
    const { listFontAssets } = await import("./theme-fonts.server");
    const assets = await listFontAssets(db, merchantId).catch(() => []);
    fonts.push(...licenceGate(assets));
    fonts.push(...checkFontBudget(tokens).failures.map((f) => `fonts: ${f.message}`));
  }
  // Phase 6: parse clean + lint clean + ≥90% বাংলা + contrast in light/dark ×
  // EN/বাংলা + zero-CLS skeleton parity, composed in one place.
  const { composePublishGate } = await import("./publish-gates");
  const gate = composePublishGate({ tokens, lint, translation, fonts });
  if (!gate.ok) {
    const blocking = gate.failures.map((f) => f.message);
    log("warn", "theme.publish_blocked", {
      merchant_id: merchantId,
      codes: gate.failures.map((f) => f.code).join(","),
    });
    throw new BuilderError("builder.publish_blocked", blocking.slice(0, 5).join(" · "));
  }



  const { versionId } = await commitVersion(db, merchantId, { ...input, note: input.note });
  // Phase 4: custom code is versioned with the theme. A secret-scan or XSS
  // finding in the merchant's CSS/JS blocks the publish before it goes live.
  const { snapshotCustomCode } = await import("./custom-code.server");
  await snapshotCustomCode(db, merchantId, input.themeId, versionId);
  await rpc<string>(db, "theme_publish", { _version_id: versionId });
  purgeStorefront("publish", merchantId);
  log("info", "theme.published", { merchant_id: merchantId, version_id: versionId });
  return { versionId };
}

export async function rollbackVersion(db: Client, merchantId: string, versionId: string) {
  await rateLimit("builder.publish", merchantId);
  const newId = await rpc<string>(db, "theme_rollback", { _version_id: versionId });
  // The custom code that shipped with the target version rolls back with it.
  const { restoreCustomCode } = await import("./custom-code.server");
  const { data: target } = await db
    .from("theme_versions")
    .select("theme_id")
    .eq("id", versionId)
    .maybeSingle();
  if (target?.theme_id) {
    await restoreCustomCode(db, merchantId, target.theme_id, versionId).catch(() => null);
  }
  purgeStorefront("rollback", merchantId);
  log("warn", "theme.rolled_back", { merchant_id: merchantId, from: versionId, to: newId });
  return { versionId: newId };
}

export async function scheduleTheme(
  db: Client,
  merchantId: string,
  input: {
    themeId: string;
    versionId: string | null;
    action: "publish" | "unpublish";
    runAt: string;
  },
) {
  await rateLimit("builder.schedule", merchantId);
  const id = await rpc<string>(db, "theme_schedule_set", {
    _theme_id: input.themeId,
    _version_id: input.versionId,
    _action: input.action,
    _run_at: input.runAt,
  });
  return { id };
}

export async function cancelSchedule(db: Client, merchantId: string, scheduleId: string) {
  await rateLimit("builder.schedule", merchantId);
  await rpc<boolean>(db, "theme_schedule_cancel", { _schedule_id: scheduleId });
  return { ok: true };
}

/* ----------------------------------------------------------------- registry */

export type RegistryTheme = {
  key: string;
  nameEn: string;
  nameBn: string;
  summaryEn: string;
  summaryBn: string;
  category: string;
  version: string;
  tokens: ThemeTokens;
  templateKeys: string[];
};

/** Code presets rendered as catalogue rows — the fallback when SQL is empty. */
function presetCatalogue(): RegistryTheme[] {
  return THEME_PRESETS.slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((preset) => ({
      key: preset.key,
      nameEn: preset.nameEn,
      nameBn: preset.nameBn,
      summaryEn: preset.summaryEn,
      summaryBn: preset.summaryBn,
      category: preset.category,
      version: preset.version,
      tokens: preset.tokens,
      templateKeys: Object.keys(preset.templates),
    }));
}

/**
 * Public catalogue — tenant-agnostic, so it is safe to cache per isolate.
 * Catalogue *metadata* lives in the database, but the template package itself
 * is the typed preset in `theme-presets.ts`, which is the real source of truth.
 *
 * Consequence: an empty (or unreachable) `theme_registry` must not empty the
 * theme picker — a fresh environment that has never run the catalogue sync
 * would otherwise show a merchant zero themes and no way to start. The code
 * presets are therefore the floor, and SQL rows only override the metadata of
 * keys they name. A read error degrades to the same floor rather than throwing
 * a picker-sized hole into the admin UI.
 */
export async function listRegistry(db: Client): Promise<RegistryTheme[]> {
  return cached("theme-registry:v3", 300, async () => {
    const floor = presetCatalogue();
    const { data, error } = await db
      .from("theme_registry")
      .select("key, name_en, name_bn, summary_en, summary_bn, category, version, preset")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) {
      incr("framique_theme_registry_fallback", { reason: "read_error" });
      log("warn", "theme_registry.read_failed", { message: error.message });
      return floor;
    }
    const rows = data ?? [];
    if (!rows.length) {
      incr("framique_theme_registry_fallback", { reason: "empty" });
      return floor;
    }
    const byKey = new Map(floor.map((theme) => [theme.key, theme]));
    for (const row of rows) {
      const code = presetByKey(row.key);
      const dbPreset = (row.preset ?? {}) as { tokens?: unknown; templates?: unknown };
      const tokens = code ? code.tokens : parseTokens(dbPreset.tokens);
      const templates = code ? code.templates : parseTemplates(dbPreset.templates);
      byKey.set(row.key, {
        key: row.key,
        nameEn: row.name_en,
        nameBn: row.name_bn,
        summaryEn: row.summary_en,
        summaryBn: row.summary_bn,
        category: row.category,
        version: code?.version ?? row.version,
        tokens,
        templateKeys: Object.keys(templates),
      });
    }
    // DB order first (it is the curated one), then any preset SQL never listed.
    const ordered = rows.map((row) => byKey.get(row.key)!).filter(Boolean);
    const seen = new Set(ordered.map((theme) => theme.key));
    return [...ordered, ...floor.filter((theme) => !seen.has(theme.key))];
  });
}


/** Full template count shipped by the official themes, for docs and tests. */
export function officialThemeKeys(): string[] {
  return THEME_PRESETS.map((preset) => preset.key);
}

/** Validated official package, or a BuilderError if the preset is unusable. */
function registryPackage(key: string): {
  templates: ThemeTemplates;
  tokens: ThemeTokens;
  version: string;
} {
  const preset = presetByKey(key);
  const templates = preset ? parseTemplates(preset.templates) : ({} as ThemeTemplates);
  const templateKeys = Object.keys(templates) as TemplateKey[];
  const blocked = templateKeys.flatMap((templateKey) =>
    lintTemplate(templates[templateKey]!, templateKey).filter((issue) => issue.level === "error"),
  );
  if (!preset || templateKeys.length === 0 || blocked.length > 0) {
    throw new BuilderError("builder.registry_invalid", "Theme package failed validation");
  }
  // Phase 8 registry versioning: a package built for another builder API line
  // is never installed, so an old AST can't reach a newer runtime.
  const compat = checkApiCompatibility(preset.api ?? PRESET_API_RANGE);
  if (!compat.ok) throw new BuilderError(compat.code, compat.message);
  return { templates, tokens: parseTokens(preset.tokens), version: preset.version };
}

/**
 * Install an official theme as a draft version *and* fork it into the editable
 * draft. The package is validated and linted server-side before the RPC runs,
 * so a broken preset can never replace a merchant's last-good theme, and an
 * existing draft is only replaced when the merchant confirms.
 */
export async function installRegistryTheme(
  db: Client,
  merchantId: string,
  key: string,
  overwriteDraft = false,
) {
  await rateLimit("builder.install", merchantId);
  return withSpan("builder.install", async () => {
    const catalogue = await listRegistry(db);
    const entry = catalogue.find((t) => t.key === key);
    if (!entry)
      throw new BuilderError("builder.registry_missing", "Theme not found in the registry");
    let pkg: { templates: ThemeTemplates; tokens: ThemeTokens };
    try {
      pkg = registryPackage(key);
    } catch (err) {
      incr("framique_theme_install_total", { result: "rejected" });
      throw err;
    }
    const versionId = await rpc<string>(db, "theme_install_preset", {
      _merchant_id: merchantId,
      _key: key,
      _preset: { tokens: pkg.tokens, templates: pkg.templates } as unknown as Json,
      _overwrite_draft: overwriteDraft,
    });
    incr("framique_theme_install_total", { result: "ok" });
    // Phase 5: every official theme ships starter SEO templates. Seeding never
    // overwrites merchant-authored copy and never fails the install.
    try {
      const { seedSeoTemplates } = await import("./seo.server");
      await seedSeoTemplates(db, merchantId, key);
    } catch (err) {
      log("warn", "theme.seo_seed_failed", { merchant_id: merchantId, key, message: String(err) });
    }
    log("info", "theme.installed", {
      merchant_id: merchantId,
      key,
      version_id: versionId,
      templates: Object.keys(pkg.templates).length,
      overwrote_draft: overwriteDraft,
    });
    return { versionId };
  });
}

/**
 * Phase 3.1 — preset swap without content loss. Tokens are replaced wholesale;
 * every authored section keeps its props and preset sections are only appended
 * when the merchant's document has no widget of that type. Returns the merged
 * document so the studio can show a confirmation before autosaving it.
 */
export async function previewPresetSwap(
  db: Client,
  merchantId: string,
  key: string,
  currentTemplates: unknown,
) {
  await rateLimit("builder.preset_swap", merchantId);
  const catalogue = await listRegistry(db);
  if (!catalogue.some((t) => t.key === key)) {
    throw new BuilderError("builder.registry_missing", "Theme not found in the registry");
  }
  const preset = presetByKey(key);
  if (!preset)
    throw new BuilderError("builder.registry_invalid", "Theme package failed validation");
  const mine = parseTemplates(currentTemplates);
  const { applyPreset } = await import("./theme-presets");
  const result = applyPreset(mine, preset);
  return {
    key,
    tokens: result.tokens,
    templates: parseTemplates(result.templates),
    kept: result.kept,
    added: result.added,
  };
}

/* ------------------------------------------------------------ update / diff */

export type TemplateDiff = {
  template: TemplateKey;
  added: string[];
  removed: string[];
  changed: string[];
};

export type ThemeUpdatePreview = {
  key: string;
  installedVersion: string | null;
  latestVersion: string;
  available: boolean;
  tokensChanged: boolean;
  diff: TemplateDiff[];
  revision: number;
};

export type UpdateMode = "adopt" | "keep_mine";

function digestSection(section: {
  props: Record<string, unknown>;
  hidden?: unknown;
  bp?: unknown;
}) {
  return JSON.stringify([section.props, section.hidden ?? null, section.bp ?? null]);
}

function sectionsOf(templates: ThemeTemplates, key: TemplateKey) {
  const ast = templateOf(templates, key);
  return [...ast.header, ...ast.main, ...ast.footer];
}

/** Section-level diff between the merchant's current tree and the new package. */
export function diffTemplates(mine: ThemeTemplates, upstream: ThemeTemplates): TemplateDiff[] {
  const out: TemplateDiff[] = [];
  for (const key of TEMPLATE_KEYS) {
    const mineMap = new Map(sectionsOf(mine, key).map((s) => [s.id, s]));
    const upMap = new Map(sectionsOf(upstream, key).map((s) => [s.id, s]));
    const added = [...upMap.keys()].filter((id) => !mineMap.has(id));
    const removed = [...mineMap.keys()].filter((id) => !upMap.has(id));
    const changed = [...upMap.keys()].filter(
      (id) => mineMap.has(id) && digestSection(upMap.get(id)!) !== digestSection(mineMap.get(id)!),
    );
    if (added.length || removed.length || changed.length)
      out.push({ template: key, added, removed, changed });
  }
  return out;
}

/**
 * `adopt` takes the new package as the base and keeps merchant-only sections;
 * `keep_mine` keeps the merchant tree and only appends genuinely new sections.
 */
export function mergeTemplates(
  mine: ThemeTemplates,
  upstream: ThemeTemplates,
  mode: UpdateMode,
): ThemeTemplates {
  const merged: ThemeTemplates = {};
  for (const key of TEMPLATE_KEYS) {
    const mineAst = templateOf(mine, key);
    const upAst = templateOf(upstream, key);
    const hasUp = upAst.header.length || upAst.main.length || upAst.footer.length;
    const hasMine = mineAst.header.length || mineAst.main.length || mineAst.footer.length;
    if (!hasUp && !hasMine) continue;
    if (!hasUp) {
      merged[key] = mineAst;
      continue;
    }
    if (mode === "adopt") {
      const upIds = new Set(sectionsOf(upstream, key).map((s) => s.id));
      merged[key] = {
        header: [...upAst.header, ...mineAst.header.filter((s) => !upIds.has(s.id))],
        main: [...upAst.main, ...mineAst.main.filter((s) => !upIds.has(s.id))],
        footer: [...upAst.footer, ...mineAst.footer.filter((s) => !upIds.has(s.id))],
      };
    } else {
      const mineIds = new Set(sectionsOf(mine, key).map((s) => s.id));
      merged[key] = {
        header: [...mineAst.header, ...upAst.header.filter((s) => !mineIds.has(s.id))],
        main: [...mineAst.main, ...upAst.main.filter((s) => !mineIds.has(s.id))],
        footer: [...mineAst.footer, ...upAst.footer.filter((s) => !mineIds.has(s.id))],
      };
    }
  }
  return merged;
}

/** What an update would change, computed against the merchant's live draft. */
export async function previewThemeUpdate(
  db: Client,
  merchantId: string,
  key?: string,
): Promise<ThemeUpdatePreview | null> {
  return withSpan("builder.update_preview", async () => {
    const workspace = await loadWorkspace(db, merchantId);
    const targetKey = key ?? workspace.theme.sourceKey;
    if (!targetKey) return null;
    const catalogue = await listRegistry(db);
    const entry = catalogue.find((t) => t.key === targetKey);
    if (!entry)
      throw new BuilderError("builder.registry_missing", "Theme not found in the registry");
    const pkg = registryPackage(targetKey);
    const installedVersion =
      key && key !== workspace.theme.sourceKey ? null : workspace.theme.sourceVersion;
    return {
      key: targetKey,
      installedVersion,
      latestVersion: pkg.version,
      available: installedVersion !== pkg.version,
      tokensChanged: JSON.stringify(pkg.tokens) !== JSON.stringify(workspace.tokens),
      diff: diffTemplates(workspace.templates, pkg.templates),
      revision: workspace.revision,
    };
  });
}

/**
 * Apply a registry update with the merchant's chosen merge. The draft revision
 * the preview was computed against is passed through, so a concurrent editor
 * cannot have their work silently merged away.
 */
export async function applyThemeUpdate(
  db: Client,
  merchantId: string,
  input: { key: string; mode: UpdateMode; expectedRevision: number },
) {
  await rateLimit("builder.update", merchantId);
  return withSpan("builder.update", async () => {
    const workspace = await loadWorkspace(db, merchantId);
    const pkg = registryPackage(input.key);
    const templates = mergeTemplates(workspace.templates, pkg.templates, input.mode);
    const blocking = (Object.keys(templates) as TemplateKey[]).flatMap((templateKey) =>
      lintTemplate(templates[templateKey]!, templateKey).filter((issue) => issue.level === "error"),
    );
    if (blocking.length) {
      incr("framique_theme_update_total", { result: "rejected" });
      throw new BuilderError("builder.update_blocked", "Merged theme failed validation");
    }
    const tokens = input.mode === "adopt" ? pkg.tokens : workspace.tokens;
    const result = await rpc<{ version_id: string; revision: number }>(db, "theme_update_apply", {
      _theme_id: workspace.theme.id,
      _key: input.key,
      _version: pkg.version,
      _templates: templates as unknown as Json,
      _tokens: tokens as unknown as Json,
      _mode: input.mode,
      _expected_revision: input.expectedRevision,
    });
    incr("framique_theme_update_total", { result: input.mode });
    log("info", "theme.updated", {
      merchant_id: merchantId,
      key: input.key,
      version: pkg.version,
      mode: input.mode,
      version_id: result.version_id,
    });
    return { versionId: result.version_id, revision: result.revision };
  });
}

/* -------------------------------------------------------- storefront runtime */

export type PublishedTheme = {
  templates: ThemeTemplates;
  tokens: ThemeTokens;
  /** Official theme key that was installed, used to pick the SEO profile. */
  themeKey: string | null;
  /** Immutable published version id — the cache-key and ETag dimension. */
  versionId: string;
};

/** Published layout + tokens for a store. Cached under a tenant-keyed prefix. */
export async function publishedTheme(
  db: Client,
  merchantId: string,
): Promise<PublishedTheme | null> {
  // Tenant isolation starts at the data layer, before any query is built.
  assertTenantId(merchantId, "publishedTheme");
  // Templates and locales share one snapshot (the AST carries both languages),
  // so this value is keyed `tenant · * · * · <version>` once the pointer is
  // read. The pointer lookup itself is the only uncached hop.
  const pointer = await cached(
    storefrontCacheKey({ merchantId, template: "pointer" }),
    30,
    async () => {
      const { data } = await db
        .from("store_themes")
        .select("published_version_id, source_listing_slug")
        .eq("merchant_id", merchantId)
        .eq("is_active", true)
        .maybeSingle();
      return data ?? null;
    },
  );
  if (!pointer?.published_version_id) return null;
  const versionId: string = pointer.published_version_id;
  return cached(
    storefrontCacheKey({ merchantId, template: "*", themeVersion: versionId }),
    300,
    async () => {
      const theme = pointer;
      // Tenant scoping is enforced here, not assumed from the pointer: even a
      // tampered published_version_id can only ever resolve inside this merchant.
      const { data: version } = await db
        .from("theme_versions")
        .select("ast, templates, tokens")
        .eq("id", versionId)
        .eq("merchant_id", merchantId)
        .eq("status", "published")
        .maybeSingle();
      if (!version) return null;
      const templates = parseTemplates(
        version.templates && Object.keys(version.templates as object).length
          ? version.templates
          : { index: parseAst(version.ast) },
      );
      return {
        templates,
        tokens: parseTokens(version.tokens),
        themeKey: theme.source_listing_slug ?? null,
        versionId,
      };
    },
  );
}

/**
 * Phase 17 — per-page theme override.
 *
 * A page may pin itself to any installed theme (`storefront_pages.theme_id`).
 * The pinned theme still has to belong to this merchant and still has to have
 * a published version, so a stale pin degrades to the active theme rather than
 * to a blank page.
 */
export async function publishedThemeById(
  db: Client,
  merchantId: string,
  themeId: string,
): Promise<PublishedTheme | null> {
  assertTenantId(merchantId, "publishedThemeById");
  return cached(
    storefrontCacheKey({ merchantId, template: "pinned", themeVersion: themeId }),
    120,
    async () => {
      const { data: theme } = await db
        .from("store_themes")
        .select("published_version_id, source_listing_slug")
        .eq("id", themeId)
        .eq("merchant_id", merchantId)
        .maybeSingle();
      if (!theme?.published_version_id) return null;
      const { data: version } = await db
        .from("theme_versions")
        .select("ast, templates, tokens")
        .eq("id", theme.published_version_id)
        .eq("merchant_id", merchantId)
        .eq("status", "published")
        .maybeSingle();
      if (!version) return null;
      const templates = parseTemplates(
        version.templates && Object.keys(version.templates as object).length
          ? version.templates
          : { index: parseAst(version.ast) },
      );
      return {
        templates,
        tokens: parseTokens(version.tokens),
        themeKey: theme.source_listing_slug ?? null,
        versionId: theme.published_version_id,
      };
    },
  );
}

/* ------------------------------------------------------- demo content import */

export type DemoImportResult = {
  imported: boolean;
  products: number;
  categories: number;
  collections: number;
  versionId: string | null;
};

function demoResult(raw: unknown): DemoImportResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const status = typeof r.status === "string" ? r.status : "";
  return {
    imported: Boolean(r.imported ?? r.purged ?? (status === "imported" || status === "purged")),
    products: Number(r.products ?? 0),
    categories: Number(r.categories ?? 0),
    collections: Number(r.collections ?? 0),
    versionId: typeof r.version_id === "string" ? r.version_id : null,
  };
}

/**
 * Phase 8 — one-click demo store, Phase 4 — per-vertical catalogues. Idempotent:
 * the RPC flags every row it writes with `is_demo`, so a second call is a no-op
 * instead of a duplicate catalogue, and the preset's `index` layout is written
 * into the merchant's draft so the imported products have a page to appear on.
 */
export async function importDemoContent(db: Client, merchantId: string, themeKey: string) {
  assertTenantId(merchantId, "importDemoContent");
  await rateLimit("builder.demo_import", merchantId);
  return withSpan("builder.demo_import", async () => {
    const pkg = registryPackage(themeKey);
    const { demoCatalogFor } = await import("./demo-catalog");
    const raw = await rpc<unknown>(db, "theme_import_demo", {
      _merchant_id: merchantId,
      _theme_key: themeKey,
      _ast: templateOf(pkg.templates, "index") as unknown as Json,
      _tokens: pkg.tokens as unknown as Json,
      _catalog: demoCatalogFor(themeKey) as unknown as Json,
    });
    const result = demoResult(raw);
    incr("framique_theme_demo_total", { action: "import", result: result.imported ? "ok" : "noop" });
    log("info", "theme.demo_imported", { merchant_id: merchantId, key: themeKey, ...result });
    purgeStorefront("demo_import", merchantId);
    return result;
  });
}

/** Removes only `is_demo` rows, so a merchant's real catalogue is untouched. */
export async function purgeDemoContent(db: Client, merchantId: string) {
  assertTenantId(merchantId, "purgeDemoContent");
  await rateLimit("builder.demo_import", merchantId);
  return withSpan("builder.demo_purge", async () => {
    const result = demoResult(await rpc<unknown>(db, "theme_purge_demo", { _merchant_id: merchantId }));
    incr("framique_theme_demo_total", { action: "purge", result: result.imported ? "ok" : "noop" });
    log("info", "theme.demo_purged", { merchant_id: merchantId, ...result });
    purgeStorefront("demo_purge", merchantId);
    return result;
  });
}


export function purgeThemeCache() {
  purgeStorefront("manual");
}

export type { TemplateKey };
