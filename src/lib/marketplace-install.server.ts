/**
 * Marketplace installs — the write side of the install ledger.
 *
 * QUBICKLE C3 ARCHITECTURAL DECISION (Rules 3/12/13 — HUMAN REVIEW REQUIRED,
 * Sept 2026): this module writes the theme tables (store_themes,
 * theme_versions, theme_drafts) directly through tenant RLS, which
 * CONTRADICTS supabase/migrations/20260923_retire_themes.sql (RESTRICTIVE
 * deny-write policies on every theme table). DECISION: adopt the un-retire
 * path — supabase/migrations/20260924_theme_write_restore.sql drops every
 * RESTRICTIVE policy and restores merchant-scoped write policies, and it
 * sorts after the retire migration, so tenant RLS is the single active
 * contract. Rationale: the purge was rescoped (only old preset packs stay
 * removed; the theme engine is live again), tenant RLS already bounds every
 * write to is_merchant_member(merchant_id), and a privileged service-role
 * bypass would trade an auditable DB boundary for app-only authorization
 * (weaker under Rule 3). There is exactly ONE contract — no silent dual
 * path. Pinned by src/lib/marketplace-qubickle-contract.test.ts
 * ("C3/M4 migration contract"); any future retire/restore must update that
 * test in the same change.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { daysBetween } from "./billing.server";
import { money } from "./money";
import {
  APP_VERSION,
  SELLER_SHARE_BASIS_POINTS,
  TRIAL_DAYS,
  buildListingArtifact,
  isCompatible,
  table,
  type BuiltListingArtifact,
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
  /** Recurring cadence for paid installs. Defaults to `one_time`. */
  billingInterval?: InstallBillingInterval;
};

function split(gross: number) {
  const seller = Math.floor((gross * SELLER_SHARE_BASIS_POINTS) / 10_000);
  return { seller, platform: gross - seller };
}

