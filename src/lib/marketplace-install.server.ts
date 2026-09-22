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
      theme_id: input.kind === "theme" ? listing.id : null,
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
        source:
          input.kind === "theme"
            ? "market.theme.installed"
            : "market.widget.installed",
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

  const applied =
    input.kind === "theme" ? await applyTheme(db, install.id) : null;

  // Third-party themes materialize their own inactive theme row (same shape
  // as builtin installs) so Activate/Delete/badges work uniformly. Listings
  // whose manifest carries no usable AST stay ledger-only, as before.
  if (input.kind === "theme") {
    await materializeListingTheme(db, merchantId, install.id, listing).catch(
      () => null,
    );
  }

  return {
    installId: install.id,
    replayed: false,
    impacted: impactedNodes(listing.manifest),
    appVersion: APP_VERSION,
    themeApplied: applied?.ok ?? null,
    themeNoticeKey: applied?.noticeKey ?? null,
  };
}

/**
 * Best-effort theme row for a third-party install. Returns null (leaving the
 * install ledger-only) when the manifest has no usable templates — never throws.
 */
async function materializeListingTheme(
  db: Client,
  merchantId: string,
  installId: string,
  listing: { id: string; slug: string; name: string; manifest: unknown },
): Promise<string | null> {
  try {
    const manifest = (listing.manifest ?? {}) as {
      templates?: unknown;
      tokens?: unknown;
    };
    if (!manifest.templates || typeof manifest.templates !== "object")
      return null;
    const { parseTemplates, parseTokens } = await import("./builder-ast");
    const templates = parseTemplates(manifest.templates);
    if (!Object.values(templates).some((t) => t && typeof t === "object"))
      return null;
    const tokens = parseTokens(manifest.tokens ?? {});
    const { data: theme, error: themeError } = await db
      .from("store_themes")
      // No DB default on installed_at; NULL breaks the installed-list sort.
      .insert({
        merchant_id: merchantId,
        name: listing.name,
        is_active: false,
        installed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (themeError || !theme) return null;
    const themeId = (theme as { id: string }).id;
    const { data: version, error: versionError } = await db
      .from("theme_versions")
      .insert({
        merchant_id: merchantId,
        theme_id: themeId,
        version: 1,
        status: "draft",
        label: listing.slug,
        templates: templates as never,
        tokens: tokens as never,
        created_by: null,
      })
      .select("id")
      .single();
    if (versionError || !version) {
      await db.from("store_themes").delete().eq("id", themeId);
      return null;
    }
    await db.from("theme_drafts").insert({
      merchant_id: merchantId,
      theme_id: themeId,
      revision: 1,
      templates: templates as never,
      tokens: tokens as never,
    });
    await db
      .from("store_themes")
      .update({
        source_install_id: installId,
        source_listing_slug: listing.slug,
      })
      .eq("id", themeId);
    return themeId;
  } catch {
    return null;
  }
}

async function applyTheme(db: Client, installId: string) {
  const { error } = await db.rpc("market_apply_theme_install", {
    _install_id: installId,
  });
  if (!error) return { ok: true, noticeKey: "marketplace.theme.applied" };
  if (error.message.includes("market.theme_manifest_missing_ast")) {
    return { ok: false, noticeKey: "marketplace.theme.no_ast" };
  }
  return { ok: false, noticeKey: "marketplace.theme.apply_failed" };
}

async function revertTheme(db: Client, installId: string) {
  const { error } = await db.rpc("market_revert_theme_install", {
    _install_id: installId,
  });
  return {
    ok: !error,
    noticeKey: error
      ? "marketplace.theme.revert_failed"
      : "marketplace.theme.reverted",
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

  let themeNoticeKey: string | null = null;
  if (row.kind === "theme") {
    const result =
      next === "paused" || next === "rolled_back"
        ? await revertTheme(db, installId)
        : await applyTheme(db, installId);
    themeNoticeKey = result.noticeKey;
  } else if (row.kind === "widget") {
    await db
      .from("plugin_state")
      .update({
        enabled: next === "installed" || next === "trial",
        updated_at: new Date().toISOString(),
      })
      .eq("merchant_id", merchantId)
      .eq("plugin_id", row.listing_slug);
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

type LooseRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/**
 * WordPress-style builtin theme install: validates the official package,
 * creates a NEW INACTIVE theme via marketplace_install_preset (the active
 * draft is never touched), records the ledger row and links the theme back
 * through store_themes.source_install_id.
 */
export async function installBuiltinTheme(
  db: Client,
  merchantId: string,
  key: string,
  idempotencyKey: string,
) {
  const { presetByKey } = await import("./theme-presets");
  const preset = presetByKey(key);
  if (!preset) throw new Error("market_listing_not_found");
  const { registryPackage } = await import("./themes.server");
  const pkg = registryPackage(key);

  const { data, error } = await (db as unknown as LooseRpc).rpc(
    "marketplace_install_preset",
    {
      _merchant_id: merchantId,
      _key: key,
      _name: preset.nameEn,
      _preset: { tokens: pkg.tokens, templates: pkg.templates },
    },
  );
  if (error || !data) throw new Error("market_install_failed");
  const installed = data as { theme_id: string; version_id: string };

  const { data: ledger, error: ledgerError } = await db
    .from("marketplace_installs")
    .insert({
      merchant_id: merchantId,
      kind: "theme",
      theme_id: null,
      widget_id: null,
      listing_slug: key,
      listing_name: preset.nameEn,
      version: preset.version,
      price_minor_int: 0,
      currency_code: "BDT",
      is_trial: false,
      status: "installed",
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();
  if (ledgerError || !ledger) throw new Error("market_install_failed");

  await db
    .from("store_themes")
    .update({ source_install_id: ledger.id, source_listing_slug: key })
    .eq("id", installed.theme_id)
    .eq("merchant_id", merchantId);

  return {
    themeId: installed.theme_id,
    versionId: installed.version_id,
    installId: ledger.id,
  };
}

/**
 * WordPress-style uninstall: removes an inactive installed theme and
 * retires its ledger row. The active theme is refused (deleteTheme throws
 * theme.active) — activate something else first.
 */
export async function uninstallBuiltinTheme(
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
  if (!row || row.kind !== "theme") throw new Error("market_install_not_found");

  let { data: theme } = await db
    .from("store_themes")
    .select("id, is_active")
    .eq("merchant_id", merchantId)
    .eq("source_install_id", installId)
    .maybeSingle();
  if (!theme && row.listing_slug) {
    const { data: fallbackTheme } = await db
      .from("store_themes")
      .select("id, is_active")
      .eq("merchant_id", merchantId)
      .eq("source_listing_slug", row.listing_slug)
      .maybeSingle();
    theme = fallbackTheme;
  }
  if (!theme) throw new Error("market_theme_not_linked");

  const { deleteTheme } = await import("./themes/appearance.server");
  await deleteTheme(db, merchantId, theme.id as string, actorId ?? null);

  await db
    .from("marketplace_installs")
    .update({ status: "removed" as never })
    .eq("merchant_id", merchantId)
    .eq("id", installId);
  return { ok: true };
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
 * Delete routes by kind (themes need their linked row, widgets their plugin
 * row); enable/pause reuse the single-install gate so trials, consent and
 * theme apply/revert behave identically to one-at-a-time clicks.
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
        if (row.kind === "theme") {
          await uninstallBuiltinTheme(db, merchantId, installId, actorId);
        } else {
          await uninstallWidgetInstall(db, merchantId, installId, actorId);
        }
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
