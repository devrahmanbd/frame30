/**
 * Level B reviewed-bundle ingestion — fingerprint-pinned merchant install.
 *
 * An APPROVED, fingerprint-pinned theme bundle version installs merchant
 * records WITHOUT re-validating from scratch as a trust decision, but
 * REFUSING anything whose bytes differ from the approved fingerprint: the
 * presented bytes are re-validated (`validateDevThemeBundle`) AND re-hashed
 * (`fingerprintDevThemeRelease`) at install time, and the install proceeds
 * only when the recomputed fingerprint EQUALS the published approval's
 * fingerprint. Unapproved / modified / revoked bytes never install, and every
 * refusal happens BEFORE any write (fail closed, zero rows).
 *
 * Approval model (no migration — justified): releases have no DB backing yet
 * (`dev-theme-review.ts` is pure; a Supabase backing is a follow-up), so the
 * published approval travels in-memory as a `DevThemeRelease` snapshot the
 * caller looked up via the review store (submit → review → publish). This
 * module re-enforces every store invariant on the snapshot — `published`
 * status plus an `approve` review binding the exact fingerprint — and accepts
 * an optional live `store` to re-verify a release id that may have been
 * revoked after the snapshot was taken. New `dev_theme.*` action codes fit
 * the existing free-form audit columns, so no schema change is required
 * (same argument `dev-theme-review.ts` makes for its audit rows).
 *
 * Persistence mapping (existing shapes only):
 * - ledger: `marketplace_installs`, same columns `installListing` writes for
 *   theme installs, plus the FOLLOW-UP artifact identity columns with
 *   `artifact_checksum` = the approved fingerprint (degrades to NULL on
 *   pre-migration DBs, same pattern as `patchInstallMarketplaceShape`).
 * - audit: `activity_log` via `auditAction`, action
 *   `market.dev_theme.installed` (distinct from `market.installed` so the
 *   fingerprint lane stays grep-able; same row shape).
 * - host projection: `store_themes` + `theme_versions` + `theme_drafts`
 *   triple mirroring `materializeListingTheme` (same columns, same
 *   `source_install_id` / `source_listing_slug` link, so
 *   `uninstallThemeInstall` → `deleteTheme` cascades uniformly).
 *   `theme_versions.checksum` carries the approved fingerprint;
 *   templates/tokens are inert `{}` (no AST claim — executable content is
 *   addressed by fingerprint; the install never activates, and
 *   activation/render is the runtime follow-up).
 * - money: paid listings charge through `postLedgerEntry` with source
 *   `market.theme.installed`, same split and idempotency posture as
 *   `installListing` (H3 order: projection BEFORE money moves; a money
 *   failure compensates projection + ledger, never an orphan charge).
 *
 * Lane entry lives in `marketplace-install.server.ts` (`installListing`
 * delegates theme listings carrying a `dev_theme` approval marker — see
 * `getReviewedThemeRef`). The marker is seller-controlled signposting only:
 * detection, never trust. Trust is bytes + approval, recomputed here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { money } from "./money";
import {
  fingerprintDevThemeRelease,
  validateDevThemeBundle,
  type DevThemeBundleInput,
} from "./dev-theme-bundle";
import type { DevThemeRelease, DevThemeReleaseStore } from "./dev-theme-review";

type Client = SupabaseClient<Database>;

export type ReviewedThemeBundleBytes = DevThemeBundleInput;

export type ReviewedThemeListing = {
  id: string;
  slug: string;
  name: string;
  version: string;
  price_minor_int?: unknown;
  currency_code?: string;
  seller_merchant_id?: string | null;
  install_count?: unknown;
};

export type InstallReviewedThemeBundleInput = {
  /** Published approval snapshot (caller looked it up via the review store). */
  release: DevThemeRelease;
  /** Presented bundle bytes — re-validated and re-hashed at install. */
  bytes: ReviewedThemeBundleBytes;
  idempotencyKey: string;
  listing: ReviewedThemeListing;
  trial?: boolean;
  consentedBy?: string | null;
  grantedScopes?: string[];
  /** Marketplace-level theme binding (from the listing marker). When set,
   * the approval's theme id must equal it. */
  expectedThemeId?: string;
  /** Live store for re-verifying a snapshot that may have been revoked. */
  store?: DevThemeReleaseStore;
};

