import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { money } from "./money";
import {
  APP_VERSION,
  SELLER_SHARE_BASIS_POINTS,
  TRIAL_DAYS,
  isCompatible,
  table,
  type Kind,
} from "./marketplace.server";

type Client = SupabaseClient<Database>;

export type InstallInput = {
  kind: Kind;
  listingId: string;
  trial: boolean;
  idempotencyKey: string;
  /** Pinned vault version the consent screen showed the merchant. */
  versionId?: string | null;
  /** Scopes the merchant explicitly approved on that screen. */
  grantedScopes?: string[];
  /** Admin user who clicked approve on the consent screen. */
  consentedBy?: string | null;
};

function split(gross: number) {
  const seller = Math.floor((gross * SELLER_SHARE_BASIS_POINTS) / 10_000);
  return { seller, platform: gross - seller };
}

async function loadListing(db: Client, kind: Kind, id: string) {
  const { data } = await db.from(table(kind)).select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("market_listing_not_found");
  if (data.status !== "active") throw new Error("market_listing_not_active");
  if (!isCompatible(data.compatible_versions)) throw new Error("market_version_mismatch");
  return data;
}

function impactedNodes(manifest: unknown) {
  const m = (manifest ?? {}) as { breaking_nodes?: unknown };
  return Array.isArray(m.breaking_nodes) ? m.breaking_nodes.map(String) : [];
}

export async function installListing(
  db: Client,
  merchantId: string,
  input: InstallInput,
) {
  const { data: existingKey } = await db
    .from("marketplace_installs")
    .select("id, status")
    .eq("merchant_id", merchantId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existingKey) return { installId: existingKey.id, replayed: true, impacted: [] as string[] };

  const listing = await loadListing(db, input.kind, input.listingId);
  if (input.trial && !listing.trial_allowed) throw new Error("market_trial_not_allowed");

  // Consent gate: an install may never receive more scopes than the merchant
  // saw and approved, and never fewer than the pinned version requires.
  const granted = Array.from(new Set(input.grantedScopes ?? [])).sort();
  let pinned: { id: string; version: string; scopes: string[] } | null = null;
  if (input.versionId) {
    const { data: version } = await db
      .from("marketplace_versions")
      .select("id, version, scopes, status, listing_id, kind")
      .eq("id", input.versionId)
      .maybeSingle();
    if (!version) throw new Error("market_version_not_found");
    if (version.listing_id !== listing.id || version.kind !== input.kind)
      throw new Error("market_version_mismatch");
    if (version.status !== "active") throw new Error("market_version_not_published");
    const { missingScopes } = await import("./marketplace-scopes");
    const missing = missingScopes(version.scopes ?? [], granted);
    if (missing.length) throw new Error(`market_consent_required:${missing.join(",")}`);
    pinned = { id: version.id, version: version.version, scopes: version.scopes ?? [] };
  }

  const charge = input.trial ? 0 : listing.price_minor_int;
  const previous = await snapshotCurrent(db, merchantId, input.kind);

  const { data: install, error } = await db
    .from("marketplace_installs")
    .insert({
      merchant_id: merchantId,
      kind: input.kind,
      theme_id: input.kind === "theme" ? listing.id : null,
      widget_id: input.kind === "widget" ? listing.id : null,
      listing_slug: listing.slug,
      listing_name: listing.name,
      version: pinned?.version ?? listing.version,
      version_id: pinned?.id ?? null,
      granted_scopes: pinned ? pinned.scopes : granted,
      consented_at: pinned || granted.length ? new Date().toISOString() : null,
      consented_by: input.consentedBy ?? null,
      price_minor_int: charge,
      currency_code: listing.currency_code,
      is_trial: input.trial,
      status: input.trial ? "trial" : "installed",
      idempotency_key: input.idempotencyKey,
      previous_snapshot: previous as never,
      expires_at: input.trial
        ? new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString()
        : null,
    })
    .select("id")
    .single();
  if (error || !install) throw new Error("market_install_failed");

  if (charge > 0) {
    const { seller, platform } = split(charge);
    const { postLedgerEntry } = await import("./ledger.server");
    try {
      await postLedgerEntry(db, {
        merchantId,
        counterpartyMerchantId: listing.seller_merchant_id,
        source: input.kind === "theme" ? "market.theme.installed" : "market.widget.installed",
        referenceId: install.id,
        direction: "debit",
        gross: money(seller + platform, listing.currency_code),
        platformFee: money(platform, listing.currency_code),
        idempotencyKey: input.idempotencyKey,
        memo: `${listing.name} v${listing.version}`,
      });
    } catch {
      await db.from("marketplace_installs").delete().eq("id", install.id);
      throw new Error("market_payment_failed");
    }
  }

  await db
    .from(table(input.kind))
    .update({ install_count: listing.install_count + 1 })
    .eq("id", listing.id);

  const applied = input.kind === "theme" ? await applyTheme(db, install.id) : null;

  return {
    installId: install.id,
    replayed: false,
    impacted: impactedNodes(listing.manifest),
    appVersion: APP_VERSION,
    themeApplied: applied?.ok ?? null,
    themeNoticeKey: applied?.noticeKey ?? null,
  };
}

