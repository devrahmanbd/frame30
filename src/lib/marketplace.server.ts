import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export const APP_VERSION = "1.4.0";
export const APP_MAJOR = "1.x";
export const TRIAL_DAYS = 14;
export const SELLER_SHARE_BASIS_POINTS = 7000;

export type Kind = "theme" | "widget";

const LISTING_COLUMNS =
  "id, seller_merchant_id, name, slug, description, vendor_name, thumbnail_url, category, version, compatible_versions, price_minor_int, currency_code, trial_allowed, status, manifest, version_history, install_count, rating_sum, rating_count, created_at";

export function table(kind: Kind) {
  return kind === "theme" ? ("marketplace_themes" as const) : ("marketplace_widgets" as const);
}

export function isCompatible(compatible: unknown) {
  const list = Array.isArray(compatible) ? compatible.map(String) : [];
  if (list.length === 0) return true;
  return list.includes(APP_MAJOR) || list.includes(APP_VERSION);
}

export async function listCatalog(db: Client, merchantId: string) {
  const [themes, widgets, installs] = await Promise.all([
    db.from("marketplace_themes").select(LISTING_COLUMNS).order("install_count", { ascending: false }),
    db.from("marketplace_widgets").select(LISTING_COLUMNS).order("install_count", { ascending: false }),
    db
      .from("marketplace_installs")
      .select("id, kind, theme_id, widget_id, listing_name, status, is_trial, price_minor_int, currency_code, started_at, expires_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false }),
  ]);

  const decorate = (rows: typeof themes.data, kind: Kind) =>
    (rows ?? []).map((r) => ({
      ...r,
      kind,
      compatible: isCompatible(r.compatible_versions),
      rating: r.rating_count ? r.rating_sum / r.rating_count : null,
      mine: r.seller_merchant_id === merchantId,
    }));

  return {
    themes: decorate(themes.data, "theme").filter((r) => r.status === "active" || r.mine),
    widgets: decorate(widgets.data, "widget").filter((r) => r.status === "active" || r.mine),
    installs: installs.data ?? [],
  };
}

export async function listMine(db: Client, merchantId: string) {
  const [themes, widgets, ledger] = await Promise.all([
    db.from("marketplace_themes").select(LISTING_COLUMNS).eq("seller_merchant_id", merchantId),
    db.from("marketplace_widgets").select(LISTING_COLUMNS).eq("seller_merchant_id", merchantId),
    db
      .from("wallet_ledger_entries")
      .select("id, source, direction, gross_minor_int, seller_minor_int, platform_minor_int, currency_code, memo, created_at")
      .eq("counterparty_merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  return {
    themes: (themes.data ?? []).map((r) => ({ ...r, kind: "theme" as const })),
    widgets: (widgets.data ?? []).map((r) => ({ ...r, kind: "widget" as const })),
    ledger: ledger.data ?? [],
  };
}

export async function listModeration(db: Client) {
  const [themes, widgets] = await Promise.all([
    db.from("marketplace_themes").select(LISTING_COLUMNS).in("status", ["review", "active", "paused"]),
    db.from("marketplace_widgets").select(LISTING_COLUMNS).in("status", ["review", "active", "paused"]),
  ]);
  return [
    ...(themes.data ?? []).map((r) => ({ ...r, kind: "theme" as const })),
    ...(widgets.data ?? []).map((r) => ({ ...r, kind: "widget" as const })),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function isPlatformAdmin(db: Client, userId: string) {
  const { data } = await db.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
}