export type ReviewedThemeInstallResult = {
  installId: string;
  replayed: boolean;
  impacted: string[];
  appVersion: string;
  themeApplied: null;
  themeNoticeKey: null;
  artifact: {
    checksum: string;
    version: string;
    fileName: string;
    pinned: string;
  } | null;
};

export class ReviewedThemeInstallError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ReviewedThemeInstallError";
  }
}

function fail(code: string, detail?: string): never {
  throw new ReviewedThemeInstallError(
    code,
    detail ? `${code}: ${detail}` : code,
  );
}

function isDuplicateKey(error: unknown): boolean {
  const msg = (error as { message?: string } | null)?.message ?? "";
  return msg.includes("duplicate key");
}

export type ReviewedThemeRef = {
  themeId: string;
  fingerprint: string;
};

/**
 * Detect a reviewed-theme listing: `manifest.dev_theme` carrying a theme id
 * plus a sha256-hex fingerprint. Malformed markers read as null — the lane
 * is never entered on seller-shaped metadata; callers fall back to the
 * historical ledger-only path. The marker fingerprint is advisory (which
 * approval the seller *claims*); the install trusts only the recomputed
 * fingerprint against the approval snapshot.
 */
export function getReviewedThemeRef(
  manifest: unknown,
): ReviewedThemeRef | null {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return null;
  }
  const ref = (manifest as Record<string, unknown>).dev_theme;
  if (!ref || typeof ref !== "object" || Array.isArray(ref)) return null;
  const record = ref as Record<string, unknown>;
  if (typeof record.theme_id !== "string" || !record.theme_id.trim()) {
    return null;
  }
  if (
    typeof record.fingerprint !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.fingerprint)
  ) {
    return null;
  }
  return { themeId: record.theme_id.trim(), fingerprint: record.fingerprint };
}

/**
 * Re-enforce the review-store publish invariants on an approval snapshot:
 * live `published` status (revoked/removed refuse on their own code) plus an
 * `approve` review binding the release's exact fingerprint — the same two
 * gates `publish()` enforces, re-checked here so a hand-built or stale
 * snapshot can never smuggle unreviewed bytes into an install.
 */
function assertPublishedApproval(release: DevThemeRelease): void {
  if (release.status === "revoked" || release.status === "removed") {
    fail(
      "dev_theme_install.revoked",
      `Release ${release.id} is ${release.status}: revoked bytes never install.`,
    );
  }
  if (release.status !== "published") {
    fail(
      "dev_theme_install.unapproved",
      `Release ${release.id} is ${release.status}: a published approval for these exact bytes is required.`,
    );
  }
  const approval = release.reviews.some(
    (r) => r.decision === "approve" && r.fingerprint === release.fingerprint,
  );
  if (!approval) {
    fail(
      "dev_theme_install.approval_missing",
      `Release ${release.id} carries no approval covering its own fingerprint.`,
    );
  }
}

type ReplayHit = {
  id: string;
  status: string;
  kind: string;
  theme_id: string | null;
  widget_id: string | null;
  listing_slug: string;
};

function boundReplay(
  hit: ReplayHit,
  idempotencyKey: string,
  listingId: string,
  listingSlug: string,
): { installId: string } {
  if (hit.status === "lapsed") throw new Error("market_trial_expired");
  const sameKind = hit.kind === "theme";
  const sameListing =
    hit.theme_id === listingId || hit.listing_slug === listingSlug;
  if (!sameKind || !sameListing) {
    throw new Error("market_idempotency_conflict");
  }
  void idempotencyKey;
  return { installId: hit.id };
}