async function applyTheme(db: Client, installId: string) {
  const { error } = await db.rpc("market_apply_theme_install", { _install_id: installId });
  if (!error) return { ok: true, noticeKey: "marketplace.theme.applied" };
  if (error.message.includes("market.theme_manifest_missing_ast")) {
    return { ok: false, noticeKey: "marketplace.theme.no_ast" };
  }
  return { ok: false, noticeKey: "marketplace.theme.apply_failed" };
}

async function revertTheme(db: Client, installId: string) {
  const { error } = await db.rpc("market_revert_theme_install", { _install_id: installId });
  return { ok: !error, noticeKey: error ? "marketplace.theme.revert_failed" : "marketplace.theme.reverted" };
}

async function snapshotCurrent(db: Client, merchantId: string, kind: Kind) {
  const { data } = await db
    .from("marketplace_installs")
    .select("id, listing_slug, version, status")
    .eq("merchant_id", merchantId)
    .eq("kind", kind)
    .in("status", ["installed", "trial"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? {};
}

export async function setInstallStatus(
  db: Client,
  merchantId: string,
  installId: string,
  status: "paused" | "installed" | "rolled_back",
) {
  const { data: row } = await db
    .from("marketplace_installs")
    .select("id, status, is_trial, kind")
    .eq("merchant_id", merchantId)
    .eq("id", installId)
    .maybeSingle();
  if (!row) throw new Error("market_install_not_found");
  if (row.status === "rolled_back") throw new Error("market_install_rolled_back");

  const next = status === "installed" && row.is_trial ? "trial" : status;
  const { error } = await db
    .from("marketplace_installs")
    .update({ status: next })
    .eq("merchant_id", merchantId)
    .eq("id", installId);
  if (error) throw new Error("market_install_update_failed");

  let themeNoticeKey: string | null = null;
  if (row.kind === "theme") {
    const result =
      next === "paused" || next === "rolled_back"
        ? await revertTheme(db, installId)
        : await applyTheme(db, installId);
    themeNoticeKey = result.noticeKey;
  }
  return { ok: true, status: next, themeNoticeKey };
}

export async function saveListing(
  db: Client,
  merchantId: string,
  input: {
    id?: string | null;
    kind: Kind;
    name: string;
    slug: string;
    description: string | null;
    category: string;
    version: string;
    priceMinor: number;
    trialAllowed: boolean;
    manifest: Record<string, unknown>;
  },
) {
  const payload = {
    seller_merchant_id: merchantId,
    name: input.name,
    slug: input.slug,
    description: input.description,
    vendor_name: input.name,
    category: input.category,
    version: input.version,
    price_minor_int: input.priceMinor,
    trial_allowed: input.trialAllowed,
    manifest: input.manifest as never,
  };
  if (input.id) {
    const { error } = await db
      .from(table(input.kind))
      .update(payload)
      .eq("id", input.id)
      .eq("seller_merchant_id", merchantId);
    if (error) throw new Error("market_listing_save_failed");
    return { ok: true, id: input.id };
  }
  const { data, error } = await db
    .from(table(input.kind))
    .insert({ ...payload, status: "draft" })
    .select("id")
    .single();
  if (error || !data) throw new Error("market_listing_save_failed");
  return { ok: true, id: data.id };
}

const SELLER_TRANSITIONS: Record<string, string[]> = {
  draft: ["review"],
  review: [],
  active: ["paused", "archived"],
  paused: ["active", "archived"],
  archived: [],
};

export async function sellerTransition(
  db: Client,
  merchantId: string,
  kind: Kind,
  id: string,
  next: string,
) {
  const { data } = await db
    .from(table(kind))
    .select("id, status")
    .eq("id", id)
    .eq("seller_merchant_id", merchantId)
    .maybeSingle();
  if (!data) throw new Error("market_listing_not_found");
  if (!(SELLER_TRANSITIONS[data.status] ?? []).includes(next))
    throw new Error(`market_transition_blocked:${data.status}->${next}`);
  const { error } = await db
    .from(table(kind))
    .update({ status: next as never })
    .eq("id", id)
    .eq("seller_merchant_id", merchantId);
  if (error) throw new Error("market_transition_failed");
  return { ok: true, status: next };
}

export async function moderate(db: Client, kind: Kind, id: string, next: "active" | "paused" | "draft") {
  const { data } = await db.from(table(kind)).select("id, status").eq("id", id).maybeSingle();
  if (!data) throw new Error("market_listing_not_found");
  if (data.status === "archived") throw new Error("market_listing_archived");
  const { error } = await db.from(table(kind)).update({ status: next }).eq("id", id);
  if (error) throw new Error("market_moderation_failed");
  return { ok: true, status: next };
}