function isDuplicateKey(error: unknown): boolean {
  const msg = (error as { message?: string } | null)?.message ?? "";
  return msg.includes("duplicate key");
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

/**
 * QUBICKLE H5 — lazy trial lapse. There is no sweep cron in this lane
 * (ops-owned), so every install read/write path parks past-due trials on
 * terminal `lapsed` before doing anything else. Each lapse is audited with a
 * null actor (system transition, not a merchant click).
 *
 * LANE G: past-due RECURRING installs whose renewal window has passed park
 * on the same terminal `lapsed` through the same audit path. The renews_at
 * filter is feature-detected — pre-migration DBs skip the past-due leg and
 * report `recurringDegraded: true` instead of throwing.
 */
export async function lapseExpiredTrials(
  db: Client,
  merchantId: string,
  nowMs: number = Date.now(),
) {
  const nowIso = new Date(nowMs).toISOString();
  const { data: expired } = await db
    .from("marketplace_installs")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("status", "trial")
    .lte("expires_at", nowIso);
  const ids = ((expired ?? []) as { id: string }[]).map((r) => r.id);
  let recurringDegraded = false;
  try {
    const { data: pastDue, error } = await db
      .from("marketplace_installs")
      .select("id")
      .eq("merchant_id", merchantId)
      .eq("status", "past_due")
      .lte("renews_at", nowIso);
    if (error) throw error;
    for (const row of ((pastDue ?? []) as { id: string }[])) ids.push(row.id);
  } catch (err) {
    if (!isMissingRecurringColumnError(err)) throw err;
    recurringDegraded = true;
  }
  if (!ids.length) return { lapsed: [] as string[], recurringDegraded };
  const { error } = await db
    .from("marketplace_installs")
    .update({ status: "lapsed" })
    .eq("merchant_id", merchantId)
    .in("id", ids);
  if (error) throw new Error("market_lapse_failed");
  const { auditAction } = await import("./hardening.server");
  for (const id of ids) {
    await auditAction(
      db,
      merchantId,
      null,
      "market.trial_lapsed",
      "install",
      {
        expired: true,
      },
      id,
    );
  }
  return { lapsed: ids, recurringDegraded };
}

type ReplayHit = {
  id: string;
  status: string;
  kind: string;
  theme_id: string | null;
  widget_id: string | null;
  listing_slug: string;
};

/**
 * QUBICKLE H1/H2 (Rule 8): a replay binds the FULL
 * (merchant, key, kind, listing) tuple. A reused key with a different kind
 * or listing is `market_idempotency_conflict` — never a silent replay of
 * someone else's install. A lapsed (expired-trial) row never replays live.
 */
function boundReplay(
  hit: ReplayHit,
  input: InstallInput,
  listingSlug: string,
): {
  installId: string;
  replayed: true;
  impacted: string[];
  artifact: null;
} {
  if (hit.status === "lapsed") throw new Error("market_trial_expired");
  const sameKind = hit.kind === input.kind;
  const sameListing =
    input.kind === "theme"
      ? hit.theme_id === input.listingId || hit.listing_slug === listingSlug
      : hit.widget_id === input.listingId || hit.listing_slug === listingSlug;
  if (!sameKind || !sameListing) throw new Error("market_idempotency_conflict");
  // Only the call that WRITES rows reports the artifact; replays carry null
  // (the listing-level artifact stays readable via listCatalog).
  return { installId: hit.id, replayed: true, impacted: [], artifact: null };
}

/**
 * SWITCHOVER-2 — resolve the exact ZIP bytes a widget install must run.
 *
 * A pinned vault version's `source` wins when it is a full plugin manifest
 * (the exact bytes the seller published); otherwise the listing manifest is
 * rebuilt. Anything else (bundle-shaped `{ entry, permissions }` manifests,
 * empty manifests, vault bundle sources) resolves to null — the LEGACY
 * fallback: the historical ledger-only install, documented, never a crash.
 */
function resolveWidgetArtifact(
  listing: { slug: string; manifest: unknown },
  pinned: { id: string; source: unknown } | null,
): BuiltListingArtifact | null {
  if (pinned && pinned.source && typeof pinned.source === "object") {
    const fromVersion = buildListingArtifact(
      pinned.source,
      listing.slug,
      `version:${pinned.id}`,
    );
    if (fromVersion) return fromVersion;
  }
  return buildListingArtifact(listing.manifest, listing.slug);
}

/**
 * FOLLOW-UP — persists the installed artifact identity onto the install row
 * (artifact_checksum/version/pinned, see
 * supabase/migrations/20260928000002_marketplace_install_artifacts.sql).
 * Feature-detected: pre-migration DBs keep the base marketplace shape with
 * NULL artifact identity (legacy fallback) instead of failing the install.
 */
async function patchInstallMarketplaceShape(
  db: Client,
  merchantId: string,
  installId: string,
  shape: Record<string, unknown>,
  artifact: Record<string, unknown>,
): Promise<{ degraded: boolean }> {
  const { isMissingArtifactColumnError } = await import(
    "./package-install.server"
  );
  try {
    const { error } = await db
      .from("marketplace_installs")
      .update({ ...shape, ...artifact } as never)
      .eq("merchant_id", merchantId)
      .eq("id", installId);
    if (error) throw error;
    return { degraded: false };
  } catch (err) {
    if (!isMissingArtifactColumnError(err)) throw err;
    const { log } = await import("./observability.server");
    log("warn", "market.install_artifact_columns_missing", {
      merchantId,
      installId,
    });
    const { error: baseError } = await db
      .from("marketplace_installs")
      .update(shape as never)
      .eq("merchant_id", merchantId)
      .eq("id", installId);
    if (baseError) throw baseError;
    return { degraded: true };
  }
}

export async function installListing(
  db: Client,
  merchantId: string,
  input: InstallInput,
) {
  // H5: park expired trials before any install state is read.
  await lapseExpiredTrials(db, merchantId);

  const { data: existingKey } = await db
    .from("marketplace_installs")
    .select("id, status, kind, theme_id, widget_id, listing_slug")
    .eq("merchant_id", merchantId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  // A reused key with a different kind is a conflict on its face — no
  // listing load needed (and a bogus listing id must not mask it).
  if (existingKey && (existingKey as unknown as ReplayHit).kind !== input.kind)
    throw new Error("market_idempotency_conflict");
  const listing = await loadListing(db, input.kind, input.listingId);
  if (existingKey)
    return boundReplay(
      existingKey as unknown as ReplayHit,
      input,
      listing.slug,
    );
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
  let pinned: {
    id: string;
    version: string;
    scopes: string[];
    source: unknown;
  } | null = null;
  if (input.versionId) {
    const { data: version } = await db
      .from("marketplace_versions")
      .select("id, version, scopes, status, listing_id, kind, source")
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
      source: (version as { source?: unknown }).source ?? null,
    };
  }

  // R2-1: subset-enforced on the ledger path too — a grant outside the
  // listing manifest's permissions is refused before any write (mirrors
  // upsertPlugin's unknown check; listingScopes already is those perms).
  const unknown = granted.filter((s) => !listingScopes.includes(s));
  if (unknown.length)
    throw new Error(`plugin_consent_required:${unknown.join(",")}`);

  const purchaseInterval = isInterval(input.billingInterval)
    ? input.billingInterval
    : "one_time";
  const charge = input.trial
    ? 0
    : resolveListingTermPrice(listing, purchaseInterval);
  const previous = await snapshotCurrent(db, merchantId, input.kind);

  // SWITCHOVER-2 — install-via-pipeline. A widget listing that resolves to an
  // exact ZIP installs through the package pipeline (`installPackage`, kind
  // "plugin") with the SAME idempotency key, so marketplace and direct upload
  // converge on one ledger row + one asset namespace. `null` is the legacy
  // fallback: the historical ledger-only install below, unchanged.
  const widgetArtifact =
    input.kind === "widget" ? resolveWidgetArtifact(listing, pinned) : null;
  let installId: string;
  let installedArtifact: {
    checksum: string;
    version: string;
    fileName: string;
    pinned: string;
  } | null = null;

  if (widgetArtifact) {
    const { installPackage } = await import("./package-install.server");
    let pkg: {
      packageId: string;
      version: string;
      artifactId: string;
      alreadyInstalled: boolean;
    };
    try {
      pkg = await installPackage(
        db,
        merchantId,
        {
          kind: "plugin",
          fileName: widgetArtifact.fileName,
          bytes: widgetArtifact.bytes,
          idempotencyKey: input.idempotencyKey,
        },
        input.consentedBy ?? null,
      );
    } catch (e) {
      // The bytes passed the marketplace bundle gate but the package gate
      // refused them (drift between the two gates): fail closed with the
      // pipeline code attached, never a silent ledger-only install.
      const code =
        (e as { code?: string })?.code ??
        (e instanceof Error ? e.message : "unknown");
      throw new Error(`market_install_failed:${code}`);
    }
    if (pkg.alreadyInstalled) {
      // Lost the unique-key race after the top-of-function check: the winner
      // owns this key. Replay under the marketplace binding, never stack.
      const { data: raced } = await db
        .from("marketplace_installs")
        .select("id, status, kind, theme_id, widget_id, listing_slug")
        .eq("merchant_id", merchantId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (raced)
        return boundReplay(raced as unknown as ReplayHit, input, listing.slug);
      throw new Error("market_install_failed");
    }
    // Exactness is structural (these same bytes were just hashed), but a
    // sibling-lane pipeline change must never strand a mismatched row: loud,
    // compensated, never silent.
    if (pkg.artifactId !== widgetArtifact.checksum) {
      try {
        const { deleteVersionAssets, pluginVersionPrefix } = await import(
          "./package-store.server"
        );
        await deleteVersionAssets(
          db,
          merchantId,
          pluginVersionPrefix(
            widgetArtifact.manifestSlug,
            widgetArtifact.checksum.slice(0, 8),
          ),
        );
      } catch {
        /* compensation is best-effort; the mismatch error below is the signal */
      }
      await db
        .from("marketplace_installs")
        .delete()
        .eq("merchant_id", merchantId)
        .eq("id", pkg.packageId);
      throw new Error("market_artifact_mismatch");
    }
    // The pipeline wrote the ledger row with upload defaults; patch it to the
    // marketplace shape (listing identity, price, trial, consent evidence).
    // Marketplace identity stays on the listing slug — the asset namespace
    // keeps the manifest slug (pipeline truth). The artifact columns persist
    // the exact installed bytes (checksum + pinned version + pin label) so a
    // later uninstall can attribute the manifest-slug namespace even though
    // the ledger slug differs; pre-migration DBs keep NULL (legacy fallback).
    try {
      await patchInstallMarketplaceShape(
        db,
        merchantId,
        pkg.packageId,
        {
          widget_id: listing.id,
          listing_slug: listing.slug,
          listing_name: listing.name,
          version: pinned?.version ?? listing.version,
          price_minor_int: charge,
          currency_code: listing.currency_code,
          is_trial: input.trial,
          status: input.trial ? "trial" : "installed",
          previous_snapshot: previous,
          expires_at: input.trial
            ? new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString()
            : null,
          granted_scopes: granted,
          consented_by: input.consentedBy ?? null,
        },
        {
          artifact_checksum: widgetArtifact.checksum,
          artifact_version: pkg.version,
          artifact_pinned: widgetArtifact.pinned,
        },
      );
    } catch {
      try {
        const { deleteVersionAssets, pluginVersionPrefix } = await import(
          "./package-store.server"
        );
        await deleteVersionAssets(
          db,
          merchantId,
          pluginVersionPrefix(
            widgetArtifact.manifestSlug,
            widgetArtifact.checksum.slice(0, 8),
          ),
        );
      } catch {
        /* compensation is best-effort; the install error below is the signal */
      }
      await db
        .from("marketplace_installs")
        .delete()
        .eq("merchant_id", merchantId)
        .eq("id", pkg.packageId);
      throw new Error("market_install_failed");
    }
    installId = pkg.packageId;
    installedArtifact = {
      checksum: widgetArtifact.checksum,
      version: pkg.version,
      fileName: widgetArtifact.fileName,
      pinned: widgetArtifact.pinned,
    };
  } else {
    // Legacy ledger-only install: no installable bytes exist, so the artifact
    // columns stay NULL (legacy fallback) — uninstall keeps the
    // ledger-slug wipe only for these rows.
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
    if (error || !install) {
      // H2: a racing double-submit won the unique (merchant, key) race — the
      // loser replays the winner instead of stacking a second install.
      if (isDuplicateKey(error)) {
        const { data: raced } = await db
          .from("marketplace_installs")
          .select("id, status, kind, theme_id, widget_id, listing_slug")
          .eq("merchant_id", merchantId)
          .eq("idempotency_key", input.idempotencyKey)
          .maybeSingle();
        if (raced)
          return boundReplay(
            raced as unknown as ReplayHit,
            input,
            listing.slug,
          );
      }
      throw new Error("market_install_failed");
    }
    installId = (install as { id: string }).id;
  }

  // H7: the install itself is audited — actor, displaced snapshot, new shape.
  const { auditAction: installAudit } = await import("./hardening.server");
  await installAudit(
    db,
    merchantId,
    input.consentedBy ?? null,
    "market.installed",
    input.kind,
    {
      before: previous,
      after: {
        listing: listing.slug,
        version: pinned?.version ?? listing.version,
        trial: input.trial,
        charge_minor_int: charge,
        currency: listing.currency_code,
      },
    },
    installId,
  );

  // H3: materialize BEFORE any money moves, so a theme-row failure
  // compensates with just the install row — never an orphan charge.
  // materializeListingTheme returns null for legit ledger-only manifests
  // (no usable AST) and THROWS on DB/parse failure.
  if (input.kind === "theme") {
    try {
      await materializeListingTheme(db, merchantId, installId, listing);
    } catch {
      await db
        .from("marketplace_installs")
        .delete()
        .eq("merchant_id", merchantId)
        .eq("id", installId);
      throw new Error("market_install_failed");
    }
  }

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
        referenceId: installId,
        direction: "debit",
        gross: money(seller + platform, listing.currency_code),
        platformFee: money(platform, listing.currency_code),
        idempotencyKey: input.idempotencyKey,
        memo: `${listing.name} v${listing.version}`,
      });
    } catch {
      await db
        .from("marketplace_installs")
        .delete()
        .eq("merchant_id", merchantId)
        .eq("id", installId);
      throw new Error("market_payment_failed");
    }
  }

  // LANE G: paid recurring purchases open a renewal schedule. The write is
  // feature-detected — pre-migration DBs keep one-time semantics. It runs
  // after money moved and never fails the purchase: a schedule can be
  // backfilled, a completed charge cannot be un-moved.
  try {
    await setInstallBillingSchedule(db, installId, {
      merchantId,
      interval: input.billingInterval ?? "one_time",
      trial: input.trial,
    });
  } catch (err) {
    const { log } = await import("./observability.server");
    log("error", "market.schedule_write_failed", {
      merchantId,
      installId,
      message: err instanceof Error ? err.message.slice(0, 120) : "unknown",
    });
  }

  await db
    .from(table(input.kind))
    .update({ install_count: listing.install_count + 1 })
    .eq("id", listing.id);

  return {
    installId,
    replayed: false,
    impacted: impactedNodes(listing.manifest),
    appVersion: APP_VERSION,
    themeApplied: null,
    themeNoticeKey: null,
    // Exact bytes this call installed (checksum + pinned manifest version);
    // null for legacy ledger-only installs and for replays.
    artifact: installedArtifact,
  };
}