async function snapshotPrevious(db: Client, merchantId: string) {
  const { data } = await db
    .from("marketplace_installs")
    .select("id, listing_slug, version, status")
    .eq("merchant_id", merchantId)
    .eq("kind", "theme")
    .in("status", ["installed", "trial"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? {};
}

/**
 * Best-effort artifact-identity patch with the same degrade posture as
 * `patchInstallMarketplaceShape`: pre-migration DBs keep the base
 * marketplace shape with NULL artifact identity instead of failing.
 */
async function patchReviewedArtifact(
  db: Client,
  merchantId: string,
  installId: string,
  artifact: Record<string, unknown>,
): Promise<void> {
  const { isMissingArtifactColumnError } =
    await import("./package-install.server");
  try {
    const { error } = await db
      .from("marketplace_installs")
      .update(artifact as never)
      .eq("merchant_id", merchantId)
      .eq("id", installId);
    if (error) throw error;
  } catch (err) {
    if (!isMissingArtifactColumnError(err)) throw err;
    const { log } = await import("./observability.server");
    log("warn", "market.install_artifact_columns_missing", {
      merchantId,
      installId,
    });
  }
}

async function compensateInstall(
  db: Client,
  merchantId: string,
  installId: string,
  themeId: string | null,
): Promise<void> {
  if (themeId) {
    await db
      .from("theme_versions")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("theme_id", themeId);
    await db
      .from("theme_drafts")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("theme_id", themeId);
    await db
      .from("store_themes")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("id", themeId);
  }
  await db
    .from("marketplace_installs")
    .delete()
    .eq("merchant_id", merchantId)
    .eq("id", installId);
}

export async function installReviewedThemeBundle(
  db: Client,
  merchantId: string,
  input: InstallReviewedThemeBundleInput,
): Promise<ReviewedThemeInstallResult> {
  // H5 parity: park past-due trials before any install state is read
  // (deferred import — this module is imported BY marketplace-install).
  const { lapseExpiredTrials } = await import("./marketplace-install.server");
  await lapseExpiredTrials(db, merchantId);

  const { data: existingKey } = await db
    .from("marketplace_installs")
    .select("id, status, kind, theme_id, widget_id, listing_slug")
    .eq("merchant_id", merchantId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existingKey) {
    const hit = existingKey as unknown as ReplayHit;
    if (hit.kind !== "theme") throw new Error("market_idempotency_conflict");
    const { installId } = boundReplay(
      hit,
      input.idempotencyKey,
      input.listing.id,
      input.listing.slug,
    );
    return {
      installId,
      replayed: true,
      impacted: [],
      appVersion: (await import("./marketplace.server")).APP_VERSION,
      themeApplied: null,
      themeNoticeKey: null,
      artifact: null,
    };
  }

  // Live re-verification: a snapshot taken before a revoke must not install.
  let release = input.release;
  if (input.store) {
    const live = input.store.get(release.id);
    if (!live) {
      fail(
        "dev_theme_install.approval_missing",
        `Release ${release.id} is unknown to the review store.`,
      );
    }
    release = live as DevThemeRelease;
  }
  assertPublishedApproval(release);
  if (
    input.expectedThemeId !== undefined &&
    release.themeId !== input.expectedThemeId
  ) {
    fail(
      "dev_theme_install.theme_mismatch",
      `Approval covers theme ${release.themeId}, not ${input.expectedThemeId}.`,
    );
  }

  // Gate 1 — re-validate the presented bytes (never trust the claim).
  const verdict = validateDevThemeBundle(input.bytes);
  if (!verdict.ok) {
    fail(
      "dev_theme_install.invalid_bundle",
      verdict.errors.slice(0, 5).join(","),
    );
  }

  // Gate 2 — re-hash at install; ANY byte difference mints a different
  // fingerprint, and anything but equality with the published approval fails
  // closed. No writes have happened yet, and none will on this path.
  const computed = fingerprintDevThemeRelease(verdict.manifest, verdict.files);
  if (computed !== release.fingerprint) {
    fail(
      "dev_theme_install.fingerprint_mismatch",
      "Presented bytes do not match the approved fingerprint.",
    );
  }

  const { APP_VERSION, TRIAL_DAYS, SELLER_SHARE_BASIS_POINTS } =
    await import("./marketplace.server");
  const trial = input.trial === true;
  const charge = trial ? 0 : Number(input.listing.price_minor_int ?? 0);
  const currency =
    input.listing.currency_code === "USD" ? "USD" : ("BDT" as const);
  const previous = await snapshotPrevious(db, merchantId);
  const granted = Array.from(new Set(input.grantedScopes ?? [])).sort();

  const { data: install, error } = await db
    .from("marketplace_installs")
    .insert({
      merchant_id: merchantId,
      kind: "theme",
      theme_id: input.listing.id,
      widget_id: null,
      listing_slug: input.listing.slug,
      listing_name: input.listing.name,
      version: release.version,
      price_minor_int: charge,
      currency_code: currency,
      is_trial: trial,
      status: trial ? "trial" : "installed",
      idempotency_key: input.idempotencyKey,
      previous_snapshot: previous as never,
      expires_at: trial
        ? new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString()
        : null,
      granted_scopes: granted as never,
      consented_by: (input.consentedBy ?? null) as never,
    })
    .select("id")
    .single();
  if (error || !install) {
    if (isDuplicateKey(error)) {
      const { data: raced } = await db
        .from("marketplace_installs")
        .select("id, status, kind, theme_id, widget_id, listing_slug")
        .eq("merchant_id", merchantId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (raced) {
        const { installId } = boundReplay(
          raced as unknown as ReplayHit,
          input.idempotencyKey,
          input.listing.id,
          input.listing.slug,
        );
        return {
          installId,
          replayed: true,
          impacted: [],
          appVersion: APP_VERSION,
          themeApplied: null,
          themeNoticeKey: null,
          artifact: null,
        };
      }
    }
    throw new Error("market_install_failed");
  }
  const installId = (install as { id: string }).id;

  // Artifact identity: the approved fingerprint, so a later uninstall/GC can
  // attribute these exact bytes. Degrades to NULL pre-migration.
  const artifact = {
    checksum: release.fingerprint,
    version: release.version,
    fileName: `${release.themeId}.dev-theme`,
    pinned: `dev-theme:${release.id}`,
  };
  try {
    await patchReviewedArtifact(db, merchantId, installId, {
      artifact_checksum: artifact.checksum,
      artifact_version: artifact.version,
      artifact_pinned: artifact.pinned,
    });
  } catch {
    await compensateInstall(db, merchantId, installId, null);
    throw new Error("market_install_failed");
  }

  const { auditAction } = await import("./hardening.server");
  await auditAction(
    db,
    merchantId,
    input.consentedBy ?? null,
    "market.dev_theme.installed",
    "theme",
    {
      before: previous,
      after: {
        listing: input.listing.slug,
        version: release.version,
        fingerprint: release.fingerprint,
        release_id: release.id,
        trial,
        charge_minor_int: charge,
        currency,
      },
    },
    installId,
  );

  // H3 order — host projection BEFORE any money moves, so a theme-row
  // failure compensates with just the install row, never an orphan charge.
  let hostThemeId: string | null = null;
  try {
    const { data: theme, error: themeError } = await db
      .from("store_themes")
      .insert({
        merchant_id: merchantId,
        name: input.listing.name,
        is_active: false,
        installed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (themeError || !theme) throw new Error("market_materialize_failed");
    hostThemeId = (theme as { id: string }).id;

    const { error: versionError } = await db.from("theme_versions").insert({
      merchant_id: merchantId,
      theme_id: hostThemeId,
      version: 1,
      status: "draft",
      label: input.listing.slug,
      checksum: release.fingerprint,
      templates: {} as never,
      tokens: {} as never,
      created_by: null,
    });
    if (versionError) throw new Error("market_materialize_failed");

    const { error: draftError } = await db.from("theme_drafts").insert({
      merchant_id: merchantId,
      theme_id: hostThemeId,
      revision: 1,
      templates: {} as never,
      tokens: {} as never,
    });
    if (draftError) throw new Error("market_materialize_failed");

    const { error: linkError } = await db
      .from("store_themes")
      .update({
        source_install_id: installId,
        source_listing_slug: input.listing.slug,
      })
      .eq("merchant_id", merchantId)
      .eq("id", hostThemeId);
    if (linkError) throw new Error("market_materialize_failed");
  } catch {
    await compensateInstall(db, merchantId, installId, hostThemeId);
    throw new Error("market_install_failed");
  }

  if (charge > 0) {
    const seller = Math.floor((charge * SELLER_SHARE_BASIS_POINTS) / 10_000);
    const platform = charge - seller;
    const { postLedgerEntry } = await import("./ledger.server");
    try {
      await postLedgerEntry(db, {
        merchantId,
        counterpartyMerchantId: input.listing.seller_merchant_id ?? null,
        source: "market.theme.installed",
        referenceId: installId,
        direction: "debit",
        gross: money(charge, currency),
        platformFee: money(platform, currency),
        idempotencyKey: input.idempotencyKey,
        memo: `${input.listing.name} v${release.version}`,
      });
    } catch {
      await compensateInstall(db, merchantId, installId, hostThemeId);
      throw new Error("market_payment_failed");
    }
  }

  await db
    .from("marketplace_themes")
    .update({
      install_count: Number(input.listing.install_count ?? 0) + 1,
    })
    .eq("id", input.listing.id);

  return {
    installId,
    replayed: false,
    impacted: [],
    appVersion: APP_VERSION,
    themeApplied: null,
    themeNoticeKey: null,
    artifact,
  };
}
