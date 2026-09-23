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
  const { data } = await db
    .from(table(kind))
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new Error("market_listing_not_found");
  if (data.status !== "active") throw new Error("market_listing_not_active");
  if (!isCompatible(data.compatible_versions))
    throw new Error("market_version_mismatch");
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
  // Theme installs retired (Sept 2026 purge): the marketplace is plugins only.
  if (input.kind === "theme") throw new Error("market_theme_removed");

  const { data: existingKey } = await db
    .from("marketplace_installs")
    .select("id, status")
    .eq("merchant_id", merchantId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existingKey)
    return {
      installId: existingKey.id,
      replayed: true,
      impacted: [] as string[],
    };

  const listing = await loadListing(db, input.kind, input.listingId);
  if (input.trial && !listing.trial_allowed)
    throw new Error("market_trial_not_allowed");

  // Bundle gate (R2-7): structural denials fire before any write.
  const listingManifest = (listing as { manifest?: unknown }).manifest;
  const listingScopes = Array.isArray(
    (listingManifest as { permissions?: unknown } | null)?.permissions,
  )
    ? (listingManifest as { permissions: string[] }).permissions
    : (input.grantedScopes ?? []);
  const { validateBundle } = await import("./marketplace-scopes");
  const bundleVerdict = validateBundle(listingManifest ?? {}, listingScopes);
  if (!bundleVerdict.ok)
    throw new Error(`market_bundle_rejected:${bundleVerdict.errors.join(",")}`);

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
    if (version.status !== "active")
      throw new Error("market_version_not_published");
    const { missingScopes } = await import("./marketplace-scopes");
    const missing = missingScopes(version.scopes ?? [], granted);
    if (missing.length)
      throw new Error(`market_consent_required:${missing.join(",")}`);
    pinned = {
      id: version.id,
      version: version.version,
      scopes: version.scopes ?? [],
    };
  }

  // R2-1: subset-enforced on the ledger path too — a grant outside the
  // listing manifest's permissions is refused before any write (mirrors
  // upsertPlugin's unknown check; listingScopes already is those perms).
  const unknown = granted.filter((s) => !listingScopes.includes(s));
  if (unknown.length)
    throw new Error(`plugin_consent_required:${unknown.join(",")}`);

  const charge = input.trial ? 0 : listing.price_minor_int;
  const previous = await snapshotCurrent(db, merchantId, input.kind);

  const { data: install, error } = await db
    .from("marketplace_installs")
    .insert({
      merchant_id: merchantId,
      kind: input.kind,
      theme_id: null,
      widget_id: input.kind === "widget" ? listing.id : null,
      listing_slug: listing.slug,
      listing_name: listing.name,
      version: pinned?.version ?? listing.version,
      price_minor_int: charge,
      currency_code: listing.currency_code,
      is_trial: input.trial,
      status: input.trial ? "trial" : "installed",
      idempotency_key: input.idempotencyKey,
      previous_snapshot: previous as never,
      expires_at: input.trial
        ? new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString()
        : null,
      granted_scopes: granted as never,
      consented_by: (input.consentedBy ?? null) as never,
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
        source: "market.widget.installed",
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

  return {
    installId: install.id,
    replayed: false,
    impacted: impactedNodes(listing.manifest),
    appVersion: APP_VERSION,
    themeApplied: null,
    themeNoticeKey: null,
  };
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
  actorId?: string | null,
) {
  const { data: row } = await db
    .from("marketplace_installs")
    .select("id, status, is_trial, kind, listing_slug")
    .eq("merchant_id", merchantId)
    .eq("id", installId)
    .maybeSingle();
  if (!row) throw new Error("market_install_not_found");
  if (row.status === "rolled_back")
    throw new Error("market_install_rolled_back");
  // Theme lifecycle retired (Sept 2026 purge).
  if (row.kind === "theme") throw new Error("market_theme_removed");

  const next = status === "installed" && row.is_trial ? "trial" : status;
  const { error } = await db
    .from("marketplace_installs")
    .update({ status: next })
    .eq("merchant_id", merchantId)
    .eq("id", installId);
  if (error) throw new Error("market_install_update_failed");
  const { auditAction } = await import("./hardening.server");
  await auditAction(
    db,
    merchantId,
    actorId ?? null,
    `market.${next}`,
    row.kind,
    {
      slug: row.listing_slug,
    },
    installId,
  );

  await db
    .from("plugin_state")
    .update({
      enabled: next === "installed" || next === "trial",
      updated_at: new Date().toISOString(),
    })
    .eq("merchant_id", merchantId)
    .eq("plugin_id", row.listing_slug);
  return { ok: true, status: next, themeNoticeKey: null };
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

export async function moderate(
  db: Client,
  kind: Kind,
  id: string,
  next: "active" | "paused" | "draft",
) {
  const { data } = await db
    .from(table(kind))
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new Error("market_listing_not_found");
  if (data.status === "archived") throw new Error("market_listing_archived");
  const { error } = await db
    .from(table(kind))
    .update({ status: next })
    .eq("id", id);
  if (error) throw new Error("market_moderation_failed");
  return { ok: true, status: next };
}

/**
 * WordPress-style plugin uninstall: parks the ledger row on transitional
 * `uninstalling` and enqueues the durable `plugin.purge` job, which deletes
 * the plugin_state row, drains queued plugin jobs, stops the sidecar, and
 * lands terminal `purged`. The state delete lives in the purge handler
 * (`purgePluginJob`), never inline — uninstall is intent, purge is effect.
 */
export async function uninstallWidgetInstall(
  db: Client,
  merchantId: string,
  installId: string,
  actorId?: string | null,
) {
  const { data: row } = await db
    .from("marketplace_installs")
    .select("id, kind, listing_slug, status")
    .eq("merchant_id", merchantId)
    .eq("id", installId)
    .maybeSingle();
  if (!row || row.kind !== "widget")
    throw new Error("market_install_not_found");

  // Terminal must be terminal: a purged row is a no-op (mirrors
  // purgePluginJob's already_purged shape) — never regress to uninstalling.
  if ((row.status as string) === "purged")
    return { ok: true, purged: false, reason: "already_purged" };

  // R2-6: widget uninstalls ALWAYS purge — mark the ledger row transitional.
  await db
    .from("marketplace_installs")
    .update({ status: "uninstalling" as never })
    .eq("merchant_id", merchantId)
    .eq("id", installId);

  const { data: widget } = await db
    .from("marketplace_widgets")
    .select("id, install_count")
    .eq("slug", row.listing_slug)
    .maybeSingle();
  if (widget)
    await db
      .from("marketplace_widgets")
      .update({
        install_count: Math.max(0, (widget.install_count ?? 1) - 1),
      })
      .eq("id", widget.id);

  try {
    const { stopSidecar } = await import("./plugin-sidecar.server");
    stopSidecar(merchantId, row.listing_slug);
  } catch {
    /* seam */
  }

  const { enqueueJob } = await import("./job-queue.server");
  await enqueueJob(
    {
      queue: "plugins",
      name: "plugin.purge",
      payload: {
        merchantId,
        pluginId: row.listing_slug,
        installId,
        actorId: actorId ?? null,
      },
      merchantId,
      idempotencyKey: `purge:${merchantId}:${installId}`,
    },
    db,
  );

  const { auditAction } = await import("./hardening.server");
  await auditAction(
    db,
    merchantId,
    actorId ?? null,
    "plugin.uninstalling",
    "plugin",
    {
      plugin: row.listing_slug,
    },
    installId,
  );
  return { ok: true, removedPlugin: false, purging: true };
}

export type BulkAction = "enable" | "pause" | "delete";
export type BulkResult = { installId: string; ok: boolean; error?: string };

/**
 * Apply one action across many installs, isolating failures per row.
 * Theme rows are refused (lifecycle retired); widget rows reuse the
 * single-install gates so trials, consent and plugin toggles behave
 * identically to one-at-a-time clicks.
 */
export async function bulkInstallStatus(
  db: Client,
  merchantId: string,
  actorId: string | null,
  installIds: string[],
  action: BulkAction,
): Promise<{ results: BulkResult[] }> {
  const results: BulkResult[] = [];
  for (const installId of installIds) {
    try {
      if (action === "delete") {
        const { data: row } = await db
          .from("marketplace_installs")
          .select("id, kind")
          .eq("merchant_id", merchantId)
          .eq("id", installId)
          .maybeSingle();
        if (!row) throw new Error("market_install_not_found");
        if (row.kind === "theme") throw new Error("market_theme_removed");
        await uninstallWidgetInstall(db, merchantId, installId, actorId);
      } else {
        await setInstallStatus(
          db,
          merchantId,
          installId,
          action === "enable" ? "installed" : "paused",
          actorId,
        );
      }
      results.push({ installId, ok: true });
    } catch (e) {
      results.push({
        installId,
        ok: false,
        error: e instanceof Error ? e.message : "bulk_failed",
      });
    }
  }
  return { results };
}