/**
 * Best-effort theme row for a third-party install.
 *
 * QUBICKLE H3 (Rule 4): two outcomes, never conflated —
 * - `null`: the manifest carries no usable AST, so the install is
 *   LEGITIMATELY ledger-only (unchanged historical behavior).
 * - THROW (`market_materialize_failed`): templates failed to parse, or any
 *   theme/version/draft/link write failed. Partial rows are compensated
 *   tenant-scoped before throwing, so a half-materialized theme can never
 *   strand the install behind a success response.
 */
async function materializeListingTheme(
  db: Client,
  merchantId: string,
  installId: string,
  listing: { id: string; slug: string; name: string; manifest: unknown },
): Promise<string | null> {
  const manifest = (listing.manifest ?? {}) as {
    templates?: unknown;
    tokens?: unknown;
  };
  if (!manifest.templates || typeof manifest.templates !== "object")
    return null;
  const { parseTemplates, parseTokens } = await import("./builder-ast");
  let templates: Record<string, unknown>;
  let tokens: unknown;
  try {
    templates = parseTemplates(manifest.templates) as Record<string, unknown>;
    tokens = parseTokens(manifest.tokens ?? {});
  } catch {
    throw new Error("market_materialize_failed");
  }
  if (!Object.values(templates).some((t) => t && typeof t === "object"))
    return null;

  const fail = async (cleanup: () => PromiseLike<unknown>): Promise<never> => {
    try {
      await cleanup();
    } catch {
      // Compensation itself failed — loud, never silent.
      const { incr, log } = await import("./observability.server");
      incr("framique_market_materialize_total", {
        outcome: "compensation_failed",
      });
      log("error", "market.materialize_compensation_failed", {
        merchantId,
        installId,
      });
    }
    throw new Error("market_materialize_failed");
  };

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
  if (themeError || !theme) throw new Error("market_materialize_failed");
  const themeId = (theme as { id: string }).id;
  const dropTheme = async () => {
    await db
      .from("store_themes")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("id", themeId);
  };
  const dropVersionAndTheme = async () => {
    await db
      .from("theme_versions")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("theme_id", themeId);
    await dropTheme();
  };

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
  if (versionError || !version) await fail(dropTheme);

  const { error: draftError } = await db.from("theme_drafts").insert({
    merchant_id: merchantId,
    theme_id: themeId,
    revision: 1,
    templates: templates as never,
    tokens: tokens as never,
  });
  if (draftError) await fail(dropVersionAndTheme);

  const { error: linkError } = await db
    .from("store_themes")
    .update({
      source_install_id: installId,
      source_listing_slug: listing.slug,
    })
    .eq("merchant_id", merchantId)
    .eq("id", themeId);
  if (linkError) await fail(dropVersionAndTheme);
  return themeId;
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
  // H5: park expired trials before reading install state.
  await lapseExpiredTrials(db, merchantId);
  const { data: row } = await db
    .from("marketplace_installs")
    .select("id, status, is_trial, kind, listing_slug")
    .eq("merchant_id", merchantId)
    .eq("id", installId)
    .maybeSingle();
  if (!row) throw new Error("market_install_not_found");
  // H5: an expired (lapsed) trial can never be resumed — fail closed with an
  // explicit error, never a silent no-op or a live trial again.
  if (row.status === "lapsed") throw new Error("market_trial_expired");
  if (row.status === "rolled_back")
    throw new Error("market_install_rolled_back");

  const next = status === "installed" && row.is_trial ? "trial" : status;

  // Theme ledger rows drive the storefront theme, never plugin_state.
  // Pausing the live theme would strand the storefront with no active theme,
  // so it is refused exactly like deleting the active theme (WordPress
  // parity: activate another theme first).
  if (row.kind === "theme" && next === "paused") {
    const { data: linked } = await db
      .from("store_themes")
      .select("id, is_active")
      .eq("merchant_id", merchantId)
      .eq("source_install_id", installId)
      .maybeSingle();
    if (linked?.is_active) throw new Error("market_theme_active");
  }

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

  if (row.kind === "theme")
    return { ok: true, status: next, themeNoticeKey: null };
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
    /** Per-interval price for monthly renewals/conversions. Absent/null falls back to priceMinor. */
    priceMonthlyMinor?: number | null;
    /** Per-interval price for annual renewals/conversions. Absent/null falls back to priceMinor. */
    priceAnnualMinor?: number | null;
    trialAllowed: boolean;
    manifest: Record<string, unknown>;
  },
  actorId?: string | null,
) {
  validateListingTermPrice(input.priceMonthlyMinor);
  validateListingTermPrice(input.priceAnnualMinor);
  const { auditAction } = await import("./hardening.server");
  const basePayload = {
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
  const termPayload: Record<string, unknown> = {};
  if (input.priceMonthlyMinor !== undefined)
    termPayload.price_monthly_minor_int = input.priceMonthlyMinor;
  if (input.priceAnnualMinor !== undefined)
    termPayload.price_annual_minor_int = input.priceAnnualMinor;
  const hasTerms = Object.keys(termPayload).length > 0;
  const termAudit = {
    ...(input.priceMonthlyMinor !== undefined
      ? { price_monthly_minor_int: input.priceMonthlyMinor }
      : {}),
    ...(input.priceAnnualMinor !== undefined
      ? { price_annual_minor_int: input.priceAnnualMinor }
      : {}),
  };
  if (input.id) {
    const { data: before } = await db
      .from(table(input.kind))
      .select("name, slug, version, price_minor_int, status")
      .eq("id", input.id)
      .eq("seller_merchant_id", merchantId)
      .maybeSingle();
    if (!before) throw new Error("market_listing_not_found");
    // PRICING lane: the term columns may not exist yet (pending migration).
    // Optimistic write first, then retry without terms — a seller can always
    // save the base listing; term prices backfill after the migration.
    let wrote = false;
    if (hasTerms) {
      try {
        const { error } = await db
          .from(table(input.kind))
          .update({ ...basePayload, ...termPayload } as never)
          .eq("id", input.id)
          .eq("seller_merchant_id", merchantId);
        if (error) throw error;
        wrote = true;
      } catch (err) {
        if (!isMissingTermColumnError(err))
          throw new Error("market_listing_save_failed");
        const { log } = await import("./observability.server");
        log("warn", "market.listing_terms_columns_missing", {
          merchantId,
          listingId: input.id,
        });
      }
    }
    if (!wrote) {
      const { error } = await db
        .from(table(input.kind))
        .update(basePayload)
        .eq("id", input.id)
        .eq("seller_merchant_id", merchantId);
      if (error) throw new Error("market_listing_save_failed");
    }
    await auditAction(
      db,
      merchantId,
      actorId ?? null,
      "market.listing_saved",
      input.kind,
      {
        before,
        after: {
          name: input.name,
          slug: input.slug,
          version: input.version,
          price_minor_int: input.priceMinor,
          ...termAudit,
        },
      },
      input.id,
    );
    return { ok: true, id: input.id };
  }
  // PRICING lane: same optimistic-term-write pattern as the update path.
  if (hasTerms) {
    try {
      const { data, error } = await db
        .from(table(input.kind))
        .insert({ ...basePayload, status: "draft", ...termPayload } as never)
        .select("id")
        .single();
      if (error || !data)
        throw error ?? new Error("market_listing_save_failed");
      await auditAction(
        db,
        merchantId,
        actorId ?? null,
        "market.listing_saved",
        input.kind,
        {
          before: null,
          after: {
            name: input.name,
            slug: input.slug,
            version: input.version,
            price_minor_int: input.priceMinor,
            ...termAudit,
          },
        },
        (data as unknown as { id: string }).id,
      );
      return { ok: true, id: (data as unknown as { id: string }).id };
    } catch (err) {
      if (!isMissingTermColumnError(err)) {
        if (err instanceof Error && err.message === "market_listing_save_failed")
          throw err;
        throw new Error("market_listing_save_failed");
      }
      const { log } = await import("./observability.server");
      log("warn", "market.listing_terms_columns_missing", {
        merchantId,
        slug: input.slug,
      });
    }
  }
  const { data, error } = await db
    .from(table(input.kind))
    .insert({ ...basePayload, status: "draft" })
    .select("id")
    .single();
  if (error || !data) throw new Error("market_listing_save_failed");
  await auditAction(
    db,
    merchantId,
    actorId ?? null,
    "market.listing_saved",
    input.kind,
    {
      before: null,
      after: {
        name: input.name,
        slug: input.slug,
        version: input.version,
        price_minor_int: input.priceMinor,
        ...termAudit,
      },
    },
    (data as { id: string }).id,
  );
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
  actorId?: string | null,
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
  const { auditAction } = await import("./hardening.server");
  await auditAction(
    db,
    merchantId,
    actorId ?? null,
    "market.listing_transition",
    kind,
    {
      before: { status: data.status },
      after: { status: next },
    },
    id,
  );
  return { ok: true, status: next };
}

export async function moderate(
  db: Client,
  kind: Kind,
  id: string,
  next: "active" | "paused" | "draft",
  actorId?: string | null,
) {
  const { data } = await db
    .from(table(kind))
    .select("id, status, seller_merchant_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new Error("market_listing_not_found");
  if (data.status === "archived") throw new Error("market_listing_archived");
  const { error } = await db
    .from(table(kind))
    .update({ status: next })
    .eq("id", id);
  if (error) throw new Error("market_moderation_failed");
  const { auditAction } = await import("./hardening.server");
  await auditAction(
    db,
    (data as { seller_merchant_id: string }).seller_merchant_id,
    actorId ?? null,
    "market.moderated",
    kind,
    { before: { status: data.status }, after: { status: next } },
    id,
  );
  return { ok: true, status: next };
}

/**
 * QUBICKLE H1/H2/H4 — builtin widget install as a testable server unit
 * (extracted from marketInstallFn so the attack paths are directly covered).
 *
 * - Key-driven: a committed idempotency key replays, never stacks.
 * - CONSENT lane: the replay binds the FULL (merchant, key, kind, listing)
 *   tuple via boundReplay (marketplace parity) — a reused key with a
 *   different kind or listing is `market_idempotency_conflict`, never a
 *   silent replay of someone else's install. A lapsed (expired-trial) row
 *   never replays live.
 * - The ledger write is checked BEFORE the plugin row: a ledger failure
 *   throws `market_install_failed` (duplicate-key races reselect + replay
 *   under the same binding), so upsertPlugin can never run without its
 *   ledger row.
 * - H4: if upsertPlugin throws, the ledger row is compensated
 *   tenant-scoped before the error surfaces — no orphan ledger rows.
 */
export async function installBuiltinWidget(
  db: Client,
  merchantId: string,
  kind: Kind,
  pluginId: string,
  idempotencyKey: string,
  actorId?: string | null,
) {
  const { getBuiltinPlugin } = await import("./builtin-plugins");
  const pluginDef = getBuiltinPlugin(pluginId);
  if (!pluginDef) throw new Error("market_listing_not_found");

  const { data: existing } = await db
    .from("marketplace_installs")
    .select("id, status, kind, theme_id, widget_id, listing_slug")
    .eq("merchant_id", merchantId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) {
    const replayed = boundReplay(
      existing as unknown as ReplayHit,
      { kind, listingId: pluginId, trial: false, idempotencyKey },
      pluginId,
    );
    return {
      installId: replayed.installId,
      replayed: true,
      impacted: [] as string[],
      appVersion: APP_VERSION,
      themeApplied: null,
      themeNoticeKey: null,
      artifact: null,
    };
  }

  const { data: installRecord, error: ledgerError } = await db
    .from("marketplace_installs")
    .insert({
      merchant_id: merchantId,
      kind,
      theme_id: null,
      widget_id: null,
      listing_slug: pluginId,
      listing_name: pluginDef.manifest.name,
      version: pluginDef.manifest.version,
      price_minor_int: 0,
      currency_code: "BDT",
      is_trial: false,
      status: "installed",
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();
  if (ledgerError || !installRecord) {
    if (isDuplicateKey(ledgerError)) {
      const { data: raced } = await db
        .from("marketplace_installs")
        .select("id, status, kind, theme_id, widget_id, listing_slug")
        .eq("merchant_id", merchantId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (raced) {
        const replayed = boundReplay(
          raced as unknown as ReplayHit,
          { kind, listingId: pluginId, trial: false, idempotencyKey },
          pluginId,
        );
        return {
          installId: replayed.installId,
          replayed: true,
          impacted: [] as string[],
          appVersion: APP_VERSION,
          themeApplied: null,
          themeNoticeKey: null,
          artifact: null,
        };
      }
    }
    throw new Error("market_install_failed");
  }
  const installId = (installRecord as unknown as { id: string }).id;

  const { upsertPlugin } = await import("./plugins.server");
  try {
    await upsertPlugin(db, merchantId, {
      manifest: pluginDef.manifest,
      grantedScopes: pluginDef.manifest.permissions,
      installId,
      actorId: actorId ?? null,
    });
  } catch (e) {
    await db
      .from("marketplace_installs")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("id", installId);
    throw e;
  }

  const { auditAction: builtinAudit } = await import("./hardening.server");
  await builtinAudit(
    db,
    merchantId,
    actorId ?? null,
    "market.installed",
    kind,
    {
      before: null,
      after: { listing: pluginId, builtin: true, trial: false },
    },
    installId,
  );

  // SWITCHOVER-2 — report the exact artifact without changing behaviour: the
  // builtin manifest is the single source the pipeline ZIP exporter
  // (`exportBuiltinPluginZip`) materialises, so this checksum is identical to
  // a direct-upload install of the same preset (PKG-4 parity). Informational
  // only — a failure here must never fail the install.
  let builtinArtifact: {
    checksum: string;
    version: string;
    fileName: string;
    pinned: string;
  } | null = null;
  try {
    const { exportBuiltinPluginZip } = await import("./plugin-package");
    const { artifactIdFor } = await import("./package-install.server");
    const bytes = exportBuiltinPluginZip(pluginId);
    builtinArtifact = {
      checksum: artifactIdFor(bytes),
      version: pluginDef.manifest.version,
      fileName: `${pluginId}.zip`,
      pinned: `builtin:${pluginId}`,
    };
  } catch {
    builtinArtifact = null;
  }

  return {
    installId,
    replayed: false,
    impacted: [] as string[],
    appVersion: APP_VERSION,
    themeApplied: null,
    themeNoticeKey: null,
    artifact: builtinArtifact,
  };
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
 * Delete a theme install: cascade-delete the linked store_themes row
 * (versions + drafts, refused while it is the active theme) and put the
 * ledger row on a terminal status. Install rows that never materialized a
 * theme (manifest with no usable AST) only need the ledger row retired.
 */
export async function uninstallThemeInstall(
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
  if (row.status === "removed")
    return { ok: true, removedTheme: null, reason: "already_removed" };

  const { data: theme } = await db
    .from("store_themes")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("source_install_id", installId)
    .maybeSingle();
  if (theme) {
    const { deleteTheme } = await import("./themes/appearance.server");
    await deleteTheme(db, merchantId, theme.id, actorId);
    return { ok: true, removedTheme: theme.id };
  }

  const { error } = await db
    .from("marketplace_installs")
    .update({ status: "removed" as never })
    .eq("merchant_id", merchantId)
    .eq("id", installId);
  if (error) throw new Error("market_install_update_failed");
  const { auditAction } = await import("./hardening.server");
  await auditAction(
    db,
    merchantId,
    actorId ?? null,
    "market.removed",
    "theme",
    { slug: row.listing_slug },
    installId,
  );
  return { ok: true, removedTheme: null };
}

/**
 * Apply one action across many installs, isolating failures per row.
 * Delete routes by kind (themes cascade their linked store_themes row,
 * widgets their plugin row); enable/pause reuse the single-install gate so
 * trials, consent and the live-theme refusal behave identically to
 * one-at-a-time clicks.
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
          await uninstallThemeInstall(db, merchantId, installId, actorId);
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

// ─────────────────────────────────────────────────────────────────────────────
// LANE G — recurring billing for plugin installs.
//
// marketplace_installs gains `billing_interval` (one_time|monthly|annual),
// `renews_at` and `last_renewed_at` via
// supabase/pending/marketplace_install_recurring.sql (UNAPPLIED — everything
// below feature-detects the columns and works with and without them, same
// optimistic-write-then-degrade pattern as the kb embedding-version columns
// in support-kb.server.ts:insertKbChunksFeatureDetected).
// ─────────────────────────────────────────────────────────────────────────────

export type InstallBillingInterval = "one_time" | "monthly" | "annual";

const RENEWAL_PERIOD_DAYS: Record<
  Exclude<InstallBillingInterval, "one_time">,
  number
> = { monthly: 30, annual: 365 };

const DAY_MS = 86_400_000;

/** True when the failure is "the recurring columns don't exist yet" — never for real errors. */
export function isMissingRecurringColumnError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : (
      (err as { message?: string } | null)?.message ?? String(err ?? "")
    );
  if (!/billing_interval|renews_at|last_renewed_at/i.test(msg)) return false;
  return /column|schema cache|PGRST204|42703|does not exist/i.test(msg);
}

function isInterval(v: unknown): v is InstallBillingInterval {
  return v === "one_time" || v === "monthly" || v === "annual";
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICING lane — per-interval listing term prices.
//
// Listings carry an optional price per recurring interval
// (`price_monthly_minor_int` / `price_annual_minor_int` on both listing
// tables, via supabase/pending/marketplace_listing_terms.sql — UNAPPLIED).
// Every read/write below is feature-detected and runs with and without those
// columns, same optimistic pattern as the install recurring columns above:
//   - saveListing writes terms optimistically, retrying without them on a
//     missing-column failure (base listing always saves).
//   - loadListingPricing selects terms first, reselecting the base columns on
//     a missing-column failure.
// Absent (or invalid stored) term prices fall back: purchase/conversion fall
// back to the listing base price_minor_int, renewal falls back to the
// install-row price (its purchase-time behaviour).
// ─────────────────────────────────────────────────────────────────────────────

export type ListingTermSource = {
  price_minor_int: unknown;
  price_monthly_minor_int?: unknown;
  price_annual_minor_int?: unknown;
};

type ListingPricingRow = {
  seller_merchant_id: string;
  price_minor_int: number;
  price_monthly_minor_int?: number | null;
  price_annual_minor_int?: number | null;
};

const LISTING_TERM_PRICE_MAX = 100_000_000;

/** True when the failure is "the listing term columns don't exist yet" — never for real errors. */
export function isMissingTermColumnError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : (
      (err as { message?: string } | null)?.message ?? String(err ?? "")
    );
  if (!/price_monthly_minor_int|price_annual_minor_int/i.test(msg))
    return false;
  return /column|schema cache|PGRST204|42703|does not exist/i.test(msg);
}

/**
 * Rejects term amounts that could never be charged: non-integers,
 * negatives, or absurd magnitudes. Absent (undefined/null) means "no term
 * price" and is always valid. Throws `market_listing_terms_invalid`.
 */
export function validateListingTermPrice(value: unknown): void {
  if (value === undefined || value === null) return;
  if (
    !Number.isInteger(value) ||
    (value as number) < 0 ||
    (value as number) > LISTING_TERM_PRICE_MAX
  )
    throw new Error("market_listing_terms_invalid");
}

/**
 * The listing's price for one recurring interval, or null when the listing
 * carries no usable term price (column absent, null, or an invalid stored
 * value — negative stored values can never become a charge). One-time has
 * no term price by definition.
 */
export function getListingTermPrice(
  listing: ListingTermSource,
  interval: InstallBillingInterval,
): number | null {
  if (!isInterval(interval) || interval === "one_time") return null;
  const key =
    interval === "monthly"
      ? "price_monthly_minor_int"
      : "price_annual_minor_int";
  const raw = listing?.[key];
  if (raw === undefined || raw === null) return null;
  const term = Number(raw);
  if (!Number.isInteger(term) || term < 0) return null;
  return term;
}

/**
 * Full-period price for an interval: the term price when the listing carries
 * one, else the base price_minor_int. Throws `market_listing_terms_invalid`
 * for unknown intervals.
 */
export function resolveListingTermPrice(
  listing: ListingTermSource,
  interval: InstallBillingInterval,
): number {
  if (!isInterval(interval)) throw new Error("market_listing_terms_invalid");
  const base = Number(listing?.price_minor_int ?? 0);
  return getListingTermPrice(listing, interval) ?? base;
}

/**
 * Re-reads a listing's pricing by slug (never trusted from the install row).
 * Selects the term columns first; on pre-migration DBs reselects the base
 * columns so callers always get a usable row or null (delisted).
 */
async function loadListingPricing(
  db: Client,
  kind: Kind,
  slug: string,
): Promise<ListingPricingRow | null> {
  try {
    const { data, error } = await db
      .from(table(kind))
      .select(
        "id, seller_merchant_id, price_minor_int, price_monthly_minor_int, price_annual_minor_int",
      )
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as unknown as ListingPricingRow | null;
  } catch (err) {
    if (!isMissingTermColumnError(err)) throw err;
    const { log } = await import("./observability.server");
    log("warn", "market.listing_terms_columns_missing", { slug });
    const { data } = await db
      .from(table(kind))
      .select("id, seller_merchant_id, price_minor_int")
      .eq("slug", slug)
      .maybeSingle();
    return (data ?? null) as unknown as ListingPricingRow | null;
  }
}

/** Next renewal instant anchored at `fromMs`. Null for one-time (no renewal). */
export function computeRenewsAt(
  interval: InstallBillingInterval,
  fromMs: number = Date.now(),
): string | null {
  if (interval === "one_time") return null;
  return new Date(fromMs + RENEWAL_PERIOD_DAYS[interval] * DAY_MS).toISOString();
}

/**
 * Opens (or re-opens) the renewal schedule for an install. Trials store the
 * interval with a null renews_at — there is nothing to charge until the trial
 * converts. Degrades to `{ versioned: false }` on pre-migration DBs; real
 * errors throw `market_schedule_failed`.
 */
export async function setInstallBillingSchedule(
  db: Client,
  installId: string,
  opts: {
    merchantId: string;
    interval: InstallBillingInterval;
    trial: boolean;
    nowMs?: number;
  },
): Promise<{ versioned: boolean; renewsAt: string | null }> {
  if (!isInterval(opts.interval)) throw new Error("market_schedule_failed");
  const renewsAt = opts.trial
    ? null
    : computeRenewsAt(opts.interval, opts.nowMs ?? Date.now());
  try {
    const { error } = await db
      .from("marketplace_installs")
      .update({
        billing_interval: opts.interval,
        renews_at: renewsAt,
      } as never)
      .eq("merchant_id", opts.merchantId)
      .eq("id", installId);
    if (error) throw error;
  } catch (err) {
    if (!isMissingRecurringColumnError(err))
      throw new Error("market_schedule_failed");
    const { log } = await import("./observability.server");
    log("warn", "market.recurring_columns_missing", {
      merchantId: opts.merchantId,
      installId,
    });
    return { versioned: false, renewsAt: null };
  }
  return { versioned: true, renewsAt };
}

export type InstallRenewalVerdict =
  | {
      renewed: true;
      installId: string;
      renewsAt: string;
      versioned: boolean;
      replayed: boolean;
    }
  | {
      renewed: false;
      installId: string;
      reason:
        | "not_due"
        | "one_time"
        | "trial"
        | "free"
        | "status_not_renewable"
        | "listing_not_found"
        | "past_due"
        | "recurring_columns_missing";
    };

type RenewalRow = {
  id: string;
  merchant_id: string;
  kind: string;
  status: string;
  listing_slug: string;
  listing_name: string;
  price_minor_int: number | string;
  currency_code: string;
  billing_interval?: unknown;
  renews_at?: unknown;
  last_renewed_at?: unknown;
  started_at?: unknown;
};

/**
 * Renews one due install: charges the full period price through the ledger
 * (reusing the install sources — renewal rows are distinguished by the
 * `renew:` idempotency key and memo, so no ledger-source change is needed),
 * then extends renews_at anchored at now.
 *
 * Idempotency: the ledger key derives from the PRE-renewal period
 * (`renew:<install>:<periodStart>`), so a crash between charge and
 * date-extension replays the ledger row instead of double-charging.
 *
 * A failed charge parks the install on `past_due` (terminal `lapsed` follows
 * via lapseExpiredTrials once the window passes) and returns — never throws
 * for money failures, so the cron sweep can isolate per-row outcomes.
 */
export async function processInstallRenewal(
  db: Client,
  merchantId: string,
  installId: string,
  opts?: { nowMs?: number; actorId?: string | null },
): Promise<InstallRenewalVerdict> {
  const nowMs = opts?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  let row: RenewalRow | null;
  try {
    const { data, error } = await db
      .from("marketplace_installs")
      .select(
        "id, merchant_id, kind, status, listing_slug, listing_name, price_minor_int, currency_code, billing_interval, renews_at, last_renewed_at, started_at",
      )
      .eq("merchant_id", merchantId)
      .eq("id", installId)
      .maybeSingle();
    if (error) throw error;
    row = (data ?? null) as RenewalRow | null;
  } catch (err) {
    if (!isMissingRecurringColumnError(err)) throw err;
    return {
      renewed: false,
      installId,
      reason: "recurring_columns_missing",
    };
  }
  if (!row) throw new Error("market_install_not_found");
  if (row.status === "trial")
    return { renewed: false, installId, reason: "trial" };
  if (row.status !== "installed" && row.status !== "past_due")
    return { renewed: false, installId, reason: "status_not_renewable" };
  if (!isInterval(row.billing_interval) || row.billing_interval === "one_time")
    return { renewed: false, installId, reason: "one_time" };
  if (typeof row.renews_at !== "string" || row.renews_at > nowIso)
    return { renewed: false, installId, reason: "not_due" };

  const interval = row.billing_interval;
  const kind = row.kind === "theme" ? ("theme" as const) : ("widget" as const);
  // PRICING lane: the period price comes from the listing's term price for
  // the install's interval. Listings without term prices keep the install-row
  // price (their purchase-time behaviour). Converted trials carry price 0 on
  // the install row, so resolving here (before the free check) is what lets
  // them renew at the listing term price instead of extending free forever.
  const listing = await loadListingPricing(db, kind, row.listing_slug);
  const seller = listing as unknown as ListingPricingRow | null;
  if (!seller)
    return { renewed: false, installId, reason: "listing_not_found" };
  const price =
    getListingTermPrice(seller, interval) ??
    Number(row.price_minor_int ?? 0);
  // Free recurring installs extend without touching the ledger.
  if (!Number.isFinite(price) || price <= 0) {
    const renewsAt = computeRenewsAt(interval, nowMs) as string;
    const { error } = await db
      .from("marketplace_installs")
      .update({
        status: "installed",
        last_renewed_at: nowIso,
        renews_at: renewsAt,
      } as never)
      .eq("merchant_id", merchantId)
      .eq("id", installId);
    if (error) throw new Error("market_renewal_failed");
    return {
      renewed: true,
      installId,
      renewsAt,
      versioned: true,
      replayed: false,
    };
  }

  // The listing is re-read above (never trusted from the install row) — a
  // delisted plugin has nothing to renew against. The seller split for the
  // renewal mirrors the purchase split.
  const periodStart =
    typeof row.last_renewed_at === "string"
      ? row.last_renewed_at
      : typeof row.started_at === "string"
        ? row.started_at
        : nowIso;
  const { seller: sellerShare, platform } = split(price);
  const { postLedgerEntry } = await import("./ledger.server");
  let replayed = false;
  try {
    const posted = await postLedgerEntry(db, {
      merchantId,
      counterpartyMerchantId: seller.seller_merchant_id,
      source:
        kind === "theme" ? "market.theme.installed" : "market.widget.installed",
      referenceId: installId,
      direction: "debit",
      gross: money(price, row.currency_code),
      platformFee: money(platform, row.currency_code),
      idempotencyKey: `renew:${installId}:${periodStart}`,
      memo: `${row.listing_name} renewal`,
    });
    replayed = posted.replayed;
    void sellerShare;
  } catch {
    await db
      .from("marketplace_installs")
      .update({ status: "past_due" })
      .eq("merchant_id", merchantId)
      .eq("id", installId);
    const { auditAction } = await import("./hardening.server");
    await auditAction(
      db,
      merchantId,
      opts?.actorId ?? null,
      "market.renewal_past_due",
      row.kind,
      { slug: row.listing_slug, price_minor_int: price },
      installId,
    );
    return { renewed: false, installId, reason: "past_due" };
  }

  const renewsAt = computeRenewsAt(interval, nowMs) as string;
  const { error } = await db
    .from("marketplace_installs")
    .update({
      status: "installed",
      last_renewed_at: nowIso,
      renews_at: renewsAt,
    } as never)
    .eq("merchant_id", merchantId)
    .eq("id", installId);
  if (error) throw new Error("market_renewal_failed");
  const { auditAction: renewalAudit } = await import("./hardening.server");
  await renewalAudit(
    db,
    merchantId,
    opts?.actorId ?? null,
    "market.renewed",
    row.kind,
    {
      slug: row.listing_slug,
      charge_minor_int: price,
      renews_at: renewsAt,
      replayed,
    },
    installId,
  );
  return { renewed: true, installId, renewsAt, versioned: true, replayed };
}

/**
 * LANE G follow-up — trial-to-paid conversion (the charge-success path).
 *
 * Trials store the billing interval with null renews_at by design — there is
 * nothing to charge until the trial converts. Converting charges the
 * listing's current full-period price through the ledger (idempotency
 * `convert:<install>`, so charge-success retries replay instead of
 * double-charging), flips the row to live `installed`, then opens the
 * renewal schedule via setInstallBillingSchedule — the call that stamps
 * renews_at. Free listings convert with no ledger row.
 *
 * A declined charge parks the install on `past_due` (terminal `lapsed`
 * follows via lapseExpiredTrials once the window passes) and returns — never
 * throws for money failures, mirroring processInstallRenewal. An already
 * converted install replays as `already_paid` without charging.
 */
export type TrialConversionVerdict =
  | {
      converted: true;
      installId: string;
      renewsAt: string | null;
      versioned: boolean;
      replayed: boolean;
    }
  | {
      converted: false;
      installId: string;
      reason: "already_paid" | "past_due" | "listing_not_found";
    };

type ConversionRow = {
  id: string;
  merchant_id: string;
  kind: string;
  status: string;
  is_trial: boolean;
  listing_slug: string;
  listing_name: string;
  currency_code: string;
  billing_interval?: unknown;
  expires_at?: unknown;
};

export async function convertTrialToPaid(
  db: Client,
  merchantId: string,
  installId: string,
  opts?: { nowMs?: number; actorId?: string | null },
): Promise<TrialConversionVerdict> {
  const nowMs = opts?.nowMs ?? Date.now();
  // Expired trials park on terminal `lapsed` first — conversion below then
  // fails closed instead of reviving a dead trial.
  await lapseExpiredTrials(db, merchantId, nowMs);
  const { data } = await db
    .from("marketplace_installs")
    .select(
      "id, merchant_id, kind, status, is_trial, listing_slug, listing_name, currency_code, billing_interval, expires_at",
    )
    .eq("merchant_id", merchantId)
    .eq("id", installId)
    .maybeSingle();
  const row = (data ?? null) as ConversionRow | null;
  if (!row) throw new Error("market_install_not_found");
  if (row.status === "lapsed") throw new Error("market_trial_expired");
  if (row.status === "installed" && !row.is_trial)
    return { converted: false, installId, reason: "already_paid" };
  if (row.status !== "trial") throw new Error("market_install_not_found");

  // Trial rows carry price 0 (nothing charged at trial start), so the
  // conversion charge is re-derived from the listing — never trusted from
  // the install row. A delisted plugin has nothing to convert against.
  const kind = row.kind === "theme" ? ("theme" as const) : ("widget" as const);
  const listing = await loadListingPricing(db, kind, row.listing_slug);
  const seller = listing as unknown as ListingPricingRow | null;
  if (!seller)
    return { converted: false, installId, reason: "listing_not_found" };
  const interval = isInterval(row.billing_interval)
    ? row.billing_interval
    : "one_time";
  // PRICING lane: conversion charges the listing's term price for the
  // trial's interval; listings without term prices fall back to the base
  // price (the pre-lane behaviour).
  const price =
    getListingTermPrice(seller, interval) ??
    Number(seller.price_minor_int ?? 0);

  let replayed = false;
  if (Number.isFinite(price) && price > 0) {
    const { platform } = split(price);
    const { postLedgerEntry } = await import("./ledger.server");
    try {
      const posted = await postLedgerEntry(db, {
        merchantId,
        counterpartyMerchantId: seller.seller_merchant_id,
        source:
          kind === "theme" ? "market.theme.installed" : "market.widget.installed",
        referenceId: installId,
        direction: "debit",
        gross: money(price, row.currency_code),
        platformFee: money(platform, row.currency_code),
        idempotencyKey: `convert:${installId}`,
        memo: `${row.listing_name} trial conversion`,
      });
      replayed = posted.replayed;
    } catch {
      await db
        .from("marketplace_installs")
        .update({ status: "past_due" })
        .eq("merchant_id", merchantId)
        .eq("id", installId);
      const { auditAction } = await import("./hardening.server");
      await auditAction(
        db,
        merchantId,
        opts?.actorId ?? null,
        "market.renewal_past_due",
        row.kind,
        { slug: row.listing_slug, price_minor_int: price },
        installId,
      );
      return { converted: false, installId, reason: "past_due" };
    }
  }

  const { error } = await db
    .from("marketplace_installs")
    .update({
      status: "installed",
      is_trial: false,
      expires_at: null,
    } as never)
    .eq("merchant_id", merchantId)
    .eq("id", installId);
  if (error) throw new Error("market_conversion_failed");

  // The renews_at stamp lives here: trials carry null by design, so the
  // conversion opens the schedule. Best-effort like the purchase path — a
  // schedule can be backfilled, a completed charge cannot be un-moved.
  let renewsAt: string | null = null;
  let versioned = true;
  try {
    const schedule = await setInstallBillingSchedule(db, installId, {
      merchantId,
      interval,
      trial: false,
      nowMs,
    });
    renewsAt = schedule.renewsAt;
    versioned = schedule.versioned;
  } catch (err) {
    const { log } = await import("./observability.server");
    log("error", "market.schedule_write_failed", {
      merchantId,
      installId,
      message: err instanceof Error ? err.message.slice(0, 120) : "unknown",
    });
  }

  const { auditAction: conversionAudit } = await import("./hardening.server");
  await conversionAudit(
    db,
    merchantId,
    opts?.actorId ?? null,
    "market.converted",
    row.kind,
    {
      slug: row.listing_slug,
      charge_minor_int: price,
      renews_at: renewsAt,
      replayed,
    },
    installId,
  );
  return { converted: true, installId, renewsAt, versioned, replayed };
}

export type InstallProrationQuote = {
  remainingDays: number;
  periodDays: number;
  creditMinorInt: number;
  dueMinorInt: number;
};
/**
 * Day-based upgrade proration for recurring installs. Mirrors the
 * platform-plan upgrade policy documented at billing-desk.server.ts:179 —
 * credit for the unused remainder of the period (per-day value of the
 * current price) deducted from the new price, floored at zero — reusing the
 * shared day-math (`daysBetween` from billing.server, cycle-free: that
 * module has no marketplace imports) instead of duplicating it. Whole-day
 * granularity errs toward the merchant by at most one day.
 */
export function quoteInstallProration(opts: {
  currentPriceMinorInt: number;
  newPriceMinorInt: number;
  renewsAt: string | null;
  billingInterval: InstallBillingInterval;
  nowMs?: number;
}): InstallProrationQuote {
  const now = opts.nowMs ?? Date.now();
  const periodDays =
    opts.billingInterval === "annual"
      ? RENEWAL_PERIOD_DAYS.annual
      : RENEWAL_PERIOD_DAYS.monthly;
  const remainingDays = opts.renewsAt
    ? Math.max(0, -(daysBetween(opts.renewsAt, now) ?? 0))
    : 0;
  const creditMinorInt = Math.max(
    0,
    Math.floor((opts.currentPriceMinorInt * remainingDays) / periodDays),
  );
  return {
    remainingDays,
    periodDays,
    creditMinorInt,
    dueMinorInt: Math.max(0, opts.newPriceMinorInt - creditMinorInt),
  };
}

/**
 * Applies an upgrade to a recurring install: charges the prorated net
 * through the ledger (same idempotency-per-price-pair rule as renewals, so
 * retries replay) and moves the price. The renewal date is preserved — the
 * merchant keeps the period they are in, exactly like the platform-plan
 * upgrade keeps its period. Downgrades that net to zero move the price with
 * no ledger row.
 */
export async function applyInstallUpgrade(
  db: Client,
  merchantId: string,
  installId: string,
  opts: {
    newPriceMinorInt: number;
    newVersion?: string;
    actorId?: string | null;
    nowMs?: number;
  },
): Promise<{ ok: true } & InstallProrationQuote> {
  const nowMs = opts.nowMs ?? Date.now();
  let row: RenewalRow | null = null;
  try {
    const { data, error } = await db
      .from("marketplace_installs")
      .select(
        "id, merchant_id, kind, status, listing_slug, listing_name, price_minor_int, currency_code, billing_interval, renews_at",
      )
      .eq("merchant_id", merchantId)
      .eq("id", installId)
      .maybeSingle();
    if (error) throw error;
    row = (data ?? null) as RenewalRow | null;
  } catch (err) {
    if (!isMissingRecurringColumnError(err)) throw err;
    row = null;
  }
  if (!row) {
    const { data } = await db
      .from("marketplace_installs")
      .select(
        "id, merchant_id, kind, status, listing_slug, listing_name, price_minor_int, currency_code",
      )
      .eq("merchant_id", merchantId)
      .eq("id", installId)
      .maybeSingle();
    if (!data) throw new Error("market_install_not_found");
    row = data as RenewalRow;
  }
  if (row.status === "lapsed") throw new Error("market_trial_expired");
  if (row.status !== "installed" && row.status !== "trial")
    throw new Error("market_install_not_found");
  const currentPrice = Number(row.price_minor_int ?? 0);
  if (!Number.isInteger(opts.newPriceMinorInt) || opts.newPriceMinorInt < 0)
    throw new Error("market_upgrade_failed");
  const quote = quoteInstallProration({
    currentPriceMinorInt: currentPrice,
    newPriceMinorInt: opts.newPriceMinorInt,
    renewsAt: typeof row.renews_at === "string" ? row.renews_at : null,
    billingInterval: isInterval(row.billing_interval)
      ? row.billing_interval
      : "one_time",
    nowMs,
  });
  if (quote.dueMinorInt > 0) {
    const kind = row.kind === "theme" ? ("theme" as const) : ("widget" as const);
    const { data: listing } = await db
      .from(table(kind))
      .select("id, seller_merchant_id")
      .eq("slug", row.listing_slug)
      .maybeSingle();
    const seller = listing as unknown as {
      seller_merchant_id: string;
    } | null;
    const { seller: sellerShare, platform } = split(quote.dueMinorInt);
    const { postLedgerEntry } = await import("./ledger.server");
    try {
      await postLedgerEntry(db, {
        merchantId,
        counterpartyMerchantId: seller?.seller_merchant_id ?? null,
        source:
          kind === "theme"
            ? "market.theme.installed"
            : "market.widget.installed",
        referenceId: installId,
        direction: "debit",
        gross: money(quote.dueMinorInt, row.currency_code),
        platformFee: money(platform, row.currency_code),
        idempotencyKey: `upgrade:${installId}:${currentPrice}:${opts.newPriceMinorInt}`,
        memo: `${row.listing_name} upgrade`,
      });
      void sellerShare;
    } catch {
      throw new Error("market_payment_failed");
    }
  }
  const patch: Record<string, unknown> = {
    price_minor_int: opts.newPriceMinorInt,
  };
  if (opts.newVersion) patch["version"] = opts.newVersion;
  const { error } = await db
    .from("marketplace_installs")
    .update(patch as never)
    .eq("merchant_id", merchantId)
    .eq("id", installId);
  if (error) throw new Error("market_upgrade_failed");
  const { auditAction } = await import("./hardening.server");
  await auditAction(
    db,
    merchantId,
    opts.actorId ?? null,
    "market.upgraded",
    row.kind,
    {
      slug: row.listing_slug,
      before_minor_int: currentPrice,
      after_minor_int: opts.newPriceMinorInt,
      credit_minor_int: quote.creditMinorInt,
      due_minor_int: quote.dueMinorInt,
    },
    installId,
  );
  return { ok: true, ...quote };
}
