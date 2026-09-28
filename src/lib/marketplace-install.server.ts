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
  if (!ids.length) return { lapsed: [] as string[] };
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
  return { lapsed: ids };
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
): { installId: string; replayed: true; impacted: string[] } {
  if (hit.status === "lapsed") throw new Error("market_trial_expired");
  const sameKind = hit.kind === input.kind;
  const sameListing =
    input.kind === "theme"
      ? hit.theme_id === input.listingId || hit.listing_slug === listingSlug
      : hit.widget_id === input.listingId || hit.listing_slug === listingSlug;
  if (!sameKind || !sameListing) throw new Error("market_idempotency_conflict");
  return { installId: hit.id, replayed: true, impacted: [] };
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
        return boundReplay(raced as unknown as ReplayHit, input, listing.slug);
    }
    throw new Error("market_install_failed");
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
    install.id,
  );

  // H3: materialize BEFORE any money moves, so a theme-row failure
  // compensates with just the install row — never an orphan charge.
  // materializeListingTheme returns null for legit ledger-only manifests
  // (no usable AST) and THROWS on DB/parse failure.
  if (input.kind === "theme") {
    try {
      await materializeListingTheme(db, merchantId, install.id, listing);
    } catch {
      await db
        .from("marketplace_installs")
        .delete()
        .eq("merchant_id", merchantId)
        .eq("id", install.id);
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
        referenceId: install.id,
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
        .eq("id", install.id);
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
    trialAllowed: boolean;
    manifest: Record<string, unknown>;
  },
  actorId?: string | null,
) {
  const { auditAction } = await import("./hardening.server");
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
    const { data: before } = await db
      .from(table(input.kind))
      .select("name, slug, version, price_minor_int, status")
      .eq("id", input.id)
      .eq("seller_merchant_id", merchantId)
      .maybeSingle();
    if (!before) throw new Error("market_listing_not_found");
    const { error } = await db
      .from(table(input.kind))
      .update(payload)
      .eq("id", input.id)
      .eq("seller_merchant_id", merchantId);
    if (error) throw new Error("market_listing_save_failed");
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
        },
      },
      input.id,
    );
    return { ok: true, id: input.id };
  }
  const { data, error } = await db
    .from(table(input.kind))
    .insert({ ...payload, status: "draft" })
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
 * - The ledger write is checked BEFORE the plugin row: a ledger failure
 *   throws `market_install_failed` (duplicate-key races reselect + replay),
 *   so upsertPlugin can never run without its ledger row.
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
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) {
    const hit = existing as unknown as { id: string };
    return {
      installId: hit.id,
      replayed: true,
      impacted: [] as string[],
      appVersion: APP_VERSION,
      themeApplied: null,
      themeNoticeKey: null,
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
        .select("id")
        .eq("merchant_id", merchantId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (raced) {
        const hit = raced as unknown as { id: string };
        return {
          installId: hit.id,
          replayed: true,
          impacted: [] as string[],
          appVersion: APP_VERSION,
          themeApplied: null,
          themeNoticeKey: null,
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

  return {
    installId,
    replayed: false,
    impacted: [] as string[],
    appVersion: APP_VERSION,
    themeApplied: null,
    themeNoticeKey: null,
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
