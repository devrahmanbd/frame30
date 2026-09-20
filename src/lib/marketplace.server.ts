import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { THEME_PRESETS } from "./theme-presets";
import { BUILTIN_PREFIX, builtinWidgets } from "./builtin-plugins";
import { catalogMeta } from "./themes/catalog-meta";

type Client = SupabaseClient<Database>;

export const APP_VERSION = "1.4.0";
export const APP_MAJOR = "1.x";
export const TRIAL_DAYS = 14;
export const SELLER_SHARE_BASIS_POINTS = 7000;

export { BUILTIN_PREFIX };

export type Kind = "theme" | "widget";

const LISTING_COLUMNS =
  "id, seller_merchant_id, name, slug, description, vendor_name, thumbnail_url, category, version, compatible_versions, price_minor_int, currency_code, trial_allowed, status, manifest, version_history, install_count, rating_sum, rating_count, created_at";

export function table(kind: Kind) {
  return kind === "theme"
    ? ("marketplace_themes" as const)
    : ("marketplace_widgets" as const);
}

export function isCompatible(compatible: unknown) {
  const list = Array.isArray(compatible) ? compatible.map(String) : [];
  if (list.length === 0) return true;
  return list.includes(APP_MAJOR) || list.includes(APP_VERSION);
}

export async function listCatalog(db: Client, merchantId: string) {
  const [themes, widgets, installs, themeRows] = await Promise.all([
    db
      .from("marketplace_themes")
      .select(LISTING_COLUMNS)
      .order("install_count", { ascending: false }),
    db
      .from("marketplace_widgets")
      .select(LISTING_COLUMNS)
      .order("install_count", { ascending: false }),
    db
      .from("marketplace_installs")
      .select(
        "id, kind, theme_id, widget_id, listing_slug, listing_name, status, is_trial, price_minor_int, currency_code, started_at, expires_at",
      )
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false }),
    db
      .from("store_themes")
      .select("id, is_active, source_install_id, source_listing_slug, name")
      .eq("merchant_id", merchantId),
  ]);

  const decorate = (rows: typeof themes.data, kind: Kind) =>
    (rows ?? []).map((r) => ({
      ...r,
      kind,
      compatible: isCompatible(r.compatible_versions),
      rating: r.rating_count ? r.rating_sum / r.rating_count : null,
      mine: r.seller_merchant_id === merchantId,
      builtin: false as const,
      tags: [] as string[],
      features: [] as string[],
      layouts: [] as string[],
      subjects: [] as string[],
    }));

  // WordPress parity: which installed listings already have a theme row,
  // and which of those is live. Linked through source_install_id or source_listing_slug.
  const installById = new Map(
    ((installs.data ?? []) as { id: string; listing_slug: string }[]).map(
      (i) => [i.id, i],
    ),
  );
  const themeStates = (
    (themeRows.data ?? []) as {
      id: string;
      is_active: boolean;
      source_install_id: string | null;
      source_listing_slug?: string | null;
      name?: string | null;
    }[]
  ).flatMap((t) => {
    const inst = t.source_install_id
      ? installById.get(t.source_install_id)
      : undefined;
    let slug = inst?.listing_slug ?? t.source_listing_slug;
    if (!slug && t.name) {
      const match = THEME_PRESETS.find(
        (p) => p.nameEn.toLowerCase() === (t.name ?? "").toLowerCase(),
      );
      if (match) slug = match.key;
    }
    return slug ? [{ slug, themeId: t.id, isActive: t.is_active }] : [];
  });

  return {
    // Official presets first: the marketplace is never an empty shelf even
    // when no third-party creator has published yet.
    themes: [
      ...builtinThemes(),
      ...decorate(themes.data, "theme").filter(
        (r) => r.status === "active" || r.mine,
      ),
    ],
    widgets: [
      ...builtinWidgets(),
      ...decorate(widgets.data, "widget").filter(
        (r) => r.status === "active" || r.mine,
      ),
    ],
    installs: installs.data ?? [],
    themeStates,
  };
}

/**
 * Official built-in themes as synthetic catalog entries. They carry no DB
 * row, no price and no trial — installing one creates a NEW INACTIVE theme
 * (see installBuiltinTheme) instead of going through the marketplace
 * ledger, consent and payment flow.
 */
function builtinThemes() {
  return THEME_PRESETS.map((p) => {
    const meta = catalogMeta(p.key);
    return {
      id: `${BUILTIN_PREFIX}${p.key}`,
      seller_merchant_id: null as string | null,
      name: p.nameEn,
      slug: p.key,
      description: p.summaryEn,
      vendor_name: meta.author || "Framique",
      thumbnail_url: null as string | null,
      category: p.category,
      version: p.version,
      compatible_versions: [] as string[],
      price_minor_int: 0,
      currency_code: "BDT",
      trial_allowed: false,
      status: "active",
      manifest: null,
      version_history: [] as string[],
      install_count: meta.installs || 0,
      rating_sum: 0,
      rating_count: 0,
      created_at: new Date(0).toISOString(),
      kind: "theme" as const,
      compatible: true,
      rating: meta.rating ?? null,
      mine: false,
      builtin: true as const,
      tags: meta.tags ?? [],
      features: meta.features ?? [],
      layouts: meta.layouts ?? [],
      subjects: meta.subjects ?? [],
    };
  });
}

export async function listMine(db: Client, merchantId: string) {
  const [themes, widgets, ledger] = await Promise.all([
    db
      .from("marketplace_themes")
      .select(LISTING_COLUMNS)
      .eq("seller_merchant_id", merchantId),
    db
      .from("marketplace_widgets")
      .select(LISTING_COLUMNS)
      .eq("seller_merchant_id", merchantId),
    db
      .from("wallet_ledger_entries")
      .select(
        "id, source, direction, gross_minor_int, seller_minor_int, platform_minor_int, currency_code, memo, created_at",
      )
      .eq("counterparty_merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  return {
    themes: (themes.data ?? []).map((r) => ({ ...r, kind: "theme" as const })),
    widgets: (widgets.data ?? []).map((r) => ({
      ...r,
      kind: "widget" as const,
    })),
    ledger: ledger.data ?? [],
  };
}

export async function listModeration(db: Client) {
  const [themes, widgets] = await Promise.all([
    db
      .from("marketplace_themes")
      .select(LISTING_COLUMNS)
      .in("status", ["review", "active", "paused"]),
    db
      .from("marketplace_widgets")
      .select(LISTING_COLUMNS)
      .in("status", ["review", "active", "paused"]),
  ]);
  return [
    ...(themes.data ?? []).map((r) => ({ ...r, kind: "theme" as const })),
    ...(widgets.data ?? []).map((r) => ({ ...r, kind: "widget" as const })),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function isPlatformAdmin(db: Client, userId: string) {
  const { data } = await db
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}
